import { describe, expect, it } from 'vitest';
import {
  addItem,
  autoShort,
  emptyPlan,
  removeItem,
  stickDay,
  tidyPlan,
  toggleDaily,
  toggleOnce,
  weekBoard,
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
const TODAY = '2026-10-29';

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

describe('weekPlan', () => {
  it('한 번 할 일은 정한 날 / 이번 주 안에, 한 날엔 스티커', () => {
    let p = addItem(emptyPlan(DAYS[0]), { text: '화단 물 주기', rep: 'once' });
    p = addItem(p, { text: '친구에게 설교 나누기', rep: 'once', day: '2026-10-30' });
    const b = weekBoard([], p, DAYS, TODAY);
    expect(b.tray.map((x) => x.text)).toEqual(['화단 물 주기']);
    expect(b.once.find((x) => x.day === '2026-10-30')?.text).toBe('친구에게 설교 나누기');

    p = toggleOnce(p, p.items[1].id, TODAY);
    const b2 = weekBoard([], p, DAYS, TODAY);
    const done = b2.once.find((x) => x.doneOn)!;
    expect(stickDay(done, DAYS, TODAY)).toBe(TODAY);
    expect(b2.done).toBe(1);
    expect(b2.left).toBe(1);
    // 되돌리면 정해 둔 날로 돌아간다
    p = toggleOnce(p, p.items[1].id, TODAY);
    expect(p.items[1]).toMatchObject({ day: '2026-10-30', done_on: null });
  });

  it('매일 할 일은 날짜별로 체크, 오늘 이후는 못 누른다, 짧은 이름은 비우면 앞 네 글자', () => {
    let p = addItem(emptyPlan(DAYS[0]), { text: '자기 전 감사 기도', rep: 'daily' });
    const id = p.items[0].id;
    expect(p.items[0].short).toBe('자기전감');
    expect(autoShort('나 부터')).toBe('나부터');
    p = toggleDaily(p, id, '2026-10-26', TODAY);
    p = toggleDaily(p, id, '2026-10-31', TODAY);
    expect(p.items[0].log).toEqual(['2026-10-26']);
    expect(weekBoard([], p, DAYS, TODAY).dailyLeftToday).toBe(1);
    p = toggleDaily(p, id, TODAY, TODAY);
    expect(weekBoard([], p, DAYS, TODAY).dailyLeftToday).toBe(0);
    p = toggleDaily(p, id, TODAY, TODAY);
    expect(p.items[0].log).toEqual(['2026-10-26']);
  });

  it('이번 주 노트의 적용도 같은 판에 — 체크한 날에 붙고, 다른 주 노트는 빠진다', () => {
    const done_at = new Date(2026, 9, 27, 21).getTime();
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
    const b = weekBoard(notes, emptyPlan(DAYS[0]), DAYS, TODAY);
    expect(b.once.map((x) => x.text)).toEqual(['나부터 돌아보기', '감사 적기']);
    expect(b.tray.map((x) => x.key)).toEqual(['n1|t1']);
    expect(stickDay(b.once[1], DAYS, TODAY)).toBe('2026-10-27');
  });

  it('지우기 · 깨진 저장값 다듬기', () => {
    let p = addItem(emptyPlan(DAYS[0]), { text: '  ', rep: 'once' });
    expect(p.items).toHaveLength(0);
    p = addItem(p, { text: '하나', rep: 'once' });
    expect(removeItem(p, p.items[0].id).items).toHaveLength(0);

    const t = tidyPlan(DAYS[0], {
      items: [
        { id: 'a', text: '매일', rep: 'daily', log: ['2026-10-26', 'oops'] },
        { id: 'b', text: '', rep: 'once' },
        { id: 'c', text: '한 번', day: 'nope', done_on: '2026-10-27' },
        null,
      ],
    });
    expect(t.items).toHaveLength(2);
    expect(t.items[0]).toMatchObject({ rep: 'daily', short: '매일', log: ['2026-10-26'] });
    expect(t.items[1]).toMatchObject({ rep: 'once', day: null, done_on: '2026-10-27' });
  });

  it('고칠 때마다 updated_at 이 커진다 (같은 밀리초여도)', () => {
    const a = addItem(emptyPlan(DAYS[0]), { text: '하나', rep: 'once' });
    const b = toggleOnce(a, a.items[0].id, TODAY);
    const c = toggleOnce(b, a.items[0].id, TODAY);
    expect(b.updated_at).toBeGreaterThan(a.updated_at);
    expect(c.updated_at).toBeGreaterThan(b.updated_at);
  });
});
