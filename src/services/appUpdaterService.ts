import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { isTauriRuntime } from './localProjectService';

export type { DownloadEvent, Update };

/**
 * MSIX (Microsoft Store) packages always run from
 * C:\Program Files\WindowsApps\<PackageFamilyName>\ — confirmed on the Rust
 * side (`is_store_package`), which is the only reliable signal since both
 * distribution channels share the same webview build. The Store owns
 * updates for that channel; calling the native updater there would fight
 * its own update mechanism and risks violating Store policy.
 */
export async function isStorePackage(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    return await invoke<boolean>('is_store_package');
  } catch {
    return false;
  }
}

/**
 * Checks the signed update endpoint (GitHub Releases `latest.json`) for a
 * newer version. Resolves to null on any failure — no internet, GitHub
 * unavailable, no update, running outside Tauri, or running as the Store
 * package — so callers never need their own fallback branching to stay
 * safe on startup.
 */
export async function checkForNativeUpdate(): Promise<Update | null> {
  if (!isTauriRuntime()) return null;
  if (await isStorePackage()) return null;
  try {
    return await check();
  } catch {
    return null;
  }
}

/** Restarts the app once a downloaded update has been installed. */
export async function relaunchApp(): Promise<void> {
  await relaunch();
}
