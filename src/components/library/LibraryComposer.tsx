import { useEffect, useMemo, useRef, useState } from 'react';
import type { LibraryAttachmentInput, LibraryClass, LibraryPost } from '../../types/library';
import { RichTextEditor } from './RichTextEditor';
import { normalizeYoutubeUrl, saveLibraryPost } from '../../services/libraryService';
import {
  getYoutubePreviewUrl,
  MAX_ATTACHMENTS_PER_POST,
  MAX_IMAGE_INPUT_BYTES,
  normalizeExternalLink,
  revokeMediaPreview,
  validatePdfFile,
} from '../../services/libraryMediaService';
import { richTextToPlainText, sanitizeRichText } from '../../services/libraryMediaService';

interface LibraryComposerProps {
  authorName: string;
  classes: LibraryClass[];
  post?: LibraryPost | null;
  onCancel: () => void;
  onSaved: (post: LibraryPost) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

interface DraftAttachment extends LibraryAttachmentInput {
  id: string;
  existing?: LibraryPost['anexos'][number];
}

export function LibraryComposer({ authorName, classes, post, onCancel, onSaved, onDirtyChange }: LibraryComposerProps) {
  const [title, setTitle] = useState(post?.titulo ?? '');
  const [content, setContent] = useState(getPostHtml(post));
  const [selectedClasses, setSelectedClasses] = useState<string[]>(post?.turma_ids ?? []);
  const [attachments, setAttachments] = useState<DraftAttachment[]>(() => (post?.anexos ?? []).map((attachment, index) => ({
    id: attachment.id,
    existing: attachment,
    type: attachment.tipo === 'pdf' ? 'pdf' : attachment.tipo === 'youtube' ? 'youtube' : attachment.tipo === 'link' ? 'link' : 'image',
    title: attachment.titulo ?? undefined,
    description: attachment.descricao ?? undefined,
    order: index,
    youtubeUrl: attachment.external_url ?? undefined,
    youtubeId: attachment.external_id ?? undefined,
    url: attachment.external_url ?? undefined,
    previewUrl: attachment.thumbnail_url,
  })));
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [existingYoutubeError, setExistingYoutubeError] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const attachmentsRef = useRef(attachments);
  const mountedRef = useRef(true);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attachmentsRef.current.forEach((attachment) => revokeMediaPreview(attachment.previewUrl));
    };
  }, []);

  const attachmentCount = attachments.length;
  const canPublish = title.trim().length > 0 && selectedClasses.length > 0 && !saving && !processing;
  const dirty = isComposerDirty({ post, title, content, selectedClasses, attachments, removedAttachmentIds });

  useEffect(() => {
    onDirtyChange?.(dirty || saving || processing);
  }, [dirty, onDirtyChange, processing, saving]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const classSummary = useMemo(() => {
    if (selectedClasses.length === 0) return 'Nenhuma turma selecionada';
    if (selectedClasses.length === classes.length) return 'Todas as suas turmas';
    return `${selectedClasses.length} ${selectedClasses.length === 1 ? 'turma selecionada' : 'turmas selecionadas'}`;
  }, [classes.length, selectedClasses.length]);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0 || saving || processing) return;
    if (attachmentCount + files.length > MAX_ATTACHMENTS_PER_POST) {
      setError(`Cada publicação pode ter no máximo ${MAX_ATTACHMENTS_PER_POST} anexos.`);
      return;
    }

    const unsupported = files.find((file) => !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) && !file.name.toLowerCase().endsWith('.pdf'));
    if (unsupported) {
      setError(`O formato de ${unsupported.name} não é aceito. Use imagens ou PDF.`);
      return;
    }

    const oversizedImage = files.find((file) => file.type.startsWith('image/') && file.size > MAX_IMAGE_INPUT_BYTES);
    if (oversizedImage) {
      setError(`A imagem ${oversizedImage.name} deve ter no máximo 15 MB.`);
      return;
    }

    setError('');
    setProcessing(true);
    const prepared: DraftAttachment[] = [];
    try {
      for (const file of files) {
        const id = crypto.randomUUID();
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const validated = await validatePdfFile(file);
          prepared.push({
            id,
            clientId: id,
            type: 'pdf' as const,
            file,
            title: file.name.replace(/\.[^.]+$/, ''),
            order: attachments.length,
            previewUrl: validated.previewUrl,
            pdfThumbnail: validated.thumbnail,
            pdfPageCount: validated.pageCount,
          });
          continue;
        }
        prepared.push({
          id,
          clientId: id,
          type: 'image' as const,
          file,
          title: file.name.replace(/\.[^.]+$/, ''),
          order: attachments.length,
          previewUrl: URL.createObjectURL(file),
        });
      }
      if (!mountedRef.current) {
        prepared.forEach((attachment) => revokeMediaPreview(attachment.previewUrl));
        return;
      }
      setAttachments((current) => [...current, ...prepared.map((attachment, index) => ({ ...attachment, order: current.length + index }))]);
    } catch (fileError) {
      prepared.forEach((attachment) => revokeMediaPreview(attachment.previewUrl));
      if (mountedRef.current) setError(fileError instanceof Error ? fileError.message : 'Não consegui preparar um dos arquivos.');
    } finally {
      if (mountedRef.current) setProcessing(false);
    }
  };

  const addYoutube = () => {
    if (saving || processing) return;
    const parsed = normalizeYoutubeUrl(youtubeUrl);
    if (!parsed) {
      setExistingYoutubeError('Cole um link válido do YouTube, como youtube.com/watch?v=… ou youtu.be/….');
      return;
    }
    if (attachmentCount >= MAX_ATTACHMENTS_PER_POST) {
      setExistingYoutubeError(`Cada publicação pode ter no máximo ${MAX_ATTACHMENTS_PER_POST} anexos.`);
      return;
    }
    setExistingYoutubeError('');
    const id = crypto.randomUUID();
    setAttachments((current) => [...current, {
      id,
      clientId: id,
      type: 'youtube',
      youtubeUrl: parsed.url,
      youtubeId: parsed.id,
      title: 'Vídeo do YouTube',
      order: current.length,
      previewUrl: getYoutubePreviewUrl(parsed.id),
    }]);
    setYoutubeUrl('');
  };

  const addExternalLink = () => {
    if (saving || processing) return;
    const normalizedUrl = normalizeExternalLink(linkUrl);
    if (!normalizedUrl) {
      setLinkError('Informe um link válido começando com http:// ou https://.');
      return;
    }
    if (attachmentCount >= MAX_ATTACHMENTS_PER_POST) {
      setLinkError(`Cada publicação pode ter no máximo ${MAX_ATTACHMENTS_PER_POST} anexos.`);
      return;
    }
    setLinkError('');
    const id = crypto.randomUUID();
    setAttachments((current) => [...current, {
      id,
      clientId: id,
      type: 'link',
      url: normalizedUrl,
      title: new URL(normalizedUrl).hostname,
      order: current.length,
    }]);
    setLinkUrl('');
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      revokeMediaPreview(removed?.previewUrl);
      return current.filter((attachment) => attachment.id !== id).map((attachment, index) => ({ ...attachment, order: index }));
    });
    if (post?.anexos.some((attachment) => attachment.id === id)) {
      setRemovedAttachmentIds((current) => current.includes(id) ? current : [...current, id]);
    }
  };

  const moveAttachment = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= attachments.length) return;
    setAttachments((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((attachment, position) => ({ ...attachment, order: position }));
    });
  };

  const updateAttachment = (id: string, patch: Partial<Pick<DraftAttachment, 'title' | 'description' | 'url' | 'youtubeUrl' | 'youtubeId' | 'previewUrl'>>) => {
    setAttachments((current) => current.map((attachment) => attachment.id === id ? { ...attachment, ...patch } : attachment));
  };

  const updateYoutubeUrl = (id: string, value: string) => {
    const parsed = normalizeYoutubeUrl(value);
    updateAttachment(id, {
      youtubeUrl: value,
      url: value,
      youtubeId: parsed?.id,
      previewUrl: parsed ? getYoutubePreviewUrl(parsed.id) : undefined,
    });
  };

  const toggleClass = (classId: string) => {
    setSelectedClasses((current) => current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId]);
  };

  const toggleAllClasses = () => {
    setSelectedClasses((current) => current.length === classes.length ? [] : classes.map((classroom) => classroom.id));
  };

  const handleCancel = () => {
    if (dirty && !window.confirm('Descartar as alterações desta publicação?')) return;
    onCancel();
  };

  const handleSave = async (status: 'draft' | 'published') => {
    if (saving || processing) return;
    if (!title.trim()) {
      setError('Informe um título para a publicação.');
      return;
    }
    if (status === 'published' && selectedClasses.length === 0) {
      setError('Selecione pelo menos uma turma antes de publicar.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = await saveLibraryPost({
        id: post?.id,
        autor_nome: authorName,
        titulo: title,
        conteudo_html: sanitizeRichText(content),
        conteudo_texto: richTextToPlainText(content),
        turma_ids: selectedClasses,
        attachments: attachments
          .filter((attachment) => !attachment.existing)
          .map(({ id, existing: _existing, ...attachment }) => ({ ...attachment, clientId: id })),
        removed_attachment_ids: removedAttachmentIds,
        attachment_order: attachments.map((attachment) => attachment.id),
        attachment_updates: attachments
          .filter((attachment) => Boolean(attachment.existing))
          .map((attachment) => ({
            id: attachment.id,
            title: attachment.title ?? '',
            description: attachment.description ?? '',
            ...(attachment.type === 'link' ? { type: 'link' as const, url: attachment.url ?? '' } : {}),
            ...(attachment.type === 'youtube' ? { type: 'youtube' as const, url: attachment.youtubeUrl ?? '' } : {}),
          })),
        status,
      });
      if (mountedRef.current) onSaved(saved);
    } catch (saveError) {
      if (mountedRef.current) setError(saveError instanceof Error ? saveError.message : 'Não consegui salvar a publicação.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <section className="library-composer" aria-labelledby="library-composer-title" aria-busy={saving || processing}>
      <div className="library-composer-heading">
        <div>
          <button type="button" className="btn-text" onClick={handleCancel} disabled={saving || processing}>← Voltar para a Biblioteca</button>
          <span className="library-section-kicker">{post ? 'Atualizar o mural' : 'Compartilhar com a turma'}</span>
          <h2 id="library-composer-title">{post ? 'Editar publicação' : 'Nova publicação'}</h2>
          <p>Conte o essencial, anexe os materiais e escolha quem receberá a publicação.</p>
        </div>
        <span className="library-composer-step">Publicação de {authorName}</span>
      </div>

      {error && <div className="dashboard-feedback dashboard-feedback-error" role="alert"><span>{error}</span></div>}

      <div className="library-composer-grid">
        <div className="library-composer-main">
          <div className="library-field-heading"><label className="library-field-label" htmlFor="library-title">Título da publicação</label><span>{title.length}/180</span></div>
          <input id="library-title" className="library-input library-title-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Ex.: Esquema de montagem — robô seguidor de linha" disabled={saving} autoFocus required />

          <label id="library-content-label" className="library-field-label" htmlFor="library-content">Mensagem para a turma <span className="library-optional">opcional</span></label>
          <RichTextEditor value={content} onChange={setContent} disabled={saving} />

          <div className="library-attachments-section">
            <div className="library-section-heading">
              <div>
                <h3>Materiais da aula</h3>
                <p>Adicione imagens, PDFs, vídeos e links na ordem em que os alunos devem consultá-los.</p>
              </div>
              <span>{attachmentCount}/{MAX_ATTACHMENTS_PER_POST}</span>
            </div>

            <label className={`library-upload-button${saving || processing || attachmentCount >= MAX_ATTACHMENTS_PER_POST ? ' is-disabled' : ''}`}>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={handleFiles} disabled={saving || processing || attachmentCount >= MAX_ATTACHMENTS_PER_POST} />
              <span aria-hidden="true">＋</span><span><strong>Adicionar imagens ou PDFs</strong><small>Imagens até 15 MB · PDFs até 25 MB</small></span>
            </label>

            {processing && <p className="library-composer-progress" role="status" aria-live="polite"><span className="library-spinner" aria-hidden="true" /> Preparando arquivos e conferindo a qualidade…</p>}

            <div className="library-youtube-add">
              <input className="library-input" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="Cole um link do YouTube" disabled={saving || processing || attachmentCount >= MAX_ATTACHMENTS_PER_POST} aria-label="Link do YouTube para adicionar" />
              <button type="button" className="btn-secondary" onClick={addYoutube} disabled={saving || processing || !youtubeUrl.trim() || attachmentCount >= MAX_ATTACHMENTS_PER_POST}>Adicionar vídeo</button>
            </div>
            {existingYoutubeError && <p className="library-inline-error" role="alert">{existingYoutubeError}</p>}

            <div className="library-youtube-add">
              <input className="library-input" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Cole um link de material externo" disabled={saving || processing || attachmentCount >= MAX_ATTACHMENTS_PER_POST} aria-label="Link de material externo para adicionar" />
              <button type="button" className="btn-secondary" onClick={addExternalLink} disabled={saving || processing || !linkUrl.trim() || attachmentCount >= MAX_ATTACHMENTS_PER_POST}>Adicionar link</button>
            </div>
            {linkError && <p className="library-inline-error" role="alert">{linkError}</p>}

            {attachments.map((attachment, index) => (
              <div className="library-draft-attachment" key={attachment.id}>
                {attachment.type === 'image' && attachment.previewUrl && <img src={attachment.previewUrl} alt={attachment.description ?? ''} />}
                {attachment.type === 'pdf' && attachment.previewUrl && <img src={attachment.previewUrl} alt="Prévia da primeira página do PDF" />}
                {attachment.type === 'youtube' && attachment.previewUrl && <img src={attachment.previewUrl} alt="" />}
                {attachment.type === 'youtube' && !attachment.previewUrl && <span className="library-attachment-icon">YT</span>}
                {attachment.type === 'link' && <span className="library-attachment-icon">↗</span>}
                <div className="library-attachment-fields">
                  {attachment.type === 'youtube' && <input value={attachment.youtubeUrl ?? ''} onChange={(event) => updateYoutubeUrl(attachment.id, event.target.value)} placeholder="URL do vídeo do YouTube" maxLength={2000} disabled={saving || processing} aria-label="URL do vídeo do YouTube" />}
                  {attachment.type === 'link' && <input value={attachment.url ?? ''} onChange={(event) => updateAttachment(attachment.id, { url: event.target.value })} placeholder="URL do material externo" maxLength={2000} disabled={saving || processing} aria-label="URL do link" />}
                  <input value={attachment.title ?? ''} onChange={(event) => updateAttachment(attachment.id, { title: event.target.value })} placeholder="Título ou legenda (opcional)" maxLength={180} disabled={saving || processing} aria-label="Título do anexo" />
                  <textarea value={attachment.description ?? ''} onChange={(event) => updateAttachment(attachment.id, { description: event.target.value })} placeholder={attachment.type === 'image' ? 'Texto alternativo ou descrição (opcional)' : 'Descrição (opcional)'} maxLength={500} disabled={saving || processing} aria-label="Descrição do anexo" />
                  <small>{attachment.existing ? 'Já publicado' : attachment.type === 'youtube' ? 'Vídeo do YouTube' : attachment.type === 'link' ? 'Link externo — não usa armazenamento' : attachment.type === 'pdf' ? `PDF — ${attachment.pdfPageCount ?? '…'} página(s)` : 'Imagem — versão nítida e original serão preservadas'}</small>
                </div>
                <div className="library-attachment-actions">
                  <button type="button" className="btn-ghost" onClick={() => moveAttachment(index, -1)} disabled={saving || processing || index === 0} aria-label="Mover anexo para cima">↑</button>
                  <button type="button" className="btn-ghost" onClick={() => moveAttachment(index, 1)} disabled={saving || processing || index === attachments.length - 1} aria-label="Mover anexo para baixo">↓</button>
                  <button type="button" className="btn-ghost" onClick={() => removeAttachment(attachment.id)} disabled={saving || processing} aria-label={`Remover ${attachment.title ?? 'anexo'}`}>×</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="library-composer-side">
          <span className="library-section-kicker">Publicar para</span>
          <div className="library-class-heading"><div><h3>Quem poderá acessar?</h3><p className="library-muted-label">{classSummary}</p></div>{classes.length > 1 && <button type="button" className="btn-text" onClick={toggleAllClasses} disabled={saving}>{selectedClasses.length === classes.length ? 'Desmarcar' : 'Todas'}</button>}</div>
          {classes.length === 0 ? <p className="library-empty-small">Você ainda não possui turmas.</p> : classes.map((classroom) => (
            <label className="library-class-option" key={classroom.id}>
              <input type="checkbox" checked={selectedClasses.includes(classroom.id)} onChange={() => toggleClass(classroom.id)} disabled={saving} />
              <span>{classroom.nome}<small>{classroom.ano_letivo}</small></span>
            </label>
          ))}

          <div className="library-publish-actions">
            <p><span aria-hidden="true">✓</span> Os alunos verão a publicação assim que você publicar.</p>
            <button type="button" className="btn-ghost" onClick={() => void handleSave('draft')} disabled={saving || processing || !title.trim()}>{saving ? 'Salvando…' : 'Salvar rascunho'}</button>
            <button type="button" className="btn-primary" onClick={() => void handleSave('published')} disabled={!canPublish}>{processing ? 'Preparando arquivos…' : saving ? 'Publicando…' : 'Publicar para as turmas'}</button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function getPostHtml(post?: LibraryPost | null): string {
  const value = post?.conteudo_json?.html;
  return typeof value === 'string' ? value : '';
}

function isComposerDirty({ post, title, content, selectedClasses, attachments, removedAttachmentIds }: {
  post?: LibraryPost | null;
  title: string;
  content: string;
  selectedClasses: string[];
  attachments: DraftAttachment[];
  removedAttachmentIds: string[];
}): boolean {
  if (title !== (post?.titulo ?? '') || content !== getPostHtml(post)) return true;
  const initialClasses = [...(post?.turma_ids ?? [])].sort();
  if ([...selectedClasses].sort().join('|') !== initialClasses.join('|')) return true;
  if (removedAttachmentIds.length > 0 || attachments.length !== (post?.anexos.length ?? 0)) return true;
  return attachments.some((attachment, index) => {
    const initial = post?.anexos[index];
    if (!initial || attachment.id !== initial.id) return true;
    return (attachment.title ?? '') !== (initial.titulo ?? '')
      || (attachment.description ?? '') !== (initial.descricao ?? '')
      || (attachment.type === 'youtube' && (attachment.youtubeUrl ?? '') !== (initial.external_url ?? ''))
      || (attachment.type === 'link' && (attachment.url ?? '') !== (initial.external_url ?? ''));
  });
}
