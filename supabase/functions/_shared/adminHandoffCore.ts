export const ADMIN_HANDOFF_PURPOSE = "admin_panel_login";
export const ADMIN_HANDOFF_AUDIENCE = "sag";
export const ADMIN_HANDOFF_CODE_BYTES = 32;

const HEX_SHA256 = /^[0-9a-f]{64}$/;
const SESSION_TOKEN = /^[A-Za-z0-9_-]{16,256}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && HEX_SHA256.test(value);
}

export function isSourceSessionToken(value: unknown): value is string {
  return typeof value === "string" && SESSION_TOKEN.test(value);
}

export function generateOpaqueCode(
  randomValues: (target: Uint8Array) => Uint8Array = (target) =>
    crypto.getRandomValues(target),
): string {
  const bytes = randomValues(new Uint8Array(ADMIN_HANDOFF_CODE_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function getAuthSessionIdFromJwt(jwt: string): string | null {
  const payload = jwt.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const claims = JSON.parse(atob(base64)) as { session_id?: unknown };
    return typeof claims.session_id === "string" && UUID.test(claims.session_id)
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}
