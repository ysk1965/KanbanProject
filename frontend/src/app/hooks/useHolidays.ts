import { useState, useCallback, useEffect } from 'react';
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

  if (!HolidaysClass) await loadHolidays();
  if (cancelled) return;

  const map = new Map<string, HolidayInfo[]>();
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

  if (!cancelled) setHolidayMap(map);
}
