import { describe, expect, it } from 'vitest';
import { compareCounts, compareHighlights, groupHeat } from './compare';

describe('compare', () => {
  it('같은 절은 둘 다, 나머지는 나만/상대만 — 성경 순서로', () => {
    const mine = {
      highlights: [
        { ref: '44:5:12-12', marks: [[0, 5]] as Array<[number, number]> },
        { ref: '44:5:13-13', marks: [[0, 3]] as Array<[number, number]> },
      ],
    };
    const theirs = {
      highlights: [
        { ref: '44:5:15-15', marks: [[1, 4]] as Array<[number, number]> },
        { ref: '44:5:12-12', marks: [[10, 20]] as Array<[number, number]> },
      ],
    };
    const c = compareHighlights(mine, theirs);
    expect(c.map((x) => `${x.ref}:${x.kind}`)).toEqual([
      '44:5:12-12:both',
      '44:5:13-13:mine',
      '44:5:15-15:theirs',
    ]);
    expect(compareCounts(c)).toEqual({ both: 1, mine: 1, theirs: 1 });
    expect(compareHighlights(null, theirs).every((x) => x.kind === 'theirs')).toBe(true);
  });
  it('모임 밑줄 열지도', () => {
    const h = groupHeat([
      {
        highlights: [
          { ref: 'a', marks: [] },
          { ref: 'a', marks: [] },
        ],
      },
      {
        highlights: [
          { ref: 'a', marks: [] },
          { ref: 'b', marks: [] },
        ],
      },
      null,
    ]);
    expect(h.get('a')).toBe(2);
    expect(h.get('b')).toBe(1);
  });
});
