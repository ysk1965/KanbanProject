import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SermonNote, Thought } from '../sermonTypes';
import type { Highlight } from '../bibleHighlights';
import type { MinePlan } from '../reading/readingApi';
import { emptyPlan, type WeekPlan } from '../weekPlan';
import { DONE_MIN_MS, buildSnapshot, type SnapshotInput } from './widgetSnapshot';
import { applyPending } from './widgetPending';

const HOUR = 3600_000;
const ROM = 44;
// 2026-10-29 (목) 오전 10시 — 퀘스트 주는 10.26(월)부터, 한 주 동안은 10.25(일)부터
const NOW = new Date(2026, 9, 29, 10, 0, 0);

function note(
  id: string,
  date: string,
  thoughts: Partial<Thought>[] = [],
  extra: Partial<SermonNote> = {},
): SermonNote {
  return {
    id,
    date,
    title: '환난 중에도 즐거워하는 이유',
    refs: [],
    body: '',
    elapsed: 0,
    created_at: 0,
    updated_at: 0,
    thoughts: thoughts.map((t, i) => ({
      id: `t${i}`,
      tag: '적용',
      text: '',
      media: [],
      t: null,
      aid: null,
      label: null,
      at: NOW.getTime() - 20 * HOUR,
      ...t,
    })),
    ...extra,
  } as unknown as SermonNote;
}

const verseText = (b: number, c: number, v: number) => `${b}권 ${c}장 ${v}절 본문`;

function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    notes: [],
    plan: emptyPlan('2026-10-25'),
    cats: { cats: [{ id: 'todo', name: '할 일', color: 'g1', icon: 'tag' }], updated_at: 0 },
    anonymous: false,
    ink: {
      g1: '#c3b5f5',
      g2: '#ffb3d1',
      g3: '#a9dfc6',
      t1: '#5a45b8',
      t2: '#b8336f',
      g1d: '#cbbff7',
      g2d: '#ffbfd8',
      g3d: '#b5e6cf',
      paper: '#fcf8fb',
      desk: '#f3ecf3',
      card: '#fffdfe',
      card2: '#f6eff6',
    },
    highlights: [],
    plans: null,
    verseText,
    now: NOW,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('갈피 퀘스트', () => {
  it('이번 주 노트가 없으면 0/53', () => {
    const q = buildSnapshot(input()).quest;
    expect(q).toMatchObject({
      week_start: '2026-10-26',
      note: false,
      apply: false,
      done: false,
      earned: 0,
      total: 53,
    });
    expect(q.target).toBeNull();
  });

  it('노트 + 적용 10자 이상이면 두 걸음(23), 삶에 꽂을 적용과 풀리는 시각', () => {
    const at = NOW.getTime() - 2 * HOUR;
    const n = note('n1', '2026-10-27', [{ text: '어머니께 먼저 전화하기 꼭', at }], {
      refs: [`${ROM}:5:3-4`],
    } as Partial<SermonNote>);
    const q = buildSnapshot(input({ notes: [n] })).quest;
    expect(q).toMatchObject({ note: true, apply: true, done: false, earned: 23 });
    expect(q.target).toEqual({
      note_id: 'n1',
      thought_id: 't0',
      text: '어머니께 먼저 전화하기 꼭',
      unlock_at: at + DONE_MIN_MS,
    });
    expect(q.sermon?.ref).toBe('로마서 5:3-4');
  });

  it('서버 판정이 있으면 그쪽을 따른다 (노트 기준 미달)', () => {
    const n = note('n1', '2026-10-27');
    const q = buildSnapshot(
      input({ notes: [n], weekComplete: { note: false, apply_done: false } }),
    ).quest;
    expect(q.note).toBe(false);
  });

  it('세 걸음 다 하면 53, 익명은 잠금 없음', () => {
    const n = note('n1', '2026-10-27', [
      { text: '어머니께 먼저 전화하기 꼭', done: true, done_at: NOW.getTime() - HOUR },
    ]);
    expect(buildSnapshot(input({ notes: [n] })).quest.earned).toBe(53);
    const m = note('n2', '2026-10-27', [{ text: '어머니께 먼저 전화하기 꼭' }]);
    expect(buildSnapshot(input({ notes: [m], anonymous: true })).quest.target?.unlock_at).toBe(0);
  });
});

describe('오늘 할 일', () => {
  it('오늘부터 토요일까지 그날의 할 일, 못 한 지난 일은 오늘로 넘어온다', () => {
    const plan: WeekPlan = {
      week: '2026-10-25',
      updated_at: 1,
      items: [
        {
          id: 'p1',
          text: '중보기도 명단 3명',
          rep: 'once',
          cat: 'todo',
          day: '2026-10-28',
          created_at: 0,
        },
        {
          id: 'p2',
          text: '아침 묵상',
          rep: 'daily',
          cat: 'todo',
          from: '2026-10-25',
          log: ['2026-10-29'],
          created_at: 0,
        },
      ],
    };
    const n = note('n1', '2026-10-25', [{ text: '어머니께 먼저 전화하기' }]);
    const t = buildSnapshot(input({ notes: [n], plan })).today;
    expect(t.week).toBe('2026-10-25');
    expect(Object.keys(t.days)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
    const today = t.days['2026-10-29'];
    expect(today.map((x) => [x.key, x.done, x.carry, x.kind])).toEqual([
      ['n1|t0', false, '2026-10-25', 'apply'],
      ['p1', false, '2026-10-28', 'plan'],
      ['p2', true, null, 'plan'],
    ]);
    expect(t.days['2026-10-30'].find((x) => x.key === 'p2')?.done).toBe(false);
    expect(t.cats.map((c) => c.id)).toEqual(['galpi', 'todo']);
  });
});

describe('오늘의 말씀', () => {
  it('A 이번 주 설교 말씀은 주제말씀 본문', () => {
    const n = note('n1', '2026-10-25', [], { refs: [`${ROM}:5:3-4`] } as Partial<SermonNote>);
    const w = buildSnapshot(input({ notes: [n] })).verse.week;
    expect(w).toMatchObject({ ref: '로마서 5:3-4', b: ROM, c: 5, v: 3, note_id: 'n1' });
    expect(w?.text).toBe('44권 5장 3절 본문 44권 5장 4절 본문');
  });

  it('성경 본문이 없으면 말씀 칸은 비운다', () => {
    const n = note('n1', '2026-10-25', [], { refs: [`${ROM}:5:3-4`] } as Partial<SermonNote>);
    const v = buildSnapshot(input({ notes: [n], verseText: null })).verse;
    expect(v.week).toBeNull();
    expect(v.lines).toEqual({});
  });

  it('B 형광펜은 7일치를 날짜로 고르고 같은 날엔 늘 같다', () => {
    const hl = (id: string, b: number, c: number, v: number): Highlight => ({
      id,
      b,
      c,
      v1: v,
      v2: v,
      s: null,
      e: null,
      color: 'green',
      ul: false,
      memo: '',
      at: 1,
    });
    const highlights = [hl('a', 18, 23, 1), hl('b', ROM, 8, 28), hl('c', 42, 3, 16)];
    const a = buildSnapshot(input({ highlights })).verse.lines;
    const b = buildSnapshot(input({ highlights: [...highlights].reverse() })).verse.lines;
    expect(Object.keys(a)).toHaveLength(7);
    expect(a).toEqual(b);
    expect(a['2026-10-29'].text).toMatch(/본문$/);
  });

  it('C 오늘 읽을 곳은 안 읽은 길을 먼저', () => {
    const plans = [
      {
        id: 'p-done',
        title: '시편',
        template: '',
        start_date: '',
        end_date: '',
        total_days: 30,
        my_done_days: 3,
        behind_days: 0,
        due: [],
        today_chapters: [{ chapter: '18:1', done: true }],
      },
      {
        id: 'p-rom',
        title: '로마서 통독',
        template: '',
        start_date: '',
        end_date: '',
        total_days: 16,
        my_done_days: 5,
        behind_days: 0,
        due: [{ day_no: 6, date: '2026-10-29', chapter: `${ROM}:7` }],
        today_chapters: [
          { chapter: `${ROM}:6`, done: true },
          { chapter: `${ROM}:7`, done: false },
        ],
      },
    ] as MinePlan[];
    const r = buildSnapshot(input({ plans })).verse.reading;
    expect(r).toMatchObject({
      plan_title: '로마서 통독',
      label: '로마서 6–7장',
      short: '롬 6–7',
      next: `${ROM}:7`,
      others: 1,
      late: 0,
    });
  });
});

describe('위젯 체크 옮기기', () => {
  it('done 값으로 맞추고, 같은 체크를 두 번 받아도 한 번만 바뀐다', () => {
    let n = note('n1', '2026-10-25', [{ text: '어머니께 먼저 전화하기' }]);
    let plan: WeekPlan = {
      week: '2026-10-25',
      updated_at: 1,
      items: [
        { id: 'p1', text: '중보기도', rep: 'once', cat: 'todo', day: '2026-10-29', created_at: 0 },
      ],
    };
    const to = {
      getNote: () => n,
      saveNote: (x: SermonNote) => {
        n = x;
      },
      updatePlan: (_w: string, fn: (p: WeekPlan) => WeekPlan) => {
        plan = fn(plan);
      },
      today: '2026-10-29',
    };
    const ops = [
      { id: '1', op: 'apply' as const, done: true, at: 5, note_id: 'n1', thought_id: 't0' },
      {
        id: '2',
        op: 'plan' as const,
        done: true,
        at: 6,
        plan_id: 'p1',
        rep: 'once' as const,
        date: '2026-10-29',
        week: '2026-10-25',
      },
      {
        id: '3',
        op: 'plan' as const,
        done: true,
        at: 7,
        plan_id: 'p1',
        rep: 'once' as const,
        date: '2026-10-29',
        week: '2026-10-25',
      },
    ];
    expect(applyPending(ops, to)).toBe(2);
    expect(n.thoughts[0]).toMatchObject({ done: true, done_at: 5 });
    expect(plan.items[0].done_on).toBe('2026-10-29');
    expect(applyPending(ops, to)).toBe(0);
  });
});
