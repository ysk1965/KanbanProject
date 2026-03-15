import { isNative, isIOS, isKakaoTalk, isMobileWeb, isChromeiOS } from './platform';
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

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.test(filename);
}

/**
 * Save an image to the device photo gallery (Camera Roll / Photos).
 * Uses @capacitor-community/media plugin.
 */
async function saveToGallery(
  blob: Blob,
  filename: string,
): Promise<NativeDownloadResult> {
  try {
    const { Media } = await import('@capacitor-community/media');
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    const safeFilename = sanitizeFilename(filename);
    const base64Data = await blobToBase64(blob);

    // Write to a temp file first (Media plugin needs a file path)
    const tempPath = `_bridge_temp_${Date.now()}_${safeFilename}`;
    await Filesystem.writeFile({
      path: tempPath,
      data: base64Data,
      directory: Directory.Cache,
    });

    const tempUri = await Filesystem.getUri({
      path: tempPath,
      directory: Directory.Cache,
    });

    // Ensure BRIDGE album exists
    const albumName = 'BRIDGE';
    let albums;
    try {
      albums = await Media.getAlbums();
    } catch {
      albums = { albums: [] };
    }

    const bridgeAlbum = albums.albums.find(
      (a: { name: string }) => a.name === albumName,
    );

    if (!bridgeAlbum && isIOS()) {
      try {
        await Media.createAlbum({ name: albumName });
      } catch {
        // Album creation may fail if it already exists
      }
    }

    // Save to gallery
    await Media.savePhoto({
      path: tempUri.uri,
      albumIdentifier: bridgeAlbum?.identifier,
    });

    // Clean up temp file
    try {
      await Filesystem.deleteFile({
        path: tempPath,
        directory: Directory.Cache,
      });
    } catch {
      // Non-critical cleanup
    }

    console.log('[NativeDownload] Photo saved to gallery:', safeFilename);
    return { success: true, path: 'gallery' };
  } catch (error) {
    console.error('[NativeDownload] Failed to save to gallery:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Save a Blob to the device.
 * - Images: saved to photo gallery (Camera Roll / Photos) via Media plugin
 * - Other files: saved to Files app / Documents folder
 */
export async function saveToDevice(
  blob: Blob,
  filename: string,
): Promise<NativeDownloadResult> {
  if (!isNative()) {
    return { success: false, error: 'Not a native platform' };
  }

  // Images → photo gallery
  if (isImageFile(filename)) {
    const galleryResult = await saveToGallery(blob, filename);
    if (galleryResult.success) return galleryResult;
    // Fall through to filesystem if gallery save fails
    console.warn('[NativeDownload] Gallery save failed, falling back to filesystem');
  }

  // Non-images or gallery fallback → filesystem
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

// ─── Web Share API (Mobile PWA) ───

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    heif: 'image/heif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function canWebShare(): boolean {
  return isMobileWeb() && !!navigator.share && !!navigator.canShare;
}

async function fetchAsFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Download failed');
  const blob = await response.blob();
  return new File([blob], filename, { type: getMimeType(filename) });
}

/**
 * Try Web Share API with files. Returns true if shared successfully.
 */
async function tryWebShare(files: File[]): Promise<boolean> {
  if (!canWebShare()) return false;
  try {
    const shareData = { files };
    if (!navigator.canShare(shareData)) return false;
    await navigator.share(shareData);
    return true;
  } catch (error) {
    // User cancelled share → still counts as handled
    if (error instanceof Error && error.name === 'AbortError') return true;
    return false;
  }
}

function anchorDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Delay revocation — Chrome mobile needs time to start the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 3000);
}

/**
 * Open image URL in new tab for manual save (long-press → Save Image).
 * Used on Chrome iOS where <a download> is not supported.
 */
function openForManualSave(url: string): void {
  window.open(url, '_blank');
}

/**
 * Universal photo download — handles all platforms:
 * - Capacitor native: saveToDevice (photo gallery)
 * - Mobile web (PWA): Web Share API → OS share sheet (save to photos)
 * - KakaoTalk in-app: open external browser via intent scheme
 * - Desktop browsers: fetch → blob → anchor download
 */
/** When true, downloadPhoto skips per-file Web Share (set during batch fallback) */
let _batchBypassWebShare = false;

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

  // 2. Mobile web → try Web Share API first (skip if batchBypass flag)
  if (canWebShare() && !_batchBypassWebShare) {
    try {
      const file = await fetchAsFile(url, filename);
      const shared = await tryWebShare([file]);
      if (shared) {
        if (photoId) markAsDownloaded(photoId);
        return;
      }
    } catch {
      // Fall through to blob download
    }
  }

  // 3. Chrome iOS — <a download> not supported; open in new tab for long-press save
  if (isChromeiOS()) {
    openForManualSave(url);
    if (photoId) markAsDownloaded(photoId);
    return;
  }

  // 4. Desktop / Android Chrome / fallback → blob download
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    anchorDownload(blob, filename);
    if (photoId) markAsDownloaded(photoId);
  } catch {
    if (isKakaoTalk()) {
      window.open(`kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`, '_self');
    } else {
      window.open(url, '_blank');
    }
    if (photoId) markAsDownloaded(photoId);
  }
}

export interface BatchDownloadProgress {
  current: number;
  total: number;
  phase: 'downloading' | 'saving' | 'done' | 'cancelled';
  failedCount: number;
}

export interface BatchDownloadOptions {
  onProgress?: (progress: BatchDownloadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Batch download photos — optimized for Web Share API on mobile.
 * - Mobile web: fetches all files, shares via single OS share sheet
 * - Other platforms: falls back to individual downloadPhoto() calls
 * Returns array of successfully downloaded photo IDs.
 */
export async function downloadPhotosBatch(
  photos: { url: string; filename: string; id: string }[],
  options?: BatchDownloadOptions,
): Promise<string[]> {
  const { onProgress, signal } = options || {};
  const downloadedIds: string[] = [];
  let failedCount = 0;
  const total = photos.length;

  const report = (current: number, phase: BatchDownloadProgress['phase']) => {
    onProgress?.({ current, total, phase, failedCount });
  };

  // Mobile web → batch Web Share
  if (canWebShare() && photos.length > 0) {
    try {
      const files: File[] = [];
      for (let i = 0; i < photos.length; i++) {
        if (signal?.aborted) {
          report(i, 'cancelled');
          break;
        }
        report(i + 1, 'downloading');
        try {
          const file = await fetchAsFile(resolveFileUrl(photos[i].url), photos[i].filename);
          files.push(file);
          downloadedIds.push(photos[i].id);
        } catch {
          failedCount++;
          console.warn('[NativeDownload] Failed to fetch photo for share:', photos[i].id);
        }
      }
      if (!signal?.aborted && files.length > 0) {
        report(total, 'saving');
        const shared = await tryWebShare(files);
        if (shared) {
          markManyAsDownloaded(downloadedIds);
          report(total, 'done');
          return downloadedIds;
        }
      }
    } catch {
      // Fall through to individual downloads
    }
    // Reset if share failed
    downloadedIds.length = 0;
    failedCount = 0;
  }

  // Fallback: individual downloads (native, desktop, share failed)
  // Skip per-file Web Share in fallback to avoid multiple share sheets
  _batchBypassWebShare = true;
  // Always delay between downloads on web to prevent Chrome from throttling
  const needsDelay = !isNative();
  for (let i = 0; i < photos.length; i++) {
    if (signal?.aborted) {
      report(i, 'cancelled');
      break;
    }
    report(i + 1, 'downloading');
    try {
      await downloadPhoto(photos[i].url, photos[i].filename, photos[i].id);
      downloadedIds.push(photos[i].id);
    } catch {
      failedCount++;
      console.warn('[NativeDownload] Failed to download photo:', photos[i].id);
    }
    // Delay between downloads to prevent Chrome from blocking
    if (needsDelay && i < photos.length - 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  _batchBypassWebShare = false;

  if (!signal?.aborted) {
    report(total, 'done');
  }
  return downloadedIds;
}
