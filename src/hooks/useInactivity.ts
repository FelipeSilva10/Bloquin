// src/hooks/useInactivity.ts
import { useEffect, useRef, useState, useCallback } from "react";
import {
  heartbeat,
  isSessionValid,
  type SessionProbeStatus,
} from "../services/sessionService";

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
  const verifyBeforeLogoutRef = useRef<() => Promise<void>>(async () => undefined);
  const logoutRequestedRef = useRef(false);
  const timerGenerationRef = useRef(0);
  // Evita capturar onLogout stale dentro dos timers
  const onLogoutRef = useRef(onLogout);
  useEffect(() => { onLogoutRef.current = onLogout; }, [onLogout]);
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  const isOnlineRef = useRef(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const backendReachableRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (inactivityTimer.current)  clearTimeout(inactivityTimer.current);
    if (warningTimer.current)     clearTimeout(warningTimer.current);
    if (countdownTimer.current)   clearInterval(countdownTimer.current);
    inactivityTimer.current  = null;
    warningTimer.current     = null;
    countdownTimer.current   = null;
  }, []);

  const forceLogout = useCallback(() => {
    if (logoutRequestedRef.current) return;
    logoutRequestedRef.current = true;
    clearTimers();
    setShowWarning(false);
    onLogoutRef.current();
  }, [clearTimers]);

  const resetTimer = useCallback(() => {
    timerGenerationRef.current += 1;
    clearTimers();
    setShowWarning(false);
    setCountdown(COUNTDOWN_SECS);

    // O navegador estar "online" não garante que o Supabase esteja acessível.
    // O limite só fica ativo depois de uma resposta real e bem-sucedida.
    if (
      !userIdRef.current
      || !isOnlineRef.current
      || !backendReachableRef.current
    ) return;

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

    // 2. Aos 10 minutos, confirma novamente o backend antes de sair. Se a
    // conexão caiu nesse intervalo, o trabalho local continua preservado.
    inactivityTimer.current = setTimeout(() => {
      void verifyBeforeLogoutRef.current();
    }, INACTIVITY_MS);
  }, [clearTimers]);

  useEffect(() => {
    if (!userId) {
      backendReachableRef.current = false;
      logoutRequestedRef.current = false;
      clearTimers();
      setShowWarning(false);
      setCountdown(COUNTDOWN_SECS);
      return;
    }

    let disposed = false;
    let heartbeatInFlight = false;
    logoutRequestedRef.current = false;
    isOnlineRef.current = navigator.onLine;
    backendReachableRef.current = false;
    clearTimers();
    setShowWarning(false);
    setCountdown(COUNTDOWN_SECS);

    const pauseInactivity = () => {
      backendReachableRef.current = false;
      clearTimers();
      setShowWarning(false);
      setCountdown(COUNTDOWN_SECS);
    };

    const handleProbeResult = (status: SessionProbeStatus) => {
      if (disposed || logoutRequestedRef.current) return;

      if (status === "invalid") {
        forceLogout();
        return;
      }

      if (status === "unreachable" || !isOnlineRef.current) {
        pauseInactivity();
        return;
      }

      const wasReachable = backendReachableRef.current;
      backendReachableRef.current = true;
      // Heartbeats regulares não contam como atividade. O timer só recomeça
      // quando o backend acaba de ficar acessível novamente.
      if (!wasReachable) resetTimer();
    };

    const probeWithHeartbeat = async () => {
      if (
        disposed
        || heartbeatInFlight
        || !isOnlineRef.current
        || !userIdRef.current
      ) return;

      heartbeatInFlight = true;
      try {
        const status = await heartbeat(userIdRef.current);
        handleProbeResult(status);
      } finally {
        heartbeatInFlight = false;
      }
    };

    verifyBeforeLogoutRef.current = async () => {
      const currentUserId = userIdRef.current;
      const generation = timerGenerationRef.current;
      if (
        disposed
        || logoutRequestedRef.current
        || !currentUserId
      ) return;

      clearTimers();
      if (!isOnlineRef.current) {
        pauseInactivity();
        return;
      }

      const status = await isSessionValid(currentUserId);
      if (disposed || logoutRequestedRef.current) return;

      if (status === "invalid") {
        forceLogout();
        return;
      }
      if (status === "unreachable" || !isOnlineRef.current) {
        pauseInactivity();
        return;
      }

      backendReachableRef.current = true;
      // O usuário pode ter clicado em "Continuar" enquanto a validação estava
      // em andamento. Nesse caso, respeita a atividade e mantém a sessão.
      if (generation !== timerGenerationRef.current) return;
      forceLogout();
    };

    // Qualquer atividade do usuário reseta o timer (só se o aviso não estiver visível)
    const handleActivity = () => {
      setShowWarning((visible) => {
        if (!visible) resetTimer();
        return visible;
      });
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
      pauseInactivity();
    };

    const handleOnline = () => {
      isOnlineRef.current = true;
      backendReachableRef.current = false;
      pauseInactivity();
      void probeWithHeartbeat();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Heartbeat mantém a sessão viva no banco a cada 2 minutos
    heartbeatTimer.current = setInterval(() => {
      void probeWithHeartbeat();
    }, HEARTBEAT_MS);
    void probeWithHeartbeat();

    return () => {
      disposed = true;
      verifyBeforeLogoutRef.current = async () => undefined;
      clearTimers();
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, handleActivity)
      );
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { showWarning, countdown, resetTimer, forceLogout };
}
