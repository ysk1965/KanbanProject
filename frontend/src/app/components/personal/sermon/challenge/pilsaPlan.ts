import { BOOKS, PSALMS } from '../bibleRefs';
import { mainRef, noteRefs, type SermonNote } from '../sermonTypes';
import { sermonSource } from './wordPool';

/**
 * 「이번 주 말씀 필사」 순수 함수 — 일곱 장 고르기 · 한 주 키 · 정확도.
 * 계약: docs/Tech/sermon-pilsa-api.md §6 (고르기) · sermon-challenge-api.md §0 (한 주 = KST 월 00:00 ~ 일 22:00)
 */

export type PilsaReason = 'main' | 'cited' | 'near' | 'next' | 'common';

export interface PilsaChapter {
  b: number;
  c: number;
  reason: PilsaReason;
  verses: number;
  /** 쓴 절 번호 (오름차순) */
  done: number[];
}

export interface PilsaPlan {
  /** 그 주 월요일 yyyy-MM-dd (KST) */
  week: string;
  chapters: PilsaChapter[];
  /** 서버가 이 계획을 고정해 둔 것을 확인했는지 */
  synced: boolean;
}

export type PickedChapter = Omit<PilsaChapter, 'done'>;

export interface ChapterPos {
  b: number;
  c: number;
}

export const PILSA_SIZE = 7;
/** 따라 쓴 글자가 이만큼 맞으면 그 절을 쓴 것으로 본다 */
export const PILSA_PASS = 0.9;
/** 설교가 없는 주 — 요한복음 1–7 / 8–14 / 15–21 을 주마다 돌린다 */
export const COMMON_BOOK = 42;

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/* ───────── 한 주 ───────── */

/** 지금이 든 주의 키 — KST 월요일 날짜. 일요일 22:00(KST)부터는 다음 주 */
export function pilsaWeekKey(now: number = Date.now()): string {
  // KST(+9) 에 2시간을 더 밀면 일요일 22시가 월요일 0시가 된다
  const t = new Date(now + 11 * 3600_000);
  const back = (t.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - back));
  return `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}`;
}

/** 주 키 → 1970 년부터 센 주 번호 (공통 일곱 장 돌리기용) */
export function weekIndex(week: string): number {
  const [y, m, d] = week.split('-').map(Number);
  if (!y || !m || !d) return 0;
  return Math.floor(Date.UTC(y, m - 1, d) / DAY / 7);
}

const ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째'];

/** '2026-10-26' → '10월 넷째 주' */
export function pilsaWeekLabel(week: string): string {
  const [y, m, d] = week.split('-').map(Number);
  if (!y || !m || !d) return '이번 주';
  return `${m}월 ${ORD[Math.min(4, Math.ceil(d / 7) - 1)]} 주`;
}

/* ───────── 일곱 장 고르기 ───────── */

export interface PilsaSource {
  note: SermonNote;
  main: ChapterPos;
  cited: ChapterPos[];
}

/** 최근 7일 안 가장 최근 노트(구절 있는 것) → 첫 구절 장 = main, 그 밖에 나온 장 = cited */
export function pilsaSource(notes: SermonNote[]): PilsaSource | null {
  const src = sermonSource(notes);
  if (!src) return null;
  const first = mainRef(src.note) || src.refs[0];
  const main = { b: first.b, c: first.c };
  const cited: ChapterPos[] = [];
  const seen = new Set([`${main.b}:${main.c}`]);
  noteRefs(src.note).forEach((r) => {
    const k = `${r.b}:${r.c}`;
    if (seen.has(k)) return;
    seen.add(k);
    cited.push({ b: r.b, c: r.c });
  });
  return { note: src.note, main, cited };
}

export interface PickInput {
  main: ChapterPos | null;
  cited: ChapterPos[];
  week: string;
  /** 그 장의 절 수 (성경 데이터에서). 0 이면 그 장은 건너뛴다 */
  verseCount: (b: number, c: number) => number;
}

function validPos(b: number, c: number): boolean {
  return b >= 0 && b < BOOKS.length && c >= 1 && c <= BOOKS[b][2];
}

/** 이번 주 일곱 장 — main → cited → near(±1, ±2 …, 책 안에서) 순서, 노트가 없으면 common */
export function pickChapters({ main, cited, week, verseCount }: PickInput): PickedChapter[] {
  const out: PickedChapter[] = [];
  const seen = new Set<string>();
  const add = (b: number, c: number, reason: PilsaReason) => {
    if (out.length >= PILSA_SIZE || !validPos(b, c)) return;
    const k = `${b}:${c}`;
    if (seen.has(k)) return;
    const verses = verseCount(b, c);
    if (!(verses > 0)) return;
    seen.add(k);
    out.push({ b, c, reason, verses });
  };

  if (!main || !validPos(main.b, main.c)) {
    const start = 1 + (((weekIndex(week) % 3) + 3) % 3) * 7;
    for (let c = start; c < start + PILSA_SIZE; c++) add(COMMON_BOOK, c, 'common');
    return out;
  }

  add(main.b, main.c, 'main');
  cited.forEach((p) => add(p.b, p.c, 'cited'));
  const max = BOOKS[main.b][2];
  for (let k = 1; out.length < PILSA_SIZE && (main.c - k >= 1 || main.c + k <= max); k++) {
    add(main.b, main.c - k, 'near');
    add(main.b, main.c + k, 'near');
  }
  // 장이 적은 책(오바댜·유다서 …)이면 다음 책들로 이어서 채운다
  for (let i = 1; out.length < PILSA_SIZE && i < BOOKS.length; i++) {
    const b = (main.b + i) % BOOKS.length;
    for (let c = 1; c <= BOOKS[b][2] && out.length < PILSA_SIZE; c++) add(b, c, 'near');
  }
  return out;
}

/** 성경 데이터([권][장-1][절-1])로 절 수 */
export function verseCountFrom(bible: string[][][] | null | undefined) {
  return (b: number, c: number): number => bible?.[b]?.[c - 1]?.length ?? 0;
}

/* ───────── 진행 ───────── */

export function chapterDone(ch: Pick<PilsaChapter, 'verses' | 'done'>): boolean {
  if (ch.verses <= 0) return false;
  const set = new Set(ch.done);
  for (let v = 1; v <= ch.verses; v++) if (!set.has(v)) return false;
  return true;
}

export function doneCount(plan: PilsaPlan | null): number {
  return plan ? plan.chapters.filter(chapterDone).length : 0;
}

export function weekDone(plan: PilsaPlan | null): boolean {
  return !!plan && plan.chapters.length > 0 && plan.chapters.every(chapterDone);
}

/** 다 쓰지 않은 첫 장 (모두 다 썼으면 null) */
export function nextChapter(plan: PilsaPlan | null): PilsaChapter | null {
  return plan?.chapters.find((ch) => !chapterDone(ch)) ?? null;
}

/** 아직 안 쓴 첫 절 (다 썼으면 null) */
export function firstUndone(ch: Pick<PilsaChapter, 'verses' | 'done'>): number | null {
  const set = new Set(ch.done);
  for (let v = 1; v <= ch.verses; v++) if (!set.has(v)) return v;
  return null;
}

/** 두 done 목록의 합 (오름차순, 범위 밖 제거) */
export function unionDone(
  a: number[] | undefined,
  b: number[] | undefined,
  verses: number,
): number[] {
  const set = new Set<number>();
  [...(a || []), ...(b || [])].forEach((v) => {
    if (Number.isInteger(v) && v >= 1 && v <= verses) set.add(v);
  });
  return [...set].sort((x, y) => x - y);
}

/* ───────── 따라 쓰기 비교 ───────── */

const SKIP = /[\s\p{P}\p{S}]/gu;
const SKIP_ONE = /^[\s\p{P}\p{S}]$/u;

/** 공백·문장 부호를 뺀 글자 */
export function stripText(s: string): string {
  return (s || '').replace(SKIP, '');
}

/** 비교하지 않는 글자(공백·문장 부호)인지 */
export function isSkipChar(ch: string): boolean {
  return SKIP_ONE.test(ch);
}

/** 앞에서부터 한 글자씩 맞힌 비율 (본문 글자 수 기준) */
export function accuracy(typed: string, target: string): number {
  const t = stripText(typed);
  const g = stripText(target);
  if (!g.length) return 1;
  let ok = 0;
  for (let i = 0; i < Math.min(t.length, g.length); i++) if (t[i] === g[i]) ok++;
  return ok / g.length;
}

/** 다 따라 썼는지 — 글자 수가 다 찼고 90% 이상 맞음 */
export function verseComplete(typed: string, target: string): boolean {
  return (
    stripText(typed).length >= stripText(target).length && accuracy(typed, target) >= PILSA_PASS
  );
}

/** 서버에 보낼 비교 글자 수 */
export function verseChars(target: string): number {
  return stripText(target).length;
}

/** 첫 입력부터 걸린 시간 (ms, 0 이상 정수) */
export function elapsedMs(startAt: number | null, endAt: number): number {
  return startAt == null ? 0 : Math.max(0, Math.round(endAt - startAt));
}

/** 사람 손으로 가능한 속도인지 (서버 PIL004 와 같은 기준: 600ms 이상, 1초에 15자 이하) */
export function humanSpeed(chars: number, ms: number): boolean {
  return chars > 0 && ms >= 600 && (chars * 1000) / ms <= 15;
}

/* ───────── 표시 ───────── */

/** 「롬 5」 — 늘 책 이름과 장을 함께 */
export function chapterTag(b: number, c: number): string {
  return `${BOOKS[b]?.[1] ?? ''} ${c}`;
}

/** 「로마서 5장」 · 「시편 23편」 */
export function chapterLong(b: number, c: number): string {
  return `${BOOKS[b]?.[0] ?? ''} ${c}${b === PSALMS ? '편' : '장'}`;
}

/** 고른 이유 한 마디 */
export function reasonText(
  ch: ChapterPos & { reason: PilsaReason },
  plan?: PilsaPlan | null,
): string {
  switch (ch.reason) {
    case 'main':
      return '설교 본문';
    case 'cited':
      return '설교에 나온 장';
    case 'next':
      return '다음 주 본문';
    case 'common':
      return '함께 쓰는 장';
    default: {
      const main = plan?.chapters.find((x) => x.reason === 'main');
      if (main && main.b === ch.b) return ch.c < main.c ? '앞 장' : '뒤 장';
      return '이어지는 장';
    }
  }
}
