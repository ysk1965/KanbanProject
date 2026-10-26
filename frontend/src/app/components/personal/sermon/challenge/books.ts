import { BOOKS } from '../bibleRefs';

/** 66권 줄 세우기 — 단계별 카드 범위와 순서 확인 (계약 §4 books) */
export type BooksStage = 'pentateuch' | 'nt' | 'ot' | 'all';

export const STAGES: Array<{ k: BooksStage; label: string; from: number; to: number }> = [
  { k: 'pentateuch', label: '모세오경', from: 0, to: 4 },
  { k: 'nt', label: '신약', from: 39, to: 65 },
  { k: 'ot', label: '구약', from: 0, to: 38 },
  { k: 'all', label: '전체 66권', from: 0, to: 65 },
];

/** 계약의 단계별 달란트 (하루 30 안에서) — 화면 안내용 */
export const STAGE_TALENTS: Record<BooksStage, number> = { pentateuch: 3, nt: 8, ot: 10, all: 15 };

export function stageOf(k: BooksStage) {
  return STAGES.find((s) => s.k === k) || STAGES[0];
}

/** 그 단계의 정답 순서 (bookIndex 오름차순) */
export function stageBooks(k: BooksStage): number[] {
  const s = stageOf(k);
  return Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i);
}

export function bookName(i: number): string {
  return BOOKS[i]?.[0] ?? '';
}

/** 정답(오름차순 연속, 그 단계 전부)인지 */
export function isValidOrder(k: BooksStage, order: number[]): boolean {
  const want = stageBooks(k);
  return order.length === want.length && order.every((b, i) => b === want[i]);
}

/** 지금까지 놓은 카드 수 → 다음에 놓아야 할 책 */
export function nextExpected(k: BooksStage, placed: number): number | null {
  const want = stageBooks(k);
  return placed < want.length ? want[placed] : null;
}

/** 서버가 내려 준 카드가 그 단계와 맞는지 (아니면 로컬로 섞는다) */
export function sameSet(k: BooksStage, cards: number[] | null | undefined): boolean {
  if (!Array.isArray(cards)) return false;
  return isValidOrder(
    k,
    [...cards].sort((a, b) => a - b),
  );
}

export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 48200ms → '48.2초', 75000 → '1분 15.0초' */
export function fmtMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '-';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}초`;
  return `${Math.floor(s / 60)}분 ${(s % 60).toFixed(1)}초`;
}
