import { BOOKS, decRef, encRef, PSALMS, refLong, type Ref } from '../bibleRefs';
import { mainRef, type SermonNote } from '../sermonTypes';
import { firstVerseText, verses } from '../useBible';

/**
 * 설교 카드 공유 — 데이터 모델.
 *  - 표지 카드: 책 이름 + 장, 설교 제목·설교자·예배, 본문 첫 절
 *  - 밑줄 카드: 붙잡은 한 문장. 내 노트 문단(강조 = 밑줄)이거나 말씀 구절의 밑줄(data-marks)
 * 1단계는 서버가 없다. 카드 링크(/sermonnote/c?…)는 카드에 보이는 내용만 쿼리에 담고,
 * 받은 사람이 「나도 기록하기」를 누르면 같은 설교 정보로 새 노트를 연다(/sermonnote?start=…).
 */

export type CardKind = 'cover' | 'line';
export type CardFmt = 'feed' | 'story';

/** 문장 조각. m = 밑줄(강조) */
export interface Seg {
  t: string;
  m: boolean;
}

export interface LineQuote {
  src: 'note' | 'verse';
  segs: Seg[];
  /** 말씀일 때 그 구절 주소 (encRef) */
  ref?: string | null;
}

export interface CardData {
  kind: CardKind;
  title: string;
  preacher: string;
  service: string;
  /** yyyy-mm-dd */
  date: string;
  /** 설교 본문 주소 (encRef) */
  ref: string | null;
  /** 표지 카드 본문 첫 절 */
  verse: string;
  quote?: LineQuote;
}

export interface LineCandidate extends LineQuote {
  id: string;
  /** 밑줄이 있는 후보인지 (없으면 그냥 문단) */
  marked: boolean;
}

export const QUOTE_MAX = 220;
const TITLE_MAX = 120;
const META_MAX = 40;
const VERSE_MAX = 200;

/* ───────── 표시용 ───────── */

/** 책 이름: 다섯 글자 이상이면 약어 (홈 표지 카드와 같은 규칙) */
export function cardBookName(r: Ref): string {
  const [long, short] = BOOKS[r.b];
  return long.length > 4 ? short : long;
}

export function cardChapterUnit(r: Ref): string {
  return r.b === PSALMS ? '편' : '장';
}

export function cardVerseRange(r: Ref): string {
  if (r.whole) return r.b === PSALMS ? '전체' : '장 전체';
  return r.v2 > r.v1 ? `${r.v1}–${r.v2}절` : `${r.v1}절`;
}

/** 2026-10-25 → 10.25 */
export function cardDate(ds: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds || '');
  return m ? `${+m[2]}.${+m[3]}` : '';
}

export function segsText(segs: Seg[]): string {
  return segs.map((s) => s.t).join('');
}

/** 글자 수에 맞춰 줄인다. 넘치면 끝에 … */
export function trimSegs(segs: Seg[], max = QUOTE_MAX): Seg[] {
  const out: Seg[] = [];
  let left = max;
  for (const s of segs) {
    if (left <= 0) break;
    if (s.t.length <= left) {
      out.push({ ...s });
      left -= s.t.length;
    } else {
      out.push({ t: s.t.slice(0, left).trimEnd() + '…', m: s.m });
      left = 0;
    }
  }
  return mergeSegs(out);
}

function mergeSegs(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (!s.t) continue;
    const last = out[out.length - 1];
    if (last && last.m === s.m) last.t += s.t;
    else out.push({ ...s });
  }
  // 앞뒤 공백 정리
  if (out.length) {
    out[0].t = out[0].t.replace(/^\s+/, '');
    out[out.length - 1].t = out[out.length - 1].t.replace(/\s+$/, '');
  }
  return out.filter((s) => s.t);
}

/* ───────── 노트 → 카드 ───────── */

export function coverData(n: SermonNote): CardData {
  const r = mainRef(n);
  return {
    kind: 'cover',
    title: (n.title || '').trim(),
    preacher: (n.preacher || '').trim(),
    service: (n.service || '').trim(),
    date: n.date || '',
    ref: r ? encRef(r) : null,
    verse: r ? firstVerseText(r).slice(0, VERSE_MAX) : '',
  };
}

export function lineData(n: SermonNote, q: LineQuote): CardData {
  return { ...coverData(n), kind: 'line', quote: { ...q, segs: trimSegs(q.segs) } };
}

/** DOM 조각 → 문장 조각. 굵게(b/strong)는 밑줄. 절 번호(sup)·버튼·구절 칩 안 화살표 등은 뺀다 */
export function segsFromNode(root: Node): Seg[] {
  const out: Seg[] = [];
  const walk = (node: Node, m: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push({ t: (node.nodeValue || '').replace(/\s+/g, ' '), m });
      return;
    }
    if (!(node instanceof Element) && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (node instanceof Element) {
      const tag = node.tagName;
      if (tag === 'SUP' || tag === 'BUTTON' || tag === 'SVG' || tag === 'svg') return;
      if (node.classList.contains('sn-vhead') || node.classList.contains('sn-acts')) return;
      if (tag === 'B' || tag === 'STRONG') m = true;
      if (tag === 'BR') {
        out.push({ t: ' ', m });
        return;
      }
    }
    node.childNodes.forEach((c) => walk(c, m));
  };
  walk(root, false);
  return mergeSegs(out);
}

type Marks = Record<string, Array<[number, number]>>;

function segsFromMarks(text: string, iv: Array<[number, number]>): Seg[] {
  const out: Seg[] = [];
  let p = 0;
  [...iv]
    .sort((a, b) => a[0] - b[0])
    .forEach(([s, e]) => {
      if (s > p) out.push({ t: text.slice(p, s), m: false });
      out.push({ t: text.slice(Math.max(s, p), e), m: true });
      p = Math.max(p, e);
    });
  if (p < text.length) out.push({ t: text.slice(p), m: false });
  return mergeSegs(out);
}

/**
 * 밑줄 카드 후보.
 *  1) 말씀 블록에서 밑줄 친 절 (성경 데이터가 있어야 본문을 알 수 있다)
 *  2) 내 노트에서 강조(굵게)한 부분이 든 문단
 *  3) 밑줄이 없는 문단 — 고를 거리가 없을 때를 위해 뒤에 몇 개
 */
export function lineCandidates(n: SermonNote, plainLimit = 6): LineCandidate[] {
  const d = document.createElement('div');
  d.innerHTML = n.body || '';
  const marked: LineCandidate[] = [];
  const plain: LineCandidate[] = [];
  let i = 0;

  const blocks: Element[] = [];
  d.childNodes.forEach((c) => {
    if (!(c instanceof Element)) return;
    if (c.tagName === 'UL' || c.tagName === 'OL')
      c.querySelectorAll('li').forEach((li) => blocks.push(li));
    else blocks.push(c);
  });

  for (const el of blocks) {
    if (el.classList.contains('sn-vblock')) {
      const r = decRef((el as HTMLElement).dataset.ref);
      if (!r) continue;
      let mk: Marks;
      try {
        mk = JSON.parse((el as HTMLElement).dataset.marks || '{}') as Marks;
      } catch {
        mk = {};
      }
      const vs = verses(r) || [];
      for (const [v, text] of vs) {
        const iv = mk[String(v)];
        if (!iv?.length) continue;
        const one: Ref = { b: r.b, c: r.c, v1: v, v2: v, whole: false };
        marked.push({
          id: `v${i++}`,
          src: 'verse',
          segs: segsFromMarks(text, iv),
          ref: encRef(one),
          marked: true,
        });
      }
      continue;
    }
    const segs = segsFromNode(el);
    const text = segsText(segs);
    if (text.length < 4) continue;
    if (segs.some((s) => s.m)) marked.push({ id: `n${i++}`, src: 'note', segs, marked: true });
    else if (plain.length < plainLimit)
      plain.push({ id: `p${i++}`, src: 'note', segs, marked: false });
  }
  return [...marked, ...plain];
}

/* ───────── 카드 링크 ───────── */

/** == 로 밑줄을 감싼다: "아담 ==한 사람== 때문에" */
export function segsToMarked(segs: Seg[]): string {
  return segs
    .map((s) => (s.m ? `==${s.t.replace(/==/g, '=')}==` : s.t.replace(/==/g, '=')))
    .join('');
}

export function markedToSegs(s: string): Seg[] {
  return mergeSegs(s.split('==').map((t, i) => ({ t, m: i % 2 === 1 })));
}

const clip = (v: string | null, max: number) => (v || '').slice(0, max);

export function cardQuery(d: CardData): string {
  const p = new URLSearchParams();
  p.set('k', d.kind);
  if (d.title) p.set('t', d.title);
  if (d.preacher) p.set('p', d.preacher);
  if (d.service) p.set('s', d.service);
  if (d.date) p.set('d', d.date);
  if (d.ref) p.set('r', d.ref);
  if (d.kind === 'cover' && d.verse) p.set('v', d.verse);
  if (d.kind === 'line' && d.quote) {
    p.set('q', segsToMarked(d.quote.segs));
    p.set('qs', d.quote.src === 'verse' ? 'v' : 'n');
    if (d.quote.ref) p.set('qr', d.quote.ref);
  }
  return p.toString();
}

export function cardUrl(d: CardData, origin = window.location.origin): string {
  return `${origin}/sermonnote/c?${cardQuery(d)}`;
}

export function parseCard(p: URLSearchParams): CardData | null {
  const kind = p.get('k') === 'line' ? 'line' : p.get('k') === 'cover' ? 'cover' : null;
  if (!kind) return null;
  const ref = decRef(p.get('r')) ? p.get('r') : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.get('d') || '') ? (p.get('d') as string) : '';
  const d: CardData = {
    kind,
    title: clip(p.get('t'), TITLE_MAX),
    preacher: clip(p.get('p'), META_MAX),
    service: clip(p.get('s'), META_MAX),
    date,
    ref,
    verse: clip(p.get('v'), VERSE_MAX),
  };
  if (kind === 'line') {
    const segs = trimSegs(markedToSegs(clip(p.get('q'), QUOTE_MAX * 2)));
    if (!segs.length) return null;
    const qr = decRef(p.get('qr')) ? p.get('qr') : null;
    d.quote = { src: p.get('qs') === 'v' ? 'verse' : 'note', segs, ref: qr };
  }
  if (!d.title && !d.ref && !d.quote) return null;
  return d;
}

/** 카드 공유 글 (OS 공유 시트의 text) */
export function cardShareText(d: CardData): string {
  const r = decRef(d.ref);
  const head = d.title || (r ? refLong(r) : '설교 노트');
  return r && d.title ? `${head} · ${refLong(r)}` : head;
}

/* ───────── 받은 사람: 같은 설교로 새 노트 ───────── */

const START_KEYS = ['start', 'st', 'sp', 'ss', 'sd', 'sr', 'sf'] as const;

export interface StartSeed {
  title: string;
  preacher: string;
  service: string;
  date: string;
  refs: string[];
  /** 첫 한 줄 */
  first: string;
}

/** 카드 → /sermonnote?start=1&… (설교 정보 미리 채움). blank 면 빈 새 노트 */
export function startPath(d: CardData | null, first = ''): string {
  const p = new URLSearchParams();
  p.set('start', d ? '1' : 'blank');
  if (d) {
    if (d.title) p.set('st', d.title);
    if (d.preacher) p.set('sp', d.preacher);
    if (d.service) p.set('ss', d.service);
    if (d.date) p.set('sd', d.date);
    if (d.ref) p.set('sr', d.ref);
  }
  if (first.trim()) p.set('sf', first.trim().slice(0, 500));
  return `/sermonnote?${p.toString()}`;
}

export function readStart(p: URLSearchParams): StartSeed | null {
  const mode = p.get('start');
  if (mode !== '1' && mode !== 'blank') return null;
  const ref = decRef(p.get('sr')) ? (p.get('sr') as string) : null;
  return {
    title: clip(p.get('st'), TITLE_MAX),
    preacher: clip(p.get('sp'), META_MAX),
    service: clip(p.get('ss'), META_MAX),
    date: /^\d{4}-\d{2}-\d{2}$/.test(p.get('sd') || '') ? (p.get('sd') as string) : '',
    refs: ref ? [ref] : [],
    first: clip(p.get('sf'), 500),
  };
}

export function clearStart(p: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(p);
  START_KEYS.forEach((k) => next.delete(k));
  return next;
}
