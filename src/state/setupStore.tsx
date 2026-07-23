import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauriRuntime } from '../services/localProjectService';

export type SetupStatus = 'checking' | 'installing' | 'ready' | 'deferred' | 'error';
export interface SetupState { status: SetupStatus; message: string; percent: number; }

const initialState: SetupState = { status: 'checking', message: 'Verificando ferramentas…', percent: 0 };
const SetupContext = createContext<SetupState & { retry: () => void } | null>(null);

export function SetupProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SetupState>(() => {
    try {
      const saved = localStorage.getItem('bloquin.setup');
      const parsed = saved ? { ...initialState, ...JSON.parse(saved) } : initialState;
      // A sessão nova ainda precisa confirmar a disponibilidade no backend.
      // Mantemos a mensagem anterior, mas nunca liberamos o upload antes do
      // evento `done` desta execução.
      return parsed.status === 'ready'
        ? { ...initialState, message: 'Verificando ferramentas instaladas…' }
        : parsed;
    } catch { return initialState; }
  });
  const startingRef = useRef(false);
  const disposedRef = useRef(false);

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    if (!isTauriRuntime()) {
      startingRef.current = false;
      setState({ status: 'ready', message: 'Modo de pré-visualização ativo.', percent: 100 });
      return;
    }
    setState({ status: 'installing', message: 'Preparando ferramentas de compilação…', percent: 0 });
    try {
      await invoke('run_setup');
    } catch (error) {
      startingRef.current = false;
      if (!disposedRef.current) setState({ status: 'error', message: String(error), percent: 0 });
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    disposedRef.current = false;
    let unlisten: (() => void) | undefined;

    const boot = async () => {
      try {
        if (!isTauriRuntime()) {
          await start();
          return;
        }
        const cleanup = await listen<{ step: string; message: string; percent: number }>('setup-progress', (event) => {
          const payload = event.payload;
          const status: SetupStatus = payload.step === 'done' ? 'ready' : payload.step === 'error' ? 'error' : 'installing';
          if (status === 'ready' || status === 'error') startingRef.current = false;
          setState({ status, message: payload.message, percent: payload.percent });
        });
        if (disposed) {
          cleanup();
          return;
        }
        unlisten = cleanup;
        if (!disposed) await start();
      } catch (error) {
        startingRef.current = false;
        if (!disposed) setState({ status: 'error', message: String(error), percent: 0 });
      }
    };

    void boot();
    return () => {
      disposed = true;
      disposedRef.current = true;
      unlisten?.();
    };
  }, [start]);

  useEffect(() => { localStorage.setItem('bloquin.setup', JSON.stringify(state)); }, [state]);
  const value = useMemo(() => ({ ...state, retry: start }), [state]);
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

export function useSetup() {
  const context = useContext(SetupContext);
  if (!context) throw new Error('useSetup precisa estar dentro de SetupProvider.');
  return context;
}
