import { mainRef, noteRefs, hasBodyContent, sameService, type SermonNote } from './sermonTypes';
import { worshipLabel, worshipOfNote, type WorshipService } from './worship';
import { bookName } from './homeFmt';
import { BOOKS } from './bibleRefs';

/**
 * 설교 노트 「달력 · 다듬기」가 같이 쓰는 표기·판정.
 *  - 자동 이름: 제목이 비면 첫 줄, 없으면 「예배 M.D」. 저장하지 않고 보여 줄 때만 쓴다(다듬기 「이대로」를 눌러야 저장).
 *  - 예배 색: 내 예배표 순서대로 잉크 색을 나눠 주고, 예배표 밖 이름은 노트가 많은 순서로 이어 준다.
 */

const AUTO_NAME_MAX = 30;

function md(date: string): string {
  const [, m, d] = (date || '').split('-').map(Number);
  return m && d ? `${m}.${d}` : '';
}

/** 본문 첫 줄 (구절 블록은 건너뛴다) */
export function firstLine(html: string | null | undefined): string {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('.vblock').forEach((b) => b.remove());
  d.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
  d.querySelectorAll('p,h3,li,div').forEach((e) => e.append('\n'));
  return (
    (d.textContent || '')
      .split('\n')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .find(Boolean) || ''
  );
}

/** 제목이 비었을 때 보여 줄 이름 */
export function autoName(n: Pick<SermonNote, 'body' | 'service' | 'date'>): string {
  const first = firstLine(n.body);
  if (first) {
    const chars = [...first];
    return chars.length > AUTO_NAME_MAX ? `${chars.slice(0, AUTO_NAME_MAX).join('')}…` : first;
  }
  return [n.service || '설교', md(n.date)].filter(Boolean).join(' ');
}

/** 화면에 쓸 이름 — auto 면 흐리게 */
export function displayTitle(n: SermonNote): { text: string; auto: boolean } {
  const t = (n.title || '').trim();
  return t ? { text: t, auto: false } : { text: autoName(n), auto: true };
}

/** 달력 스티커 글자 — 「롬 5」(약어 + 장), 구절이 없으면 반짝별 */
export function stickerLabel(n: SermonNote): string {
  const r = mainRef(n);
  return r ? `${BOOKS[r.b][1]} ${r.c}` : '✦';
}

/** 갈피 테이프 글자 — 「로마서 5」 */
export function bookChapter(n: SermonNote): string {
  const r = mainRef(n);
  return r ? `${bookName(r)} ${r.c}` : '';
}

/** 내용이 전혀 없는 노트 (본문·생각·녹음·구절 모두 없음) */
export function isEmptyNote(n: SermonNote): boolean {
  return (
    !(n.title || '').trim() &&
    !hasBodyContent(n.body) &&
    !(n.thoughts || []).length &&
    !(n.audio?.segments || []).length &&
    !(n.refs || []).length
  );
}

/* ───── 예배 색 ───── */

/** 갈피 분홍(g2)은 리본 몫이라 빼고 나눠 준다 */
export const SERVICE_INKS = [
  'var(--sn-g1)',
  'var(--sn-g3)',
  'var(--sn-c-orange)',
  'var(--sn-c-purple)',
  'var(--sn-c-green)',
  'var(--sn-c-blue)',
  'var(--sn-c-red)',
] as const;

export interface ServiceKey {
  /** 예배표 id 또는 'name:<이름>' */
  key: string;
  label: string;
  color: string;
  count: number;
}

/** 노트가 속한 예배 키 */
export function serviceKeyOf(n: SermonNote, worship: WorshipService[]): string {
  const w = worshipOfNote(n, worship);
  if (w) return w.id;
  const s = (n.service || '').replace(/\s+/g, ' ').trim();
  return s ? `name:${s}` : 'name:';
}

/** 예배표 순서 → 나머지는 노트 수 순서. 노트가 하나도 없는 예배는 뺀다 */
export function serviceKeys(notes: SermonNote[], worship: WorshipService[]): ServiceKey[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  notes.forEach((n) => {
    const k = serviceKeyOf(n, worship);
    counts.set(k, (counts.get(k) || 0) + 1);
    if (!labels.has(k)) labels.set(k, k.startsWith('name:') ? k.slice(5) || '예배 없음' : '');
  });
  const out: Array<Omit<ServiceKey, 'color'>> = [];
  worship.forEach((w) => {
    const c = counts.get(w.id);
    if (c) out.push({ key: w.id, label: worshipLabel(w), count: c });
  });
  [...counts.entries()]
    .filter(([k]) => k.startsWith('name:'))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([k, c]) => out.push({ key: k, label: labels.get(k) || '예배 없음', count: c }));
  return out.map((s, i) => ({ ...s, color: SERVICE_INKS[i % SERVICE_INKS.length] }));
}

/* ───── 다듬기 ───── */

export interface ServiceMerge {
  /** 예배표 밖 이름 */
  from: string;
  notes: SermonNote[];
  /** 합칠 곳 — 예배표 예배면 id 가 있다 */
  to: { label: string; id: string | null };
}

const dowOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return y ? new Date(y, m - 1, d).getDay() : -1;
};
function mainDow(notes: SermonNote[]): number {
  const c = new Array(7).fill(0);
  notes.forEach((n) => {
    const d = dowOf(n.date);
    if (d >= 0) c[d]++;
  });
  const max = Math.max(...c);
  return max ? c.indexOf(max) : -1;
}

/**
 * 같은 예배 같아 보이는 이름 짝.
 *  - 예배표가 있으면: 예배표에 없는 이름 → 주로 쓴 요일이 겹치는 예배표 예배
 *  - 예배표가 없으면: 주로 쓴 요일이 같은 이름끼리, 노트가 적은 쪽 → 많은 쪽
 * dismissed: 「다른 예배예요」로 넘긴 이름
 */
export function serviceMerges(
  notes: SermonNote[],
  worship: WorshipService[],
  dismissed: Set<string> = new Set(),
): ServiceMerge[] {
  const orphan = new Map<string, SermonNote[]>();
  const named = new Map<string, SermonNote[]>();
  notes.forEach((n) => {
    const s = (n.service || '').replace(/\s+/g, ' ').trim();
    if (!s) return;
    if (worship.length) {
      if (!worshipOfNote(n, worship)) orphan.set(s, [...(orphan.get(s) || []), n]);
    } else {
      named.set(s, [...(named.get(s) || []), n]);
    }
  });
  const out: ServiceMerge[] = [];
  if (worship.length) {
    orphan.forEach((list, name) => {
      if (dismissed.has(name)) return;
      const d = mainDow(list);
      const w =
        worship.find((x) => x.slots.some((s) => s.dow === d)) ??
        worship.find((x) => sameService(x.name, name));
      if (w) out.push({ from: name, notes: list, to: { label: worshipLabel(w), id: w.id } });
    });
    return out;
  }
  const names = [...named.entries()].sort((a, b) => b[1].length - a[1].length);
  const taken = new Set<string>();
  names.forEach(([name, list], i) => {
    if (taken.has(name) || dismissed.has(name)) return;
    const d = mainDow(list);
    if (d < 0) return;
    const bigger = names.slice(0, i).find(([other, ol]) => !taken.has(other) && mainDow(ol) === d);
    if (bigger) {
      taken.add(name);
      out.push({ from: name, notes: list, to: { label: bigger[0], id: null } });
    }
  });
  return out;
}

export interface TidyList {
  untitled: SermonNote[];
  empty: SermonNote[];
  noRef: SermonNote[];
  merges: ServiceMerge[];
  /** 메뉴 표에 쓰는 수 (구절 없음은 세지 않는다) */
  count: number;
}

export function tidyList(
  notes: SermonNote[],
  worship: WorshipService[],
  dismissed: Set<string> = new Set(),
): TidyList {
  const empty = notes.filter(isEmptyNote);
  const emptyIds = new Set(empty.map((n) => n.id));
  const untitled = notes.filter((n) => !emptyIds.has(n.id) && !(n.title || '').trim());
  const noRef = notes.filter((n) => !emptyIds.has(n.id) && !noteRefs(n).length);
  const merges = serviceMerges(
    notes.filter((n) => !emptyIds.has(n.id)),
    worship,
    dismissed,
  );
  return {
    untitled,
    empty,
    noRef,
    merges,
    count: untitled.length + empty.length + merges.length,
  };
}

/** 예배 합치기 — 저장할 노트 사본 */
export function mergeService(list: SermonNote[], to: ServiceMerge['to']): SermonNote[] {
  return list.map((n) => {
    const nn: SermonNote = { ...n, service: to.label };
    if (to.id) nn.service_id = to.id;
    delete nn.service_auto;
    return nn;
  });
}
