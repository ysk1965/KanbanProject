import { describe, expect, it } from 'vitest';
import { RainScorer, rainTalents, scoreRain, type RainEvent, type RainWord } from './rainScore';

const W = (i: number, text = '은혜', kind: RainWord['kind'] = ''): RainWord => ({ i, text, kind });

describe('말씀 산성비 점수 (계약 §4)', () => {
  it('보통 hit = 글자 수 × 10 × 단계 + 연속 × 5', () => {
    const s = new RainScorer();
    expect(s.hit(W(0, '사망이'))).toBe(3 * 10 * 1 + 1 * 5);
    expect(s.hit(W(1, '은혜'))).toBe(2 * 10 * 1 + 2 * 5);
  });

  it('10번째 맞힌 뒤부터 2단계', () => {
    const s = new RainScorer();
    for (let i = 0; i < 9; i++) s.hit(W(i));
    expect(s.level).toBe(1);
    // 10번째는 아직 1단계로 계산
    expect(s.hit(W(9))).toBe(20 * 1 + 10 * 5);
    expect(s.level).toBe(2);
    // 11번째부터 2단계, 연속은 10에서 막힘
    expect(s.hit(W(10))).toBe(20 * 2 + 10 * 5);
  });

  it('연속 보너스는 10에서 멈춘다', () => {
    const s = new RainScorer();
    let last = 0;
    for (let i = 0; i < 15; i++) last = s.hit(W(i, '가'));
    expect(s.combo).toBe(15);
    expect(last).toBe(1 * 10 * 2 + 10 * 5);
  });

  it('금빛 단어는 글자 점수 3배 (연속 보너스는 그대로)', () => {
    const s = new RainScorer();
    expect(s.hit(W(0, '은혜', 'gold'))).toBe(2 * 10 * 3 + 5);
  });

  it('miss 와 보통 drop 은 연속을 끊고, 갈피 drop 은 목숨도 연속도 그대로', () => {
    const s = new RainScorer();
    s.hit(W(0));
    s.hit(W(1));
    s.drop(W(2, '갈피', 'galpi'));
    expect(s.combo).toBe(2);
    expect(s.livesLeft).toBe(6);
    s.miss();
    expect(s.combo).toBe(0);
    s.hit(W(3));
    s.drop(W(4));
    expect(s.combo).toBe(0);
    expect(s.livesLeft).toBe(5);
  });

  it('보통 drop 6번이면 끝나고 그 뒤 이벤트는 무시', () => {
    const words = Array.from({ length: 10 }, (_, i) => W(i, '말씀'));
    const ev: RainEvent[] = [
      { type: 'hit', i: 0, t: 100 },
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ type: 'drop' as const, i, t: 200 + i })),
      { type: 'hit', i: 7, t: 900 },
    ];
    const r = scoreRain(words, ev);
    expect(r.over).toBe(true);
    expect(r.hits).toBe(1);
    expect(r.score).toBe(2 * 10 + 5);
  });

  it('같은 단어를 두 번 hit 해도 한 번만 센다', () => {
    const words = [W(0, '말씀')];
    const r = scoreRain(words, [
      { type: 'hit', i: 0, t: 10 },
      { type: 'hit', i: 0, t: 20 },
    ]);
    expect(r.hits).toBe(1);
  });

  it('100점마다 1달란트', () => {
    expect(rainTalents(1240)).toBe(12);
    expect(rainTalents(99)).toBe(0);
  });
});
