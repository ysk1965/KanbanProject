import { BOOKS, refLong, type Ref } from '../bibleRefs';
import { daysAgo, noteRefs, type SermonNote } from '../sermonTypes';
import { verses } from '../useBible';
import { shuffle } from './books';
import type { RainKind, RainWord } from './rainScore';

/**
 * 말씀 산성비 단어 묶음. 기본은 「이번 주 설교」 — 최근 7일 안에 쓴 가장 최근 노트의 구절에서 뽑는다.
 * 어절을 나누고 문장 부호를 떼어 2~7자만 남기고 겹치는 건 한 번만 (계약: pool 20~400개).
 */

export type RainSetKey = 'sermon' | 'john15' | 'ps23' | 'books';

export interface RainSet {
  key: RainSetKey;
  label: string;
  pool: string[];
}

export const POOL_MIN = 20;
export const POOL_MAX = 400;

/** 본문 문자열들 → 단어 (2~7자, 문장 부호 제거, 처음 나온 순서로 중복 제거) */
export function extractWords(texts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of texts) {
    for (const raw of (t || '').split(/\s+/)) {
      const w = raw.replace(/[^\p{L}\p{N}]/gu, '');
      if (w.length < 2 || w.length > 7 || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}

function refTexts(r: Ref): string[] {
  return (verses(r) || []).map(([, t]) => t);
}

/** 구절 묶음 → 단어. 모자라면 (20개 미만) 첫 구절이 든 장 전체로 넓힌다 */
export function poolFromRefs(refs: Ref[]): string[] {
  let words = extractWords(refs.flatMap(refTexts));
  if (words.length < POOL_MIN && refs[0]) {
    const r = refs[0];
    words = extractWords([
      ...refs.flatMap(refTexts),
      ...refTexts({ ...r, v1: 1, v2: 999, whole: true }),
    ]);
  }
  return words.slice(0, POOL_MAX);
}

/** 최근 7일 안의 가장 최근 노트 중 구절이 있는 것 */
export function sermonSource(notes: SermonNote[]): { note: SermonNote; refs: Ref[] } | null {
  const recent = notes
    .filter((n) => {
      const d = daysAgo(n.date);
      return d >= 0 && d <= 6;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  for (const note of recent) {
    const refs = noteRefs(note);
    if (refs.length) return { note, refs };
  }
  return null;
}

/* 성경 데이터를 아직 못 받았을 때 쓰는 대체 단어 (개역한글) */
const JOHN15_FALLBACK =
  '내가 포도나무요 아버지는 농부라 무릇 내게 있어 과실을 맺지 아니하는 가지는 아버지께서 이를 제해 버리시고 맺는 가지는 더 과실을 맺게 하려하여 이를 깨끗케 하시느니라 너희는 내가 일러준 말로 이미 깨끗하였으니 내 안에 거하라 나도 너희 안에 거하리라 가지가 포도나무에 붙어 있지 아니하면 절로 과실을 맺을 수 없음 같이 너희도 내 안에 있지 아니하면 그러하리라 나는 포도나무요 너희는 가지니 저가 내 안에 내가 저 안에 있으면 사람은 과실을 많이 맺나니 나를 떠나서는 너희가 아무 것도 할 수 없음이라 사람이 내 안에 거하지 아니하면 가지처럼 밖에 버리워 말라지나니 사람들이 이것을 모아다가 불에 던져 사르느니라 너희가 내 안에 거하고 내 말이 너희 안에 거하면 무엇이든지 원하는대로 구하라 그리하면 이루리라 너희가 과실을 많이 맺으면 아버지께서 영광을 받으실 것이요 너희는 내 제자가 되리라 아버지께서 나를 사랑하신 것같이 나도 너희를 사랑하였으니 나의 사랑 안에 거하라 내가 아버지의 계명을 지켜 그의 사랑 안에 거하는것 같이 너희도 내 계명을 지키면 내 사랑 안에 거하리라';
const PS23_FALLBACK =
  '여호와는 나의 목자시니 내가 부족함이 없으리로다 그가 나를 푸른 초장에 누이시며 쉴만한 물 가으로 인도하시는도다 내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다 내가 사망의 음침한 골짜기로 다닐찌라도 해를 두려워하지 않을 것은 주께서 나와 함께 하심이라 주의 지팡이와 막대기가 나를 안위하시나이다 주께서 내 원수의 목전에서 내게 상을 베푸시고 기름으로 내 머리에 바르셨으니 내 잔이 넘치나이다 나의 평생에 선하심과 인자하심이 정녕 나를 따르리니 내가 여호와의 집에 영원히 거하리로다';

function chapterPool(b: number, c: number, fallback: string): string[] {
  const r: Ref = { b, c, v1: 1, v2: 999, whole: true };
  const vs = verses(r);
  return vs && vs.length ? extractWords(vs.map(([, t]) => t)) : extractWords([fallback]);
}

export function fixedSet(key: Exclude<RainSetKey, 'sermon'>): RainSet {
  if (key === 'john15')
    return { key, label: '요한복음 15장', pool: chapterPool(42, 15, JOHN15_FALLBACK) };
  if (key === 'ps23') return { key, label: '시편 23편', pool: chapterPool(18, 23, PS23_FALLBACK) };
  return { key, label: '성경 66권 이름', pool: BOOKS.map((b) => b[0]) };
}

/** 이번 주 설교 단어 (없거나 너무 적으면 null) */
export function sermonSet(notes: SermonNote[]): RainSet | null {
  const src = sermonSource(notes);
  if (!src) return null;
  const pool = poolFromRefs(src.refs);
  if (pool.length < POOL_MIN) return null;
  return { key: 'sermon', label: `이번 주 설교 · ${refLong(src.refs[0])}`, pool };
}

/** 서버 없이 연습할 때 — 섞어서 600개까지 늘리고 금빛 6% · 갈피 5% (서버 규칙과 같은 비율) */
export function localWords(pool: string[], n = 600, rand: () => number = Math.random): RainWord[] {
  const out: RainWord[] = [];
  let bag: string[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    if (!bag.length) bag = shuffle(pool, rand);
    const r = rand();
    const kind: RainKind = r < 0.06 ? 'gold' : r < 0.11 ? 'galpi' : '';
    const text = bag.pop() as string;
    out.push({ i, text: kind === 'galpi' ? '갈피' : text, kind });
  }
  return out;
}
