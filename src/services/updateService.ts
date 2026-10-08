import { check } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface AppUpdateInfo {
  version: string;
  build_number?: number;
  title: string;
  release_notes: string;
  windows_url: string;
  portable_url?: string;
  msi_url?: string;
  published_at?: string;
  is_mandatory?: boolean;
}

export interface DownloadProgress {
  percent: number;
  downloaded_bytes: number;
  total_bytes: number;
}

export const MANIFEST_URL = 'https://raw.githubusercontent.com/straculencuandrei/coolSearch/main/version_manifest.json';

/**
 * Compares two semantic versions (e.g., '0.4.1' vs '0.4.0')
 */
export function isNewerVersion(remoteVer: string, localVer: string): boolean {
  if (!remoteVer || !localVer) return false;
  const cleanRemote = remoteVer.replace(/^v/i, '').trim();
  const cleanLocal = localVer.replace(/^v/i, '').trim();

  const remoteParts = cleanRemote.split('.').map((n) => parseInt(n, 10) || 0);
  const localParts = cleanLocal.split('.').map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(remoteParts.length, localParts.length, 3); i++) {
    const r = remoteParts[i] || 0;
    const l = localParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

/**
 * Fetches the raw version_manifest.json directly from GitHub with cache-busting
 */
export async function fetchLatestManifest(): Promise<AppUpdateInfo | null> {
  const cacheBuster = Date.now();
  const url = `${MANIFEST_URL}?_cb=${cacheBuster}`;

  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });

    if (res.ok) {
      const data: AppUpdateInfo = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('[UpdateService] Primary manifest fetch failed:', err);
  }
  return null;
}

/**
 * Checks for updates from GitHub raw manifest (instant OTA) with Tauri updater fallback
 */
export async function checkForUpdate(currentVersion: string): Promise<AppUpdateInfo | null> {
  // 1. Primary: Instant OTA via version_manifest.json (wznotes pattern)
  const manifest = await fetchLatestManifest();
  if (manifest && manifest.version && isNewerVersion(manifest.version, currentVersion)) {
    return manifest;
  }

  // 2. Fallback: Tauri native updater plugin
  try {
    const tauriUpdate = await check();
    if (tauriUpdate && isNewerVersion(tauriUpdate.version, currentVersion)) {
      return {
        version: tauriUpdate.version,
        title: `coolSearch v${tauriUpdate.version} Update`,
        release_notes: tauriUpdate.body || 'New features, search performance enhancements, and bug fixes.',
        windows_url: `https://github.com/straculencuandrei/coolSearch/releases/latest/download/coolSearch_${tauriUpdate.version}_x64-setup.exe`,
        published_at: tauriUpdate.date || new Date().toISOString(),
      };
    }
  } catch (err) {
    // Expected if not signed with Tauri minisign key
  }

  return null;
}

/**
 * Downloads and launches the update installer via native Rust backend
 */
export async function startDownloadAndInstall(
  update: AppUpdateInfo,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  let unlisten: (() => void) | null = null;
  if (onProgress) {
    unlisten = await listen<DownloadProgress>('update-download-progress', (event) => {
      onProgress(event.payload);
    });
  }

  try {
    const targetUrl = update.windows_url || update.portable_url || update.msi_url;
    if (!targetUrl) throw new Error('No download URL available in update manifest.');

    await invoke('download_and_install_update', { url: targetUrl });
  } finally {
    if (unlisten) {
      unlisten();
    }
  }
}
