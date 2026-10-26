import { personalFeatureAPI } from '../../../utils/services';
import type { PersonalFeatureDoc, PersonalFeatureDocSummary } from '../features/types';
import { sermonAudioStore } from './sermonAudioStore';
import { MediaUploadError, deleteMedia, uploadAudio, uploadPreparedMedia } from './sermonMedia';
import { sermonMediaQueue } from './sermonMediaQueue';
import { isQuotaError, openNoteDb, type NoteDb, type NoteSnapshot } from './sermonNoteDb';
import {
  audioPending,
  isLocalId,
  madeOnThisDevice,
  LOCAL_ID_PREFIX,
  mediaPending,
  normalizeNote,
  SERMON_FEATURE_KEY,
  SERMON_SCHEMA_VER,
  UNTITLED,
  type SermonAudioSegment,
  type SermonContent,
  type SermonNote,
  type ThoughtMedia,
  uid,
} from './sermonTypes';
import { audioExt } from './useSermonRecorder';
import { adoptVersions, dropVersions, remapVersions, shrinkVersions } from './sermonVersions';

/**
 * 설교 노트 저장소 — 기획서 §10 「저장과 동기화」.
 *
 * 1. 모든 변경은 먼저 이 기기(IndexedDB `sermon-notes`, 못 쓰면 localStorage)에 쓴다.
 *    예배 중에는 '저장 실패'를 보여주지 않는다.
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
 * 아직 안 닫힌 토막(녹음 중)은 건드리지 않는다. 생각 첨부(사진·영상)도 오프라인에 붙인 것은
 * sermonMediaQueue 에 있다가 같은 자리에서 올라간다.
 *
 * 기기 저장 — 노트가 수천 편이면 localStorage(약 5MB)가 넘치므로 IndexedDB(sermonNoteDb)에 한 편씩 쓴다.
 * - init 은 예전 localStorage 키(`sermon-notes-v1:<user>`)가 있으면 그것부터 동기로 읽어 바로 그리고,
 *   IndexedDB 에 옮겨 쓴 뒤 그 키를 지운다. 이후 변경은 IndexedDB 에 0.3초 모아 쓴다(바뀐 노트만).
 * - 키가 없으면 IndexedDB 를 비동기로 읽는다. 그동안 status.restoring = true (목록은 빈 화면 대신 로딩).
 * - IndexedDB 를 못 쓰는 기기(일부 프라이빗 창, 테스트)는 예전처럼 localStorage 에 통째로 쓴다.
 * - IndexedDB 쓰기가 공간 부족이 아닌 이유로 실패하면 localStorage 에 비상 사본을 두고, 다음 init 이 다시 옮긴다.
 *
 * 서버 문서 수 한도(PF004)에 닿으면 새 노트는 이 기기에만 두고 status.limit 을 켠다. 30분마다(또는 앱을
 * 다시 열 때·노트를 지워 자리가 나면) 한 번 더 올려 본다.
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
  /** 기기 저장분(IndexedDB)을 아직 읽는 중 — 목록이 '비었음'을 그리지 않게 */
  restoring: boolean;
  /** 서버 노트 보관 한도(PF004)에 닿아 새 노트를 올리지 못함 (이 기기에만 저장) */
  limit: boolean;
}

export interface SermonStoreOptions {
  /** 노트 IndexedDB 를 여는 함수. 테스트는 메모리 구현을 넣는다. null 을 주면 localStorage 로 */
  noteDb?: () => Promise<NoteDb | null>;
}

type Listener = () => void;
type RemapListener = (fromId: string, toId: string) => void;
/** 다른 기기 수정과 겹쳐 사본 노트를 만들었을 때 */
type ConflictListener = (copy: SermonNote) => void;

/** 기기 저장 모양 — localStorage 키 하나에 통째로, IndexedDB 는 노트 행 + meta 행으로 */
type PersistShape = NoteSnapshot;

const BACKOFF_MIN = 4000;
const BACKOFF_MAX = 60000;
/** 문서 수 한도에 닿은 뒤 다시 올려 보는 간격 */
const LIMIT_RETRY_MS = 30 * 60 * 1000;
/** IndexedDB 쓰기를 모으는 시간 */
const PERSIST_DELAY_MS = 300;
/** 생각에 붙지 않은 채 남은 대기열 첨부(쓰다 만 생각)를 지우는 나이 */
const MEDIA_SWEEP_AGE_MS = 24 * 60 * 60 * 1000;
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

/** 서버 문서 수 한도(PF004) — 다시 보내도 같은 답이므로 바로 재시도하지 않는다 */
function isLimit(err: unknown): boolean {
  const e = err as { code?: string } | null;
  return !!e && e.code === 'PF004';
}

type Backend = 'pending' | 'idb' | 'ls';

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
  /** 이 시각 전에는 새 문서를 만들지 않는다 (PF004) */
  private limitUntil = 0;

  // 기기 저장
  private backend: Backend = 'pending';
  private db: NoteDb | null = null;
  private readonly openDb: () => Promise<NoteDb | null>;
  /** IndexedDB 에 마지막으로 쓴 노트(객체 그대로). 노트는 바뀔 때마다 새 객체라 === 로 바뀐 것만 고른다 */
  private written = new Map<string, SermonNote>();
  private writeTimer: number | null = null;
  private writing: Promise<boolean> | null = null;
  private writeAgain = false;
  /** 저장 방식을 정하기 전에 들어온 저장 요청 */
  private persistWanted = false;
  /** localStorage 에 비상 사본을 둔 상태 — IndexedDB 쓰기가 다시 되면 지운다 */
  private rescued = false;
  private lsOk = true;
  /** init/dispose 세대. StrictMode 로 두 번 불려도 옛 init 의 남은 비동기가 끼어들지 않게 */
  private gen = 0;
  /** 이번 창에서 올리지 못하게 된(lost) 첨부 local- id */
  private lostMedia = new Set<string>();

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
    restoring: true,
    limit: false,
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

  /** 탭을 닫거나 숨길 때 모아 둔 쓰기를 바로 한다 */
  private onHide = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
    this.flushPersist();
  };

  constructor(
    private readonly userId: string,
    opts: SermonStoreOptions = {},
  ) {
    this.status.anonymous = userId === ANONYMOUS_USER;
    this.openDb = opts.noteDb ?? openNoteDb;
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
      pending: this.dirty.size + this.deleted.size + this.uploadsPendingCount(),
    };
    this.notify();
  }

  /** 아직 안 올린 녹음 토막 + 생각 첨부 */
  private uploadsPendingCount(): number {
    let n = 0;
    this.notes.forEach((note) => {
      n += audioPending(note, true) + mediaPending(note, true);
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
   * localStorage 저장분(예전 방식 또는 비상 사본)을 동기로 읽어 메모리에 합친다 — 첫 화면을 바로 그리기 위해.
   * 키가 있었으면 true.
   */
  private loadLocal(): boolean {
    try {
      localStorage.setItem('sermon-probe', '1');
      localStorage.removeItem('sermon-probe');
    } catch {
      this.lsOk = false;
      this.status.localOk = false;
    }
    const data = readLs(this.lsKey);
    if (!data) return false;
    this.mergeSnapshot(data, false);
    return true;
  }

  /**
   * 저장분을 메모리에 합친다. 같은 노트가 이미 있으면 더 나중에 고친 쪽을 둔다.
   * fromDb 면 IndexedDB 에 있는 것으로 기록해, 메모리와 다른 것만 다시 쓰고 메모리에 없는 것은 지운다.
   */
  private mergeSnapshot(data: Partial<PersistShape>, fromDb: boolean) {
    (data.deleted || []).forEach((id) => this.deleted.add(id));
    (data.notes || []).forEach((raw) => {
      if (!raw || !raw.id) return;
      const n = normalizeNote(raw.id, raw);
      const cur = this.notes.get(raw.id);
      const keep =
        !this.deleted.has(raw.id) && (!cur || (n.updated_at || 0) > (cur.updated_at || 0));
      if (keep) this.notes.set(raw.id, n);
      if (fromDb) this.written.set(raw.id, keep ? n : raw);
    });
    (data.dirty || []).forEach((id) => this.dirty.add(id));
    (data.synced || []).forEach(([id, at]) => {
      if (!this.synced.has(id)) this.synced.set(id, at);
    });
  }

  /**
   * 저장 방식을 정하고 기기 저장분을 읽는다.
   * IndexedDB 를 쓸 수 있으면 그 저장분을 합치고, localStorage 에 예전 저장분이 있었으면 옮긴 뒤 지운다.
   */
  private async restore(hadLs: boolean): Promise<void> {
    let db: NoteDb | null = null;
    try {
      db = await this.openDb();
    } catch {
      db = null;
    }
    if (db && this.backend !== 'idb') {
      try {
        const snap = await db.load(this.userId);
        if (snap) this.mergeSnapshot(snap, true);
        this.db = db;
        this.backend = 'idb';
      } catch (e) {
        console.warn('sermon: indexedDB load failed — localStorage 에 저장', e);
      }
    }
    if (this.backend === 'pending') this.backend = 'ls';
    this.status.localOk = this.backend === 'idb' || this.lsOk;
    const wanted = this.persistWanted;
    this.persistWanted = false;
    if (this.backend === 'idb') {
      // 예전 localStorage 저장분은 다 옮겨 쓴 뒤에만 지운다
      if ((await this.writeDb()) && hadLs) {
        try {
          localStorage.removeItem(this.lsKey);
        } catch {
          /* ignore */
        }
      }
    } else if (wanted) {
      this.persistLs();
    }
  }

  /**
   * 로그인 직후: 로그인 전에 이 기기에 적어 둔(익명) 노트를 이 계정으로 옮긴다.
   * 익명 노트는 전부 local- id 라 서버 문서로 새로 올라간다. 이 계정 저장소에 쓴 뒤에 익명 저장분을 비운다.
   */
  private async adoptAnonymous(): Promise<number> {
    if (this.anonymous || !this.status.localOk) return 0;
    const anonKey = SermonStore.keyFor(ANONYMOUS_USER);
    const fromLs = this.lsOk ? readLs(anonKey) : null;
    let fromDb: NoteSnapshot | null = null;
    if (this.db) {
      try {
        fromDb = await this.db.load(ANONYMOUS_USER);
      } catch (e) {
        console.warn('sermon: adopt anonymous (indexedDB) failed', e);
      }
    }
    if (!fromLs && !fromDb) return 0;
    let moved = 0;
    [fromLs, fromDb].forEach((data) =>
      (data?.notes || []).forEach((n) => {
        if (!n || !n.id || this.notes.has(n.id)) return;
        this.notes.set(n.id, normalizeNote(n.id, n));
        this.dirty.add(n.id);
        moved++;
      }),
    );
    try {
      adoptVersions(ANONYMOUS_USER, this.userId);
    } catch (e) {
      console.warn('sermon: adopt versions failed', e);
    }
    if (!(await this.persistNow())) return moved; // 계정 쪽에 못 썼으면 익명 저장분을 남겨 둔다
    if (fromLs) {
      try {
        localStorage.removeItem(anonKey);
      } catch {
        /* ignore */
      }
    }
    if (fromDb && this.db) {
      await this.db
        .clear(ANONYMOUS_USER)
        .catch((e) => console.warn('sermon: clear anonymous failed', e));
    }
    return moved;
  }

  private shape(): PersistShape {
    return {
      notes: [...this.notes.values()],
      dirty: [...this.dirty],
      deleted: [...this.deleted],
      synced: [...this.synced.entries()],
    };
  }

  /** 기기에 저장한다 — IndexedDB 는 잠깐 모아서(바뀐 노트만), localStorage 는 바로 통째로 */
  private persistLocal() {
    if (this.backend === 'pending') {
      this.persistWanted = true;
      return;
    }
    if (this.backend === 'ls') {
      this.persistLs();
      return;
    }
    if (this.writeTimer != null) return;
    this.writeTimer = window.setTimeout(() => {
      this.writeTimer = null;
      void this.writeDb();
    }, PERSIST_DELAY_MS);
  }

  /** 모아 둔 쓰기를 기다리지 않고 바로 한다 */
  private async persistNow(): Promise<boolean> {
    if (this.backend === 'ls') return this.persistLs();
    if (this.backend !== 'idb') return false;
    if (this.writeTimer != null) {
      window.clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    return this.writeDb();
  }

  private flushPersist() {
    if (this.backend !== 'idb' || this.writeTimer == null) return;
    void this.persistNow();
  }

  private setFull(full: boolean) {
    if (full === this.status.localFull) return;
    if (full) console.warn('sermon: local persist failed (storage full)');
    this.status = { ...this.status, localFull: full };
    this.notify();
  }

  /** localStorage 에 통째로 (IndexedDB 를 못 쓰는 기기) */
  private persistLs(): boolean {
    if (!this.lsOk) return false;
    const raw = JSON.stringify(this.shape());
    let ok = tryWrite(this.lsKey, raw);
    if (!ok) {
      // 용량 초과 — 버전 기록(본문 사본)부터 줄이고 한 번 더
      shrinkVersions(this.userId);
      ok = tryWrite(this.lsKey, raw);
    }
    this.setFull(!ok);
    return ok;
  }

  /** IndexedDB 에 바뀐 노트만 쓴다. 쓰는 중에 또 바뀌면 끝난 뒤 한 번 더 */
  private async writeDb(): Promise<boolean> {
    if (this.writing) {
      this.writeAgain = true;
      return this.writing;
    }
    const db = this.db;
    if (!db) return false;
    const put: SermonNote[] = [];
    const del: string[] = [];
    this.notes.forEach((n, id) => {
      if (this.written.get(id) !== n) put.push(n);
    });
    this.written.forEach((_, id) => {
      if (!this.notes.has(id)) del.push(id);
    });
    const meta = {
      dirty: [...this.dirty],
      deleted: [...this.deleted],
      synced: [...this.synced.entries()],
    };
    const run = (async () => {
      try {
        await db.write(this.userId, put, del, meta);
        put.forEach((n) => this.written.set(n.id, n));
        del.forEach((id) => this.written.delete(id));
        if (this.rescued) {
          // IndexedDB 가 다시 된다 — 비상 사본은 지운다 (남겨 두면 다음 init 이 옛 내용을 다시 합친다)
          this.rescued = false;
          try {
            localStorage.removeItem(this.lsKey);
          } catch {
            /* ignore */
          }
        }
        this.setFull(false);
        return true;
      } catch (e) {
        if (isQuotaError(e)) {
          this.setFull(true);
          return false;
        }
        // 공간 부족이 아닌 실패(연결 닫힘 등) — localStorage 에 비상 사본. 다음 init 이 IndexedDB 로 다시 옮긴다
        console.warn('sermon: indexedDB write failed', e);
        const ok = this.lsOk && tryWrite(this.lsKey, JSON.stringify(this.shape()));
        if (ok) this.rescued = true;
        this.setFull(!ok);
        return false;
      }
    })();
    this.writing = run;
    const ok = await run;
    this.writing = null;
    if (this.writeAgain) {
      this.writeAgain = false;
      this.persistLocal();
    }
    return ok;
  }

  // ───────── 수명 ─────────

  async init() {
    const gen = ++this.gen;
    const hadLs = this.loadLocal();
    requestPersistentStorage();
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onHide);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onHide);
    await this.restore(hadLs);
    if (gen !== this.gen) return;
    if (this.anonymous) {
      // 로그인 전: 서버 없음. 기기 저장이 곧 저장이다
      this.setStatus({ loading: false, online: null, restoring: false });
      return;
    }
    await this.adoptAnonymous();
    if (gen !== this.gen) return;
    this.setStatus({ loading: true, restoring: false });
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    void this.sweepMedia();
    await this.pull();
    if (gen !== this.gen) return;
    this.setStatus({ loading: false });
    void this.flush();
  }

  dispose() {
    this.gen++;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('pagehide', this.onHide);
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onHide);
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.flushPersist();
  }

  /** 생각에 붙지 않은 채 하루 넘게 남은 대기열 첨부(쓰다 만 생각 등)를 지운다 */
  private async sweepMedia() {
    try {
      const used = new Set<string>();
      this.notes.forEach((n) =>
        (n.thoughts || []).forEach((t) => (t.media || []).forEach((m) => used.add(m.id))),
      );
      const old = Date.now() - MEDIA_SWEEP_AGE_MS;
      for (const r of await sermonMediaQueue.list(this.userId)) {
        if (!used.has(r.id) && r.at < old) await sermonMediaQueue.remove(r.id);
      }
    } catch (e) {
      console.warn('sermon: media sweep failed', e);
    }
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
    const n = {
      ...this.keepUploadedMedia(this.keepUploadedAudio(note)),
      ...links,
      updated_at: Date.now(),
    };
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

  /**
   * 화면 사본의 `local-` 생각 첨부가 그 사이 올라갔거나(id·URL 바뀜) lost 가 됐으면 저장된 쪽을 따른다.
   * (편집기는 첨부를 붙일 때의 사본을 들고 있다)
   */
  private keepUploadedMedia(note: SermonNote): SermonNote {
    if (!note.thoughts?.length) return note;
    let changed = false;
    const thoughts = note.thoughts.map((t) => {
      if (!t.media?.length) return t;
      let hit = false;
      const media = t.media.map((m) => {
        if (!m || !isLocalId(m.id)) return m;
        const up = sermonMediaQueue.uploaded(m.id);
        if (up) {
          hit = true;
          return up;
        }
        if (this.lostMedia.has(m.id) && !m.lost) {
          hit = true;
          return { ...m, lost: true };
        }
        return m;
      });
      if (!hit) return t;
      changed = true;
      return { ...t, media };
    });
    return changed ? { ...note, thoughts } : note;
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
    (n?.thoughts || []).forEach((t) =>
      (t.media || []).forEach((m) => {
        if (m && isLocalId(m.id)) void sermonMediaQueue.remove(m.id).catch(() => {});
      }),
    );
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

  /** 문서 수 한도(PF004) 뒤 — 30분 뒤에 한 번 더 */
  private scheduleLimitRetry() {
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(
      () => void this.flush(),
      Math.max(1000, this.limitUntil - Date.now()),
    );
  }

  async flush() {
    if (this.anonymous) {
      this.setStatus({});
      return;
    }
    if (this.status.restoring) return; // 기기 저장분을 다 읽은 뒤에 (init 이 부른다)
    if (
      !this.needPull &&
      this.dirty.size === 0 &&
      this.deleted.size === 0 &&
      this.uploadsPendingCount() === 0
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
      /** 한도에 닿아 이번에 못 만든 새 노트가 있다 */
      let limited = false;
      for (const id of [...this.dirty]) {
        const n = this.notes.get(id);
        if (!n) {
          this.dirty.delete(id);
          continue;
        }
        const stamp = n.updated_at;
        try {
          if (isLocalId(id)) {
            if (Date.now() < this.limitUntil) {
              limited = true;
              continue;
            }
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
        } catch (e) {
          if (!isLimit(e)) throw e;
          // 서버 보관 한도 — 새 문서는 이 기기에만 두고, 있던 문서 수정·삭제·녹음은 계속 올린다
          if (!limited) console.warn('sermon: doc limit reached (PF004) — kept on this device');
          limited = true;
          this.limitUntil = Date.now() + LIMIT_RETRY_MS;
        }
      }
      for (const id of [...this.deleted]) {
        try {
          await withTimeout(personalFeatureAPI.deleteDoc(SERMON_FEATURE_KEY, id));
        } catch (e) {
          if (!isNotFound(e)) throw e;
        }
        this.deleted.delete(id);
        // 자리가 났다 — 한도로 못 만든 노트를 바로 다시 올려 본다
        if (this.limitUntil) {
          this.limitUntil = 0;
          if (limited) this.again = true;
        }
      }
      await this.flushAudio();
      await this.flushMedia();
      this.backoff = BACKOFF_MIN;
      this.setStatus({ online: true, slow: false, lastSync: Date.now(), limit: limited });
      if (limited && !this.again) this.scheduleLimitRetry();
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
        // 다른 기기에서 녹음한 토막은 그 기기가 올린다 — 여기서 lost 로 적으면 그 기기도 올리지 않게 된다
        if (madeOnThisDevice(seg.id)) {
          segments.push({ ...seg, lost: true });
          changed = true;
        } else {
          segments.push(seg);
        }
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
        if (!meta && !madeOnThisDevice(seg.id)) continue; // 다른 기기 토막 — 그 기기가 올린다
        const latest = this.notes.get(note.id);
        if (!latest?.audio) break;
        const patchSeg = (p: Partial<typeof seg>) => {
          const now = this.notes.get(note.id);
          if (!now?.audio) return;
          const segments = now.audio.segments.map((x) => (x.id === seg.id ? { ...x, ...p } : x));
          this.notes.set(note.id, { ...now, audio: { segments }, updated_at: Date.now() });
          this.dirty.add(note.id);
          this.again = true; // 바뀐 토막 id 를 서버 문서에도 반영
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
  }

  // ───────── 생각 첨부 ─────────

  /** 노트 안의 첨부 하나를 바꾸고 서버 문서에도 반영하도록 표시한다 */
  private patchMedia(noteId: string, localId: string, next: ThoughtMedia) {
    const now = this.notes.get(noteId);
    if (!now) return;
    const thoughts = (now.thoughts || []).map((t) =>
      (t.media || []).some((m) => m?.id === localId)
        ? { ...t, media: t.media.map((m) => (m?.id === localId ? next : m)) }
        : t,
    );
    this.notes.set(noteId, { ...now, thoughts, updated_at: Date.now() });
    this.dirty.add(noteId);
    this.again = true;
    this.persistLocal();
    this.setStatus({});
  }

  /** 오프라인에 붙인 `local-` 첨부를 내 스토리지로 올리고 생각의 첨부 id·URL 을 바꾼다 */
  private async flushMedia(): Promise<void> {
    for (const note of [...this.notes.values()]) {
      if (!mediaPending(note)) continue;
      if (isLocalId(note.id)) continue; // 노트가 먼저 올라가야 한다 (다음 flush 에서)
      const waiting: ThoughtMedia[] = [];
      (note.thoughts || []).forEach((t) =>
        (t.media || []).forEach((m) => {
          if (m && isLocalId(m.id) && !m.lost) waiting.push(m);
        }),
      );
      for (const m of waiting) {
        const done = sermonMediaQueue.uploaded(m.id);
        if (done) {
          this.patchMedia(note.id, m.id, done);
          continue;
        }
        const q = await sermonMediaQueue.get(m.id);
        if (!q || !q.blob?.size) {
          if (!madeOnThisDevice(m.id)) continue; // 다른 기기에서 붙인 첨부 — 그 기기가 올린다
          // 이 기기에서 붙였는데 파일이 없다 (저장소가 지워짐)
          this.lostMedia.add(m.id);
          this.patchMedia(note.id, m.id, { ...m, lost: true });
          continue;
        }
        try {
          const ext = q.type === 'image' ? 'jpg' : 'mp4';
          const file = new File([q.blob], q.name || `sermon.${ext}`, { type: q.mime });
          const up = await uploadPreparedMedia(file, q.type);
          sermonMediaQueue.markUploaded(m.id, up);
          this.patchMedia(note.id, m.id, up);
          // 열린 편집기가 아직 blob: 주소로 보여 주고 있을 수 있어 주소는 남긴다
          await sermonMediaQueue.remove(m.id, true);
        } catch (e) {
          if (e instanceof MediaUploadError && (e.code === 'rejected' || e.code === 'too_large')) {
            // 다시 보내도 안 된다 — lost 로 두고 파일은 이 기기에서 계속 볼 수 있게 남긴다
            console.warn('sermon: media rejected, marked lost', m.id, e.code);
            this.lostMedia.add(m.id);
            this.patchMedia(note.id, m.id, { ...m, lost: true });
            continue;
          }
          throw e;
        }
      }
    }
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

function readLs(key: string): Partial<PersistShape> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistShape>;
  } catch (e) {
    console.error('sermon: local load failed', e);
    return null;
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
  if (s.limit) {
    return { text: '노트 보관 한도에 닿았어요 · 이 기기에만 저장돼요', state: 'warn' };
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
  if (s.loading || s.restoring) return { text: '불러오는 중…', state: 'wait' };
  return { text: '모두 저장됨', state: 'ok' };
}
