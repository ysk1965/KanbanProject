import { decRef, encRef, refShort, type Ref } from './bibleRefs';

/**
 * 설교 노트 데이터 구조.
 * 기획서 「데이터 구조와 기술 구성」 — 노트 한 편이 문서 하나(personal_feature_docs, feature_key='sermon').
 * content 는 서버가 해석하지 않는 JSON 이라 아래 타입이 곧 스키마다. (schema_ver = SERMON_SCHEMA_VER)
 */

export const SERMON_FEATURE_KEY = 'sermon';
export const SERMON_SCHEMA_VER = 1;

export const THOUGHT_TAGS = ['생각', '질문', '적용'] as const;
export type ThoughtTag = (typeof THOUGHT_TAGS)[number];

export interface ThoughtMedia {
  /** 스토리지 파일 id */
  id: string;
  type: 'image' | 'video';
  url: string;
  thumb?: string | null;
}

export interface Thought {
  id: string;
  tag: ThoughtTag;
  text: string;
  media: ThoughtMedia[];
  /** 설교 타이머 경과 초. 타이머를 쓰지 않았으면 null */
  t: number | null;
  /** 연결된 본문 요소의 data-aid. id 가 사라지면 label 로 다시 찾는다 */
  aid: string | null;
  label: string | null;
  edited?: boolean;
  /** 적용 실천 체크 */
  done?: boolean;
  done_at?: number | null;
  /** 기록 시각(ms) */
  at: number;
}

export interface SermonNote {
  /** 서버 문서 id. 아직 올리지 못한 새 노트는 `local-` 접두 */
  id: string;
  title: string;
  preacher: string;
  service: string;
  /** yyyy-MM-dd */
  date: string;
  /** 설교 본문 구절 (encRef 문자열) */
  refs: string[];
  /** 본문 HTML. 구절 블록은 주소·강조 범위만 저장하고 본문은 열 때 다시 채운다 */
  body: string;
  thoughts: Thought[];
  /** 설교 타이머 누적 초 */
  elapsed: number;
  created_at: number;
  updated_at: number;
}

/** 서버로 보내는 content — id 를 뺀 나머지 */
export type SermonContent = Omit<SermonNote, 'id'>;

export const LOCAL_ID_PREFIX = 'local-';
export const isLocalId = (id: string) => id.startsWith(LOCAL_ID_PREFIX);

export function uid(prefix = 'n'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'M.D (요일)' — 앱 전체 날짜 표기 */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${m}.${d} (${w})`;
}

export function fmtTime(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const s0 = Math.max(0, Math.floor(sec));
  const h = Math.floor(s0 / 3600);
  const m = Math.floor((s0 % 3600) / 60);
  const s = s0 % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function hhmm(t: number): string {
  const d = new Date(t);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 오늘 기준 며칠 전인지 (오늘 = 0). 날짜 없으면 999 */
export function daysAgo(ds: string | null | undefined): number {
  if (!ds) return 999;
  const [y, m, d] = ds.split('-').map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 864e5);
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** 본문 HTML → 검색·미리보기용 평문. 구절 블록은 [요 3:16] 으로 */
export function plainText(html: string | null | undefined): string {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('p,h3,li,div,br').forEach((e) => e.after(' '));
  d.querySelectorAll<HTMLElement>('.vblock').forEach((b) => {
    const r = decRef(b.dataset.ref);
    b.textContent = r ? ` [${refShort(r)}] ` : '';
  });
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

/** 노트에 등장하는 구절 전부 (설교 본문 + 본문 안 블록·칩), 중복 제거 */
export function noteRefs(n: SermonNote): Ref[] {
  const set = new Map<string, true>();
  (n.refs || []).forEach((s) => set.set(s, true));
  const d = document.createElement('div');
  d.innerHTML = n.body || '';
  d.querySelectorAll<HTMLElement>('[data-ref]').forEach((e) => {
    if (e.dataset.ref) set.set(e.dataset.ref, true);
  });
  return [...set.keys()].map(decRef).filter((r): r is Ref => !!r);
}

export function mainRef(n: SermonNote): Ref | null {
  const main = (n.refs || []).map(decRef).find((r): r is Ref => !!r);
  if (main) return main;
  return noteRefs(n)[0] ?? null;
}

export function hasBodyContent(html: string | null | undefined): boolean {
  return !!(plainText(html) || /vblock|vchip/.test(html || ''));
}

export function toggleApplyDone(n: SermonNote, tid: string): SermonNote {
  return {
    ...n,
    thoughts: (n.thoughts || []).map((t) =>
      t.id === tid ? { ...t, done: !t.done, done_at: !t.done ? Date.now() : null } : t,
    ),
  };
}

export interface ApplyItem {
  n: SermonNote;
  t: Thought;
}

export function applyItems(notes: SermonNote[]): ApplyItem[] {
  const out: ApplyItem[] = [];
  notes.forEach((n) =>
    (n.thoughts || []).forEach((t) => {
      if (t.tag === '적용') out.push({ n, t });
    }),
  );
  return out;
}

/** 최근 7일 설교의 적용 */
export function thisWeek(items: ApplyItem[]): ApplyItem[] {
  return items.filter(({ n }) => {
    const d = daysAgo(n.date);
    return d >= 0 && d <= 6;
  });
}

export function newNote(prev: SermonNote | undefined): SermonNote {
  const now = Date.now();
  return {
    id: LOCAL_ID_PREFIX + uid('n'),
    title: '',
    preacher: prev?.preacher || '',
    service: prev?.service || '주일 2부',
    date: todayString(),
    refs: [],
    body: '',
    thoughts: [],
    elapsed: 0,
    created_at: now,
    updated_at: now,
  };
}

/** 서버 content → 노트 (누락 필드 보정) */
export function normalizeNote(
  id: string,
  raw: Partial<SermonContent> | null | undefined,
): SermonNote {
  const c = raw || {};
  return {
    id,
    title: typeof c.title === 'string' ? c.title : '',
    preacher: typeof c.preacher === 'string' ? c.preacher : '',
    service: typeof c.service === 'string' ? c.service : '',
    date: typeof c.date === 'string' ? c.date : '',
    refs: Array.isArray(c.refs) ? c.refs.filter((x): x is string => typeof x === 'string') : [],
    body: typeof c.body === 'string' ? c.body : '',
    thoughts: Array.isArray(c.thoughts) ? (c.thoughts as Thought[]) : [],
    elapsed: typeof c.elapsed === 'number' ? c.elapsed : 0,
    created_at: typeof c.created_at === 'number' ? c.created_at : 0,
    updated_at: typeof c.updated_at === 'number' ? c.updated_at : 0,
  };
}

export const UNTITLED = '제목 없음';

export { encRef };
