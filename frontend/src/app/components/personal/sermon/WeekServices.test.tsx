import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeekServices } from './WeekServices';
import type { SermonNote } from './sermonTypes';

const note = (id: string, date: string, title: string): SermonNote =>
  ({
    id,
    title,
    preacher: '',
    service: '주일 2부',
    date,
    refs: [],
    body: '',
    thoughts: [],
    elapsed: 0,
    created_at: 1,
    updated_at: 1,
  }) as SermonNote;

const NOTES = [
  note('a', '2026-10-25', '이번 주 설교'),
  note('b', '2026-10-18', '지난주 설교'),
  note('c', '2026-10-04', '세 주 전 설교'),
];

function setup(onNew = vi.fn()) {
  render(
    <WeekServices
      notes={NOTES}
      thisWeek="2026-10-25"
      galpi={new Map()}
      isGroupNote={() => false}
      highlight={null}
      onHighlight={() => {}}
      onOpen={() => {}}
      onNew={onNew}
    />,
  );
  return onNew;
}

describe('WeekServices 주 이동', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 27, 10));
  });
  afterEach(() => vi.useRealTimers());

  it('이번 주로 시작해 ‹ 로 지난주, 더 지난 주로 가고 「이번 주로」로 돌아온다', () => {
    setup();
    expect(screen.getByRole('heading').textContent).toBe('이번 주 들은 예배');
    expect(screen.getByText('이번 주 설교')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다음 주' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: '지난주' }));
    expect(screen.getByRole('heading').textContent).toBe('지난주 들은 예배');
    expect(screen.getByText('지난주 설교')).toBeTruthy();
    expect(screen.queryByText('이번 주 설교')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '지난주' }));
    expect(screen.getByRole('heading').textContent).toBe('10.11 주에 들은 예배');
    expect(screen.getByText('아직 없어요')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '이번 주로' }));
    expect(screen.getByRole('heading').textContent).toBe('이번 주 들은 예배');
  });

  it('가장 오래된 노트의 주보다 앞으로는 못 가고, 막대로 바로 이동한다', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '10.4 주 · 1편' }));
    expect(screen.getByText('세 주 전 설교')).toBeTruthy();
    expect(screen.getByRole('button', { name: '지난주' })).toHaveProperty('disabled', true);
  });

  it('지난 주의 「기록」은 그 주 일요일 날짜로 새 노트를 연다', () => {
    const onNew = setup();
    fireEvent.click(screen.getByRole('button', { name: '지난주' }));
    fireEvent.click(screen.getByRole('button', { name: /10\.18 주에 기록/ }));
    expect(onNew).toHaveBeenCalledWith('2026-10-18');
  });
});
