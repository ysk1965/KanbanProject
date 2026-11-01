import { describe, expect, it } from 'vitest';
import { diffBlocks, isBigRemoval, splitBlocks, summarize, takeOne } from './versionDiff';

const P = (s: string) => `<p>${s}</p>`;

describe('versionDiff', () => {
  it('같은 앞부분은 그대로, 뒤에 쓴 문단만 추가로 본다', () => {
    const a = splitBlocks(P('우리는 연약하다') + P('은혜가 넘친다'));
    const b = splitBlocks(P('우리는 연약하다') + P('은혜가 넘친다') + P('아담과 그리스도'));
    const ops = diffBlocks(a, b);
    expect(ops.map((o) => o.t)).toEqual(['eq', 'eq', 'add']);
    const s = summarize(ops);
    expect(s.first).toBe('아담과 그리스도');
    expect(s.added).toBe('아담과그리스도'.length);
    expect(s.removed).toBe(0);
  });

  it('고친 문단은 한 문단으로 짝짓고 단어 단위로 비교한다', () => {
    const a = splitBlocks(P('아담은 예수 그리스도의 모형이다.'));
    const b = splitBlocks(P('아담은 오실 자의 모형이다.'));
    const ops = diffBlocks(a, b);
    expect(ops).toHaveLength(1);
    expect(ops[0].t).toBe('mod');
    if (ops[0].t !== 'mod') return;
    expect(ops[0].words.filter((w) => w.t === 'del').map((w) => w.v.trim())).toEqual([
      '예수 그리스도의',
    ]);
    expect(summarize(ops).first).toContain('오실 자의');
  });

  it('문단 하나만 가져오면 나머지 지금 글은 그대로', () => {
    const now = splitBlocks(P('하나') + P('셋 고침'));
    const ver = splitBlocks(P('하나') + P('둘') + P('셋'));
    const ops = diffBlocks(now, ver);
    const addIdx = ops.findIndex((o) => o.t === 'add');
    expect(takeOne(ops, addIdx)).toBe(P('하나') + P('둘') + P('셋 고침'));
  });

  it('지운 것만 있으면 지운 문장을 요약으로', () => {
    const ops = diffBlocks(splitBlocks(P('하나') + P('둘')), splitBlocks(P('하나')));
    const s = summarize(ops);
    expect(s.firstIsRemoval).toBe(true);
    expect(s.first).toBe('둘');
  });

  it('큰 삭제 판단', () => {
    expect(isBigRemoval({ added: 0, removed: 320, first: '', firstIsRemoval: true }, 2000)).toBe(
      true,
    );
    expect(isBigRemoval({ added: 0, removed: 40, first: '', firstIsRemoval: true }, 120)).toBe(
      true,
    );
    expect(isBigRemoval({ added: 50, removed: 60, first: '', firstIsRemoval: false }, 1000)).toBe(
      false,
    );
  });
});
