import { supabase } from '../lib/supabase';

export interface LibraryReadState {
  visualizado_em: string;
  visto_atualizado_em: string;
}

export async function fetchLibraryReadStates(postIds: string[]): Promise<Record<string, LibraryReadState>> {
  if (postIds.length === 0) return {};
  const { data, error } = await supabase
    .from('biblioteca_leituras')
    .select('publicacao_id, visualizado_em, visto_atualizado_em')
    .in('publicacao_id', postIds);
  if (error) {
    console.warn('[Biblioteca] não foi possível carregar o status de leitura.', error);
    return {};
  }
  const states: Record<string, LibraryReadState> = {};
  for (const row of data ?? []) {
    states[row.publicacao_id] = { visualizado_em: row.visualizado_em, visto_atualizado_em: row.visto_atualizado_em };
  }
  return states;
}

// Silencioso de propósito: marcar como lida é um efeito colateral da leitura,
// não deve bloquear a UI nem exibir erro ao aluno se falhar.
export async function markLibraryPostAsRead(postId: string, postUpdatedAt: string): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return;
  const { error } = await supabase
    .from('biblioteca_leituras')
    .upsert(
      {
        publicacao_id: postId,
        aluno_id: authData.user.id,
        visualizado_em: new Date().toISOString(),
        visto_atualizado_em: postUpdatedAt,
      },
      { onConflict: 'publicacao_id,aluno_id' },
    );
  if (error) console.warn('[Biblioteca] não foi possível registrar a leitura da publicação.', error);
}
