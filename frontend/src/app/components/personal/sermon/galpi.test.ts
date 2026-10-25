import { describe, expect, it } from 'vitest';
import {
  galpiByWeek,
  galpiRivals,
  isGalpi,
  normalizeNote,
  weekOf,
  weekRangeLabel,
} from './sermonTypes';

const note = (id: string, date: string, bookmarked_at?: number | null) => ({
  ...normalizeNote(id, { date }),
  bookmarked_at,
});

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
});
