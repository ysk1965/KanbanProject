import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BibleRail } from './BibleRail';
import type { ReadMark } from './bibleMarks';
import type { Highlight } from './bibleHighlights';
import { newNote } from './sermonTypes';

const JER = 23;
const text = Array.from({ length: 27 }, (_, i) => `${i + 1}절 본문`);

function mark(): ReadMark {
  const note = { ...newNote(undefined), title: '한 사람으로 인해', date: '2026-10-25' };
  return {
    note,
    kind: 'quote',
    ref: { b: JER, c: 17, v1: 9, v2: 9, whole: false },
    aid: 'a1',
    thoughts: [{ id: 't1', aid: 'a1', label: '렘 17:9', text: '모두에게 죄와 사망이 이르다' }],
  } as ReadMark;
}
const hl: Highlight = {
  id: 'h1',
  b: JER,
  c: 17,
  v1: 7,
  v2: 8,
  s: null,
  e: null,
  color: 'yellow',
  ul: false,
  memo: '',
  at: 1,
};

function setup(seen: [number, number] | null = [9, 12]) {
  const onJump = vi.fn();
  const onGo = vi.fn();
  render(
    <BibleRail
      b={JER}
      c={17}
      text={text}
      list={[mark()]}
      hls={[hl]}
      seen={seen}
      prev={{ b: JER, c: 16 }}
      next={{ b: JER, c: 18 }}
      stepLabel={(r) => `${r.c}장`}
      onGo={onGo}
      onJump={onJump}
    />,
  );
  return { onJump, onGo };
}

describe('BibleRail', () => {
  it('절 지도 — 보이는 절·설교 구절·형광펜을 표시하고, 누르면 그 절로', () => {
    const { onJump } = setup();
    expect(screen.getByText('9–12절')).toBeTruthy();
    const v9 = screen.getByRole('listitem', { name: '9절, 설교 구절' });
    expect(v9.getAttribute('data-here')).toBe('true');
    expect(v9.getAttribute('data-note')).toBe('true');
    expect(screen.getByRole('listitem', { name: '7절, 형광펜' }).getAttribute('data-mark')).toBe(
      'hl',
    );
    fireEvent.click(screen.getByRole('listitem', { name: '20절' }));
    expect(onJump).toHaveBeenCalledWith(20);
  });

  it('이 장의 갈피 — 절 순서로 모으고, 누르면 그 절로', () => {
    const { onJump } = setup();
    expect(screen.getByText('이 장의 갈피 2')).toBeTruthy();
    fireEvent.click(screen.getByText('모두에게 죄와 사망이 이르다'));
    expect(onJump).toHaveBeenCalledWith(9);
    expect(screen.getByText('7–8절')).toBeTruthy();
  });

  it('장 넘기기 — 앞뒤 버튼과 다음 장 읽기', () => {
    const { onGo } = setup(null);
    fireEvent.click(screen.getByRole('button', { name: '18장으로' }));
    fireEvent.click(screen.getByText('18장 읽기'));
    expect(onGo).toHaveBeenCalledTimes(2);
    expect(onGo).toHaveBeenLastCalledWith(JER, 18);
    expect(screen.getByText('27절')).toBeTruthy();
  });
});
