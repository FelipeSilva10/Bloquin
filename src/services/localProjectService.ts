import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

const JSON_FILTER = [{ name: 'Projeto do Bloquin', extensions: ['json'] }];

export function isTauriRuntime() {
  return typeof window !== 'undefined'
    && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function downloadTextFile(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function openLocalProjectFile(): Promise<{ path: string; contents: string } | null> {
  if (!isTauriRuntime()) return null;

  const selected = await open({
    title: 'Abrir projeto do Bloquin',
    multiple: false,
    directory: false,
    filters: JSON_FILTER,
  });

  if (!selected || Array.isArray(selected)) return null;
  return { path: selected, contents: await readTextFile(selected) };
}

export async function saveLocalProjectFile(
  contents: string,
  suggestedName: string,
  existingPath?: string,
  saveAs = false,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    downloadTextFile(suggestedName, contents);
    return existingPath ?? suggestedName;
  }

  const path = !saveAs && existingPath
    ? existingPath
    : await save({
      title: saveAs ? 'Salvar projeto como…' : 'Salvar projeto do Bloquin',
      defaultPath: suggestedName,
      filters: JSON_FILTER,
      canCreateDirectories: true,
    });

  if (!path) return null;
  const jsonPath = path.toLowerCase().endsWith('.json') ? path : `${path}.json`;
  await writeTextFile(jsonPath, contents);
  return jsonPath;
}
