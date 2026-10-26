import { decRef, encRef, refShort, type Ref } from './bibleRefs';

/**
 * 설교 노트 데이터 구조.
 * 기획서 「데이터 구조와 기술 구성」 — 노트 한 편이 문서 하나(personal_feature_docs, feature_key='sermon').
 * content 는 서버가 해석하지 않는 JSON 이라 아래 타입이 곧 스키마다. (schema_ver = SERMON_SCHEMA_VER)
 */

export const SERMON_FEATURE_KEY = 'sermon';
export const SERMON_SCHEMA_VER = 1;

export const THOUGHT_TAGS = ['생각', '질문', '적용'] as const;
export type ThoughtTag = (typeof THOUGHT_TAGS)[number];

export interface ThoughtMedia {
  /** 스토리지 파일 id. 아직 안 올렸으면 `local-` 접두 (= 기기 대기열 sermonMediaQueue 의 id) */
  id: string;
  type: 'image' | 'video';
  /** 안 올린 첨부는 이 창 안에서만 유효한 blob: 주소 — 화면은 sermonMediaQueue.resolveUrl 로 다시 만든다 */
  url: string;
  thumb?: string | null;
  /** 기기에 파일이 없거나 서버가 거절해 올릴 수 없는 첨부 */
  lost?: boolean;
}

export interface Thought {
  id: string;
  tag: ThoughtTag;
  text: string;
  media: ThoughtMedia[];
  /** 설교 타이머 경과 초. 타이머를 쓰지 않았으면 null */
  t: number | null;
  /** 연결된 본문 요소의 data-aid. id 가 사라지면 label 로 다시 찾는다 */
  aid: string | null;
  label: string | null;
  edited?: boolean;
  /** 적용 실천 체크 */
  done?: boolean;
  done_at?: number | null;
  /** 기록 시각(ms) */
  at: number;
}

/**
 * 녹음 한 토막. 보통은 노트당 하나지만, 새로고침·iOS 백그라운드로 녹음이 끊기면
 * 그 시점 elapsed 를 offset 으로 새 토막이 생긴다. 재생할 때 t 가 속한 토막을 찾는다.
 */
export interface SermonAudioSegment {
  /** 스토리지 파일 id. 아직 안 올렸으면 `local-` 접두 (= IndexedDB seg id 를 그대로 씀) */
  id: string;
  url: string | null;
  mime: string;
  /** 이 토막이 시작할 때의 설교 타이머 경과 초 */
  offset: number;
  /** 초 */
  duration: number;
  size: number;
  /** 기기에 조각이 없어 올릴 수 없는 토막 */
  lost?: boolean;
}

export interface SermonAudio {
  segments: SermonAudioSegment[];
}

export interface SermonNote {
  /** 서버 문서 id. 아직 올리지 못한 새 노트는 `local-` 접두 */
  id: string;
  title: string;
  preacher: string;
  service: string;
  /** 「내 예배표」 예배 id (worship.ts). 이름이 바뀌어도 갈피·모임 짝이 따라간다 */
  service_id?: string | null;
  /** 예배 시간에 열어서 예배 칸을 자동으로 채움 — 직접 고치면 지운다 */
  service_auto?: boolean;
  /** yyyy-MM-dd */
  date: string;
  /** 설교 본문 구절 (encRef 문자열) */
  refs: string[];
  /** 본문 HTML. 구절 블록은 주소·강조 범위만 저장하고 본문은 열 때 다시 채운다 */
  body: string;
  thoughts: Thought[];
  /** 설교 타이머 누적 초 */
  elapsed: number;
  /** 설교 녹음. 녹음하지 않았으면 없음 */
  audio?: SermonAudio;
  /** 갈피 꽂은 시각(ms). 갈피 = 그 주(일~토, date 기준)의 중심 설교. 한 주에 한 편 */
  bookmarked_at?: number | null;
  /** 모임 설교 자리 연결 (모임마다 하나). group/sessionMatch.ts */
  groups?: NoteGroupLink[];
  /** 「같은 설교예요?」 제안을 거절한 자리 키 (group|service|date) */
  group_dismissed?: string[];
  created_at: number;
  updated_at: number;
}

/** 노트 ↔ 모임 설교 자리. 자리(session)는 모임 × 예배 × 날짜 */
export interface NoteGroupLink {
  group_id: string;
  /** 예배표의 예배 id. 예배표 밖 자리면 없음 */
  service_id?: string | null;
  /** 자리 날짜 yyyy-MM-dd */
  date: string;
  /** 서버 자리 id (resolve 뒤 채움) */
  session_id?: string | null;
  how: 'auto' | 'suggest' | 'manual';
  /** 「이 노트는 모임과 상관없어요」 — 연결은 기억하되 공개하지 않는다 */
  off?: boolean;
  /** 기록했다는 것만 알리고 내용은 비공개 */
  private?: boolean;
}

/** 서버로 보내는 content — id 를 뺀 나머지 */
export type SermonContent = Omit<SermonNote, 'id'>;

export const LOCAL_ID_PREFIX = 'local-';
export const isLocalId = (id: string) => id.startsWith(LOCAL_ID_PREFIX);

const DEVICE_KEY = 'sermon-device-id';
let deviceId: string | null = null;

/** 이 기기 표시(영숫자). 저장소를 못 쓰면 이 창 동안만 유효 */
export function deviceTag(): string {
  if (deviceId) return deviceId;
  try {
    deviceId = localStorage.getItem(DEVICE_KEY);
  } catch {
    /* 저장소 없음 */
  }
  if (!deviceId || !/^[a-z0-9]+$/.test(deviceId)) {
    deviceId = Math.random().toString(36).slice(2, 10) || 'dev';
    try {
      localStorage.setItem(DEVICE_KEY, deviceId);
    } catch {
      /* 이 창 동안만 */
    }
  }
  return deviceId;
}

/**
 * 아직 안 올린 녹음 토막·생각 첨부의 id. 만든 기기를 넣어 둔다 —
 * 노트는 파일보다 먼저 서버에 올라가므로, 다른 기기는 그 파일이 없어도 lost 로 적으면 안 된다(그 기기가 올린다).
 */
export function localFileId(prefix: string): string {
  return `${LOCAL_ID_PREFIX}${deviceTag()}-${uid(prefix)}`;
}

/**
 * 이 기기에서 만든 `local-` 토막·첨부인지. 기기 표시가 없는 예전 id 는 예전처럼 이 기기 것으로 본다
 * (안 그러면 정말 잃어버린 예전 토막이 영원히 「올리는 중」으로 남는다).
 */
export function madeOnThisDevice(id: string): boolean {
  return !TAGGED_LOCAL.test(id) || id.startsWith(`${LOCAL_ID_PREFIX}${deviceTag()}-`);
}

const TAGGED_LOCAL = /^local-[a-z0-9]+-/;

export function uid(prefix = 'n'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'M.D (요일)' — 앱 전체 날짜 표기 */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${m}.${d} (${w})`;
}

export function fmtTime(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const s0 = Math.max(0, Math.floor(sec));
  const h = Math.floor(s0 / 3600);
  const m = Math.floor((s0 % 3600) / 60);
  const s = s0 % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function hhmm(t: number): string {
  const d = new Date(t);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 오늘 기준 며칠 전인지 (오늘 = 0). 날짜 없으면 999 */
export function daysAgo(ds: string | null | undefined): number {
  if (!ds) return 999;
  const [y, m, d] = ds.split('-').map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 864e5);
}

export function esc(s: unknown): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** 본문 HTML → 검색·미리보기용 평문. 구절 블록은 [요 3:16] 으로 */
export function plainText(html: string | null | undefined): string {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('p,h3,li,div,br').forEach((e) => e.after(' '));
  d.querySelectorAll<HTMLElement>('.vblock').forEach((b) => {
    const r = decRef(b.dataset.ref);
    b.textContent = r ? ` [${refShort(r)}] ` : '';
  });
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

/** 노트에 등장하는 구절 전부 (설교 본문 + 본문 안 블록·칩), 중복 제거 */
export function noteRefs(n: SermonNote): Ref[] {
  const set = new Map<string, true>();
  (n.refs || []).forEach((s) => set.set(s, true));
  const d = document.createElement('div');
  d.innerHTML = n.body || '';
  d.querySelectorAll<HTMLElement>('[data-ref]').forEach((e) => {
    if (e.dataset.ref) set.set(e.dataset.ref, true);
  });
  return [...set.keys()].map(decRef).filter((r): r is Ref => !!r);
}

export function mainRef(n: SermonNote): Ref | null {
  const main = (n.refs || []).map(decRef).find((r): r is Ref => !!r);
  if (main) return main;
  return noteRefs(n)[0] ?? null;
}

export function hasBodyContent(html: string | null | undefined): boolean {
  return !!(plainText(html) || /vblock|vchip/.test(html || ''));
}

export function toggleApplyDone(n: SermonNote, tid: string): SermonNote {
  return {
    ...n,
    thoughts: (n.thoughts || []).map((t) =>
      t.id === tid ? { ...t, done: !t.done, done_at: !t.done ? Date.now() : null } : t,
    ),
  };
}

export interface ApplyItem {
  n: SermonNote;
  t: Thought;
}

export function applyItems(notes: SermonNote[]): ApplyItem[] {
  const out: ApplyItem[] = [];
  notes.forEach((n) =>
    (n.thoughts || []).forEach((t) => {
      if (t.tag === '적용') out.push({ n, t });
    }),
  );
  return out;
}

/** 최근 7일 설교의 적용 */
export function thisWeek(items: ApplyItem[]): ApplyItem[] {
  return items.filter(({ n }) => {
    const d = daysAgo(n.date);
    return d >= 0 && d <= 6;
  });
}

// ───────── 갈피 (그 주의 중심 설교) ─────────

/** yyyy-MM-dd 가 든 주의 일요일 (yyyy-MM-dd). 날짜가 없으면 '' */
export function weekOf(ds: string | null | undefined): string {
  if (!ds) return '';
  const [y, m, d] = ds.split('-').map(Number);
  if (!y || !m || !d) return '';
  const t = new Date(y, m - 1, d);
  t.setDate(d - t.getDay());
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/**
 * 자동 갈피 규칙 (사용자 설정 galpiPrefs.ts → resolveGalpiRule).
 *  - auto: 직접 꽂은 노트가 없는 주에 그 주 일요일 노트로 자동 갈피
 *  - service: 갈피 예배 이름 (내 예배표 갈피 예배의 표시 이름, 또는 옛 「내 주일 예배」)
 *  - serviceId: 내 예배표 갈피 예배 id. 있으면 요일과 상관없이 그 주에 이 예배로 쓴 노트를 먼저 고른다
 */
export interface GalpiRule {
  auto: boolean;
  service: string | null;
  serviceId?: string | null;
}

/** '주일 2부' 와 '주일2부' 를 같은 예배로 본다 */
export function sameService(a: string | null | undefined, b: string | null | undefined): boolean {
  const k = (x: string | null | undefined) => (x || '').replace(/\s+/g, '');
  return !!k(a) && k(a) === k(b);
}

/** 최근 weeks 주 동안 일요일 노트의 예배 — 많이 쓴 순서(같으면 최근에 쓴 쪽) */
export function sundayServices(
  notes: SermonNote[],
  today: string = todayString(),
  weeks = 8,
): Array<{ service: string; count: number }> {
  const from = weekOf(today);
  const [y, m, d] = from.split('-').map(Number);
  const since = from ? weekOf(ymdOf(new Date(y, m - 1, d - 7 * (weeks - 1)))) : '';
  const acc = new Map<string, { service: string; count: number; last: string }>();
  notes.forEach((n) => {
    const svc = (n.service || '').trim();
    if (!svc || !n.date || n.date !== weekOf(n.date) || n.date < since || n.date > today) return;
    const key = svc.replace(/\s+/g, '');
    const cur = acc.get(key);
    if (cur) {
      cur.count += 1;
      if (n.date > cur.last) cur.last = n.date;
    } else acc.set(key, { service: svc, count: 1, last: n.date });
  });
  return [...acc.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .map(({ service, count }) => ({ service, count }));
}

function ymdOf(t: Date): string {
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** 자동 갈피 후보끼리 — 생각이 많은 쪽, 같으면 본문이 긴 쪽, 같으면 먼저 쓴 쪽 */
function richer(a: SermonNote, b: SermonNote): SermonNote {
  const d =
    (b.thoughts || []).length - (a.thoughts || []).length ||
    (b.body || '').length - (a.body || '').length ||
    (a.created_at || 0) - (b.created_at || 0);
  return d > 0 ? b : a;
}

/**
 * 주(일요일) → 그 주 갈피 노트.
 *  1) 직접 꽂은 노트 (bookmarked_at > 0). 둘 이상 남아 있으면(다른 기기에서 동시에 꽂았거나 날짜를 옮긴 경우) 늦게 꽂은 쪽
 *  2) rule.auto 면: 그 주에 갈피 예배로 쓴 노트 (serviceId 가 있으면 아무 요일, 없으면 일요일만)
 *  3) 없으면 그 주 일요일 노트 중 생각이 가장 많은 노트
 * 갈피를 뺀 노트(bookmarked_at === 0)가 있는 주는 자동으로 꽂지 않는다(「이번 주는 갈피 빼기」).
 */
export function galpiByWeek(notes: SermonNote[], rule?: GalpiRule): Map<string, SermonNote> {
  const out = new Map<string, SermonNote>();
  const off = new Set<string>();
  const sundays = new Map<string, SermonNote[]>();
  const mains = new Map<string, SermonNote[]>();
  const isMain = (n: SermonNote) =>
    rule?.serviceId
      ? n.service_id
        ? n.service_id === rule.serviceId
        : sameService(n.service, rule.service)
      : false;
  notes.forEach((n) => {
    const w = weekOf(n.date);
    if (!w) return;
    if (n.bookmarked_at) {
      const cur = out.get(w);
      if (!cur || (cur.bookmarked_at || 0) < n.bookmarked_at) out.set(w, n);
    } else if (n.bookmarked_at === 0) {
      off.add(w);
    } else {
      if (n.date === w) sundays.set(w, [...(sundays.get(w) || []), n]);
      if (isMain(n)) mains.set(w, [...(mains.get(w) || []), n]);
    }
  });
  if (rule?.auto) {
    new Set([...sundays.keys(), ...mains.keys()]).forEach((w) => {
      if (out.has(w) || off.has(w)) return;
      const list = sundays.get(w) || [];
      const main = rule.serviceId
        ? mains.get(w) || []
        : rule.service
          ? list.filter((n) => sameService(n.service, rule.service))
          : [];
      const pool = main.length ? main : list;
      if (pool.length) out.set(w, pool.reduce(richer));
    });
  }
  return out;
}

/** 노트가 자기 주의 갈피인지 */
export function isGalpi(n: SermonNote, byWeek: Map<string, SermonNote>): boolean {
  return byWeek.get(weekOf(n.date))?.id === n.id;
}

/** 직접 꽂지 않고 규칙으로 꽂힌 갈피인지 */
export function isAutoGalpi(n: SermonNote, byWeek: Map<string, SermonNote>): boolean {
  return isGalpi(n, byWeek) && !n.bookmarked_at;
}

/** 같은 주에서 직접 꽂은 갈피를 빼야 할 다른 노트들 (갈피를 꽂을 때 함께 저장) */
export function galpiRivals(
  notes: SermonNote[],
  target: Pick<SermonNote, 'id' | 'date'>,
): SermonNote[] {
  const w = weekOf(target.date);
  if (!w) return [];
  return notes.filter((n) => n.id !== target.id && n.bookmarked_at && weekOf(n.date) === w);
}

/**
 * 갈피 꽂기/빼기. 저장할 것을 돌려준다(호출하는 쪽이 저장).
 *  - 꽂기: target 에 지금 시각, 같은 주의 다른 직접 갈피는 null
 *  - 빼기: target 에 0(그 주 자동 갈피도 끔), 같은 주의 다른 직접 갈피도 null
 * moved = 같은 주에 다른 갈피(직접이든 자동이든)가 있었는지
 */
export function galpiToggle(
  notes: SermonNote[],
  target: SermonNote,
  rule: GalpiRule,
  now: number = Date.now(),
): { on: boolean; moved: boolean; bookmarked_at: number; rivals: SermonNote[] } {
  const all = notes.some((n) => n.id === target.id)
    ? notes.map((n) => (n.id === target.id ? target : n))
    : [...notes, target];
  const cur = galpiByWeek(all, rule).get(weekOf(target.date));
  const on = cur?.id !== target.id;
  const rivals = galpiRivals(all, target).map((r) => ({ ...r, bookmarked_at: null }));
  return { on, moved: on && !!cur, bookmarked_at: on ? now : 0, rivals };
}

/** '10.25 – 10.31' */
export function weekRangeLabel(week: string): string {
  const [y, m, d] = week.split('-').map(Number);
  if (!y) return '';
  const e = new Date(y, m - 1, d + 6);
  return `${m}.${d} – ${e.getMonth() + 1}.${e.getDate()}`;
}

export function newNote(prev: SermonNote | undefined): SermonNote {
  const now = Date.now();
  return {
    id: LOCAL_ID_PREFIX + uid('n'),
    title: '',
    preacher: prev?.preacher || '',
    service: prev?.service || '주일 2부',
    date: todayString(),
    refs: [],
    body: '',
    thoughts: [],
    elapsed: 0,
    created_at: now,
    updated_at: now,
  };
}

/** 서버 content → 노트 (누락 필드 보정) */
export function normalizeNote(
  id: string,
  raw: Partial<SermonContent> | null | undefined,
): SermonNote {
  const c = raw || {};
  const audio = normalizeAudio(c.audio);
  return {
    id,
    title: typeof c.title === 'string' ? c.title : '',
    preacher: typeof c.preacher === 'string' ? c.preacher : '',
    service: typeof c.service === 'string' ? c.service : '',
    ...(typeof c.service_id === 'string' && c.service_id ? { service_id: c.service_id } : {}),
    ...(c.service_auto === true ? { service_auto: true } : {}),
    date: typeof c.date === 'string' ? c.date : '',
    refs: Array.isArray(c.refs) ? c.refs.filter((x): x is string => typeof x === 'string') : [],
    body: typeof c.body === 'string' ? c.body : '',
    thoughts: Array.isArray(c.thoughts) ? (c.thoughts as Thought[]) : [],
    elapsed: typeof c.elapsed === 'number' ? c.elapsed : 0,
    ...(audio ? { audio } : {}),
    ...(typeof c.bookmarked_at === 'number' ? { bookmarked_at: c.bookmarked_at } : {}),
    ...(Array.isArray(c.groups)
      ? {
          groups: c.groups.filter(
            (g): g is NoteGroupLink =>
              !!g && typeof g.group_id === 'string' && typeof g.date === 'string',
          ),
        }
      : {}),
    ...(Array.isArray(c.group_dismissed)
      ? { group_dismissed: c.group_dismissed.filter((x): x is string => typeof x === 'string') }
      : {}),
    created_at: typeof c.created_at === 'number' ? c.created_at : 0,
    updated_at: typeof c.updated_at === 'number' ? c.updated_at : 0,
  };
}

function normalizeAudio(raw: unknown): SermonAudio | undefined {
  const a = raw as Partial<SermonAudio> | null | undefined;
  if (!a || !Array.isArray(a.segments)) return undefined;
  const segments = a.segments
    .filter((s): s is SermonAudioSegment => !!s && typeof s.id === 'string')
    .map((s) => ({
      id: s.id,
      url: typeof s.url === 'string' ? s.url : null,
      mime: typeof s.mime === 'string' ? s.mime : 'audio/webm',
      offset: typeof s.offset === 'number' ? s.offset : 0,
      duration: typeof s.duration === 'number' ? s.duration : 0,
      size: typeof s.size === 'number' ? s.size : 0,
      ...(s.lost ? { lost: true } : {}),
    }))
    .sort((x, y) => x.offset - y.offset);
  return segments.length ? { segments } : undefined;
}

/** 녹음이 끝나는 경과 초 (= 마지막 토막의 offset + duration). 녹음 없으면 0 */
export function audioEnd(n: Pick<SermonNote, 'audio'>): number {
  return (n.audio?.segments || []).reduce((m, s) => Math.max(m, s.offset + s.duration), 0);
}

/** 녹음 총 길이(초) */
export function audioDuration(n: Pick<SermonNote, 'audio'>): number {
  return (n.audio?.segments || []).reduce((a, s) => a + s.duration, 0);
}

/** 아직 서버에 올리지 못한 토막 수. hereOnly 면 이 기기가 올릴 것만 (예전 id 는 파일이 있을 수 있어 센다) */
export function audioPending(n: Pick<SermonNote, 'audio'>, hereOnly = false): number {
  return (n.audio?.segments || []).filter(
    (s) => isLocalId(s.id) && !s.lost && (!hereOnly || !madeElsewhere(s.id)),
  ).length;
}

/** 아직 서버에 올리지 못한 생각 첨부 수. hereOnly 면 이 기기가 올릴 것만 */
export function mediaPending(n: Pick<SermonNote, 'thoughts'>, hereOnly = false): number {
  let c = 0;
  (n.thoughts || []).forEach((t) =>
    (t.media || []).forEach((m) => {
      if (m && isLocalId(m.id) && !m.lost && (!hereOnly || !madeElsewhere(m.id))) c++;
    }),
  );
  return c;
}

/** 다른 기기에서 만든 `local-` id */
function madeElsewhere(id: string): boolean {
  return !madeOnThisDevice(id);
}

/** 경과 초 t 가 속한 토막과 그 안의 위치 */
export function audioLocate(
  n: Pick<SermonNote, 'audio'>,
  t: number,
): { seg: SermonAudioSegment; at: number } | null {
  const segs = n.audio?.segments || [];
  if (!segs.length) return null;
  const hit = segs.find((s) => t >= s.offset && t < s.offset + s.duration);
  if (hit) return { seg: hit, at: t - hit.offset };
  // 토막 사이 빈 구간(끊김) → 다음 토막 처음으로
  const next = segs.find((s) => s.offset >= t);
  if (next) return { seg: next, at: 0 };
  const last = segs[segs.length - 1];
  return { seg: last, at: Math.max(0, last.duration - 1) };
}

export const UNTITLED = '제목 없음';

export { encRef };
