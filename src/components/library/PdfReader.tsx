import { useEffect, useRef, useState } from 'react';
import { openPdfDocument, renderPdfPage } from '../../services/pdfPreviewService';
import type { PdfDocumentHandle } from '../../services/pdfPreviewService';

interface PdfReaderProps {
  url: string;
  title: string;
  initialPage?: number;
  initialZoom?: number;
  onViewStateChange?: (state: { page: number; zoom: number }) => void;
  onRetry?: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export function PdfReader({ url, title, initialPage = 1, initialZoom = 1, onViewStateChange, onRetry }: PdfReaderProps) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [documentHandle, setDocumentHandle] = useState<PdfDocumentHandle | null>(null);
  const [pageNumber, setPageNumber] = useState(Math.max(1, initialPage));
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initialZoom)));
  const [availableWidth, setAvailableWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const canvasWrap = canvasWrapRef.current;
    if (!canvasWrap) return;
    let frame = 0;
    const updateWidth = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (canvasWrap.clientWidth > 0) setAvailableWidth(Math.max(280, canvasWrap.clientWidth - 48));
      });
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(canvasWrap);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let loadedHandle: PdfDocumentHandle | null = null;

    setDocumentHandle(null);
    setPageNumber(Math.max(1, initialPage));
    setPageCount(0);
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initialZoom)));
    setLoading(true);
    setRendering(false);
    setError('');

    void openPdfDocument(url)
      .then((nextHandle) => {
        if (!active) {
          void nextHandle.destroy();
          return;
        }
        loadedHandle = nextHandle;
        setDocumentHandle(nextHandle);
        setPageCount(nextHandle.document.numPages);
        setPageNumber((current) => Math.min(nextHandle.document.numPages, Math.max(1, current)));
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível abrir este PDF.');
      });

    return () => {
      active = false;
      if (loadedHandle) void loadedHandle.destroy();
    };
  // O estado inicial pertence à aba. Alterações posteriores são persistidas pelo
  // callback sem recarregar o documento a cada clique de zoom ou troca de página.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!documentHandle || !canvasRef.current) return;

    let active = true;
    let cancelRender: (() => void) | undefined;
    let cleanupPage: (() => boolean) | undefined;
    setRendering(true);
    setError('');

    void (async () => {
      try {
        const renderedPage = await renderPdfPage(documentHandle.document, pageNumber, canvasRef.current!, zoom, availableWidth || undefined);
        cancelRender = () => renderedPage.renderTask.cancel();
        cleanupPage = () => renderedPage.page.cleanup();
        if (!active) {
          renderedPage.renderTask.cancel();
          renderedPage.page.cleanup();
          return;
        }
        await renderedPage.renderTask.promise;
        renderedPage.page.cleanup();
        if (active) setRendering(false);
      } catch (renderError: unknown) {
        if (!active || isRenderCancellation(renderError)) return;
        setRendering(false);
        setError(renderError instanceof Error ? renderError.message : 'Não foi possível renderizar esta página.');
      }
    })();

    return () => {
      active = false;
      cancelRender?.();
      cleanupPage?.();
    };
  }, [availableWidth, documentHandle, pageNumber, zoom]);

  useEffect(() => {
    onViewStateChange?.({ page: pageNumber, zoom });
  }, [onViewStateChange, pageNumber, zoom]);

  useEffect(() => {
    const canvasWrap = canvasWrapRef.current;
    if (!canvasWrap) return;
    canvasWrap.scrollTop = 0;
    canvasWrap.scrollLeft = 0;
  }, [pageNumber]);

  const canGoBack = pageNumber > 1;
  const canGoForward = pageCount > 0 && pageNumber < pageCount;

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewerRef.current?.requestFullscreen();
    } catch {
      setError('O modo tela cheia não está disponível neste ambiente.');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target !== event.currentTarget && event.target.closest('button, input, select, textarea, a')) return;
    if (loading || pageCount === 0) return;
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      setPageNumber((current) => Math.max(1, current - 1));
    } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      setPageNumber((current) => Math.min(pageCount, current + 1));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));
    } else if (event.key === '-') {
      event.preventDefault();
      setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
    } else if (event.key === '0') {
      event.preventDefault();
      setZoom(1);
    }
  };

  return (
    <div ref={viewerRef} className="library-pdf-viewer" tabIndex={0} onKeyDown={handleKeyDown} aria-label={`Visualizador do PDF ${title}`}>
      <div className="library-pdf-toolbar" role="toolbar" aria-label="Controles do PDF">
        <div className="library-pdf-page-controls">
          <button type="button" className="btn-ghost library-pdf-navigation-button" onClick={() => setPageNumber((current) => Math.max(1, current - 1))} disabled={!canGoBack || loading} aria-label="Página anterior"><span aria-hidden="true">←</span><span>Anterior</span></button>
          <label className="library-pdf-page-input"><span className="sr-only">Página atual</span><input type="number" min={1} max={pageCount || 1} value={pageNumber} onChange={(event) => setPageNumber(Math.min(pageCount || 1, Math.max(1, Number(event.target.value) || 1)))} disabled={loading || pageCount === 0} aria-label="Página atual" /><span aria-live="polite">/ {pageCount || '—'}</span></label>
          <button type="button" className="btn-ghost library-pdf-navigation-button" onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))} disabled={!canGoForward || loading} aria-label="Próxima página"><span>Próxima</span><span aria-hidden="true">→</span></button>
        </div>
        <div className="library-pdf-zoom-controls">
          <button type="button" className="btn-ghost" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM || loading} aria-label="Diminuir zoom">−</button>
          <output aria-live="polite" aria-label="Nível de zoom">{Math.round(zoom * 100)}%</output>
          <button type="button" className="btn-ghost" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM || loading} aria-label="Aumentar zoom">+</button>
          <button type="button" className="btn-ghost library-toolbar-text-button" onClick={() => setZoom(1)} disabled={loading}>Ajustar</button>
        </div>
        <button type="button" className="btn-ghost library-toolbar-text-button" onClick={() => void toggleFullscreen()} disabled={loading} aria-pressed={fullscreen} aria-label={fullscreen ? 'Sair da tela cheia' : 'Abrir PDF em tela cheia'}><span aria-hidden="true">{fullscreen ? '↙' : '⛶'}</span> {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</button>
      </div>
      <div ref={canvasWrapRef} className="library-pdf-canvas-wrap">
        {loading && <div className="library-media-loading" role="status"><span className="library-spinner" aria-hidden="true" /> Abrindo PDF…</div>}
        {!loading && error && (
          <div className="library-pdf-error" role="alert">
            <p>{error}</p>
            <span>O endereço temporário pode ter expirado.</span>
            {onRetry && <button type="button" className="btn-secondary" onClick={onRetry}>Tentar novamente</button>}
          </div>
        )}
        <canvas ref={canvasRef} className="library-pdf-canvas" hidden={loading || Boolean(error)} role="img" aria-label={`${title}, página ${pageNumber}`} />
        {!loading && !error && rendering && <div className="library-pdf-rendering" role="status"><span className="library-spinner" aria-hidden="true" /> Renderizando página {pageNumber}…</div>}
      </div>
    </div>
  );
}

function isRenderCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}
