import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import { sha256Hex } from "../supabase/functions/_shared/adminHandoffCore.ts";

function localSupabaseStatus() {
  const output = execFileSync(
    "npx",
    ["supabase", "status", "-o", "json"],
    { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(output);
}

async function callFunction(status, name, accessToken, body) {
  return fetch(`${status.FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      apikey: status.ANON_KEY,
      "Content-Type": "application/json",
      Origin: "http://localhost:1420",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("Edge Function emite, consome uma vez e revoga o handoff local", async () => {
  const status = localSupabaseStatus();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const browser = createClient(status.API_URL, status.ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = crypto.randomUUID();
  const teacherEmail = `lot2-teacher-${suffix}@example.test`;
  const studentEmail = `lot2-student-${suffix}@example.test`;
  const password = "Lot2-local-only-7!";
  const teacherSourceToken = `teacher-source-${suffix}`;
  const studentSourceToken = `student-source-${suffix}`;
  const createdUserIds = [];

  try {
    const teacherResult = await admin.auth.admin.createUser({
      email: teacherEmail,
      password,
      email_confirm: true,
    });
    assert.ifError(teacherResult.error);
    assert.ok(teacherResult.data.user);
    const teacherId = teacherResult.data.user.id;
    createdUserIds.push(teacherId);

    const studentResult = await admin.auth.admin.createUser({
      email: studentEmail,
      password,
      email_confirm: true,
    });
    assert.ifError(studentResult.error);
    assert.ok(studentResult.data.user);
    const studentId = studentResult.data.user.id;
    createdUserIds.push(studentId);

    const profileResult = await admin.from("perfis").insert([
      {
        id: teacherId,
        nome: "Professora Edge Local",
        role: "teacher",
        email: teacherEmail,
      },
      {
        id: studentId,
        nome: "Aluno Edge Local",
        role: "student",
        email: studentEmail,
      },
    ]);
    assert.ifError(profileResult.error);

    const sourceSessionResult = await admin.from("user_sessions").insert([
      {
        user_id: teacherId,
        session_token: teacherSourceToken,
        updated_at: new Date().toISOString(),
      },
      {
        user_id: studentId,
        session_token: studentSourceToken,
        updated_at: new Date().toISOString(),
      },
    ]);
    assert.ifError(sourceSessionResult.error);

    const teacherLogin = await browser.auth.signInWithPassword({
      email: teacherEmail,
      password,
    });
    assert.ifError(teacherLogin.error);
    assert.ok(teacherLogin.data.session);

    const issueResponse = await callFunction(
      status,
      "admin-handoff-request",
      teacherLogin.data.session.access_token,
      { sessionToken: teacherSourceToken },
    );
    assert.equal(issueResponse.status, 200);
    const handoff = await issueResponse.json();
    assert.equal(handoff.actorId, teacherId);
    assert.match(handoff.code, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(Date.parse(handoff.expiresAt) > Date.now());

    const panelToken = `panel-token-${suffix}`;
    const consumeResult = await admin.rpc("consume_admin_panel_handoff", {
      p_code_hash: await sha256Hex(handoff.code),
      p_panel_session_token_hash: await sha256Hex(panelToken),
      p_purpose: "admin_panel_login",
      p_audience: "sag",
    });
    assert.ifError(consumeResult.error);
    assert.equal(consumeResult.data?.length, 1);
    assert.equal(consumeResult.data?.[0]?.actor_id, teacherId);

    const replayResult = await admin.rpc("consume_admin_panel_handoff", {
      p_code_hash: await sha256Hex(handoff.code),
      p_panel_session_token_hash: await sha256Hex(`replay-${suffix}`),
      p_purpose: "admin_panel_login",
      p_audience: "sag",
    });
    assert.ifError(replayResult.error);
    assert.deepEqual(replayResult.data, []);

    const revokeResponse = await callFunction(
      status,
      "admin-session-revoke",
      teacherLogin.data.session.access_token,
      { sessionToken: teacherSourceToken },
    );
    assert.equal(revokeResponse.status, 200);

    const validationResult = await admin.rpc("validate_backoffice_session", {
      p_panel_session_token_hash: await sha256Hex(panelToken),
    });
    assert.ifError(validationResult.error);
    assert.deepEqual(validationResult.data, []);

    const authExpiryIssue = await callFunction(
      status,
      "admin-handoff-request",
      teacherLogin.data.session.access_token,
      { sessionToken: teacherSourceToken },
    );
    assert.equal(authExpiryIssue.status, 200);
    const authExpiryHandoff = await authExpiryIssue.json();
    const authExpiryPanelToken = `panel-auth-session-${suffix}`;
    const authExpiryConsume = await admin.rpc("consume_admin_panel_handoff", {
      p_code_hash: await sha256Hex(authExpiryHandoff.code),
      p_panel_session_token_hash: await sha256Hex(authExpiryPanelToken),
      p_purpose: "admin_panel_login",
      p_audience: "sag",
    });
    assert.ifError(authExpiryConsume.error);
    assert.equal(authExpiryConsume.data?.length, 1);

    const teacherSignOut = await browser.auth.signOut({ scope: "local" });
    assert.ifError(teacherSignOut.error);
    const afterAuthSignOut = await admin.rpc("validate_backoffice_session", {
      p_panel_session_token_hash: await sha256Hex(authExpiryPanelToken),
    });
    assert.ifError(afterAuthSignOut.error);
    assert.deepEqual(afterAuthSignOut.data, []);

    const studentLogin = await browser.auth.signInWithPassword({
      email: studentEmail,
      password,
    });
    assert.ifError(studentLogin.error);
    assert.ok(studentLogin.data.session);

    const deniedResponse = await callFunction(
      status,
      "admin-handoff-request",
      studentLogin.data.session.access_token,
      { sessionToken: studentSourceToken },
    );
    assert.equal(deniedResponse.status, 403);

    const anonymousResponse = await callFunction(
      status,
      "admin-handoff-request",
      null,
      { sessionToken: teacherSourceToken },
    );
    assert.equal(anonymousResponse.status, 401);
  } finally {
    if (createdUserIds.length > 0) {
      await admin
        .from("backoffice_sessions")
        .delete()
        .in("actor_id", createdUserIds);
    }
    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
