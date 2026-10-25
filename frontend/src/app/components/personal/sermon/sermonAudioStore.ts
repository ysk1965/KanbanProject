/**
 * 설교 녹음 조각 저장소 — IndexedDB.
 *
 * MediaRecorder 가 10초마다 내놓는 Blob 을 바로 여기에 쌓는다. 메모리에 들고 있지 않으므로
 * 새로고침·탭 종료·iOS 백그라운드로 녹음이 죽어도 그때까지의 조각은 남는다.
 * 업로드가 끝나면 그 조각(segment)을 지운다.
 *
 * - segments: seg id 로 키. note 필드로 노트별 조회. (노트 id 가 local- → 서버 id 로 바뀌면 note 필드만 고친다)
 * - chunks:   `${seg}/${seq(6자리)}` 로 키. seg 로 범위 조회.
 *
 * IndexedDB 를 못 쓰는 환경(프라이빗 창 일부, 테스트)에서는 메모리 Map 으로 동작한다.
 */

const DB_NAME = 'sermon-audio';
const DB_VER = 1;
const ST_SEG = 'segments';
const ST_CHUNK = 'chunks';

export interface AudioSegmentMeta {
  /** 세그먼트 id (uid('a')) — 노트 JSON 의 segment.id 와 같다 */
  seg: string;
  note: string;
  mime: string;
  /** 시작할 때의 설교 타이머 경과 초 */
  offset: number;
  startedAt: number;
  /** 마지막 조각을 받을 때의 경과 초 — 비정상 종료 복구용 길이 */
  elapsedAt: number;
  bytes: number;
  done: boolean;
}

type ChunkRow = { key: string; seg: string; blob: Blob };

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** 메모리 폴백 */
const memSeg = new Map<string, AudioSegmentMeta>();
const memChunk = new Map<string, ChunkRow>();

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
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
      if (!db.objectStoreNames.contains(ST_SEG)) {
        const s = db.createObjectStore(ST_SEG, { keyPath: 'seg' });
        s.createIndex('note', 'note', { unique: false });
      }
      if (!db.objectStoreNames.contains(ST_CHUNK)) {
        const c = db.createObjectStore(ST_CHUNK, { keyPath: 'key' });
        c.createIndex('seg', 'seg', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => {
      console.warn('sermon-audio: indexedDB open failed', req.error);
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

function chunkKey(seg: string, seq: number) {
  return `${seg}/${String(seq).padStart(6, '0')}`;
}

export const sermonAudioStore = {
  /** 사용 가능 여부(실제로 열어 본 결과). 메모리 폴백이면 false */
  async persistent(): Promise<boolean> {
    return !!(await openDb());
  },

  async putSegment(meta: AudioSegmentMeta): Promise<void> {
    const db = await openDb();
    if (!db) {
      memSeg.set(meta.seg, { ...meta });
      return;
    }
    const tx = db.transaction(ST_SEG, 'readwrite');
    tx.objectStore(ST_SEG).put(meta);
    await txDone(tx);
  },

  async getSegment(seg: string): Promise<AudioSegmentMeta | null> {
    const db = await openDb();
    if (!db) return memSeg.get(seg) ?? null;
    const tx = db.transaction(ST_SEG, 'readonly');
    const r = await reqAsync(tx.objectStore(ST_SEG).get(seg) as IDBRequest<AudioSegmentMeta>);
    return r ?? null;
  },

  async listSegments(note: string): Promise<AudioSegmentMeta[]> {
    const db = await openDb();
    if (!db) return [...memSeg.values()].filter((s) => s.note === note);
    const tx = db.transaction(ST_SEG, 'readonly');
    const r = await reqAsync(
      tx.objectStore(ST_SEG).index('note').getAll(note) as IDBRequest<AudioSegmentMeta[]>,
    );
    return r ?? [];
  },

  async putChunk(seg: string, seq: number, blob: Blob): Promise<void> {
    const db = await openDb();
    const row: ChunkRow = { key: chunkKey(seg, seq), seg, blob };
    if (!db) {
      memChunk.set(row.key, row);
      return;
    }
    const tx = db.transaction(ST_CHUNK, 'readwrite');
    tx.objectStore(ST_CHUNK).put(row);
    await txDone(tx);
  },

  /** 조각을 순서대로 합쳐 하나의 Blob 으로. 조각이 없으면 null */
  async assemble(seg: string, mime: string): Promise<Blob | null> {
    const db = await openDb();
    let blobs: Blob[];
    if (!db) {
      blobs = [...memChunk.values()]
        .filter((c) => c.seg === seg)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((c) => c.blob);
    } else {
      const tx = db.transaction(ST_CHUNK, 'readonly');
      const rows = await reqAsync(
        tx.objectStore(ST_CHUNK).index('seg').getAll(seg) as IDBRequest<ChunkRow[]>,
      );
      blobs = (rows ?? []).sort((a, b) => a.key.localeCompare(b.key)).map((c) => c.blob);
    }
    if (!blobs.length) return null;
    return new Blob(blobs, { type: mime });
  },

  async removeSegment(seg: string): Promise<void> {
    const db = await openDb();
    if (!db) {
      memSeg.delete(seg);
      [...memChunk.keys()].forEach((k) => {
        if (k.startsWith(`${seg}/`)) memChunk.delete(k);
      });
      return;
    }
    const tx = db.transaction([ST_SEG, ST_CHUNK], 'readwrite');
    tx.objectStore(ST_SEG).delete(seg);
    const idx = tx.objectStore(ST_CHUNK).index('seg');
    const keys = await reqAsync(idx.getAllKeys(seg) as IDBRequest<IDBValidKey[]>);
    (keys ?? []).forEach((k) => tx.objectStore(ST_CHUNK).delete(k));
    await txDone(tx);
  },

  async removeNote(note: string): Promise<void> {
    const segs = await this.listSegments(note);
    for (const s of segs) await this.removeSegment(s.seg);
  },

  /** 노트 id 가 바뀌었을 때(local- → 서버 id) 세그먼트의 note 필드를 옮긴다 */
  async renameNote(from: string, to: string): Promise<void> {
    const segs = await this.listSegments(from);
    for (const s of segs) await this.putSegment({ ...s, note: to });
  },

  /** 기기에 남아 있는(아직 안 올린) 녹음 전체 바이트 */
  async usageBytes(): Promise<number> {
    const db = await openDb();
    if (!db) return [...memSeg.values()].reduce((a, s) => a + s.bytes, 0);
    const tx = db.transaction(ST_SEG, 'readonly');
    const all = await reqAsync(tx.objectStore(ST_SEG).getAll() as IDBRequest<AudioSegmentMeta[]>);
    return (all ?? []).reduce((a, s) => a + (s.bytes || 0), 0);
  },
};
