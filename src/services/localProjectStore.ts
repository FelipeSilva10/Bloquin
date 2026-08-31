import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import type { BoardKey } from '../blockly/boards';
import { type BloquinProjectFile, createProjectFile, parseProjectFileContents } from '../types/project';

const PROJECTS_DIR_NAME = 'projects';

export interface LocalProjectSummary {
  filePath: string;
  name: string;
  targetBoard: BoardKey | null;
  updatedAt: string | null;
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

export function readLocalProject(filePath: string): Promise<BloquinProjectFile> {
  return readTextFile(filePath).then((contents) => parseProjectFileContents(contents, filePath));
}

export function deleteLocalProject(filePath: string): Promise<void> {
  return remove(filePath);
}

export async function renameLocalProject(filePath: string, name: string): Promise<void> {
  const file = await readLocalProject(filePath);
  await writeLocalProject(filePath, { ...file, project: { ...file.project, name } });
}
