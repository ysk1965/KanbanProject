import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatDate,
  formatDateShort,
  formatDateTime,
  formatRelativeTime,
  fromDateTimeLocalValue,
  getDDay,
  getDeadlineGroup,
  getLocale,
  getTodayDateString,
  getWeekRangeLabel,
  parseUTCDate,
  setLocale,
  toDateInputValue,
  toDateTimeLocalValue,
} from './dateUtils';

// vitest.config.ts 가 TZ=Asia/Seoul(UTC+9) 로 고정한다.
// 2026-10-14 03:00Z == 2026-10-14 12:00 KST (수요일)
const NOW_UTC = '2026-10-14T03:00:00.000Z';

describe('dateUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_UTC));
    localStorage.setItem('bridge_language', 'en');
    setLocale('en-US');
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('runs under the pinned Asia/Seoul timezone', () => {
    expect(new Date(NOW_UTC).getTimezoneOffset()).toBe(-540);
  });

  describe('parseUTCDate', () => {
    it('treats a Z-less ISO string as UTC', () => {
      expect(parseUTCDate('2026-10-14T00:00:00')?.toISOString()).toBe('2026-10-14T00:00:00.000Z');
    });

    it('keeps an explicit Z suffix as-is', () => {
      expect(parseUTCDate('2026-10-14T00:00:00Z')?.toISOString()).toBe('2026-10-14T00:00:00.000Z');
    });

    it('returns null for empty or invalid input', () => {
      expect(parseUTCDate(null)).toBeNull();
      expect(parseUTCDate(undefined)).toBeNull();
      expect(parseUTCDate('')).toBeNull();
      expect(parseUTCDate('not-a-date')).toBeNull();
    });
  });

  describe('formatDate / formatDateShort / formatDateTime', () => {
    it('renders UTC input in the local (KST) timezone', () => {
      expect(formatDate('2026-10-14T00:00:00Z', 'yyyy-MM-dd HH:mm')).toBe('2026-10-14 09:00');
    });

    it('crosses the local midnight boundary correctly', () => {
      expect(formatDateShort('2026-10-13T20:00:00Z')).toBe('2026-10-14');
    });

    it('accepts Date objects', () => {
      expect(formatDateShort(new Date(NOW_UTC))).toBe('2026-10-14');
    });

    it('returns "-" for empty or invalid values', () => {
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
      expect(formatDate('garbage')).toBe('-');
      expect(formatDate(new Date('invalid'))).toBe('-');
    });

    it('formats date and time with the English locale', () => {
      const out = formatDateTime('2026-10-14T00:00:00Z');
      expect(out).toContain('October 14th, 2026');
      expect(out).toContain('9:00 AM');
    });
  });

  describe('formatRelativeTime', () => {
    it('describes the past relative to the fixed system time', () => {
      expect(formatRelativeTime('2026-10-11T03:00:00Z')).toBe('3 days ago');
    });

    it('describes the future with an "in" prefix', () => {
      expect(formatRelativeTime('2026-10-14T05:00:00Z')).toBe('in about 2 hours');
    });

    it('returns "-" for empty input', () => {
      expect(formatRelativeTime(undefined)).toBe('-');
    });
  });

  describe('datetime-local conversion', () => {
    it('toDateTimeLocalValue converts UTC to a local input value', () => {
      expect(toDateTimeLocalValue('2026-10-14T00:30:00Z')).toBe('2026-10-14T09:30');
    });

    it('toDateTimeLocalValue returns an empty string for empty/invalid input', () => {
      expect(toDateTimeLocalValue('')).toBe('');
      expect(toDateTimeLocalValue(null)).toBe('');
      expect(toDateTimeLocalValue('nope')).toBe('');
    });

    it('fromDateTimeLocalValue converts a local input value to a UTC ISO string', () => {
      expect(fromDateTimeLocalValue('2026-10-14T09:30')).toBe('2026-10-14T00:30:00.000Z');
    });

    it('fromDateTimeLocalValue returns null for an empty value', () => {
      expect(fromDateTimeLocalValue('')).toBeNull();
    });

    it('round-trips server → input → server', () => {
      const server = '2026-03-01T14:45:00.000Z';
      expect(fromDateTimeLocalValue(toDateTimeLocalValue(server))).toBe(server);
    });

    it('toDateInputValue yields yyyy-MM-dd in local time', () => {
      expect(toDateInputValue('2026-10-13T20:00:00Z')).toBe('2026-10-14');
      expect(toDateInputValue(null)).toBe('');
    });
  });

  describe('getTodayDateString', () => {
    it('uses the local calendar date', () => {
      expect(getTodayDateString()).toBe('2026-10-14');
    });

    it('rolls over at local midnight, not UTC midnight', () => {
      vi.setSystemTime(new Date('2026-10-14T16:00:00Z')); // 01:00 KST on the 15th
      expect(getTodayDateString()).toBe('2026-10-15');
    });
  });

  describe('getDDay', () => {
    it('classifies today / soon / normal / overdue', () => {
      expect(getDDay('2026-10-14')).toEqual({ text: 'D-Day', diff: 0, urgency: 'today' });
      expect(getDDay('2026-10-16')).toEqual({ text: 'D-2', diff: 2, urgency: 'soon' });
      expect(getDDay('2026-10-17')).toEqual({ text: 'D-3', diff: 3, urgency: 'soon' });
      expect(getDDay('2026-10-20')).toEqual({ text: 'D-6', diff: 6, urgency: 'normal' });
      expect(getDDay('2026-10-10')).toEqual({ text: 'D+4', diff: -4, urgency: 'overdue' });
    });

    it('returns "none" for missing or invalid dates', () => {
      expect(getDDay(null)).toEqual({ text: '', diff: 0, urgency: 'none' });
      expect(getDDay('garbage')).toEqual({ text: '', diff: 0, urgency: 'none' });
    });
  });

  describe('getDeadlineGroup (week starts Monday; today is Wed 2026-10-14)', () => {
    it.each([
      ['2026-10-01', 'overdue'],
      ['2026-10-14', 'today'],
      ['2026-10-15', 'tomorrow'],
      ['2026-10-16', 'thisWeek'],
      ['2026-10-18', 'thisWeek'],
      ['2026-10-19', 'nextWeek'],
      ['2026-10-25', 'nextWeek'],
      ['2026-10-26', 'later'],
    ])('%s → %s', (date, group) => {
      expect(getDeadlineGroup(date)).toBe(group);
    });

    it('returns noDate for empty or invalid input', () => {
      expect(getDeadlineGroup(undefined)).toBe('noDate');
      expect(getDeadlineGroup('nope')).toBe('noDate');
    });
  });

  it('getWeekRangeLabel starts "this week" from tomorrow and "next week" from Monday', () => {
    expect(getWeekRangeLabel('thisWeek')).toBe('10/15~10/18');
    expect(getWeekRangeLabel('nextWeek')).toBe('10/19~10/25');
  });

  it('setLocale / getLocale round-trip', () => {
    setLocale('ko-KR');
    expect(getLocale()).toBe('ko-KR');
  });

  it('honours the saved i18n language for formatting', () => {
    localStorage.setItem('bridge_language', 'ko-KR');
    expect(formatRelativeTime('2026-10-11T03:00:00Z')).toBe('3일 전');
  });
});
