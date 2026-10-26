import { BOOKS, OT_COUNT, PSALMS, chCount } from '../bibleRefs';

/**
 * 통독 길 만들기 — 템플릿 → 날짜가 붙은 날 목록. 날 나누기는 프런트가 한다(서버는 검증·저장만).
 * 장 키는 "b:c".
 */

export type TemplateId = 'mark16' | 'pp31' | 'nt90' | 'bible365' | 'custom';
/** 쉼표 요일 (0=일 … 6=토), null = 쉼 없이 */
export type RestDow = number | null;

export interface Template {
  id: TemplateId;
  title: string;
  pace: string;
  fit: string;
}

const MARK = 40;
const PROVERBS = 19;

export const TEMPLATES: Template[] = [
  { id: 'mark16', title: '마가복음 16일', pace: '하루 1장 · 약 6분', fit: '처음 해보는 길' },
  { id: 'pp31', title: '시편·잠언 31일', pace: '잠언 1장 + 시편 5편', fit: '한 달 단위로' },
  { id: 'nt90', title: '신약 90일', pace: '하루 3장 · 약 15분', fit: '한 분기 프로젝트' },
  { id: 'bible365', title: '성경 1년 1독', pace: '하루 3–4장', fit: '구약부터 차례로' },
  { id: 'custom', title: '직접 고르기', pace: '책 범위 · 하루 장 수', fit: '원하는 만큼' },
];

export const MAX_DAYS = 400;

export const chKey = (b: number, c: number) => `${b}:${c}`;

export function parseCh(k: string): { b: number; c: number } | null {
  const [b, c] = k.split(':').map(Number);
  return Number.isInteger(b) && Number.isInteger(c) && BOOKS[b] && c >= 1 && c <= chCount(b)
    ? { b, c }
    : null;
}

const unit = (b: number) => (b === PSALMS ? '편' : '장');

/** "마가복음 9장" */
export function chLabel(k: string): string {
  const p = parseCh(k);
  return p ? `${BOOKS[p.b][0]} ${p.c}${unit(p.b)}` : k;
}

/** ["39:1","39:2","39:3","40:1"] → "마태복음 1–3장 · 마가복음 1장" (같은 책 연속 장을 묶는다) */
export function chaptersLabel(keys: string[], short = false): string {
  const runs: Array<{ b: number; c1: number; c2: number }> = [];
  keys.forEach((k) => {
    const p = parseCh(k);
    if (!p) return;
    const last = runs[runs.length - 1];
    if (last && last.b === p.b && last.c2 + 1 === p.c) last.c2 = p.c;
    else runs.push({ b: p.b, c1: p.c, c2: p.c });
  });
  return runs
    .map(
      (r) =>
        `${short ? BOOKS[r.b][1] : BOOKS[r.b][0]} ${r.c1 === r.c2 ? r.c1 : `${r.c1}–${r.c2}`}${short ? '' : unit(r.b)}`,
    )
    .join(' · ');
}

/** b1 ~ b2 책의 모든 장 (차례대로) */
export function seqChapters(b1: number, b2: number): string[] {
  const out: string[] = [];
  for (let b = b1; b <= b2; b++) for (let c = 1; c <= chCount(b); c++) out.push(chKey(b, c));
  return out;
}

/** 장 목록을 n 일로 고르게 나눈다 (앞날이 조금 적게) */
export function splitEven(chs: string[], n: number): string[][] {
  const days: string[][] = [];
  for (let i = 0; i < n; i++)
    days.push(chs.slice(Math.round((i * chs.length) / n), Math.round(((i + 1) * chs.length) / n)));
  return days.filter((d) => d.length);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(ds: string, n: number): string {
  const [y, m, d] = ds.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

export function dowOf(ds: string): number {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** start 부터 n 개의 읽는 날 (쉼표 요일은 건너뛴다) */
export function readingDates(start: string, n: number, rest: RestDow): string[] {
  const out: string[] = [];
  let d = start;
  while (out.length < n) {
    if (rest === null || dowOf(d) !== rest) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export interface Custom {
  b1: number;
  b2: number;
  perDay: number;
}

export interface BuiltPlan {
  title: string;
  days: Array<{ date: string; chapters: string[] }>;
  chapters: number;
}

/** 템플릿 → 날 목록. 400일을 넘으면 null */
export function buildPlan(
  template: TemplateId,
  start: string,
  rest: RestDow,
  custom?: Custom,
): BuiltPlan | null {
  let groups: string[][];
  let title = TEMPLATES.find((t) => t.id === template)?.title || '';
  if (template === 'mark16') {
    groups = seqChapters(MARK, MARK).map((k) => [k]);
  } else if (template === 'pp31') {
    const ps = splitEven(seqChapters(PSALMS, PSALMS), 31);
    groups = Array.from({ length: 31 }, (_, i) => [chKey(PROVERBS, i + 1), ...ps[i]]);
  } else if (template === 'nt90') {
    groups = splitEven(seqChapters(OT_COUNT, BOOKS.length - 1), 90);
  } else if (template === 'bible365') {
    groups = splitEven(seqChapters(0, BOOKS.length - 1), 365);
  } else {
    if (!custom) return null;
    const b1 = Math.min(custom.b1, custom.b2);
    const b2 = Math.max(custom.b1, custom.b2);
    const per = Math.min(10, Math.max(1, Math.round(custom.perDay)));
    const chs = seqChapters(b1, b2);
    groups = [];
    for (let i = 0; i < chs.length; i += per) groups.push(chs.slice(i, i + per));
    title = `${b1 === b2 ? BOOKS[b1][0] : `${BOOKS[b1][0]}–${BOOKS[b2][0]}`} ${groups.length}일`;
  }
  if (!groups.length || groups.length > MAX_DAYS) return null;
  const dates = readingDates(start, groups.length, rest);
  return {
    title,
    days: groups.map((chapters, i) => ({ date: dates[i], chapters })),
    chapters: groups.reduce((n, g) => n + g.length, 0),
  };
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** "10.27 화" */
export function mdDow(ds: string): string {
  const [, m, d] = ds.split('-').map(Number);
  return `${m}.${d} ${DOW[dowOf(ds)]}`;
}

export function md(ds: string): string {
  const [, m, d] = ds.split('-').map(Number);
  return `${m}.${d}`;
}

export const REST_OPTIONS: Array<[RestDow, string]> = [
  [6, '토요일 쉼'],
  [0, '주일 쉼'],
  [null, '쉼 없이'],
];
