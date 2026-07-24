import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

const JSON_FILTER = [{ name: 'Projeto do Bloquin', extensions: ['json'] }];

interface BrowserWritableFile {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface BrowserFileHandle {
  name: string;
  createWritable(): Promise<BrowserWritableFile>;
}

type BrowserSavePicker = (options: {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<BrowserFileHandle>;

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

async function saveWithBrowserPicker(
  contents: string,
  suggestedName: string,
): Promise<string | null> {
  const pickerWindow = window as Window & {
    showSaveFilePicker?: BrowserSavePicker;
  };
  const showSaveFilePicker = pickerWindow.showSaveFilePicker;

  // O seletor de arquivos é suportado pelo Chromium usado no desktop e por
  // navegadores compatíveis. Em navegadores antigos, o download tradicional
  // continua sendo o fallback possível.
  if (!showSaveFilePicker) {
    downloadTextFile(suggestedName, contents);
    return suggestedName;
  }

  try {
    const handle = await showSaveFilePicker.call(pickerWindow, {
      suggestedName,
      types: [{
        description: 'Projeto do Bloquin',
        accept: { 'application/json': ['.json'] },
      }],
    });
    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
    return handle.name;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
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
  dialogTitle?: string,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return saveWithBrowserPicker(contents, suggestedName);
  }

  const path = !saveAs && existingPath
    ? existingPath
    : await save({
      title: dialogTitle ?? (saveAs ? 'Salvar projeto como…' : 'Salvar projeto do Bloquin'),
      defaultPath: suggestedName,
      filters: JSON_FILTER,
      canCreateDirectories: true,
    });

  if (!path) return null;
  const jsonPath = path.toLowerCase().endsWith('.json') ? path : `${path}.json`;
  await writeTextFile(jsonPath, contents);
  return jsonPath;
}

export function exportLocalProjectFile(
  contents: string,
  suggestedName: string,
): Promise<string | null> {
  return saveLocalProjectFile(
    contents,
    suggestedName,
    undefined,
    true,
    'Exportar projeto JSON',
  );
}
