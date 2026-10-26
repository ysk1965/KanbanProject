import { useEffect, useState, useSyncExternalStore } from 'react';
import { decRef, encRef } from '../bibleRefs';
import { ANONYMOUS_USER } from '../sermonStore';
import type { NoteGroupLink, SermonNote } from '../sermonTypes';
import { verses } from '../useBible';
import {
  sermonGroupAPI,
  type SermonGroup,
  type SessionSummary,
  type ShareFields,
  type WeekResponse,
} from './groupApi';

/**
 * 내 모임 목록 + 모임별 주간 자리 요약 캐시.
 * - 로그인 사용자만. 익명이면 늘 빈 목록
 * - 목록은 기기에도 남겨 두어(sermon-groups-v1:<userId>) 오프라인·첫 화면에서 바로 그린다
 * - 공개 사본(share) 동기화: 노트가 저장될 때 syncNoteShares 로 모임마다 PUT/DELETE (디바운스)
 */

type Listener = () => void;

class GroupStore {
  groups: SermonGroup[] = [];
  loaded = false;
  private weeks = new Map<string, WeekResponse>();
  private listeners = new Set<Listener>();
  private version = 0;
  private loading: Promise<void> | null = null;

  constructor(readonly userId: string) {
    if (userId === ANONYMOUS_USER) {
      this.loaded = true;
      return;
    }
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.groups = JSON.parse(raw) as SermonGroup[];
    } catch {
      /* ignore */
    }
  }

  private get key() {
    return `sermon-groups-v1:${this.userId}`;
  }

  get anonymous() {
    return this.userId === ANONYMOUS_USER;
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  snapshot = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((f) => f());
  }

  private persist() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.groups));
    } catch {
      /* ignore */
    }
  }

  /** 서버에서 내 모임을 다시 받는다 (동시에 여러 번 불러도 한 번) */
  refresh(): Promise<void> {
    if (this.anonymous) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = sermonGroupAPI
      .list()
      .then((gs) => {
        this.groups = Array.isArray(gs) ? gs : [];
        this.loaded = true;
        this.persist();
        this.emit();
      })
      .catch(() => {
        this.loaded = true;
        this.emit();
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  get(id: string): SermonGroup | undefined {
    return this.groups.find((g) => g.id === id);
  }

  active(): SermonGroup[] {
    return this.groups.filter((g) => g.me?.status === 'active');
  }

  upsert(g: SermonGroup) {
    const i = this.groups.findIndex((x) => x.id === g.id);
    this.groups = i >= 0 ? this.groups.map((x) => (x.id === g.id ? g : x)) : [...this.groups, g];
    this.persist();
    this.emit();
  }

  remove(id: string) {
    this.groups = this.groups.filter((g) => g.id !== id);
    [...this.weeks.keys()]
      .filter((k) => k.startsWith(`${id}|`))
      .forEach((k) => this.weeks.delete(k));
    this.persist();
    this.emit();
  }

  /* ───── 주간 자리 ───── */

  weekCached(groupId: string, start: string): WeekResponse | undefined {
    return this.weeks.get(`${groupId}|${start}`);
  }

  private weekAt = new Map<string, number>();
  private weekInflight = new Map<string, Promise<WeekResponse | undefined>>();

  /** 60초 안에 받은 게 있으면 그대로, 아니면 한 번만 받아 온다 (한 주 동안 칸 7개가 같이 불러도) */
  ensureWeek(groupId: string, start: string): void {
    const k = `${groupId}|${start}`;
    if (this.weekInflight.has(k)) return;
    if (Date.now() - (this.weekAt.get(k) || 0) < 60_000) return;
    const p = this.loadWeek(groupId, start).finally(() => this.weekInflight.delete(k));
    this.weekInflight.set(k, p);
  }

  async loadWeek(groupId: string, start: string): Promise<WeekResponse | undefined> {
    this.weekAt.set(`${groupId}|${start}`, Date.now());
    if (this.anonymous) return undefined;
    try {
      const w = await sermonGroupAPI.week(groupId, start);
      this.weeks.set(`${groupId}|${start}`, {
        sessions: w?.sessions || [],
        pokes_for_me: w?.pokes_for_me || [],
      });
      this.emit();
      return this.weeks.get(`${groupId}|${start}`);
    } catch {
      return this.weeks.get(`${groupId}|${start}`);
    }
  }

  /** 자리 하나를 주간 캐시에 반영 (resolve·정보 채우기 뒤) */
  patchSession(groupId: string, s: SessionSummary) {
    this.weeks.forEach((w, k) => {
      if (!k.startsWith(`${groupId}|`)) return;
      const i = w.sessions.findIndex((x) => x.id === s.id);
      if (i >= 0) w.sessions[i] = { ...w.sessions[i], ...s };
    });
    this.emit();
  }

  /** 모임 × 날짜 범위의 자리들 (제안용) */
  sessionsFor(groupId: string): SessionSummary[] {
    const out: SessionSummary[] = [];
    this.weeks.forEach((w, k) => {
      if (k.startsWith(`${groupId}|`)) out.push(...w.sessions);
    });
    return out;
  }
}

const stores = new Map<string, GroupStore>();

export function groupStoreFor(userId: string): GroupStore {
  let s = stores.get(userId);
  if (!s) {
    s = new GroupStore(userId);
    stores.set(userId, s);
  }
  return s;
}

export type { GroupStore };

/** React: 모임 저장소 구독 + 처음 한 번 서버 갱신 */
export function useGroupStore(userId: string): GroupStore {
  const store = groupStoreFor(userId);
  useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    if (!store.anonymous) void store.refresh();
  }, [store]);
  return store;
}

/** React: 모임의 이번 주 자리 요약 */
export function useWeek(
  store: GroupStore,
  groupId: string | null,
  start: string,
): WeekResponse | undefined {
  useSyncExternalStore(store.subscribe, store.snapshot);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!groupId) return;
    void store.loadWeek(groupId, start).then(() => setTick((t) => t + 1));
  }, [store, groupId, start]);
  return groupId ? store.weekCached(groupId, start) : undefined;
}

/* ───── 공개 사본 ───── */

type Marks = Record<string, Array<[number, number]>>;

/** 노트 → 모임에 보일 조각 (밑줄·생각·적용·질문). 정리 본문·녹음은 넣지 않는다 */
export function shareFieldsOf(n: SermonNote): ShareFields {
  const d = document.createElement('div');
  d.innerHTML = n.body || '';
  const highlights: NonNullable<ShareFields['highlights']> = [];
  d.querySelectorAll<HTMLElement>('.sn-vblock[data-marks]').forEach((el) => {
    const r = decRef(el.dataset.ref);
    if (!r) return;
    let mk: Marks;
    try {
      mk = JSON.parse(el.dataset.marks || '{}') as Marks;
    } catch {
      return;
    }
    const vs = new Map(verses(r) || []);
    Object.keys(mk).forEach((v) => {
      const iv = mk[v];
      if (!iv?.length) return;
      const vn = Number(v);
      const text = vs.get(vn);
      const ref = encRef({ b: r.b, c: r.c, v1: vn, v2: vn, whole: false });
      highlights.push({
        ref,
        marks: iv,
        ...(text ? { text: iv.map(([s, e]) => text.slice(s, e)).join(' … ') } : {}),
      });
    });
  });
  const thoughts = (n.thoughts || [])
    .filter((t) => (t.text || '').trim())
    .map((t) => ({ id: t.id, tag: t.tag, text: t.text.slice(0, 1000) }));
  return { highlights: highlights.slice(0, 60), thoughts: thoughts.slice(0, 40) };
}

const pending = new Map<string, number>();
const lastSent = new Map<string, string>();

/**
 * 노트가 저장될 때마다 부른다. 연결된 자리마다 공개 사본을 올리거나(PUT) 지운다(off → DELETE).
 * session_id 가 아직 없으면 resolve 해서 받아 오고, onLinked 로 노트에 적게 한다.
 */
export function syncNoteShares(
  store: GroupStore,
  note: SermonNote,
  onLinked: (noteId: string, links: NoteGroupLink[]) => void,
  delay = 2500,
) {
  if (store.anonymous || !(note.groups || []).length) return;
  const prev = pending.get(note.id);
  if (prev) window.clearTimeout(prev);
  pending.set(
    note.id,
    window.setTimeout(() => {
      pending.delete(note.id);
      void doSync(store, note, onLinked);
    }, delay),
  );
}

async function doSync(
  store: GroupStore,
  note: SermonNote,
  onLinked: (noteId: string, links: NoteGroupLink[]) => void,
) {
  const links = [...(note.groups || [])];
  let changed = false;
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
    const g = store.get(l.group_id);
    if (!g || g.me.status !== 'active') continue;
    try {
      if (!l.session_id) {
        if (l.off || !l.service_id) continue;
        const s = await sermonGroupAPI.resolveSession({
          group_id: l.group_id,
          service_id: l.service_id,
          date: l.date,
        });
        links[i] = { ...l, session_id: s.id };
        changed = true;
        store.patchSession(l.group_id, s);
      }
      const sid = links[i].session_id as string;
      const sig = l.off ? 'off' : JSON.stringify([note.title, l.private, note.updated_at]);
      if (lastSent.get(`${note.id}|${sid}`) === sig) continue;
      if (l.off) {
        await sermonGroupAPI.deleteShare(sid).catch(() => undefined);
      } else {
        await sermonGroupAPI.putShare(sid, {
          note_id: note.id,
          my_title: (note.title || '').slice(0, 200),
          heard: l.how === 'auto' ? 'live' : 'other',
          part: null,
          private: !!l.private,
          fields: l.private ? {} : shareFieldsOf(note),
        });
      }
      lastSent.set(`${note.id}|${sid}`, sig);
    } catch {
      /* 다음 저장 때 다시 */
    }
  }
  if (changed) onLinked(note.id, links);
}

/** 모임에서 노트를 뺄 때 (옮기기·삭제) 서버 사본도 지운다 */
export async function removeShare(link: NoteGroupLink) {
  if (link.session_id) await sermonGroupAPI.deleteShare(link.session_id).catch(() => undefined);
}

/** 멤버 얼굴 색 — user_id 로 고정 */
const FACE = [
  '#5a45b8',
  '#d65d95',
  '#3d8f7b',
  '#c47a2c',
  '#2d5f9a',
  '#9a5ab8',
  '#6a8a3a',
  '#b8336f',
];
export function faceColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return FACE[h % FACE.length];
}

export function initial(name: string): string {
  return (name || '?').trim().slice(0, 1);
}

/** 받침에 맞는 조사: josa('상건', '이', '가') → '상건이' */
export function josa(word: string, withFinal: string, without: string): string {
  const c = (word || '').charCodeAt((word || '').length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false;
  return `${word}${has ? withFinal : without}`;
}
