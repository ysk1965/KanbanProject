import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscClose } from '../../../hooks/useEscClose';

/**
 * 설교 노트 전용 오버레이. body 에 포털로 띄우되 .sn-scope 로 토큰을 물려준다.
 * (탭 전환 애니메이션의 transform 때문에 .sermon-app 안에서 fixed 를 쓰면 위치가 깨진다)
 */
interface SnOverlayProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** 오버레이(배경) 자체에 붙일 클래스 — 폰 전체 화면 등 */
  overlayClassName?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  role?: 'dialog' | 'alertdialog';
  /** 바깥을 눌러 닫기 (기본 true) */
  overlayClose?: boolean;
  /** 열릴 때 포커스할 요소 선택자 (없으면 첫 번째 포커스 가능 요소) */
  initialFocus?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SnOverlay({
  open,
  onClose,
  children,
  className = '',
  overlayClassName = '',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  role = 'dialog',
  overlayClose = true,
  initialFocus,
}: SnOverlayProps) {
  useEscClose(open, onClose);
  const boxRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const box = boxRef.current;
      if (!box) return;
      const target =
        (initialFocus ? box.querySelector<HTMLElement>(initialFocus) : null) ||
        box.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    }, 20);
    return () => {
      window.clearTimeout(t);
      const p = prevFocus.current;
      if (p && document.contains(p)) p.focus({ preventScroll: true });
    };
  }, [open, initialFocus]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !boxRef.current) return;
    const els = boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className={`sn-scope sn-overlay ${overlayClassName}`}
      onMouseDown={(e) => {
        if (overlayClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        className={`sn-dialog ${className}`}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
