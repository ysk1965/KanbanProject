import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { isNative } from '../utils/platform';

const STORAGE_KEY = 'bridge_holiday_country';
const SOURCE_STORAGE_KEY = 'bridge_holiday_source';

export interface HolidayInfo {
  date: string;
  name: string;
  type: string;
}

export interface CountryOption {
  code: string;
  flag: string;
  label: string;
}

export type HolidaySource = 'device' | 'library' | 'off';

export const COUNTRY_LIST: CountryOption[] = [
  { code: 'KR', flag: '🇰🇷', label: '한국' },
  { code: 'US', flag: '🇺🇸', label: 'United States' },
  { code: 'JP', flag: '🇯🇵', label: '日本' },
  { code: 'CN', flag: '🇨🇳', label: '中国' },
  { code: 'TW', flag: '🇹🇼', label: '台灣' },
  { code: 'IN', flag: '🇮🇳', label: 'India' },
  { code: 'VN', flag: '🇻🇳', label: 'Việt Nam' },
  { code: 'TH', flag: '🇹🇭', label: 'ไทย' },
  { code: 'ES', flag: '🇪🇸', label: 'España' },
  { code: 'BR', flag: '🇧🇷', label: 'Brasil' },
  { code: 'GB', flag: '🇬🇧', label: 'United Kingdom' },
  { code: 'DE', flag: '🇩🇪', label: 'Deutschland' },
  { code: 'FR', flag: '🇫🇷', label: 'France' },
  { code: 'CA', flag: '🇨🇦', label: 'Canada' },
  { code: 'AU', flag: '🇦🇺', label: 'Australia' },
  { code: 'SG', flag: '🇸🇬', label: 'Singapore' },
  { code: 'PH', flag: '🇵🇭', label: 'Philippines' },
  { code: 'ID', flag: '🇮🇩', label: 'Indonesia' },
  { code: 'MY', flag: '🇲🇾', label: 'Malaysia' },
  { code: 'IT', flag: '🇮🇹', label: 'Italia' },
];

export const LOCALE_TO_COUNTRY: Record<string, string> = {
  ko: 'KR',
  en: 'US',
  ja: 'JP',
  zh: 'CN',
  'zh-TW': 'TW',
  hi: 'IN',
  vi: 'VN',
  es: 'ES',
  'pt-BR': 'BR',
  th: 'TH',
};

// Lazy-loaded Holidays class (code-split date-holidays ~1.4MB)
let HolidaysClass: any = null;
const loadHolidays = () => import('date-holidays').then((m) => { HolidaysClass = m.default; });

function getInitialSource(): HolidaySource {
  try {
    const stored = localStorage.getItem(SOURCE_STORAGE_KEY);
    if (stored === 'device' || stored === 'library' || stored === 'off') return stored;
  } catch { /* ignore */ }
  // Native apps default to 'device', web defaults to 'library'
  return isNative() ? 'device' : 'library';
}

export function useHolidays(locale: string, year: number) {
  const defaultCountry = LOCALE_TO_COUNTRY[locale] || 'US';

  const [country, setCountry] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || defaultCountry;
    } catch {
      return defaultCountry;
    }
  });

  const [holidaySource, setHolidaySource] = useState<HolidaySource>(getInitialSource);
  const [holidayMap, setHolidayMap] = useState<Map<string, HolidayInfo[]>>(new Map());

  // Sync country when locale changes and no explicit preference is stored
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setCountry(LOCALE_TO_COUNTRY[locale] || 'US');
      }
    } catch { /* ignore */ }
  }, [locale]);

  const changeCountry = useCallback((code: string) => {
    setCountry(code);
    try {
      if (code) {
        localStorage.setItem(STORAGE_KEY, code);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  const changeHolidaySource = useCallback((source: HolidaySource) => {
    setHolidaySource(source);
    try {
      localStorage.setItem(SOURCE_STORAGE_KEY, source);
    } catch { /* ignore */ }
  }, []);

  // Device calendar holidays (native only)
  useEffect(() => {
    if (holidaySource !== 'device' || !isNative()) return;

    let cancelled = false;

    const fetchDevice = async () => {
      try {
        const { fetchDeviceHolidays, requestCalendarPermission } = await import('../utils/nativeCalendar');

        // Request permission first
        const perm = await requestCalendarPermission();
        if (cancelled) return;

        if (perm !== 'granted') {
          console.log('[useHolidays] Calendar permission not granted, falling back to library');
          // Fallback to library without changing the stored preference
          await computeLibraryHolidays(country, year, cancelled, setHolidayMap);
          return;
        }

        const deviceMap = await fetchDeviceHolidays(year);
        if (cancelled) return;

        if (deviceMap && deviceMap.size > 0) {
          setHolidayMap(deviceMap);
        } else {
          // No holiday calendar found on device, fallback to library
          console.log('[useHolidays] No device holidays found, falling back to library');
          await computeLibraryHolidays(country, year, cancelled, setHolidayMap);
        }
      } catch (e) {
        console.warn('[useHolidays] Device calendar error, falling back to library:', e);
        if (!cancelled) {
          await computeLibraryHolidays(country, year, cancelled, setHolidayMap);
        }
      }
    };

    fetchDevice();
    return () => { cancelled = true; };
  }, [holidaySource, year, country]);

  // Library holidays (date-holidays)
  useEffect(() => {
    if (holidaySource !== 'library') return;

    let cancelled = false;
    computeLibraryHolidays(country, year, cancelled, setHolidayMap).then(() => {});
    return () => { cancelled = true; };
  }, [holidaySource, country, year]);

  // Off mode
  useEffect(() => {
    if (holidaySource !== 'off') return;
    setHolidayMap(new Map());
  }, [holidaySource]);

  return { country, changeCountry, holidayMap, countries: COUNTRY_LIST, holidaySource, changeHolidaySource };
}

async function computeLibraryHolidays(
  country: string,
  year: number,
  cancelled: boolean,
  setHolidayMap: (m: Map<string, HolidayInfo[]>) => void,
) {
  if (!country) {
    if (!cancelled) setHolidayMap(new Map());
    return;
  }
  const map = await buildLibraryHolidayMap(country, year);
  if (!cancelled) setHolidayMap(map);
}

/** date-holidays 라이브러리로 한 해의 공휴일 맵을 만든다 (순수 함수, 상태 없음) */
async function buildLibraryHolidayMap(
  country: string,
  year: number,
): Promise<Map<string, HolidayInfo[]>> {
  const map = new Map<string, HolidayInfo[]>();
  if (!country) return map;
  if (!HolidaysClass) await loadHolidays();
  try {
    const hd = new HolidaysClass(country);
    const list = hd.getHolidays(year);
    for (const h of list) {
      if (h.type !== 'public') continue;

      // Expand multi-day holidays (e.g. 설날 P3D, 추석 P3D)
      // Use UTC methods to avoid timezone shift issues
      const start = h.start ? new Date(h.start) : null;
      const end = h.end ? new Date(h.end) : null;

      if (start && end && end.getTime() - start.getTime() > 86400000) {
        const cursor = new Date(start);
        while (cursor < end) {
          const dk = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
          if (!map.has(dk)) map.set(dk, []);
          map.get(dk)!.push({ date: dk, name: h.name, type: h.type });
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      } else {
        // Single-day holiday
        const dateStr = h.date.slice(0, 10);
        if (!map.has(dateStr)) map.set(dateStr, []);
        map.get(dateStr)!.push({ date: dateStr, name: h.name, type: h.type });
      }
    }
  } catch { /* unsupported country */ }

  return map;
}

/** 소스 설정(기기/라이브러리/끄기)에 따라 한 해의 공휴일 맵을 만든다 */
async function resolveHolidayMap(
  source: HolidaySource,
  country: string,
  year: number,
): Promise<Map<string, HolidayInfo[]>> {
  if (source === 'off') return new Map();
  if (source === 'device' && isNative()) {
    try {
      const { fetchDeviceHolidays, requestCalendarPermission } = await import('../utils/nativeCalendar');
      const perm = await requestCalendarPermission();
      if (perm === 'granted') {
        const deviceMap = await fetchDeviceHolidays(year);
        if (deviceMap && deviceMap.size > 0) return deviceMap;
      }
    } catch (e) {
      console.warn('[useHolidays] Device calendar error, falling back to library:', e);
    }
  }
  return buildLibraryHolidayMap(country, year);
}

/**
 * 여러 연도의 공휴일을 하나의 맵으로 합쳐 준다.
 * 타임라인처럼 표시 범위가 스크롤로 늘어나는 뷰용 — `years`가 바뀌면 새로 필요한 해만 추가 로드한다.
 */
export function useHolidaysForYears(locale: string, years: number[]) {
  const defaultCountry = LOCALE_TO_COUNTRY[locale] || 'US';

  const [country, setCountry] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || defaultCountry;
    } catch {
      return defaultCountry;
    }
  });
  const [holidaySource] = useState<HolidaySource>(getInitialSource);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setCountry(LOCALE_TO_COUNTRY[locale] || 'US');
      }
    } catch { /* ignore */ }
  }, [locale]);

  // 연도별 캐시 — 키에 소스·국가를 넣어 설정이 바뀌면 자연히 다시 계산된다
  const cacheRef = useRef(new Map<string, Map<string, HolidayInfo[]>>());
  const [version, setVersion] = useState(0);
  const yearsKey = years.join(',');

  useEffect(() => {
    let cancelled = false;
    const missing = years.filter((y) => !cacheRef.current.has(`${holidaySource}:${country}:${y}`));
    if (missing.length === 0) return;
    (async () => {
      for (const y of missing) {
        const map = await resolveHolidayMap(holidaySource, country, y);
        if (cancelled) return;
        cacheRef.current.set(`${holidaySource}:${country}:${y}`, map);
      }
      if (!cancelled) setVersion((v) => v + 1);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsKey, country, holidaySource]);

  const holidayMap = useMemo(() => {
    const merged = new Map<string, HolidayInfo[]>();
    for (const y of years) {
      const m = cacheRef.current.get(`${holidaySource}:${country}:${y}`);
      if (m) m.forEach((v, k) => merged.set(k, v));
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsKey, country, holidaySource, version]);

  return { holidayMap, country };
}
