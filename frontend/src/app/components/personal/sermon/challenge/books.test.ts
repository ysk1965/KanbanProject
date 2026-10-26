import { describe, expect, it } from 'vitest';
import { fmtMs, isValidOrder, nextExpected, sameSet, shuffle, stageBooks } from './books';

describe('66권 줄 세우기', () => {
  it('단계별 카드 수', () => {
    expect(stageBooks('pentateuch')).toEqual([0, 1, 2, 3, 4]);
    expect(stageBooks('ot')).toHaveLength(39);
    expect(stageBooks('nt')).toHaveLength(27);
    expect(stageBooks('nt')[0]).toBe(39);
    expect(stageBooks('all')).toHaveLength(66);
  });

  it('정답 순서만 valid', () => {
    expect(isValidOrder('pentateuch', [0, 1, 2, 3, 4])).toBe(true);
    expect(isValidOrder('pentateuch', [0, 2, 1, 3, 4])).toBe(false);
    expect(isValidOrder('pentateuch', [0, 1, 2, 3])).toBe(false);
    expect(isValidOrder('nt', stageBooks('nt'))).toBe(true);
  });

  it('다음에 놓을 책', () => {
    expect(nextExpected('nt', 0)).toBe(39);
    expect(nextExpected('nt', 26)).toBe(65);
    expect(nextExpected('nt', 27)).toBeNull();
  });

  it('섞은 카드는 같은 책 묶음', () => {
    const s = shuffle(stageBooks('ot'));
    expect(sameSet('ot', s)).toBe(true);
    expect(sameSet('ot', s.slice(1))).toBe(false);
    expect(sameSet('ot', null)).toBe(false);
  });

  it('시간 표시', () => {
    expect(fmtMs(48200)).toBe('48.2초');
    expect(fmtMs(75000)).toBe('1분 15.0초');
    expect(fmtMs(null)).toBe('-');
  });
});
