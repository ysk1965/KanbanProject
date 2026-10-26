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
 * - 못 보낸 사본 작업은 큐(sermon-share-q-v1:<userId>)에 남겨 4초→60초 간격·online·앱 시작 때 다시 보낸다.
 *   PUT 은 다시 보낼 때 노트 저장소의 최신 내용으로 보낸다 (attachNotes 로 받은 노트 읽기)
 */

type Listener = () => void;

/** 못 보낸 공개 사본 작업 */
export interface ShareOp {
  note_id: string;
  group_id: string;
  op: 'put' | 'delete';
  session_id?: string | null;
  /** 처음 실패한 시각 (오래되면 버린다) */
  since: number;
}

/** 다시 보낼 때 최신 노트를 읽는 창구 — useGroupWiring 이 노트 저장소로 채운다 */
export interface ShareNoteSource {
  get: (id: string) => SermonNote | undefined;
  /** 노트 저장소가 첫 동기화를 마쳤나 (전엔 「노트 없음」을 믿지 않는다) */
  ready: () => boolean;
  /** 노트 삭제까지 서버에 다 올라갔나 (지운 노트의 DELETE 실패를 버려도 되는지) */
  settled: () => boolean;
  onLinked: (noteId: string, links: NoteGroupLink[]) => void;
}

const SHARE_BACKOFF_MIN = 4000;
const SHARE_BACKOFF_MAX = 60000;
const SHARE_MAX_AGE = 14 * 86400000;

const opKey = (o: Pick<ShareOp, 'op' | 'note_id' | 'group_id' | 'session_id'>) =>
  o.op === 'put' ? `put|${o.note_id}|${o.group_id}` : `del|${o.session_id}`;

/** 다시 보내도 소용없는 실패 (권한 없음·자리 없음·잘못된 요청) */
function finalShareError(e: unknown): boolean {
  const st = (e as { status?: number } | null)?.status;
  return st === 400 || st === 403 || st === 404 || st === 409 || st === 422;
}

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
    try {
      const q = JSON.parse(localStorage.getItem(this.qKey) || '[]') as ShareOp[];
      if (Array.isArray(q)) this.shareQ = q.filter((o) => o && o.note_id && o.group_id && o.op);
    } catch {
      /* ignore */
    }
  }

  /* ───── 못 보낸 공개 사본 큐 ───── */

  private shareQ: ShareOp[] = [];
  private noteSrc: ShareNoteSource | null = null;
  /** 노트가 내 그 주 갈피인지 (useGroupWiring 이 갈피 규칙으로 채운다) — 공개 사본에 같이 보낸다 */
  galpiOf: (noteId: string) => boolean = () => false;
  private shareTimer: number | null = null;
  private shareBackoff = SHARE_BACKOFF_MIN;
  private draining = false;

  private get qKey() {
    return `sermon-share-q-v1:${this.userId}`;
  }

  private persistQ() {
    try {
      if (this.shareQ.length) localStorage.setItem(this.qKey, JSON.stringify(this.shareQ));
      else localStorage.removeItem(this.qKey);
    } catch {
      /* ignore */
    }
  }

  /** 남은 작업 (테스트·화면용) */
  pendingShares(): ShareOp[] {
    return [...this.shareQ];
  }

  queueShare(o: Omit<ShareOp, 'since'>) {
    if (this.anonymous) return;
    if (o.op === 'delete' && !o.session_id) return;
    const k = opKey(o);
    if (!this.shareQ.some((x) => opKey(x) === k)) {
      this.shareQ.push({ ...o, since: Date.now() });
      this.persistQ();
    }
    this.scheduleShares(this.shareBackoff);
  }

  unqueueShare(o: Pick<ShareOp, 'op' | 'note_id' | 'group_id' | 'session_id'>) {
    const k = opKey(o);
    const next = this.shareQ.filter((x) => opKey(x) !== k);
    if (next.length === this.shareQ.length) return;
    this.shareQ = next;
    this.persistQ();
  }

  /**
   * 로컬 노트 id 가 서버 id 로 바뀌면 남은 PUT 도 서버 id 로 — 다시 보낼 때 note_id 가 서버 id 로 올라가
   * (서버는 노트를 지울 때 서버 id 로 사본을 지운다)
   */
  remapShares(from: string, to: string) {
    if (!this.shareQ.some((x) => x.note_id === from)) return;
    const seen = new Set<string>();
    this.shareQ = this.shareQ
      .map((x) => (x.note_id === from ? { ...x, note_id: to } : x))
      .filter((x) => {
        const k = opKey(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    this.persistQ();
    this.scheduleShares(1500);
  }

  private hasShare(o: Pick<ShareOp, 'op' | 'note_id' | 'group_id' | 'session_id'>) {
    const k = opKey(o);
    return this.shareQ.some((x) => opKey(x) === k);
  }

  private scheduleShares(delay: number) {
    if (this.anonymous || !this.shareQ.length) return;
    if (this.shareTimer) window.clearTimeout(this.shareTimer);
    this.shareTimer = window.setTimeout(() => {
      this.shareTimer = null;
      void this.drainShares();
    }, delay);
  }

  private onOnline = () => {
    this.shareBackoff = SHARE_BACKOFF_MIN;
    this.scheduleShares(0);
  };

  /**
   * 노트 저장소를 붙인다 (useGroupWiring). 붙는 순간 남은 작업을 다시 보내고, online 이 되면 또 보낸다.
   * 돌려준 함수로 뗀다.
   */
  attachNotes(src: ShareNoteSource): () => void {
    if (this.anonymous) return () => undefined;
    this.noteSrc = src;
    window.addEventListener('online', this.onOnline);
    this.scheduleShares(1500);
    return () => {
      if (this.noteSrc === src) this.noteSrc = null;
      window.removeEventListener('online', this.onOnline);
      if (this.shareTimer) window.clearTimeout(this.shareTimer);
      this.shareTimer = null;
    };
  }

  /** 큐를 한 번 훑는다. 하나라도 끊기면 간격을 늘려 다시 */
  async drainShares(): Promise<void> {
    if (this.anonymous || this.draining) return;
    this.draining = true;
    let failed = false;
    try {
      const now = Date.now();
      for (const o of [...this.shareQ]) {
        if (now - (o.since || now) > SHARE_MAX_AGE) {
          this.unqueueShare(o);
          continue;
        }
        const src = this.noteSrc;
        const note = src?.ready() ? src.get(o.note_id) : undefined;
        if (o.op === 'delete') {
          // 지운 노트: 노트 삭제가 서버에 올라갔으면 서버가 사본도 지웠다
          if (src?.ready() && !note && src.settled()) {
            this.unqueueShare(o);
            continue;
          }
          try {
            await sermonGroupAPI.deleteShare(o.session_id as string);
            this.unqueueShare(o);
          } catch (e) {
            if (finalShareError(e)) this.unqueueShare(o);
            else failed = true;
          }
          continue;
        }
        // put — 최신 노트 내용으로
        if (!src || !src.ready()) {
          failed = true;
          continue;
        }
        const link = note?.groups?.find((l) => l.group_id === o.group_id);
        const g = this.get(o.group_id);
        if (!note || !link || (this.loaded && (!g || g.me?.status !== 'active'))) {
          // 노트가 지워졌거나 모임에서 빠졌다 (빠질 때는 DELETE 가 따로 큐에 들어간다)
          this.unqueueShare(o);
          continue;
        }
        await doSync(this, note, src.onLinked);
        if (this.hasShare(o)) failed = true;
      }
    } finally {
      this.draining = false;
    }
    if (failed) {
      this.scheduleShares(this.shareBackoff);
      this.shareBackoff = Math.min(SHARE_BACKOFF_MAX, this.shareBackoff * 2);
    } else {
      this.shareBackoff = SHARE_BACKOFF_MIN;
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
    const put = { op: 'put' as const, note_id: note.id, group_id: l.group_id };
    try {
      if (!l.session_id) {
        if (l.off || !l.service_id) {
          store.unqueueShare(put);
          continue;
        }
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
      const galpi = store.galpiOf(note.id);
      const sig = l.off ? 'off' : JSON.stringify([note.title, l.private, note.updated_at, galpi]);
      if (lastSent.get(`${note.id}|${sid}`) === sig) {
        store.unqueueShare(put);
        continue;
      }
      if (l.off) {
        store.unqueueShare(put);
        try {
          await sermonGroupAPI.deleteShare(sid);
        } catch (e) {
          if (!finalShareError(e)) {
            store.queueShare({
              op: 'delete',
              note_id: note.id,
              group_id: l.group_id,
              session_id: sid,
            });
            continue;
          }
        }
        store.unqueueShare({
          op: 'delete',
          note_id: note.id,
          group_id: l.group_id,
          session_id: sid,
        });
      } else {
        await sermonGroupAPI.putShare(sid, {
          note_id: note.id,
          my_title: (note.title || '').slice(0, 200),
          heard: l.how === 'auto' ? 'live' : 'other',
          part: null,
          private: !!l.private,
          galpi,
          fields: l.private ? {} : shareFieldsOf(note),
        });
        store.unqueueShare(put);
        // 다시 켰으면 지우려던 것은 무르기
        store.unqueueShare({
          op: 'delete',
          note_id: note.id,
          group_id: l.group_id,
          session_id: sid,
        });
      }
      lastSent.set(`${note.id}|${sid}`, sig);
    } catch (e) {
      // 끊김·서버 오류는 큐에 남겨 다시 보낸다 (권한 없음·자리 없음은 버림)
      if (finalShareError(e)) store.unqueueShare(put);
      else store.queueShare(put);
    }
  }
  if (changed) onLinked(note.id, links);
}

/** 모임에서 노트를 뺄 때 (옮기기·삭제) 서버 사본도 지운다. 끊기면 큐에 남겨 다시 */
export async function removeShare(store: GroupStore, link: NoteGroupLink, noteId = '') {
  if (!link.session_id || store.anonymous) return;
  const op = {
    op: 'delete' as const,
    note_id: noteId,
    group_id: link.group_id,
    session_id: link.session_id,
  };
  try {
    await sermonGroupAPI.deleteShare(link.session_id);
    store.unqueueShare(op);
  } catch (e) {
    if (!finalShareError(e)) store.queueShare(op);
  }
}

/** 테스트용 — 모듈 캐시 비우기 */
export function resetGroupStores() {
  stores.clear();
  pending.forEach((t) => window.clearTimeout(t));
  pending.clear();
  lastSent.clear();
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
