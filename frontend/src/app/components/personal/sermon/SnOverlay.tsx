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

/**
 * 시트마다 방문 기록에 한 칸을 넣어 두어, 안드로이드·브라우저 뒤로는 시트만 닫게 한다.
 * 닫힐 때 그 칸이 아직 맨 위면 되돌린다. 닫자마자 다른 시트가 열리면(단계 이동 등) 같은 칸을 이어 쓴다.
 */
let sheetDepth = 0;
let pendingBack: number | null = null;

function pushSheet(): number {
  const my = ++sheetDepth;
  const state = { ...(window.history.state || {}), snSheet: my };
  if (pendingBack !== null) {
    window.clearTimeout(pendingBack);
    pendingBack = null;
    window.history.replaceState(state, '');
  } else {
    window.history.pushState(state, '');
  }
  return my;
}

let backing = false;
const afterBack: Array<() => void> = [];

function flushAfterBack() {
  backing = false;
  afterBack.splice(0).forEach((fn) => fn());
}

function popSheet(my: number) {
  sheetDepth = Math.max(0, sheetDepth - 1);
  if (window.history.state?.snSheet !== my) return;
  if (pendingBack !== null) window.clearTimeout(pendingBack);
  pendingBack = window.setTimeout(() => {
    pendingBack = null;
    if (window.history.state?.snSheet !== my) return flushAfterBack();
    backing = true;
    window.addEventListener('popstate', () => window.setTimeout(flushAfterBack, 0), { once: true });
    window.setTimeout(() => backing && flushAfterBack(), 500); // popstate 가 오지 않는 환경 대비
    window.history.back();
  }, 0);
}

/**
 * 시트를 닫고 다른 화면으로 넘어갈 때 — 시트 칸이 기록에서 빠진 뒤에 fn 을 부른다.
 * (먼저 넘어가면 시트 칸이 그 아래 남아 뒤로를 한 번 헛누르게 된다)
 * onClose() 와 같은 이벤트 안에서 부른다.
 */
export function afterSheetClose(fn: () => void) {
  window.setTimeout(() => {
    if (pendingBack !== null || backing) afterBack.push(fn);
    else fn();
  }, 0);
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
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const my = pushSheet();
    const onPop = () => {
      if ((window.history.state?.snSheet ?? 0) < my) closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      popSheet(my);
    };
  }, [open]);

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
