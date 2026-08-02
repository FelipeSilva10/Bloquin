import { BOARD_UNSET } from '../blockly/boards';
import { supabase } from '../lib/supabase';
import { makeUniqueProjectName, type BloquinProjectFile } from '../types/project';

export interface ImportedProject {
  id: string;
  nome: string;
  descricao?: string;
  target_board?: string;
  updated_at: string;
}

export async function importProjectToAccount(input: {
  file: BloquinProjectFile;
  userId: string;
  classroomId: string;
  existingNames: Iterable<string>;
  role: 'student' | 'teacher';
}): Promise<ImportedProject> {
  if (!input.userId) throw new Error('Sua sessão não foi encontrada. Entre novamente.');
  if (!input.classroomId) throw new Error('Selecione uma turma para importar o projeto.');

  const { data: currentProjects, error: namesError } = await supabase
    .from('projetos')
    .select('nome')
    .eq('dono_id', input.userId);
  if (namesError) throw new Error('Não foi possível conferir seus projetos atuais. Atualize o painel e tente novamente.');

  const name = makeUniqueProjectName(input.file.project.name, [
    ...input.existingNames,
    ...(currentProjects ?? []).map((project) => project.nome),
  ]);
  const { data, error } = await supabase
    .from('projetos')
    .insert([{
      dono_id: input.userId,
      turma_id: input.classroomId,
      nome: name,
      descricao: input.file.project.description ?? '',
      target_board: input.file.project.targetBoard ?? BOARD_UNSET,
      workspace_data: input.file.workspace,
      tipo: input.role === 'teacher' ? 'template_professor' : 'livre',
    }])
    .select('id, nome, descricao, target_board, updated_at')
    .single();

  if (error) {
    if (error.code === '42501') throw new Error('Sua sessão não permite importar este projeto para a turma selecionada.');
    if (error.code === '23503') throw new Error('A turma selecionada não está mais disponível. Atualize o painel e tente novamente.');
    throw new Error('Não foi possível salvar o projeto importado. Verifique sua conexão e tente novamente.');
  }
  if (!data) throw new Error('O projeto foi validado, mas não pôde ser criado na sua conta.');
  return data;
}
