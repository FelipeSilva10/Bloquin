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
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O arquivo não contém um objeto JSON válido.');
  }
  const file = value as Partial<BloquinProjectFile>;
  if (file.format !== BLOQUIN_PROJECT_FORMAT) throw new Error('Este arquivo não é um projeto do Bloquin.');
  if (file.schemaVersion !== BLOQUIN_PROJECT_SCHEMA_VERSION) throw new Error(`Versão de projeto não suportada: ${file.schemaVersion ?? 'desconhecida'}.`);
  if (!file.project || typeof file.project !== 'object' || Array.isArray(file.project) || typeof file.project.name !== 'string' || !file.project.name.trim()) {
    throw new Error('O projeto não possui um nome válido.');
  }
  if (file.project.description !== undefined && typeof file.project.description !== 'string') {
    throw new Error('A descrição do projeto é inválida.');
  }
  if (file.project.targetBoard !== null && !SUPPORTED_BOARD_KEYS.has(file.project.targetBoard)) throw new Error('A placa deste projeto não é reconhecida.');
  if (!file.workspace || typeof file.workspace !== 'object' || Array.isArray(file.workspace)) {
    throw new Error('O workspace do projeto é inválido.');
  }

  const serializedBlocks = file.workspace.blocks;
  if (
    serializedBlocks !== undefined
    && (
      !serializedBlocks
      || typeof serializedBlocks !== 'object'
      || Array.isArray(serializedBlocks)
      || !Array.isArray((serializedBlocks as { blocks?: unknown }).blocks)
    )
  ) {
    throw new Error('A lista de blocos do projeto é inválida.');
  }
  return file as BloquinProjectFile;
}
