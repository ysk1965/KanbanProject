import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BOOKS } from './bibleRefs';
import { BibleSearch, BibleSearchResults } from './BibleSearch';
import type { BibleData } from './useBible';

const type = (value: string) => {
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('BibleSearch', () => {
  it('주소(마4:1)는 그 절로 간다', () => {
    const onGo = vi.fn();
    const onWord = vi.fn();
    render(<BibleSearch narrow={false} onGo={onGo} onWord={onWord} />);
    type('마4:1');
    expect(onGo).toHaveBeenCalledWith(39, 4, 1);
    expect(onWord).not.toHaveBeenCalled();
  });

  it('낱말은 본문 찾기로 넘긴다', () => {
    const onWord = vi.fn();
    render(<BibleSearch narrow={false} onGo={vi.fn()} onWord={onWord} />);
    type('믿음  소망');
    expect(onWord).toHaveBeenCalledWith('믿음 소망');
  });

  it('좁은 화면은 🔍 를 눌러야 칸이 열린다', () => {
    render(<BibleSearch narrow onGo={vi.fn()} onWord={vi.fn()} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '말씀 찾기' }));
    expect(screen.getByRole('combobox')).toBeTruthy();
  });
});

describe('BibleSearchResults', () => {
  it('권별로 보여 주고, 누르면 그 절로', () => {
    const bible: BibleData = BOOKS.map((bk) => Array.from({ length: bk[2] }, () => ['']));
    bible[45][12] = Array(13).fill('');
    bible[45][12][12] = '그런즉 믿음, 소망, 사랑';
    const onPick = vi.fn();
    render(
      <BibleSearchResults
        bible={bible}
        q="믿음 소망"
        backLabel="돌아가기"
        onBack={vi.fn()}
        onPick={onPick}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('1절 · 1권');
    fireEvent.click(screen.getByRole('button', { name: /고전 13:13/ }));
    expect(onPick).toHaveBeenCalledWith(45, 13, 13);
  });
});
