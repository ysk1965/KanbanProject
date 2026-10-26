import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BookMap } from './BookMap';
import type { PlanDetail } from './readingApi';
import { todayString } from '../sermonTypes';
import { addDays, splitEven, seqChapters } from './readingPlan';

const today = todayString();

/** 신약 90일 · 3명 · 오늘 40일째, 나는 33·34일째를 밀림 */
function plan(group = true): PlanDetail {
  const chunks = splitEven(seqChapters(39, 65), 90);
  return {
    id: 'p1',
    title: '신약 90일',
    template: 'nt90',
    status: 'active',
    group_id: group ? 'g1' : undefined,
    group_name: group ? '6팀' : undefined,
    start_date: addDays(today, -39),
    end_date: addDays(today, 50),
    total_days: 90,
    today_day_no: 40,
    member_count: group ? 3 : 1,
    team_done: 0,
    team_total: 0,
    days: chunks.map((chapters, i) => {
      const no = i + 1;
      const meRead = no < 40 && no !== 33 && no !== 34;
      return {
        day_no: no,
        date: addDays(today, i - 39),
        chapters,
        done_count: no < 40 ? (group ? (meRead ? 3 : 2) : meRead ? 1 : 0) : 0,
        my_chapters: meRead ? chapters : [],
      };
    }),
  };
}

describe('BookMap', () => {
  it('길에 든 묶음만 그리고, 지금 위치와 다음 이정표를 보여준다', () => {
    const p = plan();
    const { container } = render(<BookMap plan={p} today={today} onRead={() => {}} />);
    const rows = [...container.querySelectorAll('.bm-name b')].map((b) => b.textContent);
    expect(rows).toEqual(['복음서·행전', '서신서', '계시록']);
    expect(screen.getByText('지금 걷는 곳')).toBeTruthy();
    expect(container.querySelector('.bm-tag')?.textContent).toBe('오늘');
    expect(container.querySelector('.bm-mile')?.textContent).toMatch(/다음 이정표/);
    // 모임 길에서 밀렸으면 「나」 표시
    expect(container.querySelector('.bm-me')).toBeTruthy();
  });

  it('책을 누르면 장 칸이 펼쳐지고 안 읽은 첫 장으로 간다', () => {
    const onRead = vi.fn();
    const p = plan();
    render(<BookMap plan={p} today={today} onRead={onRead} />);
    fireEvent.click(screen.getByRole('button', { name: '마태복음 28장' }));
    expect(screen.getByRole('button', { name: '마태복음 28장' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /마 1장 읽기/ }));
    expect(onRead).toHaveBeenCalledWith('39:1');
  });

  it('혼자 길은 「나」 표시가 없다', () => {
    const { container } = render(<BookMap plan={plan(false)} today={today} onRead={() => {}} />);
    expect(container.querySelector('.bm-me')).toBeNull();
    expect(screen.getByText('읽음')).toBeTruthy();
  });
});
