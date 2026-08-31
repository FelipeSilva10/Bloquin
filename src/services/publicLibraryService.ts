import { supabase } from '../lib/supabase';
import type { LibraryAttachment, LibraryPost } from '../types/library';
import { refreshLibraryPostPreviews, signLibraryPostContent } from './libraryService';

const POST_COLUMNS = 'id, autor_id, autor_nome, titulo, conteudo_json, conteudo_texto, status, capa_anexo_id, publicado_em, atualizado_em, criado_em, excluido_em';
const ATTACHMENT_COLUMNS = 'id, publicacao_id, tipo, provider, titulo, descricao, ordem, pode_baixar, mime_type, tamanho_bytes, largura, altura, quantidade_paginas, storage_path, thumbnail_path, original_path, external_url, external_id, status, criado_em';

/**
 * Publicações da turma marcada como pública (`turmas.publica = true`),
 * legíveis sem login. Mesmo formato de `fetchLibraryPosts`, mas sem `userId`
 * nem filtro de autoria — a política de leitura pública já restringe o
 * resultado no banco.
 */
export async function fetchPublicLibraryPosts(): Promise<LibraryPost[]> {
  const { data: targetRows, error: targetError } = await supabase
    .from('biblioteca_publicacao_turmas')
    .select('publicacao_id, turmas!inner(publica)')
    .eq('turmas.publica', true);
  if (targetError) throw targetError;

  const postIds = [...new Set((targetRows ?? []).map((row) => row.publicacao_id))];
  if (postIds.length === 0) return [];

  const { data: postRows, error: postError } = await supabase
    .from('biblioteca_publicacoes')
    .select(POST_COLUMNS)
    .in('id', postIds)
    .eq('status', 'published')
    .is('excluido_em', null)
    .order('publicado_em', { ascending: false, nullsFirst: false });
  if (postError) throw postError;

  const posts = (postRows ?? []) as LibraryPost[];
  if (posts.length === 0) return [];

  const { data: attachmentRows, error: attachmentError } = await supabase
    .from('biblioteca_anexos')
    .select(ATTACHMENT_COLUMNS)
    .in('publicacao_id', posts.map((post) => post.id))
    .order('ordem');
  if (attachmentError) throw attachmentError;

  const attachmentMap = new Map<string, LibraryAttachment[]>();
  for (const attachment of (attachmentRows ?? []) as LibraryAttachment[]) {
    const values = attachmentMap.get(attachment.publicacao_id) ?? [];
    values.push(attachment);
    attachmentMap.set(attachment.publicacao_id, values);
  }

  const hydrated = posts.map((post) => ({
    ...post,
    anexos: attachmentMap.get(post.id) ?? [],
    turma_ids: [] as string[],
  }));

  return refreshLibraryPostPreviews(hydrated);
}

export { signLibraryPostContent };
