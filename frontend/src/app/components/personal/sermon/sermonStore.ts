import { personalFeatureAPI } from '../../../utils/services';
import type { PersonalFeatureDoc, PersonalFeatureDocSummary } from '../features/types';
import { sermonAudioStore } from './sermonAudioStore';
import { MediaUploadError, deleteMedia, uploadAudio } from './sermonMedia';
import {
  audioPending,
  isLocalId,
  LOCAL_ID_PREFIX,
  normalizeNote,
  SERMON_FEATURE_KEY,
  SERMON_SCHEMA_VER,
  UNTITLED,
  type SermonAudioSegment,
  type SermonContent,
  type SermonNote,
  uid,
} from './sermonTypes';
import { audioExt } from './useSermonRecorder';
import { adoptVersions, dropVersions, remapVersions, shrinkVersions } from './sermonVersions';

/**
 * 설교 노트 저장소 — 기획서 §10 「저장과 동기화」.
 *
 * 1. 모든 변경은 먼저 이 기기(localStorage)에 쓴다. 예배 중에는 '저장 실패'를 보여주지 않는다.
 * 2. 올리지 못한 변경은 dirty/deleted 목록에 남겨, 연결되면 서버(personal_feature_docs, feature_key='sermon')로 보낸다.
 * 3. 실패하면 4초 → 최대 60초 간격으로 다시 시도한다.
 * 4. 다른 기기의 변경과 겹치면(양쪽 다 마지막 동기화 뒤에 고침) 이 기기 내용은 그 노트에 두고,
 *    다른 기기 내용은 사본 노트로 따로 남긴다. 어느 쪽도 버리지 않는다.
 * 5. 오프라인·실패 뒤 다시 올릴 때는 먼저 서버 목록을 받아 4번을 확인한다.
 *
 * 서버 id 가 없는 새 노트는 `local-` id 로 만들어 두고, 올라간 뒤 서버 id 로 바꾼다(remap 리스너로 열린 화면에 알림).
 *
 * 녹음(audio.segments)은 노트 JSON 과 따로 간다: 조각은 IndexedDB(sermonAudioStore)에 있고,
 * flush 끝에 `local-` 토막을 내 스토리지로 올린 뒤 노트의 토막 id·URL 을 바꾼다. 열어 둔 노트의
 * 아직 안 닫힌 토막(녹음 중)은 건드리지 않는다.
 */

/** 로그인 전 사용자의 저장소 키. 로그인하면 이 키의 노트가 그 계정으로 옮겨진다 */
export const ANONYMOUS_USER = 'anon';

export interface SyncStatus {
  /** 로그인 전 — 서버를 부르지 않고 이 기기에만 저장 */
  anonymous: boolean;
  /** 아직 서버에 올리지 못한 변경 수 */
  pending: number;
  /** null = 아직 모름 */
  online: boolean | null;
  lastSync: number;
  /** 첫 서버 동기화 진행 중 */
  loading: boolean;
  /** localStorage 를 쓸 수 없는 기기 */
  localOk: boolean;
  /** 녹음 올리는 중이면 진행률(0~100) */
  audioPct: number | null;
  /** 기기 저장 공간이 차서 마지막 변경을 기기에 쓰지 못함 */
  localFull: boolean;
  /** 마지막 전송이 응답 없이 시간을 넘김 (느린·로그인 필요한 와이파이) */
  slow: boolean;
}

type Listener = () => void;
type RemapListener = (fromId: string, toId: string) => void;
/** 다른 기기 수정과 겹쳐 사본 노트를 만들었을 때 */
type ConflictListener = (copy: SermonNote) => void;

interface PersistShape {
  notes: SermonNote[];
  dirty: string[];
  deleted: string[];
  synced: Array<[string, string]>;
}

const BACKOFF_MIN = 4000;
const BACKOFF_MAX = 60000;
const FETCH_BATCH = 6;
/** 문서 요청 하나의 제한 시간. 응답 없는 와이파이에서 전송이 멈춰 재시도도 못 하는 일을 막는다 */
const REQUEST_TIMEOUT_MS = 20000;

class RequestTimeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new RequestTimeout('sermon: request timed out')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** 본문이 같은지 — 저장 시각만 다른 경우는 겹친 것으로 보지 않는다 (서버 jsonb 는 키 순서를 바꾼다) */
function sameContent(a: SermonNote, b: SermonNote): boolean {
  const key = (n: SermonNote) => {
    const { id: _i, updated_at: _u, created_at: _c, ...rest } = n;
    return stableStringify(rest);
  };
  return key(a) === key(b);
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** 문서 없음(PF001)만. 기능 미등록(PF002)·라우트 404 는 재생성이 아니라 재시도 대상이다 */
function isNotFound(err: unknown): boolean {
  const e = err as { code?: string } | null;
  return !!e && e.code === 'PF001';
}

export class SermonStore {
  readonly notes = new Map<string, SermonNote>();
  private dirty = new Set<string>();
  private deleted = new Set<string>();
  /** id → 서버 updated_at (ISO). 목록과 비교해 바뀐 문서만 다시 받는다 */
  private synced = new Map<string, string>();

  private listeners = new Set<Listener>();
  private remapListeners = new Set<RemapListener>();
  private conflictListeners = new Set<ConflictListener>();
  /** 오프라인·실패 뒤에는 올리기 전에 서버 목록부터 맞춘다 (겹친 수정 확인) */
  private needPull = false;

  private flushing = false;
  private again = false;
  private retryTimer: number | null = null;
  private backoff = BACKOFF_MIN;

  /** 편집 중인 노트 — 서버 pull 이 덮어쓰지 않도록 */
  openId: string | null = null;

  status: SyncStatus = {
    anonymous: false,
    pending: 0,
    online: null,
    lastSync: 0,
    loading: true,
    localOk: true,
    audioPct: null,
    localFull: false,
    slow: false,
  };

  private onOnline = () => {
    this.backoff = BACKOFF_MIN;
    this.needPull = true;
    void this.flush();
  };
  private onOffline = () => {
    this.needPull = true;
    this.setStatus({ online: false });
  };

  constructor(private readonly userId: string) {
    this.status.anonymous = userId === ANONYMOUS_USER;
  }

  get anonymous(): boolean {
    return this.userId === ANONYMOUS_USER;
  }

  // ───────── 구독 ─────────

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onRemap(fn: RemapListener): () => void {
    this.remapListeners.add(fn);
    return () => this.remapListeners.delete(fn);
  }

  onConflict(fn: ConflictListener): () => void {
    this.conflictListeners.add(fn);
    return () => this.conflictListeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = {
      ...this.status,
      ...patch,
      pending: this.dirty.size + this.deleted.size + this.audioPendingCount(),
    };
    this.notify();
  }

  private audioPendingCount(): number {
    let n = 0;
    this.notes.forEach((note) => {
      n += audioPending(note);
    });
    return n;
  }

  // ───────── 로컬 저장 ─────────

  private get lsKey() {
    return SermonStore.keyFor(this.userId);
  }

  static keyFor(userId: string) {
    return `sermon-notes-v1:${userId}`;
  }

  /**
   * 로그인 직후: 로그인 전에 이 기기에 적어 둔(익명) 노트를 이 계정으로 옮긴다.
   * 익명 노트는 전부 local- id 라 서버 문서로 새로 올라간다. 옮긴 뒤 익명 저장소는 비운다.
   */
  private adoptAnonymous(): number {
    if (this.anonymous || !this.status.localOk) return 0;
    let raw: string | null;
    try {
      raw = localStorage.getItem(SermonStore.keyFor(ANONYMOUS_USER));
    } catch {
      return 0;
    }
    if (!raw) return 0;
    let moved = 0;
    try {
      const data = JSON.parse(raw) as Partial<PersistShape>;
      (data.notes || []).forEach((n) => {
        if (!n || !n.id || this.notes.has(n.id)) return;
        this.notes.set(n.id, normalizeNote(n.id, n));
        this.dirty.add(n.id);
        moved++;
      });
      adoptVersions(ANONYMOUS_USER, this.userId);
      localStorage.removeItem(SermonStore.keyFor(ANONYMOUS_USER));
    } catch (e) {
      console.warn('sermon: adopt anonymous failed', e);
    }
    return moved;
  }

  private loadLocal() {
    try {
      localStorage.setItem('sermon-probe', '1');
      localStorage.removeItem('sermon-probe');
    } catch {
      this.status.localOk = false;
    }
    try {
      const raw = localStorage.getItem(this.lsKey);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<PersistShape>;
      (data.notes || []).forEach((n) => {
        if (n && n.id) this.notes.set(n.id, normalizeNote(n.id, n));
      });
      (data.dirty || []).forEach((id) => this.dirty.add(id));
      (data.deleted || []).forEach((id) => this.deleted.add(id));
      (data.synced || []).forEach(([id, at]) => this.synced.set(id, at));
    } catch (e) {
      console.error('sermon: local load failed', e);
    }
  }

  private persistLocal() {
    if (!this.status.localOk) return;
    const shape: PersistShape = {
      notes: [...this.notes.values()],
      dirty: [...this.dirty],
      deleted: [...this.deleted],
      synced: [...this.synced.entries()],
    };
    const raw = JSON.stringify(shape);
    let ok = tryWrite(this.lsKey, raw);
    if (!ok) {
      // 용량 초과 — 버전 기록(본문 사본)부터 줄이고 한 번 더
      shrinkVersions(this.userId);
      ok = tryWrite(this.lsKey, raw);
    }
    if (ok === !this.status.localFull) return; // 상태 그대로
    if (!ok) console.warn('sermon: local persist failed (storage full)');
    this.status = { ...this.status, localFull: !ok };
    this.notify();
  }

  // ───────── 수명 ─────────

  async init() {
    this.loadLocal();
    requestPersistentStorage();
    if (this.anonymous) {
      // 로그인 전: 서버 없음. 기기 저장이 곧 저장이다
      this.setStatus({ loading: false, online: null });
      return;
    }
    const adopted = this.adoptAnonymous();
    if (adopted) this.persistLocal();
    this.setStatus({ loading: true });
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    await this.pull();
    this.setStatus({ loading: false });
    void this.flush();
  }

  dispose() {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
  }

  // ───────── 읽기 ─────────

  all(): SermonNote[] {
    return [...this.notes.values()].sort(
      (a, b) => (b.date || '').localeCompare(a.date || '') || b.updated_at - a.updated_at,
    );
  }

  get(id: string): SermonNote | undefined {
    return this.notes.get(id);
  }

  // ───────── 쓰기 ─────────

  /** 기기에 즉시 저장하고 서버 전송을 예약한다 */
  save(note: SermonNote): SermonNote {
    const prev = this.notes.get(note.id);
    // 모임 연결(groups·group_dismissed)은 saveLinks 로만 바뀐다 — 편집기가 들고 있던 옛 사본이 덮어쓰지 않게
    const links = prev
      ? {
          groups: prev.groups,
          group_dismissed: prev.group_dismissed,
        }
      : {};
    const n = { ...this.keepUploadedAudio(note), ...links, updated_at: Date.now() };
    if (!n.groups) delete n.groups;
    if (!n.group_dismissed) delete n.group_dismissed;
    this.notes.set(n.id, n);
    this.dirty.add(n.id);
    this.persistLocal();
    this.setStatus({});
    void this.flush();
    return n;
  }

  /**
   * 화면 사본이 들고 있는 `local-` 토막이 그 사이 올라가 id 가 바뀌었으면, 저장된 쪽을 지킨다.
   * (토막은 시작 경과 초(offset)로 맞춘다)
   */
  private keepUploadedAudio(note: SermonNote): SermonNote {
    const prev = this.notes.get(note.id);
    const incoming = note.audio?.segments;
    if (!prev?.audio || !incoming?.length) return note;
    const byOffset = new Map(prev.audio.segments.map((x) => [x.offset, x] as const));
    let changed = false;
    const segments = incoming.map((x) => {
      const y = byOffset.get(x.offset);
      if (!y || y.id === x.id) return x;
      if ((isLocalId(x.id) && !isLocalId(y.id)) || (y.lost && !x.lost)) {
        changed = true;
        return { ...x, id: y.id, url: y.url, ...(y.lost ? { lost: true } : {}) };
      }
      return x;
    });
    return changed ? { ...note, audio: { segments } } : note;
  }

  /** 모임 연결만 바꾼다 (노트 본문은 그대로) */
  saveLinks(
    id: string,
    patch: Pick<SermonNote, 'groups' | 'group_dismissed'>,
  ): SermonNote | undefined {
    const prev = this.notes.get(id);
    if (!prev) return undefined;
    const n: SermonNote = { ...prev, ...patch, updated_at: Date.now() };
    if (!n.groups?.length) delete n.groups;
    if (!n.group_dismissed?.length) delete n.group_dismissed;
    this.notes.set(id, n);
    this.dirty.add(id);
    this.persistLocal();
    this.setStatus({});
    void this.flush();
    return n;
  }

  remove(id: string) {
    const n = this.notes.get(id);
    (n?.audio?.segments || []).forEach((seg) => {
      if (!isLocalId(seg.id)) deleteMedia(seg.id);
    });
    void sermonAudioStore.removeNote(id);
    this.notes.delete(id);
    this.dirty.delete(id);
    if (!isLocalId(id)) this.deleted.add(id);
    this.synced.delete(id);
    dropVersions(this.userId, id);
    this.persistLocal();
    this.setStatus({});
    void this.flush();
  }

  // ───────── 서버 동기화 ─────────

  /** 서버 목록과 맞춘다. 변경된 문서만 본문을 받는다. 목록을 못 받으면 false */
  private async pull(): Promise<boolean> {
    let summaries: PersonalFeatureDocSummary[];
    try {
      summaries = await withTimeout(personalFeatureAPI.listDocs(SERMON_FEATURE_KEY));
    } catch (e) {
      console.warn('sermon: pull failed', e);
      this.needPull = true;
      this.setStatus({ online: false, slow: e instanceof RequestTimeout });
      return false;
    }
    const serverIds = new Set(summaries.map((s) => s.id));

    // 다른 기기에서 지운 노트: 여기서 고친 적 없으면 따라 지운다
    for (const id of [...this.notes.keys()]) {
      if (!isLocalId(id) && !serverIds.has(id) && !this.dirty.has(id)) {
        this.notes.delete(id);
        this.synced.delete(id);
      }
    }

    const toFetch = summaries.filter(
      (s) =>
        !this.deleted.has(s.id) &&
        (!this.notes.has(s.id) || this.synced.get(s.id) !== s.updated_at),
    );
    for (let i = 0; i < toFetch.length; i += FETCH_BATCH) {
      const batch = toFetch.slice(i, i + FETCH_BATCH);
      const results = await Promise.allSettled(
        batch.map((s) =>
          withTimeout(personalFeatureAPI.getDoc<SermonContent>(SERMON_FEATURE_KEY, s.id)),
        ),
      );
      results.forEach((r) => {
        if (r.status !== 'fulfilled') return;
        this.mergeRemote(r.value);
      });
    }
    this.persistLocal();
    this.needPull = false;
    this.setStatus({ online: true, slow: false, lastSync: Date.now() });
    return true;
  }

  private mergeRemote(doc: PersonalFeatureDoc<SermonContent>) {
    const remote = normalizeNote(doc.id, doc.content);
    const local = this.notes.get(doc.id);
    if (local && this.dirty.has(doc.id)) {
      if (sameContent(local, remote)) {
        // 같은 내용 — 이미 올라간 것. 서버 쪽을 받는다
        this.notes.set(doc.id, {
          ...local,
          updated_at: Math.max(local.updated_at, remote.updated_at),
        });
        this.dirty.delete(doc.id);
        this.synced.set(doc.id, doc.updated_at);
        return;
      }
      const base = this.synced.get(doc.id);
      if (base && base !== doc.updated_at) {
        // 마지막 동기화 뒤에 양쪽 다 고쳤다 → 이 기기 내용은 이 노트로 올리고, 다른 기기 내용은 사본으로
        this.forkRemote(remote, local);
        this.synced.set(doc.id, doc.updated_at);
        return;
      }
      // 서버는 그대로고 이 기기만 고쳤다 → flush 가 올린다
      if (local.updated_at >= remote.updated_at) return;
    }
    // 열어서 편집 중인 노트는 덮어쓰지 않는다
    if (local && this.openId === doc.id) return;
    this.notes.set(doc.id, remote);
    this.dirty.delete(doc.id);
    this.synced.set(doc.id, doc.updated_at);
  }

  /** 다른 기기에서 고친 내용을 새 노트(사본)로 남긴다. 이 기기에 없는 녹음 토막만 가져간다 */
  private forkRemote(remote: SermonNote, local: SermonNote) {
    const localSegs = new Set((local.audio?.segments || []).map((x) => x.id));
    const segments = (remote.audio?.segments || []).filter((x) => !localSegs.has(x.id));
    const now = Date.now();
    const copy: SermonNote = {
      ...remote,
      id: LOCAL_ID_PREFIX + uid('n'),
      title: `${(remote.title || '').trim() || UNTITLED} · 다른 기기 사본`,
      // 갈피는 한 주에 한 편 — 원래 노트에 둔다
      bookmarked_at: null,
      created_at: now,
      updated_at: now,
    };
    if (segments.length) copy.audio = { segments };
    else delete copy.audio;
    this.notes.set(copy.id, copy);
    this.dirty.add(copy.id);
    console.warn('sermon: conflict — kept other device copy as', copy.id);
    this.conflictListeners.forEach((fn) => fn(copy));
  }

  private scheduleRetry() {
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => void this.flush(), this.backoff);
    this.backoff = Math.min(BACKOFF_MAX, this.backoff * 2);
  }

  async flush() {
    if (this.anonymous) {
      this.setStatus({});
      return;
    }
    if (
      !this.needPull &&
      this.dirty.size === 0 &&
      this.deleted.size === 0 &&
      this.audioPendingCount() === 0
    ) {
      this.setStatus({});
      return;
    }
    if (this.flushing) {
      this.again = true;
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.needPull = true;
      this.setStatus({ online: false });
      this.scheduleRetry();
      return;
    }
    this.flushing = true;
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    try {
      // 끊겼다 다시 올리는 길이면 서버에서 그 사이 바뀐 것부터 받는다 (겹친 수정은 사본으로)
      if (this.needPull && !(await this.pull()))
        throw new Error('sermon: pull before flush failed');
      for (const id of [...this.dirty]) {
        const n = this.notes.get(id);
        if (!n) {
          this.dirty.delete(id);
          continue;
        }
        const stamp = n.updated_at;
        if (isLocalId(id)) {
          await this.createRemote(id, n, stamp);
        } else {
          try {
            const saved = await withTimeout(
              personalFeatureAPI.updateDoc<SermonContent>(SERMON_FEATURE_KEY, id, {
                title: titleOf(n),
                content: contentOf(n),
              }),
            );
            if (this.notes.get(id)?.updated_at === stamp) this.dirty.delete(id);
            this.synced.set(id, saved.updated_at);
          } catch (e) {
            if (!isNotFound(e)) throw e;
            // 다른 기기에서 지운 문서에 이 기기의 변경이 남아 있다 → 새 문서로 다시 올린다
            await this.createRemote(id, n, stamp);
          }
        }
      }
      for (const id of [...this.deleted]) {
        try {
          await withTimeout(personalFeatureAPI.deleteDoc(SERMON_FEATURE_KEY, id));
        } catch (e) {
          if (!isNotFound(e)) throw e;
        }
        this.deleted.delete(id);
      }
      await this.flushAudio();
      this.backoff = BACKOFF_MIN;
      this.setStatus({ online: true, slow: false, lastSync: Date.now() });
    } catch (e) {
      console.warn('sermon: flush failed, will retry', e);
      this.needPull = true;
      this.setStatus({ online: false, slow: e instanceof RequestTimeout });
      this.scheduleRetry();
    } finally {
      this.flushing = false;
      this.persistLocal();
      this.setStatus({});
      if (this.again) {
        this.again = false;
        if (this.status.online) void this.flush();
      }
    }
  }

  // ───────── 녹음 ─────────

  /**
   * 열어 두지 않은 노트의 안 닫힌 토막(새로고침·탭 종료로 남은 것)을 닫는다.
   * 길이는 마지막 조각을 받을 때의 경과 초로 잡는다. 조각이 하나도 없으면 lost.
   */
  async reconcileAudio(noteId: string, liveSegId: string | null = null): Promise<void> {
    const n = this.notes.get(noteId);
    if (!n?.audio) return;
    let changed = false;
    const segments: SermonAudioSegment[] = [];
    for (const seg of n.audio.segments) {
      if (!isLocalId(seg.id) || seg.lost || seg.id === liveSegId) {
        segments.push(seg);
        continue;
      }
      const meta = await sermonAudioStore.getSegment(seg.id);
      if (!meta) {
        segments.push({ ...seg, lost: true });
        changed = true;
        continue;
      }
      if (!meta.done) {
        const duration = Math.max(0, meta.elapsedAt - meta.offset);
        await sermonAudioStore.putSegment({ ...meta, done: true });
        if (duration !== seg.duration || meta.bytes !== seg.size) {
          segments.push({ ...seg, duration, size: meta.bytes });
          changed = true;
          continue;
        }
      }
      segments.push(seg);
    }
    if (changed) {
      const cur = this.notes.get(noteId);
      if (!cur) return;
      const next = { ...cur, audio: { segments } };
      this.notes.set(noteId, next);
      this.dirty.add(noteId);
      this.persistLocal();
      this.setStatus({});
    }
  }

  /** `local-` 토막을 내 스토리지로 올리고 노트의 토막 id·URL 을 바꾼다 */
  private async flushAudio(): Promise<void> {
    for (const note of [...this.notes.values()]) {
      if (!audioPending(note)) continue;
      if (isLocalId(note.id)) continue; // 노트가 먼저 올라가야 한다 (다음 flush 에서)
      if (note.id !== this.openId) await this.reconcileAudio(note.id);
      const cur = this.notes.get(note.id);
      if (!cur?.audio) continue;
      for (const seg of cur.audio.segments) {
        if (!isLocalId(seg.id) || seg.lost) continue;
        const meta = await sermonAudioStore.getSegment(seg.id);
        if (meta && !meta.done) continue; // 녹음 중
        const latest = this.notes.get(note.id);
        if (!latest?.audio) break;
        const patchSeg = (p: Partial<typeof seg>) => {
          const now = this.notes.get(note.id);
          if (!now?.audio) return;
          const segments = now.audio.segments.map((x) => (x.id === seg.id ? { ...x, ...p } : x));
          this.notes.set(note.id, { ...now, audio: { segments }, updated_at: Date.now() });
          this.dirty.add(note.id);
          this.persistLocal();
          this.setStatus({});
        };
        const blob = await sermonAudioStore.assemble(seg.id, seg.mime);
        if (!blob || !blob.size) {
          patchSeg({ lost: true });
          await sermonAudioStore.removeSegment(seg.id);
          continue;
        }
        const name = `${latest.date || 'sermon'} ${(latest.title || UNTITLED).slice(0, 40)}.${audioExt(seg.mime)}`;
        this.setStatus({ audioPct: 0 });
        try {
          const up = await uploadAudio(blob, name, (pct) => this.setStatus({ audioPct: pct }));
          patchSeg({ id: up.id, url: up.url, size: blob.size });
          await sermonAudioStore.removeSegment(seg.id);
        } catch (e) {
          if (e instanceof MediaUploadError && e.code === 'too_large') {
            patchSeg({ lost: true });
            continue;
          }
          throw e;
        } finally {
          this.setStatus({ audioPct: null });
        }
      }
    }
    if (this.dirty.size) this.again = true; // 바뀐 토막 id 를 서버 문서에도 반영
  }

  private async createRemote(oldId: string, n: SermonNote, stamp: number) {
    const created = await withTimeout(
      personalFeatureAPI.createDoc<SermonContent>(SERMON_FEATURE_KEY, {
        title: titleOf(n),
        content: contentOf(n),
        schema_ver: SERMON_SCHEMA_VER,
      }),
    );
    const cur = this.notes.get(oldId) ?? n;
    const newId = created.id;
    this.notes.delete(oldId);
    this.notes.set(newId, { ...cur, id: newId });
    this.dirty.delete(oldId);
    if (cur.updated_at !== stamp) this.dirty.add(newId); // 올리는 사이 또 고쳤다
    this.synced.set(newId, created.updated_at);
    this.synced.delete(oldId);
    if (this.openId === oldId) this.openId = newId;
    void sermonAudioStore.renameNote(oldId, newId);
    remapVersions(this.userId, oldId, newId);
    this.remapListeners.forEach((fn) => fn(oldId, newId));
  }
}

function tryWrite(key: string, raw: string): boolean {
  try {
    localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

/** 브라우저가 공간이 부족할 때 이 사이트 저장소를 지우지 않도록 요청 (Safari 7일 정리 포함) */
function requestPersistentStorage() {
  try {
    const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!st?.persist || !st.persisted) return;
    void st
      .persisted()
      .then((already) => (already ? true : st.persist()))
      .catch(() => {});
  } catch {
    /* 지원 안 함 */
  }
}

function titleOf(n: SermonNote): string {
  const t = (n.title || '').trim() || UNTITLED;
  return t.length > 200 ? t.slice(0, 200) : t;
}

function contentOf(n: SermonNote): SermonContent {
  const { id: _id, ...rest } = n;
  return rest;
}

/* ───────── 저장 상태 문구 ───────── */

export function syncLabel(s: SyncStatus): { text: string; state: 'ok' | 'wait' | 'warn' } {
  if (!s.localOk) {
    return { text: '저장 공간을 쓸 수 없어 창을 닫으면 사라져요', state: 'warn' };
  }
  if (s.localFull) {
    return {
      text: '기기 저장 공간이 부족해요 · 마지막 변경이 기기에 저장되지 않았어요',
      state: 'warn',
    };
  }
  if (s.anonymous) {
    return { text: '이 기기에 저장됨 · 로그인하면 다른 기기와 맞춰져요', state: 'ok' };
  }
  if (s.pending) {
    if (s.audioPct != null) return { text: `녹음 올리는 중 ${s.audioPct}%`, state: 'wait' };
    if (s.slow) return { text: '기기에 저장됨 · 연결이 느려서 잠시 뒤 다시 올려요', state: 'wait' };
    return {
      text:
        s.online === false || (typeof navigator !== 'undefined' && navigator.onLine === false)
          ? '기기에 저장됨 · 연결되면 올라가요'
          : '기기에 저장됨 · 올리는 중',
      state: 'wait',
    };
  }
  if (s.loading) return { text: '불러오는 중…', state: 'wait' };
  return { text: '모두 저장됨', state: 'ok' };
}
