// O timer de inatividade encerra a sessão após 10 minutos. A margem adicional
// absorve atraso de rede e evita que um heartbeat concorrente invalide uma
// sessão ainda ativa.
export const SESSION_TTL_MS = 12 * 60 * 1000;

export function getSessionCutoffIso(now = Date.now()): string {
  return new Date(now - SESSION_TTL_MS).toISOString();
}

export function isSessionHeartbeatFresh(
  updatedAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!updatedAt) return false;

  const updatedAtTimestamp = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtTimestamp)) return false;

  // Pequena tolerância para relógios locais alguns segundos adiantados. Um
  // timestamp remoto muito no futuro continua sendo rejeitado.
  const maximumClockSkewMs = 30 * 1000;
  return (
    updatedAtTimestamp <= now + maximumClockSkewMs &&
    now - updatedAtTimestamp < SESSION_TTL_MS
  );
}
