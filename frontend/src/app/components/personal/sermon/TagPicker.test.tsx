import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TagPicker } from './TagPicker';

describe('TagPicker', () => {
  it('칩을 누르면 메뉴가 뜨고, 고르면 onPick 후 닫힌다', () => {
    const onPick = vi.fn();
    render(<TagPicker value="생각" onPick={onPick} />);
    const chip = screen.getByRole('button', { name: /분류: 생각/ });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitemradio', { name: /생각/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: /질문/ }));
    expect(onPick).toHaveBeenCalledWith('질문');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('지금 분류를 다시 고르면 바꾸지 않는다', () => {
    const onPick = vi.fn();
    render(<TagPicker value="적용" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /분류: 적용/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /적용/ }));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('Esc 로 닫히고 칩으로 포커스가 돌아온다', () => {
    render(<TagPicker value="생각" onPick={() => {}} />);
    const chip = screen.getByRole('button', { name: /분류: 생각/ });
    fireEvent.click(chip);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(chip).toHaveFocus();
  });

  it('수정 중이면 잠긴다', () => {
    render(<TagPicker value="생각" disabled onPick={() => {}} />);
    expect(screen.getByRole('button', { name: /분류: 생각/ })).toBeDisabled();
  });
});
