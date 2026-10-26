import type { GroupService, ServiceSlot } from './group/groupApi';
import { sameService, weekOf, type SermonNote } from './sermonTypes';

/**
 * 「내 예배표」 — 내가 드리는 예배(요일·시각·내 부)와 갈피 예배, 모임 예배와의 짝.
 * 모임 예배표(GroupService)와 같은 모양에 개인 칸만 더한다 → ServicePicker 조각·serviceAt 판정을 그대로 쓴다.
 *  - active: 이 시간에 노트를 열면 예배 칸 자동 채우기
 *  - my_part: 여러 시각 중 내가 가는 시각(시작 "HH:mm"). 있으면 그 시각만 판정하고 이름 뒤에 「n부」를 붙인다
 *  - galpi: 갈피 예배 (하나만)
 *  - groups: 짝지은 모임 예배 (모임 id + 모임 예배 id)
 * 저장: galpiPrefs(기기) ↔ 이름표 worship_services(계정).
 */
export interface WorshipLink {
  group_id: string;
  service_id: string;
}

export interface WorshipService extends GroupService {
  my_part?: string | null;
  galpi?: boolean;
  groups?: WorshipLink[];
}

export const WORSHIP_MAX = 12;
export const WORSHIP_NAME_MAX = 30;
const SLOT_MAX = 14;
const LINK_MAX = 20;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const AUTO_BEFORE_MIN = 30;
export const AUTO_AFTER_MIN = 180;

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toT = (m: number) => {
  const v = Math.max(0, Math.min(1439, m));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const clip = (s: unknown, max: number): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t ? [...t].slice(0, max).join('') : null;
};

/** 서버·기기 값을 믿지 않고 다듬는다. 갈피는 처음 것 하나만 */
export function normalizeWorship(raw: unknown): WorshipService[] {
  if (!Array.isArray(raw)) return [];
  const out: WorshipService[] = [];
  const ids = new Set<string>();
  let galpi = false;
  for (const r of raw as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object' || out.length >= WORSHIP_MAX) continue;
    const id = clip(r.id, 20);
    const name = clip(r.name, WORSHIP_NAME_MAX);
    if (!id || !name || ids.has(id)) continue;
    ids.add(id);
    const slots: ServiceSlot[] = [];
    if (Array.isArray(r.slots)) {
      for (const s of r.slots as Array<Record<string, unknown>>) {
        if (slots.length >= SLOT_MAX || !s) continue;
        const dow = typeof s.dow === 'number' ? s.dow : -1;
        const start = typeof s.start === 'string' && HHMM.test(s.start) ? s.start : null;
        if (dow < 0 || dow > 6 || !Number.isInteger(dow) || !start) continue;
        const end = typeof s.end === 'string' && HHMM.test(s.end) ? s.end : toT(toMin(start) + 90);
        slots.push({ dow, start, end, part: clip(s.part, 10) });
      }
    }
    const groups: WorshipLink[] = [];
    if (Array.isArray(r.groups)) {
      for (const g of r.groups as Array<Record<string, unknown>>) {
        const gid = clip(g?.group_id, 36);
        const sid = clip(g?.service_id, 20);
        if (!gid || !sid || groups.length >= LINK_MAX) continue;
        if (groups.some((x) => x.group_id === gid && x.service_id === sid)) continue;
        groups.push({ group_id: gid, service_id: sid });
      }
    }
    const myPart = clip(r.my_part, 10);
    const isGalpi = r.galpi === true && !galpi;
    if (isGalpi) galpi = true;
    out.push({
      id,
      name,
      active: r.active !== false && r.auto !== false,
      slots,
      my_part: myPart && slots.some((s) => s.start === myPart) ? myPart : null,
      galpi: isGalpi,
      groups,
    });
  }
  return out;
}

/** 서버로 보내는 모양 (auto = active) */
export function worshipToServer(list: WorshipService[]) {
  return list.map((s) => ({
    id: s.id,
    name: s.name,
    slots: s.slots.map((x) => ({ dow: x.dow, start: x.start, end: x.end, part: x.part ?? null })),
    my_part: s.my_part ?? null,
    auto: s.active,
    galpi: !!s.galpi,
    groups: s.groups || [],
  }));
}

export function sameWorship(a: WorshipService[], b: WorshipService[]): boolean {
  return JSON.stringify(worshipToServer(a)) === JSON.stringify(worshipToServer(b));
}

export function newWorshipId(list: WorshipService[]): string {
  let i = list.length + 1;
  while (list.some((s) => s.id === `w${i}`)) i++;
  return `w${i}`;
}

/** 내가 가는 시각의 순서 → 「2부」. 그날 시각이 하나뿐이면 없음 */
export function partLabel(s: WorshipService): string | null {
  if (!s.my_part) return null;
  const mine = s.slots.find((x) => x.start === s.my_part);
  if (!mine) return null;
  if (mine.part) return mine.part;
  const times = [...new Set(s.slots.filter((x) => x.dow === mine.dow).map((x) => x.start))].sort();
  if (times.length < 2) return null;
  return `${times.indexOf(mine.start) + 1}부`;
}

/** 노트 예배 칸에 들어갈 이름 — 「주일 설교 2부」. 이름에 이미 「n부」가 있으면 그대로 */
export function worshipLabel(s: WorshipService): string {
  const p = partLabel(s);
  if (!p || s.name.replace(/\s+/g, '').includes(p)) return s.name;
  return `${s.name} ${p}`;
}

/** 판정에 쓰는 시각 — 내 부가 있으면 그 시각만 */
export function mySlots(s: WorshipService): ServiceSlot[] {
  if (!s.my_part) return s.slots;
  const mine = s.slots.filter((x) => x.start === s.my_part);
  return mine.length ? mine : s.slots;
}

export function galpiWorship(list: WorshipService[]): WorshipService | null {
  return list.find((s) => s.galpi) ?? null;
}

/** "일 11:00", "월~토 5:30", "수 19:30 외 1" */
export function worshipTimes(s: WorshipService): string {
  const slots = mySlots(s);
  if (!slots.length) return '시간 없음';
  const D = '일월화수목금토';
  const dows = [...new Set(slots.map((x) => x.dow))].sort((a, b) => a - b);
  const times = [...new Set(slots.map((x) => x.start))].sort();
  const days =
    dows.length >= 5 && dows[dows.length - 1] - dows[0] === dows.length - 1
      ? `${D[dows[0]]}~${D[dows[dows.length - 1]]}`
      : dows.map((d) => D[d]).join('·');
  const first = times[0].replace(/^0/, '');
  return `${days} ${first}${times.length > 1 ? ` 외 ${times.length - 1}` : ''}`;
}

/**
 * 이 시각에 드리는 내 예배 — [시작 −30분, 끝 +3시간]. 겹치면 진행 중인 쪽, 없으면 가장 최근에 시작한 쪽.
 * 자동 채우기를 끈 예배(active=false)는 보지 않는다.
 */
export function worshipAt(list: WorshipService[], at: Date): WorshipService | null {
  const dow = at.getDay();
  const min = at.getHours() * 60 + at.getMinutes();
  let during: WorshipService | null = null;
  let after: { s: WorshipService; start: number } | null = null;
  for (const s of list) {
    if (!s.active) continue;
    for (const sl of mySlots(s)) {
      if (sl.dow !== dow) continue;
      const st = toMin(sl.start);
      const en = toMin(sl.end);
      if (min < st - AUTO_BEFORE_MIN || min > en + AUTO_AFTER_MIN) continue;
      if (min <= en) {
        if (!during) during = s;
      } else if (!after || st > after.start) after = { s, start: st };
    }
  }
  return during ?? after?.s ?? null;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 새 노트(또는 빈 노트에서 녹음 시작)에 예배 칸 채우기. 노트 날짜가 그날이고 예배 칸이 비었거나
 * 직접 고친 적 없는 기본값일 때만. 채웠으면 바뀐 노트, 아니면 null.
 */
export function fillWorship(
  note: SermonNote,
  list: WorshipService[],
  at: Date,
  opts: { force?: boolean } = {},
): SermonNote | null {
  if (note.date && note.date !== ymd(at)) return null;
  if (!opts.force && note.service_id) return null;
  const s = worshipAt(list, at);
  if (!s) return null;
  return { ...note, service: worshipLabel(s), service_id: s.id, service_auto: true };
}

/** 노트가 어느 내 예배인가 — id 가 있으면 id, 없으면 이름 */
export function worshipOfNote(
  note: Pick<SermonNote, 'service' | 'service_id'>,
  list: WorshipService[],
): WorshipService | null {
  if (note.service_id) {
    const hit = list.find((s) => s.id === note.service_id);
    if (hit) return hit;
  }
  if (!note.service) return null;
  return (
    list.find((s) => sameService(worshipLabel(s), note.service)) ??
    list.find((s) => sameService(s.name, note.service)) ??
    null
  );
}

/* ───── 모임 짝 ───── */

/** 이 모임 예배와 짝지은 내 예배 */
export function worshipForGroupService(
  list: WorshipService[],
  groupId: string,
  serviceId: string | null | undefined,
): WorshipService | null {
  if (!serviceId) return null;
  return (
    list.find((s) =>
      (s.groups || []).some((g) => g.group_id === groupId && g.service_id === serviceId),
    ) ?? null
  );
}

/** 모임 예배 하나를 내 예배 하나에 맞춘다 (null = 짝 풀기). 모임 예배 하나 ↔ 내 예배 하나 */
export function setGroupMatch(
  list: WorshipService[],
  groupId: string,
  groupServiceId: string,
  worshipId: string | null,
): WorshipService[] {
  return list.map((s) => {
    const rest = (s.groups || []).filter(
      (g) => !(g.group_id === groupId && g.service_id === groupServiceId),
    );
    return s.id === worshipId
      ? { ...s, groups: [...rest, { group_id: groupId, service_id: groupServiceId }] }
      : { ...s, groups: rest };
  });
}

/** 모임을 나갔거나 없어진 짝 지우기 */
export function pruneGroupLinks(
  list: WorshipService[],
  liveGroupIds: Set<string>,
): WorshipService[] {
  return list.map((s) => ({
    ...s,
    groups: (s.groups || []).filter((g) => liveGroupIds.has(g.group_id)),
  }));
}

/**
 * 짝 미리 고르기: 요일·시간이 겹치는 내 예배 → 이름이 같은 내 예배 → 없음.
 */
export function guessMatch(list: WorshipService[], gs: GroupService): WorshipService | null {
  const overlap = (a: ServiceSlot, b: ServiceSlot) =>
    a.dow === b.dow && toMin(a.start) < toMin(b.end) + 1 && toMin(b.start) < toMin(a.end) + 1;
  return (
    list.find((s) => mySlots(s).some((a) => gs.slots.some((b) => overlap(a, b)))) ??
    list.find((s) => sameService(s.name, gs.name)) ??
    null
  );
}

/** 모임 예배 → 내 예배표에 새로 넣을 예배 */
export function worshipFromGroupService(
  list: WorshipService[],
  gs: GroupService,
  groupId: string,
): WorshipService {
  return {
    id: newWorshipId(list),
    name: gs.name.slice(0, WORSHIP_NAME_MAX),
    active: true,
    slots: gs.slots.map((x) => ({ ...x })),
    my_part: null,
    galpi: false,
    groups: [{ group_id: groupId, service_id: gs.id }],
  };
}

/* ───── 처음 설정 제안 ───── */

/**
 * 최근 weeks 주 노트에서 예배표를 추측한다. 같은 예배 이름·같은 요일 노트가 2번 이상이면 한 줄.
 * 시각은 노트를 만든 시각의 중앙값(30분 단위), 끝은 +90분. 일요일에 가장 많이 쓴 예배가 갈피.
 */
export function suggestWorship(
  notes: SermonNote[],
  today: Date = new Date(),
  weeks = 8,
): Array<WorshipService & { count: number }> {
  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7 * weeks);
  const acc = new Map<string, { name: string; dow: number; mins: number[]; count: number }>();
  for (const n of notes) {
    const name = (n.service || '').trim();
    if (!name || !n.date || !n.created_at) continue;
    const [y, m, d] = n.date.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    if (day < since || day > today) continue;
    const made = new Date(n.created_at);
    if (ymd(made) !== n.date) continue;
    const key = `${name.replace(/\s+/g, '')}|${day.getDay()}`;
    const cur = acc.get(key) || { name, dow: day.getDay(), mins: [], count: 0 };
    cur.mins.push(made.getHours() * 60 + made.getMinutes());
    cur.count += 1;
    acc.set(key, cur);
  }
  const rows = [...acc.values()]
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  let galpiSet = false;
  const sundayTop = rows.find((r) => r.dow === 0);
  return rows.map((r, i) => {
    const sorted = [...r.mins].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    // 노트는 보통 예배가 시작한 뒤에 연다 — 30분 단위로 내린다
    const start = Math.floor(med / 30) * 30;
    const galpi = !galpiSet && r === sundayTop;
    if (galpi) galpiSet = true;
    return {
      id: `w${i + 1}`,
      name: r.name.slice(0, WORSHIP_NAME_MAX),
      active: true,
      slots: [{ dow: r.dow, start: toT(start), end: toT(start + 90), part: null }],
      my_part: null,
      galpi,
      groups: [],
      count: r.count,
    };
  });
}

/** 옛 「내 주일 예배」 이름만 있던 설정 → 시간 없는 예배 하나 (갈피) */
export function worshipFromLegacy(service: string | null): WorshipService[] {
  const name = clip(service, WORSHIP_NAME_MAX);
  if (!name) return [];
  return [{ id: 'w1', name, active: true, slots: [], my_part: null, galpi: true, groups: [] }];
}

/** 이번 주 내 예배 자리 (한 주 동안 점선 칸) — 날짜 순 */
export function weekWorshipSlots(
  list: WorshipService[],
  weekStart: string,
): Array<{ date: string; service: WorshipService; start: string }> {
  if (!weekStart || weekOf(weekStart) !== weekStart) return [];
  const [y, m, d] = weekStart.split('-').map(Number);
  const out: Array<{ date: string; service: WorshipService; start: string }> = [];
  for (const s of list) {
    const seen = new Set<number>();
    for (const sl of [...mySlots(s)].sort((a, b) => a.start.localeCompare(b.start))) {
      if (seen.has(sl.dow)) continue;
      seen.add(sl.dow);
      out.push({ date: ymd(new Date(y, m - 1, d + sl.dow)), service: s, start: sl.start });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

/** 짝 없는 모임 예배 → 추천 내 예배 (안 드리는 예배·이미 다른 짝이 있는 내 예배도 추천할 수 있다) */
export function pendingGuesses(
  list: WorshipService[],
  group: { id: string; services: GroupService[] },
  muted: string[] = [],
): Map<string, WorshipService> {
  const out = new Map<string, WorshipService>();
  for (const gs of group.services) {
    if (!gs.active || muted.includes(gs.id)) continue;
    if (worshipForGroupService(list, group.id, gs.id)) continue;
    const g = guessMatch(list, gs);
    if (g) out.set(gs.id, g);
  }
  return out;
}

/** 추천을 한 번에 적용 */
export function applyGuesses(
  list: WorshipService[],
  group: { id: string; services: GroupService[] },
  muted: string[] = [],
): WorshipService[] {
  let next = list;
  pendingGuesses(list, group, muted).forEach((w, gsId) => {
    next = setGroupMatch(next, group.id, gsId, w.id);
  });
  return next;
}

/** 아직 짝도, 「안 드려요」도 아닌 모임 예배가 있나 */
export function needsMatch(
  list: WorshipService[],
  group: { id: string; services: GroupService[] },
  muted: string[] = [],
): boolean {
  return group.services.some(
    (gs) => gs.active && !muted.includes(gs.id) && !worshipForGroupService(list, group.id, gs.id),
  );
}
