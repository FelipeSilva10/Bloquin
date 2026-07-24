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
    const { error } = await supabase.from("projetos").delete().eq("id", projectId);
    if (error) throw error;
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw userError ?? new Error("Sessão não encontrada.");

    // 1. Confirma que a turma de destino é uma das turmas do professor.
    const { data: targetTurma, error: turmaError } = await supabase
      .from("turmas")
      .select("id")
      .eq("id", targetTurmaId)
      .eq("professor_id", user.id)
      .maybeSingle();
    if (turmaError) throw turmaError;
    if (!targetTurma) throw new Error("A turma selecionada não pertence ao professor.");

    // 2. Busca um projeto do próprio professor.
    const { data: source, error: fetchError } = await supabase
      .from("projetos")
      .select("nome, descricao, target_board, workspace_data")
      .eq("id", sourceProjectId)
      .eq("dono_id", user.id)
      .single();

    if (fetchError || !source) throw fetchError ?? new Error("Projeto não encontrado.");

    // 3. Confirma que todos os destinatários são alunos da turma aberta. Além
    // de evitar associações inconsistentes, isso protege chamadas acidentais
    // com IDs de outra turma.
    const uniqueTargetIds = [...new Set(targetUserIds)];
    const { data: students, error: studentsError } = await supabase
      .from("perfis")
      .select("id")
      .in("id", uniqueTargetIds)
      .eq("turma_id", targetTurmaId)
      .eq("role", "student");

    if (studentsError) throw studentsError;
    if ((students?.length ?? 0) !== uniqueTargetIds.length) {
      throw new Error("Um ou mais alunos não pertencem à turma selecionada.");
    }

    const copyName = newName ?? `[Compartilhado] ${source.nome}`;
    const now = new Date().toISOString();

    // 4. Cria uma cópia independente para cada aluno, sempre vinculada à turma
    // para a qual o professor está enviando o projeto.
    const copies = uniqueTargetIds.map((uid) => ({
      dono_id: uid,
      turma_id: targetTurmaId,
      nome: copyName,
      descricao: source.descricao ?? "",
      target_board: source.target_board,
      workspace_data: source.workspace_data,
      shared_from: sourceProjectId,
      created_at: now,
      updated_at: now,
    }));

    const { error: insertError } = await supabase.from("projetos").insert(copies);
    if (insertError) throw insertError;
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
