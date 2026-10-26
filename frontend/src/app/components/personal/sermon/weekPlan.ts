import { createContext, useContext, useSyncExternalStore } from 'react';
import { personalFeatureAPI } from '../../../utils/services';
import { uid, type SermonNote, type Thought } from './sermonTypes';

/**
 * 「한 주 동안」 — 이번 주(일~토)를 날짜 단위로, 고른 날의 할 일을 카테고리별로.
 *  - 첫 카테고리 「예배 갈피」(GALPI_CAT)는 고정: 이번 주 설교 노트의 「적용」이 그 설교 날짜에 들어온다
 *    (설교 적용의 체크는 노트 thoughts[].done 이 그대로 맡는다). 여기서 바로 적은 것도 cat=galpi 로 붙는다.
 *  - 내 카테고리(최대 CAT_MAX): 이름·색·아이콘·순서. 계정에 문서 한 장 (title = CATS_DOC)
 *  - 할 일: once = 하기로 한 날(day) 하루. 못 하면 이번 주 안에선 오늘로 넘어온다(carry). 한 날 = done_on
 *           daily = from 날부터 이번 주 남은 날마다. 한 날들 = log
 * 서버: personal_feature_docs, feature_key='sermon_plan'. 한 주 = 문서 하나 (title = 그 주 일요일 yyyy-MM-dd) + 카테고리 문서 하나.
 * 기기 캐시(`sn-plan:{userId}`)가 먼저 그리고, 로그인했으면 바뀐 문서만 800ms 뒤 올린다. 로그인 전(anon)은 기기에만.
 */
export const PLAN_FEATURE = 'sermon_plan';
export const CATS_DOC = 'categories';
export const GALPI_CAT = 'galpi';
/** 예전(카테고리 전) 할 일이 들어가는 기본 카테고리 */
export const TODO_CAT = 'todo';
export const CAT_MAX = 5;
export const CAT_NAME_MAX = 12;
export const TEXT_MAX = 120;
const SCHEMA_VER = 1;
const SAVE_DELAY = 800;
const RETRY_DELAY = 15_000;
/** 기기에 남겨 둘 주 수 */
const KEEP_WEEKS = 8;

export type PlanRep = 'once' | 'daily';
export const CAT_COLORS = ['g1', 'g3', 'purple', 'orange', 'green', 'red'] as const;
export type CatColor = (typeof CAT_COLORS)[number] | 'g2';
export const CAT_ICONS = ['tag', 'home', 'users', 'book', 'briefcase', 'heart'] as const;
export type CatIcon = (typeof CAT_ICONS)[number] | 'ribbon';

export interface PlanCategory {
  id: string;
  name: string;
  color: CatColor;
  icon: CatIcon;
}

export interface PlanItem {
  id: string;
  text: string;
  rep: PlanRep;
  /** 카테고리 id. 없으면(예전 할 일) TODO_CAT */
  cat?: string;
  /** once: 하기로 한 날 yyyy-MM-dd. 예전 「이번 주 안에」 할 일은 null → 오늘로 본다 */
  day?: string | null;
  /** once: 한 날 yyyy-MM-dd */
  done_on?: string | null;
  /** daily: 이날부터 매일. 없으면 그 주 일요일부터 */
  from?: string | null;
  /** daily: 한 날들 yyyy-MM-dd */
  log?: string[];
  /** 예배 갈피에서 바로 적은 것 — 그 주 갈피 노트 */
  note_id?: string | null;
  /** 예전 매일 기둥 이름 — 읽기만 한다 */
  short?: string;
  created_at: number;
}

export interface WeekPlan {
  /** 그 주 일요일 yyyy-MM-dd */
  week: string;
  items: PlanItem[];
  updated_at: number;
}

export interface CatList {
  cats: PlanCategory[];
  updated_at: number;
}

interface Cache {
  weeks: Record<string, WeekPlan>;
  cats: CatList | null;
  /** 문서 키(주 일요일 또는 CATS_DOC) → 서버 문서 id */
  ids: Record<string, string>;
  /** 안 올린 문서 키 */
  dirty: string[];
}

export const DEFAULT_CATS: PlanCategory[] = [
  { id: TODO_CAT, name: '할 일', color: 'g1', icon: 'tag' },
];
export const GALPI_CATEGORY: PlanCategory = {
  id: GALPI_CAT,
  name: '예배 갈피',
  color: 'g2',
  icon: 'ribbon',
};

// ───────── 순수 함수 (테스트 대상) ─────────

export function emptyPlan(week: string): WeekPlan {
  return { week, items: [], updated_at: 0 };
}

/** 고칠 때마다 커지는 표 — 같은 밀리초에 두 번 고쳐도 「올리는 사이에 또 고쳤나」를 알 수 있게 */
function stamp(p: { updated_at: number }): number {
  return Math.max(Date.now(), p.updated_at + 1);
}

export function addItem(
  p: WeekPlan,
  input: { text: string; rep: PlanRep; cat: string; day: string; noteId?: string | null },
): WeekPlan {
  const text = input.text.trim().slice(0, TEXT_MAX);
  if (!text) return p;
  const base = { id: uid('p'), text, cat: input.cat, created_at: Date.now() };
  const item: PlanItem =
    input.rep === 'daily'
      ? { ...base, rep: 'daily', from: input.day, log: [] }
      : { ...base, rep: 'once', day: input.day, done_on: null, note_id: input.noteId ?? null };
  return { ...p, items: [...p.items, item], updated_at: stamp(p) };
}

export function removeItem(p: WeekPlan, id: string): WeekPlan {
  return { ...p, items: p.items.filter((x) => x.id !== id), updated_at: stamp(p) };
}

export function removeCategoryItems(p: WeekPlan, cat: string): WeekPlan {
  if (!p.items.some((x) => (x.cat || TODO_CAT) === cat)) return p;
  return {
    ...p,
    items: p.items.filter((x) => (x.cat || TODO_CAT) !== cat),
    updated_at: stamp(p),
  };
}

/** once: 그날 했어요 / 되돌리기 */
export function toggleOnce(p: WeekPlan, id: string, date: string): WeekPlan {
  return {
    ...p,
    items: p.items.map((x) =>
      x.id === id && x.rep === 'once' ? { ...x, done_on: x.done_on ? null : date } : x,
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

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const dateOrNull = (v: unknown) => (isDate(v) ? v : null);

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
      const cat = typeof it.cat === 'string' && it.cat ? it.cat : TODO_CAT;
      const base = { id: it.id, text: it.text, cat, created_at: Number(it.created_at) || 0 };
      items.push(
        rep === 'daily'
          ? {
              ...base,
              rep,
              from: dateOrNull(it.from),
              log: Array.isArray(it.log) ? it.log.filter(isDate) : [],
              ...(typeof it.short === 'string' && it.short ? { short: it.short } : {}),
            }
          : {
              ...base,
              rep,
              day: dateOrNull(it.day),
              done_on: dateOrNull(it.done_on),
              note_id: typeof it.note_id === 'string' ? it.note_id : null,
            },
      );
    }
  }
  return { week, items, updated_at: Number(r.updated_at) || 0 };
}

export function tidyCats(raw: unknown): CatList {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { cats?: unknown; updated_at?: unknown };
  const cats: PlanCategory[] = [];
  const seen = new Set<string>([GALPI_CAT]);
  if (Array.isArray(r.cats)) {
    for (const c of r.cats as Record<string, unknown>[]) {
      if (!c || typeof c.id !== 'string' || seen.has(c.id)) continue;
      const name = typeof c.name === 'string' ? c.name.trim().slice(0, CAT_NAME_MAX) : '';
      if (!name) continue;
      seen.add(c.id);
      cats.push({
        id: c.id,
        name,
        color: (CAT_COLORS as readonly string[]).includes(c.color as string)
          ? (c.color as CatColor)
          : 'g1',
        icon: (CAT_ICONS as readonly string[]).includes(c.icon as string)
          ? (c.icon as CatIcon)
          : 'tag',
      });
      if (cats.length >= CAT_MAX) break;
    }
  }
  return { cats, updated_at: Number(r.updated_at) || 0 };
}

export function addCategory(
  l: CatList,
  input: { name: string; color: CatColor; icon: CatIcon },
): CatList {
  const name = input.name.trim().slice(0, CAT_NAME_MAX);
  if (!name || l.cats.length >= CAT_MAX) return l;
  return {
    cats: [...l.cats, { id: uid('c'), name, color: input.color, icon: input.icon }],
    updated_at: stamp(l),
  };
}

export function updateCategory(
  l: CatList,
  id: string,
  patch: Partial<Omit<PlanCategory, 'id'>>,
): CatList {
  const name = patch.name !== undefined ? patch.name.trim().slice(0, CAT_NAME_MAX) : undefined;
  if (name === '') return l;
  return {
    cats: l.cats.map((c) => (c.id === id ? { ...c, ...patch, ...(name ? { name } : {}) } : c)),
    updated_at: stamp(l),
  };
}

export function moveCategory(l: CatList, id: string, dir: -1 | 1): CatList {
  const i = l.cats.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= l.cats.length) return l;
  const cats = [...l.cats];
  [cats[i], cats[j]] = [cats[j], cats[i]];
  return { cats, updated_at: stamp(l) };
}

export function removeCategory(l: CatList, id: string): CatList {
  if (!l.cats.some((c) => c.id === id)) return l;
  return { cats: l.cats.filter((c) => c.id !== id), updated_at: stamp(l) };
}

// ───────── 「한 주 동안」 판 ─────────

export interface DayEntry {
  key: string;
  text: string;
  cat: string;
  rep: PlanRep;
  /** 하기로 한 날 (once) */
  day: string;
  done: boolean;
  /** 지난 날에 못 해서 오늘로 넘어온 것 — 원래 날 */
  carry?: string;
  /** 원래 날 보기에서 「오늘로 넘김」 (흐리게, 체크 못 함) */
  moved?: boolean;
  planId?: string;
  note?: SermonNote;
  thought?: Thought;
}

export function ymdOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Raw {
  key: string;
  text: string;
  cat: string;
  rep: PlanRep;
  day: string;
  doneOn: string | null;
  from?: string;
  log?: string[];
  planId?: string;
  note?: SermonNote;
  thought?: Thought;
}

/** 이번 주 할 일 원본 — 노트 적용(날짜 = 노트 날짜) + 직접 적은 것. notes 는 이번 주 밖 노트가 섞여도 된다 */
export function weekRaw(notes: SermonNote[], plan: WeekPlan, days: string[], today: string): Raw[] {
  const inWeek = new Set(days);
  const out: Raw[] = [];
  notes
    .filter((n) => inWeek.has(n.date))
    .forEach((n) =>
      (n.thoughts || []).forEach((t) => {
        if (t.tag !== '적용') return;
        out.push({
          key: `${n.id}|${t.id}`,
          text: t.text || '(사진·영상 메모)',
          cat: GALPI_CAT,
          rep: 'once',
          day: n.date,
          doneOn: t.done ? (t.done_at ? ymdOf(t.done_at) : n.date) : null,
          note: n,
          thought: t,
        });
      }),
    );
  plan.items.forEach((it) => {
    const cat = it.cat || TODO_CAT;
    if (it.rep === 'daily') {
      out.push({
        key: it.id,
        text: it.text,
        cat,
        rep: 'daily',
        day: it.from || days[0],
        doneOn: null,
        from: it.from || days[0],
        log: it.log || [],
        planId: it.id,
      });
    } else {
      // 예전 「이번 주 안에」(날짜 없음)는 오늘 할 일로 본다
      const day =
        it.day && inWeek.has(it.day) ? it.day : it.day && it.day > days[6] ? days[6] : today;
      out.push({
        key: it.id,
        text: it.text,
        cat,
        rep: 'once',
        day,
        doneOn: it.done_on ?? null,
        planId: it.id,
      });
    }
  });
  return out;
}

/** 고른 날(d)에 보이는 할 일 — 한 일은 한 날에만, 못 한 지난 일은 오늘로 넘어온다 */
export function dayEntries(raw: Raw[], d: string, days: string[], today: string): DayEntry[] {
  const out: DayEntry[] = [];
  raw.forEach((r) => {
    const base = {
      key: r.key,
      text: r.text,
      cat: r.cat,
      rep: r.rep,
      day: r.day,
      planId: r.planId,
      note: r.note,
      thought: r.thought,
    };
    if (r.rep === 'daily') {
      if (d >= (r.from || days[0])) out.push({ ...base, done: (r.log || []).includes(d) });
      return;
    }
    if (r.doneOn) {
      // 이번 주 밖에서 체크했으면 원래 날에 붙인다
      const on = days.includes(r.doneOn) ? r.doneOn : r.day;
      if (on === d) out.push({ ...base, done: true });
      return;
    }
    if (r.day === d) out.push({ ...base, done: false, moved: d < today });
    else if (r.day < today && d === today) out.push({ ...base, done: false, carry: r.day });
  });
  return out;
}

export interface DayStat {
  total: number;
  done: number;
}

/** 넘긴 것(moved)은 세지 않는다 */
export function dayStat(entries: DayEntry[]): DayStat {
  const live = entries.filter((e) => !e.moved);
  return { total: live.length, done: live.filter((e) => e.done).length };
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
      cats: raw?.cats ? tidyCats(raw.cats) : null,
      ids: { ...(raw?.ids || {}) },
      dirty: Array.isArray(raw?.dirty) ? raw!.dirty.filter((w) => typeof w === 'string') : [],
    };
  } catch {
    return { weeks: {}, cats: null, ids: {}, dirty: [] };
  }
}

const DEFAULT_LIST: CatList = { cats: DEFAULT_CATS, updated_at: 0 };

export class WeekPlanStore {
  private cache: Cache;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private disposed = false;
  /** 같은 참조를 돌려줘야 useSyncExternalStore 가 다시 그리지 않는다 */
  private version = 0;
  /** 빈 주도 같은 참조를 돌려준다 (useMemo 가 매번 다시 계산하지 않게) */
  private empties = new Map<string, WeekPlan>();

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

  /** 내 카테고리 (예배 갈피 제외). 한 번도 안 고쳤으면 기본 「할 일」 */
  cats(): CatList {
    return this.cache.cats ?? DEFAULT_LIST;
  }

  update(week: string, fn: (p: WeekPlan) => WeekPlan) {
    const prev = this.get(week);
    const next = fn(prev);
    if (next === prev) return;
    this.cache.weeks[week] = next;
    this.touch(week);
  }

  updateCats(fn: (l: CatList) => CatList) {
    const prev = this.cats();
    const next = fn(prev);
    if (next === prev) return;
    this.cache.cats = next;
    this.touch(CATS_DOC);
  }

  /** 이 주 문서 + 카테고리 문서를 서버에서 받아 온다 (기기에 안 올린 변경이 있으면 그쪽이 이긴다) */
  async load(week: string) {
    if (this.anonymous) return;
    try {
      const list = await personalFeatureAPI.listDocs(PLAN_FEATURE);
      if (this.disposed) return;
      let changed = false;
      for (const key of [CATS_DOC, week]) {
        const found = list.find((d) => d.title === key);
        if (!found) continue;
        this.cache.ids[key] = found.id;
        if (this.cache.dirty.includes(key)) continue;
        const doc = await personalFeatureAPI.getDoc<unknown>(PLAN_FEATURE, found.id);
        if (this.disposed || this.cache.dirty.includes(key)) continue;
        if (key === CATS_DOC) this.cache.cats = tidyCats(doc.content);
        else this.cache.weeks[key] = tidyPlan(key, doc.content);
        changed = true;
      }
      this.write();
      if (changed) this.emit();
      if (this.cache.dirty.length) this.schedule(0);
    } catch {
      // 오프라인 — 기기 캐시로 그린다
    }
  }

  async flush() {
    if (this.anonymous || this.pushing || !this.cache.dirty.length) return;
    this.pushing = true;
    try {
      for (const key of [...this.cache.dirty]) {
        const isCats = key === CATS_DOC;
        const stampAt = isCats ? this.cats().updated_at : this.get(key).updated_at;
        const content = isCats
          ? { cats: this.cats().cats, updated_at: stampAt }
          : { week: key, items: this.get(key).items, updated_at: stampAt };
        const id = this.cache.ids[key];
        if (id) {
          await personalFeatureAPI.updateDoc(PLAN_FEATURE, id, { content });
        } else {
          const doc = await personalFeatureAPI.createDoc(PLAN_FEATURE, {
            title: key,
            content,
            schema_ver: SCHEMA_VER,
          });
          this.cache.ids[key] = doc.id;
        }
        // 올리는 사이에 또 고쳤으면 dirty 를 남겨 한 번 더 올린다
        const now = isCats ? this.cats().updated_at : this.get(key).updated_at;
        if (now === stampAt) this.cache.dirty = this.cache.dirty.filter((w) => w !== key);
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

  private touch(key: string) {
    if (!this.anonymous && !this.cache.dirty.includes(key)) this.cache.dirty.push(key);
    this.write();
    this.emit();
    this.schedule(SAVE_DELAY);
  }

  private schedule(ms: number) {
    if (this.anonymous || this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  /** 로그인 전에 이 기기에서 적은 주·카테고리를 내 계정으로 가져온다 (내 계정 쪽이 비어 있을 때만) */
  private adoptAnonymous() {
    const anon = readCache('anon');
    let moved = false;
    Object.entries(anon.weeks).forEach(([w, p]) => {
      if (!p.items.length || this.cache.weeks[w]?.items.length) return;
      this.cache.weeks[w] = p;
      if (!this.cache.dirty.includes(w)) this.cache.dirty.push(w);
      moved = true;
    });
    if (anon.cats && !this.cache.cats) {
      this.cache.cats = anon.cats;
      if (!this.cache.dirty.includes(CATS_DOC)) this.cache.dirty.push(CATS_DOC);
      moved = true;
    }
    if (!moved) return;
    try {
      localStorage.removeItem(cacheKey('anon'));
    } catch {
      // 지우지 못해도 다음 로그인 때 내 계정 쪽이 이미 차 있어 다시 옮기지 않는다
    }
    this.write();
  }

  private write() {
    const weekKeys = Object.keys(this.cache.weeks).sort().slice(-KEEP_WEEKS);
    const keep = new Set([...weekKeys, ...this.cache.dirty.filter((k) => k !== CATS_DOC)]);
    const weeks: Record<string, WeekPlan> = {};
    const ids: Record<string, string> = {};
    keep.forEach((w) => {
      if (this.cache.weeks[w]) weeks[w] = this.cache.weeks[w];
      if (this.cache.ids[w]) ids[w] = this.cache.ids[w];
    });
    if (this.cache.ids[CATS_DOC]) ids[CATS_DOC] = this.cache.ids[CATS_DOC];
    this.cache = { weeks, cats: this.cache.cats, ids, dirty: this.cache.dirty };
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

export interface WeekPlanApi {
  plan: WeekPlan;
  cats: CatList;
  setPlan: (fn: (p: WeekPlan) => WeekPlan) => void;
  setCats: (fn: (l: CatList) => CatList) => void;
}

/** 이 주 할 일 + 카테고리 + 고치기. 저장소가 없으면(테스트 등) 빈 값을 돌려주고 고치기는 아무 일도 안 한다 */
export function useWeekPlan(week: string): WeekPlanApi {
  const store = useContext(WeekPlanContext);
  useSyncExternalStore(
    store?.subscribe ?? noopSub,
    store?.snapshot ?? zero,
    store?.snapshot ?? zero,
  );
  return {
    plan: store ? store.get(week) : emptyPlan(week),
    cats: store ? store.cats() : DEFAULT_LIST,
    setPlan: (fn) => store?.update(week, fn),
    setCats: (fn) => store?.updateCats(fn),
  };
}
