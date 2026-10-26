import { describe, expect, it } from 'vitest';
import {
  addCategory,
  addItem,
  CAT_MAX,
  dayEntries,
  dayStat,
  emptyPlan,
  GALPI_CAT,
  moveCategory,
  removeCategory,
  removeCategoryItems,
  TODO_CAT,
  tidyCats,
  tidyPlan,
  toggleDaily,
  toggleOnce,
  weekRaw,
  type CatList,
  type WeekPlan,
} from './weekPlan';
import type { SermonNote } from './sermonTypes';

const DAYS = [
  '2026-10-25',
  '2026-10-26',
  '2026-10-27',
  '2026-10-28',
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
];
const TODAY = '2026-10-27';

function note(over: Partial<SermonNote>): SermonNote {
  return {
    id: 'n1',
    title: '한 사람으로 인해',
    preacher: '',
    service: '주일 2부',
    date: '2026-10-25',
    refs: [],
    body: '',
    thoughts: [],
    elapsed: 0,
    created_at: 1,
    updated_at: 1,
    ...over,
  };
}

const on = (p: WeekPlan, d: string, notes: SermonNote[] = []) =>
  dayEntries(weekRaw(notes, p, DAYS, TODAY), d, DAYS, TODAY);

describe('weekPlan — 날짜 단위 · 카테고리', () => {
  it('한 번 할 일은 그날에만, 못 한 지난 일은 오늘로 넘어오고 원래 날엔 「넘김」', () => {
    let p = addItem(emptyPlan(DAYS[0]), {
      text: '장소 정하기',
      rep: 'once',
      cat: 'c1',
      day: '2026-10-26',
    });
    p = addItem(p, { text: '안부 전화', rep: 'once', cat: 'c1', day: TODAY });
    p = addItem(p, { text: '시편 외우기', rep: 'once', cat: 'c1', day: '2026-10-28' });

    const mon = on(p, '2026-10-26');
    expect(mon).toHaveLength(1);
    expect(mon[0]).toMatchObject({ text: '장소 정하기', moved: true, done: false });
    expect(dayStat(mon)).toEqual({ total: 0, done: 0 });

    const tue = on(p, TODAY);
    expect(tue.map((e) => e.text).sort()).toEqual(['안부 전화', '장소 정하기']);
    expect(tue.find((e) => e.text === '장소 정하기')?.carry).toBe('2026-10-26');
    expect(on(p, '2026-10-28').map((e) => e.text)).toEqual(['시편 외우기']);

    // 오늘 하면 오늘 칸에 한 것으로 남고, 원래 날·다른 날엔 안 보인다
    const carried = p.items[0].id;
    p = toggleOnce(p, carried, TODAY);
    expect(on(p, TODAY).find((e) => e.planId === carried)?.done).toBe(true);
    expect(on(p, '2026-10-26')).toHaveLength(0);
    expect(dayStat(on(p, TODAY))).toEqual({ total: 2, done: 1 });
  });

  it('매일 할 일은 정한 날부터 매일, 날마다 따로 체크 · 오늘 이후는 못 누른다', () => {
    let p = addItem(emptyPlan(DAYS[0]), {
      text: '저녁 기도',
      rep: 'daily',
      cat: 'c1',
      day: '2026-10-26',
    });
    const id = p.items[0].id;
    expect(on(p, '2026-10-25')).toHaveLength(0);
    expect(on(p, '2026-10-31')).toHaveLength(1);
    p = toggleDaily(p, id, '2026-10-26', TODAY);
    p = toggleDaily(p, id, '2026-10-30', TODAY);
    expect(p.items[0].log).toEqual(['2026-10-26']);
    expect(on(p, '2026-10-26')[0].done).toBe(true);
    expect(on(p, TODAY)[0].done).toBe(false);
  });

  it('이번 주 노트의 적용은 예배 갈피 칸, 설교 날짜에 — 체크한 날에 한 것으로, 다른 주 노트는 빠진다', () => {
    const done_at = new Date(2026, 9, 26, 21).getTime();
    const notes = [
      note({
        thoughts: [
          {
            id: 't1',
            tag: '적용',
            text: '나부터 돌아보기',
            media: [],
            t: null,
            aid: null,
            label: null,
            at: 1,
          },
          {
            id: 't2',
            tag: '적용',
            text: '감사 적기',
            media: [],
            t: null,
            aid: null,
            label: null,
            at: 1,
            done: true,
            done_at,
          },
          {
            id: 't3',
            tag: '생각',
            text: '그냥 생각',
            media: [],
            t: null,
            aid: null,
            label: null,
            at: 1,
          },
        ],
      }),
      note({
        id: 'old',
        date: '2026-10-18',
        thoughts: [
          {
            id: 'x',
            tag: '적용',
            text: '지난주',
            media: [],
            t: null,
            aid: null,
            label: null,
            at: 1,
          },
        ],
      }),
    ];
    const p = emptyPlan(DAYS[0]);
    const sun = on(p, '2026-10-25', notes);
    expect(sun.map((e) => [e.cat, e.text, e.moved])).toEqual([
      [GALPI_CAT, '나부터 돌아보기', true],
    ]);
    expect(on(p, '2026-10-26', notes).map((e) => [e.text, e.done])).toEqual([['감사 적기', true]]);
    expect(on(p, TODAY, notes).map((e) => [e.text, e.carry])).toEqual([
      ['나부터 돌아보기', '2026-10-25'],
    ]);
  });

  it('예전(카테고리 전) 할 일 — 카테고리 없음은 「할 일」, 날짜 없음은 오늘, 매일은 그 주 일요일부터', () => {
    const p = tidyPlan(DAYS[0], {
      items: [
        { id: 'a', text: '이번 주 안에', rep: 'once', day: null },
        { id: 'b', text: '매일 이걸', rep: 'daily', short: '매일', log: ['2026-10-25', 'oops'] },
        { id: 'c', text: '', rep: 'once' },
        null,
      ],
    });
    expect(p.items.map((x) => x.cat)).toEqual([TODO_CAT, TODO_CAT]);
    expect(p.items[1].log).toEqual(['2026-10-25']);
    expect(
      on(p, TODAY)
        .map((e) => e.text)
        .sort(),
    ).toEqual(['매일 이걸', '이번 주 안에']);
    expect(on(p, '2026-10-25').find((e) => e.text === '매일 이걸')?.done).toBe(true);
  });

  it('카테고리: 5개까지 · 순서 · 지우면 이번 주 할 일도 · 깨진 값 다듬기', () => {
    let l: CatList = { cats: [], updated_at: 0 };
    for (let i = 0; i < CAT_MAX + 2; i++)
      l = addCategory(l, { name: `c${i}`, color: 'g1', icon: 'tag' });
    expect(l.cats).toHaveLength(CAT_MAX);
    const [a, b] = l.cats;
    expect(moveCategory(l, b.id, -1).cats[0].id).toBe(b.id);
    expect(moveCategory(l, a.id, -1)).toBe(l);
    expect(removeCategory(l, a.id).cats).toHaveLength(CAT_MAX - 1);

    let p = addItem(emptyPlan(DAYS[0]), { text: '하나', rep: 'once', cat: a.id, day: TODAY });
    p = addItem(p, { text: '둘', rep: 'once', cat: b.id, day: TODAY });
    expect(removeCategoryItems(p, a.id).items.map((x) => x.text)).toEqual(['둘']);

    const t = tidyCats({
      cats: [
        { id: 'galpi', name: '흉내' },
        { id: 'x', name: '  가정 ', color: 'nope', icon: 'home' },
        { id: 'x', name: '중복' },
        { id: 'y', name: '' },
      ],
    });
    expect(t.cats).toEqual([{ id: 'x', name: '가정', color: 'g1', icon: 'home' }]);
  });

  it('고칠 때마다 updated_at 이 커진다 (같은 밀리초여도)', () => {
    const a = addItem(emptyPlan(DAYS[0]), { text: '하나', rep: 'once', cat: 'c', day: TODAY });
    const b = toggleOnce(a, a.items[0].id, TODAY);
    const c = toggleOnce(b, a.items[0].id, TODAY);
    expect(b.updated_at).toBeGreaterThan(a.updated_at);
    expect(c.updated_at).toBeGreaterThan(b.updated_at);
  });
});
