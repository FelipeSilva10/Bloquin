import { supabase } from '../lib/supabase';
import type { BoardKey } from '../blockly/boards';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  nome: string;
  descricao?: string;
  target_board?: string;
  dono_id: string;
  turma_id: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// PROJECT SERVICE ALINHADO AO BANCO DE DADOS
// ============================================================================

export const ProjectService = {
  
  // ─── FUNÇÕES ORIGINAIS (Blocos e Placa) ───────────────────────────────────

  // Vai buscar os dados iniciais do projeto
  async getProjectData(projectId: string) {
    return await supabase
      .from('projetos')
      .select('nome, target_board, workspace_data')
      .eq('id', projectId)
      .single();
  },

  // Atualiza apenas a placa selecionada
  async updateBoard(projectId: string, board: BoardKey) {
    return await supabase
      .from('projetos')
      .update({ target_board: board })
      .eq('id', projectId);
  },

  // Guarda o progresso total do projeto (blocos e placa)
  async saveProject(projectId: string, board: BoardKey, workspaceData64: string) {
    return await supabase
      .from('projetos')
      .update({
        workspace_data: workspaceData64,
        target_board: board,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);
  },

  // ─── NOVAS FUNÇÕES (Gerenciamento de Professor e Turma) ───────────────────

  /**
   * Atualiza nome e descrição de um projeto.
   */
  async updateProjectMeta(projectId: string, nome: string, descricao: string): Promise<void> {
    const { error } = await supabase
      .from("projetos")
      .update({ nome, descricao, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    if (error) throw error;
  },

  /**
   * Deleta um projeto (professor pode deletar projeto de aluno)
   */
  async deleteProject(projectId: string): Promise<void> {
    const { data, error } = await supabase.rpc('delete_project', {
      p_project_id: projectId,
    });

    if (error) throw error;
    if (!data) {
      throw new Error('O projeto não foi encontrado ou você não tem permissão para excluí-lo.');
    }
  },

  /**
   * Copia um projeto para um aluno específico ou para todos da turma.
   * Cada cópia é independente — não há vínculo com o original.
   */
  async shareProject(
    sourceProjectId: string,
    targetUserIds: string[],
    targetTurmaId: string,
    newName?: string,
  ): Promise<void> {
    if (targetUserIds.length === 0) return;

    const { data, error } = await supabase.rpc('share_project', {
      p_source_project_id: sourceProjectId,
      p_target_user_ids: targetUserIds,
      p_target_turma_id: targetTurmaId,
      p_new_name: newName ?? null,
    });

    if (error) throw error;
    if (!data || data.length !== new Set(targetUserIds).size) {
      throw new Error('O projeto não foi compartilhado com todos os alunos selecionados.');
    }
  },

  /**
   * Busca todos os alunos de uma turma pelo turma_id.
   * Retorna lista de { id, nome } para popular o seletor de destinatários.
   */
  async getClassroomStudents(turmaId: string): Promise<{ id: string; nome: string }[]> {
    const { data, error } = await supabase
      .from("perfis")                     // No seu banco é 'perfis'
      .select("id, nome")                 // No seu banco é 'nome'
      .eq("turma_id", turmaId)            // No seu banco é 'turma_id'
      .eq("role", "student")
      .order("nome");

    if (error) throw error;
    return data ?? [];
  },

  /**
   * Busca projetos de um aluno específico (para o professor visualizar).
   */
  async getStudentProjects(studentId: string): Promise<ProjectMeta[]> {
    const { data, error } = await supabase
      .from("projetos")
      .select("id, nome, descricao, target_board, dono_id, turma_id, created_at, updated_at")
      .eq("dono_id", studentId)           // Filtra pelo dono_id
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
  }
};
