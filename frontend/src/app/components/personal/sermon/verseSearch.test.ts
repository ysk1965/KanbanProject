import { beforeAll, describe, expect, it } from 'vitest';
import { BOOKS, setVerseCounts } from './bibleRefs';
import { groupByBook, searchBible, searchOptions, splitTerms } from './verseSearch';
import type { BibleData } from './useBible';

/** 작은 가짜 성경 — 창세기 1장 2절, 고린도전서 13장 13절, 데살로니가전서 1장 3절에만 글이 있다 */
function fakeBible(): BibleData {
  const data: BibleData = BOOKS.map((bk) =>
    Array.from({ length: bk[2] }, () => Array(30).fill('')),
  );
  data[0][0][1] = '땅이 혼돈하고 공허하며';
  data[45][12][12] = '그런즉 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데';
  data[51][0][2] = '너희의 믿음의 역사와 사랑의 수고와 소망의 인내를';
  return data;
}

beforeAll(() => {
  setVerseCounts(BOOKS.map((b) => Array.from({ length: b[2] }, () => 30)));
});

describe('searchOptions', () => {
  it('장 주소는 그 장으로 간다', () => {
    const [o] = searchOptions('롬 8');
    expect(o).toMatchObject({ kind: 'go', b: 44, c: 8, v: null, label: '로마서 8장' });
  });

  it('절 주소는 그 절 + 이어지는 절 후보', () => {
    const opts = searchOptions('롬8:2');
    expect(opts[0]).toMatchObject({ kind: 'go', b: 44, c: 8, v: 2 });
    expect(opts.slice(1).map((o) => (o.kind === 'go' ? o.v : 0))).toEqual([20, 21, 22]);
    expect(opts.some((o) => o.kind === 'word')).toBe(false);
  });

  it('붙여 쓴 주소·정식 이름·장절 표기도 읽는다', () => {
    expect(searchOptions('마4:1')[0]).toMatchObject({
      kind: 'go',
      b: 39,
      c: 4,
      v: 1,
      label: '마태복음 4장 1절',
    });
    expect(searchOptions('마태복음 4장 1절')[0]).toMatchObject({ kind: 'go', b: 39, c: 4, v: 1 });
    expect(searchOptions('요 3:16-18')[0]).toMatchObject({ kind: 'go', b: 42, c: 3, v: 16 });
  });

  it('시편은 편으로 부른다', () => {
    expect(searchOptions('시 23')[0].label).toBe('시편 23편');
  });

  it('낱말은 본문 찾기가 먼저', () => {
    const opts = searchOptions('믿음  소망');
    expect(opts[0]).toMatchObject({ kind: 'word', q: '믿음 소망' });
  });

  it('책 이름 앞부분이면 책도 후보로, 정확한 이름이면 책이 먼저', () => {
    expect(searchOptions('요').map((o) => o.kind)).toContain('go');
    expect(searchOptions('룻기')[0]).toMatchObject({ kind: 'go', b: 7, c: 1 });
  });

  it('빈 입력은 고를거리가 없다', () => {
    expect(searchOptions('   ')).toEqual([]);
  });
});

describe('searchBible', () => {
  const bible = fakeBible();

  it('낱말이 모두 들어간 절만, 성경 차례대로', () => {
    expect(searchBible(bible, '믿음 소망')).toEqual([
      { b: 45, c: 13, v: 13 },
      { b: 51, c: 1, v: 3 },
    ]);
    expect(searchBible(bible, '믿음 혼돈')).toEqual([]);
  });

  it('구약·신약으로 거른다', () => {
    expect(searchBible(bible, '땅', 'ot')).toEqual([{ b: 0, c: 1, v: 2 }]);
    expect(searchBible(bible, '땅', 'nt')).toEqual([]);
  });

  it('권별로 묶는다', () => {
    const g = groupByBook(searchBible(bible, '사랑'));
    expect(g.map((x) => [x.b, x.hits.length])).toEqual([
      [45, 1],
      [51, 1],
    ]);
  });
});

describe('splitTerms', () => {
  it('낱말 자리를 칠할 조각으로 나눈다', () => {
    expect(splitTerms('믿음의 역사와 소망의', ['믿음', '소망'])).toEqual([
      { t: '믿음', hit: true },
      { t: '의 역사와 ', hit: false },
      { t: '소망', hit: true },
      { t: '의', hit: false },
    ]);
  });
});
