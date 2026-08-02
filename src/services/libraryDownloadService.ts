import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { isTauriRuntime } from './localProjectService';

interface BrowserWritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

interface BrowserFileHandle {
  createWritable(): Promise<BrowserWritableFile>;
}

type BrowserSavePicker = (options: {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<BrowserFileHandle>;

export async function downloadLibraryFile(
  url: string,
  suggestedName: string,
  fallbackMimeType: string,
): Promise<boolean> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível baixar este material. Tente abri-lo novamente.');

  const blob = await response.blob();
  const mimeType = blob.type || fallbackMimeType;
  const fileName = normalizeFileName(suggestedName, mimeType);
  const extension = getExtension(fileName);

  if (isTauriRuntime()) {
    const path = await save({
      title: 'Salvar material da Biblioteca',
      defaultPath: fileName,
      filters: [{ name: getFileTypeLabel(mimeType), extensions: [extension] }],
    });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }

  const picker = (window as Window & { showSaveFilePicker?: BrowserSavePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: fileName,
        types: [{
          description: getFileTypeLabel(mimeType),
          accept: { [mimeType]: [`.${extension}`] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      throw error;
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  return true;
}

function normalizeFileName(value: string, mimeType: string): string {
  const fallbackExtension = mimeType === 'application/pdf'
    ? 'pdf'
    : mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : 'webp';
  const sanitized = value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120) || `material.${fallbackExtension}`;
  const currentExtension = sanitized.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  const acceptedExtensions = fallbackExtension === 'jpg' ? ['jpg', 'jpeg'] : [fallbackExtension];
  if (currentExtension && acceptedExtensions.includes(currentExtension)) return sanitized;
  const baseName = sanitized.replace(/\.(pdf|png|jpe?g|webp)$/i, '');
  return `${baseName}.${fallbackExtension}`;
}

function getExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || 'bin';
}

function getFileTypeLabel(mimeType: string): string {
  return mimeType === 'application/pdf' ? 'Documento PDF' : 'Imagem';
}
