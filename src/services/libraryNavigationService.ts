import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauriRuntime } from './localProjectService';
import { normalizeExternalLink } from './libraryValidation';

export async function openLibraryExternalUrl(value: string): Promise<void> {
  const url = normalizeExternalLink(value);
  if (!url) throw new Error('Este endereço não é válido ou seguro.');

  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }

  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (!openedWindow) throw new Error('O navegador bloqueou a nova aba. Permita pop-ups para abrir este material.');
  openedWindow.opener = null;
}
