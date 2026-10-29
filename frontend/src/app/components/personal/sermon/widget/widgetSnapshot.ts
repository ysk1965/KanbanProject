import {
  UNTITLED,
  applyItems,
  mainRef,
  thisWeek,
  type ApplyItem,
  type SermonNote,
} from '../sermonTypes';
import { BOOKS, refLong, type Ref } from '../bibleRefs';
import { rangeText, type Highlight } from '../bibleHighlights';
import { chaptersLabel, parseCh } from '../reading/readingPlan';
import { planOwnerName, planToday, sortForToday } from '../reading/readingStore';
import type { MinePlan } from '../reading/readingApi';
import type { WeekComplete } from '../challenge/challengeApi';
import { localWeekStart } from '../challenge/challengeUtil';
import {
  GALPI_CATEGORY,
  dayEntries,
  weekRaw,
  type CatColor,
  type CatIcon,
  type CatList,
  type WeekPlan,
} from '../weekPlan';

/**
 * iOS 홈·잠금 화면 위젯에 넘길 요약 (앱 → App Group → 위젯).
 * 위젯은 서버를 부르지 못하므로(토큰이 WebView 안에 있음) 앱이 그릴 거리를 모두 미리 계산해 넘긴다.
 *  - 갈피 퀘스트: LifeGalpiCard 와 같은 판정 (보상 20 / 3 / 10 / 20, 적용 실천은 남긴 지 12시간 뒤)
 *  - 오늘 할 일: 「한 주 동안」(weekPlan.ts) — 앱을 안 열어도 날이 바뀌면 그날 칸을 그리도록 남은 요일을 모두 넣는다
 *  - 오늘의 말씀: A 이번 주 설교 말씀 · B 내가 칠한 형광펜(날마다 하나) · C 오늘 읽을 곳
 * 계약(필드 이름)은 ios/App/BridgeWidget/Snapshot.swift 와 같아야 한다. 바꾸면 v 를 올린다.
 * 시안: https://claude.ai/artifact/9Fc4P2VH2CbUXuErmQubKH
 */

export const SNAPSHOT_VERSION = 1;
/** 걸음별 달란트 (서버 TalentAccrualService · LifeGalpiCard 와 같은 값) */
const RW = { note: 20, apply: 3, done: 10, complete: 20 } as const;
const APPLY_TEXT_MIN = 10;
/** 적용 실천은 남긴 지 12시간이 지나야 서버가 인정한다 (SermonNoteFacts.APPLY_DONE_MIN_MS) */
export const DONE_MIN_MS = 12 * 3600_000;
const MAX_DONE = 5;
const MAX_NOTES = 3;
/** 위젯 말씀 칸에 넣을 최대 글자 (큰 위젯에서도 넘치지 않게) */
const VERSE_MAX = 160;
/** B(형광펜)를 미리 골라 둘 날 수 — 앱을 한동안 안 열어도 날마다 바뀌게 */
const LINE_DAYS = 7;

export interface WidgetInk {
  g1: string;
  g2: string;
  g3: string;
  t1: string;
  t2: string;
  g1d: string;
  g2d: string;
  g3d: string;
  paper: string;
  desk: string;
  card: string;
  card2: string;
}

export interface WidgetQuest {
  /** 퀘스트 주 시작 (월요일) yyyy-MM-dd — 위젯은 주가 바뀌면 빈 퀘스트로 그린다 */
  week_start: string;
  note: boolean;
  apply: boolean;
  done: boolean;
  earned: number;
  total: number;
  streak_weeks: number | null;
  sermon: { id: string; date: string; title: string; ref: string | null } | null;
  /** 1걸음 날짜 (노트 날짜) · 2걸음 남긴 시각 · 3걸음 실천 시각 */
  note_date: string | null;
  apply_at: number | null;
  done_at: number | null;
  /** 삶에 꽂을 적용 — 이번 주 것 먼저, 없으면 지난 설교에서 남은 것 */
  target: { note_id: string; thought_id: string; text: string; unlock_at: number } | null;
  bonus: { notes: number; notes_max: number; done: number; done_max: number };
}

export interface WidgetTask {
  key: string;
  text: string;
  cat: string;
  rep: 'once' | 'daily' | 'days';
  done: boolean;
  /** 지난 날에 못 해서 넘어온 것 — 원래 날 */
  carry: string | null;
  /** apply = 설교 적용(노트 thoughts), plan = 한 주 동안에 직접 적은 할 일 */
  kind: 'apply' | 'plan';
  plan_id: string | null;
  note_id: string | null;
  thought_id: string | null;
  /** 적용이면 그 설교 날짜 */
  note_date: string | null;
}

export interface WidgetCat {
  id: string;
  name: string;
  color: CatColor;
  icon: CatIcon;
}

export interface WidgetToday {
  /** 그 주 일요일 */
  week: string;
  cats: WidgetCat[];
  /** 오늘부터 토요일까지 — 그날이 「오늘」일 때 보일 할 일 */
  days: Record<string, WidgetTask[]>;
}

export interface WidgetVerseItem {
  text: string;
  ref: string;
  b: number;
  c: number;
  v: number;
}

export interface WidgetVerse {
  week: (WidgetVerseItem & { note_id: string; title: string; date: string }) | null;
  lines: Record<string, WidgetVerseItem & { memo: string; at: number }>;
  reading: {
    date: string;
    plan_title: string;
    label: string;
    short: string;
    chapters: Array<{ chapter: string; done: boolean }>;
    late: number;
    others: number;
    /** 다음에 읽을 장 b:c (다 읽었으면 null) */
    next: string | null;
  } | null;
}

export interface WidgetSnapshot {
  v: number;
  generated_at: number;
  signed_in: boolean;
  ink: WidgetInk;
  quest: WidgetQuest;
  today: WidgetToday;
  verse: WidgetVerse;
}

export interface SnapshotInput {
  notes: SermonNote[];
  /** 이번 주(일요일) 할 일 */
  plan: WeekPlan;
  cats: CatList;
  anonymous: boolean;
  ink: WidgetInk;
  /** 서버 지갑의 이번 주 판정 (마지막으로 받은 값) — 없으면 기기 노트로 어림 */
  weekComplete?: WeekComplete | null;
  streakWeeks?: number | null;
  /** 이번 주 갈피 노트 (galpiByWeek) — 없으면 이번 주 가장 최근 노트 */
  weekGalpi?: SermonNote | null;
  highlights: Highlight[];
  plans: MinePlan[] | null;
  /** 성경 본문 — 없으면(아직 못 받음) 말씀 칸은 비운다 */
  verseText: ((b: number, c: number, v: number) => string) | null;
  now?: Date;
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + n);
  return t;
}

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// ───────── 갈피 퀘스트 ─────────

export function buildQuest(input: SnapshotInput): WidgetQuest {
  const now = input.now ?? new Date();
  const ws = localWeekStart(now);
  const wsYmd = ymd(ws);
  const notes = input.notes;
  const inWeek = notes
    .filter((n) => (n.date || '') >= wsYmd)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const weekDoneCount = notes.reduce(
    (a, n) =>
      a +
      (n.thoughts || []).filter(
        (t) => t.tag === '적용' && t.done && (t.done_at || 0) >= ws.getTime(),
      ).length,
    0,
  );
  const weekHasApply = inWeek.some((n) =>
    (n.thoughts || []).some(
      (t) => t.tag === '적용' && (t.text || '').trim().length >= APPLY_TEXT_MIN,
    ),
  );
  const wc = input.anonymous ? null : input.weekComplete;
  const s1 = wc ? !!wc.note : inWeek.length > 0;
  const s3 = wc ? !!wc.apply_done : weekDoneCount > 0;
  const s2 = weekHasApply || s3;
  const earned =
    (s1 ? RW.note : 0) + (s2 ? RW.apply : 0) + (s3 ? RW.done : 0) + (s1 && s3 ? RW.complete : 0);

  // SermonList 가 챌린지에 넘기는 목록과 같은 규칙 (최근 7일 설교 = 이번 주)
  const all = applyItems(notes);
  const week = thisWeek(all);
  const weekLeft = week.filter((x) => !x.t.done);
  const weekDone = week.filter((x) => x.t.done);
  const older = all.filter((x) => !week.includes(x) && !x.t.done);
  const target: ApplyItem | null = weekLeft[0] ?? older[0] ?? null;
  const left = week[0] ?? null;
  const weekNote = inWeek[0] ?? null;
  const sermonNote =
    input.weekGalpi && (input.weekGalpi.date || '') >= wsYmd ? input.weekGalpi : weekNote;
  const ref = sermonNote ? mainRef(sermonNote) : null;

  return {
    week_start: wsYmd,
    note: s1,
    apply: s2,
    done: s3,
    earned,
    total: RW.note + RW.apply + RW.done + RW.complete,
    streak_weeks: input.anonymous ? null : (input.streakWeeks ?? null),
    sermon: sermonNote
      ? {
          id: sermonNote.id,
          date: sermonNote.date,
          title: sermonNote.title || UNTITLED,
          ref: ref ? refLong(ref) : null,
        }
      : null,
    note_date: weekNote?.date ?? null,
    apply_at: left?.t.at ?? null,
    done_at: weekDone[0]?.t.done_at ?? null,
    target: target
      ? {
          note_id: target.n.id,
          thought_id: target.t.id,
          text: clip(target.t.text || '(사진·영상 메모)', 80),
          unlock_at: input.anonymous ? 0 : (target.t.at || 0) + DONE_MIN_MS,
        }
      : null,
    bonus: {
      notes: Math.min(inWeek.length, MAX_NOTES),
      notes_max: MAX_NOTES,
      done: Math.min(weekDoneCount, MAX_DONE),
      done_max: MAX_DONE,
    },
  };
}

// ───────── 오늘 할 일 ─────────

export function buildToday(input: SnapshotInput): WidgetToday {
  const now = input.now ?? new Date();
  const sun = addDays(now, -now.getDay());
  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(sun, i)));
  const today = ymd(now);
  const raw = weekRaw(input.notes, input.plan, days, today);
  const out: Record<string, WidgetTask[]> = {};
  days
    .filter((d) => d >= today)
    .forEach((d) => {
      out[d] = dayEntries(raw, d, days, d)
        .filter((e) => !e.moved)
        .map((e) => ({
          key: e.key,
          text: clip(e.text, 60),
          cat: e.cat,
          rep: e.rep,
          done: e.done,
          carry: e.carry ?? null,
          kind: e.note && e.thought ? ('apply' as const) : ('plan' as const),
          plan_id: e.planId ?? null,
          note_id: e.note?.id ?? null,
          thought_id: e.thought?.id ?? null,
          note_date: e.note?.date ?? null,
        }));
    });
  const cats: WidgetCat[] = [GALPI_CATEGORY, ...input.cats.cats].map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
  }));
  return { week: days[0], cats, days: out };
}

// ───────── 오늘의 말씀 ─────────

function refText(r: Ref, verseText: (b: number, c: number, v: number) => string): string {
  const parts: string[] = [];
  for (let v = r.v1; v <= r.v2 && parts.join(' ').length < VERSE_MAX; v++) {
    const t = verseText(r.b, r.c, v);
    if (t) parts.push(t);
  }
  return clip(parts.join(' '), VERSE_MAX);
}

function hlRef(h: Highlight): string {
  const name = BOOKS[h.b]?.[0] ?? '';
  return h.v2 > h.v1 ? `${name} ${h.c}:${h.v1}–${h.v2}` : `${name} ${h.c}:${h.v1}`;
}

/** 날짜마다 늘 같은 하나를 고르는 작은 해시 — 같은 날엔 몇 번을 다시 계산해도 같은 형광펜 */
function dayHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildVerse(input: SnapshotInput): WidgetVerse {
  const now = input.now ?? new Date();
  const vt = input.verseText;
  let week: WidgetVerse['week'] = null;
  const ws = ymd(addDays(now, -now.getDay()));
  const src =
    input.weekGalpi && (input.weekGalpi.date || '') >= ws
      ? input.weekGalpi
      : ([...input.notes]
          .filter((n) => (n.date || '') >= ws && mainRef(n))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] ?? null);
  const r = src ? mainRef(src) : null;
  if (src && r && vt) {
    const text = refText(r, vt);
    if (text)
      week = {
        text,
        ref: refLong(r),
        b: r.b,
        c: r.c,
        v: r.v1,
        note_id: src.id,
        title: src.title || UNTITLED,
        date: src.date,
      };
  }

  const lines: WidgetVerse['lines'] = {};
  if (vt) {
    const pool = input.highlights
      .map((h) => ({
        h,
        text: clip(
          rangeText(h, (v) => vt(h.b, h.c, v)),
          VERSE_MAX,
        ),
      }))
      .filter((x) => x.text)
      .sort((a, b) => a.h.id.localeCompare(b.h.id));
    if (pool.length) {
      for (let i = 0; i < LINE_DAYS; i++) {
        const d = ymd(addDays(now, i));
        const { h, text } = pool[dayHash(d) % pool.length];
        lines[d] = {
          text,
          ref: hlRef(h),
          b: h.b,
          c: h.c,
          v: h.v1,
          memo: clip(h.memo || '', 60),
          at: h.at,
        };
      }
    }
  }

  let reading: WidgetVerse['reading'] = null;
  const today = ymd(now);
  const withToday = sortForToday(input.plans || []).filter(
    (p) => (p.today_chapters || []).length || planToday(p, today).late.length,
  );
  const main = withToday[0];
  if (main) {
    const t = planToday(main, today);
    const keys = t.chapters.map((c) => c.chapter);
    const next = [
      ...t.late.map((d) => d.chapter),
      ...t.chapters.filter((c) => !c.done).map((c) => c.chapter),
    ].find((k) => !!parseCh(k));
    reading = {
      date: today,
      plan_title: main.group_id ? planOwnerName(main) : main.title || planOwnerName(main),
      label: keys.length ? chaptersLabel(keys) : chaptersLabel(t.late.map((d) => d.chapter)),
      short: keys.length
        ? chaptersLabel(keys, true)
        : chaptersLabel(
            t.late.map((d) => d.chapter),
            true,
          ),
      chapters: t.chapters.map((c) => ({ chapter: c.chapter, done: c.done })),
      late: t.late.length,
      others: withToday.length - 1,
      next: next ?? null,
    };
  }
  return { week, lines, reading };
}

export function buildSnapshot(input: SnapshotInput): WidgetSnapshot {
  return {
    v: SNAPSHOT_VERSION,
    generated_at: (input.now ?? new Date()).getTime(),
    signed_in: !input.anonymous,
    ink: input.ink,
    quest: buildQuest(input),
    today: buildToday(input),
    verse: buildVerse(input),
  };
}
