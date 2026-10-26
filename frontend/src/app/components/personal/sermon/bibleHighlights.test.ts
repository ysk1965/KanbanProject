import { beforeEach, describe, expect, it } from 'vitest';
import {
  HighlightStore,
  isWhole,
  overlaps,
  rangeText,
  segmentsFor,
  spanOn,
  type Highlight,
  type HlRange,
} from './bibleHighlights';
import { ANONYMOUS_USER } from './sermonStore';

const V = [
  '하나님이여 주의 인자를 좇아',
  '나의 죄악을 말갛게 씻기시며',
  '대저 나는 내 죄과를 아오니',
];
const lenOf = (v: number) => (V[v - 1] || '').length;
const r = (v1: number, v2: number, s: number | null = null, e: number | null = null): HlRange => ({
  b: 18,
  c: 51,
  v1,
  v2,
  s,
  e,
});
const hl = (id: string, range: HlRange, at: number, extra: Partial<Highlight> = {}): Highlight => ({
  id,
  ...range,
  color: 'yellow',
  ul: false,
  memo: '',
  at,
  ...extra,
});

describe('형광펜 범위', () => {
  it('spanOn — 첫 절은 s 부터, 끝 절은 e 까지, 가운데는 통째로', () => {
    const x = r(1, 3, 4, 2);
    expect(spanOn(x, 1, lenOf(1))).toEqual([4, lenOf(1)]);
    expect(spanOn(x, 2, lenOf(2))).toEqual([0, lenOf(2)]);
    expect(spanOn(x, 3, lenOf(3))).toEqual([0, 2]);
    expect(spanOn(x, 4, 10)).toBeNull();
  });

  it('segmentsFor — 겹치면 나중에 칠한 색이 위, 밑줄은 하나라도 있으면', () => {
    const a = hl('a', r(1, 1), 1);
    const b = hl('b', r(1, 1, 3, 7), 2, { color: 'pink', ul: true });
    const segs = segmentsFor([a, b], 1, lenOf(1));
    expect(segs.map((g) => [g.from, g.to, g.top?.id, g.ul])).toEqual([
      [0, 3, 'a', false],
      [3, 7, 'b', true],
      [7, lenOf(1), 'a', false],
    ]);
  });

  it('segmentsFor — 형광펜 없는 절은 한 조각', () => {
    expect(segmentsFor([], 2, lenOf(2))).toEqual([{ from: 0, to: lenOf(2), top: null, ul: false }]);
  });

  it('overlaps · rangeText · isWhole', () => {
    expect(overlaps(r(1, 1, 0, 4), r(1, 1, 4, 8), lenOf)).toBe(false);
    expect(overlaps(r(1, 2), r(2, 3, null, 1), lenOf)).toBe(true);
    expect(rangeText(r(1, 2, 6, 6), (v) => V[v - 1])).toBe('주의 인자를 좇아 나의 죄악을');
    expect(isWhole(r(2, 2), lenOf)).toBe(true);
    expect(isWhole(r(2, 2, 1), lenOf)).toBe(false);
  });
});

describe('형광펜 저장소 (기기)', () => {
  beforeEach(() => localStorage.clear());

  it('칠하고 고치고, 표시가 모두 비면 지운다 — 다시 열어도 그대로', () => {
    const s = new HighlightStore(ANONYMOUS_USER);
    const h = s.add(r(1, 1), { color: 'green' });
    s.update(h.id, { memo: '정한 마음' });
    expect(s.inChapter(18, 51)).toHaveLength(1);
    expect([...s.chaptersOf(18)]).toEqual([51]);

    const again = new HighlightStore(ANONYMOUS_USER);
    expect(again.get(h.id)?.memo).toBe('정한 마음');

    again.update(h.id, { color: null, memo: '' });
    expect(again.count).toBe(0);
  });

  it('로그인하면 로그인 전에 칠한 것을 계정 저장소로 옮긴다', () => {
    const anon = new HighlightStore(ANONYMOUS_USER);
    const h = anon.add(r(2, 2), { color: 'blue' });
    const mine = new HighlightStore('user-1');
    expect(mine.get(h.id)?.color).toBe('blue');
    expect(localStorage.getItem(HighlightStore.keyFor(ANONYMOUS_USER))).toBeNull();
  });
});
