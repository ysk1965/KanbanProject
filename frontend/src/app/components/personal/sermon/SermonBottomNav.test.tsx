import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SermonBottomNav } from './SermonBottomNav';
import type { SermonTabKey } from './SermonList';
import { ChallengeTabIcon, GroupsTabIcon, NoteTabIcon } from './TabIcons';
import { SPRING } from './tabMotion';

const TABS = [
  { k: 'note' as const, label: '설교 노트', short: '노트', Icon: NoteTabIcon },
  { k: 'groups' as const, label: '모임', short: '모임', Icon: GroupsTabIcon },
  { k: 'challenge' as const, label: '챌린지', short: '챌린지', Icon: ChallengeTabIcon },
];

function Harness({ onGo }: { onGo: (k: SermonTabKey) => void }) {
  const [tab, setTab] = useState<SermonTabKey>('note');
  return (
    <SermonBottomNav
      tabs={TABS}
      tab={tab}
      badge={(k) => (k === 'challenge' ? '1/3' : null)}
      onGo={(k) => {
        onGo(k);
        setTab(k);
      }}
    />
  );
}

describe('SermonBottomNav', () => {
  it('누른 탭이 현재 탭이 되고, 움직임 API 가 없어도 깨지지 않는다', () => {
    const onGo = vi.fn();
    render(<Harness onGo={onGo} />);
    expect(screen.getByRole('button', { name: '설교 노트' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(screen.getByRole('button', { name: '모임' }));
    expect(onGo).toHaveBeenCalledWith('groups');
    expect(screen.getByRole('button', { name: '모임' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '설교 노트' })).not.toHaveAttribute('aria-current');
    expect(screen.getByLabelText('1/3')).toBeInTheDocument();
  });

  it('스프링은 0.5초 안에 멈추고 조금만 지나친다', () => {
    expect(SPRING.ms).toBeGreaterThan(250);
    expect(SPRING.ms).toBeLessThan(500);
    expect(SPRING.at(1)[0]).toBeCloseTo(1, 2);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => SPRING.at(i / 100)[0]));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.1);
  });
});
