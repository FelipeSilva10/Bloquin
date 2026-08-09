import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { isTauriRuntime } from '../services/localProjectService';
import './SagScreen.css';

interface SagScreenProps {
  /** A aba permanece montada; o WebView nativo só fica visível quando ela está ativa. */
  active: boolean;
}

interface SagBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SagPageLoad {
  state: 'loading' | 'ready';
}

type SagState = 'loading' | 'ready' | 'error' | 'browser-preview';

const LOAD_TIMEOUT_MS = 20_000;

function boundsAreEqual(left: SagBounds | null, right: SagBounds) {
  if (!left) return false;
  return Math.abs(left.x - right.x) < 1
    && Math.abs(left.y - right.y) < 1
    && Math.abs(left.width - right.width) < 1
    && Math.abs(left.height - right.height) < 1;
}

export function SagScreen({ active }: SagScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latestBoundsRef = useRef<SagBounds | null>(null);
  const appliedBoundsRef = useRef<SagBounds | null>(null);
  const requestInFlightRef = useRef(false);
  const retryAfterRequestRef = useRef(false);
  const loadTimeoutRef = useRef<number | null>(null);
  const waitingForPageEventRef = useRef(false);
  const activeRef = useRef(active);
  const mountedRef = useRef(true);
  const hasNativeSagRef = useRef(false);
  const nativeSagVisibleRef = useRef(false);
  const errorLockedRef = useRef(false);
  const isDesktop = isTauriRuntime();
  const [eventsReady, setEventsReady] = useState(() => !isDesktop);
  const [state, setState] = useState<SagState>(() => isDesktop ? 'loading' : 'browser-preview');
  const [error, setError] = useState('');

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current !== null) window.clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = null;
  }, []);

  const startLoadTimeout = useCallback(() => {
    clearLoadTimeout();
    loadTimeoutRef.current = window.setTimeout(() => {
      void invoke('hide_sag').catch(() => undefined);
      nativeSagVisibleRef.current = false;
      errorLockedRef.current = true;
      setState('error');
      setError('O SAG demorou para responder. Confira a conexão e tente recarregar.');
    }, LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout]);

  const hideNativeSag = useCallback(() => {
    if (!isDesktop) return;
    clearLoadTimeout();
    waitingForPageEventRef.current = false;
    nativeSagVisibleRef.current = false;
    void invoke('hide_sag').catch(() => undefined);
  }, [clearLoadTimeout, isDesktop]);

  const syncNativeSag = useCallback(() => {
    if (!isDesktop || !active || !hostRef.current || errorLockedRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    const nextBounds: SagBounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    if (nextBounds.width < 1 || nextBounds.height < 1) return;

    latestBoundsRef.current = nextBounds;
    if (requestInFlightRef.current) {
      retryAfterRequestRef.current = true;
      return;
    }
    const needsPosition = !boundsAreEqual(appliedBoundsRef.current, nextBounds);
    const needsShow = !nativeSagVisibleRef.current;
    if (!needsPosition && !needsShow) return;

    const waitsForInitialPage = !hasNativeSagRef.current;
    if (waitsForInitialPage) waitingForPageEventRef.current = true;
    requestInFlightRef.current = true;
    void invoke('open_sag', { bounds: nextBounds })
      .then(() => {
        if (!mountedRef.current || !activeRef.current) {
          nativeSagVisibleRef.current = false;
          void invoke('hide_sag').catch(() => undefined);
          return;
        }
        appliedBoundsRef.current = nextBounds;
        hasNativeSagRef.current = true;
        nativeSagVisibleRef.current = true;
        setError('');
        // O PageLoad normalmente inicia o temporizador. Este fallback cobre
        // engines que não emitirem Started, sem sobrescrever um Finished que
        // já tenha chegado durante a criação do WebView.
        if (waitsForInitialPage && waitingForPageEventRef.current) {
          setState('loading');
          startLoadTimeout();
        }
      })
      .catch((openError: unknown) => {
        clearLoadTimeout();
        waitingForPageEventRef.current = false;
        nativeSagVisibleRef.current = false;
        errorLockedRef.current = true;
        setState('error');
        setError(openError instanceof Error ? openError.message : 'Não consegui abrir o SAG dentro do Bloquin.');
      })
      .finally(() => {
        requestInFlightRef.current = false;
        if (retryAfterRequestRef.current) {
          retryAfterRequestRef.current = false;
          syncNativeSag();
        }
      });
  }, [active, clearLoadTimeout, isDesktop, startLoadTimeout]);

  useEffect(() => {
    if (!isDesktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    setEventsReady(false);

    void listen<SagPageLoad>('sag-page-load', (event) => {
      if (disposed || !activeRef.current) return;
      if (event.payload.state === 'loading') {
        setState('loading');
        startLoadTimeout();
      } else {
        waitingForPageEventRef.current = false;
        clearLoadTimeout();
        setError('');
        setState('ready');
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else {
        unlisten = cleanup;
        setEventsReady(true);
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [clearLoadTimeout, isDesktop, startLoadTimeout]);

  useEffect(() => {
    if (!isDesktop) return;
    if (!active) {
      hideNativeSag();
      return;
    }
    if (!eventsReady) return;

    const frame = window.requestAnimationFrame(() => {
      syncNativeSag();
    });
    const host = hostRef.current;
    const observer = host ? new ResizeObserver(() => syncNativeSag()) : null;
    if (host) observer?.observe(host);
    window.addEventListener('resize', syncNativeSag);
    window.addEventListener('scroll', syncNativeSag, true);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', syncNativeSag);
      window.removeEventListener('scroll', syncNativeSag, true);
    };
  }, [active, eventsReady, hideNativeSag, isDesktop, syncNativeSag]);

  useEffect(() => () => {
    clearLoadTimeout();
    if (isDesktop) void invoke('dispose_sag').catch(() => undefined);
  }, [clearLoadTimeout, isDesktop]);

  const reload = async () => {
    const host = hostRef.current;
    if (!isDesktop || !host) return;
    const rect = host.getBoundingClientRect();
    const bounds: SagBounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    if (bounds.width < 1 || bounds.height < 1) return;
    setError('');
    setState('loading');
    errorLockedRef.current = false;
    appliedBoundsRef.current = null;
    waitingForPageEventRef.current = true;
    try {
      await invoke('open_sag', { bounds });
      if (!mountedRef.current || !activeRef.current) {
        nativeSagVisibleRef.current = false;
        void invoke('hide_sag').catch(() => undefined);
        return;
      }
      appliedBoundsRef.current = bounds;
      hasNativeSagRef.current = true;
      nativeSagVisibleRef.current = true;
      if (waitingForPageEventRef.current) startLoadTimeout();
      await invoke('reload_sag');
    } catch (reloadError) {
      clearLoadTimeout();
      waitingForPageEventRef.current = false;
      nativeSagVisibleRef.current = false;
      errorLockedRef.current = true;
      hideNativeSag();
      setState('error');
      setError(reloadError instanceof Error ? reloadError.message : 'Não consegui recarregar o SAG.');
    }
  };

  return (
    <main className="sag-page" aria-labelledby="sag-title">
      <header className="sag-header">
        <div className="sag-mark" aria-hidden="true">SAG</div>
        <div>
          <span className="sag-kicker">Sistema de Acompanhamento e Gestão</span>
          <h1 id="sag-title">SAG</h1>
        </div>
        <div className="sag-header-status" role="status" aria-live="polite">
          {state === 'ready' ? <><ShieldCheck aria-hidden="true" /> Conectado</> : state === 'loading' ? <><RefreshCw className="is-spinning" aria-hidden="true" /> Carregando</> : <><AlertTriangle aria-hidden="true" /> Atenção</>}
        </div>
      </header>

      <div className="sag-security-strip">
        <ShieldCheck aria-hidden="true" /> O SAG usa a própria conta. O Bloquin não compartilha seu login.
      </div>

      <section ref={hostRef} className="sag-webview-host" aria-label="SAG incorporado na aba">
        {state === 'browser-preview' && (
          <div className="sag-host-message" role="status">
            <ShieldCheck aria-hidden="true" />
            <div><strong>Abra pelo aplicativo Bloquin</strong><span>O SAG aparece aqui na versão desktop.</span></div>
          </div>
        )}
        {state === 'error' && (
          <div className="sag-host-message sag-host-message--error" role="alert">
            <AlertTriangle aria-hidden="true" />
            <div><strong>Não foi possível carregar o SAG</strong><span>{error}</span></div>
            <button type="button" className="btn-secondary" onClick={() => void reload()}><RefreshCw aria-hidden="true" /> Recarregar</button>
          </div>
        )}
        {state === 'loading' && <div className="sag-loading-fallback" aria-hidden="true"><span /><span /><span /></div>}
      </section>
    </main>
  );
}
