import type { SermonNote } from './sermonTypes';

/**
 * 설교 노트 기기 저장소 — IndexedDB.
 *
 * localStorage(약 5MB)는 노트가 수천 편이면 넘친다. 노트는 한 편씩 행으로 나눠 IndexedDB 에 둔다.
 * 바뀐 노트만 다시 쓰므로 수천 편이어도 한 번 저장이 가볍다.
 *
 * - DB `sermon-notes` (v1)
 * - notes: [u, id] 로 키. u 인덱스로 사용자별 조회. 행 = { u, id, note }
 * - meta:  u 로 키. 행 = { u, dirty, deleted, synced } (올릴 목록·지울 목록·서버 updated_at)
 *
 * IndexedDB 를 못 쓰는 환경(프라이빗 창 일부, 테스트)이면 openNoteDb() 가 null 을 주고,
 * 저장소(SermonStore)는 예전처럼 localStorage 에 쓴다. 테스트는 memoryNoteDb() 를 넣는다.
 */

export interface NoteMeta {
  dirty: string[];
  deleted: string[];
  synced: Array<[string, string]>;
}

export interface NoteSnapshot extends NoteMeta {
  notes: SermonNote[];
}

export interface NoteDb {
  /** 그 사용자의 저장분. 아무것도 없으면 null */
  load(user: string): Promise<NoteSnapshot | null>;
  /** 바뀐 노트(put)·없어진 노트(del)·목록(meta)을 한 트랜잭션으로 쓴다 */
  write(user: string, put: SermonNote[], del: string[], meta: NoteMeta): Promise<void>;
  /** 그 사용자의 저장분을 모두 지운다 (익명 노트를 계정으로 옮긴 뒤) */
  clear(user: string): Promise<void>;
}

const DB_NAME = 'sermon-notes';
const DB_VER = 1;
const ST_NOTES = 'notes';
const ST_META = 'meta';

type NoteRow = { u: string; id: string; note: SermonNote };
type MetaRow = NoteMeta & { u: string };

/** 기기 공간이 차서 못 쓴 경우 (Safari 는 code 22, Firefox 는 NS_ERROR_DOM_QUOTA_REACHED) */
export function isQuotaError(e: unknown): boolean {
  const x = e as { name?: string; code?: number } | null;
  if (!x) return false;
  return (
    x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED' || x.code === 22
  );
}

function reqAsync<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openRaw(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VER);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ST_NOTES)) {
        const s = db.createObjectStore(ST_NOTES, { keyPath: ['u', 'id'] });
        s.createIndex('u', 'u', { unique: false });
      }
      if (!db.objectStoreNames.contains(ST_META)) {
        db.createObjectStore(ST_META, { keyPath: 'u' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      // 브라우저가 연결을 닫으면(저장 공간 정리 등) 다음 호출에서 다시 연다
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      console.warn('sermon-notes: indexedDB open failed', req.error);
      dbPromise = null;
      resolve(null);
    };
    req.onblocked = () => {
      dbPromise = null;
      resolve(null);
    };
  });
  return dbPromise;
}

const idbNoteDb: NoteDb = {
  async load(user) {
    const db = await openRaw();
    if (!db) throw new Error('sermon-notes: db closed');
    const tx = db.transaction([ST_NOTES, ST_META], 'readonly');
    const [rows, meta] = await Promise.all([
      reqAsync(tx.objectStore(ST_NOTES).index('u').getAll(user) as IDBRequest<NoteRow[]>),
      reqAsync(tx.objectStore(ST_META).get(user) as IDBRequest<MetaRow | undefined>),
    ]);
    if (!meta && !rows?.length) return null;
    return {
      notes: (rows || []).map((r) => r.note),
      dirty: meta?.dirty || [],
      deleted: meta?.deleted || [],
      synced: meta?.synced || [],
    };
  },

  async write(user, put, del, meta) {
    const db = await openRaw();
    if (!db) throw new Error('sermon-notes: db closed');
    const tx = db.transaction([ST_NOTES, ST_META], 'readwrite');
    const notes = tx.objectStore(ST_NOTES);
    put.forEach((note) => notes.put({ u: user, id: note.id, note } satisfies NoteRow));
    del.forEach((id) => notes.delete([user, id]));
    tx.objectStore(ST_META).put({ u: user, ...meta } satisfies MetaRow);
    await txDone(tx);
  },

  async clear(user) {
    const db = await openRaw();
    if (!db) return;
    const tx = db.transaction([ST_NOTES, ST_META], 'readwrite');
    const notes = tx.objectStore(ST_NOTES);
    const keys = await reqAsync(notes.index('u').getAllKeys(user) as IDBRequest<IDBValidKey[]>);
    (keys || []).forEach((k) => notes.delete(k));
    tx.objectStore(ST_META).delete(user);
    await txDone(tx);
  },
};

/** 이 기기의 노트 IndexedDB. 쓸 수 없으면 null (→ localStorage) */
export async function openNoteDb(): Promise<NoteDb | null> {
  return (await openRaw()) ? idbNoteDb : null;
}

/** 테스트용 메모리 구현. fail 로 다음 쓰기를 실패시킬 수 있다 */
export function memoryNoteDb(): NoteDb & {
  rows: Map<string, Map<string, SermonNote>>;
  meta: Map<string, NoteMeta>;
  writes: number;
  fail: unknown;
} {
  const rows = new Map<string, Map<string, SermonNote>>();
  const meta = new Map<string, NoteMeta>();
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const self = {
    rows,
    meta,
    writes: 0,
    fail: null as unknown,
    async load(user: string) {
      const r = rows.get(user);
      const m = meta.get(user);
      if (!m && !r?.size) return null;
      return {
        notes: [...(r?.values() || [])].map(clone),
        dirty: [...(m?.dirty || [])],
        deleted: [...(m?.deleted || [])],
        synced: (m?.synced || []).map(([a, b]) => [a, b] as [string, string]),
      };
    },
    async write(user: string, put: SermonNote[], del: string[], m: NoteMeta) {
      if (self.fail) {
        const e = self.fail;
        self.fail = null;
        throw e;
      }
      self.writes++;
      const r = rows.get(user) ?? new Map<string, SermonNote>();
      put.forEach((n) => r.set(n.id, clone(n)));
      del.forEach((id) => r.delete(id));
      rows.set(user, r);
      meta.set(user, clone(m));
    },
    async clear(user: string) {
      rows.delete(user);
      meta.delete(user);
    },
  };
  return self;
}
