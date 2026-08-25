import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { archiveLibraryPost, fetchLibraryClasses, fetchLibraryPosts, permanentlyDeleteLibraryPost, refreshLibraryPostPreviews, restoreLibraryPost } from '../services/libraryService';
import { fetchLibraryReadStates, type LibraryReadState } from '../services/libraryReadService';
import type { LibraryAttachmentType, LibraryClass, LibraryPost, LibraryPostStatus } from '../types/library';
import { LibraryComposer } from '../components/library/LibraryComposer';
import { BloquinSelect } from '../components/forms/BloquinSelect';
import { MAX_OPEN_TABS, useTabs } from '../state/tabsStore';
import { useModalA11y } from '../hooks/useModalA11y';
import { MoreVertical, Plus, RefreshCw } from 'lucide-react';

interface LibraryScreenProps {
  userId: string;
  mode: 'teacher' | 'student';
}

const LIBRARY_PAGE_SIZE = 20;
const MATERIAL_FILTERS: Array<{ value: LibraryAttachmentType | 'all'; label: string; icon: string }> = [
  { value: 'all', label: 'Tudo', icon: '✦' },
  { value: 'image', label: 'Imagens', icon: '▧' },
  { value: 'pdf', label: 'PDFs', icon: '⎙' },
  { value: 'youtube', label: 'Vídeos', icon: '▶' },
  { value: 'link', label: 'Links', icon: '↗' },
];

interface LibraryDeletionIntent {
  post: LibraryPost;
  kind: 'archive' | 'permanent';
}

export function LibraryScreen({ userId, mode }: LibraryScreenProps) {
  const navigate = useNavigate();
  const { tabs, activeTabId, closeTab, openLibraryResource, updateTab } = useTabs();
  const savedViewRef = useRef(readLibraryViewPreferences(userId));
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(savedViewRef.current.scrollTop);
  const scrollRestoredRef = useRef(false);
  const [posts, setPosts] = useState<LibraryPost[]>([]);
  const [readStates, setReadStates] = useState<Record<string, LibraryReadState>>({});
  const [classes, setClasses] = useState<LibraryClass[]>([]);
  const [sessionUserId, setSessionUserId] = useState(userId);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authorName, setAuthorName] = useState('Professor');
  const [search, setSearch] = useState(savedViewRef.current.search);
  const [statusFilter, setStatusFilter] = useState<LibraryPostStatus | 'all'>(savedViewRef.current.statusFilter);
  const [classFilter, setClassFilter] = useState(savedViewRef.current.classFilter);
  const [typeFilter, setTypeFilter] = useState<LibraryAttachmentType | 'all'>(savedViewRef.current.typeFilter);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deletionError, setDeletionError] = useState('');
  const [editingPost, setEditingPost] = useState<LibraryPost | null | undefined>(undefined);
  const [pendingDeletion, setPendingDeletion] = useState<LibraryDeletionIntent | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [restoringPostId, setRestoringPostId] = useState<string | null>(null);
  const [purgingPostId, setPurgingPostId] = useState<string | null>(null);
  const [realtimeRevision, setRealtimeRevision] = useState(0);
  const loadRequestRef = useRef(0);
  const lastLoadedAtRef = useRef(0);
  const classesLoadedRef = useRef(false);
  const profileLoadedRef = useRef(false);
  const previousActiveTabRef = useRef(activeTabId);
  const handledRealtimeRevisionRef = useRef(0);
  const handleComposerDirtyChange = useCallback((dirty: boolean) => updateTab('library', { dirty }), [updateTab]);

  useEffect(() => {
    let active = true;
    setSessionLoading(true);
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError || !data.user) {
        setSessionUserId('');
        setError('Sua sessão expirou. Entre novamente para acessar a Biblioteca.');
      } else {
        setSessionUserId(data.user.id);
      }
      setSessionLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    const previousActiveTabId = previousActiveTabRef.current;
    previousActiveTabRef.current = activeTabId;
    if (activeTabId !== 'library' || previousActiveTabId === 'library' || posts.length === 0) return;
    if (Date.now() - lastLoadedAtRef.current >= 30_000) {
      handledRealtimeRevisionRef.current = realtimeRevision;
      void load(0, false, true);
      return;
    }
    const previewsAreStale = posts.some((post) => !post.media_signed_at || Date.now() - post.media_signed_at >= 45 * 60 * 1_000);
    if (!previewsAreStale) return;

    let active = true;
    const requestId = loadRequestRef.current;
    void refreshLibraryPostPreviews(posts)
      .then((refreshedPosts) => {
        if (active && requestId === loadRequestRef.current) setPosts(refreshedPosts);
      })
      .catch((refreshError: unknown) => {
        if (active) console.warn('Não foi possível renovar as prévias do mural.', refreshError);
      });
    return () => { active = false; };
    // A volta para a aba é o gatilho; posts e filtros mais novos invalidam a
    // aplicação do resultado por meio de loadRequestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  const load = async (nextOffset = 0, append = false, silent = false) => {
    if (!sessionUserId) return;
    const requestId = ++loadRequestRef.current;
    const pageSize = !append && silent ? Math.max(LIBRARY_PAGE_SIZE, posts.length) : LIBRARY_PAGE_SIZE;
    if (append) setLoadingMore(true);
    else if (!silent) {
      setLoading(true);
      setLoadingMore(false);
    }
    setError('');
    try {
      const [pagePosts, nextClasses] = await Promise.all([
        fetchLibraryPosts({
          userId: sessionUserId,
          view: mode,
          search,
          status: mode === 'teacher' ? statusFilter : 'published',
          turmaId: mode === 'teacher' && classFilter !== 'all' ? classFilter : undefined,
          attachmentType: typeFilter,
          limit: pageSize + 1,
          offset: nextOffset,
        }),
        mode === 'teacher' && !append && !classesLoadedRef.current ? fetchLibraryClasses(sessionUserId) : Promise.resolve(classes),
      ]);
      const nextPosts = pagePosts.slice(0, pageSize);
      if (requestId !== loadRequestRef.current) return;
      setPosts((current) => append
        ? [...current, ...nextPosts].filter((post, index, values) => values.findIndex((item) => item.id === post.id) === index)
        : nextPosts);
      setClasses(nextClasses);
      if (mode === 'teacher') classesLoadedRef.current = true;
      if (mode === 'student' && nextPosts.length > 0) {
        void fetchLibraryReadStates(nextPosts.map((post) => post.id)).then((states) => {
          if (requestId === loadRequestRef.current) setReadStates((current) => ({ ...current, ...states }));
        });
      }
      setOffset(nextOffset + nextPosts.length);
      setHasMore(pagePosts.length > pageSize);
      lastLoadedAtRef.current = Date.now();
      if (mode === 'teacher' && !append && !profileLoadedRef.current) {
        const { data } = await supabase.from('perfis').select('nome').eq('id', sessionUserId).maybeSingle();
        if (requestId === loadRequestRef.current) {
          profileLoadedRef.current = true;
          if (data?.nome) setAuthorName(data.nome);
        }
      }
    } catch (loadError) {
      if (requestId === loadRequestRef.current) setError(loadError instanceof Error ? loadError.message : 'Não consegui carregar a Biblioteca.');
    } finally {
      if (requestId === loadRequestRef.current) {
        if (append) setLoadingMore(false);
        else if (!silent) setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!sessionUserId) return;
    const channel = supabase
      .channel(`library-feed:${sessionUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biblioteca_publicacoes' }, () => setRealtimeRevision((current) => current + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biblioteca_publicacao_turmas' }, () => setRealtimeRevision((current) => current + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biblioteca_anexos' }, () => setRealtimeRevision((current) => current + 1))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionUserId]);

  useEffect(() => {
    if (
      realtimeRevision <= handledRealtimeRevisionRef.current
      || activeTabId !== 'library'
      || editingPost !== undefined
    ) return;
    handledRealtimeRevisionRef.current = realtimeRevision;
    const timer = window.setTimeout(() => void load(0, false, true), 650);
    return () => window.clearTimeout(timer);
    // A revisão é apenas um gatilho. O debounce consolida os vários eventos de
    // uma publicação e loadRequestRef impede respostas antigas de vencerem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, editingPost, realtimeRevision]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!sessionUserId) {
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => void load(0, false), 250);
    return () => window.clearTimeout(timer);
  }, [sessionLoading, sessionUserId, mode, search, statusFilter, classFilter, typeFilter]);

  useEffect(() => {
    savedViewRef.current = { ...savedViewRef.current, search, statusFilter, classFilter, typeFilter };
    writeLibraryViewPreferences(userId, savedViewRef.current);
  }, [classFilter, search, statusFilter, typeFilter, userId]);

  useEffect(() => {
    if (mode === 'teacher' && classesLoadedRef.current && classFilter !== 'all' && !classes.some((classroom) => classroom.id === classFilter)) {
      setClassFilter('all');
    }
  }, [classFilter, classes, mode]);

  useEffect(() => {
    if (loading || scrollRestoredRef.current) return;
    scrollRestoredRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      if (pageRef.current) pageRef.current.scrollTop = scrollTopRef.current;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading]);

  useEffect(() => () => {
    writeLibraryViewPreferences(userId, { ...savedViewRef.current, scrollTop: scrollTopRef.current });
  }, [userId]);

  const handleSaved = (post: LibraryPost) => {
    tabs.forEach((tab) => {
      if (tab.type !== 'library-resource' || tab.libraryPost?.id !== post.id) return;
      const attachment = tab.libraryAttachmentId
        ? post.anexos.find((item) => item.id === tab.libraryAttachmentId)
        : undefined;
      if (tab.libraryAttachmentId && !attachment) {
        closeTab(tab.id);
        return;
      }
      updateTab(tab.id, {
        libraryPost: post,
        title: attachment?.titulo?.trim() || post.titulo,
      });
    });
    updateTab('library', { dirty: false });
    setEditingPost(undefined);
    void load(0, false);
  };

  const requestArchive = (post: LibraryPost) => {
    setDeletionError('');
    setPendingDeletion({ post, kind: 'archive' });
  };

  const handleRestore = async (post: LibraryPost) => {
    setRestoringPostId(post.id);
    setError('');
    try {
      await restoreLibraryPost(post.id);
      await load(0, false);
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Não consegui restaurar a publicação.');
    } finally {
      setRestoringPostId(null);
    }
  };

  const requestPermanentDelete = (post: LibraryPost) => {
    setDeletionError('');
    setPendingDeletion({ post, kind: 'permanent' });
  };

  const cancelDeletion = () => {
    setDeletionError('');
    setPendingDeletion(null);
  };

  const confirmDeletion = async () => {
    const intent = pendingDeletion;
    if (!intent) return;
    setError('');
    setDeletionError('');
    setNotice('');
    if (intent.kind === 'archive') setDeletingPostId(intent.post.id);
    else setPurgingPostId(intent.post.id);
    try {
      if (intent.kind === 'archive') {
        await archiveLibraryPost(intent.post.id);
        setNotice(`“${intent.post.titulo}” foi arquivada.`);
      } else {
        await permanentlyDeleteLibraryPost(intent.post.id);
        tabs
          .filter((tab) => tab.type === 'library-resource' && tab.libraryPost?.id === intent.post.id)
          .forEach((tab) => closeTab(tab.id));
        setNotice(`“${intent.post.titulo}” foi excluída definitivamente.`);
      }
      await load(0, false);
      setPendingDeletion(null);
    } catch (deleteFailure) {
      setDeletionError(deleteFailure instanceof Error
        ? deleteFailure.message
        : intent.kind === 'permanent'
          ? 'Não consegui excluir definitivamente a publicação.'
          : 'Não consegui arquivar a publicação.');
    } finally {
      if (intent.kind === 'archive') setDeletingPostId(null);
      else setPurgingPostId(null);
    }
  };

  const openReadingPost = (post: LibraryPost, attachmentId?: string) => {
    setError('');
    const openedId = openLibraryResource({ post, attachmentId });
    if (!openedId) {
      setError(`Você atingiu o limite de ${MAX_OPEN_TABS} abas. Feche uma aba para abrir esta publicação.`);
      return;
    }
    navigate('/biblioteca/leitura', { state: { workspaceTabId: openedId } });
  };

  const hasActiveFilters = Boolean(search.trim() || statusFilter !== 'all' || classFilter !== 'all' || typeFilter !== 'all');

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setClassFilter('all');
    setTypeFilter('all');
  };

  if (editingPost !== undefined && mode === 'teacher') {
    return (
      <div className="library-page">
        <LibraryComposer
          authorName={authorName}
          classes={classes}
          post={editingPost}
          onCancel={() => { updateTab('library', { dirty: false }); setEditingPost(undefined); }}
          onSaved={handleSaved}
          onDirtyChange={handleComposerDirtyChange}
        />
      </div>
    );
  }

  return (
    <>
    <div ref={pageRef} className="library-page" onScroll={(event) => { scrollTopRef.current = event.currentTarget.scrollTop; }}>
      <header className="library-hero">
        <div className="library-hero-copy">
          <h1>Biblioteca</h1>
          <p>{mode === 'teacher' ? 'Mural da aula' : 'Mural da sua turma'}</p>
        </div>
        <div className="library-hero-action">
          {mode === 'teacher' && sessionUserId && <button type="button" className="btn-primary library-new-post-button" onClick={() => setEditingPost(null)}><Plus aria-hidden="true" /> Nova publicação</button>}
        </div>
      </header>

      {error && <div className="dashboard-feedback dashboard-feedback-error library-page-feedback" role="alert"><span>{error}</span>{sessionUserId && <button type="button" className="library-feedback-retry" onClick={() => void load(0, false)}>Tentar novamente</button>}<button type="button" aria-label="Fechar mensagem" onClick={() => setError('')}>×</button></div>}
      {notice && <div className="dashboard-feedback dashboard-feedback-success library-page-feedback" role="status"><span>{notice}</span><button type="button" aria-label="Fechar mensagem" onClick={() => setNotice('')}>×</button></div>}

      <section className="library-toolbar" aria-label="Filtros da Biblioteca">
        <div className="library-toolbar-controls">
          <label className="library-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Pesquisar publicações</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por..." aria-label="Pesquisar publicações" />
          </label>
          {mode === 'teacher' && <>
            <div className="library-filter">
              <span>Status</span>
              <BloquinSelect
                className="library-filter-select"
                compact
                label="Filtrar por status"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as LibraryPostStatus | 'all')}
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'published', label: 'Publicadas' },
                  { value: 'draft', label: 'Rascunhos' },
                  { value: 'archived', label: 'Arquivadas' },
                ]}
              />
            </div>
            <div className="library-filter">
              <span>Turma</span>
              <BloquinSelect
                className="library-filter-select"
                compact
                label="Filtrar por turma"
                value={classFilter}
                onChange={setClassFilter}
                options={[{ value: 'all', label: 'Todas' }, ...classes.map((classroom) => ({ value: classroom.id, label: classroom.nome }))]}
              />
            </div>
          </>}
          <span className="library-count" aria-live="polite">{posts.length}{hasMore ? '+' : ''} {posts.length === 1 ? 'publicação' : 'publicações'}</span>
          <button type="button" className="btn-ghost library-refresh-feed" onClick={() => void load(0, false)} disabled={loading || sessionLoading} aria-label="Atualizar publicações da Biblioteca"><RefreshCw aria-hidden="true" className={loading ? 'is-spinning' : ''} /></button>
          {hasActiveFilters && <button type="button" className="btn-text library-clear-filters" onClick={clearFilters}>Limpar</button>}
        </div>
        <div className="library-type-filters" role="group" aria-label="Filtrar por tipo de material">
          {MATERIAL_FILTERS.map((filter) => <button type="button" key={filter.value} className={typeFilter === filter.value ? 'active' : ''} onClick={() => setTypeFilter(filter.value)} aria-pressed={typeFilter === filter.value}><span aria-hidden="true">{filter.icon}</span>{filter.label}</button>)}
        </div>
      </section>

      {sessionLoading || loading ? <LibraryLoadingState /> : posts.length === 0 ? (
        <div className="library-empty" role="status">
          <div className="library-empty-icon" aria-hidden="true">{error ? '↻' : '📚'}</div>
          <h2>{error ? 'Não conseguimos carregar o mural' : search ? 'Nenhuma publicação encontrada' : mode === 'teacher' ? 'Sua Biblioteca ainda está vazia' : 'Ainda não há materiais compartilhados'}</h2>
          <p>{error ? 'Confira sua conexão e tente novamente.' : search ? 'Tente outro termo de busca.' : mode === 'teacher' ? 'Crie a primeira publicação para suas turmas.' : 'Quando um professor publicar algo para sua turma, aparecerá aqui.'}</p>
          {error && sessionUserId && <button type="button" className="btn-secondary" onClick={() => void load(0, false)}>Tentar novamente</button>}
          {!error && mode === 'teacher' && sessionUserId && !search && <button type="button" className="btn-primary" onClick={() => setEditingPost(null)}><span aria-hidden="true">＋</span> Criar primeira publicação</button>}
        </div>
      ) : (
        <main className="library-feed" aria-label="Publicações da Biblioteca">
          {posts.map((post) => (
            <LibraryCard key={post.id} post={post} mode={mode} classes={classes} readState={readStates[post.id]} onOpen={() => openReadingPost(post)} onEdit={() => setEditingPost(post)} onDelete={() => requestArchive(post)} onRestore={() => void handleRestore(post)} onPermanentlyDelete={() => requestPermanentDelete(post)} deleting={deletingPostId === post.id} restoring={restoringPostId === post.id} purging={purgingPostId === post.id} />
          ))}
          {hasMore && <button type="button" className="library-load-more btn-secondary" onClick={() => void load(offset, true)} disabled={loadingMore}>{loadingMore ? 'Carregando…' : 'Carregar mais publicações'}</button>}
        </main>
      )}
    </div>
    {pendingDeletion && (
      <LibraryDeleteDialog
        intent={pendingDeletion}
        busy={deletingPostId === pendingDeletion.post.id || purgingPostId === pendingDeletion.post.id}
        error={deletionError}
        onCancel={cancelDeletion}
        onConfirm={() => void confirmDeletion()}
      />
    )}
    </>
  );
}

function LibraryDeleteDialog({ intent, busy, error, onCancel, onConfirm }: {
  intent: LibraryDeletionIntent;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const permanentlyDeleting = intent.kind === 'permanent';
  const modalRef = useModalA11y<HTMLDivElement>(busy ? () => undefined : onCancel);

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <div ref={modalRef} className="modal-box library-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="library-delete-title" aria-describedby={error ? 'library-delete-description library-delete-error' : 'library-delete-description'}>
        <div className="library-delete-dialog-icon" aria-hidden="true">{permanentlyDeleting ? '!' : '⌫'}</div>
        <span className="library-section-kicker">{permanentlyDeleting ? 'Ação permanente' : 'Arquivar publicação'}</span>
        <h2 id="library-delete-title">{permanentlyDeleting ? 'Excluir definitivamente?' : 'Arquivar publicação?'}</h2>
        <p id="library-delete-description">
          {permanentlyDeleting
            ? <>“<strong>{intent.post.titulo}</strong>” e seus materiais serão excluídos permanentemente. Esta ação não pode ser desfeita.</>
            : <>“<strong>{intent.post.titulo}</strong>” deixará de aparecer no mural, mas poderá ser restaurada depois.</>}
        </p>
        {error && <div id="library-delete-error" className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? (permanentlyDeleting ? 'Excluindo…' : 'Arquivando…') : (permanentlyDeleting ? 'Excluir definitivamente' : 'Arquivar publicação')}
          </button>
        </div>
      </div>
    </div>
  );
}

function LibraryCard({ post, mode, classes, readState, onOpen, onEdit, onDelete, onRestore, onPermanentlyDelete, deleting, restoring, purging }: {
  post: LibraryPost;
  mode: 'teacher' | 'student';
  classes: LibraryClass[];
  readState?: LibraryReadState;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPermanentlyDelete: () => void;
  deleting: boolean;
  restoring: boolean;
  purging: boolean;
}) {
  // A capa segue mostrando o material principal da publicação, mas o clique no
  // card sempre abre a publicação completa — os materiais são abertos de lá.
  const mainMaterial = post.anexos.find((attachment) => attachment.id === post.capa_anexo_id && (attachment.tipo === 'image' || attachment.tipo === 'pdf'))
    ?? post.anexos.find((attachment) => attachment.tipo === 'image' || attachment.tipo === 'pdf');
  const cover = (mainMaterial?.thumbnail_url ? mainMaterial : undefined)
    ?? post.anexos.find((attachment) => attachment.id === post.capa_anexo_id && attachment.thumbnail_url)
    ?? post.anexos.find((attachment) => attachment.thumbnail_url);
  const classNames = post.turma_ids.map((id) => classes.find((classroom) => classroom.id === id)?.nome).filter(Boolean);
  const attachmentTypes = [...new Set(post.anexos.map((attachment) => attachment.tipo))];
  const typeLabel = attachmentTypes.length === 0 ? 'Texto' : attachmentTypes.map(getAttachmentTypeLabel).join(' · ');
  const authorInitial = post.autor_nome.trim().charAt(0).toUpperCase() || 'P';
  const studentReadState = mode === 'student' ? getPostReadState(post, readState) : null;
  const isNewForStudent = studentReadState === 'new';
  const isUpdatedForStudent = studentReadState === 'updated';
  const isUpdatedForTeacher = mode === 'teacher' && isPostUpdated(post);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <article className={`library-card library-card-${post.anexos[0]?.tipo ?? 'text'}${isNewForStudent ? ' library-card-new' : ''}`}>
      <button
        type="button"
        className="library-card-surface"
        onClick={onOpen}
        aria-label={`Abrir publicação ${post.titulo}`}
      >
        <div className="library-card-cover-wrap">
          {cover?.thumbnail_url ? <img className="library-card-cover" src={cover.thumbnail_url} alt="" loading="lazy" decoding="async" /> : <div className="library-card-cover-placeholder" aria-hidden="true"><span>{getAttachmentIcon(post.anexos[0]?.tipo)}</span><small>Material de leitura</small></div>}
          <span className="library-card-kind">{typeLabel}</span>
        </div>
        <div className="library-card-body">
          <div className="library-card-meta">
            <span className="library-card-author"><span className="library-avatar" aria-hidden="true">{authorInitial}</span><strong>{post.autor_nome}</strong></span>
            <time dateTime={post.publicado_em ?? post.criado_em}>{formatDate(post.publicado_em ?? post.criado_em)}</time>
          </div>
          <h2>{post.titulo}</h2>
          <p className="library-card-hint">{post.anexos.length > 0 ? `${post.anexos.length} ${post.anexos.length === 1 ? 'material' : 'materiais'} nesta publicação` : 'Publicação de texto'}</p>
          {(post.status !== 'published' || isNewForStudent || isUpdatedForStudent || isUpdatedForTeacher || (mode === 'teacher' && classNames.length > 0)) && (
            <div className="library-card-tags">
              {isNewForStudent && <span className="library-badge-new">Novo</span>}
              {post.status === 'draft' && <span className="library-status library-status-draft">Rascunho</span>}
              {post.status === 'archived' && <span className="library-status library-status-archived">Arquivada</span>}
              {(isUpdatedForStudent || isUpdatedForTeacher) && <span className="library-updated-label">Atualizada</span>}
              {mode === 'teacher' && classNames.length > 0 && <span className="library-class-chip">{classNames.length === 1 ? classNames[0] : `${classNames.length} turmas`}</span>}
            </div>
          )}
        </div>
      </button>

      {mode === 'teacher' && (
        <div className="library-card-menu" ref={menuRef}>
          <button
            type="button"
            className="library-card-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Mais ações para ${post.titulo}`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical aria-hidden="true" size={18} />
          </button>
          {menuOpen && (
            <div className="library-card-menu-list" role="menu">
              {post.status === 'archived' ? (
                <>
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onRestore)} disabled={restoring || purging}>{restoring ? 'Restaurando…' : 'Restaurar'}</button>
                  <button type="button" role="menuitem" className="library-card-menu-danger" onClick={() => runMenuAction(onPermanentlyDelete)} disabled={restoring || purging}>{purging ? 'Excluindo…' : 'Excluir definitivamente'}</button>
                </>
              ) : (
                <>
                  <button type="button" role="menuitem" onClick={() => runMenuAction(onEdit)}>Editar</button>
                  <button type="button" role="menuitem" className="library-card-menu-danger" onClick={() => runMenuAction(onDelete)} disabled={deleting}>{deleting ? 'Arquivando…' : 'Arquivar'}</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function LibraryLoadingState() {
  return (
    <div className="library-loading-grid" role="status" aria-label="Carregando publicações">
      {[1, 2, 3].map((item) => <div className="library-loading-card" key={item}><div className="library-loading-cover" /><div className="library-loading-line library-loading-line-short" /><div className="library-loading-line" /><div className="library-loading-line library-loading-line-medium" /><span className="sr-only">Carregando a Biblioteca…</span></div>)}
    </div>
  );
}

function getAttachmentTypeLabel(type: LibraryAttachmentType): string {
  if (type === 'youtube') return 'Vídeo';
  if (type === 'image') return 'Imagem';
  if (type === 'pdf') return 'PDF';
  return 'Link';
}

function getAttachmentIcon(type?: LibraryAttachmentType): string {
  if (type === 'youtube') return '▶';
  if (type === 'image') return '▧';
  if (type === 'pdf') return 'PDF';
  if (type === 'link') return '↗';
  return '✦';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isPostUpdated(post: LibraryPost): boolean {
  return new Date(post.atualizado_em).getTime() - new Date(post.criado_em).getTime() > 1000;
}

function getPostReadState(post: LibraryPost, readState: LibraryReadState | undefined): 'new' | 'updated' | 'normal' {
  if (!readState) return 'new';
  return new Date(post.atualizado_em).getTime() > new Date(readState.visto_atualizado_em).getTime() ? 'updated' : 'normal';
}

interface LibraryViewPreferences {
  search: string;
  statusFilter: LibraryPostStatus | 'all';
  classFilter: string;
  typeFilter: LibraryAttachmentType | 'all';
  scrollTop: number;
}

const DEFAULT_LIBRARY_VIEW: LibraryViewPreferences = {
  search: '',
  statusFilter: 'all',
  classFilter: 'all',
  typeFilter: 'all',
  scrollTop: 0,
};

function readLibraryViewPreferences(userId: string): LibraryViewPreferences {
  try {
    const stored = sessionStorage.getItem(`bloquin.library-view.${userId}`);
    if (!stored) return { ...DEFAULT_LIBRARY_VIEW };
    const parsed = JSON.parse(stored) as Partial<LibraryViewPreferences>;
    return {
      search: typeof parsed.search === 'string' ? parsed.search : '',
      statusFilter: ['all', 'draft', 'published', 'archived'].includes(parsed.statusFilter ?? '') ? parsed.statusFilter! : 'all',
      classFilter: typeof parsed.classFilter === 'string' ? parsed.classFilter : 'all',
      typeFilter: ['all', 'image', 'pdf', 'youtube', 'link'].includes(parsed.typeFilter ?? '') ? parsed.typeFilter! : 'all',
      scrollTop: typeof parsed.scrollTop === 'number' && parsed.scrollTop > 0 ? parsed.scrollTop : 0,
    };
  } catch {
    return { ...DEFAULT_LIBRARY_VIEW };
  }
}

function writeLibraryViewPreferences(userId: string, preferences: LibraryViewPreferences): void {
  try {
    sessionStorage.setItem(`bloquin.library-view.${userId}`, JSON.stringify(preferences));
  } catch {
    // A Biblioteca continua funcional quando o armazenamento da sessão está indisponível.
  }
}
