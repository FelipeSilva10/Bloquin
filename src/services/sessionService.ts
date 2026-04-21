// src/services/sessionService.ts
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from "uuid"; // Certifique-se de ter rodado: npm i uuid @types/uuid

const SESSION_TOKEN_KEY = "bloquin_session_token";
const INTERVENTION_CHANNEL = "intervention";

// ─── Token de sessão local ───────────────────────────────────────────────────

function getLocalToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

function setLocalToken(token: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

function clearLocalToken() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

// ─── Registro de sessão no banco ─────────────────────────────────────────────

export async function registerSession(userId: string): Promise<void> {
  const token = uuidv4();
  setLocalToken(token);

  await supabase.from("user_sessions").upsert(
    { user_id: userId, session_token: token, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

export async function isSessionValid(userId: string): Promise<boolean> {
  const localToken = getLocalToken();
  if (!localToken) return false;

  const { data } = await supabase
    .from("user_sessions")
    .select("session_token")
    .eq("user_id", userId)
    .single();

  return data?.session_token === localToken;
}

export async function clearSession(userId: string): Promise<void> {
  clearLocalToken();
  await supabase.from("user_sessions").delete().eq("user_id", userId);
}

// ─── Listener de invalidação ─────────────────────────────────────────────────

type SessionKilledCallback = () => void;
let sessionChannel: ReturnType<typeof supabase.channel> | null = null;

export function watchSession(userId: string, onKilled: SessionKilledCallback) {
  stopWatchingSession();

  sessionChannel = supabase
    .channel(`session:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "user_sessions",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const remoteToken = (payload.new as { session_token: string }).session_token;
        if (remoteToken !== getLocalToken()) {
          onKilled();
        }
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

// ─── Intervenção do professor ────────────────────────────────────────────────

type InterventionPayload = { teacher_name: string } | null;
type InterventionCallback = (payload: InterventionPayload) => void;

let interventionChannel: ReturnType<typeof supabase.channel> | null = null;

export function watchIntervention(userId: string, onIntervention: InterventionCallback) {
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
  await supabase.channel(`${INTERVENTION_CHANNEL}:${studentUserId}`).send({
    type: "broadcast",
    event: "lock",
    payload: { teacher_name: teacherName },
  });
}

export async function unlockStudentScreen(studentUserId: string): Promise<void> {
  await supabase.channel(`${INTERVENTION_CHANNEL}:${studentUserId}`).send({
    type: "broadcast",
    event: "unlock",
    payload: {},
  });
}