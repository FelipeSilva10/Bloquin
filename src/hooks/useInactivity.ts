// src/hooks/useInactivity.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { clearSession, heartbeat } from "../services/sessionService";

const INACTIVITY_MS  = 10 * 60 * 1000; // 10 min → logout automático
const WARNING_MS     =  8 * 60 * 1000; //  8 min → exibe aviso
const COUNTDOWN_SECS = 120;            //  2 min de contagem regressiva
const HEARTBEAT_MS   =  2 * 60 * 1000; //  2 min → atualiza DB

const ACTIVITY_EVENTS: string[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
];

interface UseInactivityOptions {
  userId: string | null;
  onLogout: () => void;
}

export function useInactivity({ userId, onLogout }: UseInactivityOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown]    = useState(COUNTDOWN_SECS);

  const inactivityTimer  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const warningTimer     = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countdownTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  // Evita capturar onLogout stale dentro dos timers
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  const clearTimers = useCallback(() => {
    if (inactivityTimer.current)  clearTimeout(inactivityTimer.current);
    if (warningTimer.current)     clearTimeout(warningTimer.current);
    if (countdownTimer.current)   clearInterval(countdownTimer.current);
    inactivityTimer.current  = null;
    warningTimer.current     = null;
    countdownTimer.current   = null;
  }, []);

  const forceLogout = useCallback(async () => {
    clearTimers();
    setShowWarning(false);
    const uid = userIdRef.current;
    if (uid) {
      await clearSession(uid);
      await supabase.auth.signOut();
    }
    onLogoutRef.current();
  }, [clearTimers]);

  const resetTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    setCountdown(COUNTDOWN_SECS);

    // 1. Agenda o aviso visual aos 8 minutos
    warningTimer.current = setTimeout(() => {
      setShowWarning(true);
      setCountdown(COUNTDOWN_SECS);

      countdownTimer.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(countdownTimer.current!);
            countdownTimer.current = null;
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }, WARNING_MS);

    // 2. Logout automático aos 10 minutos
    inactivityTimer.current = setTimeout(() => {
      forceLogout();
    }, INACTIVITY_MS);
  }, [clearTimers, forceLogout]);

  useEffect(() => {
    if (!userId) return;

    resetTimer();

    // Qualquer atividade do usuário reseta o timer (só se o aviso não estiver visível)
    const handleActivity = () => {
      setShowWarning((visible) => {
        if (!visible) resetTimer();
        return visible;
      });
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );

    // Heartbeat mantém a sessão viva no banco a cada 2 minutos
    heartbeatTimer.current = setInterval(() => {
      if (userIdRef.current) heartbeat(userIdRef.current);
    }, HEARTBEAT_MS);

    return () => {
      clearTimers();
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity)
      );
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { showWarning, countdown, resetTimer, forceLogout };
}
