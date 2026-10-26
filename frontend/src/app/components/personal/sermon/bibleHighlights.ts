import { useEffect, useSyncExternalStore } from 'react';
import { apiClient } from '../../../utils/api';
import { useAuth } from '../../../contexts/AuthContext';
import { ANONYMOUS_USER } from './sermonStore';
import { uid } from './sermonTypes';

/**
 * 성경 읽기 「형광펜」 — 내가 직접 칠한 구절. 설교 노트에서 오는 물결 밑줄(bibleMarks)과 따로 산다.
 * 범위: v1 절의 s 글자부터 v2 절의 e 글자까지 (s=null 이면 절 처음, e=null 이면 절 끝).
 * 저장: 기기 먼저(localStorage `sermon-hl-v1:<userId>`) → 로그인 사용자는 /sermon-highlights 로 올린다.
 * 로그인 전에 칠한 것은 로그인하면 계정으로 옮긴다. 계약: docs/Tech/sermon-highlight-api.md
 */

export type HlColor = 'yellow' | 'green' | 'blue' | 'pink';
export const HL_COLORS: ReadonlyArray<readonly [HlColor, string]> = [
  ['yellow', '노랑'],
  ['green', '연두'],
  ['blue', '하늘'],
  ['pink', '분홍'],
];
export const MEMO_MAX = 200;

export interface Highlight {
  id: string;
  b: number;
  c: number;
  v1: number;
  v2: number;
  s: number | null;
  e: number | null;
  color: HlColor | null;
  ul: boolean;
  memo: string;
  /** 마지막으로 고친 시각 (ms) — 겹치면 나중 것이 위 */
  at: number;
  /** 서버에 한 번이라도 올라간 것 (서버 목록에서 빠지면 다른 기기에서 지운 것) */
  srv?: boolean;
}

export type HlRange = Pick<Highlight, 'b' | 'c' | 'v1' | 'v2' | 's' | 'e'>;

/* ───────── 순수 함수 ───────── */

/** 그 절 안에서 h 가 칠하는 [시작, 끝) 글자 — 안 걸치면 null */
export function spanOn(h: HlRange, v: number, len: number): [number, number] | null {
  if (v < h.v1 || v > h.v2) return null;
  const a = v === h.v1 ? Math.min(len, Math.max(0, h.s ?? 0)) : 0;
  const z = v === h.v2 ? Math.min(len, Math.max(0, h.e ?? len)) : len;
  return z > a ? [a, z] : null;
}

export interface HlSeg {
  from: number;
  to: number;
  /** 이 조각에서 가장 위(나중에 칠한) 형광펜 */
  top: Highlight | null;
  /** 이 조각에 밑줄이 있는지 (겹친 것 중 하나라도) */
  ul: boolean;
}

/** 절 글자를 형광펜 경계로 자른 조각들 */
export function segmentsFor(list: Highlight[], v: number, len: number): HlSeg[] {
  const on = list
    .map((h) => ({ h, sp: spanOn(h, v, len) }))
    .filter((x): x is { h: Highlight; sp: [number, number] } => !!x.sp);
  if (!on.length) return [{ from: 0, to: len, top: null, ul: false }];
  const cuts = new Set<number>([0, len]);
  on.forEach(({ sp }) => {
    cuts.add(sp[0]);
    cuts.add(sp[1]);
  });
  const pts = [...cuts].sort((a, b) => a - b);
  const out: HlSeg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const from = pts[i];
    const to = pts[i + 1];
    const cover = on.filter(({ sp }) => sp[0] <= from && sp[1] >= to).map((x) => x.h);
    const colored = cover.filter((h) => h.color).sort((a, b) => b.at - a.at);
    const top = colored[0] || cover.sort((a, b) => b.at - a.at)[0] || null;
    const prev = out[out.length - 1];
    const ul = cover.some((h) => h.ul);
    if (prev && prev.top === top && prev.ul === ul) prev.to = to;
    else out.push({ from, to, top, ul });
  }
  return out;
}

/** 두 범위가 한 글자라도 겹치는지 (같은 장이라고 가정) */
export function overlaps(a: HlRange, b: HlRange, lenOf: (v: number) => number): boolean {
  const lo = Math.max(a.v1, b.v1);
  const hi = Math.min(a.v2, b.v2);
  for (let v = lo; v <= hi; v++) {
    const len = lenOf(v);
    const x = spanOn(a, v, len);
    const y = spanOn(b, v, len);
    if (x && y && x[0] < y[1] && y[0] < x[1]) return true;
  }
  return false;
}

/** 범위의 글자 (여러 절이면 공백으로 잇는다) */
export function rangeText(r: HlRange, verseText: (v: number) => string): string {
  const parts: string[] = [];
  for (let v = r.v1; v <= r.v2; v++) {
    const t = verseText(v);
    const sp = spanOn(r, v, t.length);
    if (sp) parts.push(t.slice(sp[0], sp[1]));
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** 절 전체를 칠한 것인지 */
export function isWhole(r: HlRange, lenOf: (v: number) => number): boolean {
  return (r.s ?? 0) === 0 && (r.e == null || r.e >= lenOf(r.v2));
}

export function compareHl(a: Highlight, b: Highlight): number {
  return a.b - b.b || a.c - b.c || a.v1 - b.v1 || (a.s ?? 0) - (b.s ?? 0) || a.at - b.at;
}

/* ───────── 서버 ───────── */

interface ServerItem {
  id: string;
  book: number;
  chapter: number;
  verse_from: number;
  verse_to: number;
  char_start?: number;
  char_end?: number;
  color?: string;
  underline: boolean;
  memo?: string;
  deleted: boolean;
  updated_at?: string;
}

const API = '/sermon-highlights';
const COLOR_SET = new Set<string>(HL_COLORS.map(([c]) => c));

function fromServer(s: ServerItem): Highlight {
  const at = s.updated_at
    ? Date.parse(s.updated_at.endsWith('Z') ? s.updated_at : `${s.updated_at}Z`)
    : 0;
  return {
    id: s.id,
    b: s.book,
    c: s.chapter,
    v1: s.verse_from,
    v2: s.verse_to,
    s: s.char_start ?? null,
    e: s.char_end ?? null,
    color: s.color && COLOR_SET.has(s.color) ? (s.color as HlColor) : null,
    ul: !!s.underline,
    memo: s.memo || '',
    at: Number.isFinite(at) ? at : 0,
    srv: true,
  };
}

function toServer(h: Highlight) {
  return {
    book: h.b,
    chapter: h.c,
    verse_from: h.v1,
    verse_to: h.v2,
    char_start: h.s,
    char_end: h.e,
    color: h.color,
    underline: h.ul,
    memo: h.memo.trim() || null,
  };
}

/** 다시 보내도 소용없는 실패 (입력 거절·남의 id·상한) */
function isFinal(err: unknown): boolean {
  const st = (err as { status?: number } | null)?.status;
  return st === 400 || st === 404 || st === 409;
}

/* ───────── 저장소 ───────── */

/** 서버 PK 로도 쓰므로 사용자 사이에서도 겹치지 않게 */
function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `${uid('h')}${Math.random().toString(36).slice(2, 10)}`;
}

interface Persist {
  items: Highlight[];
  dirty: string[];
  gone: string[];
}

const BACKOFF_MIN = 4000;
const BACKOFF_MAX = 60000;
const FLUSH_DELAY = 800;

export class HighlightStore {
  static keyFor(userId: string) {
    return `sermon-hl-v1:${userId}`;
  }

  readonly userId: string;
  readonly anonymous: boolean;
  private items = new Map<string, Highlight>();
  private dirty = new Set<string>();
  private gone = new Set<string>();
  private version = 0;
  private listeners = new Set<() => void>();
  private timer: number | null = null;
  private backoff = BACKOFF_MIN;
  private flushing = false;
  private again = false;
  private started = false;

  constructor(userId: string) {
    this.userId = userId;
    this.anonymous = userId === ANONYMOUS_USER;
    this.load();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.version;

  private bump() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  /* 읽기 */

  all(): Highlight[] {
    return [...this.items.values()].sort(compareHl);
  }
  inChapter(b: number, c: number): Highlight[] {
    return this.all().filter((h) => h.b === b && h.c === c);
  }
  /** 그 권에서 형광펜이 있는 장 */
  chaptersOf(b: number): Set<number> {
    const s = new Set<number>();
    this.items.forEach((h) => {
      if (h.b === b) s.add(h.c);
    });
    return s;
  }
  get(id: string): Highlight | undefined {
    return this.items.get(id);
  }
  get count() {
    return this.items.size;
  }

  /* 쓰기 */

  /** 새로 칠하기 — 만든 형광펜을 돌려준다 */
  add(r: HlRange, patch: Partial<Pick<Highlight, 'color' | 'ul' | 'memo'>>): Highlight {
    const h: Highlight = {
      id: newId(),
      ...r,
      color: patch.color ?? null,
      ul: !!patch.ul,
      memo: (patch.memo || '').slice(0, MEMO_MAX),
      at: Date.now(),
    };
    this.items.set(h.id, h);
    this.touch(h.id);
    return h;
  }

  /** 고치기. 색·밑줄·메모가 모두 비면 지운다 */
  update(id: string, patch: Partial<Pick<Highlight, 'color' | 'ul' | 'memo'>>): Highlight | null {
    const cur = this.items.get(id);
    if (!cur) return null;
    const next: Highlight = {
      ...cur,
      ...patch,
      memo: (patch.memo ?? cur.memo).slice(0, MEMO_MAX),
      at: Date.now(),
    };
    if (!next.color && !next.ul && !next.memo.trim()) {
      this.remove(id);
      return null;
    }
    this.items.set(id, next);
    this.touch(id);
    return next;
  }

  remove(id: string) {
    const cur = this.items.get(id);
    if (!cur) return;
    this.items.delete(id);
    this.dirty.delete(id);
    if (cur.srv || !this.anonymous) this.gone.add(id);
    this.persist();
    this.bump();
    this.schedule(FLUSH_DELAY);
  }

  private touch(id: string) {
    this.dirty.add(id);
    this.gone.delete(id);
    this.persist();
    this.bump();
    this.schedule(FLUSH_DELAY);
  }

  /* 기기 저장 */

  private load() {
    try {
      const raw = localStorage.getItem(HighlightStore.keyFor(this.userId));
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persist>;
        (p.items || []).forEach((h) => h && h.id && this.items.set(h.id, h));
        (p.dirty || []).forEach((id) => this.dirty.add(id));
        (p.gone || []).forEach((id) => this.gone.add(id));
      }
    } catch {
      /* ignore */
    }
    if (!this.anonymous) this.adoptAnonymous();
  }

  /** 로그인 전에 칠한 것을 계정으로 옮긴다 */
  private adoptAnonymous() {
    try {
      const key = HighlightStore.keyFor(ANONYMOUS_USER);
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<Persist>;
      (p.items || []).forEach((h) => {
        if (!h || !h.id || this.items.has(h.id)) return;
        this.items.set(h.id, { ...h, srv: false });
        this.dirty.add(h.id);
      });
      localStorage.removeItem(key);
      this.persist();
    } catch {
      /* ignore */
    }
  }

  private persist() {
    try {
      const p: Persist = {
        items: [...this.items.values()],
        dirty: [...this.dirty],
        gone: [...this.gone],
      };
      localStorage.setItem(HighlightStore.keyFor(this.userId), JSON.stringify(p));
    } catch {
      /* 저장 공간이 없어도 화면에서는 칠한 채로 둔다 */
    }
  }

  /* 서버 */

  start() {
    if (this.started || this.anonymous) return;
    this.started = true;
    window.addEventListener('online', this.onOnline);
    void this.pull().then(() => this.flush());
  }

  dispose() {
    window.removeEventListener('online', this.onOnline);
    if (this.timer) window.clearTimeout(this.timer);
  }

  private onOnline = () => {
    this.backoff = BACKOFF_MIN;
    void this.pull().then(() => this.flush());
  };

  private schedule(ms: number) {
    if (this.anonymous) return;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  async pull(): Promise<boolean> {
    if (this.anonymous) return true;
    try {
      const list = await apiClient.get<ServerItem[]>(API);
      const seen = new Set<string>();
      (list || []).forEach((s) => {
        seen.add(s.id);
        if (this.dirty.has(s.id) || this.gone.has(s.id)) return;
        this.items.set(s.id, fromServer(s));
      });
      // 서버에 있었는데 이제 없는 것 = 다른 기기에서 지움
      [...this.items.values()].forEach((h) => {
        if (h.srv && !seen.has(h.id) && !this.dirty.has(h.id)) this.items.delete(h.id);
      });
      this.persist();
      this.bump();
      return true;
    } catch (e) {
      console.warn('sermon-hl: pull failed', e);
      return false;
    }
  }

  async flush() {
    if (this.anonymous) return;
    if (this.flushing) {
      this.again = true;
      return;
    }
    if (!this.dirty.size && !this.gone.size) return;
    this.flushing = true;
    try {
      for (const id of [...this.dirty]) {
        const h = this.items.get(id);
        if (!h) {
          this.dirty.delete(id);
          continue;
        }
        const stamp = h.at;
        try {
          const saved = await apiClient.put<ServerItem>(
            `${API}/${encodeURIComponent(id)}`,
            toServer(h),
          );
          if (saved?.deleted) {
            this.items.delete(id);
            this.dirty.delete(id);
            continue;
          }
          const now = this.items.get(id);
          if (now) this.items.set(id, { ...now, srv: true });
          if (now?.at === stamp) this.dirty.delete(id);
        } catch (e) {
          if (!isFinal(e)) throw e;
          console.warn('sermon-hl: rejected, keeping on this device only', id, e);
          this.dirty.delete(id);
        }
      }
      for (const id of [...this.gone]) {
        try {
          await apiClient.delete(`${API}/${encodeURIComponent(id)}`);
        } catch (e) {
          if (!isFinal(e)) throw e;
        }
        this.gone.delete(id);
      }
      this.backoff = BACKOFF_MIN;
    } catch (e) {
      console.warn('sermon-hl: flush failed, will retry', e);
      this.schedule(this.backoff);
      this.backoff = Math.min(BACKOFF_MAX, this.backoff * 2);
    } finally {
      this.flushing = false;
      this.persist();
      this.bump();
      if (this.again) {
        this.again = false;
        void this.flush();
      }
    }
  }
}

/* ───────── 훅 ───────── */

let current: HighlightStore | null = null;

/** 사용자마다 하나 (성경 읽기 화면·사이드바·모아보기가 같은 저장소를 본다) */
export function highlightStoreFor(userId: string): HighlightStore {
  if (current && current.userId === userId) return current;
  current?.dispose();
  current = new HighlightStore(userId);
  return current;
}

export function useHighlights(): HighlightStore {
  const { currentUser, isAuthenticated } = useAuth();
  const userId = isAuthenticated && currentUser?.id ? String(currentUser.id) : ANONYMOUS_USER;
  const store = highlightStoreFor(userId);
  useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    store.start();
  }, [store]);
  return store;
}

/* ───────── 성경 읽기로 건너가기 ───────── */

const POS_KEY = 'sermon-bible-pos';
const FOCUS_KEY = 'sermon-bible-focus';

/** 모아보기에서 누르면 — 읽기 화면이 그 장을 열고 그 절을 반짝인다 */
export function openInReader(b: number, c: number, v: number) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ b, c }));
    sessionStorage.setItem(FOCUS_KEY, JSON.stringify({ b, c, v }));
  } catch {
    /* ignore */
  }
}

export function takeFocus(): { b: number; c: number; v: number } | null {
  try {
    const raw = sessionStorage.getItem(FOCUS_KEY);
    sessionStorage.removeItem(FOCUS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return p && Number.isFinite(p.b) && Number.isFinite(p.c) && Number.isFinite(p.v) ? p : null;
  } catch {
    return null;
  }
}
