import { describe, expect, it } from 'vitest';
import { buildPlan, chaptersLabel, readingDates, splitEven, seqChapters } from './readingPlan';

describe('readingPlan', () => {
  it('마가복음 16일 — 하루 1장, 토요일은 건너뛴다', () => {
    // 2026-10-26 = 월요일
    const p = buildPlan('mark16', '2026-10-26', 6)!;
    expect(p.days).toHaveLength(16);
    expect(p.days[0]).toEqual({ date: '2026-10-26', chapters: ['40:1'] });
    expect(p.days.map((d) => d.date)).not.toContain('2026-10-31');
    expect(p.days[5].date).toBe('2026-11-01');
  });

  it('시편·잠언 31일 — 시편 150편이 빠짐없이 들어간다', () => {
    const p = buildPlan('pp31', '2026-11-01', null)!;
    expect(p.days).toHaveLength(31);
    expect(p.days[0].chapters[0]).toBe('19:1');
    const ps = p.days.flatMap((d) => d.chapters.filter((k) => k.startsWith('18:')));
    expect(ps).toHaveLength(150);
    expect(Math.max(...p.days.map((d) => d.chapters.length))).toBeLessThanOrEqual(10);
  });

  it('1년 1독 — 1189장을 365일에', () => {
    const p = buildPlan('bible365', '2027-01-01', null)!;
    expect(p.days).toHaveLength(365);
    expect(p.chapters).toBe(1189);
  });

  it('직접 고르기 — 400일 넘으면 null', () => {
    expect(buildPlan('custom', '2026-10-26', null, { b1: 0, b2: 65, perDay: 1 })).toBeNull();
    const r = buildPlan('custom', '2026-10-26', null, { b1: 44, b2: 44, perDay: 2 })!;
    expect(r.title).toBe('로마서 8일');
    expect(r.days[7].chapters).toEqual(['44:15', '44:16']);
  });

  it('고르게 나누기·날짜·라벨', () => {
    expect(splitEven(seqChapters(40, 40), 5).map((d) => d.length)).toEqual([3, 3, 4, 3, 3]);
    expect(readingDates('2026-10-31', 2, 6)).toEqual(['2026-11-01', '2026-11-02']);
    expect(chaptersLabel(['39:27', '39:28', '40:1'])).toBe('마태복음 27–28장 · 마가복음 1장');
    expect(chaptersLabel(['18:1', '18:2'])).toBe('시편 1–2편');
  });
});
