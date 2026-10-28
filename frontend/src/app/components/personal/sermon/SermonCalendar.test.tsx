import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SermonCalendar } from './SermonCalendar';
import { normalizeNote, todayString, type SermonNote } from './sermonTypes';

const today = todayString();
const note = (id: string, c: Partial<SermonNote>): SermonNote => ({
  ...normalizeNote(id, { date: today, service: '주일 2부' }),
  ...c,
  id,
});

const wrap = (ui: React.ReactElement) => render(<div className="sermon-app">{ui}</div>);

describe('SermonCalendar', () => {
  const notes = [
    note('a', { title: '한 사람으로 인해', refs: ['45:5:12-14'], body: '<p>x</p>' }),
    note('b', { service: '수요예배', body: '<p>은혜의 첫 줄</p>' }),
  ];

  it('오늘 칸에 스티커를 붙이고, 제목이 없으면 첫 줄을 자동 이름으로', () => {
    wrap(<SermonCalendar notes={notes} mascot="galpi" onOpen={() => {}} onNew={() => {}} />);
    expect(screen.getAllByText('한 사람으로 인해').length).toBeGreaterThan(0);
    expect(screen.getAllByText('은혜의 첫 줄').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ 5$/).length).toBeGreaterThan(0);
  });

  it('예배 칩을 끄면 그 예배 노트가 빠진다', () => {
    wrap(<SermonCalendar notes={notes} mascot="galpi" onOpen={() => {}} onNew={() => {}} />);
    const filters = screen.getByLabelText('거르기');
    fireEvent.click(within(filters).getByRole('button', { name: /수요예배/ }));
    expect(screen.queryAllByText('은혜의 첫 줄')).toHaveLength(0);
  });

  it('하루 시트에서 노트를 열고, 그 날짜로 새 기록을 만든다', () => {
    const onOpen = vi.fn();
    const onNew = vi.fn();
    wrap(<SermonCalendar notes={notes} mascot="galpi" onOpen={onOpen} onNew={onNew} />);
    const sheet = screen.getByRole('complementary', { name: '고른 날' });
    fireEvent.click(sheet.querySelector('.sn-cal-card') as Element);
    expect(onOpen).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: /이 날짜로 새 기록/ }));
    expect(onNew).toHaveBeenCalledWith(today);
  });

  it('왼쪽으로 밀면 다음 달, 오른쪽으로 밀면 지난달', () => {
    const { container } = wrap(
      <SermonCalendar notes={notes} mascot="galpi" onOpen={() => {}} onNew={() => {}} />,
    );
    const label = () => container.querySelector('.sn-cal-grid')?.getAttribute('aria-label');
    const before = label();
    const swipe = (dx: number) => {
      const g = container.querySelector('.sn-cal-grid') as Element;
      fireEvent.touchStart(g, { touches: [{ clientX: 200, clientY: 300 }] });
      fireEvent.touchEnd(g, { changedTouches: [{ clientX: 200 + dx, clientY: 305 }] });
    };
    swipe(-120);
    expect(label()).not.toBe(before);
    swipe(120);
    expect(label()).toBe(before);
    // 세로로 더 많이 움직이면(스크롤) 넘기지 않는다
    const g = container.querySelector('.sn-cal-grid') as Element;
    fireEvent.touchStart(g, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchEnd(g, { changedTouches: [{ clientX: 140, clientY: 420 }] });
    expect(label()).toBe(before);
  });

  it('선반이 있으면 거르기 칩은 선반에, 날짜 새 기록 버튼은 숨긴다', () => {
    const shelf = document.createElement('div');
    document.body.appendChild(shelf);
    const onSel = vi.fn();
    wrap(
      <SermonCalendar
        notes={notes}
        mascot="galpi"
        onOpen={() => {}}
        onNew={() => {}}
        onSel={onSel}
        shelfHost={shelf}
      />,
    );
    expect(shelf.querySelector('.sn-cal-filters')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /이 날짜로 새 기록/ })).toBeNull();
    expect(onSel).toHaveBeenCalledWith(today);
    shelf.remove();
  });
});
