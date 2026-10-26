import { describe, expect, it, vi } from 'vitest';

// 성경 본문 대신 짧은 가짜 데이터 — 로마서 5장, 요한복음 15장만
vi.mock('../useBible', async () => {
  const refs = await import('../bibleRefs');
  const bible: string[][][] = refs.BOOKS.map((b) =>
    Array.from({ length: b[2] }, () => Array.from({ length: 30 }, (_, i) => `절${i + 1}`)),
  );
  bible[44][4][11] =
    '이러므로 한 사람으로 말미암아 죄가 세상에 들어오고, 죄로 말미암아 사망이 왔나니';
  bible[44][4][12] =
    '죄가 율법 있기 전에도 세상에 있었으나 율법이 없을 때에는 죄를 죄로 여기지 아니하느니라';
  bible[42][14] = Array.from({ length: 27 }, (_, i) => `포도나무${i} 가지${i} 거하라 아버지께서`);
  return {
    verses: (r: { b: number; c: number; v1: number; v2: number }) => {
      const ch = bible[r.b][r.c - 1];
      const out: Array<[number, string]> = [];
      for (let v = r.v1; v <= Math.min(r.v2, ch.length); v++) out.push([v, ch[v - 1]]);
      return out;
    },
  };
});

const { extractWords, fixedSet, localWords, poolFromRefs, sermonSet } = await import('./wordPool');

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('산성비 단어 뽑기', () => {
  it('어절을 나누고 문장 부호를 떼고 2~7자만, 중복 없이', () => {
    expect(
      extractWords(['이러므로 한 사람으로 말미암아 죄가 세상에, 죄로 말미암아 사망이 왔나니.']),
    ).toEqual(['이러므로', '사람으로', '말미암아', '죄가', '세상에', '죄로', '사망이', '왔나니']);
    expect(extractWords(['아니하느니라아아아 「은혜」'])).toEqual(['은혜']);
  });

  it('구절 단어가 20개보다 적으면 그 장 전체로 넓힌다', () => {
    const pool = poolFromRefs([{ b: 44, c: 5, v1: 12, v2: 12, whole: false }]);
    expect(pool.length).toBeGreaterThanOrEqual(20);
    expect(pool.slice(0, 3)).toEqual(['이러므로', '사람으로', '말미암아']);
  });

  it('이번 주 노트의 구절에서 「이번 주 설교」 묶음을 만든다', () => {
    const today = ymd(new Date());
    const note = {
      id: 'n1',
      date: today,
      title: '한 사람',
      refs: ['44:5:12-13'],
      body: '',
      thoughts: [],
    } as unknown as Parameters<typeof sermonSet>[0][number];
    const set = sermonSet([note]);
    expect(set?.key).toBe('sermon');
    expect(set?.label).toContain('로마서 5:12-13');
    expect(set?.pool).toContain('사망이');
    // 지난 노트만 있으면 없음
    expect(sermonSet([{ ...note, date: '2020-01-05' }])).toBeNull();
  });

  it('고정 묶음과 연습 판 단어', () => {
    expect(fixedSet('books').pool).toHaveLength(66);
    expect(fixedSet('john15').pool).toContain('거하라');
    const words = localWords(['가나', '다라', '마바'], 600, () => 0.5);
    expect(words).toHaveLength(600);
    expect(words.every((w, i) => w.i === i)).toBe(true);
    const gold = localWords(['가나'], 10, () => 0.01);
    expect(gold.every((w) => w.kind === 'gold')).toBe(true);
    const galpi = localWords(['가나'], 10, () => 0.08);
    expect(galpi.every((w) => w.kind === 'galpi' && w.text === '갈피')).toBe(true);
  });
});
