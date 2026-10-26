import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlanView } from './PlanView';
import type { PlanDetail } from './readingApi';
import { todayString } from '../sermonTypes';
import { addDays } from './readingPlan';

vi.mock('./readingApi', async (orig) => ({
  ...(await orig<typeof import('./readingApi')>()),
  readingAPI: {
    checkDay: vi.fn(),
    end: vi.fn(),
    mine: vi.fn(() => Promise.resolve({ plans: [] })),
  },
}));

const today = todayString();

function plan(): PlanDetail {
  return {
    id: 'p1',
    title: '마가복음 16일',
    template: 'mark16',
    status: 'active',
    group_id: 'g1',
    group_name: '6팀',
    start_date: addDays(today, -2),
    end_date: addDays(today, 13),
    total_days: 16,
    today_day_no: 3,
    can_manage: true,
    member_count: 3,
    team_done: 5,
    team_total: 48,
    days: Array.from({ length: 16 }, (_, i) => ({
      day_no: i + 1,
      date: addDays(today, i - 2),
      chapters: [`40:${i + 1}`],
      done_count: i === 0 ? 3 : i === 1 ? 1 : i === 2 ? 1 : 0,
      my_chapters: i === 0 ? ['40:1'] : [],
    })),
    today: {
      read: [{ user_id: 'u2', display_name: '김하은' }],
      unread: [
        { user_id: 'u1', display_name: '유상건' },
        { user_id: 'u3', display_name: '박준' },
      ],
    },
  };
}

describe('PlanView', () => {
  it('오늘 카드 · 읽음/아직 · 밀린 날 · 팀 진도', () => {
    const onRead = vi.fn();
    render(<PlanView plan={plan()} onRead={onRead} onChange={() => {}} onEnded={() => {}} />);
    expect(screen.getByText('마가복음 3장')).toBeTruthy();
    expect(screen.getByText('읽음 1')).toBeTruthy();
    expect(screen.getByText('아직 2')).toBeTruthy();
    expect(screen.getByText('밀린 날 1')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /읽으러 가기/ }));
    expect(onRead).toHaveBeenCalledWith('40:3');
    fireEvent.click(screen.getByRole('button', { name: /2일째/ }));
    expect(onRead).toHaveBeenLastCalledWith('40:2');
  });

  it('모임 길은 사람마다 한 줄 — 나를 맨 위, 늦게 읽은 날은 따로', () => {
    const p = plan();
    p.members = [
      { user_id: 'u1', display_name: '유상건', done_days: 1, me: true },
      { user_id: 'u2', display_name: '김하은', done_days: 3 },
      { user_id: 'u3', display_name: '박준', done_days: 1 },
    ];
    p.days[0] = { ...p.days[0], readers: [0, 1, 2], late: [2] };
    p.days[1] = { ...p.days[1], readers: [1] };
    p.days[2] = { ...p.days[2], readers: [1] };
    const { container } = render(
      <PlanView plan={p} onRead={() => {}} onChange={() => {}} onEnded={() => {}} />,
    );
    expect(container.querySelector('.rp-trail')).toBeNull();
    const names = [...container.querySelectorAll('.rp-tw b')].map((b) => b.textContent);
    expect(names).toEqual(['유상건', '김하은', '박준']);
    expect(container.querySelectorAll('.rp-tc[data-r="me"]')).toHaveLength(1);
    expect(container.querySelectorAll('.rp-tc[data-r="late"]')).toHaveLength(1);
    expect(container.querySelectorAll('.rp-tc[data-r="on"]')).toHaveLength(3);
    expect(screen.getAllByText('3/3일')).toHaveLength(1);
  });

  it('길 끝내기는 한 번 더 묻는다', () => {
    render(<PlanView plan={plan()} onRead={() => {}} onChange={() => {}} onEnded={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '길 끝내기' }));
    expect(screen.getByText(/길을 끝낼까요/)).toBeTruthy();
  });
});
