import { isNative } from './platform';
import type { HolidayInfo } from '../hooks/useHolidays';

// Holiday calendar keyword detection (multi-language)
const HOLIDAY_CALENDAR_KEYWORDS = [
  // English
  'holiday', 'holidays', 'public holiday',
  // Korean
  '공휴일', '휴일', '대한민국 휴일',
  // Japanese
  '祝日', '日本の祝日',
  // Chinese
  '节假日', '假日', '公众假期',
  // Vietnamese
  'ngày lễ',
  // Thai
  'วันหยุด',
  // Spanish
  'festivos', 'días festivos',
  // Portuguese
  'feriados',
  // German
  'feiertage',
  // French
  'jours fériés',
];

function isHolidayCalendar(title: string): boolean {
  const lower = title.toLowerCase();
  return HOLIDAY_CALENDAR_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export type CalendarPermissionState = 'granted' | 'denied' | 'prompt';

/**
 * Check current calendar permission status.
 * Returns 'granted', 'denied', or 'prompt'.
 */
export async function checkCalendarPermission(): Promise<CalendarPermissionState> {
  if (!isNative()) return 'denied';

  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    const result = await CapacitorCalendar.checkPermission({
      alias: 'readCalendar' as any,
    });
    return result.result as CalendarPermissionState;
  } catch (e) {
    console.warn('[NativeCalendar] checkPermission failed:', e);
    return 'denied';
  }
}

/**
 * Request calendar read access.
 * Uses requestFullCalendarAccess() which works on both iOS and Android.
 */
export async function requestCalendarPermission(): Promise<CalendarPermissionState> {
  if (!isNative()) return 'denied';

  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    const result = await CapacitorCalendar.requestFullCalendarAccess();
    return result.result as CalendarPermissionState;
  } catch (e) {
    console.warn('[NativeCalendar] requestPermission failed:', e);
    return 'denied';
  }
}

/**
 * Fetch holidays from the device calendar for a given year.
 * Auto-detects holiday calendars by keyword matching on calendar titles.
 * Returns a Map<string, HolidayInfo[]> compatible with the existing holidayMap interface.
 */
export async function fetchDeviceHolidays(year: number): Promise<Map<string, HolidayInfo[]> | null> {
  if (!isNative()) return null;

  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');

    // 1. List all calendars
    const { result: calendars } = await CapacitorCalendar.listCalendars();
    if (!calendars || calendars.length === 0) {
      console.log('[NativeCalendar] No calendars found');
      return null;
    }

    // 2. Find holiday calendars by keyword matching
    const holidayCalendarIds = calendars
      .filter((cal: any) => isHolidayCalendar(cal.title || ''))
      .map((cal: any) => cal.id);

    if (holidayCalendarIds.length === 0) {
      console.log('[NativeCalendar] No holiday calendars found. Available:', calendars.map((c: any) => c.title));
      return null;
    }

    console.log('[NativeCalendar] Found holiday calendars:', holidayCalendarIds.length);

    // 3. Fetch events for the year range (timestamps in milliseconds)
    const startDate = new Date(Date.UTC(year, 0, 1)).getTime();
    const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59)).getTime();

    const { result: events } = await CapacitorCalendar.listEventsInRange({
      startDate,
      endDate,
    });

    if (!events || events.length === 0) {
      console.log('[NativeCalendar] No events in range');
      return null;
    }

    // 4. Filter to holiday calendar events and build the map
    const holidayCalendarIdSet = new Set(holidayCalendarIds);
    const map = new Map<string, HolidayInfo[]>();

    for (const event of events) {
      // Filter by holiday calendar IDs (if calendarId is available)
      if (event.calendarId && !holidayCalendarIdSet.has(event.calendarId)) {
        continue;
      }

      const title = event.title || 'Holiday';
      const eventStart = event.startDate ? new Date(event.startDate) : null;
      const eventEnd = event.endDate ? new Date(event.endDate) : null;

      if (!eventStart) continue;

      // Handle multi-day events
      if (eventEnd && eventEnd.getTime() - eventStart.getTime() > 86400000) {
        const cursor = new Date(eventStart);
        while (cursor < eventEnd) {
          const dk = formatDateKey(cursor);
          if (!map.has(dk)) map.set(dk, []);
          map.get(dk)!.push({ date: dk, name: title, type: 'public' });
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      } else {
        const dk = formatDateKey(eventStart);
        if (!map.has(dk)) map.set(dk, []);
        map.get(dk)!.push({ date: dk, name: title, type: 'public' });
      }
    }

    console.log('[NativeCalendar] Loaded', map.size, 'holiday dates from device');
    return map.size > 0 ? map : null;
  } catch (e) {
    console.warn('[NativeCalendar] fetchDeviceHolidays failed:', e);
    return null;
  }
}

function formatDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
