import { createContext, useContext, useSyncExternalStore } from 'react';
import { personalFeatureAPI } from '../../../utils/services';
import { uid, type SermonNote, type Thought } from './sermonTypes';

/**
 * 「한 주 동안」 직접 적는 할 일 — 설교 노트의 「적용」 태그와 따로, 노트 없이도 적는다.
 *  - once: 이번 주 안에 한 번. day 를 정하면 그날 줄에 점선으로 놓이고, 하면 done_on 날짜 줄에 ♥ 스티커
 *  - daily: 이번 주 매일. log = 한 날짜들. short = 날짜 옆 기둥 머리에 보일 짧은 이름
 * 한 주(일~토) = 서버 문서 하나 (personal_feature_docs, feature_key='sermon_plan', title = 그 주 일요일 yyyy-MM-dd).
 * 기기 캐시(`sn-plan:{userId}`)가 먼저 그리고, 로그인했으면 바뀐 주만 800ms 뒤 올린다. 로그인 전(anon)은 기기에만.
 * 설교 노트에서 온 적용은 여기 담지 않는다 — 노트의 thoughts[].done 이 그대로 맡는다.
 */
export const PLAN_FEATURE = 'sermon_plan';
const SCHEMA_VER = 1;
const SAVE_DELAY = 800;
const RETRY_DELAY = 15_000;
/** 기기에 남겨 둘 주 수 */
const KEEP_WEEKS = 8;
export const SHORT_MAX = 5;
export const TEXT_MAX = 120;

export type PlanRep = 'once' | 'daily';

export interface PlanItem {
  id: string;
  text: string;
  rep: PlanRep;
  /** daily: 기둥 머리 이름 */
  short?: string;
  /** once: 하기로 정한 날 yyyy-MM-dd. 안 정했으면 null → 「이번 주 안에」 칸 */
  day?: string | null;
  /** once: 한 날 yyyy-MM-dd */
  done_on?: string | null;
  /** daily: 한 날들 yyyy-MM-dd */
  log?: string[];
  created_at: number;
}

export interface WeekPlan {
  /** 그 주 일요일 yyyy-MM-dd */
  week: string;
  items: PlanItem[];
  updated_at: number;
}

interface Cache {
  weeks: Record<string, WeekPlan>;
  ids: Record<string, string>;
  dirty: string[];
}

// ───────── 순수 함수 (테스트 대상) ─────────

export function emptyPlan(week: string): WeekPlan {
  return { week, items: [], updated_at: 0 };
}

/** 고칠 때마다 커지는 표 — 같은 밀리초에 두 번 고쳐도 「올리는 사이에 또 고쳤나」를 알 수 있게 */
function stamp(p: WeekPlan): number {
  return Math.max(Date.now(), p.updated_at + 1);
}

/** 앞 네 글자 (공백 빼고) */
export function autoShort(text: string): string {
  return Array.from(text.replace(/\s+/g, '')).slice(0, 4).join('');
}

export function addItem(
  p: WeekPlan,
  input: { text: string; rep: PlanRep; short?: string; day?: string | null },
): WeekPlan {
  const text = input.text.trim().slice(0, TEXT_MAX);
  if (!text) return p;
  const item: PlanItem =
    input.rep === 'daily'
      ? {
          id: uid('p'),
          text,
          rep: 'daily',
          short: Array.from((input.short || '').trim() || autoShort(text))
            .slice(0, SHORT_MAX)
            .join(''),
          log: [],
          created_at: Date.now(),
        }
      : {
          id: uid('p'),
          text,
          rep: 'once',
          day: input.day ?? null,
          done_on: null,
          created_at: Date.now(),
        };
  return { ...p, items: [...p.items, item], updated_at: stamp(p) };
}

export function removeItem(p: WeekPlan, id: string): WeekPlan {
  return { ...p, items: p.items.filter((x) => x.id !== id), updated_at: stamp(p) };
}

/** once: 오늘 했어요 / 되돌리기. 되돌리면 정해 둔 날(day)로 돌아간다 */
export function toggleOnce(p: WeekPlan, id: string, today: string): WeekPlan {
  return {
    ...p,
    items: p.items.map((x) =>
      x.id === id && x.rep === 'once' ? { ...x, done_on: x.done_on ? null : today } : x,
    ),
    updated_at: stamp(p),
  };
}

/** daily: 그날 했어요 / 되돌리기. 오늘 이후는 못 누른다 */
export function toggleDaily(p: WeekPlan, id: string, date: string, today: string): WeekPlan {
  if (date > today) return p;
  return {
    ...p,
    items: p.items.map((x) => {
      if (x.id !== id || x.rep !== 'daily') return x;
      const log = x.log || [];
      return {
        ...x,
        log: log.includes(date) ? log.filter((d) => d !== date) : [...log, date].sort(),
      };
    }),
    updated_at: stamp(p),
  };
}

/** 서버/기기에서 읽은 값 다듬기 — 모르는 필드·깨진 항목은 버린다 */
export function tidyPlan(week: string, raw: unknown): WeekPlan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as {
    items?: unknown;
    updated_at?: unknown;
  };
  const items: PlanItem[] = [];
  if (Array.isArray(r.items)) {
    for (const it of r.items as Record<string, unknown>[]) {
      if (!it || typeof it.id !== 'string' || typeof it.text !== 'string' || !it.text.trim())
        continue;
      const rep: PlanRep = it.rep === 'daily' ? 'daily' : 'once';
      const date = (v: unknown) =>
        typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      items.push(
        rep === 'daily'
          ? {
              id: it.id,
              text: it.text,
              rep,
              short: typeof it.short === 'string' && it.short ? it.short : autoShort(it.text),
              log: Array.isArray(it.log) ? (it.log.map(date).filter(Boolean) as string[]) : [],
              created_at: Number(it.created_at) || 0,
            }
          : {
              id: it.id,
              text: it.text,
              rep,
              day: date(it.day),
              done_on: date(it.done_on),
              created_at: Number(it.created_at) || 0,
            },
      );
    }
  }
  return { week, items, updated_at: Number(r.updated_at) || 0 };
}

// ───────── 「한 주 동안」 판 (설교 적용 + 직접 적은 할 일) ─────────

/** 매일 기둥은 3개까지 — 날짜 줄 오른쪽 폭 */
export const DAILY_MAX = 3;

export interface OnceEntry {
  key: string;
  text: string;
  /** 하기로 정한 날 (직접 적은 것만) */
  day: string | null;
  doneOn: string | null;
  planId?: string;
  note?: SermonNote;
  thought?: Thought;
}

export interface WeekBoard {
  once: OnceEntry[];
  daily: PlanItem[];
  /** 날짜를 안 정했고 아직 안 한 것 — 「이번 주 안에」 칸 */
  tray: OnceEntry[];
  total: number;
  done: number;
  left: number;
  /** 매일 할 일 중 오늘 아직 안 한 것 */
  dailyLeftToday: number;
}

export function ymdOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** notes 는 이번 주(days) 노트만 쓴다. 노트의 「적용」은 한 번 할 일, 체크한 날 = done_at 날짜 */
export function weekBoard(
  notes: SermonNote[],
  plan: WeekPlan,
  days: string[],
  today: string,
): WeekBoard {
  const inWeek = new Set(days);
  const once: OnceEntry[] = [];
  notes
    .filter((n) => inWeek.has(n.date))
    .forEach((n) =>
      (n.thoughts || []).forEach((t) => {
        if (t.tag !== '적용') return;
        once.push({
          key: `${n.id}|${t.id}`,
          text: t.text || '(사진·영상 메모)',
          day: null,
          doneOn: t.done ? (t.done_at ? ymdOf(t.done_at) : n.date) : null,
          note: n,
          thought: t,
        });
      }),
    );
  plan.items.forEach((it) => {
    if (it.rep !== 'once') return;
    once.push({
      key: it.id,
      text: it.text,
      day: it.day ?? null,
      doneOn: it.done_on ?? null,
      planId: it.id,
    });
  });
  const daily = plan.items.filter((x) => x.rep === 'daily');
  const tray = once.filter((x) => !x.doneOn && (!x.day || !inWeek.has(x.day)));
  const doneOnce = once.filter((x) => x.doneOn).length;
  const dailyDone = daily.filter((d) => (d.log || []).includes(today)).length;
  const total = once.length + daily.length;
  const done = doneOnce + dailyDone;
  return {
    once,
    daily,
    tray,
    total,
    done,
    left: total - done,
    dailyLeftToday: daily.length - dailyDone,
  };
}

/** 한 일 스티커가 붙을 날 — 이번 주 밖에서 체크했으면 오늘 줄 */
export function stickDay(e: OnceEntry, days: string[], today: string): string | null {
  if (!e.doneOn) return null;
  return days.includes(e.doneOn) ? e.doneOn : today;
}

// ───────── 저장소 ─────────

function cacheKey(userId: string) {
  return `sn-plan:${userId}`;
}

function readCache(userId: string): Cache {
  try {
    const raw = JSON.parse(
      localStorage.getItem(cacheKey(userId)) || 'null',
    ) as Partial<Cache> | null;
    const weeks: Record<string, WeekPlan> = {};
    Object.entries(raw?.weeks || {}).forEach(([w, p]) => {
      weeks[w] = tidyPlan(w, p);
    });
    return {
      weeks,
      ids: { ...(raw?.ids || {}) },
      dirty: Array.isArray(raw?.dirty) ? raw!.dirty.filter((w) => typeof w === 'string') : [],
    };
  } catch {
    return { weeks: {}, ids: {}, dirty: [] };
  }
}

export class WeekPlanStore {
  private cache: Cache;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private disposed = false;
  /** 같은 참조를 돌려줘야 useSyncExternalStore 가 다시 그리지 않는다 */
  private version = 0;

  constructor(
    readonly userId: string,
    readonly anonymous: boolean,
  ) {
    this.cache = readCache(userId);
    if (!anonymous) this.adoptAnonymous();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  snapshot = () => this.version;

  /** 빈 주도 같은 참조를 돌려준다 (useMemo 가 매번 다시 계산하지 않게) */
  private empties = new Map<string, WeekPlan>();

  get(week: string): WeekPlan {
    const p = this.cache.weeks[week];
    if (p) return p;
    let e = this.empties.get(week);
    if (!e) {
      e = emptyPlan(week);
      this.empties.set(week, e);
    }
    return e;
  }

  update(week: string, fn: (p: WeekPlan) => WeekPlan) {
    const prev = this.get(week);
    const next = fn(prev);
    if (next === prev) return;
    this.cache.weeks[week] = next;
    if (!this.anonymous && !this.cache.dirty.includes(week)) this.cache.dirty.push(week);
    this.write();
    this.emit();
    this.schedule(SAVE_DELAY);
  }

  /** 이 주 문서를 서버에서 받아 온다 (기기에 안 올린 변경이 있으면 그쪽이 이긴다) */
  async load(week: string) {
    if (this.anonymous) return;
    try {
      const list = await personalFeatureAPI.listDocs(PLAN_FEATURE);
      if (this.disposed) return;
      const found = list.find((d) => d.title === week);
      if (!found) {
        if (this.cache.dirty.length) this.schedule(0);
        return;
      }
      this.cache.ids[week] = found.id;
      if (this.cache.dirty.includes(week)) {
        this.write();
        this.schedule(0);
        return;
      }
      const doc = await personalFeatureAPI.getDoc<unknown>(PLAN_FEATURE, found.id);
      if (this.disposed || this.cache.dirty.includes(week)) return;
      this.cache.weeks[week] = tidyPlan(week, doc.content);
      this.write();
      this.emit();
    } catch {
      // 오프라인 — 기기 캐시로 그린다
    }
  }

  async flush() {
    if (this.anonymous || this.pushing || !this.cache.dirty.length) return;
    this.pushing = true;
    try {
      for (const week of [...this.cache.dirty]) {
        const plan = this.get(week);
        const content = { week, items: plan.items, updated_at: plan.updated_at };
        const id = this.cache.ids[week];
        if (id) {
          await personalFeatureAPI.updateDoc(PLAN_FEATURE, id, { content });
        } else {
          const doc = await personalFeatureAPI.createDoc(PLAN_FEATURE, {
            title: week,
            content,
            schema_ver: SCHEMA_VER,
          });
          this.cache.ids[week] = doc.id;
        }
        // 올리는 사이에 또 고쳤으면 dirty 를 남겨 한 번 더 올린다
        if (this.get(week).updated_at === plan.updated_at) {
          this.cache.dirty = this.cache.dirty.filter((w) => w !== week);
        }
        this.write();
      }
    } catch {
      this.schedule(RETRY_DELAY);
    } finally {
      this.pushing = false;
    }
    if (this.cache.dirty.length && !this.timer) this.schedule(SAVE_DELAY);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    void this.flush();
  }

  private schedule(ms: number) {
    if (this.anonymous || this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  /** 로그인 전에 이 기기에서 적은 주를 내 계정으로 가져온다 (내 계정에 그 주가 비어 있을 때만) */
  private adoptAnonymous() {
    const anon = readCache('anon');
    let moved = false;
    Object.entries(anon.weeks).forEach(([w, p]) => {
      if (!p.items.length || this.cache.weeks[w]?.items.length) return;
      this.cache.weeks[w] = p;
      if (!this.cache.dirty.includes(w)) this.cache.dirty.push(w);
      moved = true;
    });
    if (!moved) return;
    try {
      localStorage.removeItem(cacheKey('anon'));
    } catch {
      // 지우지 못해도 다음 로그인 때 내 계정 쪽이 이미 차 있어 다시 옮기지 않는다
    }
    this.write();
  }

  private write() {
    const keep = Object.keys(this.cache.weeks).sort().slice(-KEEP_WEEKS).concat(this.cache.dirty);
    const weeks: Record<string, WeekPlan> = {};
    const ids: Record<string, string> = {};
    keep.forEach((w) => {
      if (this.cache.weeks[w]) weeks[w] = this.cache.weeks[w];
      if (this.cache.ids[w]) ids[w] = this.cache.ids[w];
    });
    this.cache = { weeks, ids, dirty: this.cache.dirty };
    try {
      localStorage.setItem(cacheKey(this.userId), JSON.stringify(this.cache));
    } catch {
      // 저장 못 해도 이번 세션 동안은 유지
    }
  }

  private emit() {
    this.version += 1;
    this.listeners.forEach((l) => l());
  }
}

export const WeekPlanContext = createContext<WeekPlanStore | null>(null);

const noopSub = () => () => {};
const zero = () => 0;

/** 이 주 할 일 + 고치기. 저장소가 없으면(테스트 등) 빈 주를 돌려주고 고치기는 아무 일도 안 한다 */
export function useWeekPlan(week: string): [WeekPlan, (fn: (p: WeekPlan) => WeekPlan) => void] {
  const store = useContext(WeekPlanContext);
  useSyncExternalStore(
    store?.subscribe ?? noopSub,
    store?.snapshot ?? zero,
    store?.snapshot ?? zero,
  );
  const plan = store ? store.get(week) : emptyPlan(week);
  return [plan, (fn) => store?.update(week, fn)];
}
