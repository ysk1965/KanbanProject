import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** 버전 기록 서버 보관 — 올림 큐 · 로컬 id 는 remap 뒤 · 익명은 안 함 · 끊기면 다시 · SNV001 은 버림 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../../utils/api', () => ({ apiClient: api }));

import {
  dropVersions,
  flushVersionUploads,
  kickVersionUploads,
  listVersions,
  mergeVersionLists,
  parseServerAt,
  pendingVersionUploads,
  remapVersions,
  resetVersionUploaders,
  saveVersion,
} from './sermonVersions';

beforeEach(() => {
  localStorage.clear();
  resetVersionUploaders();
  for (const m of Object.values(api)) m.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('버전 기록 서버 보관', () => {
  it('서버 id 노트의 새 버전은 1.5초 모아 PUT (본문은 기기 버전에서)', async () => {
    api.put.mockResolvedValue({});
    const v = saveVersion('u1', 'doc1', '제목', '<p>본문</p>', 'auto')!;
    expect(pendingVersionUploads('u1')).toBe(1);
    expect(api.put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.put).toHaveBeenCalledWith(`/sermon-notes/doc1/versions/${v.id}`, {
      reason: 'auto',
      title: '제목',
      body: '<p>본문</p>',
      chars: 2,
      at: v.at,
    });
    expect(pendingVersionUploads('u1')).toBe(0);
  });

  it('로컬 노트 버전은 서버 id 로 바뀐 뒤 올라간다', async () => {
    api.put.mockResolvedValue({});
    saveVersion('u1', 'local-n1', '', '<p>a</p>', 'open');
    expect(pendingVersionUploads('u1')).toBe(0);
    remapVersions('u1', 'local-n1', 'doc2');
    expect(pendingVersionUploads('u1')).toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.put.mock.calls[0][0]).toMatch(/^\/sermon-notes\/doc2\/versions\//);
    expect(listVersions('u1', 'doc2')).toHaveLength(1);
  });

  it('익명은 서버를 부르지 않는다', async () => {
    saveVersion('anon', 'doc3', '', '<p>a</p>', 'auto');
    kickVersionUploads('anon');
    await vi.advanceTimersByTimeAsync(5000);
    expect(pendingVersionUploads('anon')).toBe(0);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('끊기면 큐에 남겨 4초 뒤 다시, 앱을 다시 켜도 남아 있다', async () => {
    api.put.mockRejectedValueOnce({ code: 'UNKNOWN', status: 503 });
    saveVersion('u1', 'doc1', '', '<p>a</p>', 'auto');
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(pendingVersionUploads('u1')).toBe(1);

    // 새로 켠 것처럼 — 큐는 기기에 남아 있다
    resetVersionUploaders();
    api.put.mockResolvedValue({});
    kickVersionUploads('u1');
    await vi.advanceTimersByTimeAsync(1500);
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(pendingVersionUploads('u1')).toBe(0);
  });

  it('백오프: 실패하면 4초 → 8초 간격으로 다시', async () => {
    api.put
      .mockRejectedValueOnce({ status: 500 })
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValue({});
    saveVersion('u1', 'doc1', '', '<p>a</p>', 'auto');
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(4000);
    expect(api.put).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(7000);
    expect(api.put).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.put).toHaveBeenCalledTimes(3);
    expect(pendingVersionUploads('u1')).toBe(0);
  });

  it('online 이 되면 바로 다시', async () => {
    api.put.mockRejectedValueOnce({ status: 503 }).mockResolvedValue({});
    saveVersion('u1', 'doc1', '', '<p>a</p>', 'auto');
    await vi.advanceTimersByTimeAsync(1500);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(pendingVersionUploads('u1')).toBe(0);
  });

  it('SNV001(노트 없음)이면 그 노트 몫은 모두 버리고 다른 노트는 계속', async () => {
    api.put.mockImplementation((url: string) =>
      url.includes('/gone/')
        ? Promise.reject({ code: 'SNV001', status: 404 })
        : Promise.resolve({}),
    );
    saveVersion('u1', 'gone', '', '<p>a</p>', 'open');
    saveVersion('u1', 'gone', '', '<p>b</p>', 'auto');
    saveVersion('u1', 'doc1', '', '<p>c</p>', 'auto');
    expect(pendingVersionUploads('u1')).toBe(3);
    await flushVersionUploads('u1');
    expect(pendingVersionUploads('u1')).toBe(0);
    expect(api.put.mock.calls.filter((c) => String(c[0]).includes('/gone/'))).toHaveLength(1);
    expect(api.put.mock.calls.filter((c) => String(c[0]).includes('/doc1/'))).toHaveLength(1);
  });

  it('노트를 지우면 큐에서도 빠진다', () => {
    saveVersion('u1', 'doc1', '', '<p>a</p>', 'auto');
    dropVersions('u1', 'doc1');
    expect(pendingVersionUploads('u1')).toBe(0);
  });

  it('기기·서버 목록 합치기: id 로 중복 제거, 기기 것(본문 있음) 우선, 최신순', () => {
    const local = [
      {
        id: 'a',
        note_id: 'd',
        at: 3000,
        reason: 'auto' as const,
        title: '',
        body: '<p>a</p>',
        chars: 1,
      },
    ];
    const merged = mergeVersionLists(
      local,
      [
        { id: 'a', note_id: 'd', at: 3000, reason: 'auto' },
        { id: 'b', note_id: 'd', at: 5000, reason: 'close', chars: 9 },
        { id: 'c', note_id: 'd', at: 1000, reason: 'open' },
      ],
      'd',
    );
    expect(merged.map((v) => v.id)).toEqual(['b', 'a', 'c']);
    expect(merged[0]).toMatchObject({ remote: true, chars: 9 });
    expect(merged[0].body).toBeUndefined();
    expect(merged[1].body).toBe('<p>a</p>');
  });

  it('서버 시각: 숫자는 그대로, 존 없는 문자열은 UTC', () => {
    expect(parseServerAt(1700000000000)).toBe(1700000000000);
    expect(parseServerAt('2026-10-25T02:00:00')).toBe(Date.parse('2026-10-25T02:00:00Z'));
    expect(parseServerAt('2026-10-25T11:00:00+09:00')).toBe(Date.parse('2026-10-25T02:00:00Z'));
  });
});
