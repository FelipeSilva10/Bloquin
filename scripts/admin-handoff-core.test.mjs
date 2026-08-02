import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMIN_HANDOFF_AUDIENCE,
  ADMIN_HANDOFF_CODE_BYTES,
  ADMIN_HANDOFF_PURPOSE,
  generateOpaqueCode,
  getAuthSessionIdFromJwt,
  isSha256Hex,
  isSourceSessionToken,
  sha256Hex,
} from "../supabase/functions/_shared/adminHandoffCore.ts";
import {
  publishableApiKey,
  secretApiKey,
} from "../supabase/functions/_shared/supabaseApiKeys.ts";

test("gera código Base64URL de 256 bits sem padding", () => {
  const code = generateOpaqueCode((target) => {
    target.forEach((_, index) => {
      target[index] = index;
    });
    return target;
  });

  assert.equal(ADMIN_HANDOFF_CODE_BYTES, 32);
  assert.equal(code.length, 43);
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(code.includes("="), false);
});

test("calcula SHA-256 hexadecimal sem persistir o valor original", async () => {
  const digest = await sha256Hex("bloquin-admin-handoff");
  assert.equal(
    digest,
    "a73cc45f0183549762973c39a8e38a4df2e78d4a95308e89c0a4987667e538bc",
  );
  assert.equal(isSha256Hex(digest), true);
  assert.equal(isSha256Hex("bloquin-admin-handoff"), false);
});

test("limita sessão de origem e escopo ao contrato administrativo", () => {
  assert.equal(isSourceSessionToken("12345678-1234-4234-8234-123456789abc"), true);
  assert.equal(isSourceSessionToken("curto"), false);
  assert.equal(ADMIN_HANDOFF_PURPOSE, "admin_panel_login");
  assert.equal(ADMIN_HANDOFF_AUDIENCE, "sag");
});

test("extrai somente session_id UUID de um JWT já validado", () => {
  const payload = btoa(JSON.stringify({
    session_id: "12345678-1234-4234-8234-123456789abc",
  })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  const jwt = `header.${payload}.signature`;

  assert.equal(
    getAuthSessionIdFromJwt(jwt),
    "12345678-1234-4234-8234-123456789abc",
  );
  assert.equal(getAuthSessionIdFromJwt("invalid"), null);
});

test("Edge Functions aceitam somente os formatos atuais de API key", () => {
  const publishable = "sb_publishable_example";
  const secret = "sb_secret_example";

  assert.equal(
    publishableApiKey(JSON.stringify({ default: publishable })),
    publishable,
  );
  assert.equal(secretApiKey(JSON.stringify({ default: secret })), secret);
  assert.equal(publishableApiKey(JSON.stringify({ default: secret })), null);
  assert.equal(secretApiKey(JSON.stringify({ default: publishable })), null);
  assert.equal(publishableApiKey("invalid-json"), null);
  assert.equal(secretApiKey(undefined), null);
});

test("fronteira React/Tauri não recebe tokens do Supabase Auth", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/services/adminPanelService.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/screens/TeacherDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8"),
  ]);
  const adminFlowSource = sources.join("\n");

  assert.doesNotMatch(
    adminFlowSource,
    /access_token|refresh_token|__bloquin_auth/u,
  );
  assert.match(adminFlowSource, /handoffCode|handoff_code/u);
  assert.match(adminFlowSource, /\.destroy\(\)/u);
});

test("clientes usam somente variáveis das chaves atuais", async () => {
  const sources = await Promise.all([
    readFile(new URL("../src/lib/supabase.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../supabase/functions/_shared/adminHandoffHttp.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const currentSource = sources.join("\n");
  const legacyPublicName = ["VITE", "SUPABASE", "ANON", "KEY"].join("_");
  const legacyPrivilegedName = [
    "SUPABASE",
    "SERVICE",
    "ROLE",
    "KEY",
  ].join("_");

  assert.match(currentSource, /VITE_SUPABASE_PUBLISHABLE_KEY/u);
  assert.match(currentSource, /SUPABASE_PUBLISHABLE_KEYS/u);
  assert.match(currentSource, /SUPABASE_SECRET_KEYS/u);
  assert.equal(currentSource.includes(legacyPublicName), false);
  assert.equal(currentSource.includes(legacyPrivilegedName), false);
});
