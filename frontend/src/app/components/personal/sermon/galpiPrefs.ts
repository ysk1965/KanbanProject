import { useMemo, useSyncExternalStore } from 'react';
import { galpiByWeek, sundayServices, type GalpiRule, type SermonNote } from './sermonTypes';

/**
 * 갈피 설정 — 「주일 대예배에 자동으로 꽂기」와 「내 주일 예배」.
 * service 가 null 이면 최근 노트에서 많이 쓴 일요일 예배를 쓴다.
 * 화면들은 이 모듈만 읽는다 (기기 키 `sn-galpi-prefs` — 빠른 캐시이자 로그인 전 저장소).
 * 계정 보관은 이름표(profile/useSermonProfile)가 맡는다: 여기 바뀐 값을 이름표 galpi_auto/galpi_service 로 올리고,
 * 서버에서 받은 값은 saveGalpiPrefs 로 여기에 내려 준다.
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
  const next = { ...loadGalpiPrefs(), ...patch };
  next.service = typeof next.service === 'string' && next.service.trim() ? next.service : null;
  if (sameGalpiPrefs(next, loadGalpiPrefs())) return;
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // 저장 못 해도 이번 세션 동안은 유지
  }
  listeners.forEach((l) => l());
}

export function sameGalpiPrefs(a: GalpiPrefs, b: GalpiPrefs): boolean {
  return a.auto === b.auto && (a.service || null) === (b.service || null);
}

export function isDefaultGalpiPrefs(p: GalpiPrefs): boolean {
  return sameGalpiPrefs(p, GALPI_PREFS_DEFAULT);
}

/** 설정이 바뀔 때 (이름표 동기화용) */
export function onGalpiPrefs(l: () => void): () => void {
  return subscribe(l);
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

/** 주일 갈피 스티커 (주일 yyyy-MM-dd → 그 주 갈피 노트). 스티커북과 「모은 설교 스티커」 숫자가 같은 규칙을 쓴다 */
export function useGalpiStickers(notes: SermonNote[]): Map<string, SermonNote> {
  const prefs = useGalpiPrefs();
  return useMemo(() => galpiByWeek(notes, resolveGalpiRule(prefs, notes)), [notes, prefs]);
}
