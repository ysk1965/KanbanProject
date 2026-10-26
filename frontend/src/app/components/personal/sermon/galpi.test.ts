import { describe, expect, it } from 'vitest';
import {
  galpiByWeek,
  galpiRivals,
  galpiToggle,
  isAutoGalpi,
  isGalpi,
  sundayServices,
  normalizeNote,
  weekOf,
  weekRangeLabel,
} from './sermonTypes';

const note = (
  id: string,
  date: string,
  bookmarked_at?: number | null,
  extra: { service?: string; thoughts?: number } = {},
) => ({
  ...normalizeNote(id, { date, service: extra.service ?? '' }),
  thoughts: Array.from({ length: extra.thoughts ?? 0 }, (_, i) => ({
    id: `${id}-t${i}`,
    tag: '생각',
    text: '',
  })) as never,
  bookmarked_at,
});

const AUTO = { auto: true, service: '주일 2부' };

describe('갈피 — 그 주의 중심 설교', () => {
  it('주는 일요일부터 토요일까지', () => {
    expect(weekOf('2026-10-25')).toBe('2026-10-25');
    expect(weekOf('2026-10-31')).toBe('2026-10-25');
    expect(weekOf('2026-11-01')).toBe('2026-11-01');
    expect(weekOf('')).toBe('');
    expect(weekRangeLabel('2026-10-25')).toBe('10.25 – 10.31');
  });

  it('주마다 한 편, 겹치면 늦게 꽂은 쪽', () => {
    const a = note('a', '2026-10-25', 100);
    const b = note('b', '2026-10-28', 200);
    const c = note('c', '2026-10-18', 50);
    const d = note('d', '2026-10-26');
    const m = galpiByWeek([a, b, c, d]);
    expect(m.get('2026-10-25')?.id).toBe('b');
    expect(m.get('2026-10-18')?.id).toBe('c');
    expect(isGalpi(a, m)).toBe(false);
    expect(isGalpi(c, m)).toBe(true);
    expect(galpiRivals([a, b, c, d], d).map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('서버 content 의 갈피 시각을 지킨다', () => {
    expect(normalizeNote('x', { date: '2026-10-25', bookmarked_at: 5 }).bookmarked_at).toBe(5);
    expect(normalizeNote('x', { date: '2026-10-25', bookmarked_at: null }).bookmarked_at).toBe(
      undefined,
    );
  });

  it('직접 꽂은 노트가 없으면 일요일 「내 주일 예배」 노트에 자동으로', () => {
    const one = note('one', '2026-10-25', null, { service: '주일 1부', thoughts: 5 });
    const two = note('two', '2026-10-25', null, { service: '주일2부' });
    const wed = note('wed', '2026-10-28', null, { service: '수요예배', thoughts: 9 });
    const m = galpiByWeek([one, two, wed], AUTO);
    expect(m.get('2026-10-25')?.id).toBe('two');
    expect(isAutoGalpi(two, m)).toBe(true);
    // 자동을 끄면 지금처럼 직접 꽂은 것만
    expect(galpiByWeek([one, two, wed], { ...AUTO, auto: false }).size).toBe(0);
  });

  it('내 예배 노트가 없으면 그 주 일요일 노트 중 생각이 많은 쪽, 일요일 노트가 없으면 없음', () => {
    const a = note('a', '2026-10-25', null, { service: '주일 1부', thoughts: 1 });
    const b = note('b', '2026-10-25', null, { service: '오후예배', thoughts: 3 });
    const wed = note('wed', '2026-10-21', null, { service: '주일 2부' });
    const m = galpiByWeek([a, b, wed], AUTO);
    expect(m.get('2026-10-25')?.id).toBe('b');
    expect(m.has('2026-10-18')).toBe(false);
  });

  it('직접 꽂은 노트가 자동보다 먼저, 갈피를 뺀 주는 자동도 꺼진다', () => {
    const sun = note('sun', '2026-10-25', null, { service: '주일 2부' });
    const wed = note('wed', '2026-10-28', 100);
    expect(galpiByWeek([sun, wed], AUTO).get('2026-10-25')?.id).toBe('wed');
    const offSun = { ...sun, bookmarked_at: 0 };
    expect(galpiByWeek([offSun], AUTO).has('2026-10-25')).toBe(false);
    const other = note('other', '2026-10-25', null, { service: '주일 1부' });
    expect(galpiByWeek([offSun, other], AUTO).has('2026-10-25')).toBe(false);
  });

  it('꽂기/빼기 — 자동 갈피를 빼면 0, 다른 노트를 꽂으면 옮김', () => {
    const sun = note('sun', '2026-10-25', null, { service: '주일 2부' });
    const wed = note('wed', '2026-10-28');
    const off = galpiToggle([sun, wed], sun, AUTO, 7);
    expect(off).toMatchObject({ on: false, moved: false, bookmarked_at: 0 });
    const move = galpiToggle([sun, wed], wed, AUTO, 7);
    expect(move).toMatchObject({ on: true, moved: true, bookmarked_at: 7 });
    const pinned = { ...wed, bookmarked_at: 7 };
    const back = galpiToggle([sun, pinned], sun, AUTO, 9);
    expect(back.on).toBe(true);
    expect(back.rivals.map((r) => [r.id, r.bookmarked_at])).toEqual([['wed', null]]);
  });

  it('최근 8주 일요일 노트에서 많이 쓴 예배', () => {
    const ns = [
      note('a', '2026-10-25', null, { service: '주일 2부' }),
      note('b', '2026-10-18', null, { service: '주일2부' }),
      note('c', '2026-10-11', null, { service: '주일 1부' }),
      note('d', '2026-10-14', null, { service: '수요예배' }),
      note('e', '2026-06-07', null, { service: '주일 3부' }),
    ];
    expect(sundayServices(ns, '2026-10-26')).toEqual([
      { service: '주일 2부', count: 2 },
      { service: '주일 1부', count: 1 },
    ]);
  });
});
