import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const SAG_BASE_URL = process.env.SAG_BASE_URL;

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
      apikey: status.PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: "http://localhost:1420",
    },
    body: JSON.stringify(body),
  });
}

function panelCookieFrom(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/(?:^|,\s*)__Host-sag_session=([^;]+)/u);
  assert.ok(match, "o SAG deve definir o cookie __Host-sag_session");
  assert.match(setCookie, /;\s*HttpOnly/iu);
  assert.match(setCookie, /;\s*Secure/iu);
  assert.match(setCookie, /;\s*SameSite=Strict/iu);
  assert.match(setCookie, /;\s*Path=\//iu);
  return `__Host-sag_session=${match[1]}`;
}

test(
  "Bloquin troca handoff no SAG e a sessão própria respeita replay e revogação",
  { skip: !SAG_BASE_URL && "defina SAG_BASE_URL para o servidor SAG local" },
  async () => {
    const status = localSupabaseStatus();
    const admin = createClient(status.API_URL, status.SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const browser = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const suffix = crypto.randomUUID();
    const email = `lot2-sag-${suffix}@example.test`;
    const password = "Lot2-local-only-8!";
    const sourceToken = `teacher-source-${suffix}`;
    let userId = null;

    try {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(created.error);
      assert.ok(created.data.user);
      userId = created.data.user.id;

      const profile = await admin.from("perfis").insert({
        id: userId,
        nome: "Professora SAG Local",
        role: "teacher",
        email,
      });
      assert.ifError(profile.error);

      const sourceSession = await admin.from("user_sessions").insert({
        user_id: userId,
        session_token: sourceToken,
        updated_at: new Date().toISOString(),
      });
      assert.ifError(sourceSession.error);

      const login = await browser.auth.signInWithPassword({ email, password });
      assert.ifError(login.error);
      assert.ok(login.data.session);

      const issued = await callFunction(
        status,
        "admin-handoff-request",
        login.data.session.access_token,
        { sessionToken: sourceToken },
      );
      assert.equal(issued.status, 200);
      const handoff = await issued.json();
      assert.match(handoff.code, /^[A-Za-z0-9_-]{43}$/u);

      const exchanged = await fetch(`${SAG_BASE_URL}/api/auth/handoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: SAG_BASE_URL,
        },
        body: JSON.stringify({ code: handoff.code }),
      });
      assert.equal(exchanged.status, 200);
      const cookie = panelCookieFrom(exchanged);
      const actor = await exchanged.json();
      assert.equal(actor.sessao?.id, userId);
      assert.equal(actor.sessao?.role, "TEACHER");

      const authenticated = await fetch(`${SAG_BASE_URL}/api/auth/session`, {
        headers: { Cookie: cookie },
        cache: "no-store",
      });
      assert.equal(authenticated.status, 200);
      const validated = await authenticated.json();
      assert.equal(validated.sessao?.id, userId);

      const replay = await fetch(`${SAG_BASE_URL}/api/auth/handoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: SAG_BASE_URL,
        },
        body: JSON.stringify({ code: handoff.code }),
      });
      assert.equal(replay.status, 401);

      const revoked = await callFunction(
        status,
        "admin-session-revoke",
        login.data.session.access_token,
        { sessionToken: sourceToken },
      );
      assert.equal(revoked.status, 200);

      const afterRevocation = await fetch(
        `${SAG_BASE_URL}/api/auth/session`,
        {
          headers: { Cookie: cookie },
          cache: "no-store",
          redirect: "manual",
        },
      );
      assert.equal(afterRevocation.status, 401);
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  },
);
