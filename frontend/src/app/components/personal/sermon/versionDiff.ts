import { plainText } from './sermonTypes';

/**
 * 버전 비교 — 본문 HTML 을 맨 위 블록(문단·제목·목록·말씀 블록) 단위로 나눠
 * 문단끼리 LCS 로 맞추고, 짝지은 문단 안에서는 단어 단위로 다시 비교한다.
 * 버전 기록 창에서 "되돌리면 달라지는 것"·"이때 쓴 것"을 보여 주고, 문단 하나만 가져올 때 쓴다.
 */
export interface Block {
  html: string;
  text: string;
  /** 비교 기준 — 글자가 없으면(사진·빈 줄) html */
  key: string;
}

export type WordOp = { t: 'eq' | 'add' | 'del'; v: string };

export type BlockOp =
  | { t: 'eq'; o: Block; n: Block }
  | { t: 'add'; n: Block }
  | { t: 'del'; o: Block }
  | { t: 'mod'; o: Block; n: Block; words: WordOp[] };

export function splitBlocks(html: string | null | undefined): Block[] {
  if (!html) return [];
  const d = document.createElement('div');
  d.innerHTML = html;
  const out: Block[] = [];
  d.childNodes.forEach((node) => {
    let h: string;
    if (node.nodeType === Node.ELEMENT_NODE) h = (node as Element).outerHTML;
    else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) h = node.textContent;
    else return;
    const text = plainText(h);
    const rich = /<(img|video|audio)\b|data-ref=/.test(h);
    out.push({ html: h, text, key: text || (rich ? h : '') });
  });
  return out;
}

/** 일반 LCS — 양쪽 곱이 너무 크면 null (통째로 바뀐 것으로 본다) */
function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean, limit = 400_000) {
  const n = a.length;
  const m = b.length;
  if (n * m > limit) return null;
  const d: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      d[i][j] = eq(a[i], b[j]) ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const out: Array<{ t: 'eq' | 'add' | 'del'; i: number; j: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) out.push({ t: 'eq', i: i++, j: j++ });
    else if (d[i + 1][j] >= d[i][j + 1]) out.push({ t: 'del', i: i++, j });
    else out.push({ t: 'add', i, j: j++ });
  }
  while (i < n) out.push({ t: 'del', i: i++, j });
  while (j < m) out.push({ t: 'add', i, j: j++ });
  return out;
}

const tokens = (s: string) => s.split(/(\s+)/).filter(Boolean);

export function diffWords(a: string, b: string): WordOp[] {
  const ta = tokens(a);
  const tb = tokens(b);
  const ops = lcs(ta, tb, (x, y) => x === y, 250_000);
  const raw: WordOp[] = ops
    ? ops.map((o) =>
        o.t === 'eq'
          ? { t: 'eq', v: ta[o.i] }
          : o.t === 'del'
            ? { t: 'del', v: ta[o.i] }
            : { t: 'add', v: tb[o.j] },
      )
    : [
        { t: 'del', v: a },
        { t: 'add', v: b },
      ];
  // 바뀐 곳 사이의 공백 한 칸은 바뀐 덩이에 넣고, 바뀐 덩이마다 "지운 것 → 쓴 것" 한 쌍으로 묶는다
  const merged: WordOp[] = [];
  let del = '';
  let add = '';
  const flush = () => {
    if (del) merged.push({ t: 'del', v: del });
    if (add) merged.push({ t: 'add', v: add });
    del = '';
    add = '';
  };
  raw.forEach((w, i) => {
    if (w.t === 'eq') {
      const inGap = /^\s+$/.test(w.v) && (del || add) && raw[i + 1] && raw[i + 1].t !== 'eq';
      if (inGap) {
        del += w.v;
        add += w.v;
        return;
      }
      flush();
      const last = merged[merged.length - 1];
      if (last && last.t === 'eq') last.v += w.v;
      else merged.push({ ...w });
      return;
    }
    if (w.t === 'del') del += w.v;
    else add += w.v;
  });
  flush();
  return merged;
}

function similar(a: string, b: string): number {
  const A = new Set(tokens(a).filter((w) => w.trim()));
  const B = tokens(b).filter((w) => w.trim());
  if (!A.size || !B.length) return 0;
  let c = 0;
  B.forEach((w) => {
    if (A.has(w)) c++;
  });
  return c / Math.min(A.size, B.length);
}

/** old → new 로 가는 문단 단위 차이 */
export function diffBlocks(oldB: Block[], newB: Block[]): BlockOp[] {
  const ops = lcs(oldB, newB, (x, y) => x.key === y.key) || [
    ...oldB.map((_, i) => ({ t: 'del' as const, i, j: 0 })),
    ...newB.map((_, j) => ({ t: 'add' as const, i: 0, j })),
  ];
  const res: BlockOp[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.t === 'eq') {
      res.push({ t: 'eq', o: oldB[op.i], n: newB[op.j] });
      k++;
      continue;
    }
    const dels: Block[] = [];
    const adds: Block[] = [];
    while (k < ops.length && ops[k].t !== 'eq') {
      const o = ops[k];
      if (o.t === 'del') dels.push(oldB[o.i]);
      else adds.push(newB[o.j]);
      k++;
    }
    // 고친 문단은 지운 것 + 새로 쓴 것이 아니라 한 문단으로 보이게 짝짓는다 (순서 유지)
    const pairOf = new Map<number, number>();
    let from = 0;
    dels.forEach((dv, di) => {
      for (let ai = from; ai < adds.length; ai++) {
        if (dv.text && adds[ai].text && similar(dv.text, adds[ai].text) >= 0.34) {
          pairOf.set(ai, di);
          from = ai + 1;
          return;
        }
      }
    });
    const pairedDel = new Set(pairOf.values());
    let di = 0;
    adds.forEach((av, ai) => {
      const p = pairOf.get(ai);
      if (p === undefined) {
        res.push({ t: 'add', n: av });
        return;
      }
      for (; di < p; di++) if (!pairedDel.has(di)) res.push({ t: 'del', o: dels[di] });
      di = p + 1;
      res.push({ t: 'mod', o: dels[p], n: av, words: diffWords(dels[p].text, av.text) });
    });
    for (; di < dels.length; di++) if (!pairedDel.has(di)) res.push({ t: 'del', o: dels[di] });
  }
  return res;
}

export interface DiffSummary {
  added: number;
  removed: number;
  /** 처음 바뀐 곳 한 줄 */
  first: string;
  /** 처음 바뀐 곳이 지운 것뿐인지 */
  firstIsRemoval: boolean;
}

const len = (s: string) => s.replace(/\s+/g, '').length;

export function summarize(ops: BlockOp[]): DiffSummary {
  let added = 0;
  let removed = 0;
  let first = '';
  let firstRemoved = '';
  for (const op of ops) {
    if (op.t === 'add') {
      added += len(op.n.text);
      if (!first && op.n.text) first = op.n.text;
    } else if (op.t === 'del') {
      removed += len(op.o.text);
      if (!firstRemoved && op.o.text) firstRemoved = op.o.text;
    } else if (op.t === 'mod') {
      let before = 0;
      let at = -1;
      for (const w of op.words) {
        if (w.t === 'add') {
          added += len(w.v);
          if (at < 0) at = before;
        } else if (w.t === 'del') {
          removed += len(w.v);
          if (!firstRemoved) firstRemoved = w.v.trim();
        }
        if (w.t !== 'del') before += w.v.length;
      }
      if (!first && at >= 0) {
        const s = Math.max(0, at - 12);
        first = (s > 0 ? '…' : '') + op.n.text.slice(s).trim();
      }
    }
  }
  return {
    added,
    removed,
    first: first || firstRemoved,
    firstIsRemoval: !first && !!firstRemoved,
  };
}

/** 지금 글(old)에 버전(new)의 문단 하나만 넣은 본문 — ops 는 diffBlocks(지금, 버전) */
export function takeOne(ops: BlockOp[], index: number): string {
  return ops
    .map((op, i) => {
      if (op.t === 'eq' || op.t === 'del') return op.o.html;
      if (op.t === 'add') return i === index ? op.n.html : '';
      return i === index ? op.n.html : op.o.html;
    })
    .join('');
}

/** 직전 대비 많이 지워졌는지 — 300자 넘게, 또는 30% 넘게 줄었을 때 */
export function isBigRemoval(s: DiffSummary, prevChars: number): boolean {
  const net = s.removed - s.added;
  return net >= 300 || (prevChars >= 100 && net / prevChars > 0.3);
}
