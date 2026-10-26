import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ANONYMOUS_USER } from '../sermonStore';
import type { SermonNote } from '../sermonTypes';
import { useBible, type BibleData } from '../useBible';
import {
  challengeAPI,
  challengeErrorCode,
  type PilsaVerseBody,
  type PilsaWeek,
} from './challengeApi';
import { challengeStoreFor } from './challengeStore';
import {
  chapterDone,
  doneCount,
  nextChapter as nextOf,
  pickChapters,
  pilsaSource,
  pilsaWeekKey,
  unionDone,
  verseCountFrom,
  weekDone,
  type PilsaChapter,
  type PilsaPlan,
} from './pilsaPlan';

export type { PilsaChapter, PilsaPlan, PilsaReason } from './pilsaPlan';

/**
 * 「이번 주 말씀 필사」 저장소 (사용자마다 하나 — 홈 카드와 필사 화면이 같은 것을 본다).
 * - 기기 먼저: localStorage `sermon-pilsa-v1:<userId>` 에 계획·쓴 절·못 보낸 절을 둔다
 * - 익명(로그인 전)은 서버를 부르지 않고 달란트도 없다 (연습 판)
 * - 로그인: GET week → 서버에 장이 있으면 그것(쓴 절은 합침), 비었으면 기기에서 고른 계획을 PUT (서버가 돌려준 것을 따른다)
 * - 한 주 계획은 한 번 정하면 그 주 안에는 노트가 바뀌어도 바꾸지 않는다
 * - 절 전송이 끊기면 큐에 남겨 4초→60초 간격으로 다시 보낸다. PIL001~PIL004 는 버린다
 */

export interface PilsaMarkResult {
  chapterDone: boolean;
  weekDone: boolean;
  awarded: number;
}

type Listener = () => void;

interface Persist {
  plan: PilsaPlan | null;
  queue: PilsaVerseBody[];
}

const BACKOFF_MIN = 4000;
const BACKOFF_MAX = 60000;

/** 다시 보내도 소용없는 실패 (이번 주 아님·계획에 없음·범위 밖·너무 빠름) */
function isFinal(e: unknown): boolean {
  const code = challengeErrorCode(e);
  if (code && /^PIL\d/.test(code)) return true;
  const st = (e as { status?: number } | null)?.status;
  return st === 400 || st === 422;
}

/**
 * 아직 임시인 계획 — 노트에서 고르지 못해 공통 일곱 장을 골랐고, 한 절도 안 썼고, 서버에도 안 올렸다.
 * 노트가 늦게 들어오면(새 기기 첫 동기화 등) 설교에서 다시 고르고, 이 상태로는 서버에 고정(PUT)하지 않는다.
 */
function provisional(p: PilsaPlan): boolean {
  return !p.synced && p.chapters.every((c) => c.reason === 'common' && c.done.length === 0);
}

function fromServer(w: PilsaWeek, local: PilsaPlan | null): PilsaPlan {
  const chapters: PilsaChapter[] = (w.chapters || []).map((s) => {
    const mine = local?.chapters.find((x) => x.b === s.b && x.c === s.c);
    return {
      b: s.b,
      c: s.c,
      reason: s.reason,
      verses: s.verses,
      done: unionDone(s.done, local && local.week === w.week ? mine?.done : undefined, s.verses),
    };
  });
  return { week: w.week, chapters, synced: true };
}

export class PilsaStore {
  plan: PilsaPlan | null = null;
  private queue: PilsaVerseBody[] = [];
  private listeners = new Set<Listener>();
  private inflight: Promise<void> | null = null;
  /** 이번 세션에 서버 계획을 한 번 받았는지 (다른 기기에서 쓴 절 합치기) */
  private fetched = false;
  /** 서버 주 키 (기기 시계와 다를 때 서버를 따른다) */
  private serverWeek: string | null = null;
  private backoff = BACKOFF_MIN;
  private retryTimer: number | null = null;
  private lastFailAt = 0;

  constructor(
    readonly userId: string,
    readonly anonymous: boolean,
  ) {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persist>;
        if (p.plan && Array.isArray(p.plan.chapters)) this.plan = p.plan;
        if (Array.isArray(p.queue)) this.queue = p.queue;
      }
    } catch {
      /* ignore */
    }
  }

  private get key() {
    return `sermon-pilsa-v1:${this.userId}`;
  }

  private get offline() {
    return this.anonymous || this.userId === ANONYMOUS_USER;
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getPlan = () => this.plan;

  private persist() {
    try {
      const p: Persist = { plan: this.plan, queue: this.offline ? [] : this.queue };
      localStorage.setItem(this.key, JSON.stringify(p));
    } catch {
      /* 저장 공간 없음 — 세션 동안만 */
    }
  }

  private emit() {
    this.persist();
    this.listeners.forEach((f) => f());
  }

  private setPlan(p: PilsaPlan | null) {
    this.plan = p;
    this.emit();
  }

  /** 화면이 그려질 때마다 — 주가 바뀌었으면 비우고, 계획이 없으면 고르고, 서버와 맞춘다 */
  ensure(notes: SermonNote[], bible: BibleData | null) {
    const local = pilsaWeekKey();
    if (this.serverWeek && this.serverWeek < local) this.serverWeek = null;
    if (this.plan && this.plan.week < local && this.plan.week !== this.serverWeek) {
      // 한 주가 지났다 — 지난 주 계획과 못 보낸 절은 버린다 (서버도 PIL001 로 거절)
      this.queue = [];
      this.fetched = false;
      this.setPlan(null);
    }
    const src = bible ? pilsaSource(notes) : null;
    if (this.plan && src && provisional(this.plan)) this.plan = null; // 설교가 들어왔다 — 다시 고른다
    if (!this.plan && bible) {
      const chapters = pickChapters({
        main: src?.main ?? null,
        cited: src?.cited ?? [],
        week: this.serverWeek || pilsaWeekKey(),
        verseCount: verseCountFrom(bible),
      });
      if (chapters.length) {
        this.setPlan({
          week: this.serverWeek || pilsaWeekKey(),
          chapters: chapters.map((c) => ({ ...c, done: [] })),
          synced: false,
        });
      }
    }
    if (!this.offline && (!this.plan?.synced || !this.fetched || this.queue.length)) {
      if (!this.lastFailAt || Date.now() - this.lastFailAt >= this.backoff) void this.sync();
    }
  }

  /** 서버와 맞추기 (동시 호출은 한 번) */
  sync(): Promise<void> {
    if (this.offline) return Promise.resolve();
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        if (!this.plan?.synced || !this.fetched) {
          let w = await challengeAPI.pilsaWeek();
          if (w?.week) this.serverWeek = w.week;
          if (!w?.chapters?.length) {
            // 성경 데이터가 오면 고른 뒤 다시 부른다 · 임시 계획은 첫 절을 쓸 때 올린다
            if (!this.plan || provisional(this.plan)) return;
            w = await challengeAPI.putPilsaWeek({
              week: w?.week || this.plan.week,
              chapters: this.plan.chapters.map(({ b, c, reason, verses }) => ({
                b,
                c,
                reason,
                verses,
              })),
            });
          }
          if (w?.chapters?.length) {
            this.fetched = true;
            this.adoptServer(w);
          }
        }
        await this.flushQueue();
        this.backoff = BACKOFF_MIN;
        this.lastFailAt = 0;
      } catch {
        this.lastFailAt = Date.now();
        this.scheduleRetry();
      }
    })().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private adoptServer(w: PilsaWeek) {
    const next = fromServer(w, this.plan);
    // 다른 주 계획으로 쌓인 큐는 버린다
    this.queue = this.queue.filter((q) => q.week === next.week);
    this.setPlan(next);
  }

  private scheduleRetry() {
    if (this.offline) return;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      void this.sync();
    }, this.backoff);
    this.backoff = Math.min(BACKOFF_MAX, this.backoff * 2);
  }

  private async flushQueue() {
    if (!this.plan?.synced) return;
    while (this.queue.length) {
      const item = this.queue[0];
      try {
        const res = await challengeAPI.pilsaVerse(item);
        this.queue.shift();
        this.applyResult(res);
      } catch (e) {
        if (isFinal(e)) {
          this.queue.shift();
          this.persist();
          continue;
        }
        this.persist();
        throw e;
      }
    }
  }

  private applyResult(res: Awaited<ReturnType<typeof challengeAPI.pilsaVerse>> | null) {
    if (!res || !this.plan) {
      this.persist();
      return;
    }
    const chapters = this.plan.chapters.map((ch) =>
      ch.b === res.b && ch.c === res.c && res.done
        ? { ...ch, done: unionDone(ch.done, res.done, ch.verses) }
        : ch,
    );
    this.setPlan({ ...this.plan, chapters });
    if ((res.awarded ?? 0) > 0) void challengeStoreFor(this.userId).refreshWallet();
  }

  /** 한 절 다 씀 — 기기에 먼저 남기고 서버로 보낸다 */
  markVerse = async (
    b: number,
    c: number,
    v: number,
    chars: number,
    ms: number,
  ): Promise<PilsaMarkResult> => {
    const plan = this.plan;
    const ch = plan?.chapters.find((x) => x.b === b && x.c === c);
    if (!plan || !ch || v < 1 || v > ch.verses) {
      return { chapterDone: false, weekDone: false, awarded: 0 };
    }
    const fresh = !ch.done.includes(v);
    if (fresh) {
      this.setPlan({
        ...plan,
        chapters: plan.chapters.map((x) =>
          x === ch ? { ...x, done: unionDone(x.done, [v], x.verses) } : x,
        ),
      });
    }
    const local = (): PilsaMarkResult => {
      const cur = this.plan?.chapters.find((x) => x.b === b && x.c === c);
      return {
        chapterDone: !!cur && chapterDone(cur),
        weekDone: weekDone(this.plan),
        awarded: 0,
      };
    };
    if (this.offline || !fresh) return local();

    const body: PilsaVerseBody = {
      week: plan.week,
      b,
      c,
      v,
      chars: Math.max(0, Math.round(chars)),
      ms: Math.max(0, Math.round(ms)),
    };
    if (!this.plan?.synced || this.queue.length) {
      this.queue.push(body);
      this.persist();
      void this.sync();
      return local();
    }
    try {
      const res = await challengeAPI.pilsaVerse(body);
      this.applyResult(res);
      const base = local();
      return {
        chapterDone: base.chapterDone || !!res?.chapter_done,
        weekDone: base.weekDone || !!res?.week_done,
        awarded: res?.awarded ?? 0,
      };
    } catch (e) {
      if (!isFinal(e)) {
        this.queue.push(body);
        this.persist();
        this.lastFailAt = Date.now();
        this.scheduleRetry();
      }
      return local();
    }
  };
}

const stores = new Map<string, PilsaStore>();

export function pilsaStoreFor(userId: string, anonymous: boolean): PilsaStore {
  const anon = anonymous || userId === ANONYMOUS_USER;
  const k = `${userId}|${anon ? 1 : 0}`;
  let s = stores.get(k);
  if (!s) {
    s = new PilsaStore(userId, anon);
    stores.set(k, s);
  }
  return s;
}

/** 테스트용 — 모듈 캐시 비우기 */
export function resetPilsaStores() {
  stores.clear();
}

/** null = 아직 고르는 중 (성경 데이터 대기 등) */
export function usePilsa(
  notes: SermonNote[],
  userId: string,
  anonymous: boolean,
): {
  plan: PilsaPlan | null;
  markVerse: (
    b: number,
    c: number,
    v: number,
    chars: number,
    ms: number,
  ) => Promise<PilsaMarkResult>;
} {
  const store = pilsaStoreFor(userId, anonymous);
  const plan = useSyncExternalStore(store.subscribe, store.getPlan);
  const { bible } = useBible();
  useEffect(() => {
    store.ensure(notes, bible);
  }, [store, notes, bible]);
  const markVerse = useCallback(
    (b: number, c: number, v: number, chars: number, ms: number) =>
      store.markVerse(b, c, v, chars, ms),
    [store],
  );
  return { plan, markVerse };
}

/** 다 쓴 장 수 */
export function pilsaDoneCount(plan: PilsaPlan | null): number {
  return doneCount(plan);
}

/** 다 쓰지 않은 첫 장 */
export function nextChapter(plan: PilsaPlan | null): PilsaChapter | null {
  return nextOf(plan);
}
