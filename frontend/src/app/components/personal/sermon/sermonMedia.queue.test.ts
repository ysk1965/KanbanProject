import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  getFolders: vi.fn(),
  createFolder: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));
vi.mock('../../../utils/api', () => ({ myStorageAPI: storage }));

import { MediaUploadError, attachMedia, deleteMedia } from './sermonMedia';
import { sermonMediaQueue } from './sermonMediaQueue';

const video = () => new File(['mp4'], 'clip.mp4', { type: 'video/mp4' });
const setOnline = (v: boolean) =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });

beforeEach(() => {
  Object.values(storage).forEach((f) => f.mockReset());
  storage.getFolders.mockResolvedValue([{ id: 'f1', parent_id: null, name: '설교 노트' }]);
  storage.deleteFile.mockResolvedValue(undefined);
  setOnline(true);
});
afterEach(() => setOnline(true));

describe('생각 첨부 — 오프라인 대기열', () => {
  it('연결돼 있으면 바로 올린다', async () => {
    storage.uploadFile.mockResolvedValue({ id: 's1', url: 'https://x/1', thumbnail_url: null });
    const r = await attachMedia(video(), 'u1');
    expect(r).toEqual({
      media: { id: 's1', type: 'video', url: 'https://x/1', thumb: null },
      queued: false,
    });
  });

  it('오프라인이면 올리지 않고 기기 대기열에 넣어 local- 첨부로 붙인다', async () => {
    setOnline(false);
    const r = await attachMedia(video(), 'u1');
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(r.queued).toBe(true);
    expect(r.media.id.startsWith('local-')).toBe(true);
    const row = await sermonMediaQueue.get(r.media.id);
    expect(row).toMatchObject({ owner: 'u1', type: 'video', mime: 'video/mp4' });
    expect((await sermonMediaQueue.list('u1')).map((x) => x.id)).toContain(r.media.id);
    // 빼면 대기열에서도 지운다
    deleteMedia(r.media.id);
    await vi.waitFor(async () => expect(await sermonMediaQueue.get(r.media.id)).toBeNull());
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('연결 실패(네트워크·5xx)도 대기열로, 서버 거절(4xx)은 오류로 알린다', async () => {
    storage.uploadFile.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const r = await attachMedia(video(), 'u1');
    expect(r.queued).toBe(true);

    storage.uploadFile.mockRejectedValueOnce({ code: 'ST003', status: 400 });
    await expect(attachMedia(video(), 'u1')).rejects.toMatchObject({ code: 'rejected' });
  });

  it('형식·크기 오류는 대기열에 넣지 않는다', async () => {
    setOnline(false);
    await expect(
      attachMedia(new File(['x'], 'a.mov', { type: 'video/quicktime' }), 'u1'),
    ).rejects.toBeInstanceOf(MediaUploadError);
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'b.mp4', { type: 'video/mp4' });
    await expect(attachMedia(big, 'u1')).rejects.toMatchObject({ code: 'too_large' });
  });

  it('이번 창에서 이미 올라간 local- 첨부를 빼면 올라간 파일도 지운다', async () => {
    sermonMediaQueue.markUploaded('local-mX', {
      id: 'srvX',
      type: 'image',
      url: 'https://x/X',
      thumb: null,
    });
    deleteMedia('local-mX');
    expect(storage.deleteFile).toHaveBeenCalledWith('srvX');
  });
});
