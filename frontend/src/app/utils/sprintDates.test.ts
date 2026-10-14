import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  diffDays,
  formatMD,
  formatMDW,
  inclusiveDays,
  isMonday,
  parseDay,
  toDayString,
  todayLocal,
} from './sprintDates';

describe('sprintDates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('parseDay', () => {
    it('parses yyyy-MM-dd as local midnight (no UTC shift)', () => {
      const d = parseDay('2026-09-02');
      expect(d).not.toBeNull();
      expect([d!.getFullYear(), d!.getMonth(), d!.getDate(), d!.getHours()]).toEqual([
        2026, 8, 2, 0,
      ]);
    });

    it('uses only the first 10 characters of an ISO string', () => {
      // 15:00Z is already the 3rd in KST, but the calendar date string says the 2nd.
      expect(toDayString(parseDay('2026-09-02T15:00:00Z')!)).toBe('2026-09-02');
    });

    it('returns null for empty or malformed input', () => {
      expect(parseDay(null)).toBeNull();
      expect(parseDay(undefined)).toBeNull();
      expect(parseDay('')).toBeNull();
      expect(parseDay('09/02/2026')).toBeNull();
      expect(parseDay('2026-13-45')).not.toBeNull(); // JS Date rolls over rather than failing
    });
  });

  it('toDayString round-trips with parseDay', () => {
    expect(toDayString(parseDay('2026-01-09')!)).toBe('2026-01-09');
  });

  it('addDays returns a new local-midnight date and handles month ends', () => {
    const base = new Date(2026, 0, 31, 13, 30);
    const next = addDays(base, 1);
    expect(toDayString(next)).toBe('2026-02-01');
    expect(next.getHours()).toBe(0);
    expect(base.getDate()).toBe(31); // input untouched
    expect(toDayString(addDays(base, -31))).toBe('2025-12-31');
  });

  it('diffDays counts calendar days, ignoring time of day', () => {
    expect(diffDays(new Date(2026, 8, 1, 23), new Date(2026, 8, 2, 1))).toBe(1);
    expect(diffDays(new Date(2026, 8, 5), new Date(2026, 8, 1))).toBe(-4);
  });

  it('inclusiveDays includes both ends and is 0 when reversed or missing', () => {
    expect(inclusiveDays(parseDay('2026-09-01'), parseDay('2026-09-07'))).toBe(7);
    expect(inclusiveDays(parseDay('2026-09-07'), parseDay('2026-09-07'))).toBe(1);
    expect(inclusiveDays(parseDay('2026-09-07'), parseDay('2026-09-01'))).toBe(0);
    expect(inclusiveDays(null, parseDay('2026-09-01'))).toBe(0);
  });

  it('formatMD / formatMDW / isMonday', () => {
    const tue = new Date(2026, 8, 1); // 2026-09-01 is a Tuesday
    const mon = new Date(2026, 8, 7);
    expect(formatMD(tue)).toBe('9/1');
    expect(formatMDW(tue)).toBe('9/1(화)');
    expect(formatMDW(mon)).toBe('9/7(월)');
    expect(isMonday(mon)).toBe(true);
    expect(isMonday(tue)).toBe(false);
  });

  it('todayLocal strips the time component', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 18, 45, 12));
    const t = todayLocal();
    expect(toDayString(t)).toBe('2026-10-14');
    expect([t.getHours(), t.getMinutes(), t.getSeconds()]).toEqual([0, 0, 0]);
  });
});
