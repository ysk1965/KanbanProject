import { useEffect, useSyncExternalStore } from 'react';
import { ANONYMOUS_USER } from '../sermonStore';
import {
  challengeAPI,
  isUnavailable,
  type ChallengeProfile,
  type GameBest,
  type League,
  type Wallet,
} from './challengeApi';

/**
 * 챌린지 지갑·프로필·리그·게임 최고 기록 캐시 (사용자마다 하나).
 * - 로그인 사용자만 서버를 부른다. 익명이면 늘 비어 있고 게임은 연습 판으로만
 * - 마지막으로 받은 값은 기기에 남겨(sermon-challenge-v1:<userId>) 오프라인·첫 화면에서 바로 그린다
 * - 서버가 없거나(배포 전) 끊기면 unavailable = true → 화면은 「아직 준비 중」
 */

type Listener = () => void;

interface Cached {
  wallet: Wallet | null;
  profile: ChallengeProfile | null;
  league: League | null;
  rainBest: GameBest | null;
  booksBest: GameBest | null;
}

export class ChallengeStore implements Cached {
  wallet: Wallet | null = null;
  profile: ChallengeProfile | null = null;
  league: League | null = null;
  rainBest: GameBest | null = null;
  booksBest: GameBest | null = null;
  /** 한 번이라도 서버 응답을 받았는지 */
  loaded = false;
  /** 마지막 시도가 서버 없음·연결 실패였는지 */
  unavailable = false;
  private listeners = new Set<Listener>();
  private version = 0;
  private inflight: Promise<void> | null = null;
  private lastAt = 0;

  constructor(readonly userId: string) {
    if (this.anonymous) return;
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) Object.assign(this, JSON.parse(raw) as Partial<Cached>);
    } catch {
      /* ignore */
    }
  }

  get anonymous() {
    return this.userId === ANONYMOUS_USER;
  }

  private get key() {
    return `sermon-challenge-v1:${this.userId}`;
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
    this.persist();
    this.listeners.forEach((f) => f());
  }

  private persist() {
    if (this.anonymous) return;
    try {
      const c: Cached = {
        wallet: this.wallet,
        profile: this.profile,
        league: this.league,
        rainBest: this.rainBest,
        booksBest: this.booksBest,
      };
      localStorage.setItem(this.key, JSON.stringify(c));
    } catch {
      /* ignore */
    }
  }

  /** 지갑·프로필·리그·최고 기록을 한꺼번에 (동시 호출은 한 번, maxAgeMs 안이면 건너뜀) */
  refresh(maxAgeMs = 0): Promise<void> {
    if (this.anonymous) return Promise.resolve();
    if (this.inflight) return this.inflight;
    if (maxAgeMs && Date.now() - this.lastAt < maxAgeMs) return Promise.resolve();
    this.lastAt = Date.now();
    this.inflight = Promise.allSettled([
      challengeAPI.wallet(),
      challengeAPI.profile(),
      challengeAPI.league(),
      challengeAPI.best('rain'),
      challengeAPI.best('books', 'all'),
    ])
      .then(([w, p, l, rb, bb]) => {
        if (w.status === 'fulfilled' && w.value) this.wallet = w.value;
        if (p.status === 'fulfilled' && p.value) this.profile = p.value;
        if (l.status === 'fulfilled' && l.value) this.league = l.value;
        if (rb.status === 'fulfilled' && rb.value) this.rainBest = rb.value;
        if (bb.status === 'fulfilled' && bb.value) this.booksBest = bb.value;
        const ok = w.status === 'fulfilled';
        this.unavailable = !ok && isUnavailable(w.reason);
        if (ok) this.loaded = true;
        this.emit();
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** 지갑만 다시 (게임 끝·교환 뒤·노트 저장 뒤) */
  async refreshWallet(): Promise<void> {
    if (this.anonymous) return;
    try {
      this.setWallet(await challengeAPI.wallet());
    } catch (e) {
      this.unavailable = isUnavailable(e);
      this.emit();
    }
  }

  setWallet(w: Wallet | null | undefined) {
    if (!w) return;
    this.wallet = w;
    this.loaded = true;
    this.unavailable = false;
    this.emit();
  }

  setProfile(p: ChallengeProfile | null | undefined) {
    if (!p) return;
    this.profile = p;
    this.emit();
  }

  setBest(game: 'rain' | 'books', best: number | null | undefined) {
    if (best == null) return;
    if (game === 'rain') this.rainBest = { ...this.rainBest, best };
    else this.booksBest = { ...this.booksBest, best };
    this.emit();
  }
}

const stores = new Map<string, ChallengeStore>();

export function challengeStoreFor(userId: string): ChallengeStore {
  let s = stores.get(userId);
  if (!s) {
    s = new ChallengeStore(userId);
    stores.set(userId, s);
  }
  return s;
}

/** 테스트용 — 모듈 캐시 비우기 */
export function resetChallengeStores() {
  stores.clear();
}

/** 화면에서 쓰는 훅: 스토어를 구독하고, 처음 그릴 때 (30초 안에 받은 게 없으면) 서버에서 받는다 */
export function useChallengeStore(userId: string): ChallengeStore {
  const store = challengeStoreFor(userId);
  useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    void store.refresh(30_000);
  }, [store]);
  return store;
}
