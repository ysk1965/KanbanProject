import { useEffect, useState } from 'react';
import { setVerseCounts, type Ref } from './bibleRefs';

/**
 * 개역한글 본문 로더.
 * 데이터: public/bible/krv.json — string[권][장-1][절-1], 66권 31,103절 (약 4.4MB, gzip 1.2MB).
 * 출처: thiagobodruk/bible ko_krv. 한 번 받으면 모듈 메모리에 두고, 서비스 워커가 CacheFirst 로 보관한다.
 */
export type BibleData = string[][][];

export const BIBLE_URL = '/bible/krv.json';

let cache: BibleData | null = null;
let pending: Promise<BibleData | null> | null = null;
const listeners = new Set<() => void>();

/* ───── IndexedDB 보관 — iOS 가 7일 미사용 시 서비스 워커 캐시를 비워도 본문은 남는다 ───── */
const IDB_NAME = 'sermon-bible';
const IDB_STORE = 'books';
const IDB_KEY = 'krv';

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(): Promise<BibleData | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () =>
        resolve(
          Array.isArray(req.result) && req.result.length === 66 ? (req.result as BibleData) : null,
        );
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(data: BibleData) {
  const db = await openIdb();
  if (!db) return;
  try {
    db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(data, IDB_KEY);
  } catch {
    /* 용량 부족 등 — 다음에 다시 받으면 된다 */
  }
}

/** 이 기기에 본문을 받아 두었나 — 오프라인에서 성경을 읽을 수 있는지. 4.4MB 를 읽지 않고 키만 센다 */
export async function hasStoredBible(): Promise<boolean> {
  if (cache) return true;
  const db = await openIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).count(IDB_KEY);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export function getBible(): BibleData | null {
  return cache;
}

function adopt(d: BibleData): BibleData {
  cache = d;
  setVerseCounts(d.map((b) => b.map((c) => c.length)));
  listeners.forEach((fn) => fn());
  return d;
}

/** IndexedDB → 네트워크(서비스 워커 캐시 포함) 순서로 받는다 */
export function loadBible(): Promise<BibleData | null> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = (async () => {
    const stored = await idbGet();
    if (stored) return adopt(stored);
    try {
      const r = await fetch(BIBLE_URL);
      if (!r.ok) throw new Error(`bible ${r.status}`);
      const d = (await r.json()) as BibleData;
      void idbPut(d);
      return adopt(d);
    } catch (e) {
      console.error('Failed to load bible data:', e);
      pending = null;
      return null;
    }
  })();
  return pending;
}

/** 성경 데이터가 준비되면 리렌더. 반환값은 데이터(없으면 null)와 실패 여부. */
export function useBible(): { bible: BibleData | null; failed: boolean } {
  const [bible, setBible] = useState<BibleData | null>(cache);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (cache) {
      setBible(cache);
      return;
    }
    let alive = true;
    const onReady = () => alive && setBible(cache);
    listeners.add(onReady);
    loadBible().then((d) => {
      if (!alive) return;
      if (!d) setFailed(true);
    });
    return () => {
      alive = false;
      listeners.delete(onReady);
    };
  }, []);
  return { bible, failed };
}

/** [절 번호, 본문] 목록. 데이터 전이면 null. */
export function verses(r: Ref): Array<[number, string]> | null {
  if (!cache) return null;
  const ch = cache[r.b]?.[r.c - 1];
  if (!ch) return [];
  const out: Array<[number, string]> = [];
  for (let v = r.v1; v <= Math.min(r.v2, ch.length); v++) out.push([v, ch[v - 1]]);
  return out;
}

export function firstVerseText(r: Ref): string {
  const vs = verses(r);
  return vs && vs[0] ? vs[0][1] : '';
}
