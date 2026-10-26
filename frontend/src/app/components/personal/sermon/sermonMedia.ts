import { myStorageAPI } from '../../../utils/api';
import { sermonMediaQueue } from './sermonMediaQueue';
import { isLocalId, type ThoughtMedia } from './sermonTypes';

/**
 * 내 생각 첨부(사진·영상) — 기획서 §6.
 * 파일은 「내 스토리지」의 '설교 노트' 폴더에 올리고, 노트에는 파일 id 와 URL 만 남긴다.
 * 사진은 긴 변 2048px JPEG 로 줄이고, 영상은 MP4·WebM 20MB 이하만 받는다.
 *
 * 오프라인이거나 연결 문제로 못 올리면 attachMedia 가 파일을 기기 대기열(sermonMediaQueue)에 넣고
 * `local-` 첨부로 돌려준다. 실제 업로드는 저장소 flush 가 한다 (uploadPreparedMedia).
 */

export const MEDIA_MAX_BYTES = 20 * 1024 * 1024;
/** 설교 녹음 한 토막 상한. 모노 48kbps 로 약 4시간 */
export const AUDIO_MAX_BYTES = 200 * 1024 * 1024;
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
  | 'unsupported_type'
  | 'video_format'
  | 'too_large'
  | 'offline'
  | 'upload_failed'
  /** 서버가 받지 않음(4xx: 스토리지 용량 등) — 다시 시도해도 안 된다 */
  | 'rejected';

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
    case 'rejected':
      return '첨부를 받을 수 없어요. 내 스토리지 공간을 확인해 주세요';
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

/** 올리기 실패를 분류: 연결 끊김 → offline, 서버가 거절(4xx) → rejected, 그 밖 → upload_failed */
function failCode(e: unknown): MediaError {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const st = (e as { status?: number } | null)?.status;
  if (typeof st === 'number' && st >= 400 && st < 500 && st !== 401 && st !== 408 && st !== 429)
    return 'rejected';
  return 'upload_failed';
}

/** 형식·크기 검사 + 사진 줄이기. 올리기 전에 한 번만 */
export async function prepareMedia(file: File): Promise<{ file: File; type: 'image' | 'video' }> {
  const type = classifyFile(file);
  const prepared = type === 'image' ? await shrinkImage(file) : file;
  if (prepared.size > MEDIA_MAX_BYTES) throw new MediaUploadError('too_large');
  return { file: prepared, type };
}

/** 준비된(prepareMedia) 파일을 내 스토리지에 올린다 */
export async function uploadPreparedMedia(
  file: File,
  type: 'image' | 'video',
): Promise<ThoughtMedia> {
  if (file.size > MEDIA_MAX_BYTES) throw new MediaUploadError('too_large');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new MediaUploadError('offline');
  }
  const folderId = await ensureFolder();
  try {
    const item = await myStorageAPI.uploadFile(file, folderId);
    return { id: item.id, type, url: item.url, thumb: item.thumbnail_url };
  } catch (e) {
    console.error('sermon: upload failed', e);
    throw new MediaUploadError(failCode(e));
  }
}

export async function uploadMedia(file: File): Promise<ThoughtMedia> {
  const p = await prepareMedia(file);
  return uploadPreparedMedia(p.file, p.type);
}

/**
 * 생각에 붙이기: 연결돼 있으면 바로 올리고, 오프라인·연결 실패면 기기 대기열에 넣어
 * `local-` 첨부로 돌려준다(queued=true). 형식·크기·서버 거절은 MediaUploadError 로 던진다.
 */
export async function attachMedia(
  file: File,
  owner: string,
): Promise<{ media: ThoughtMedia; queued: boolean }> {
  const p = await prepareMedia(file);
  const queue = async () => ({
    media: await sermonMediaQueue.put(owner, p.file, p.type, p.file.name),
    queued: true,
  });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return queue();
  try {
    return { media: await uploadPreparedMedia(p.file, p.type), queued: false };
  } catch (e) {
    if (e instanceof MediaUploadError && (e.code === 'offline' || e.code === 'upload_failed')) {
      try {
        return await queue();
      } catch (qe) {
        console.warn('sermon: media queue failed', qe);
      }
    }
    throw e;
  }
}

/** 설교 녹음 토막 업로드 — 같은 「설교 노트」 폴더. 노트 JSON 에는 파일 id·URL 만 남긴다 */
export async function uploadAudio(
  blob: Blob,
  fileName: string,
  onProgress?: (percent: number) => void,
): Promise<{ id: string; url: string }> {
  if (blob.size > AUDIO_MAX_BYTES) throw new MediaUploadError('too_large');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new MediaUploadError('offline');
  }
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
  const folderId = await ensureFolder();
  try {
    const item = await myStorageAPI.uploadFile(file, folderId, onProgress);
    return { id: item.id, url: item.url };
  } catch (e) {
    console.error('sermon: audio upload failed', e);
    const code = failCode(e);
    // 녹음은 거절돼도 기기에 남겨 두고 다시 시도한다 (예전과 같음)
    throw new MediaUploadError(code === 'rejected' ? 'upload_failed' : code);
  }
}

export function deleteMedia(id: string) {
  if (isLocalId(id)) {
    // 아직 안 올린 첨부 — 기기 대기열에서 빼고, 이번 창에서 이미 올라갔으면 그 파일도 지운다
    void sermonMediaQueue.remove(id).catch(() => {});
    const up = sermonMediaQueue.uploaded(id);
    if (up && !isLocalId(up.id)) deleteMedia(up.id);
    return;
  }
  myStorageAPI.deleteFile(id).catch(() => {
    /* 이미 지워졌거나 오프라인 — 조용히 넘어간다 */
  });
}
