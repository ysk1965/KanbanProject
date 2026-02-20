import { useState, useMemo, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'bridge_holiday_country';

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

const LOCALE_TO_COUNTRY: Record<string, string> = {
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

export function useHolidays(locale: string, year: number) {
  const defaultCountry = LOCALE_TO_COUNTRY[locale] || 'US';

  const [country, setCountry] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || defaultCountry;
    } catch {
      return defaultCountry;
    }
  });

  const [holidayMap, setHolidayMap] = useState<Map<string, HolidayInfo[]>>(new Map());

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

  useEffect(() => {
    if (!country) {
      setHolidayMap(new Map());
      return;
    }

    let cancelled = false;

    const compute = async () => {
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
    };

    compute();
    return () => { cancelled = true; };
  }, [country, year]);

  return { country, changeCountry, holidayMap, countries: COUNTRY_LIST };
}
