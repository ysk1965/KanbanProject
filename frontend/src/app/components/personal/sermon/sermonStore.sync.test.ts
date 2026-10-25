import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listDocs: vi.fn(),
  getDoc: vi.fn(),
  createDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

vi.mock('../../../utils/services', () => ({ personalFeatureAPI: api }));
vi.mock('./sermonAudioStore', () => ({
  sermonAudioStore: {
    removeNote: vi.fn(),
    renameNote: vi.fn(),
    getSegment: vi.fn(),
    putSegment: vi.fn(),
    removeSegment: vi.fn(),
    assemble: vi.fn(),
  },
}));
vi.mock('./sermonMedia', () => ({
  MediaUploadError: class extends Error {},
  deleteMedia: vi.fn(),
  uploadAudio: vi.fn(),
}));

import { SermonStore } from './sermonStore';
import type { SermonNote } from './sermonTypes';

const USER = 'u1';
const T0 = '2026-10-25T02:00:00Z';
const T1 = '2026-10-25T05:00:00Z';

function note(over: Partial<SermonNote> = {}): SermonNote {
  return {
    id: 'doc1',
    title: '새친구팀',
    preacher: '',
    service: '주일 2부',
    date: '2026-10-25',
    refs: [],
    body: '<p>처음</p>',
    thoughts: [],
    elapsed: 0,
    created_at: 1,
    updated_at: 1000,
    ...over,
  };
}

function seed(local: SermonNote, dirty: boolean) {
  localStorage.setItem(
    SermonStore.keyFor(USER),
    JSON.stringify({
      notes: [local],
      dirty: dirty ? [local.id] : [],
      deleted: [],
      synced: [[local.id, T0]],
    }),
  );
}

function remoteDoc(content: SermonNote, updatedAt: string) {
  const { id: _id, ...c } = content;
  return {
    id: content.id,
    feature_key: 'sermon',
    title: content.title,
    schema_ver: 1,
    created_at: T0,
    updated_at: updatedAt,
    content: c,
  };
}

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.updateDoc.mockImplementation(async (_k: string, id: string) => ({
    id,
    updated_at: '2026-10-25T06:00:00Z',
  }));
  api.createDoc.mockImplementation(async () => ({
    id: 'doc2',
    updated_at: '2026-10-25T06:00:00Z',
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SermonStore 오프라인 뒤 동기화', () => {
  it('양쪽 다 고쳤으면 이 기기 내용은 원래 노트로 올리고, 다른 기기 내용은 사본으로 남긴다', async () => {
    seed(note({ body: '<p>노트북에서 쓴 요약</p>', updated_at: 2000 }), true);
    const phone = note({ body: '<p>폰에서 고친 요약</p>', updated_at: 3000 });
    api.listDocs.mockResolvedValue([remoteDoc(phone, T1)]);
    api.getDoc.mockResolvedValue(remoteDoc(phone, T1));

    const store = new SermonStore(USER);
    const conflicts: SermonNote[] = [];
    store.onConflict((c) => conflicts.push(c));
    await store.init();
    await vi.waitFor(() => expect(store.status.pending).toBe(0));

    // 원래 노트 = 노트북 내용으로 서버에 올라감
    expect(api.updateDoc).toHaveBeenCalledWith(
      'sermon',
      'doc1',
      expect.objectContaining({
        content: expect.objectContaining({ body: '<p>노트북에서 쓴 요약</p>' }),
      }),
    );
    // 폰 내용은 사본 노트로 새로 올라감
    expect(conflicts).toHaveLength(1);
    expect(api.createDoc).toHaveBeenCalledWith(
      'sermon',
      expect.objectContaining({
        title: '새친구팀 · 다른 기기 사본',
        content: expect.objectContaining({ body: '<p>폰에서 고친 요약</p>' }),
      }),
    );
    expect(
      store
        .all()
        .map((n) => n.body)
        .sort(),
    ).toEqual(['<p>노트북에서 쓴 요약</p>', '<p>폰에서 고친 요약</p>']);
    store.dispose();
  });

  it('서버가 그대로면 사본 없이 이 기기 변경만 올린다', async () => {
    seed(note({ body: '<p>노트북에서 쓴 요약</p>', updated_at: 2000 }), true);
    api.listDocs.mockResolvedValue([remoteDoc(note(), T0)]);

    const store = new SermonStore(USER);
    await store.init();
    await vi.waitFor(() => expect(store.status.pending).toBe(0));

    expect(api.getDoc).not.toHaveBeenCalled();
    expect(api.createDoc).not.toHaveBeenCalled();
    expect(api.updateDoc).toHaveBeenCalledTimes(1);
    expect(store.all()).toHaveLength(1);
    store.dispose();
  });

  it('이 기기에서 안 고쳤으면 다른 기기 내용을 그대로 받는다', async () => {
    seed(note(), false);
    const phone = note({ body: '<p>폰에서 고친 요약</p>', updated_at: 3000 });
    api.listDocs.mockResolvedValue([remoteDoc(phone, T1)]);
    api.getDoc.mockResolvedValue(remoteDoc(phone, T1));

    const store = new SermonStore(USER);
    await store.init();

    expect(store.get('doc1')?.body).toBe('<p>폰에서 고친 요약</p>');
    expect(api.createDoc).not.toHaveBeenCalled();
    expect(api.updateDoc).not.toHaveBeenCalled();
    store.dispose();
  });

  it('응답 없는 연결이면 제한 시간 뒤 실패로 보고 다시 시도할 수 있게 둔다', async () => {
    vi.useFakeTimers();
    seed(note({ body: '<p>노트북에서 쓴 요약</p>', updated_at: 2000 }), true);
    api.listDocs.mockReturnValue(new Promise(() => {})); // 와이파이 로그인 화면 등에서 멈춤

    const store = new SermonStore(USER);
    const done = store.init();
    await vi.advanceTimersByTimeAsync(21000);
    await done;

    expect(store.status.online).toBe(false);
    expect(store.status.slow).toBe(true);
    expect(store.status.pending).toBe(1);
    // 데이터는 기기에 그대로
    expect(store.get('doc1')?.body).toBe('<p>노트북에서 쓴 요약</p>');
    store.dispose();
  });
});
