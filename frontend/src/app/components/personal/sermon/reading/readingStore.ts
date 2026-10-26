import { useEffect, useSyncExternalStore } from 'react';
import { todayString } from '../sermonTypes';
import { readingAPI, type MinePlan } from './readingApi';

/**
 * 「읽는 중인 길」 — 내 모든 길(모임 길 + 나의 길) 캐시. 성경 읽기 화면과 모임 통독 탭이 같이 쓴다.
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

/** 이름 — 모임 길은 모임 이름, 나의 길은 "나의 길" */
export const planOwnerName = (p: { group_name?: string; group_id?: string }) =>
  p.group_id ? p.group_name || '모임' : '나의 길';
