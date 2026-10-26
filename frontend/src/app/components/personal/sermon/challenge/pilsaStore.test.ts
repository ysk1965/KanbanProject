import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayString, type SermonNote } from '../sermonTypes';
import { pilsaWeekKey } from './pilsaPlan';

/** 로그인 사용자 — 서버 계획 고정 · 절 전송 · 실패 큐 · PIL004 버림 · 달란트 뒤 지갑 새로고침 */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../../../utils/api', () => ({ apiClient: api }));
vi.mock('../../../../utils/services', () => ({ personalFeatureAPI: {} }));
vi.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => ({}) }));
vi.mock('../useBible', () => ({ useBible: () => ({ bible: null, failed: false }) }));

const bible: string[][][] = Array.from({ length: 66 }, (_, b) =>
  Array.from({ length: b === 44 ? 16 : 30 }, () => ['가', '나', '다']),
);
const note = {
  id: 'n',
  title: 't',
  date: todayString(),
  refs: ['44:5:1-2'],
  body: '',
  thoughts: [],
} as unknown as SermonNote;

const WEEK = pilsaWeekKey();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  localStorage.clear();
  for (const m of Object.values(api)) m.mockReset();
  const { resetPilsaStores } = await import('./pilsaStore');
  resetPilsaStores();
});

describe('pilsaStore (로그인)', () => {
  it('서버가 비었으면 고른 계획을 PUT 하고, 돌려준 것을 따른다', async () => {
    const { pilsaStoreFor } = await import('./pilsaStore');
    api.get.mockResolvedValueOnce({ week: WEEK, chapters: [] });
    api.put.mockImplementation((_u: string, body: { week: string; chapters: unknown[] }) =>
      Promise.resolve({
        week: body.week,
        chapters: [
          { b: 0, c: 1, reason: 'common', verses: 3, done: [2] },
          ...body.chapters.slice(1),
        ],
      }),
    );
    const s = pilsaStoreFor('u1', false);
    s.ensure([note], bible);
    expect(s.plan?.synced).toBe(false);
    expect(s.plan?.chapters[0]).toMatchObject({ b: 44, c: 5, reason: 'main' });
    await s.sync();
    expect(api.put).toHaveBeenCalledWith(
      '/challenge/pilsa/week',
      expect.objectContaining({ week: WEEK }),
    );
    expect(s.plan?.synced).toBe(true);
    expect(s.plan?.week).toBe(WEEK);
    expect(s.plan?.chapters[0]).toMatchObject({ b: 0, c: 1, done: [2] });

    // 노트가 바뀌어도 그 주 계획은 그대로
    s.ensure([{ ...note, refs: ['1:1:1-1'] }], bible);
    expect(s.plan?.chapters[0]).toMatchObject({ b: 0, c: 1 });
  });

  it('서버에 장이 있으면 그것을 쓰고 쓴 절은 합친다 · 달란트면 지갑 새로고침', async () => {
    const { pilsaStoreFor } = await import('./pilsaStore');
    const chapters = Array.from({ length: 7 }, (_, i) => ({
      b: 44,
      c: i + 1,
      reason: 'near',
      verses: 2,
      done: i === 0 ? [1] : [],
    }));
    api.get.mockImplementation((url: string) =>
      url === '/challenge/pilsa/week'
        ? Promise.resolve({ week: WEEK, chapters })
        : Promise.resolve({ balance: 5 }),
    );
    const s = pilsaStoreFor('u2', false);
    s.ensure([note], null);
    await s.sync();
    expect(api.put).not.toHaveBeenCalled();
    expect(s.plan?.chapters[0].done).toEqual([1]);

    api.post.mockResolvedValueOnce({ b: 44, c: 1, done: [1, 2], chapter_done: true, awarded: 5 });
    const r = await s.markVerse(44, 1, 2, 10, 5000);
    expect(api.post).toHaveBeenCalledWith('/challenge/pilsa/verses', {
      week: WEEK,
      b: 44,
      c: 1,
      v: 2,
      chars: 10,
      ms: 5000,
    });
    expect(r).toEqual({ chapterDone: true, weekDone: false, awarded: 5 });
    await flush();
    expect(api.get).toHaveBeenCalledWith('/challenge/wallet');
  });

  it('끊기면 큐에 남겨 다시 보내고, PIL004 는 버린다', async () => {
    const { pilsaStoreFor } = await import('./pilsaStore');
    const chapters = Array.from({ length: 7 }, (_, i) => ({
      b: 44,
      c: i + 1,
      reason: 'near',
      verses: 3,
      done: [],
    }));
    api.get.mockResolvedValue({ week: WEEK, chapters });
    const s = pilsaStoreFor('u3', false);
    s.ensure([note], null);
    await s.sync();

    api.post.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const r = await s.markVerse(44, 2, 1, 10, 5000);
    expect(r.awarded).toBe(0);
    expect(s.plan?.chapters[1].done).toEqual([1]);
    const saved = JSON.parse(localStorage.getItem('sermon-pilsa-v1:u3') || '{}');
    expect(saved.queue).toHaveLength(1);

    api.post.mockResolvedValueOnce({ b: 44, c: 2, done: [1] });
    await s.sync();
    expect(JSON.parse(localStorage.getItem('sermon-pilsa-v1:u3') || '{}').queue).toHaveLength(0);

    api.post.mockRejectedValueOnce({ code: 'PIL004', status: 422 });
    await s.markVerse(44, 2, 2, 50, 100);
    expect(JSON.parse(localStorage.getItem('sermon-pilsa-v1:u3') || '{}').queue).toHaveLength(0);
    expect(s.plan?.chapters[1].done).toEqual([1, 2]);
  });
});
