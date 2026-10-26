import { useSyncExternalStore } from 'react';
import { sundayServices, type GalpiRule, type SermonNote } from './sermonTypes';

/**
 * 갈피 설정 — 「주일 대예배에 자동으로 꽂기」와 「내 주일 예배」.
 * 기기 저장(localStorage)만 (sermonLook 과 같음). service 가 null 이면 최근 노트에서 많이 쓴 일요일 예배를 쓴다.
 */
export interface GalpiPrefs {
  auto: boolean;
  service: string | null;
}

const KEY = 'sn-galpi-prefs';
export const GALPI_PREFS_DEFAULT: GalpiPrefs = { auto: true, service: null };

let current: GalpiPrefs | null = null;
const listeners = new Set<() => void>();

export function loadGalpiPrefs(): GalpiPrefs {
  if (current) return current;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<GalpiPrefs> | null;
    current = {
      auto: typeof raw?.auto === 'boolean' ? raw.auto : GALPI_PREFS_DEFAULT.auto,
      service: typeof raw?.service === 'string' && raw.service.trim() ? raw.service : null,
    };
  } catch {
    current = GALPI_PREFS_DEFAULT;
  }
  return current;
}

export function saveGalpiPrefs(patch: Partial<GalpiPrefs>) {
  current = { ...loadGalpiPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // 저장 못 해도 이번 세션 동안은 유지
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useGalpiPrefs(): GalpiPrefs {
  return useSyncExternalStore(subscribe, loadGalpiPrefs, loadGalpiPrefs);
}

/** 설정 + 노트 → 갈피 규칙. 예배를 안 골랐으면 최근 8주 일요일 노트에서 가장 많이 쓴 예배 */
export function resolveGalpiRule(prefs: GalpiPrefs, notes: SermonNote[]): GalpiRule {
  return {
    auto: prefs.auto,
    service: prefs.service ?? sundayServices(notes)[0]?.service ?? null,
  };
}

/** 테스트용 — 모듈 캐시 비우기 */
export function resetGalpiPrefsCache() {
  current = null;
}
