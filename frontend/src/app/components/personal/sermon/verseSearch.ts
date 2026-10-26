import { BOOKS, OT_COUNT, PSALMS, bookPrefix, chCount, norm, parseRef, vCount } from './bibleRefs';
import type { BibleData } from './useBible';

/**
 * 성경 읽기 「말씀 찾기」 — 한 칸에 주소면 그 자리로, 단어면 본문에서 찾는다.
 * 본문은 이미 기기에 있으므로(useBible) 서버 없이 31,103절을 바로 훑는다.
 */

export type SearchScope = 'all' | 'ot' | 'nt';

/** 칸 아래 고를거리 — 이동(go) 아니면 본문에서 찾기(word) */
export type SearchOption =
  | { kind: 'go'; b: number; c: number; v: number | null; label: string; sub: string }
  | { kind: 'word'; q: string; label: string; sub: string };

export interface SearchHit {
  b: number;
  c: number;
  v: number;
}

const unit = (b: number) => (b === PSALMS ? '편' : '장');

/** 띄어 쓴 낱말들 (겹치는 것은 한 번만) */
export function searchTerms(q: string): string[] {
  return [...new Set(q.trim().split(/\s+/).filter(Boolean))];
}

/** 주소로 읽히는 입력인지 — 그렇다면 본문 찾기를 고를거리에 넣지 않는다 */
export function isAddress(q: string): boolean {
  return !!parseRef(q);
}

/** 입력 → 고를거리. 맨 위가 Enter 의 기본값 */
export function searchOptions(q: string): SearchOption[] {
  const s = norm(q);
  if (!s) return [];
  const p = parseRef(q);
  if (p) {
    const name = BOOKS[p.b][0];
    if (p.v1 == null) {
      const n = vCount(p.b, p.c);
      return [
        { kind: 'go', b: p.b, c: p.c, v: null, label: `${name} ${p.c}${unit(p.b)}`, sub: `${n}절` },
      ];
    }
    const head = `${name} ${p.c}${unit(p.b)}`;
    const out: SearchOption[] = [
      { kind: 'go', b: p.b, c: p.c, v: p.v1, label: `${head} ${p.v1}절`, sub: '바로 가기' },
    ];
    // 「롬 8:2」 를 치는 중이면 20·21·22절도 후보로
    if (!p.dash) {
      const max = vCount(p.b, p.c);
      for (let e = p.v1 * 10; e <= max && out.length < 4; e++) {
        if (String(e).startsWith(String(p.v1)))
          out.push({ kind: 'go', b: p.b, c: p.c, v: e, label: `${head} ${e}절`, sub: '' });
      }
    }
    return out;
  }
  const out: SearchOption[] = [];
  // 숫자 없는 짧은 입력은 책 이름일 수도 있다 (「요」「사무」)
  if (!/\d/.test(s) && s.length <= 6) {
    bookPrefix(s)
      .slice(0, 3)
      .forEach((b) =>
        out.push({
          kind: 'go',
          b,
          c: 1,
          v: null,
          label: BOOKS[b][0],
          sub: `${BOOKS[b][1]} · ${chCount(b)}${unit(b)}`,
        }),
      );
  }
  const word = q.trim().replace(/\s+/g, ' ');
  const wordOpt: SearchOption = {
    kind: 'word',
    q: word,
    label: `「${word}」 본문에서 찾기`,
    sub: '',
  };
  // 정확한 책 이름(「룻기」)이면 책이 먼저, 아니면 본문 찾기가 먼저
  const exact = out.some((o) => o.kind === 'go' && (BOOKS[o.b][0] === s || BOOKS[o.b][1] === s));
  if (exact) out.push(wordOpt);
  else out.unshift(wordOpt);
  return out;
}

/** 낱말이 모두 들어간 절 — 성경 차례대로 */
export function searchBible(bible: BibleData, q: string, scope: SearchScope = 'all'): SearchHit[] {
  const terms = searchTerms(q);
  if (!terms.length) return [];
  const from = scope === 'nt' ? OT_COUNT : 0;
  const to = scope === 'ot' ? OT_COUNT : BOOKS.length;
  const out: SearchHit[] = [];
  for (let b = from; b < to; b++) {
    const book = bible[b] || [];
    for (let c = 0; c < book.length; c++) {
      const ch = book[c];
      for (let v = 0; v < ch.length; v++) {
        const t = ch[v];
        if (terms.every((x) => t.includes(x))) out.push({ b, c: c + 1, v: v + 1 });
      }
    }
  }
  return out;
}

/** 권별로 묶기 (차례 유지) */
export function groupByBook(hits: SearchHit[]): Array<{ b: number; hits: SearchHit[] }> {
  const out: Array<{ b: number; hits: SearchHit[] }> = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (last && last.b === h.b) last.hits.push(h);
    else out.push({ b: h.b, hits: [h] });
  }
  return out;
}

/** 절 글자를 낱말 경계로 자른 조각 — 칠할 조각은 hit=true */
export function splitTerms(text: string, terms: string[]): Array<{ t: string; hit: boolean }> {
  if (!terms.length) return [{ t: text, hit: false }];
  const esc = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${esc.join('|')})`, 'g');
  return text
    .split(re)
    .filter(Boolean)
    .map((t) => ({ t, hit: terms.includes(t) }));
}
