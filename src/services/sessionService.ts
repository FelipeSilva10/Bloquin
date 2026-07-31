// src/services/sessionService.ts
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from "uuid";
import {
  getSessionCutoffIso,
  isSessionHeartbeatFresh,
} from "./sessionPolicy";

const SESSION_TOKEN_KEY    = "bloquin_session_token";
const INTERVENTION_CHANNEL = "intervention";
const SUPABASE_AUTH_STORAGE_KEY = (() => {
  try {
    const hostname = new URL(import.meta.env.VITE_SUPABASE_URL).hostname;
    return `sb-${hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
})();

export type SessionProbeStatus = "valid" | "invalid" | "unreachable";

// ─── Token local ──────────────────────────────────────────────────────────────

export function getCurrentSessionToken(): string | null {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setLocalToken(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

function clearLocalToken() {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // O logout não pode depender da disponibilidade do Web Storage.
  }
}

function clearStoredSupabaseAuth() {
  if (!SUPABASE_AUTH_STORAGE_KEY) return;
  try {
    localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    localStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`);
    localStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-user`);
  } catch {
    // O auth-js ainda tentará remover seu estado pelo adaptador configurado.
  }
}

/**
 * Descarta imediatamente toda autenticação deste dispositivo.
 *
 * A remoção direta do storage acontece mesmo sem rede. A chamada ao Auth é
 * mantida para atualizar o estado interno do cliente e seus subscribers.
 */
export async function signOutLocalSafely(): Promise<void> {
  clearLocalToken();
  clearStoredSupabaseAuth();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // A autenticação persistida já foi removida acima. Uma indisponibilidade
    // do Auth não pode impedir a entrada no modo local nem o logout da UI.
  } finally {
    // Garante a limpeza mesmo se uma implementação futura do Auth tentar usar
    // a rede ou falhar antes de remover os dados persistidos.
    clearStoredSupabaseAuth();
  }
}

// ─── Registro de sessão ───────────────────────────────────────────────────────

export async function registerSession(userId: string): Promise<void> {
  const token = uuidv4();
  setLocalToken(token);
  const { error } = await supabase.from("user_sessions").upsert(
    { user_id: userId, session_token: token, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) {
    clearLocalToken();
    throw error;
  }
}

// ─── Verificação de sessão ativa ──────────────────────────────────────────────

/**
 * Retorna true se já existe uma sessão ativa para este userId,
 * ou seja, o campo updated_at foi atualizado nos últimos SESSION_TTL_MS.
 * Usado na tela de login para impedir duplo acesso.
 */
export async function isSessionActive(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_sessions")
    .select("updated_at")
    .eq("user_id", userId)
    .single();

  if (!data) return false;
  return isSessionHeartbeatFresh(data.updated_at);
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

/**
 * Atualiza o timestamp da sessão no banco a cada 2 minutos.
 * Mantém a sessão "viva" enquanto o usuário está ativo.
 * Se o usuário sair sem logout explícito, a sessão expira após SESSION_TTL_MS.
 */
export async function heartbeat(userId: string): Promise<SessionProbeStatus> {
  const localToken = getCurrentSessionToken();
  if (!localToken) return "invalid";

  try {
    const { data, error } = await supabase
      .from("user_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("session_token", localToken)
      // Uma sessão já expirada não pode ser "ressuscitada" por um heartbeat
      // atrasado após suspensão do sistema ou reconexão.
      .gte("updated_at", getSessionCutoffIso())
      .select("session_token, updated_at")
      .maybeSingle();

    // Erros de rede, indisponibilidade e falhas do backend nunca devem ser
    // interpretados como uma sessão substituída.
    if (error) return "unreachable";
    return data?.session_token === localToken
      && isSessionHeartbeatFresh(data.updated_at)
      ? "valid"
      : "invalid";
  } catch {
    return "unreachable";
  }
}

// ─── Validação e limpeza ──────────────────────────────────────────────────────

export async function isSessionValid(userId: string): Promise<SessionProbeStatus> {
  const localToken = getCurrentSessionToken();
  if (!localToken) return "invalid";

  try {
    const { data, error } = await supabase
      .from("user_sessions")
      .select("session_token, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return "unreachable";
    return data?.session_token === localToken
      && isSessionHeartbeatFresh(data.updated_at)
      ? "valid"
      : "invalid";
  } catch {
    return "unreachable";
  }
}

export async function clearSession(userId: string): Promise<void> {
  const localToken = getCurrentSessionToken();
  clearLocalToken();
  if (!localToken) return;

  // Filtra também pelo token para uma sessão antiga nunca apagar o registro
  // de outra sessão que acabou de substituí-la.
  const { error } = await supabase
    .from("user_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("session_token", localToken);
  if (error) throw error;
}

// ─── Watcher de sessão roubada ────────────────────────────────────────────────

type SessionKilledCallback = () => void;
let sessionChannel: ReturnType<typeof supabase.channel> | null = null;

export function watchSession(userId: string, onKilled: SessionKilledCallback) {
  stopWatchingSession();
  sessionChannel = supabase
    .channel(`session:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_sessions",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          onKilled();
          return;
        }

        const remoteToken = (
          payload.new as { session_token?: string } | null
        )?.session_token;
        if (!remoteToken || remoteToken !== getCurrentSessionToken()) onKilled();
      }
    )
    .subscribe();
}

export function stopWatchingSession() {
  if (sessionChannel) {
    supabase.removeChannel(sessionChannel);
    sessionChannel = null;
  }
}

// ─── Intervenção do professor ─────────────────────────────────────────────────

type InterventionPayload = { teacher_name: string } | null;
type InterventionCallback = (payload: InterventionPayload) => void;
let interventionChannel: ReturnType<typeof supabase.channel> | null = null;

export function watchIntervention(userId: string, onIntervention: InterventionCallback) {
  stopWatchingIntervention();
  interventionChannel = supabase
    .channel(`${INTERVENTION_CHANNEL}:${userId}`)
    .on("broadcast", { event: "lock" }, (msg) => {
      onIntervention({ teacher_name: msg.payload?.teacher_name ?? "" });
    })
    .on("broadcast", { event: "unlock" }, () => {
      onIntervention(null);
    })
    .subscribe();
}

export function stopWatchingIntervention() {
  if (interventionChannel) {
    supabase.removeChannel(interventionChannel);
    interventionChannel = null;
  }
}

export async function lockStudentScreen(studentUserId: string, teacherName: string): Promise<void> {
  await sendIntervention(studentUserId, "lock", { teacher_name: teacherName });
}

export async function unlockStudentScreen(studentUserId: string): Promise<void> {
  await sendIntervention(studentUserId, "unlock", {});
}

async function sendIntervention(
  studentUserId: string,
  event: "lock" | "unlock",
  payload: Record<string, string>,
): Promise<void> {
  const channel = supabase.channel(`${INTERVENTION_CHANNEL}:${studentUserId}`);
  try {
    await channel.send({
    type: "broadcast",
      event,
      payload,
    });
  } finally {
    // Canais efêmeros de intervenção não podem ficar registrados no cliente
    // do professor a cada clique de bloquear/desbloquear.
    await supabase.removeChannel(channel);
  }
}
