import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 노트 기기 저장(IndexedDB) · 문서 한도(PF004) · 오프라인 생각 첨부 대기열.
 * IndexedDB 는 메모리 구현(memoryNoteDb)을 넣고, 첨부 대기열은 jsdom 에 IndexedDB 가 없어 메모리로 돈다.
 */

const api = vi.hoisted(() => ({
  listDocs: vi.fn(),
  getDoc: vi.fn(),
  createDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));
const media = vi.hoisted(() => {
  class MediaUploadError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  return {
    MediaUploadError,
    deleteMedia: vi.fn(),
    uploadAudio: vi.fn(),
    uploadPreparedMedia: vi.fn(),
  };
});

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
vi.mock('./sermonMedia', () => media);

import { ANONYMOUS_USER, SermonStore, syncLabel } from './sermonStore';
import { memoryNoteDb } from './sermonNoteDb';
import { sermonMediaQueue } from './sermonMediaQueue';
import { localFileId, type SermonNote, type Thought } from './sermonTypes';

const USER = 'u1';
const T0 = '2026-10-25T02:00:00Z';

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

function thought(mediaIds: string[]): Thought {
  return {
    id: 't1',
    tag: '생각',
    text: '사진',
    media: mediaIds.map((id) => ({ id, type: 'image' as const, url: 'blob:x', thumb: null })),
    t: null,
    aid: null,
    label: null,
    at: 1,
  };
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

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  media.uploadPreparedMedia.mockReset();
  media.deleteMedia.mockReset();
  api.listDocs.mockResolvedValue([]);
  api.updateDoc.mockImplementation(async (_k: string, id: string) => ({
    id,
    updated_at: '2026-10-25T06:00:00Z',
  }));
  let n = 0;
  api.createDoc.mockImplementation(async () => ({
    id: `srv${++n}`,
    updated_at: '2026-10-25T06:00:00Z',
  }));
  api.deleteDoc.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('노트 기기 저장 — IndexedDB', () => {
  it('새 사용자: 저장분을 비동기로 읽는 동안 restoring, 읽은 뒤 노트가 보이고 변경은 IndexedDB 에 쓴다', async () => {
    const db = memoryNoteDb();
    await db.write(ANONYMOUS_USER, [note({ id: 'local-a' })], [], {
      dirty: [],
      deleted: [],
      synced: [],
    });
    const store = new SermonStore(ANONYMOUS_USER, { noteDb: async () => db });
    expect(store.status.restoring).toBe(true);
    expect(syncLabel(store.status).text).toBe('이 기기에 저장됨 · 로그인하면 다른 기기와 맞춰져요');
    await store.init();
    expect(store.status.restoring).toBe(false);
    expect(store.all().map((n) => n.id)).toEqual(['local-a']);

    store.save(note({ id: 'local-b', title: '둘째' }));
    await vi.waitFor(() => expect(db.rows.get(ANONYMOUS_USER)?.has('local-b')).toBe(true));
    expect(db.rows.get(ANONYMOUS_USER)?.get('local-b')?.title).toBe('둘째');
    // localStorage 에는 노트를 쓰지 않는다
    expect(localStorage.getItem(SermonStore.keyFor(ANONYMOUS_USER))).toBeNull();

    // 바뀐 노트만 다시 쓴다 / 지운 노트는 행에서 빠진다
    store.remove('local-a');
    await vi.waitFor(() => expect(db.rows.get(ANONYMOUS_USER)?.has('local-a')).toBe(false));
    store.dispose();
  });

  it('예전 localStorage 저장분은 바로(동기로) 보이고, IndexedDB 로 옮긴 뒤 키를 지운다', async () => {
    localStorage.setItem(
      SermonStore.keyFor(USER),
      JSON.stringify({
        notes: [note({ updated_at: 2000, body: '<p>기기</p>' })],
        dirty: ['doc1'],
        deleted: ['gone1'],
        synced: [['doc1', T0]],
      }),
    );
    const db = memoryNoteDb();
    const store = new SermonStore(USER, { noteDb: async () => db });
    const done = store.init();
    // 첫 화면: await 전에 이미 메모리에 있다
    expect(store.get('doc1')?.body).toBe('<p>기기</p>');
    await done;

    expect(localStorage.getItem(SermonStore.keyFor(USER))).toBeNull();
    expect(db.rows.get(USER)?.get('doc1')?.body).toBe('<p>기기</p>');
    // 올릴 목록·지울 목록도 옮겨져 그대로 서버로 간다
    await vi.waitFor(() => expect(store.status.pending).toBe(0));
    expect(api.updateDoc).toHaveBeenCalledWith('sermon', 'doc1', expect.anything());
    expect(api.deleteDoc).toHaveBeenCalledWith('sermon', 'gone1');
    store.dispose();
  });

  it('localStorage 비상 사본과 IndexedDB 가 둘 다 있으면 노트마다 나중에 고친 쪽을 둔다', async () => {
    const db = memoryNoteDb();
    await db.write(
      ANONYMOUS_USER,
      [
        note({ id: 'local-a', body: '<p>DB 새것</p>', updated_at: 3000 }),
        note({ id: 'local-b', body: '<p>DB 옛것</p>', updated_at: 1000 }),
      ],
      [],
      { dirty: [], deleted: [], synced: [] },
    );
    localStorage.setItem(
      SermonStore.keyFor(ANONYMOUS_USER),
      JSON.stringify({
        notes: [
          note({ id: 'local-a', body: '<p>LS 옛것</p>', updated_at: 2000 }),
          note({ id: 'local-b', body: '<p>LS 새것</p>', updated_at: 2000 }),
        ],
        dirty: [],
        deleted: [],
        synced: [],
      }),
    );
    const store = new SermonStore(ANONYMOUS_USER, { noteDb: async () => db });
    await store.init();
    expect(store.get('local-a')?.body).toBe('<p>DB 새것</p>');
    expect(store.get('local-b')?.body).toBe('<p>LS 새것</p>');
    expect(db.rows.get(ANONYMOUS_USER)?.get('local-b')?.body).toBe('<p>LS 새것</p>');
    expect(localStorage.getItem(SermonStore.keyFor(ANONYMOUS_USER))).toBeNull();
    store.dispose();
  });

  it('로그인하면 IndexedDB 의 익명 노트가 계정으로 옮겨져 올라가고, 익명 저장분은 비운다', async () => {
    const db = memoryNoteDb();
    await db.write(ANONYMOUS_USER, [note({ id: 'local-anon', title: '로그인 전' })], [], {
      dirty: ['local-anon'],
      deleted: [],
      synced: [],
    });
    const store = new SermonStore(USER, { noteDb: async () => db });
    await store.init();
    await vi.waitFor(() => expect(api.createDoc).toHaveBeenCalledTimes(1));
    expect(await db.load(ANONYMOUS_USER)).toBeNull();
    await vi.waitFor(() => expect(store.get('srv1')?.title).toBe('로그인 전'));
    await vi.waitFor(() => expect(db.rows.get(USER)?.has('srv1')).toBe(true));
    expect(db.rows.get(USER)?.has('local-anon')).toBe(false);
    store.dispose();
  });

  it('IndexedDB 가 공간 부족으로 실패할 때만 localFull, 그 밖의 실패는 localStorage 비상 사본', async () => {
    const db = memoryNoteDb();
    const store = new SermonStore(ANONYMOUS_USER, { noteDb: async () => db });
    await store.init();

    db.fail = new DOMException('full', 'QuotaExceededError');
    store.save(note({ id: 'local-a' }));
    await vi.waitFor(() => expect(store.status.localFull).toBe(true));
    expect(syncLabel(store.status).state).toBe('warn');

    // 다음 쓰기가 되면 풀린다
    store.save(note({ id: 'local-a', body: '<p>다시</p>' }));
    await vi.waitFor(() => expect(store.status.localFull).toBe(false));
    expect(db.rows.get(ANONYMOUS_USER)?.get('local-a')?.body).toBe('<p>다시</p>');

    // 공간 부족이 아닌 실패 → localStorage 에 비상 사본, localFull 아님
    db.fail = new Error('connection closed');
    store.save(note({ id: 'local-a', body: '<p>비상</p>' }));
    await vi.waitFor(() =>
      expect(localStorage.getItem(SermonStore.keyFor(ANONYMOUS_USER))).toContain('비상'),
    );
    expect(store.status.localFull).toBe(false);
    // IndexedDB 가 다시 되면 비상 사본은 지운다
    store.save(note({ id: 'local-a', body: '<p>복구</p>' }));
    await vi.waitFor(() =>
      expect(localStorage.getItem(SermonStore.keyFor(ANONYMOUS_USER))).toBeNull(),
    );
    expect(db.rows.get(ANONYMOUS_USER)?.get('local-a')?.body).toBe('<p>복구</p>');
    store.dispose();
  });

  it('IndexedDB 를 못 쓰면 예전처럼 localStorage 에 쓴다', async () => {
    const store = new SermonStore(ANONYMOUS_USER, { noteDb: async () => null });
    await store.init();
    expect(store.status.localOk).toBe(true);
    store.save(note({ id: 'local-a', title: 'LS' }));
    const raw = JSON.parse(localStorage.getItem(SermonStore.keyFor(ANONYMOUS_USER)) as string);
    expect(raw.notes[0].title).toBe('LS');
    store.dispose();
  });
});

describe('서버 노트 보관 한도 (PF004)', () => {
  it('한도면 새 노트는 기기에만 두고 알린다. 다시 저장해도 바로 재시도하지 않고, 있던 노트 수정은 올린다', async () => {
    api.listDocs.mockResolvedValue([remoteDoc(note(), T0)]);
    api.getDoc.mockResolvedValue(remoteDoc(note(), T0));
    api.createDoc.mockRejectedValue({ code: 'PF004', status: 400 });
    const store = new SermonStore(USER, { noteDb: async () => memoryNoteDb() });
    await store.init();

    store.save(note({ id: 'local-new', title: '새 노트' }));
    await vi.waitFor(() => expect(store.status.limit).toBe(true));
    expect(syncLabel(store.status)).toEqual({
      text: '노트 보관 한도에 닿았어요 · 이 기기에만 저장돼요',
      state: 'warn',
    });
    expect(api.createDoc).toHaveBeenCalledTimes(1);

    // 있던 노트를 고치면 그건 올라가고, 새 노트 생성은 다시 부르지 않는다
    store.save(note({ body: '<p>수정</p>' }));
    await vi.waitFor(() => expect(api.updateDoc).toHaveBeenCalledTimes(1));
    await tick(20);
    expect(api.createDoc).toHaveBeenCalledTimes(1);
    expect(store.status.limit).toBe(true);
    expect(store.get('local-new')).toBeTruthy();

    // 노트를 지워 자리가 나면 바로 다시 올려 본다
    api.createDoc.mockResolvedValue({ id: 'srv9', updated_at: T0 });
    store.remove('doc1');
    await vi.waitFor(() => expect(store.get('srv9')?.title).toBe('새 노트'));
    await vi.waitFor(() => expect(store.status.limit).toBe(false));
    store.dispose();
  });
});

describe('오프라인 생각 첨부 대기열', () => {
  it('노트가 서버 id 를 받은 뒤 local- 첨부를 올리고 생각의 첨부 id·URL 을 바꾼다', async () => {
    const queued = await sermonMediaQueue.put(
      USER,
      new Blob(['jpeg'], { type: 'image/jpeg' }),
      'image',
      'p.jpg',
    );
    expect(queued.id.startsWith('local-')).toBe(true);
    media.uploadPreparedMedia.mockResolvedValue({
      id: 'file1',
      type: 'image',
      url: 'https://cdn/x.jpg',
      thumb: 'https://cdn/x_t.jpg',
    });
    const db = memoryNoteDb();
    await db.write(USER, [note({ id: 'local-n', thoughts: [thought([queued.id])] })], [], {
      dirty: ['local-n'],
      deleted: [],
      synced: [],
    });
    const store = new SermonStore(USER, { noteDb: async () => db });
    expect(store.status.pending).toBe(0);
    await store.init();
    await vi.waitFor(() => expect(store.status.pending).toBe(0));

    const saved = store.get('srv1');
    expect(saved?.thoughts[0].media[0]).toEqual({
      id: 'file1',
      type: 'image',
      url: 'https://cdn/x.jpg',
      thumb: 'https://cdn/x_t.jpg',
    });
    expect(media.uploadPreparedMedia).toHaveBeenCalledTimes(1);
    expect(await sermonMediaQueue.get(queued.id)).toBeNull();
    // 바뀐 첨부 id 가 서버 문서에도 올라간다
    expect(api.updateDoc).toHaveBeenCalledWith(
      'sermon',
      'srv1',
      expect.objectContaining({
        content: expect.objectContaining({
          thoughts: [
            expect.objectContaining({ media: [expect.objectContaining({ id: 'file1' })] }),
          ],
        }),
      }),
    );

    // 편집기가 들고 있던 옛 사본(local- 첨부)으로 저장해도 올라간 첨부를 지킨다
    store.save({ ...saved!, thoughts: [thought([queued.id])], body: '<p>더</p>' });
    expect(store.get('srv1')?.thoughts[0].media[0].id).toBe('file1');
    store.dispose();
  });

  it('이 기기에서 붙인 파일이 없거나 서버가 거절하면 lost, 다른 기기 첨부는 건드리지 않는다', async () => {
    const missingHere = localFileId('m');
    const otherDevice = 'local-otherdev-m123';
    const rejected = await sermonMediaQueue.put(
      USER,
      new Blob(['v'], { type: 'video/mp4' }),
      'video',
      'v.mp4',
    );
    media.uploadPreparedMedia.mockRejectedValue(new media.MediaUploadError('rejected'));
    const db = memoryNoteDb();
    await db.write(
      USER,
      [note({ id: 'doc1', thoughts: [thought([missingHere, rejected.id, otherDevice])] })],
      [],
      { dirty: ['doc1'], deleted: [], synced: [['doc1', T0]] },
    );
    api.listDocs.mockResolvedValue([remoteDoc(note(), T0)]);
    const store = new SermonStore(USER, { noteDb: async () => db });
    await store.init();
    await vi.waitFor(() => expect(store.status.pending).toBe(0));
    const m = store.get('doc1')!.thoughts[0].media;
    expect(m.map((x) => [x.id, x.lost])).toEqual([
      [missingHere, true],
      [rejected.id, true],
      [otherDevice, undefined], // 그 기기가 올린다 — 여기서 lost 로 적으면 영영 안 올라간다
    ]);
    expect(media.uploadPreparedMedia).toHaveBeenCalledTimes(1);
    // 거절된 파일은 이 기기에서 계속 볼 수 있게 남긴다
    expect(await sermonMediaQueue.get(rejected.id)).not.toBeNull();
    store.dispose();
  });

  it('조각이 없는 녹음 토막은 이 기기에서 녹음한 것만 lost — 다른 기기 토막은 그 기기가 올린다', async () => {
    const here = localFileId('a');
    const other = 'local-otherdev-a123';
    const seg = (id: string) => ({
      id,
      url: null,
      mime: 'audio/webm',
      offset: 0,
      duration: 700,
      size: 10,
    });
    const db = memoryNoteDb();
    await db.write(USER, [note({ id: 'doc1', audio: { segments: [seg(here), seg(other)] } })], [], {
      dirty: [],
      deleted: [],
      synced: [['doc1', T0]],
    });
    api.listDocs.mockResolvedValue([remoteDoc(note(), T0)]);
    const store = new SermonStore(USER, { noteDb: async () => db });
    await store.init();
    await vi.waitFor(() =>
      expect(store.get('doc1')!.audio!.segments.map((x) => [x.id, x.lost])).toEqual([
        [here, true],
        [other, undefined],
      ]),
    );
    store.dispose();
  });

  it('연결 실패면 첨부는 그대로 두고 다시 시도한다', async () => {
    const q = await sermonMediaQueue.put(
      USER,
      new Blob(['jpeg'], { type: 'image/jpeg' }),
      'image',
      'p.jpg',
    );
    media.uploadPreparedMedia.mockRejectedValue(new media.MediaUploadError('upload_failed'));
    const db = memoryNoteDb();
    await db.write(USER, [note({ id: 'doc1', thoughts: [thought([q.id])] })], [], {
      dirty: [],
      deleted: [],
      synced: [['doc1', T0]],
    });
    api.listDocs.mockResolvedValue([remoteDoc(note(), T0)]);
    const store = new SermonStore(USER, { noteDb: async () => db });
    await store.init();
    await vi.waitFor(() => expect(media.uploadPreparedMedia).toHaveBeenCalled());
    await tick(20);
    expect(store.status.online).toBe(false);
    expect(store.status.pending).toBe(1);
    expect(store.get('doc1')!.thoughts[0].media[0]).toMatchObject({ id: q.id });
    expect(store.get('doc1')!.thoughts[0].media[0].lost).toBeUndefined();
    expect(await sermonMediaQueue.get(q.id)).not.toBeNull();
    store.dispose();
  });
});
