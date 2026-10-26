import { decRef } from '../bibleRefs';
import type { NoteGroupLink, SermonNote } from '../sermonTypes';
import { worshipForGroupService, worshipOfNote, type WorshipService } from '../worship';
import type { GroupService, SermonGroup, SessionSummary } from './groupApi';

/**
 * 노트 ↔ 모임 설교 자리 연결 규칙. 순수 함수 (테스트: sessionMatch.test.ts)
 *
 * 자리 = 모임 × 예배 × 날짜.
 *  1) 자동: 노트를 연 시각(또는 녹음 시작 시각)이 예배 슬롯의 [시작 −30분, 끝 +3시간] 안이고, 노트 날짜가 그날이면
 *  2) 제안: 같은 주(자리 날짜 ~ +6일)에 쓴 노트가 본문 장이 겹치거나 제목이 비슷하면 후보로
 *  3) 직접: 사용자가 고르기
 * 내가 끈 예배(muted)·「상관없어요」·거절한 자리는 다시 붙이지 않는다.
 */

export const AUTO_BEFORE_MIN = 30;
export const AUTO_AFTER_MIN = 180;

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function dowOf(ds: string): number {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** 자리 키 */
export function slotKey(
  groupId: string,
  serviceId: string | null | undefined,
  date: string,
): string {
  return `${groupId}|${serviceId || ''}|${date}`;
}

export interface AutoHit {
  group_id: string;
  service_id: string;
  date: string;
  part: string | null;
}

/**
 * 이 시각이 어떤 예배 슬롯의 자동 연결 시간대인가.
 * 여러 부가 겹치면 지금 진행 중인 부([시작 −30분, 끝])를 먼저, 없으면 가장 최근에 시작한 부.
 */
export function serviceAt(
  services: GroupService[],
  at: Date,
  muted: string[] = [],
): { service: GroupService; part: string | null } | null {
  const dow = at.getDay();
  const min = at.getHours() * 60 + at.getMinutes();
  let during: { service: GroupService; part: string | null } | null = null;
  let after: { service: GroupService; part: string | null; start: number } | null = null;
  for (const s of services) {
    if (!s.active || muted.includes(s.id)) continue;
    for (const sl of s.slots) {
      if (sl.dow !== dow) continue;
      const st = minutesOf(sl.start);
      const en = minutesOf(sl.end);
      if (min < st - AUTO_BEFORE_MIN || min > en + AUTO_AFTER_MIN) continue;
      if (min <= en) {
        if (!during) during = { service: s, part: sl.part ?? null };
      } else if (!after || st > after.start) {
        after = { service: s, part: sl.part ?? null, start: st };
      }
    }
  }
  if (during) return during;
  return after ? { service: after.service, part: after.part } : null;
}

/**
 * 자동 연결 후보. at = 노트를 연 시각 또는 녹음 시작 시각.
 * 노트 날짜가 at 의 날짜와 다르면(지난 노트를 연 경우) 자동으로 붙이지 않는다.
 */
export function autoMatches(
  note: Pick<SermonNote, 'date' | 'groups' | 'group_dismissed'>,
  groups: SermonGroup[],
  at: Date,
): AutoHit[] {
  const day = ymdLocal(at);
  if (note.date && note.date !== day) return [];
  const out: AutoHit[] = [];
  for (const g of groups) {
    if (g.me.status !== 'active') continue;
    if ((note.groups || []).some((l) => l.group_id === g.id)) continue;
    const hit = serviceAt(g.services, at, g.me.muted_service_ids || []);
    if (!hit) continue;
    if ((note.group_dismissed || []).includes(slotKey(g.id, hit.service.id, day))) continue;
    out.push({ group_id: g.id, service_id: hit.service.id, date: day, part: hit.part });
  }
  return out;
}

/**
 * 노트를 열 때 붙일 자리 (기획 TGNziM4tRteB8koxfNZGb3 판정 순서).
 *  1) 노트의 내 예배와 짝지은 모임 예배 — 모임 시간은 보지 않는다 (교회가 다른 친구 모임). 오늘 노트만
 *  2) 짝 없는 모임은 autoMatches (모임 예배 시간). 내 예배와 짝지은 모임 예배는 시간으로 붙이지 않는다
 * 이미 연결된 모임·거절한 자리·안 드리는 예배는 건너뛴다.
 */
export function linkMatches(
  note: Pick<SermonNote, 'date' | 'service' | 'service_id' | 'groups' | 'group_dismissed'>,
  groups: SermonGroup[],
  worship: WorshipService[],
  at: Date,
): { mapped: NoteGroupLink[]; hits: AutoHit[] } {
  const today = ymdLocal(at);
  const linked = new Set((note.groups || []).map((l) => l.group_id));
  const dismissed = new Set(note.group_dismissed || []);
  const mine = note.date === today ? worshipOfNote(note, worship) : null;
  const mapped: NoteGroupLink[] = [];
  for (const m of mine?.groups || []) {
    const g = groups.find((x) => x.id === m.group_id);
    if (!g || g.me.status !== 'active' || linked.has(g.id)) continue;
    if (mapped.some((x) => x.group_id === g.id)) continue;
    const gs = g.services.find((x) => x.id === m.service_id);
    if (!gs || !gs.active || (g.me.muted_service_ids || []).includes(gs.id)) continue;
    if (dismissed.has(slotKey(g.id, gs.id, today))) continue;
    mapped.push({ group_id: g.id, service_id: gs.id, date: today, how: 'auto' });
  }
  const rest = groups
    .filter((g) => !mapped.some((x) => x.group_id === g.id))
    .map((g) => {
      const paired = g.services
        .filter((gs) => worshipForGroupService(worship, g.id, gs.id))
        .map((gs) => gs.id);
      return paired.length
        ? {
            ...g,
            me: { ...g.me, muted_service_ids: [...(g.me.muted_service_ids || []), ...paired] },
          }
        : g;
    });
  return { mapped, hits: autoMatches(note, rest, at) };
}

/* ───── 제안 ───── */

function norm(s: string): string {
  return s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

/** 글자 두 개씩 묶은 다이스 유사도 0~1 */
export function titleSimilarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++)
      m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let inter = 0;
  gx.forEach((c, k) => {
    inter += Math.min(c, gy.get(k) || 0);
  });
  const total = Math.max(1, x.length - 1 + (y.length - 1));
  return (2 * inter) / total;
}

function chapters(refs: string[] | undefined): Set<string> {
  const s = new Set<string>();
  (refs || []).forEach((r) => {
    const d = decRef(r);
    if (d) s.add(`${d.b}:${d.c}`);
  });
  return s;
}

function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round(
    (new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000,
  );
}

export interface Suggestion {
  group_id: string;
  session: SessionSummary;
  reasons: string[];
  score: number;
}

/**
 * 연결 제안. sessionsByGroup = 모임별 최근 자리(이번 주·지난주 week 응답).
 * 노트 날짜가 자리 날짜 ~ +6일 이고, 본문 장 겹침(+2) / 제목 유사 0.6 이상(+1) / 같은 날(+1) 중 본문 또는 제목이 맞아야 후보.
 */
export function suggestMatches(
  note: Pick<SermonNote, 'date' | 'title' | 'refs' | 'groups' | 'group_dismissed'>,
  groups: SermonGroup[],
  sessionsByGroup: Record<string, SessionSummary[]>,
): Suggestion[] {
  if (!note.date) return [];
  const mine = chapters(note.refs);
  const out: Suggestion[] = [];
  for (const g of groups) {
    if (g.me.status !== 'active') continue;
    if ((note.groups || []).some((l) => l.group_id === g.id)) continue;
    for (const s of sessionsByGroup[g.id] || []) {
      const gap = daysBetween(s.date, note.date);
      if (gap < 0 || gap > 6) continue;
      if ((note.group_dismissed || []).includes(slotKey(g.id, s.service_id, s.date))) continue;
      const reasons: string[] = [];
      let score = 0;
      const theirs = chapters(s.refs);
      const overlap = [...mine].some((c) => theirs.has(c));
      if (overlap) {
        score += 2;
        reasons.push('같은 본문');
      }
      const sim = note.title && s.title ? titleSimilarity(note.title, s.title) : 0;
      if (sim >= 0.6) {
        score += 1;
        reasons.push('비슷한 제목');
      }
      if (!overlap && sim < 0.6) continue;
      if (gap === 0) {
        score += 1;
        reasons.push('같은 날');
      } else reasons.push('같은 주');
      const n = (s.members || []).length;
      if (n) reasons.push(`${n}명 기록`);
      out.push({ group_id: g.id, session: s, reasons, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** 노트에 연결 추가 (같은 모임 연결이 있으면 바꿈) */
export function withLink(note: SermonNote, link: NoteGroupLink): SermonNote {
  const rest = (note.groups || []).filter((l) => l.group_id !== link.group_id);
  return { ...note, groups: [...rest, link] };
}

export function withoutLink(note: SermonNote, groupId: string, dismissKey?: string): SermonNote {
  const groups = (note.groups || []).filter((l) => l.group_id !== groupId);
  const dismissed = dismissKey
    ? [...new Set([...(note.group_dismissed || []), dismissKey])]
    : note.group_dismissed;
  return { ...note, groups, ...(dismissed ? { group_dismissed: dismissed } : {}) };
}

/** 그 주(일요일 시작)의 일요일 yyyy-MM-dd */
export function weekStartOf(ds: string): string {
  const [y, m, d] = ds.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dt.getDay());
  return ymdLocal(dt);
}

/** 예배표로 이번 주(start~+6) 자리 목록을 계산 — 서버 자리가 없어도 「한 주 동안」에 놓을 수 있게 */
export function weekSlots(
  g: SermonGroup,
  weekStart: string,
): Array<{ service: GroupService; date: string; start: string; end: string; part: string | null }> {
  const [y, m, d] = weekStart.split('-').map(Number);
  const out: Array<{
    service: GroupService;
    date: string;
    start: string;
    end: string;
    part: string | null;
  }> = [];
  const muted = g.me.muted_service_ids || [];
  for (const s of g.services) {
    if (!s.active || muted.includes(s.id)) continue;
    // 한 예배가 하루에 여러 부면 그날 자리는 하나 (첫 부 시작 ~ 마지막 부 끝)
    const byDow = new Map<number, { start: string; end: string; parts: string[] }>();
    s.slots.forEach((sl) => {
      const cur = byDow.get(sl.dow);
      if (!cur)
        byDow.set(sl.dow, { start: sl.start, end: sl.end, parts: sl.part ? [sl.part] : [] });
      else {
        if (sl.start < cur.start) cur.start = sl.start;
        if (sl.end > cur.end) cur.end = sl.end;
        if (sl.part) cur.parts.push(sl.part);
      }
    });
    byDow.forEach((v, dow) => {
      out.push({
        service: s,
        date: ymdLocal(new Date(y, m - 1, d + dow)),
        start: v.start,
        end: v.end,
        part:
          v.parts.length > 1 ? `${v.parts[0]}~${v.parts[v.parts.length - 1]}` : v.parts[0] || null,
      });
    });
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** 자리의 지금 상태 */
export function slotPhase(
  date: string,
  start: string,
  end: string,
  now: Date,
): 'before' | 'live' | 'after' {
  const day = ymdLocal(now);
  if (date > day) return 'before';
  if (date < day) return 'after';
  const min = now.getHours() * 60 + now.getMinutes();
  if (min < minutesOf(start) - AUTO_BEFORE_MIN) return 'before';
  if (min <= minutesOf(end) + AUTO_AFTER_MIN) return 'live';
  return 'after';
}
