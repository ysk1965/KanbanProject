import { decRef, encRef, refShort, type Ref } from './bibleRefs';
import type { SermonNote, Thought } from './sermonTypes';

/**
 * 성경 읽기 「그날의 손글씨」 — 노트가 성경에 남긴 자국.
 * 새로 저장하는 것은 없다. 노트의 설교 본문(refs)과 본문 속 구절 블록·칩(data-ref)을 장 단위로 모은다.
 *  - main  = 설교 본문 구절 (note.refs)
 *  - quote = 설교 중 인용 (본문에 넣은 구절 블록·칩). aid 로 노트의 그 자리를 연다.
 * 같은 노트에 같은 구절이 두 번 나오면 하나로 합친다 (main 이 우선, aid 는 먼저 찾은 것).
 */

export type MarkKind = 'main' | 'quote';

export interface ReadMark {
  note: SermonNote;
  kind: MarkKind;
  ref: Ref;
  /** 노트 본문의 그 자리 (data-aid). 설교 본문 구절만 있고 본문에 블록이 없으면 null */
  aid: string | null;
  /** 그 자리에 연결된 생각 (본문이 빈 메모는 뺀다) */
  thoughts: Thought[];
}

export const chKey = (b: number, c: number) => `${b}:${c}`;

/** 'b:c' → 그 장의 자국 (시작 절 → 최근 설교 순) */
export function collectMarks(notes: SermonNote[]): Map<string, ReadMark[]> {
  const out = new Map<string, ReadMark[]>();
  const d = document.createElement('div');
  notes.forEach((n) => {
    const seen = new Map<string, ReadMark>();
    const add = (r: Ref, kind: MarkKind, aid: string | null) => {
      const k = encRef(r);
      const cur = seen.get(k);
      if (cur) {
        if (!cur.aid && aid) cur.aid = aid;
        return;
      }
      seen.set(k, { note: n, kind, ref: r, aid, thoughts: [] });
    };
    (n.refs || []).forEach((s) => {
      const r = decRef(s);
      if (r) add(r, 'main', null);
    });
    d.innerHTML = n.body || '';
    d.querySelectorAll<HTMLElement>('[data-ref]').forEach((e) => {
      const r = decRef(e.dataset.ref);
      if (!r) return;
      const aid = e.dataset.aid || e.closest<HTMLElement>('[data-aid]')?.dataset.aid || null;
      add(r, 'quote', aid);
    });
    const thoughts = (n.thoughts || []).filter((t) => t.text.trim());
    seen.forEach((m) => {
      const label = refShort(m.ref);
      m.thoughts = thoughts.filter((t) => (m.aid && t.aid === m.aid) || t.label === label);
      const k = chKey(m.ref.b, m.ref.c);
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(m);
    });
  });
  out.forEach((list) =>
    list.sort(
      (a, b) =>
        a.ref.v1 - b.ref.v1 ||
        (b.note.date || '').localeCompare(a.note.date || '') ||
        (a.kind === 'main' ? -1 : 1),
    ),
  );
  return out;
}

/** 그 절에 걸친 자국 (장 전체 인용은 빼고) */
export function marksOn(list: ReadMark[] | undefined, v: number): ReadMark[] {
  return (list || []).filter((m) => !m.ref.whole && v >= m.ref.v1 && v <= m.ref.v2);
}

/** 권별 자국 수 */
export function bookCounts(map: Map<string, ReadMark[]>): Map<number, number> {
  const out = new Map<number, number>();
  map.forEach((list, k) => {
    const b = +k.split(':')[0];
    out.set(b, (out.get(b) || 0) + list.length);
  });
  return out;
}

/** 지금 장 다음(성경 순서)으로 자국이 있는 장. 끝까지 없으면 처음부터 다시 찾는다. 하나도 없으면 null */
export function nextMarked(
  map: Map<string, ReadMark[]>,
  b: number,
  c: number,
): { b: number; c: number } | null {
  const keys = [...map.keys()]
    .map((k) => k.split(':').map(Number) as [number, number])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  if (!keys.length) return null;
  const after = keys.find(([kb, kc]) => kb > b || (kb === b && kc > c));
  const [nb, nc] = after || keys[0];
  return nb === b && nc === c ? null : { b: nb, c: nc };
}
