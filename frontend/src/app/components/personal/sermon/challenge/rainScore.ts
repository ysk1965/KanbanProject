/**
 * 말씀 산성비 점수 — 계약 docs/Tech/sermon-challenge-api.md §4 와 같은 식 (서버가 다시 계산한다).
 *  - level = 1 + floor(hits_so_far / 10)  (10번째 맞힌 뒤부터 다음 단계)
 *  - hit 점수 = len(text) × 10 × level × (gold ? 3 : 1) + min(combo, 10) × 5  (combo 는 이 hit 포함)
 *  - miss · (galpi 가 아닌) drop → combo 0. galpi 아닌 drop 이 lives 번이면 끝 (그 뒤 이벤트 무시)
 */

export type RainKind = '' | 'gold' | 'galpi';

export interface RainWord {
  i: number;
  text: string;
  kind: RainKind;
}

export type RainEvent =
  | { type: 'hit'; i: number; t: number }
  | { type: 'miss'; t: number }
  | { type: 'drop'; i: number; t: number };

export const RAIN_LIVES = 6;
export const RAIN_LEVEL_EVERY = 10;
export const COMBO_CAP = 10;

/** 게임 화면이 한 이벤트씩 넣으며 HUD 를 그리는 점수기. scoreRain 도 이걸로 계산한다 */
export class RainScorer {
  score = 0;
  hits = 0;
  combo = 0;
  drops = 0;
  constructor(
    readonly lives = RAIN_LIVES,
    readonly levelEvery = RAIN_LEVEL_EVERY,
  ) {}

  get level(): number {
    return 1 + Math.floor(this.hits / this.levelEvery);
  }

  get livesLeft(): number {
    return Math.max(0, this.lives - this.drops);
  }

  get over(): boolean {
    return this.drops >= this.lives;
  }

  /** 맞힌 단어 — 얻은 점수를 돌려준다 */
  hit(w: Pick<RainWord, 'text' | 'kind'>): number {
    if (this.over) return 0;
    const level = this.level;
    this.combo += 1;
    this.hits += 1;
    const pts =
      w.text.length * 10 * level * (w.kind === 'gold' ? 3 : 1) +
      Math.min(this.combo, COMBO_CAP) * 5;
    this.score += pts;
    return pts;
  }

  miss() {
    if (this.over) return;
    this.combo = 0;
  }

  /** 바닥에 닿은 단어 — 갈피는 목숨을 잃지 않는다 */
  drop(w: Pick<RainWord, 'kind'>) {
    if (this.over || w.kind === 'galpi') return;
    this.combo = 0;
    this.drops += 1;
  }
}

/** 단어 목록 + 이벤트 기록 → 최종 점수 (서버 재계산과 같은 결과) */
export function scoreRain(
  words: RainWord[],
  events: RainEvent[],
  lives = RAIN_LIVES,
  levelEvery = RAIN_LEVEL_EVERY,
): { score: number; hits: number; level: number; over: boolean } {
  const byI = new Map(words.map((w) => [w.i, w]));
  const s = new RainScorer(lives, levelEvery);
  const seen = new Set<number>();
  for (const e of events) {
    if (s.over) break;
    if (e.type === 'miss') s.miss();
    else {
      const w = byI.get(e.i);
      if (!w) continue;
      if (e.type === 'hit') {
        if (seen.has(e.i)) continue;
        seen.add(e.i);
        s.hit(w);
      } else s.drop(w);
    }
  }
  return { score: s.score, hits: s.hits, level: s.level, over: s.over };
}

/** 점수 → 게임 달란트 (서버 기준 100점마다 1, 하루 상한은 서버가 센다) */
export function rainTalents(score: number): number {
  return Math.floor(score / 100);
}
