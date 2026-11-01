import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { THOUGHT_TAGS, type ThoughtTag } from './sermonTypes';

/**
 * 생각 카드의 분류 글자(● 생각) — 누르면 생각 · 질문 · 적용 메뉴가 뜨고 고르는 즉시 바뀐다.
 * 메뉴는 생각 목록(스크롤 영역)에 잘리지 않게 body 포털로 띄우고, 아래 자리가 모자라면 위로 연다.
 */

const HINT: Record<ThoughtTag, string> = {
  생각: '떠오른 것',
  질문: '나중에 답 찾기',
  적용: '이번 주 해 볼 일',
};

interface TagPickerProps {
  value: ThoughtTag;
  /** 다른 생각을 고치는 중에는 잠근다 */
  disabled?: boolean;
  /** 방금 바뀐 칩 — 점이 한 번 튄다 */
  pulse?: boolean;
  onPick: (tag: ThoughtTag) => void;
}

export function TagPicker({ value, disabled, pulse, onPick }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (focusBack: boolean) => {
    setOpen(false);
    setPos(null);
    if (focusBack) btnRef.current?.focus();
  };

  // 칩 아래에, 자리가 모자라면 위에
  useLayoutEffect(() => {
    if (!open) return;
    const b = btnRef.current?.getBoundingClientRect();
    const m = menuRef.current;
    if (!b || !m) return;
    const h = m.offsetHeight;
    const w = m.offsetWidth;
    const below = b.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, b.top - h - 6) : below;
    const left = Math.min(Math.max(8, b.left - 4), window.innerWidth - w - 8);
    setPos({ top, left });
    const cur = m.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    cur?.focus({ preventScroll: true });
  }, [open]);

  // 바깥 누르기 · 스크롤 · 창 크기 변경이면 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (disabled && open) close(false);
  }, [disabled, open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="sn-tagT"
        data-t={value}
        data-fx={pulse ? 'pulse' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`분류: ${value}. 눌러서 바꾸기`}
        disabled={disabled}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {value}
        <ChevronDown className="sn-tagT-chev" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="sn-scope sn-tagpop"
            role="menu"
            aria-label="분류 바꾸기"
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
            onKeyDown={onMenuKey}
          >
            <div className="sn-tagpop-h">분류 바꾸기</div>
            {THOUGHT_TAGS.map((x) => (
              <button
                key={x}
                type="button"
                role="menuitemradio"
                aria-checked={x === value}
                data-t={x}
                onClick={() => {
                  close(true);
                  if (x !== value) onPick(x);
                }}
              >
                <i aria-hidden />
                <span>
                  <b>{x}</b>
                  <small>{HINT[x]}</small>
                </span>
                <Check className="sn-tagpop-ok" aria-hidden />
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
