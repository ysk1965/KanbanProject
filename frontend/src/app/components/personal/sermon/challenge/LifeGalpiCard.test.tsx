import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApplyItem, SermonNote, Thought } from '../sermonTypes';
import { LifeGalpiCard } from './LifeGalpiCard';
import { dueLabel, unlockLabel } from './challengeUtil';

const HOUR = 3600_000;

function note(id: string, date: string, thoughts: Partial<Thought>[] = []): SermonNote {
  return {
    id,
    date,
    title: '한 사람으로 인해',
    thoughts: thoughts.map((t, i) => ({
      id: `t${i}`,
      tag: '적용',
      text: '',
      media: [],
      t: null,
      aid: null,
      label: null,
      at: Date.now(),
      ...t,
    })),
  } as unknown as SermonNote;
}

const earn = () => document.querySelector('.sn-lgq-earn')?.textContent;

function items(n: SermonNote): ApplyItem[] {
  return (n.thoughts || []).map((t) => ({ n, t }));
}

function renderCard(over: Partial<Parameters<typeof LifeGalpiCard>[0]> = {}) {
  const props: Parameters<typeof LifeGalpiCard>[0] = {
    weekNote: null,
    doneNote: false,
    doneApply: false,
    weekHasApply: false,
    weekNoteCount: 0,
    weekDoneCount: 0,
    anonymous: false,
    apply: { week: [], older: [] },
    onToggleApply: vi.fn(),
    onOpenNote: vi.fn(),
    onNew: vi.fn(),
    ...over,
  };
  render(<LifeGalpiCard {...props} />);
  return props;
}

describe('dueLabel / unlockLabel', () => {
  it('한국 시간 일요일 22시 마감까지 남은 날', () => {
    // 2026-10-28(수) 12:00 KST
    expect(dueLabel(Date.UTC(2026, 9, 28, 3))).toBe('D-4 · 일 22시');
    // 2026-11-01(일) 21:00 KST → 오늘, 22:30 KST → 다음 주
    expect(dueLabel(Date.UTC(2026, 10, 1, 12))).toBe('오늘 22시까지');
    expect(dueLabel(Date.UTC(2026, 10, 1, 13, 30))).toBe('D-7 · 일 22시');
  });

  it('체크할 수 있게 되는 시각', () => {
    const now = new Date(2026, 9, 28, 21, 0).getTime();
    expect(unlockLabel(new Date(2026, 9, 28, 22, 0).getTime(), now)).toBe('오늘 오후 10시');
    expect(unlockLabel(new Date(2026, 9, 29, 9, 0).getTime(), now)).toBe('내일 오전 9시');
    expect(unlockLabel(new Date(2026, 9, 30, 0, 30).getTime(), now)).toBe('금 오전 12시 30분');
  });
});

describe('LifeGalpiCard — 이번 주 갈피 퀘스트', () => {
  it('시작 전: 1걸음이 지금 걸음이고 새 설교 기록으로 이어진다', () => {
    const p = renderCard();
    expect(screen.getByRole('region', { name: '이번 주 갈피 퀘스트' })).toBeInTheDocument();
    expect(screen.getByText('0 / 3 걸음')).toBeInTheDocument();
    expect(earn()).toBe('0 / 53');
    fireEvent.click(screen.getByRole('button', { name: '새 설교 기록' }));
    expect(p.onNew).toHaveBeenCalled();
    expect(screen.getByText('세 걸음을 마치면 완주 +20')).toBeInTheDocument();
  });

  it('적용을 남긴 지 12시간 전이면 「살아 냈어요」가 잠긴다', () => {
    const n = note('n1', '2026-10-28', [
      { text: '출근길에 사과 문자 보내기', at: Date.now() - HOUR },
    ]);
    const p = renderCard({
      weekNote: n,
      doneNote: true,
      weekHasApply: true,
      weekNoteCount: 1,
      apply: { week: items(n), older: [] },
    });
    expect(screen.getByText('2 / 3 걸음')).toBeInTheDocument();
    expect(earn()).toBe('23 / 53');
    expect(screen.getByText('살아 낼 적용')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /^살아 냈어요 · / });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(p.onToggleApply).not.toHaveBeenCalled();
  });

  it('12시간이 지났으면 바로 체크할 수 있다', () => {
    const old = note('n1', '2026-10-27', [
      { text: '출근길에 사과 문자 보내기', at: Date.now() - 13 * HOUR },
    ]);
    const p = renderCard({
      weekNote: old,
      doneNote: true,
      weekHasApply: true,
      apply: { week: items(old), older: [] },
    });
    fireEvent.click(screen.getByRole('button', { name: '살아 냈어요' }));
    expect(p.onToggleApply).toHaveBeenCalledWith('n1', 't0');
  });

  it('완주: 상자가 열리고 보너스 퀘스트가 보인다', () => {
    const n = note('n1', '2026-10-28', [
      { text: '출근길에 사과 문자 보내기', done: true, done_at: Date.now() },
    ]);
    renderCard({
      weekNote: n,
      doneNote: true,
      doneApply: true,
      weekHasApply: true,
      weekNoteCount: 1,
      weekDoneCount: 1,
      streakWeeks: 2,
      apply: { week: items(n), older: [] },
    });
    expect(earn()).toBe('53 / 53');
    expect(screen.getByText('이번 주 갈피를 삶까지 꽂았어요')).toBeInTheDocument();
    // 적용 문장은 인용에 한 번만, 진행 막대는 숨김
    expect(screen.getAllByText('출근길에 사과 문자 보내기')).toHaveLength(1);
    expect(screen.queryByRole('progressbar', { name: '퀘스트 진행' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /적용 체크/ }));
    expect(screen.getByRole('button', { name: '실천 표시 지우기' })).toBeInTheDocument();
    expect(screen.getByLabelText('보너스 퀘스트')).toBeInTheDocument();
    expect(screen.getByText('4주 연속 기록')).toBeInTheDocument();
  });
});
