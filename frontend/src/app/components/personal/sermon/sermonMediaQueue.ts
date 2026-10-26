import { localFileId, type ThoughtMedia } from './sermonTypes';

/**
 * 올리지 못한 생각 첨부(사진·영상) 대기열 — IndexedDB `sermon-media`.
 *
 * 오프라인이거나 연결이 끊겨 바로 올리지 못한 첨부는 파일을 여기에 두고, 생각에는 `local-` id 와
 * 이 기기 안에서만 보이는 blob: 주소로 붙인다. 저장소(SermonStore)의 flush 가 노트를 올린 뒤
 * 이 파일을 내 스토리지로 올리고 생각의 id·URL 을 바꾼다. (녹음 sermonAudioStore 와 같은 방식)
 *
 * - files: id(= 생각 첨부의 local- id)로 키. 행 = { id, owner, type, name, mime, blob, at }
 *
 * 새로고침하면 blob: 주소가 사라지므로, 화면은 local- 첨부를 resolveUrl() 로 다시 만든다.
 * IndexedDB 를 못 쓰는 환경이면 메모리 Map 으로 동작한다 (창을 닫으면 사라져 flush 에서 lost 처리).
 */

const DB_NAME = 'sermon-media';
const DB_VER = 1;
const ST_FILES = 'files';

export interface QueuedMedia {
  id: string;
  /** 첨부한 계정 — 기기에 계정이 여럿이어도 남의 대기열을 지우지 않게 */
  owner: string;
  type: 'image' | 'video';
  name: string;
  mime: string;
  blob: Blob;
  at: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const mem = new Map<string, QueuedMedia>();
/** id → blob: 주소 (이 창 안에서만 유효) */
const urls = new Map<string, string>();
/** 이번 창에서 올린 local- id → 서버 첨부. 편집기가 들고 있던 옛 사본을 고칠 때 쓴다 */
const uploadedMap = new Map<string, ThoughtMedia>();

function openDb(): Promise<IDBDatabase | null> {
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
      if (!db.objectStoreNames.contains(ST_FILES)) {
        const s = db.createObjectStore(ST_FILES, { keyPath: 'id' });
        s.createIndex('owner', 'owner', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      console.warn('sermon-media: indexedDB open failed', req.error);
      resolve(null);
    };
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
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

function makeUrl(blob: Blob): string {
  try {
    return URL.createObjectURL(blob);
  } catch {
    return '';
  }
}

export const sermonMediaQueue = {
  /** 파일을 대기열에 넣고, 생각에 바로 붙일 첨부(local- id + blob: 주소)를 돌려준다 */
  async put(
    owner: string,
    file: Blob,
    type: 'image' | 'video',
    name: string,
  ): Promise<ThoughtMedia> {
    const row: QueuedMedia = {
      id: localFileId('m'),
      owner,
      type,
      name,
      mime: file.type || (type === 'image' ? 'image/jpeg' : 'video/mp4'),
      blob: file,
      at: Date.now(),
    };
    const db = await openDb();
    if (!db) mem.set(row.id, row);
    else {
      const tx = db.transaction(ST_FILES, 'readwrite');
      tx.objectStore(ST_FILES).put(row);
      await txDone(tx);
    }
    const url = makeUrl(file);
    if (url) urls.set(row.id, url);
    return { id: row.id, type, url, thumb: null };
  },

  async get(id: string): Promise<QueuedMedia | null> {
    const db = await openDb();
    if (!db) return mem.get(id) ?? null;
    const tx = db.transaction(ST_FILES, 'readonly');
    const r = await reqAsync(tx.objectStore(ST_FILES).get(id) as IDBRequest<QueuedMedia>);
    return r ?? null;
  },

  /**
   * 대기열에서 뺀다. keepUrl 이면 blob: 주소는 남긴다 — 올린 직후에도 열린 편집기가 그 주소로 보여 주고 있다.
   */
  async remove(id: string, keepUrl = false): Promise<void> {
    if (!keepUrl) {
      const u = urls.get(id);
      if (u) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
        urls.delete(id);
      }
    }
    const db = await openDb();
    if (!db) {
      mem.delete(id);
      return;
    }
    const tx = db.transaction(ST_FILES, 'readwrite');
    tx.objectStore(ST_FILES).delete(id);
    await txDone(tx);
  },

  /** 그 계정의 대기열 (id·시각만) */
  async list(owner: string): Promise<Array<Pick<QueuedMedia, 'id' | 'at'>>> {
    const db = await openDb();
    if (!db) {
      return [...mem.values()].filter((m) => m.owner === owner).map(({ id, at }) => ({ id, at }));
    }
    const tx = db.transaction(ST_FILES, 'readonly');
    const rows = await reqAsync(
      tx.objectStore(ST_FILES).index('owner').getAll(owner) as IDBRequest<QueuedMedia[]>,
    );
    return (rows || []).map(({ id, at }) => ({ id, at }));
  },

  /** 이 창에서 이미 만든 blob: 주소 */
  urlFor(id: string): string | null {
    return urls.get(id) ?? null;
  },

  /** 새로고침 뒤: 기기에 남은 파일로 blob: 주소를 다시 만든다. 파일이 없으면 null */
  async resolveUrl(id: string): Promise<string | null> {
    const have = urls.get(id);
    if (have) return have;
    const row = await this.get(id).catch(() => null);
    if (!row) return null;
    const again = urls.get(id); // 기다리는 사이 다른 화면이 만들었을 수 있다
    if (again) return again;
    const url = makeUrl(row.blob);
    if (url) urls.set(id, url);
    return url || null;
  },

  markUploaded(localId: string, media: ThoughtMedia) {
    uploadedMap.set(localId, media);
  },

  /** 이번 창에서 올라간 local- 첨부의 서버 쪽 */
  uploaded(localId: string): ThoughtMedia | undefined {
    return uploadedMap.get(localId);
  },
};
