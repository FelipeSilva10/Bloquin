import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import type { BoardKey } from '../blockly/boards';
import { getProjectThumbnailColours } from '../blockly/blockThumbnail';
import { type BloquinProjectFile, createProjectFile, makeUniqueProjectName, parseProjectFileContents } from '../types/project';

const PROJECTS_DIR_NAME = 'projects';

export interface LocalProjectSummary {
  filePath: string;
  name: string;
  targetBoard: BoardKey | null;
  updatedAt: string | null;
  /** Cores de categoria dos blocos usados no projeto — miniatura do card. Vazio quando não há blocos suficientes. */
  thumbnailColours: string[];
}

let projectsDirPromise: Promise<string> | null = null;

async function resolveProjectsDir(): Promise<string> {
  const base = await appLocalDataDir();
  const dir = await join(base, PROJECTS_DIR_NAME);
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return dir;
}

// Memoizado: toda leitura/escrita local passa por aqui, então resolver e criar
// a pasta uma única vez por sessão evita um mkdir redundante a cada chamada.
function getProjectsDir(): Promise<string> {
  if (!projectsDirPromise) projectsDirPromise = resolveProjectsDir();
  return projectsDirPromise;
}

export async function listLocalProjects(): Promise<{ projects: LocalProjectSummary[]; corruptedCount: number }> {
  const dir = await getProjectsDir();
  const entries = await readDir(dir);
  const projects: LocalProjectSummary[] = [];
  let corruptedCount = 0;

  for (const entry of entries) {
    if (!entry.isFile || !entry.name.toLowerCase().endsWith('.json')) continue;
    const filePath = await join(dir, entry.name);
    try {
      const contents = await readTextFile(filePath);
      const parsed = parseProjectFileContents(contents, entry.name);
      projects.push({
        filePath,
        name: parsed.project.name,
        targetBoard: parsed.project.targetBoard,
        updatedAt: parsed.updatedAt ?? null,
        thumbnailColours: getProjectThumbnailColours(parsed.workspace),
      });
    } catch {
      // Um arquivo corrompido não deve impedir a listagem dos demais projetos.
      corruptedCount += 1;
    }
  }

  projects.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return { projects, corruptedCount };
}

export async function createLocalProject(
  name: string,
  board: BoardKey | null,
): Promise<{ filePath: string; file: BloquinProjectFile }> {
  const dir = await getProjectsDir();
  const filePath = await join(dir, `${crypto.randomUUID()}.json`);
  const file = createProjectFile({
    name,
    targetBoard: board,
    workspace: {},
    updatedAt: new Date().toISOString(),
  });
  await writeTextFile(filePath, JSON.stringify(file, null, 2));
  return { filePath, file };
}

export async function writeLocalProject(filePath: string, file: BloquinProjectFile): Promise<void> {
  const stamped: BloquinProjectFile = { ...file, updatedAt: new Date().toISOString() };
  await writeTextFile(filePath, JSON.stringify(stamped, null, 2));
}

/** Verdadeiro apenas para arquivos que já moram na pasta gerenciada de projetos locais. */
export async function isPersistedProjectPath(filePath: string): Promise<boolean> {
  const [dir, parent] = await Promise.all([getProjectsDir(), dirname(filePath)]);
  return parent === dir;
}

/**
 * Grava um projeto local reaproveitando a mesma pasta/identidade (por
 * caminho de arquivo) usada por "Criar novo projeto": se `filePath` já está
 * na pasta gerenciada, atualiza o arquivo existente (UPDATE); caso
 * contrário — por exemplo, um projeto aberto via "Abrir arquivo JSON" que
 * ainda vive fora dessa pasta —, cria um novo registro persistente com um
 * identificador próprio (INSERT), do mesmo jeito que `createLocalProject`.
 * Chamadas seguintes com o `filePath` retornado apenas atualizam esse
 * mesmo registro, sem duplicar o projeto.
 */
export async function persistLocalProject(
  filePath: string | undefined,
  file: BloquinProjectFile,
): Promise<string> {
  if (filePath && (await isPersistedProjectPath(filePath))) {
    await writeLocalProject(filePath, file);
    return filePath;
  }

  const dir = await getProjectsDir();
  const newFilePath = await join(dir, `${crypto.randomUUID()}.json`);
  await writeLocalProject(newFilePath, file);
  return newFilePath;
}

export function readLocalProject(filePath: string): Promise<BloquinProjectFile> {
  return readTextFile(filePath).then((contents) => parseProjectFileContents(contents, filePath));
}

/**
 * Cria uma cópia independente de um projeto local: mesmo conteúdo, novo
 * identificador persistente (mesmo mecanismo de `createLocalProject` — um
 * novo `<uuid>.json` na pasta gerenciada) e nome único ("Meu projeto
 * (cópia)", "Meu projeto (cópia 2)"...), reaproveitando a mesma lógica de
 * desambiguação usada na importação de projetos.
 */
export async function duplicateLocalProject(filePath: string): Promise<{ filePath: string; file: BloquinProjectFile }> {
  const source = await readLocalProject(filePath);
  const { projects } = await listLocalProjects();
  const name = makeUniqueProjectName(source.project.name, projects.map((project) => project.name), 'cópia');

  const dir = await getProjectsDir();
  const newFilePath = await join(dir, `${crypto.randomUUID()}.json`);
  const file: BloquinProjectFile = { ...source, project: { ...source.project, name } };
  await writeLocalProject(newFilePath, file);
  return { filePath: newFilePath, file };
}

export function deleteLocalProject(filePath: string): Promise<void> {
  return remove(filePath);
}

export async function renameLocalProject(filePath: string, name: string): Promise<void> {
  const file = await readLocalProject(filePath);
  await writeLocalProject(filePath, { ...file, project: { ...file.project, name } });
}
