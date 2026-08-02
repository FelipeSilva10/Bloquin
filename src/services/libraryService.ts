import { supabase } from '../lib/supabase';
import type {
  LibraryAttachment,
  LibraryAttachmentInput,
  LibraryAttachmentType,
  LibraryClass,
  LibraryPost,
  LibraryPostInput,
  LibraryPostStatus,
} from '../types/library';
import {
  getYoutubePreviewUrl,
  LIBRARY_BUCKET,
  MAX_ATTACHMENTS_PER_POST,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_RICH_TEXT_CHARS,
  processImageFile,
  revokeMediaPreview,
  validatePdfFile,
} from './libraryMediaService';
import { normalizeExternalLink, normalizeYoutubeUrl } from './libraryValidation';

export { normalizeYoutubeUrl } from './libraryValidation';

const POST_COLUMNS = 'id, autor_id, autor_nome, titulo, conteudo_json, conteudo_texto, status, capa_anexo_id, publicado_em, atualizado_em, criado_em, excluido_em';
const ATTACHMENT_COLUMNS = 'id, publicacao_id, tipo, provider, titulo, descricao, ordem, pode_baixar, mime_type, tamanho_bytes, largura, altura, quantidade_paginas, storage_path, thumbnail_path, original_path, external_url, external_id, status, criado_em';

export interface LoadLibraryPostsOptions {
  userId: string;
  view: 'teacher' | 'student';
  search?: string;
  status?: LibraryPostStatus | 'all';
  turmaId?: string;
  attachmentType?: LibraryAttachmentType | 'all';
  limit?: number;
  offset?: number;
}

interface LibraryAuthorContext {
  id: string;
  name: string;
}

type LibraryPostRow = Omit<LibraryPost, 'anexos' | 'turma_ids' | 'media_signed_at'>;

interface ExistingLibraryPostSnapshot {
  post: LibraryPostRow;
  attachments: LibraryAttachment[];
  targetIds: string[];
}

function throwLibraryAccessError(error: unknown, operation = 'biblioteca'): never {
  const candidate = error as { code?: string; status?: number; message?: string } | null;
  const message = candidate?.message?.toLowerCase() ?? '';
  console.error('[Biblioteca] falha na operação Supabase', {
    operation,
    code: candidate?.code ?? null,
    status: candidate?.status ?? null,
    message: candidate?.message ?? String(error),
  });
  if (
    candidate?.code === '42501'
    || candidate?.status === 403
    || message.includes('row-level security')
  ) {
    throw new Error('Seu perfil não tem permissão para esta operação. Confirme que você está conectado como professor e tente novamente.');
  }
  throw error;
}

async function resolveLibraryAuthor(fallbackName: string): Promise<LibraryAuthorContext> {
  // getUser valida o JWT no Auth antes de qualquer escrita. O id retornado
  // aqui é a única identidade usada nas queries; o autor informado pelo
  // componente é apenas um dado de apresentação e nunca é confiável.
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('Sua sessão expirou. Entre novamente para publicar na Biblioteca.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('perfis')
    .select('id, nome, role')
    .eq('id', authData.user.id)
    .single();
  if (profileError) throwLibraryAccessError(profileError);
  if (!profile) {
    throw new Error('Não foi possível validar seu perfil para publicar na Biblioteca.');
  }
  if (profile.role !== 'teacher') {
    throw new Error('Apenas professores podem publicar materiais na Biblioteca.');
  }

  return {
    id: authData.user.id,
    name: typeof profile.nome === 'string' && profile.nome.trim()
      ? profile.nome.trim()
      : fallbackName.trim() || 'Professor',
  };
}

async function validateLibraryTargets(authorId: string, turmaIds: string[]): Promise<void> {
  if (turmaIds.length === 0) return;

  const { data, error } = await supabase
    .from('turmas')
    .select('id')
    .eq('professor_id', authorId)
    .in('id', turmaIds);
  if (error) throwLibraryAccessError(error);

  if ((data ?? []).length !== turmaIds.length) {
    throw new Error('Uma ou mais turmas selecionadas não pertencem ao professor autenticado. Atualize a página e tente novamente.');
  }
}

export async function fetchLibraryClasses(userId: string): Promise<LibraryClass[]> {
  const { data, error } = await supabase
    .from('turmas')
    .select('id, nome, ano_letivo')
    .eq('professor_id', userId)
    .order('created_at', { ascending: false });
  if (error) throwLibraryAccessError(error);
  return (data ?? []) as LibraryClass[];
}

export async function fetchLibraryPosts(options: LoadLibraryPostsOptions): Promise<LibraryPost[]> {
  const includeArchived = options.view === 'teacher' && options.status === 'archived';
  let query = supabase
    .from('biblioteca_publicacoes')
    .select(POST_COLUMNS)
    .order('publicado_em', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false });

  if (!includeArchived) query = query.is('excluido_em', null);

  if (options.view === 'teacher') {
    query = query.eq('autor_id', options.userId);
    if (options.status && options.status !== 'all') query = query.eq('status', options.status);
  } else {
    query = query.eq('status', 'published');
  }

  if (options.turmaId) {
    const { data: targetRows, error: targetError } = await supabase
      .from('biblioteca_publicacao_turmas')
      .select('publicacao_id')
      .eq('turma_id', options.turmaId);
    if (targetError) throwLibraryAccessError(targetError);
    const targetIds = (targetRows ?? []).map((row) => row.publicacao_id);
    if (targetIds.length === 0) return [];
    query = query.in('id', targetIds);
  }

  if (options.attachmentType && options.attachmentType !== 'all') {
    const { data: attachmentPostRows, error: attachmentFilterError } = await supabase
      .from('biblioteca_anexos')
      .select('publicacao_id')
      .eq('tipo', options.attachmentType);
    if (attachmentFilterError) throwLibraryAccessError(attachmentFilterError);
    const attachmentPostIds = [...new Set((attachmentPostRows ?? []).map((row) => row.publicacao_id))];
    if (attachmentPostIds.length === 0) return [];
    query = query.in('id', attachmentPostIds);
  }

  const search = options.search?.trim();
  if (search) {
    const escapedSearch = escapePostgrestSearch(search);
    query = query.or(`titulo.ilike.%${escapedSearch}%,conteudo_texto.ilike.%${escapedSearch}%`);
  }
  if (options.limit !== undefined) {
    const offset = options.offset ?? 0;
    query = query.range(offset, offset + Math.max(1, options.limit) - 1);
  }

  const { data: postRows, error: postError } = await query;
  if (postError) throwLibraryAccessError(postError);
  const posts = (postRows ?? []) as LibraryPost[];
  if (posts.length === 0) return [];

  const postIds = posts.map((post) => post.id);
  const [{ data: attachmentRows, error: attachmentError }, { data: targetRows, error: targetError }] = await Promise.all([
    supabase.from('biblioteca_anexos').select(ATTACHMENT_COLUMNS).in('publicacao_id', postIds).order('ordem'),
    supabase.from('biblioteca_publicacao_turmas').select('publicacao_id, turma_id').in('publicacao_id', postIds),
  ]);
  if (attachmentError) throwLibraryAccessError(attachmentError);
  if (targetError) throwLibraryAccessError(targetError);

  const attachments = (attachmentRows ?? []) as LibraryAttachment[];
  const targetMap = new Map<string, string[]>();
  for (const row of targetRows ?? []) {
    const values = targetMap.get(row.publicacao_id) ?? [];
    values.push(row.turma_id);
    targetMap.set(row.publicacao_id, values);
  }

  await addSignedMediaUrlsBestEffort(attachments);
  const attachmentMap = new Map<string, LibraryAttachment[]>();
  for (const attachment of attachments) {
    const values = attachmentMap.get(attachment.publicacao_id) ?? [];
    values.push(attachment);
    attachmentMap.set(attachment.publicacao_id, values);
  }

  const hydratedPosts = posts.map((post) => ({
    ...post,
    anexos: attachmentMap.get(post.id) ?? [],
    turma_ids: targetMap.get(post.id) ?? [],
    media_signed_at: Date.now(),
  }));

  return hydratedPosts;
}

export async function signLibraryPostContent(post: LibraryPost): Promise<LibraryPost> {
  const attachments = post.anexos.map((attachment) => ({ ...attachment }));
  await addSignedMediaUrls(attachments, true);
  return { ...post, anexos: attachments, media_signed_at: Date.now() };
}

export async function refreshLibraryPostPreviews(posts: LibraryPost[]): Promise<LibraryPost[]> {
  const refreshed = posts.map((post) => ({
    ...post,
    anexos: post.anexos.map((attachment) => ({ ...attachment })),
  }));
  const attachments = refreshed.flatMap((post) => post.anexos);
  await addSignedMediaUrls(attachments, false);
  const signedAt = Date.now();
  return refreshed.map((post) => ({ ...post, media_signed_at: signedAt }));
}

export async function saveLibraryPost(input: LibraryPostInput): Promise<LibraryPost> {
  const author = await resolveLibraryAuthor(input.autor_nome);
  const turmaIds = [...new Set(input.turma_ids.filter(Boolean))];
  const postId = input.id ?? crypto.randomUUID();
  let existing: ExistingLibraryPostSnapshot | null = null;

  await validateLibraryTargets(author.id, turmaIds);

  for (const update of input.attachment_updates ?? []) {
    if (update.type === 'youtube') {
      if (!normalizeYoutubeUrl(update.url ?? '')) throw new Error('Informe uma URL válida do YouTube.');
    } else if (update.url !== undefined && !normalizeExternalLink(update.url)) {
      throw new Error('Informe um link externo válido começando com http:// ou https://.');
    }
  }

  if (input.id) {
    existing = await fetchLibraryPostSnapshot(input.id);
  }

  if (input.titulo.trim().length > 180) throw new Error('O título deve ter no máximo 180 caracteres.');
  if (input.conteudo_html.length > MAX_RICH_TEXT_CHARS || input.conteudo_texto.length > MAX_RICH_TEXT_CHARS) {
    throw new Error('O conteúdo da publicação é muito longo. Reduza o texto antes de salvar.');
  }
  if (input.attachments.length > MAX_ATTACHMENTS_PER_POST) {
    throw new Error(`Cada publicação pode ter no máximo ${MAX_ATTACHMENTS_PER_POST} anexos.`);
  }

  if (input.id) {
    const removedIdSet = new Set(input.removed_attachment_ids ?? []);
    const removedCount = existing?.attachments.filter((attachment) => removedIdSet.has(attachment.id)).length ?? 0;
    if ((existing?.attachments.length ?? 0) - removedCount + input.attachments.length > MAX_ATTACHMENTS_PER_POST) {
      throw new Error(`Cada publicação pode ter no máximo ${MAX_ATTACHMENTS_PER_POST} anexos.`);
    }
  }

  if (input.status === 'published' && turmaIds.length === 0) {
    throw new Error('Selecione pelo menos uma turma antes de publicar.');
  }

  const publishedAt = input.status === 'published'
    ? existing?.post.publicado_em ?? new Date().toISOString()
    : null;

  const postFields = {
      autor_id: author.id,
      autor_nome: author.name,
      titulo: input.titulo.trim(),
      conteudo_json: { html: input.conteudo_html },
      conteudo_texto: input.conteudo_texto.trim(),
      status: input.status,
      publicado_em: publishedAt,
      atualizado_em: new Date().toISOString(),
      excluido_em: null,
  };

  if (input.id) {
    const { error: postError } = await supabase
      .from('biblioteca_publicacoes')
      .update(postFields)
      .eq('id', postId);
    if (postError) throwLibraryAccessError(postError, 'biblioteca_publicacoes.update');
  } else {
    const { error: postError } = await supabase
      .from('biblioteca_publicacoes')
      .insert({ id: postId, ...postFields });
    if (postError) throwLibraryAccessError(postError, 'biblioteca_publicacoes.insert');
  }

  const uploadedPaths: string[] = [];
  const newAttachmentIds = new Map<string, string>();
  const createdAttachmentIds: string[] = [];
  let removedRows: LibraryAttachment[] = [];
  try {
    const removedIds = input.removed_attachment_ids ?? [];
    const removedIdSet = new Set(removedIds);
    removedRows = existing?.attachments.filter((attachment) => removedIdSet.has(attachment.id)) ?? [];

    for (const attachment of input.attachments) {
      const attachmentId = crypto.randomUUID();
      createdAttachmentIds.push(attachmentId);
      const saved = await uploadAttachment({ attachment, attachmentId, userId: author.id, postId, uploadedPaths });
      if (attachment.clientId) newAttachmentIds.set(attachment.clientId, saved.id);
    }

    if (removedRows.length > 0) {
      const { error: removeError } = await supabase
        .from('biblioteca_anexos')
        .delete()
        .eq('publicacao_id', postId)
        .in('id', removedRows.map((row) => row.id));
      if (removeError) throwLibraryAccessError(removeError);
    }

    if (input.attachment_updates && input.attachment_updates.length > 0) {
      await Promise.all(input.attachment_updates.map((update) => {
        const youtube = update.type === 'youtube' ? normalizeYoutubeUrl(update.url ?? '') : null;
        const normalizedUrl = update.url === undefined ? undefined : normalizeExternalLink(update.url);
        return supabase
          .from('biblioteca_anexos')
          .update({
            titulo: update.title.trim() || null,
            descricao: update.description.trim() || null,
            ...(youtube ? { external_url: youtube.url, external_id: youtube.id, provider: 'youtube' } : {}),
            ...(!youtube && normalizedUrl ? { external_url: normalizedUrl } : {}),
          })
          .eq('publicacao_id', postId)
          .eq('id', update.id)
          .then(({ error }) => { if (error) throwLibraryAccessError(error); });
      }));
    }

    const { error: targetDeleteError } = await supabase.from('biblioteca_publicacao_turmas').delete().eq('publicacao_id', postId);
    if (targetDeleteError) throwLibraryAccessError(targetDeleteError);
    if (turmaIds.length > 0) {
      const { error: targetError } = await supabase.from('biblioteca_publicacao_turmas').insert(
        turmaIds.map((turmaId) => ({ publicacao_id: postId, turma_id: turmaId })),
      );
      if (targetError) throwLibraryAccessError(targetError);
    }

    const { data: remainingRows, error: remainingError } = await supabase
      .from('biblioteca_anexos')
      .select('id, ordem, storage_path, thumbnail_path, original_path')
      .eq('publicacao_id', postId)
      .order('ordem')
      .order('criado_em');
    if (remainingError) throwLibraryAccessError(remainingError);

    const remainingIds = new Set((remainingRows ?? []).map((row) => row.id));
    const requestedOrder = (input.attachment_order ?? [])
      .map((reference) => newAttachmentIds.get(reference) ?? reference)
      .filter((id, index, values) => remainingIds.has(id) && values.indexOf(id) === index);
    const orderedIds = [
      ...requestedOrder,
      ...(remainingRows ?? []).map((row) => row.id).filter((id) => !requestedOrder.includes(id)),
    ];

    await Promise.all(orderedIds.map((attachmentId, order) => supabase
      .from('biblioteca_anexos')
      .update({ ordem: order })
      .eq('publicacao_id', postId)
      .eq('id', attachmentId)
      .then(({ error }) => { if (error) throwLibraryAccessError(error); })));

    const { error: coverError } = await supabase
      .from('biblioteca_publicacoes')
      .update({ capa_anexo_id: orderedIds[0] ?? null })
      .eq('id', postId);
    if (coverError) throwLibraryAccessError(coverError);
  } catch (error) {
    const databaseRestored = existing
      ? await restoreLibraryPostSnapshot(postId, existing, createdAttachmentIds)
      : await rollbackNewLibraryPost(postId);
    if (databaseRestored && uploadedPaths.length > 0) {
      await removeLibraryObjects(uploadedPaths);
    } else if (uploadedPaths.length > 0) {
      console.warn('As mídias recém-enviadas foram preservadas porque a reversão do banco não pôde ser confirmada.');
    }
    throw error;
  }

  if (removedRows.length > 0) {
    await removeLibraryObjects(removedRows.flatMap(getAttachmentPaths));
  }

  return fetchLibraryPostById(postId);
}

async function fetchLibraryPostById(postId: string): Promise<LibraryPost> {
  const [postResult, attachmentResult, targetResult] = await Promise.all([
    supabase.from('biblioteca_publicacoes').select(POST_COLUMNS).eq('id', postId).single(),
    supabase.from('biblioteca_anexos').select(ATTACHMENT_COLUMNS).eq('publicacao_id', postId).order('ordem'),
    supabase.from('biblioteca_publicacao_turmas').select('turma_id').eq('publicacao_id', postId),
  ]);
  if (postResult.error) throwLibraryAccessError(postResult.error);
  if (attachmentResult.error) throwLibraryAccessError(attachmentResult.error);
  if (targetResult.error) throwLibraryAccessError(targetResult.error);

  const attachments = (attachmentResult.data ?? []) as LibraryAttachment[];
  await addSignedMediaUrlsBestEffort(attachments);
  return {
    ...(postResult.data as LibraryPostRow),
    anexos: attachments,
    turma_ids: (targetResult.data ?? []).map((target) => target.turma_id),
    media_signed_at: Date.now(),
  };
}

async function fetchLibraryPostSnapshot(postId: string): Promise<ExistingLibraryPostSnapshot> {
  const [postResult, attachmentResult, targetResult] = await Promise.all([
    supabase.from('biblioteca_publicacoes').select(POST_COLUMNS).eq('id', postId).single(),
    supabase.from('biblioteca_anexos').select(ATTACHMENT_COLUMNS).eq('publicacao_id', postId).order('ordem'),
    supabase.from('biblioteca_publicacao_turmas').select('turma_id').eq('publicacao_id', postId),
  ]);
  if (postResult.error) throwLibraryAccessError(postResult.error);
  if (attachmentResult.error) throwLibraryAccessError(attachmentResult.error);
  if (targetResult.error) throwLibraryAccessError(targetResult.error);
  return {
    post: postResult.data as LibraryPostRow,
    attachments: (attachmentResult.data ?? []) as LibraryAttachment[],
    targetIds: (targetResult.data ?? []).map((target) => target.turma_id),
  };
}

function getAttachmentPaths(attachment: LibraryAttachment): string[] {
  return [attachment.storage_path, attachment.thumbnail_path, attachment.original_path].filter((path): path is string => Boolean(path));
}

async function removeLibraryObjectsStrict(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(LIBRARY_BUCKET).remove(paths);
  if (error) throwLibraryAccessError(error);
}

async function rollbackNewLibraryPost(postId: string): Promise<boolean> {
  const { error } = await supabase
    .from('biblioteca_publicacoes')
    .delete()
    .eq('id', postId);
  if (error) {
    console.warn('Não foi possível reverter a publicação incompleta da Biblioteca.', error);
    return false;
  }
  return true;
}

async function restoreLibraryPostSnapshot(
  postId: string,
  snapshot: ExistingLibraryPostSnapshot,
  createdAttachmentIds: string[],
): Promise<boolean> {
  try {
    if (createdAttachmentIds.length > 0) {
      const { error } = await supabase
        .from('biblioteca_anexos')
        .delete()
        .eq('publicacao_id', postId)
        .in('id', createdAttachmentIds);
      if (error) throwLibraryAccessError(error, 'biblioteca_anexos.rollback_new');
    }

    if (snapshot.attachments.length > 0) {
      const { error } = await supabase
        .from('biblioteca_anexos')
        .upsert(snapshot.attachments, { onConflict: 'id' });
      if (error) throwLibraryAccessError(error, 'biblioteca_anexos.rollback_snapshot');
    }

    const { error: targetDeleteError } = await supabase
      .from('biblioteca_publicacao_turmas')
      .delete()
      .eq('publicacao_id', postId);
    if (targetDeleteError) throwLibraryAccessError(targetDeleteError, 'biblioteca_publicacao_turmas.rollback_delete');

    if (snapshot.targetIds.length > 0) {
      const { error: targetInsertError } = await supabase
        .from('biblioteca_publicacao_turmas')
        .insert(snapshot.targetIds.map((turmaId) => ({ publicacao_id: postId, turma_id: turmaId })));
      if (targetInsertError) throwLibraryAccessError(targetInsertError, 'biblioteca_publicacao_turmas.rollback_insert');
    }

    const { id: _id, criado_em: _createdAt, ...postFields } = snapshot.post;
    const { error: postError } = await supabase
      .from('biblioteca_publicacoes')
      .update(postFields)
      .eq('id', postId);
    if (postError) throwLibraryAccessError(postError, 'biblioteca_publicacoes.rollback_snapshot');
    return true;
  } catch (rollbackError) {
    console.warn('Não foi possível restaurar integralmente a edição anterior da Biblioteca.', rollbackError);
    return false;
  }
}

export async function archiveLibraryPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('biblioteca_publicacoes')
    .update({ status: 'archived', excluido_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
    .eq('id', postId);
  if (error) throwLibraryAccessError(error);
}

export async function restoreLibraryPost(postId: string): Promise<void> {
  const { data, error: selectError } = await supabase
    .from('biblioteca_publicacoes')
    .select('publicado_em')
    .eq('id', postId)
    .single();
  if (selectError) throwLibraryAccessError(selectError);

  const { error } = await supabase
    .from('biblioteca_publicacoes')
    .update({
      status: data.publicado_em ? 'published' : 'draft',
      excluido_em: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', postId);
  if (error) throwLibraryAccessError(error);
}

export async function permanentlyDeleteLibraryPost(postId: string): Promise<void> {
  const { data, error: attachmentError } = await supabase
    .from('biblioteca_anexos')
    .select('storage_path, thumbnail_path, original_path')
    .eq('publicacao_id', postId);
  if (attachmentError) throwLibraryAccessError(attachmentError);

  const paths = (data ?? []).flatMap((attachment) => [attachment.storage_path, attachment.thumbnail_path, attachment.original_path].filter((path): path is string => Boolean(path)));
  const { error } = await supabase
    .from('biblioteca_publicacoes')
    .delete()
    .eq('id', postId);
  if (error) throwLibraryAccessError(error);
  await removeLibraryObjects(paths);
}

export async function removeLibraryObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await removeLibraryObjectsStrict(paths);
  } catch (error) {
    console.warn('Não foi possível limpar mídias temporárias da Biblioteca.', error);
  }
}

async function uploadAttachment({
  attachment,
  attachmentId,
  userId,
  postId,
  uploadedPaths,
}: {
  attachment: LibraryAttachmentInput;
  attachmentId: string;
  userId: string;
  postId: string;
  uploadedPaths: string[];
}): Promise<{ id: string }> {
  if (attachment.type === 'link') {
    const normalizedUrl = normalizeExternalLink(attachment.url ?? '');
    if (!normalizedUrl) throw new Error('Informe um link externo válido começando com http:// ou https://.');
    const { error } = await supabase.from('biblioteca_anexos').insert({
      id: attachmentId,
      publicacao_id: postId,
      tipo: 'link',
      provider: 'external',
      titulo: attachment.title?.trim() || new URL(normalizedUrl).hostname,
      descricao: attachment.description?.trim() || null,
      ordem: attachment.order,
      pode_baixar: false,
      external_url: normalizedUrl,
      status: 'ready',
    });
    if (error) throwLibraryAccessError(error);
    return { id: attachmentId };
  }

  if (attachment.type === 'youtube') {
    const parsed = normalizeYoutubeUrl(attachment.youtubeUrl ?? '');
    if (!parsed) throw new Error('Informe uma URL válida do YouTube.');
    const { error } = await supabase.from('biblioteca_anexos').insert({
      id: attachmentId,
      publicacao_id: postId,
      tipo: 'youtube',
      provider: 'youtube',
      titulo: attachment.title?.trim() || 'Vídeo do YouTube',
      descricao: attachment.description?.trim() || null,
      ordem: attachment.order,
      pode_baixar: false,
      external_url: parsed.url,
      external_id: parsed.id,
      status: 'ready',
    });
    if (error) throwLibraryAccessError(error);
    return { id: attachmentId };
  }

  if (!attachment.file) throw new Error('O anexo selecionado não está disponível.');

  let sourceFile: File;
  let thumbnailFile: File;
  let originalFile: File | null = null;
  let metadata: Record<string, unknown>;

  if (attachment.type === 'image') {
    const processed = await processImageFile(attachment.file);
    sourceFile = processed.display;
    thumbnailFile = processed.thumbnail;
    originalFile = processed.original;
    metadata = { largura: processed.width, altura: processed.height, mime_type: sourceFile.type };
  } else {
    if (attachment.file.size > MAX_PDF_BYTES || (attachment.file.type !== 'application/pdf' && !attachment.file.name.toLowerCase().endsWith('.pdf'))) {
      throw new Error(`O PDF deve ter no máximo 25 MB e possuir um formato válido.`);
    }
    const header = await attachment.file.slice(0, 5).text();
    if (header !== '%PDF-') throw new Error('O arquivo selecionado não parece ser um PDF válido.');

    if (attachment.pdfPageCount && attachment.pdfPageCount > MAX_PDF_PAGES) {
      throw new Error(`O PDF deve ter no máximo ${MAX_PDF_PAGES} páginas.`);
    }

    if (attachment.pdfThumbnail && attachment.pdfPageCount) {
      sourceFile = attachment.file;
      thumbnailFile = attachment.pdfThumbnail;
      metadata = { mime_type: 'application/pdf', quantidade_paginas: attachment.pdfPageCount };
    } else {
      const validated = await validatePdfFile(attachment.file);
      sourceFile = validated.file;
      thumbnailFile = validated.thumbnail;
      metadata = { mime_type: 'application/pdf', quantidade_paginas: validated.pageCount };
      revokeMediaPreview(validated.previewUrl);
    }
  }

  const sourceExtension = attachment.type === 'image' ? 'webp' : 'pdf';
  const basePath = `${userId}/${postId}/${attachmentId}`;
  const sourcePath = `${basePath}/arquivo.${sourceExtension}`;
  const thumbnailPath = `${basePath}/thumbnail.webp`;
  const originalPath = originalFile ? `${basePath}/original.${getImageExtension(originalFile.type)}` : null;
  uploadedPaths.push(sourcePath, thumbnailPath, ...(originalPath ? [originalPath] : []));

  const uploadResults = await Promise.all([
    supabase.storage.from(LIBRARY_BUCKET).upload(sourcePath, sourceFile, {
      contentType: sourceFile.type,
      cacheControl: '31536000',
      upsert: false,
    }),
    supabase.storage.from(LIBRARY_BUCKET).upload(thumbnailPath, thumbnailFile, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    }),
    ...(originalFile && originalPath ? [supabase.storage.from(LIBRARY_BUCKET).upload(originalPath, originalFile, {
      contentType: originalFile.type,
      cacheControl: '31536000',
      upsert: false,
    })] : []),
  ]);
  const failedUpload = uploadResults.find((result) => result.error)?.error;
  if (failedUpload) throwLibraryAccessError(failedUpload);

  const { error: attachmentError } = await supabase.from('biblioteca_anexos').insert({
    id: attachmentId,
    publicacao_id: postId,
    tipo: attachment.type,
    titulo: attachment.title?.trim() || null,
    descricao: attachment.description?.trim() || null,
    ordem: attachment.order,
    pode_baixar: true,
    storage_path: sourcePath,
    thumbnail_path: thumbnailPath,
    original_path: originalPath,
    tamanho_bytes: sourceFile.size,
    status: 'ready',
    ...metadata,
  });
  if (attachmentError) throwLibraryAccessError(attachmentError);
  return { id: attachmentId };
}

function escapePostgrestSearch(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[%_(),*]/g, '\\$&');
}

async function addSignedMediaUrls(attachments: LibraryAttachment[], includeContent: boolean): Promise<void> {
  const paths = attachments.flatMap((attachment) => [
    attachment.thumbnail_path,
    includeContent ? attachment.storage_path : null,
    includeContent ? attachment.original_path : null,
  ].filter((path): path is string => Boolean(path)));
  if (paths.length > 0) {
    const { data, error } = await supabase.storage.from(LIBRARY_BUCKET).createSignedUrls(paths, 3600);
    if (error) throwLibraryAccessError(error);
    const signedMap = new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
    attachments.forEach((attachment) => {
      if (attachment.thumbnail_path) attachment.thumbnail_url = signedMap.get(attachment.thumbnail_path);
      if (attachment.storage_path) attachment.content_url = signedMap.get(attachment.storage_path);
      attachment.download_url = attachment.original_path
        ? signedMap.get(attachment.original_path)
        : attachment.content_url;
      if (attachment.tipo === 'youtube' && attachment.external_id) attachment.thumbnail_url = getYoutubePreviewUrl(attachment.external_id);
    });
  } else {
    attachments.forEach((attachment) => {
      if (attachment.tipo === 'youtube' && attachment.external_id) attachment.thumbnail_url = getYoutubePreviewUrl(attachment.external_id);
    });
  }
}

async function addSignedMediaUrlsBestEffort(attachments: LibraryAttachment[]): Promise<void> {
  try {
    await addSignedMediaUrls(attachments, false);
  } catch (error) {
    // Uma oscilação no Storage não deve transformar uma publicação já salva
    // em falha nem esconder todo o mural. Os leitores renovam os endereços ao
    // abrir o material e exibem uma tentativa explícita quando necessário.
    console.warn('A Biblioteca foi carregada sem algumas prévias de mídia.', error);
  }
}

function getImageExtension(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
