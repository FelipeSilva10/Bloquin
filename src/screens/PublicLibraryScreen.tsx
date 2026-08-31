import { useEffect, useState } from 'react';
import { fetchPublicLibraryPosts } from '../services/publicLibraryService';
import { signLibraryPostContent } from '../services/libraryService';
import { LibraryPostReader } from './LibraryResourceScreen';
import { ImageViewer } from '../components/library/ImageViewer';
import { PdfReader } from '../components/library/PdfReader';
import type { LibraryAttachment, LibraryPost } from '../types/library';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PublicLibraryCard({ post, onOpen }: { post: LibraryPost; onOpen: () => void }) {
  const cover = post.anexos.find((attachment) => (attachment.tipo === 'image' || attachment.tipo === 'pdf') && attachment.thumbnail_url);
  const authorInitial = post.autor_nome.trim().charAt(0).toUpperCase() || 'B';

  return (
    <article className="library-card">
      <button type="button" className="library-card-surface" onClick={onOpen} aria-label={`Abrir publicação ${post.titulo}`}>
        <div className="library-card-cover-wrap">
          {cover?.thumbnail_url
            ? <img className="library-card-cover" src={cover.thumbnail_url} alt="" loading="lazy" decoding="async" />
            : <div className="library-card-cover-placeholder" aria-hidden="true"><span>✦</span><small>Material de leitura</small></div>}
        </div>
        <div className="library-card-body">
          <div className="library-card-meta">
            <span className="library-card-author"><span className="library-avatar" aria-hidden="true">{authorInitial}</span><strong>{post.autor_nome}</strong></span>
            <time dateTime={post.publicado_em ?? post.criado_em}>{formatDate(post.publicado_em ?? post.criado_em)}</time>
          </div>
          <h2>{post.titulo}</h2>
          <p className="library-card-hint">{post.anexos.length > 0 ? `${post.anexos.length} ${post.anexos.length === 1 ? 'material' : 'materiais'} nesta publicação` : 'Publicação de texto'}</p>
        </div>
      </button>
    </article>
  );
}

export function PublicLibraryScreen() {
  const [posts, setPosts] = useState<LibraryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPost, setSelectedPost] = useState<LibraryPost | null>(null);
  const [openAttachment, setOpenAttachment] = useState<LibraryAttachment | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPublicLibraryPosts()
      .then((found) => { if (!cancelled) setPosts(found); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Não foi possível carregar a Biblioteca.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const openPost = async (post: LibraryPost) => {
    setOpening(true);
    setError('');
    try {
      setSelectedPost(await signLibraryPostContent(post));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir esta publicação.');
    } finally {
      setOpening(false);
    }
  };

  if (openAttachment) {
    return (
      <main className={`library-resource-page library-resource-${openAttachment.tipo}`}>
        <header className="library-resource-header">
          <div className="library-resource-heading">
            <button type="button" className="btn-ghost library-back-button" onClick={() => setOpenAttachment(null)}><span aria-hidden="true">←</span> Publicação</button>
            <div><h1>{openAttachment.titulo ?? selectedPost?.titulo}</h1></div>
          </div>
        </header>
        {openAttachment.tipo === 'image' && openAttachment.content_url && (
          <ImageViewer url={openAttachment.content_url} highResolutionUrl={openAttachment.download_url} title={openAttachment.titulo ?? 'Imagem'} description={openAttachment.descricao} />
        )}
        {openAttachment.tipo === 'pdf' && openAttachment.content_url && (
          <PdfReader url={openAttachment.content_url} title={openAttachment.titulo ?? 'Documento PDF'} />
        )}
      </main>
    );
  }

  if (selectedPost) {
    return (
      <div className="library-page">
        <header className="library-hero">
          <div className="library-hero-copy">
            <button type="button" className="btn-ghost library-back-button" onClick={() => setSelectedPost(null)}><span aria-hidden="true">←</span> Biblioteca</button>
          </div>
        </header>
        <LibraryPostReader post={selectedPost} onOpenAttachment={setOpenAttachment} />
      </div>
    );
  }

  return (
    <div className="library-page">
      <header className="library-hero">
        <div className="library-hero-copy">
          <h1>Biblioteca</h1>
          <p>Materiais compartilhados pelo Bloquin</p>
        </div>
      </header>

      {error && <div className="dashboard-feedback dashboard-feedback-error library-page-feedback" role="alert"><span>{error}</span><button type="button" aria-label="Fechar mensagem" onClick={() => setError('')}>×</button></div>}

      {loading ? (
        <div className="library-loading-grid" role="status" aria-label="Carregando publicações">
          {[1, 2, 3].map((item) => <div className="library-loading-card" key={item}><div className="library-loading-cover" /><div className="library-loading-line library-loading-line-short" /><div className="library-loading-line" /><div className="library-loading-line library-loading-line-medium" /></div>)}
        </div>
      ) : posts.length === 0 ? (
        <div className="library-empty" role="status">
          <div className="library-empty-icon" aria-hidden="true">📚</div>
          <h2>{error ? 'Não conseguimos carregar a Biblioteca' : 'Ainda não há materiais publicados'}</h2>
          <p>{error ? 'Confira sua conexão e tente novamente.' : 'Quando algo for publicado aqui, aparece nesta tela.'}</p>
        </div>
      ) : (
        <main className="library-feed" aria-label="Publicações da Biblioteca" aria-busy={opening}>
          {posts.map((post) => <PublicLibraryCard key={post.id} post={post} onOpen={() => void openPost(post)} />)}
        </main>
      )}
    </div>
  );
}
