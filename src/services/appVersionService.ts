import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import packageJson from '../../package.json';
import { compareVersions } from '../lib/semver';
import { isTauriRuntime } from './localProjectService';

export const OFFICIAL_SITE_URL = 'https://bloquin.online/';
const LATEST_RELEASE_URL = 'https://api.github.com/repos/FelipeSilva10/Bloquin/releases/latest';
const UPDATE_CHECK_TIMEOUT_MS = 5000;

export interface AppUpdateInfo {
  installedVersion: string;
  latestVersion: string;
  releaseUrl: string;
}

interface LatestReleaseResponse {
  tag_name?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
}

const BUILD_VERSION = packageJson.version;


/**
 * Reads the version from the Tauri application manifest in desktop builds.
 * The package.json fallback keeps the browser/Vite preview useful without
 * introducing a second manually maintained version constant.
 */
export async function getInstalledVersion(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      return await getVersion();
    } catch {
      // The package version remains a safe fallback during development or if
      // the native bridge is unavailable for any reason.
    }
  }
  return BUILD_VERSION;
}

/**
 * Performs one best-effort check. Network failures intentionally resolve to
 * null: checking for updates must never affect startup or login.
 */
export async function checkForUpdate(): Promise<AppUpdateInfo | null> {
  const installedVersion = await getInstalledVersion();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;

    const release = await response.json() as LatestReleaseResponse;
    if (release.draft === true || release.prerelease === true) return null;
    if (typeof release.tag_name !== 'string') return null;

    const latestVersion = release.tag_name.replace(/^v/i, '').trim();
    if (compareVersions(latestVersion, installedVersion) <= 0) return null;

    return {
      installedVersion,
      latestVersion,
      releaseUrl: typeof release.html_url === 'string' ? release.html_url : OFFICIAL_SITE_URL,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Opens the official download page in the user's default browser. */
export async function openOfficialSite(): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await openUrl(OFFICIAL_SITE_URL);
    } catch {
      // Keep the action useful if the native plugin is unavailable in a
      // development build or is rejected by the operating system.
      const openedWindow = window.open(OFFICIAL_SITE_URL, '_blank', 'noopener,noreferrer');
      if (!openedWindow) window.location.assign(OFFICIAL_SITE_URL);
    }
    return;
  }

  const openedWindow = window.open(OFFICIAL_SITE_URL, '_blank', 'noopener,noreferrer');
  if (!openedWindow) window.location.assign(OFFICIAL_SITE_URL);
}

export const APP_BUILD_VERSION = BUILD_VERSION;
