import { isNative, isInAppBrowser, isKakaoTalk } from './platform';
import { resolveFileUrl } from './api';

/**
 * Convert a Blob to a base64-encoded string (without the data URI prefix).
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'download';
}

export interface NativeDownloadResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Save a Blob to the device filesystem.
 * - iOS: Files app > BRIDGE SPOTS > BRIDGE Downloads
 * - Android: Documents/BRIDGE Downloads (visible in file managers)
 */
export async function saveToDevice(
  blob: Blob,
  filename: string,
): Promise<NativeDownloadResult> {
  if (!isNative()) {
    return { success: false, error: 'Not a native platform' };
  }

  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    const safeFilename = sanitizeFilename(filename);
    const base64Data = await blobToBase64(blob);

    const subDir = 'BRIDGE Downloads';
    try {
      await Filesystem.mkdir({
        path: subDir,
        directory: Directory.Documents,
        recursive: true,
      });
    } catch {
      // Directory may already exist
    }

    const fullPath = `${subDir}/${safeFilename}`;

    await Filesystem.writeFile({
      path: fullPath,
      data: base64Data,
      directory: Directory.Documents,
    });

    const uriResult = await Filesystem.getUri({
      path: fullPath,
      directory: Directory.Documents,
    });

    console.log('[NativeDownload] File saved:', uriResult.uri);

    return { success: true, path: uriResult.uri };
  } catch (error) {
    console.error('[NativeDownload] Failed to save file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Download History (localStorage) ───

const DOWNLOAD_HISTORY_KEY = 'bridge_downloaded_photos';

function getDownloadedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(DOWNLOAD_HISTORY_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDownloadedSet(ids: Set<string>): void {
  try {
    // Keep max 5000 entries to prevent localStorage bloat
    const arr = Array.from(ids);
    if (arr.length > 5000) arr.splice(0, arr.length - 5000);
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(arr));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function markAsDownloaded(photoId: string): void {
  const ids = getDownloadedSet();
  ids.add(photoId);
  saveDownloadedSet(ids);
}

export function markManyAsDownloaded(photoIds: string[]): void {
  const ids = getDownloadedSet();
  photoIds.forEach((id) => ids.add(id));
  saveDownloadedSet(ids);
}

export function isDownloaded(photoId: string): boolean {
  return getDownloadedSet().has(photoId);
}

export function getDownloadedIds(photoIds: string[]): Set<string> {
  const all = getDownloadedSet();
  return new Set(photoIds.filter((id) => all.has(id)));
}

/**
 * Universal photo download — handles all platforms:
 * - Capacitor native: saveToDevice (BRIDGE Downloads folder)
 * - KakaoTalk in-app: open external browser via intent scheme
 * - Other in-app browsers (FB, Instagram, LINE): direct URL open
 * - Regular browsers: fetch → blob → anchor download
 */
export async function downloadPhoto(photoUrl: string, filename: string, photoId?: string): Promise<void> {
  const url = resolveFileUrl(photoUrl);

  // 1. Capacitor native app
  if (isNative()) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const result = await saveToDevice(blob, filename);
    if (!result.success) throw new Error(result.error || 'Save failed');
    if (photoId) markAsDownloaded(photoId);
    return;
  }

  // 2. KakaoTalk / in-app browsers / regular browsers → blob download with fallback
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
    if (photoId) markAsDownloaded(photoId);
  } catch {
    // Fallback: KakaoTalk → external browser, others → new tab
    if (isKakaoTalk()) {
      window.open(`kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`, '_self');
    } else {
      window.open(url, '_blank');
    }
    if (photoId) markAsDownloaded(photoId);
  }
}
