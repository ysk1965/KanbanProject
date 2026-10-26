import { describe, expect, it } from 'vitest';
import { BOOKS } from '../bibleRefs';
import { todayString, type SermonNote } from '../sermonTypes';
import {
  accuracy,
  chapterDone,
  chapterTag,
  doneCount,
  firstUndone,
  humanSpeed,
  nextChapter,
  pickChapters,
  pilsaSource,
  pilsaWeekKey,
  pilsaWeekLabel,
  stripText,
  unionDone,
  verseComplete,
  type PilsaPlan,
} from './pilsaPlan';

const vc = () => 20;

function note(over: Partial<SermonNote>): SermonNote {
  return {
    id: 'n1',
    title: '한 사람으로 말미암아',
    preacher: '',
    service: '',
    date: todayString(),
    refs: [],
    body: '',
    thoughts: [],
    elapsed: 0,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

describe('pilsaWeekKey', () => {
  it('KST 월요일 날짜 · 일요일 22시부터 다음 주', () => {
    // 2026-10-28(수) 12:00 KST
    expect(pilsaWeekKey(Date.parse('2026-10-28T03:00:00Z'))).toBe('2026-10-26');
    // 2026-11-01(일) 21:59 KST → 아직 이번 주
    expect(pilsaWeekKey(Date.parse('2026-11-01T12:59:00Z'))).toBe('2026-10-26');
    // 2026-11-01(일) 22:00 KST → 다음 주
    expect(pilsaWeekKey(Date.parse('2026-11-01T13:00:00Z'))).toBe('2026-11-02');
    // 2026-10-26(월) 00:30 KST (= 일요일 UTC)
    expect(pilsaWeekKey(Date.parse('2026-10-25T15:30:00Z'))).toBe('2026-10-26');
  });

  it('주 이름', () => {
    expect(pilsaWeekLabel('2026-10-26')).toBe('10월 넷째 주');
    expect(pilsaWeekLabel('2026-11-02')).toBe('11월 첫째 주');
  });
});

describe('pickChapters', () => {
  it('main → cited → near(±1, ±2 …) 로 7장, 중복 없음', () => {
    const out = pickChapters({
      main: { b: 44, c: 5 },
      cited: [
        { b: 0, c: 3 },
        { b: 44, c: 6 },
        { b: 45, c: 15 },
      ],
      week: '2026-10-26',
      verseCount: vc,
    });
    expect(out.map((x) => [chapterTag(x.b, x.c), x.reason])).toEqual([
      ['롬 5', 'main'],
      ['창 3', 'cited'],
      ['롬 6', 'cited'],
      ['고전 15', 'cited'],
      ['롬 4', 'near'],
      ['롬 3', 'near'],
      ['롬 7', 'near'],
    ]);
    expect(out.every((x) => x.verses === 20)).toBe(true);
  });

  it('창세기 1 은 앞 장이 없다 — 뒤 장으로만 채운다', () => {
    const out = pickChapters({
      main: { b: 0, c: 1 },
      cited: [],
      week: '2026-10-26',
      verseCount: vc,
    });
    expect(out.map((x) => x.c)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out.every((x) => x.b === 0)).toBe(true);
  });

  it('요한계시록 22 는 뒤 장이 없다', () => {
    const out = pickChapters({
      main: { b: 65, c: 22 },
      cited: [],
      week: '2026-10-26',
      verseCount: vc,
    });
    expect(out.map((x) => x.c)).toEqual([22, 21, 20, 19, 18, 17, 16]);
  });

  it('장이 적은 책이면 다음 책으로 이어 채워 늘 7장', () => {
    const out = pickChapters({
      main: { b: 30, c: 1 },
      cited: [],
      week: '2026-10-26',
      verseCount: vc,
    });
    expect(out).toHaveLength(7);
    expect(out[0]).toMatchObject({ b: 30, c: 1, reason: 'main' });
    expect(out[1]).toMatchObject({ b: 31, c: 1 });
    expect(new Set(out.map((x) => `${x.b}:${x.c}`)).size).toBe(7);
  });

  it('범위 밖 장·절 수 0 인 장은 건너뛴다', () => {
    const out = pickChapters({
      main: { b: 44, c: 5 },
      cited: [
        { b: 44, c: 99 },
        { b: 99, c: 1 },
        { b: 1, c: 0 },
      ],
      week: '2026-10-26',
      verseCount: (b, c) => (c === 4 ? 0 : 10),
    });
    expect(out.map((x) => x.c)).toEqual([5, 6, 3, 7, 2, 8, 1]);
  });

  it('노트가 없으면 요한복음 1–7 / 8–14 / 15–21 을 주마다 돌린다', () => {
    const starts = [0, 1, 2, 3].map((i) => {
      const d = new Date(Date.UTC(2026, 9, 26 + i * 7));
      const week = d.toISOString().slice(0, 10);
      const out = pickChapters({ main: null, cited: [], week, verseCount: vc });
      expect(out).toHaveLength(7);
      expect(out.every((x) => x.b === 42 && x.reason === 'common')).toBe(true);
      return out[0].c;
    });
    expect(new Set(starts.slice(0, 3))).toEqual(new Set([1, 8, 15]));
    expect(starts[3]).toBe(starts[0]);
  });
});

describe('pilsaSource', () => {
  it('설교 본문 첫 장 = main, 본문 인용 블록의 다른 장 = cited', () => {
    const n = note({
      refs: ['44:5:12-14'],
      body: '<p>x</p><div class="vblock" data-ref="0:3:1-6"></div><span data-ref="44:5:1-1"></span>',
    });
    const src = pilsaSource([n]);
    expect(src?.main).toEqual({ b: 44, c: 5 });
    expect(src?.cited).toEqual([{ b: 0, c: 3 }]);
  });

  it('지난 노트(7일 넘게)·구절 없는 노트는 고르지 않는다', () => {
    expect(pilsaSource([note({ refs: [] })])).toBeNull();
    expect(pilsaSource([note({ refs: ['44:5:1-1'], date: '2020-01-05' })])).toBeNull();
  });
});

describe('진행', () => {
  const plan: PilsaPlan = {
    week: '2026-10-26',
    synced: false,
    chapters: [
      { b: 44, c: 5, reason: 'main', verses: 3, done: [1, 2, 3] },
      { b: 44, c: 6, reason: 'near', verses: 3, done: [2] },
    ],
  };
  it('다 쓴 장·다음 장·안 쓴 첫 절', () => {
    expect(chapterDone(plan.chapters[0])).toBe(true);
    expect(doneCount(plan)).toBe(1);
    expect(nextChapter(plan)?.c).toBe(6);
    expect(firstUndone(plan.chapters[1])).toBe(1);
    expect(firstUndone(plan.chapters[0])).toBeNull();
    expect(nextChapter(null)).toBeNull();
  });
  it('done 합치기 — 오름차순, 범위 밖 제거', () => {
    expect(unionDone([3, 1], [2, 3, 9, 0], 5)).toEqual([1, 2, 3]);
  });
});

describe('따라 쓰기 비교', () => {
  const v = '그러므로 우리가 믿음으로 의롭다 하심을 얻었은즉, 화평을 누리자.';
  it('공백·문장 부호는 보지 않는다', () => {
    expect(stripText(v)).toBe('그러므로우리가믿음으로의롭다하심을얻었은즉화평을누리자');
    expect(accuracy('그러므로우리가믿음으로의롭다하심을얻었은즉화평을누리자', v)).toBe(1);
    expect(verseComplete('그러므로 우리가 믿음으로 의롭다 하심을 얻었은즉 화평을 누리자', v)).toBe(
      true,
    );
  });
  it('90% 이상 맞으면 통과, 모자라면 아직', () => {
    const t = stripText(v);
    const two = `${t.slice(0, 5)}XX${t.slice(7)}`; // 27자 중 2자 틀림 → 92.6%
    expect(accuracy(two, v)).toBeGreaterThanOrEqual(0.9);
    expect(verseComplete(two, v)).toBe(true);
    const four = `${t.slice(0, 5)}XXXX${t.slice(9)}`; // 4자 틀림 → 85%
    expect(verseComplete(four, v)).toBe(false);
    expect(verseComplete(t.slice(0, 20), v)).toBe(false); // 글자 수 모자람
  });
  it('사람 속도', () => {
    expect(humanSpeed(30, 10_000)).toBe(true);
    expect(humanSpeed(30, 500)).toBe(false);
    expect(humanSpeed(30, 1000)).toBe(false);
    expect(humanSpeed(0, 10_000)).toBe(false);
  });
  it('라벨은 늘 책 + 장', () => {
    expect(chapterTag(44, 5)).toBe('롬 5');
    expect(BOOKS[44][1]).toBe('롬');
  });
});
