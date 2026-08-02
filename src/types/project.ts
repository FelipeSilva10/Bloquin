import type { BoardKey } from '../blockly/boards';

export const BLOQUIN_PROJECT_FORMAT = 'bloquin-project';
export const BLOQUIN_PROJECT_SCHEMA_VERSION = 1;
export const MAX_PROJECT_FILE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_BOARD_KEYS = new Set<BoardKey>(['uno', 'nano', 'esp32']);
const MAX_PROJECT_NODES = 100_000;
const MAX_PROJECT_DEPTH = 100;
const UNSAFE_JSON_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

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

interface ParseProjectFileOptions {
  fallbackName?: string;
}

function cleanProjectName(value: unknown, fallbackName?: string): string {
  const candidate = typeof value === 'string' ? value : '';
  const fallback = typeof fallbackName === 'string' ? fallbackName : 'Projeto importado';
  const cleaned = (candidate.trim() || fallback.trim() || 'Projeto importado')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return cleaned || 'Projeto importado';
}

function assertSafeJsonTree(root: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > MAX_PROJECT_NODES) throw new Error('O projeto é complexo demais para ser importado com segurança.');
    if (current.depth > MAX_PROJECT_DEPTH) throw new Error('O projeto possui níveis demais e não pode ser importado.');
    if (typeof current.value === 'number' && !Number.isFinite(current.value)) {
      throw new Error('O projeto contém um número inválido.');
    }
    if (!current.value || typeof current.value !== 'object') continue;

    for (const [key, child] of Object.entries(current.value)) {
      if (UNSAFE_JSON_KEYS.has(key)) throw new Error('O projeto contém uma propriedade não permitida.');
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
}

export function getProjectFallbackName(fileName?: string): string {
  if (!fileName) return 'Projeto importado';
  const baseName = fileName.split(/[\\/]/).pop()?.replace(/\.json$/i, '') ?? '';
  return cleanProjectName(baseName, 'Projeto importado');
}

export function parseProjectFile(value: unknown, options: ParseProjectFileOptions = {}): BloquinProjectFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O arquivo não contém um objeto JSON válido.');
  }
  const file = value as Partial<BloquinProjectFile>;
  if (file.format !== BLOQUIN_PROJECT_FORMAT) throw new Error('Este arquivo não é um projeto do Bloquin.');
  if (file.schemaVersion !== BLOQUIN_PROJECT_SCHEMA_VERSION) throw new Error(`Versão de projeto não suportada: ${file.schemaVersion ?? 'desconhecida'}.`);
  if (!file.project || typeof file.project !== 'object' || Array.isArray(file.project)) {
    throw new Error('O projeto não possui metadados válidos.');
  }
  if (file.project.description !== undefined && typeof file.project.description !== 'string') {
    throw new Error('A descrição do projeto é inválida.');
  }
  if (file.project.targetBoard !== null && !SUPPORTED_BOARD_KEYS.has(file.project.targetBoard)) throw new Error('A placa deste projeto não é reconhecida.');
  if (!file.workspace || typeof file.workspace !== 'object' || Array.isArray(file.workspace)) {
    throw new Error('O workspace do projeto é inválido.');
  }

  assertSafeJsonTree(file.workspace);

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
  return {
    ...(file as BloquinProjectFile),
    project: {
      ...(file.project as BloquinProjectFile['project']),
      name: cleanProjectName(file.project.name, options.fallbackName),
      description: file.project.description?.trim().slice(0, 300) ?? '',
    },
  };
}

export function parseProjectFileContents(contents: string, fileName?: string): BloquinProjectFile {
  if (!contents.trim()) throw new Error('O arquivo está vazio.');
  if (new TextEncoder().encode(contents).byteLength > MAX_PROJECT_FILE_BYTES) {
    throw new Error('O arquivo é muito grande. O limite para importação é 8 MB.');
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('O arquivo está corrompido ou não contém um JSON válido.');
  }
  return parseProjectFile(value, { fallbackName: getProjectFallbackName(fileName) });
}

export function makeUniqueProjectName(name: string, existingNames: Iterable<string>): string {
  const occupied = new Set(Array.from(existingNames, (item) => item.trim().toLocaleLowerCase('pt-BR')));
  if (!occupied.has(name.toLocaleLowerCase('pt-BR'))) return name;

  const suffix = ' (importado)';
  const base = name.slice(0, 80 - suffix.length).trim();
  let candidate = `${base}${suffix}`;
  let index = 2;
  while (occupied.has(candidate.toLocaleLowerCase('pt-BR'))) {
    const numberedSuffix = ` (importado ${index})`;
    candidate = `${name.slice(0, 80 - numberedSuffix.length).trim()}${numberedSuffix}`;
    index += 1;
  }
  return candidate;
}
