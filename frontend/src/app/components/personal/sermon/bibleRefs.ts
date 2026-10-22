/**
 * 성경 구절 주소 해석기 — 설교 노트 전용.
 * 기획서: docs(설교 노트 앱 기획서) §5 구절 찾기 창 · 데이터 구조
 *
 * 주소 표기: `권:장:시작절-끝절` (요한복음 3:16 = `42:3:16-16`). 장 전체는 끝에 `w`.
 * 66권 정식 명칭·약어·별칭을 인식하고, 장·절 범위는 실제 절 수(성경 데이터 로드 후)로 검증한다.
 */

/** [정식 명칭, 약어, 장 수] — 배열 인덱스가 권 번호(0 = 창세기) */
export const BOOKS: ReadonlyArray<readonly [string, string, number]> = [
  ['창세기', '창', 50],
  ['출애굽기', '출', 40],
  ['레위기', '레', 27],
  ['민수기', '민', 36],
  ['신명기', '신', 34],
  ['여호수아', '수', 24],
  ['사사기', '삿', 21],
  ['룻기', '룻', 4],
  ['사무엘상', '삼상', 31],
  ['사무엘하', '삼하', 24],
  ['열왕기상', '왕상', 22],
  ['열왕기하', '왕하', 25],
  ['역대상', '대상', 29],
  ['역대하', '대하', 36],
  ['에스라', '스', 10],
  ['느헤미야', '느', 13],
  ['에스더', '에', 10],
  ['욥기', '욥', 42],
  ['시편', '시', 150],
  ['잠언', '잠', 31],
  ['전도서', '전', 12],
  ['아가', '아', 8],
  ['이사야', '사', 66],
  ['예레미야', '렘', 52],
  ['예레미야애가', '애', 5],
  ['에스겔', '겔', 48],
  ['다니엘', '단', 12],
  ['호세아', '호', 14],
  ['요엘', '욜', 3],
  ['아모스', '암', 9],
  ['오바댜', '옵', 1],
  ['요나', '욘', 4],
  ['미가', '미', 7],
  ['나훔', '나', 3],
  ['하박국', '합', 3],
  ['스바냐', '습', 3],
  ['학개', '학', 2],
  ['스가랴', '슥', 14],
  ['말라기', '말', 4],
  ['마태복음', '마', 28],
  ['마가복음', '막', 16],
  ['누가복음', '눅', 24],
  ['요한복음', '요', 21],
  ['사도행전', '행', 28],
  ['로마서', '롬', 16],
  ['고린도전서', '고전', 16],
  ['고린도후서', '고후', 13],
  ['갈라디아서', '갈', 6],
  ['에베소서', '엡', 6],
  ['빌립보서', '빌', 4],
  ['골로새서', '골', 4],
  ['데살로니가전서', '살전', 5],
  ['데살로니가후서', '살후', 3],
  ['디모데전서', '딤전', 6],
  ['디모데후서', '딤후', 4],
  ['디도서', '딛', 3],
  ['빌레몬서', '몬', 1],
  ['히브리서', '히', 13],
  ['야고보서', '약', 5],
  ['베드로전서', '벧전', 5],
  ['베드로후서', '벧후', 3],
  ['요한일서', '요일', 5],
  ['요한이서', '요이', 1],
  ['요한삼서', '요삼', 1],
  ['유다서', '유', 1],
  ['요한계시록', '계', 22],
];

export const PSALMS = 18;
export const OT_COUNT = 39;

const EXTRA: Record<string, number> = {
  요한1서: 61,
  요한2서: 62,
  요한3서: 63,
  '1요': 61,
  '2요': 62,
  '3요': 63,
  계시록: 65,
  행전: 43,
  애가: 24,
  아가서: 21,
  잠언서: 19,
  사도: 43,
  갈라디아: 47,
  에베소: 48,
  빌립보: 49,
  골로새: 50,
  히브리: 57,
  야고보: 58,
  유다: 64,
  빌레몬: 56,
  디도: 55,
  로마: 44,
  마태: 39,
  마가: 40,
  누가: 41,
};

const ALIAS = new Map<string, number>();
BOOKS.forEach((b, i) => {
  ALIAS.set(b[0], i);
  ALIAS.set(b[1], i);
});
for (const k in EXTRA) if (!ALIAS.has(k)) ALIAS.set(k, EXTRA[k]);

/** 구절 주소 */
export interface Ref {
  b: number;
  c: number;
  v1: number;
  v2: number;
  whole: boolean;
}

/** 입력 중인(아직 미완성일 수 있는) 해석 결과 */
export interface ParsedRef {
  b: number;
  c: number;
  v1: number | null;
  v2: number | null;
  whole: boolean;
  dash: boolean;
  endPart: string;
  sep: boolean;
}

/** VCOUNT[b][c-1] = 그 장의 절 수. 성경 데이터가 로드되면 채워진다. */
let VCOUNT: number[][] | null = null;

export function setVerseCounts(counts: number[][] | null) {
  VCOUNT = counts;
}

export function chCount(b: number): number {
  return BOOKS[b][2];
}

/** 데이터 로드 전에는 넉넉히 200으로 본다 (입력을 막지 않기 위해) */
export function vCount(b: number, c: number): number {
  return VCOUNT ? VCOUNT[b]?.[c - 1] || 0 : 200;
}

export function norm(s: string | null | undefined): string {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/：/g, ':')
    .replace(/[–—]/g, '-');
}

export function lookupBook(name: string): number {
  return ALIAS.has(name) ? (ALIAS.get(name) as number) : -1;
}

export function bookPrefix(q: string): number[] {
  if (!q) return [];
  const out: number[] = [];
  BOOKS.forEach((b, i) => {
    if (b[0].startsWith(q) || b[1].startsWith(q)) out.push(i);
  });
  out.sort((a, b) => (BOOKS[a][1] === q ? -1 : 0) - (BOOKS[b][1] === q ? -1 : 0));
  return out;
}

/** 구절 문자열 해석. 실패하면 null. */
export function parseRef(input: string): ParsedRef | null {
  const s = norm(input).replace(/절/g, '').replace(/편/g, '장');
  if (!s) return null;
  const m = s.match(/^(.+?)(\d{1,3})(?:(장|:|\.)(\d{1,3})?)?(?:([-~])(\d{1,3})?)?$/);
  if (!m) return null;
  const b = lookupBook(m[1]);
  if (b < 0) return null;
  const c = +m[2];
  if (c < 1 || c > chCount(b)) return null;
  const r: ParsedRef = {
    b,
    c,
    v1: null,
    v2: null,
    whole: false,
    dash: !!m[5],
    endPart: m[6] || '',
    sep: !!m[3],
  };
  if (m[4]) {
    r.v1 = +m[4];
    const max = vCount(b, c);
    if (r.v1 < 1 || r.v1 > max) return null;
    if (m[6]) {
      r.v2 = +m[6];
      if (r.v2 < r.v1 || r.v2 > max) r.v2 = null;
    }
  } else if (m[5]) return null;
  if (r.v1 == null) r.whole = true;
  return r;
}

/** 해석 결과를 넣을 수 있는 완전한 주소로 */
export function finalRef(p: ParsedRef | null): Ref | null {
  if (!p) return null;
  if (p.whole) return { b: p.b, c: p.c, v1: 1, v2: vCount(p.b, p.c), whole: true };
  return { b: p.b, c: p.c, v1: p.v1 as number, v2: p.v2 || (p.v1 as number), whole: false };
}

export function encRef(r: Ref): string {
  return `${r.b}:${r.c}:${r.v1}-${r.v2}${r.whole ? 'w' : ''}`;
}

export function decRef(s: string | null | undefined): Ref | null {
  const m = String(s ?? '').match(/^(\d+):(\d+):(\d+)-(\d+)(w?)$/);
  return m ? { b: +m[1], c: +m[2], v1: +m[3], v2: +m[4], whole: !!m[5] } : null;
}

export function sameRef(a: Ref, b: Ref): boolean {
  return encRef(a) === encRef(b);
}

export function refShort(r: Ref): string {
  const n = BOOKS[r.b][1];
  if (r.whole) return `${n} ${r.c}${r.b === PSALMS ? '편' : '장'}`;
  return `${n} ${r.c}:${r.v1}${r.v2 > r.v1 ? `-${r.v2}` : ''}`;
}

export function refLong(r: Ref): string {
  const n = BOOKS[r.b][0];
  if (r.whole) return `${n} ${r.c}${r.b === PSALMS ? '편' : '장'}`;
  return `${n} ${r.c}:${r.v1}${r.v2 > r.v1 ? `-${r.v2}` : ''}`;
}

export interface Suggestion {
  ref?: Ref;
  book?: number;
  sub: string;
}

/** 구절 찾기 창 「빠른 입력」 자동완성 */
export function suggest(q: string): Suggestion[] {
  const s = norm(q);
  if (!s) return [];
  const p = parseRef(s);
  const out: Suggestion[] = [];
  if (p) {
    const max = vCount(p.b, p.c);
    if (p.whole && !p.dash) {
      out.push({ ref: { b: p.b, c: p.c, v1: 1, v2: max, whole: true }, sub: `장 전체 · ${max}절` });
      out.push({ ref: { b: p.b, c: p.c, v1: 1, v2: 1, whole: false }, sub: '1절' });
    } else if (p.dash) {
      const v1 = p.v1 as number;
      if (p.endPart) {
        const cands: number[] = [];
        for (let e = v1; e <= max && cands.length < 3; e++) {
          if (String(e).startsWith(p.endPart) && e > v1) cands.push(e);
        }
        if (p.v2 && !cands.includes(p.v2) && p.v2 > v1) cands.unshift(p.v2);
        cands.forEach((e) =>
          out.push({ ref: { b: p.b, c: p.c, v1, v2: e, whole: false }, sub: `${e - v1 + 1}절` }),
        );
      } else {
        for (let e = v1 + 1; e <= Math.min(max, v1 + 2); e++) {
          out.push({ ref: { b: p.b, c: p.c, v1, v2: e, whole: false }, sub: `${e - v1 + 1}절` });
        }
        if (max > v1 + 2) {
          out.push({ ref: { b: p.b, c: p.c, v1, v2: max, whole: false }, sub: '장 끝까지' });
        }
      }
      out.push({ ref: { b: p.b, c: p.c, v1, v2: v1, whole: false }, sub: '1절만' });
    } else {
      const v1 = p.v1 as number;
      out.push({ ref: { b: p.b, c: p.c, v1, v2: v1, whole: false }, sub: '1절' });
      if (v1 < max) {
        out.push({
          ref: { b: p.b, c: p.c, v1, v2: max, whole: false },
          sub: `장 끝까지 · ${max - v1 + 1}절`,
        });
      }
    }
    return out;
  }
  // 책 이름만 입력된 단계 → 책 추천
  const bm = s.match(/^(.+?)(\d*)$/);
  const name = bm ? bm[1] : s;
  const ex = lookupBook(name);
  const list = ex >= 0 ? [ex] : bookPrefix(name);
  list
    .slice(0, 6)
    .forEach((i) =>
      out.push({ book: i, sub: `${BOOKS[i][1]} · ${BOOKS[i][2]}${i === PSALMS ? '편' : '장'}` }),
    );
  return out;
}

/** 문장 끝에 적힌 구절(`롬8:28`)을 찾는다 — 띄어쓰기 자동 변환용. */
export function tailRef(text: string): { start: number; ref: Ref } | null {
  const m = text.match(
    /((?:[1-3])?[가-힣]{1,8}\s?\d{1,3}\s?(?::|장)\s?\d{1,3}\s?절?(?:\s?[-~]\s?\d{1,3}\s?절?)?)$/,
  );
  if (!m) return null;
  const s = m[1];
  for (let i = 0; i < s.length; i++) {
    const cand = s.slice(i);
    if (/^\s/.test(cand)) continue;
    const p = parseRef(cand);
    if (p && !p.whole && (!p.dash || p.v2)) {
      const ref = finalRef(p);
      if (ref) return { start: text.length - cand.length, ref };
    }
  }
  return null;
}

/** 구절 정렬 키 (구절 모아보기) */
export function compareRef(a: Ref, b: Ref): number {
  return a.b - b.b || a.c - b.c || a.v1 - b.v1;
}
