import { isNative } from './platform';

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
