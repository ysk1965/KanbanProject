import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinePlan } from './readingApi';
import { nextOnPath, planToday, sortForToday } from './readingStore';

vi.mock('./readingApi', () => ({ readingAPI: {} }));
vi.mock('../group/GroupContext', () => ({ useSermonGroups: () => null }));

const TODAY = '2026-10-26';

const plan = (id: string, over: Partial<MinePlan>): MinePlan => ({
  id,
  title: id,
  template: 'custom',
  start_date: '2026-10-20',
  end_date: '2026-12-31',
  total_days: 60,
  my_done_days: 0,
  behind_days: 0,
  ...over,
});

const due = (date: string, chapter: string, day_no = 1) => ({ day_no, date, chapter });

describe('오늘 읽을 곳 — readingStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 9));
  });
  afterEach(() => vi.useRealTimers());

  it('planToday — 밀린 장과 오늘 장을 나누고, 다 읽었는지 안다', () => {
    const p = plan('a', {
      due: [due('2026-10-25', '0:1'), due(TODAY, '0:3', 2)],
      today_chapters: [
        { chapter: '0:2', done: true },
        { chapter: '0:3', done: false },
      ],
    });
    const t = planToday(p, TODAY);
    expect(t.late.map((d) => d.chapter)).toEqual(['0:1']);
    expect(t.left).toBe(2);
    expect(t.done).toBe(false);
    expect(
      planToday(plan('b', { due: [], today_chapters: [{ chapter: '0:1', done: true }] })).done,
    ).toBe(true);
  });

  it('sortForToday — 다 읽은 길은 뒤로, 안 읽은 길(밀린 길 먼저)이 앞으로', () => {
    const done = plan('done', { due: [], today_chapters: [{ chapter: '0:1', done: true }] });
    const todo = plan('todo', {
      due: [due(TODAY, '0:2')],
      today_chapters: [{ chapter: '0:2', done: false }],
    });
    const late = plan('late', { due: [due('2026-10-24', '18:1')] });
    const rest = plan('rest', { due: [] });
    expect(sortForToday([done, rest, todo, late]).map((p) => p.id)).toEqual([
      'late',
      'todo',
      'done',
      'rest',
    ]);
  });

  it('nextOnPath — 길 위의 장이면 다음 오늘 장 + 「오늘 n/m」', () => {
    const p = plan('a', {
      due: [due(TODAY, '0:1'), due(TODAY, '0:2'), due(TODAY, '0:3')],
      today_chapters: [
        { chapter: '0:1', done: false },
        { chapter: '0:2', done: false },
        { chapter: '0:3', done: false },
      ],
    });
    expect(nextOnPath([p], '0:1')).toEqual({ chapter: '0:2', tag: '오늘 2/3' });
  });

  it('nextOnPath — 길과 상관없는 장이면 null (성경 순서 그대로)', () => {
    const p = plan('a', {
      due: [due(TODAY, '0:1')],
      today_chapters: [{ chapter: '0:1', done: false }],
    });
    expect(nextOnPath([p], '44:1')).toBeNull();
    expect(nextOnPath(null, '0:1')).toBeNull();
  });

  it('nextOnPath — 밀린 장이 남았으면 그쪽으로, 「밀린 장」', () => {
    const p = plan('a', {
      due: [due('2026-10-25', '0:5'), due(TODAY, '0:7', 2)],
      today_chapters: [
        { chapter: '0:6', done: true },
        { chapter: '0:7', done: false },
      ],
    });
    expect(nextOnPath([p], '0:6')).toEqual({ chapter: '0:5', tag: '밀린 장' });
  });
});
