const PUBLISHABLE_PREFIX = "sb_publishable_";
const SECRET_PREFIX = "sb_secret_";

function namedApiKey(
  serializedKeys: string | undefined,
  expectedPrefix: string,
  name = "default",
): string | null {
  if (!serializedKeys) return null;

  try {
    const keys = JSON.parse(serializedKeys) as Record<string, unknown>;
    const key = keys[name];
    return typeof key === "string" && key.startsWith(expectedPrefix)
      ? key
      : null;
  } catch {
    return null;
  }
}

export function publishableApiKey(
  serializedKeys: string | undefined,
): string | null {
  return namedApiKey(serializedKeys, PUBLISHABLE_PREFIX);
}

export function secretApiKey(
  serializedKeys: string | undefined,
): string | null {
  return namedApiKey(serializedKeys, SECRET_PREFIX);
}
