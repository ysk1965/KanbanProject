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

export function getBible(): BibleData | null {
  return cache;
}

export function loadBible(): Promise<BibleData | null> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetch(BIBLE_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`bible ${r.status}`);
      return r.json() as Promise<BibleData>;
    })
    .then((d) => {
      cache = d;
      setVerseCounts(d.map((b) => b.map((c) => c.length)));
      listeners.forEach((fn) => fn());
      return d;
    })
    .catch((e) => {
      console.error('Failed to load bible data:', e);
      pending = null;
      return null;
    });
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
