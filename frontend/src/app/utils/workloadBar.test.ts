import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  computeBarLanes,
  diffDays,
  expandDateRange,
  formatDateStr,
  isBoardOffDay,
  isWorkingDay,
  parseDate,
} from './workloadBar';

describe('workloadBar date helpers', () => {
  it('parseDate builds a local-midnight Date', () => {
    const d = parseDate('2026-02-28');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 1, 28]);
    expect(d.getHours()).toBe(0);
  });

  it('formatDateStr zero-pads month and day', () => {
    expect(formatDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('addDaysToDate crosses month and year boundaries', () => {
    expect(addDaysToDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('diffDays is signed and ignores DST', () => {
    expect(diffDays('2026-10-01', '2026-10-14')).toBe(13);
    expect(diffDays('2026-10-14', '2026-10-01')).toBe(-13);
    expect(diffDays('2026-10-14', '2026-10-14')).toBe(0);
  });

  it('expandDateRange is inclusive and empty when reversed', () => {
    expect(expandDateRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
    expect(expandDateRange('2026-02-02', '2026-01-30')).toEqual([]);
    expect(expandDateRange('2026-02-02', '2026-02-02')).toEqual(['2026-02-02']);
  });
});

describe('isWorkingDay priority', () => {
  const base = { weekend: false, holiday: false, forcedWorkday: false };

  it('a plain weekday is a working day', () => {
    expect(isWorkingDay(base)).toBe(true);
  });

  it('weekend or holiday is off', () => {
    expect(isWorkingDay({ ...base, weekend: true })).toBe(false);
    expect(isWorkingDay({ ...base, holiday: true })).toBe(false);
  });

  it('board forced workday overrides weekend/holiday', () => {
    expect(isWorkingDay({ weekend: true, holiday: true, forcedWorkday: true })).toBe(true);
  });

  it('member holiday work overrides weekend', () => {
    expect(isWorkingDay({ ...base, weekend: true, memberHolidayWork: true })).toBe(true);
  });

  it('member absence wins over everything', () => {
    expect(
      isWorkingDay({ weekend: false, holiday: false, forcedWorkday: true, memberHolidayWork: true, memberAbsent: true }),
    ).toBe(false);
  });

  it('isBoardOffDay is the inverse of the board-level rule', () => {
    expect(isBoardOffDay(base)).toBe(false);
    expect(isBoardOffDay({ ...base, weekend: true })).toBe(true);
    expect(isBoardOffDay({ weekend: true, holiday: false, forcedWorkday: true })).toBe(false);
  });
});

describe('computeBarLanes', () => {
  it('puts non-overlapping bars on the same lane', () => {
    expect(
      computeBarLanes([
        { id: 'a', startDayIndex: 0, endDayIndex: 2 },
        { id: 'b', startDayIndex: 3, endDayIndex: 5 },
      ]),
    ).toEqual({ a: 0, b: 0 });
  });

  it('stacks overlapping bars on new lanes (inclusive end)', () => {
    expect(
      computeBarLanes([
        { id: 'a', startDayIndex: 0, endDayIndex: 3 },
        { id: 'b', startDayIndex: 3, endDayIndex: 5 },
        { id: 'c', startDayIndex: 1, endDayIndex: 1 },
      ]),
    ).toEqual({ a: 0, b: 1, c: 1 });
  });

  it('places longer bars first when starts tie, and reuses freed lanes', () => {
    const lanes = computeBarLanes([
      { id: 'short', startDayIndex: 0, endDayIndex: 0 },
      { id: 'long', startDayIndex: 0, endDayIndex: 4 },
      { id: 'later', startDayIndex: 2, endDayIndex: 3 },
    ]);
    expect(lanes.long).toBe(0);
    expect(lanes.short).toBe(1);
    expect(lanes.later).toBe(1);
  });

  it('returns an empty map for no bars', () => {
    expect(computeBarLanes([])).toEqual({});
  });
});
