import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { encRef } from './bibleRefs';
import { newNote, type SermonNote } from './sermonTypes';
import { SermonVerses } from './VerseIndex';

vi.mock('./useBible', () => ({
  useBible: () => ({ bible: null, failed: false }),
  verses: (r: { v1: number; v2: number }) =>
    Array.from({ length: r.v2 - r.v1 + 1 }, (_, i) => [r.v1 + i, `${r.v1 + i}절 본문`]),
}));

const ROM = 44;
const PS = 18;
const vblock = (ref: string, aid: string) =>
  `<div class="vblock" data-ref="${ref}" data-aid="${aid}"></div>`;

function note(id: string, title: string, date: string, refs: string[], body: string): SermonNote {
  return { ...newNote(undefined), id, title, date, refs, body } as SermonNote;
}

const notes = [
  note(
    'n1',
    '한 사람으로 인해',
    '2026-10-25',
    [encRef({ b: ROM, c: 5, v1: 12, v2: 12, whole: false })],
    vblock(encRef({ b: PS, c: 51, v1: 5, v2: 5, whole: false }), 'a1'),
  ),
  note(
    'n2',
    '새친구팀',
    '2026-10-18',
    [],
    vblock(encRef({ b: PS, c: 23, v1: 1, v2: 3, whole: false }), 'a2'),
  ),
];

describe('SermonVerses', () => {
  beforeEach(() => localStorage.clear());

  it('설교별로 묶고 주제 말씀을 넓은 카드로 먼저 보인다', () => {
    const { container } = render(<SermonVerses notes={notes} onOpen={vi.fn()} onRead={vi.fn()} />);
    const groups = container.querySelectorAll('.sn-vx-grp');
    expect(groups).toHaveLength(2);
    expect(groups[0].textContent).toContain('한 사람으로 인해');
    const first = groups[0].querySelector('.sn-vx-card');
    expect(first?.getAttribute('data-wide')).not.toBeNull();
    expect(first?.textContent).toContain('주제 말씀');
    expect(container.querySelector('.sn-vx-sum')?.textContent).toBe('설교 2편에서 만난 구절 3개');
  });

  it('성경 순서로 바꾸면 권별로 묶고 기기에 기억한다', () => {
    const { container } = render(<SermonVerses notes={notes} onOpen={vi.fn()} onRead={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '성경 순서' }));
    const heads = [...container.querySelectorAll('.sn-vx-gtitle')].map((e) => e.textContent);
    expect(heads).toEqual(['시편', '로마서']);
    expect(localStorage.getItem('sermon-verse-view')).toBe('canon');
  });

  it('66권 칸을 누르면 그 책만 남는다', () => {
    const { container } = render(<SermonVerses notes={notes} onOpen={vi.fn()} onRead={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '로마서 1개' }));
    expect(container.querySelectorAll('.sn-vx-card')).toHaveLength(1);
    expect(container.querySelectorAll('.sn-vx-grp')).toHaveLength(1);
  });

  it('노트 그 자리를 누르면 aid 로 연다', () => {
    const onOpen = vi.fn();
    render(<SermonVerses notes={notes} onOpen={onOpen} onRead={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: '노트 그 자리' })[0]);
    expect(onOpen).toHaveBeenCalledWith('n1', 'a1');
  });
});

describe('SermonVerses 좁은 화면', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'matchMedia',
      (q: string) =>
        ({
          matches: q.includes('max-width'),
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
  });

  it('66권 격자 대신 구약/신약 탭과 한 줄을 보이고, 칸을 누르면 그 책만 남는다', () => {
    render(<SermonVerses notes={notes} onOpen={() => {}} onRead={() => {}} />);
    expect(screen.queryByText('66권 펼치기')).toBeNull();
    expect(screen.getByRole('button', { name: /구약/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '로마서 1개' }));
    expect(screen.getByText('로마서')).toBeInTheDocument();
    expect(screen.queryByText('시 23:1-3')).toBeNull();
  });

  it('하단 선반(host)이 있으면 한 줄을 거기에 그리고, 준비 중(null)이면 그리지 않는다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const { rerender } = render(
      <SermonVerses notes={notes} onOpen={() => {}} onRead={() => {}} stripHost={null} />,
    );
    expect(screen.queryByRole('group', { name: '구약 신약으로 옮기기' })).toBeNull();
    rerender(<SermonVerses notes={notes} onOpen={() => {}} onRead={() => {}} stripHost={host} />);
    expect(host.querySelector('.sn-vx-row[data-docked]')).not.toBeNull();
    host.remove();
  });
});
