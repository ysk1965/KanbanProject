import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteGroupLink, SermonNote } from '../sermonTypes';
import type { SermonGroup } from './groupApi';

/** 모임 공개 사본 — 못 보낸 PUT/DELETE 를 기기 큐에 남겨 다시 보낸다 (최신 노트 내용으로) */

const g = vi.hoisted(() => ({
  putShare: vi.fn(),
  deleteShare: vi.fn(),
  resolveSession: vi.fn(),
  list: vi.fn(),
  week: vi.fn(),
}));
vi.mock('./groupApi', () => ({ sermonGroupAPI: g }));
vi.mock('../sermonStore', () => ({ ANONYMOUS_USER: 'anon' }));
vi.mock('../useBible', () => ({ verses: () => null }));

import { groupStoreFor, removeShare, resetGroupStores, syncNoteShares } from './groupStore';

const group = { id: 'g1', name: '모임', me: { status: 'active' } } as unknown as SermonGroup;
const link: NoteGroupLink = { group_id: 'g1', session_id: 's1', date: '2026-10-25', how: 'manual' };

function note(over: Partial<SermonNote> = {}): SermonNote {
  return {
    id: 'doc1',
    title: '처음 제목',
    preacher: '',
    service: '',
    date: '2026-10-25',
    refs: [],
    body: '',
    thoughts: [],
    elapsed: 0,
    created_at: 1,
    updated_at: 1,
    groups: [link],
    ...over,
  } as SermonNote;
}

function setup(userId = 'u1') {
  const store = groupStoreFor(userId);
  store.upsert(group);
  store.loaded = true;
  return store;
}

const QKEY = 'sermon-share-q-v1:u1';

beforeEach(() => {
  localStorage.clear();
  resetGroupStores();
  for (const m of Object.values(g)) m.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('공개 사본 다시 보내기', () => {
  it('PUT 이 끊기면 큐에 남고, 붙인 뒤 최신 노트 내용으로 다시 보낸다', async () => {
    const store = setup();
    g.putShare.mockRejectedValueOnce({ status: 503 }).mockResolvedValue({});
    syncNoteShares(store, note(), () => undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(g.putShare).toHaveBeenCalledTimes(1);
    expect(store.pendingShares()).toMatchObject([{ op: 'put', note_id: 'doc1', group_id: 'g1' }]);
    expect(JSON.parse(localStorage.getItem(QKEY) || '[]')).toHaveLength(1);

    let latest = note({ title: '고친 제목', updated_at: 2 });
    store.attachNotes({
      get: (id) => (id === latest.id ? latest : undefined),
      ready: () => true,
      settled: () => true,
      onLinked: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(g.putShare).toHaveBeenCalledTimes(2);
    expect(g.putShare.mock.calls[1][1]).toMatchObject({ note_id: 'doc1', my_title: '고친 제목' });
    expect(store.pendingShares()).toEqual([]);
    expect(localStorage.getItem(QKEY)).toBeNull();
    latest = note();
  });

  it('앱을 다시 켜도 큐가 남아 있고, 노트 저장소가 준비되기 전엔 기다린다', async () => {
    const s1 = setup();
    g.putShare.mockRejectedValueOnce({ status: 500 }).mockResolvedValue({});
    syncNoteShares(s1, note(), () => undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    resetGroupStores();

    const store = setup();
    expect(store.pendingShares()).toHaveLength(1);
    let ready = false;
    store.attachNotes({
      get: () => note(),
      ready: () => ready,
      settled: () => true,
      onLinked: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(g.putShare).toHaveBeenCalledTimes(1);
    expect(store.pendingShares()).toHaveLength(1);
    ready = true;
    await vi.advanceTimersByTimeAsync(8000);
    expect(g.putShare).toHaveBeenCalledTimes(2);
    expect(store.pendingShares()).toEqual([]);
  });

  it('로컬 id 로 남은 PUT 은 서버 id 로 바뀐 뒤 서버 id 로 보낸다', async () => {
    const store = setup();
    g.putShare.mockRejectedValueOnce({ status: 503 }).mockResolvedValue({});
    syncNoteShares(store, note({ id: 'local-x' }), () => undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    store.remapShares('local-x', 'doc9');
    expect(store.pendingShares()).toMatchObject([{ note_id: 'doc9' }]);
    store.attachNotes({
      get: (id) => (id === 'doc9' ? note({ id: 'doc9' }) : undefined),
      ready: () => true,
      settled: () => true,
      onLinked: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(g.putShare.mock.calls[1][1]).toMatchObject({ note_id: 'doc9' });
    expect(store.pendingShares()).toEqual([]);
  });

  it('지운 노트의 PUT 은 버린다 (서버가 노트와 함께 사본을 지운다)', async () => {
    const store = setup();
    g.putShare.mockRejectedValueOnce({ status: 503 });
    syncNoteShares(store, note(), () => undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    store.attachNotes({
      get: () => undefined,
      ready: () => true,
      settled: () => true,
      onLinked: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(g.putShare).toHaveBeenCalledTimes(1);
    expect(store.pendingShares()).toEqual([]);
  });

  it('removeShare: DELETE 가 끊기면 큐에, online 이 되면 다시 · 404 는 끝난 것', async () => {
    const store = setup();
    g.deleteShare.mockRejectedValueOnce({ status: 503 }).mockResolvedValue(undefined);
    await removeShare(store, link, 'doc1');
    expect(store.pendingShares()).toMatchObject([{ op: 'delete', session_id: 's1' }]);
    store.attachNotes({
      get: () => note(),
      ready: () => true,
      settled: () => false,
      onLinked: () => undefined,
    });
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(g.deleteShare).toHaveBeenCalledTimes(2);
    expect(store.pendingShares()).toEqual([]);

    g.deleteShare.mockReset();
    g.deleteShare.mockRejectedValue({ status: 404 });
    await removeShare(store, { ...link, session_id: 's2' }, 'doc1');
    expect(store.pendingShares()).toEqual([]);
  });

  it('지운 노트의 DELETE 실패는 노트 삭제가 서버에 올라간 뒤 버린다', async () => {
    const store = setup();
    g.deleteShare.mockRejectedValue({ status: 503 });
    await removeShare(store, link, 'doc1');
    let settled = false;
    store.attachNotes({
      get: () => undefined,
      ready: () => true,
      settled: () => settled,
      onLinked: () => undefined,
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(g.deleteShare).toHaveBeenCalledTimes(2);
    expect(store.pendingShares()).toHaveLength(1);
    settled = true;
    await vi.advanceTimersByTimeAsync(8000);
    expect(g.deleteShare).toHaveBeenCalledTimes(2);
    expect(store.pendingShares()).toEqual([]);
  });

  it('모임에서 뺀(off) 노트: DELETE 실패도 큐에 남는다, 403 PUT 은 버린다', async () => {
    const store = setup();
    g.deleteShare.mockRejectedValueOnce({ status: 502 });
    syncNoteShares(store, note({ groups: [{ ...link, off: true }] }), () => undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.pendingShares()).toMatchObject([{ op: 'delete', session_id: 's1' }]);

    g.putShare.mockRejectedValueOnce({ status: 403 });
    syncNoteShares(store, note({ id: 'doc2' }), () => undefined, 0);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.pendingShares().filter((o) => o.op === 'put')).toEqual([]);
  });

  it('익명은 큐를 쓰지 않는다', async () => {
    const store = groupStoreFor('anon');
    await removeShare(store, link, 'doc1');
    expect(store.pendingShares()).toEqual([]);
    expect(g.deleteShare).not.toHaveBeenCalled();
  });
});
