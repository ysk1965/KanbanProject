import { useEffect, useSyncExternalStore } from 'react';
import { useSermonGroups } from '../group/GroupContext';
import { todayString } from '../sermonTypes';
import { readingAPI, type DueChapter, type MinePlan } from './readingApi';

/**
 * 「읽는 중인 길」 — 내 모든 길(모임 길 + 내 읽기표) 캐시. 성경 읽기 화면과 모임 통독 탭이 같이 쓴다.
 * 60초 안에 다시 열면 요청하지 않는다. 도장·길 만들기 뒤엔 refreshMine() 으로 새로 받는다.
 */

let plans: MinePlan[] | null = null;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function refreshMine(): Promise<void> {
  if (inflight) return inflight;
  inflight = readingAPI
    .mine(todayString())
    .then((r) => {
      plans = r.plans || [];
      loadedAt = Date.now();
    })
    .catch(() => {
      /* 다음에 다시 */
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

/** 로그아웃 등 — 캐시를 비운다 */
export function clearMine() {
  plans = null;
  loadedAt = 0;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useMinePlans(enabled: boolean): MinePlan[] | null {
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    if (enabled && Date.now() - loadedAt > 60_000) void refreshMine();
  }, [enabled]);
  return enabled ? plans : null;
}

/** 내 길 모두 — 로그인한 사람만(길은 서버에만 있다), 아니면 null */
export function useMyPlans(): MinePlan[] | null {
  const g = useSermonGroups();
  return useMinePlans(!!g && !g.anonymous);
}

/** 이 장을 오늘(또는 밀려서) 읽어야 하는 길들 */
export function plansDueFor(list: MinePlan[] | null, chapter: string) {
  return (list || []).flatMap((p) => {
    const d = (p.due || []).find((x) => x.chapter === chapter);
    return d ? [{ plan: p, dayNo: d.day_no }] : [];
  });
}

/** 다음 읽을 장 — 모든 길의 due 중 날짜가 가장 이른 것 (except 는 빼고) */
export function nextDue(list: MinePlan[] | null, except?: string): string | null {
  let best: { date: string; chapter: string } | null = null;
  (list || []).forEach((p) =>
    (p.due || []).forEach((d) => {
      if (d.chapter === except) return;
      if (!best || d.date < best.date) best = d;
    }),
  );
  return best ? (best as { chapter: string }).chapter : null;
}

/** 이름 — 모임 길은 모임 이름, 혼자 읽는 길은 "내 읽기표" */
export const planOwnerName = (p: { group_name?: string; group_id?: string }) =>
  p.group_id ? p.group_name || '모임' : '내 읽기표';

/** 오늘 이 길에서 볼 것 — 밀린 장(오늘 전 날짜) · 오늘 장 · 남은 장 수 */
export function planToday(p: MinePlan, today = todayString()) {
  const late = (p.due || []).filter((d) => d.date < today);
  const chapters = p.today_chapters || [];
  const left = (p.due || []).length;
  return {
    late,
    chapters,
    left,
    /** 오늘 장이 있었고 밀린 장까지 모두 읽었다 */
    done: chapters.length > 0 && left === 0,
  };
}

/**
 * 띠·카드 순서 — 안 읽은 길이 먼저: 밀린 길 → 오늘 남은 길 → 오늘 다 읽은 길 → 오늘 읽을 곳 없는 길.
 * 같은 무리 안에서는 서버 순서(모임 길 먼저) 그대로.
 */
export function sortForToday(list: MinePlan[]): MinePlan[] {
  const today = todayString();
  const rank = (p: MinePlan) => {
    const t = planToday(p, today);
    if (t.late.length) return 0;
    if (t.left) return 1;
    if (t.done) return 2;
    return 3;
  };
  return list
    .map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.p);
}

/**
 * 장 끝 「다음」이 따라갈 길의 다음 장 — 지금 장이 어느 길의 오늘(또는 밀린) 장일 때만.
 * 길과 상관없는 장을 읽는 중이면 null (성경 순서 그대로).
 */
export function nextOnPath(
  list: MinePlan[] | null,
  here: string,
): { chapter: string; tag: string } | null {
  if (!list?.length) return null;
  const onPath = list.some(
    (p) =>
      (p.due || []).some((d) => d.chapter === here) ||
      (p.today_chapters || []).some((t) => t.chapter === here),
  );
  if (!onPath) return null;
  const today = todayString();
  let best: { p: MinePlan; d: DueChapter } | null = null;
  list.forEach((p) =>
    (p.due || []).forEach((d) => {
      if (d.chapter === here) return;
      if (!best || d.date < best.d.date) best = { p, d };
    }),
  );
  if (!best) return null;
  const { p, d } = best as { p: MinePlan; d: DueChapter };
  if (d.date < today) return { chapter: d.chapter, tag: '밀린 장' };
  const tc = p.today_chapters || [];
  const i = tc.findIndex((t) => t.chapter === d.chapter);
  return { chapter: d.chapter, tag: i >= 0 ? `오늘 ${i + 1}/${tc.length}` : '오늘' };
}
