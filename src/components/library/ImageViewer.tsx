import { useEffect, useRef, useState } from 'react';

interface ImageViewerProps {
  url: string;
  highResolutionUrl?: string;
  title: string;
  description?: string | null;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  onRetry?: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export function ImageViewer({ url, highResolutionUrl, title, description, zoom = 1, onZoomChange, onRetry }: ImageViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(true);
  const [loadedUrl, setLoadedUrl] = useState('');
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const imageUrl = zoom > 1 && highResolutionUrl ? highResolutionUrl : url;

  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
    setLoadedUrl('');
    setLoading(true);
    setError('');
  }, [imageUrl]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateSize = () => {
      if (stage.clientWidth > 0 && stage.clientHeight > 0) {
        setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const setZoom = (value: number) => onZoomChange?.(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)));
  const fitScale = naturalSize.width > 0 && naturalSize.height > 0
    ? Math.min(
      1,
      Math.max(1, stageSize.width - 48) / naturalSize.width,
      Math.max(1, stageSize.height - 48) / naturalSize.height,
    )
    : 1;
  const displayWidth = naturalSize.width * fitScale * zoom;
  const displayHeight = naturalSize.height * fitScale * zoom;

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewerRef.current?.requestFullscreen();
    } catch {
      setError('A tela cheia não está disponível neste ambiente.');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target !== event.currentTarget && event.target.closest('button, input, select, textarea, a')) return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setZoom(zoom + ZOOM_STEP);
    } else if (event.key === '-') {
      event.preventDefault();
      setZoom(zoom - ZOOM_STEP);
    } else if (event.key === '0') {
      event.preventDefault();
      setZoom(1);
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || zoom <= 1) return;
    const stage = stageRef.current;
    if (!stage) return;
    dragRef.current = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-dragging');
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    const drag = dragRef.current;
    if (!stage || !drag) return;
    stage.scrollLeft = drag.left - (event.clientX - drag.x);
    stage.scrollTop = drag.top - (event.clientY - drag.y);
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    dragRef.current = null;
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    stage?.classList.remove('is-dragging');
  };

  return (
    <div
      ref={viewerRef}
      className="library-image-viewer"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`Visualizador da imagem ${title}`}
    >
      <div className="library-media-toolbar" role="toolbar" aria-label="Controles da imagem">
        <div className="library-media-toolbar-group">
          <button type="button" className="btn-ghost" onClick={() => setZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Diminuir zoom">−</button>
          <output aria-live="polite" aria-label="Nível de zoom">{Math.round(zoom * 100)}%</output>
          <button type="button" className="btn-ghost" onClick={() => setZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Aumentar zoom">+</button>
          <button type="button" className="btn-ghost library-toolbar-text-button" onClick={() => setZoom(1)}>Ajustar</button>
        </div>
        <button type="button" className="btn-ghost library-toolbar-text-button" onClick={() => void toggleFullscreen()} aria-pressed={fullscreen}>
          <span aria-hidden="true">{fullscreen ? '↙' : '⛶'}</span> {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
      </div>
      <div
        ref={stageRef}
        className={`library-image-stage${zoom > 1 ? ' is-zoomed' : ''}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        {loading && !error && <div className="library-media-loading" role="status"><span className="library-spinner" aria-hidden="true" /> Carregando imagem nítida…</div>}
        {error && <div className="library-media-error" role="alert"><strong>Não foi possível exibir a imagem.</strong><span>{error}</span>{onRetry && <button type="button" className="btn-secondary" onClick={onRetry}>Tentar novamente</button>}</div>}
        <img
          src={imageUrl}
          alt={description?.trim() || title}
          draggable={false}
          decoding="async"
          style={{
            ...(naturalSize.width > 0 ? { width: displayWidth, height: displayHeight } : {}),
            visibility: loadedUrl === imageUrl && !error ? 'visible' : 'hidden',
          }}
          onLoad={(event) => {
            setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
            setLoadedUrl(imageUrl);
            setLoading(false);
            setError('');
          }}
          onError={() => {
            setLoading(false);
            setError('O endereço temporário pode ter expirado. Atualize o material e tente novamente.');
          }}
          onDoubleClick={() => setZoom(zoom > 1 ? 1 : 2)}
        />
      </div>
      {description && <p className="library-image-caption">{description}</p>}
    </div>
  );
}
