import type { BoardKey } from '../blockly/boards';

export const BLOQUIN_PROJECT_FORMAT = 'bloquin-project';
export const BLOQUIN_PROJECT_SCHEMA_VERSION = 1;
const SUPPORTED_BOARD_KEYS = new Set<BoardKey>(['uno', 'nano', 'esp32']);

export interface BloquinProjectFile {
  format: typeof BLOQUIN_PROJECT_FORMAT;
  schemaVersion: number;
  project: {
    name: string;
    description?: string;
    targetBoard: BoardKey | null;
  };
  workspace: Record<string, unknown>;
}

export function createProjectFile(input: {
  name: string;
  targetBoard: BoardKey | null;
  workspace: Record<string, unknown>;
  description?: string;
}): BloquinProjectFile {
  return {
    format: BLOQUIN_PROJECT_FORMAT,
    schemaVersion: BLOQUIN_PROJECT_SCHEMA_VERSION,
    project: {
      name: input.name,
      description: input.description ?? '',
      targetBoard: input.targetBoard,
    },
    workspace: input.workspace,
  };
}

export function parseProjectFile(value: unknown): BloquinProjectFile {
  if (!value || typeof value !== 'object') throw new Error('O arquivo não contém um objeto JSON.');
  const file = value as Partial<BloquinProjectFile>;
  if (file.format !== BLOQUIN_PROJECT_FORMAT) throw new Error('Este arquivo não é um projeto do Bloquin.');
  if (file.schemaVersion !== BLOQUIN_PROJECT_SCHEMA_VERSION) throw new Error(`Versão de projeto não suportada: ${file.schemaVersion ?? 'desconhecida'}.`);
  if (!file.project || typeof file.project.name !== 'string') throw new Error('O projeto não possui um nome válido.');
  if (file.project.targetBoard !== null && !SUPPORTED_BOARD_KEYS.has(file.project.targetBoard)) throw new Error('A placa deste projeto não é reconhecida.');
  if (!file.workspace || typeof file.workspace !== 'object') throw new Error('O workspace do projeto é inválido.');
  return file as BloquinProjectFile;
}
