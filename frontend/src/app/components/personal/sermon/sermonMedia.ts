import { myStorageAPI } from '../../../utils/api';
import type { ThoughtMedia } from './sermonTypes';

/**
 * 내 생각 첨부(사진·영상) — 기획서 §6.
 * 파일은 「내 스토리지」의 '설교 노트' 폴더에 올리고, 노트에는 파일 id 와 URL 만 남긴다.
 * 사진은 긴 변 2048px JPEG 로 줄이고, 영상은 MP4·WebM 20MB 이하만 받는다.
 */

export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;
const FOLDER_NAME = '설교 노트';

let folderIdPromise: Promise<string | null> | null = null;

async function ensureFolder(): Promise<string | null> {
  if (!folderIdPromise) {
    folderIdPromise = (async () => {
      try {
        const folders = await myStorageAPI.getFolders();
        const found = folders.find((f) => f.parent_id === null && f.name === FOLDER_NAME);
        if (found) return found.id;
        const created = await myStorageAPI.createFolder(FOLDER_NAME, null);
        return created.id;
      } catch (e) {
        console.warn('sermon: folder lookup failed, uploading to root', e);
        return null;
      }
    })();
  }
  return folderIdPromise;
}

export type MediaError =
  'unsupported_type' | 'video_format' | 'too_large' | 'offline' | 'upload_failed';

export class MediaUploadError extends Error {
  constructor(public code: MediaError) {
    super(code);
  }
}

export function mediaErrorMessage(code: MediaError): string {
  switch (code) {
    case 'unsupported_type':
      return '사진이나 영상만 붙일 수 있어요';
    case 'video_format':
      return '이 영상 형식은 올릴 수 없어요. MP4 영상으로 올려주세요';
    case 'too_large':
      return '파일이 너무 커요. 20MB 이하로 올려주세요';
    case 'offline':
      return '인터넷에 연결되면 사진·영상을 첨부할 수 있어요';
    default:
      return '첨부를 올리지 못했어요. 다시 시도해 주세요';
  }
}

export function classifyFile(file: File): 'image' | 'video' {
  if (/^image\//.test(file.type)) return 'image';
  if (/^video\//.test(file.type)) {
    if (!/^video\/(mp4|webm)$/.test(file.type)) throw new MediaUploadError('video_format');
    if (file.size > MEDIA_MAX_BYTES) throw new MediaUploadError('too_large');
    return 'video';
  }
  throw new MediaUploadError('unsupported_type');
}

/** 긴 변 2048px, JPEG 0.86. GIF/SVG 는 그대로 */
async function shrinkImage(file: File): Promise<File> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('decode'));
      img.src = url;
    });
    const s = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.86));
    if (blob) {
      const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
      return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    }
  } catch {
    /* 변환 실패 → 원본 그대로 */
  }
  return file;
}

export async function uploadMedia(file: File): Promise<ThoughtMedia> {
  const type = classifyFile(file);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new MediaUploadError('offline');
  }
  const prepared = type === 'image' ? await shrinkImage(file) : file;
  if (prepared.size > MEDIA_MAX_BYTES) throw new MediaUploadError('too_large');
  const folderId = await ensureFolder();
  try {
    const item = await myStorageAPI.uploadFile(prepared, folderId);
    return { id: item.id, type, url: item.url, thumb: item.thumbnail_url };
  } catch (e) {
    console.error('sermon: upload failed', e);
    throw new MediaUploadError(
      typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'upload_failed',
    );
  }
}

export function deleteMedia(id: string) {
  myStorageAPI.deleteFile(id).catch(() => {
    /* 이미 지워졌거나 오프라인 — 조용히 넘어간다 */
  });
}
