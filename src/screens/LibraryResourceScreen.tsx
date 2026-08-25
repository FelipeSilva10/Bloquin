import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ImageViewer } from '../components/library/ImageViewer';
import { PdfReader } from '../components/library/PdfReader';
import { downloadLibraryFile } from '../services/libraryDownloadService';
import { openLibraryExternalUrl } from '../services/libraryNavigationService';
import { normalizeExternalLink, sanitizeRichText } from '../services/libraryMediaService';
import { signLibraryPostContent } from '../services/libraryService';
import { markLibraryPostAsRead } from '../services/libraryReadService';
import { MAX_OPEN_TABS, useTabs } from '../state/tabsStore';
import type { LibraryAttachment, LibraryPost } from '../types/library';

export function LibraryResourceScreen({ tabId, mode }: { tabId?: string; mode: 'teacher' | 'student' }) {
  const navigate = useNavigate();
  const { tabs, activeTab: currentActiveTab, activateTab, openLibrary, openLibraryResource, updateTab } = useTabs();
  const activeTab = tabId ? tabs.find((tab) => tab.id === tabId) ?? currentActiveTab : currentActiveTab;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [openingExternal, setOpeningExternal] = useState(false);
  const handledRefreshKeyRef = useRef(0);
  const post = activeTab.libraryPost;
  const isSelectedTabActive = currentActiveTab.id === activeTab.id;
  const attachment = activeTab.libraryAttachmentId
    ? post?.anexos.find((item) => item.id === activeTab.libraryAttachmentId)
    : undefined;

  useEffect(() => {
    if (!isSelectedTabActive || activeTab.type !== 'library-resource' || !post) return;
    const forceRefresh = refreshKey !== handledRefreshKeyRef.current;
    handledRefreshKeyRef.current = refreshKey;
    const attachmentIsReady = !attachment || Boolean(
      attachment.content_url
      && (!attachment.original_path || attachment.download_url),
    );
    if (!forceRefresh && post.media_signed_at && Date.now() - post.media_signed_at < 45 * 60 * 1_000 && attachmentIsReady) {
      setRefreshing(false);
      return;
    }
    let active = true;
    const tabId = activeTab.id;
    setRefreshing(true);
    setError('');
    void signLibraryPostContent(post)
      .then((signedPost) => {
        if (active) updateTab(tabId, { libraryPost: signedPost });
      })
      .catch((refreshError: unknown) => {
        if (active) setError(refreshError instanceof Error ? refreshError.message : 'Não foi possível atualizar este material.');
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => { active = false; };
    // A troca de aba deve renovar URLs temporárias; atualizar o post da própria
    // aba não pode disparar uma segunda requisição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab.id, isSelectedTabActive, refreshKey]);

  const updateViewState = useCallback((nextState: { page: number; zoom: number }) => {
    updateTab(activeTab.id, { libraryViewState: nextState });
  }, [activeTab.id, updateTab]);

  const markedReadForRef = useRef<string | null>(null);
  useEffect(() => {
    // A publicação completa é sempre a primeira tela ao abrir um card (ver
    // LibraryScreen). É esse ponto de entrada garantido que registra a
    // leitura — abrir um anexo específico depois não precisa marcar de novo.
    if (mode !== 'student' || !post || attachment) return;
    if (markedReadForRef.current === post.id) return;
    markedReadForRef.current = post.id;
    void markLibraryPostAsRead(post.id, post.atualizado_em);
  }, [mode, post, attachment]);

  if (activeTab.type !== 'library-resource' || !post) return <Navigate to="/biblioteca" replace />;

  const backToLibrary = () => {
    const libraryId = openLibrary();
    if (!libraryId) {
      setError(`Você atingiu o limite de ${MAX_OPEN_TABS} abas. Feche uma aba para voltar ao mural.`);
      return;
    }
    activateTab(libraryId);
    navigate('/biblioteca', { state: { workspaceTabId: libraryId } });
  };

  const openAttachment = (item: LibraryAttachment) => {
    if (item.tipo !== 'image' && item.tipo !== 'pdf') return;
    const openedId = openLibraryResource({ post, attachmentId: item.id });
    if (!openedId) {
      setError(`Você atingiu o limite de ${MAX_OPEN_TABS} abas. Feche uma aba para abrir este material.`);
      return;
    }
    navigate('/biblioteca/leitura', { state: { workspaceTabId: openedId } });
  };

  const openPostOverview = () => {
    setError('');
    const openedId = openLibraryResource({ post });
    if (!openedId) {
      setError(`Você atingiu o limite de ${MAX_OPEN_TABS} abas. Feche uma aba para abrir esta publicação.`);
      return;
    }
    navigate('/biblioteca/leitura', { state: { workspaceTabId: openedId } });
  };

  const handleDownload = async () => {
    if (!attachment) return;
    const url = attachment.download_url ?? attachment.content_url;
    if (!url) {
      setError('O arquivo ainda não está pronto para download. Tente novamente em instantes.');
      return;
    }
    setDownloading(true);
    setError('');
    try {
      await downloadLibraryFile(
        url,
        attachment.titulo || (attachment.tipo === 'pdf' ? 'documento.pdf' : 'imagem.webp'),
        attachment.tipo === 'pdf' ? 'application/pdf' : attachment.mime_type || 'image/webp',
      );
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Não foi possível salvar o material.');
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenExternally = async () => {
    const url = attachment?.download_url ?? attachment?.content_url;
    if (!url) return;
    setOpeningExternal(true);
    setError('');
    try {
      await openLibraryExternalUrl(url);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Não foi possível abrir este material em outra aba.');
    } finally {
      setOpeningExternal(false);
    }
  };

  const kindLabel = attachment?.tipo === 'pdf' ? 'Documento PDF' : attachment?.tipo === 'image' ? 'Imagem' : 'Publicação';
  const title = attachment?.titulo?.trim() || post.titulo;

  // Apenas imagens e PDFs abrem em uma aba de leitura; são esses que formam a
  // sequência de "materiais irmãos" navegável a partir do cabeçalho.
  const openableMaterials = post.anexos.filter((item) => item.tipo === 'image' || item.tipo === 'pdf');
  const siblingIndex = attachment ? openableMaterials.findIndex((item) => item.id === attachment.id) : -1;
  const previousSibling = siblingIndex > 0 ? openableMaterials[siblingIndex - 1] : undefined;
  const nextSibling = siblingIndex >= 0 && siblingIndex < openableMaterials.length - 1 ? openableMaterials[siblingIndex + 1] : undefined;

  return (
    <main className={`library-resource-page library-resource-${attachment?.tipo ?? 'post'}`}>
      <header className="library-resource-header">
        <div className="library-resource-heading">
          <button type="button" className="btn-ghost library-back-button" onClick={backToLibrary}><span aria-hidden="true">←</span> Mural</button>
          <div>
            <span className="library-section-kicker">{kindLabel}</span>
            <h1>{title}</h1>
            {attachment && (
              <p className="library-resource-breadcrumb">
                <button type="button" className="library-resource-breadcrumb-link" onClick={openPostOverview}>{post.titulo}</button>
                <span aria-hidden="true"> · </span>publicado por {post.autor_nome}
              </p>
            )}
          </div>
        </div>
        <div className="library-resource-actions">
          {refreshing && <span className="library-refreshing" role="status"><span className="library-spinner" aria-hidden="true" /> Preparando material…</span>}
          {attachment && openableMaterials.length > 1 && (
            <div className="library-resource-siblings" role="group" aria-label="Navegar entre materiais desta publicação">
              <button type="button" className="library-sibling-nav" onClick={() => previousSibling && openAttachment(previousSibling)} disabled={!previousSibling} aria-label="Material anterior" title="Material anterior">‹</button>
              <span className="library-sibling-count">{siblingIndex + 1} de {openableMaterials.length}</span>
              <button type="button" className="library-sibling-nav" onClick={() => nextSibling && openAttachment(nextSibling)} disabled={!nextSibling} aria-label="Próximo material" title="Próximo material">›</button>
            </div>
          )}
          {attachment && (
            <button type="button" className="btn-ghost library-open-external" onClick={() => void handleOpenExternally()} disabled={openingExternal || refreshing || !(attachment.download_url ?? attachment.content_url)}>
              <span>{openingExternal ? 'Abrindo…' : 'Nova aba'}</span> <span aria-hidden="true">↗</span>
            </button>
          )}
          {attachment?.pode_baixar && (
            <button type="button" className="btn-secondary" onClick={() => void handleDownload()} disabled={downloading || refreshing || !attachment.content_url}>
              {downloading ? 'Salvando…' : 'Baixar'}
            </button>
          )}
        </div>
      </header>

      {error && <div className="dashboard-feedback dashboard-feedback-error library-resource-feedback" role="alert"><span>{error}</span>{attachment && <button type="button" className="library-feedback-retry" onClick={() => setRefreshKey((current) => current + 1)}>Atualizar material</button>}<button type="button" aria-label="Fechar mensagem" onClick={() => setError('')}>×</button></div>}

      {!attachment && <LibraryPostReader post={post} onOpenAttachment={openAttachment} />}

      {attachment?.tipo === 'image' && (
        attachment.content_url
          ? <ImageViewer
            key={`${attachment.id}-${refreshKey}`}
            url={attachment.content_url}
            highResolutionUrl={attachment.download_url}
            title={title}
            description={attachment.descricao}
            zoom={activeTab.libraryViewState?.zoom ?? 1}
            onZoomChange={(zoom) => updateViewState({ page: 1, zoom })}
            onRetry={() => setRefreshKey((current) => current + 1)}
          />
          : <LibraryMediaPending refreshing={refreshing} onRetry={() => setRefreshKey((current) => current + 1)} />
      )}

      {attachment?.tipo === 'pdf' && (
        attachment.content_url
          ? <PdfReader
            key={`${attachment.id}-${refreshKey}`}
            url={attachment.content_url}
            title={title}
            initialPage={activeTab.libraryViewState?.page ?? 1}
            initialZoom={activeTab.libraryViewState?.zoom ?? 1}
            onViewStateChange={updateViewState}
            onRetry={() => setRefreshKey((current) => current + 1)}
          />
          : <LibraryMediaPending refreshing={refreshing} onRetry={() => setRefreshKey((current) => current + 1)} />
      )}
    </main>
  );
}

function LibraryPostReader({ post, onOpenAttachment }: { post: LibraryPost; onOpenAttachment: (attachment: LibraryAttachment) => void }) {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [externalError, setExternalError] = useState('');
  const content = typeof post.conteudo_json?.html === 'string' ? sanitizeRichText(post.conteudo_json.html) : '';

  const openExternal = async (url: string) => {
    setExternalError('');
    try {
      await openLibraryExternalUrl(url);
    } catch (openError) {
      setExternalError(openError instanceof Error ? openError.message : 'Não foi possível abrir o material externo.');
    }
  };

  return (
    <article className="library-post-reader">
      <header className="library-post-reader-intro">
        <span className="library-card-author"><span className="library-avatar" aria-hidden="true">{post.autor_nome.trim().charAt(0).toUpperCase() || 'P'}</span><strong>{post.autor_nome}</strong></span>
        <span aria-hidden="true">•</span>
        <time dateTime={post.publicado_em ?? post.criado_em}>{formatDate(post.publicado_em ?? post.criado_em)}</time>
        {isPostUpdated(post) && <span className="library-updated-label">Atualizada {formatDate(post.atualizado_em)}</span>}
      </header>

      {content
        ? <section className="library-rich-content library-post-reader-text" aria-label="Texto da publicação" onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
          if (!anchor) return;
          event.preventDefault();
          void openExternal(anchor.href);
        }} dangerouslySetInnerHTML={{ __html: content }} />
        : <p className="library-muted-label library-post-no-text"></p>}

      {post.anexos.length > 0 && (
        <section className="library-post-materials" aria-labelledby="library-materials-title">
          {externalError && <div className="library-inline-error" role="alert">{externalError}</div>}
          <div className="library-post-materials-heading">
            <div><span className="library-section-kicker">Anexos</span></div>
            <span>{post.anexos.length} {post.anexos.length === 1 ? 'item' : 'itens'}</span>
          </div>
          <div className="library-material-list">
            {post.anexos.map((item) => {
              if (item.tipo === 'image' || item.tipo === 'pdf') {
                return (
                  <article className={`library-material-card library-material-${item.tipo}`} key={item.id}>
                    <button
                      type="button"
                      className="library-material-surface"
                      onClick={() => onOpenAttachment(item)}
                      aria-label={`Abrir ${item.titulo ?? (item.tipo === 'pdf' ? 'PDF' : 'imagem')} em uma nova aba`}
                    >
                      <div className="library-material-preview-wrap">
                        {item.thumbnail_url
                          ? <img src={item.thumbnail_url} alt="" loading="lazy" decoding="async" />
                          : <div className="library-material-placeholder" aria-hidden="true">{item.tipo === 'pdf' ? 'PDF' : '▧'}</div>}
                        <span className="library-material-type">{item.tipo === 'pdf' ? `${item.quantidade_paginas ?? '—'} páginas` : 'Imagem'}</span>
                      </div>
                      <div className="library-material-copy">
                        <h3>{item.titulo ?? (item.tipo === 'pdf' ? 'Documento PDF' : 'Imagem da publicação')}</h3>
                      </div>
                    </button>
                  </article>
                );
              }

              if (item.tipo === 'youtube' && item.external_id) {
                return activeVideo === item.id ? (
                  <div className="library-video-frame library-material-wide" key={item.id}>
                    <iframe title={item.titulo ?? 'Vídeo do YouTube'} src={`https://www.youtube-nocookie.com/embed/${item.external_id}`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    <div className="library-video-fallback"><span>O vídeo continua disponível no navegador.</span><button type="button" onClick={() => void openExternal(item.external_url ?? `https://www.youtube.com/watch?v=${item.external_id}`)}>Abrir no YouTube ↗</button></div>
                  </div>
                ) : (
                  <button type="button" className="library-video-preview library-material-wide" key={item.id} onClick={() => setActiveVideo(item.id)} aria-label={`Assistir ${item.titulo ?? 'vídeo'}`}>
                    {item.thumbnail_url && <img src={item.thumbnail_url} alt="" loading="lazy" decoding="async" />}
                    <span className="library-play-button" aria-hidden="true">▶</span><strong>{item.titulo ?? 'Assistir vídeo'}</strong>
                  </button>
                );
              }

              if (item.tipo === 'link' && item.external_url && normalizeExternalLink(item.external_url)) {
                const url = normalizeExternalLink(item.external_url)!;
                return <button type="button" className="library-reader-link library-material-wide" key={item.id} onClick={() => void openExternal(url)}><span className="library-attachment-icon">↗</span><span><strong>{item.titulo ?? 'Material externo'}</strong><small>{item.descricao ?? new URL(url).hostname}</small></span><span className="library-reader-link-arrow" aria-hidden="true">→</span></button>;
              }
              return null;
            })}
          </div>
        </section>
      )}
    </article>
  );
}

function LibraryMediaPending({ refreshing, onRetry }: { refreshing: boolean; onRetry: () => void }) {
  return <div className="library-media-pending" role="status">{refreshing && <span className="library-spinner" aria-hidden="true" />}<strong>{refreshing ? 'Preparando visualização nítida…' : 'Este material não está disponível.'}</strong><span>{refreshing ? 'Isso deve levar apenas um instante.' : 'A conexão pode ter oscilado ou o endereço temporário expirou.'}</span>{!refreshing && <button type="button" className="btn-secondary" onClick={onRetry}>Tentar novamente</button>}</div>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isPostUpdated(post: LibraryPost): boolean {
  return new Date(post.atualizado_em).getTime() - new Date(post.criado_em).getTime() > 1000;
}
