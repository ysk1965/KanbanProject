import { useEffect, useRef } from 'react';

/* ── Global ESC stack: only the topmost modal/overlay closes on Escape ── */
export const escStack: (() => void)[] = [];

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && escStack.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      escStack[escStack.length - 1]();
    }
  });
}

/**
 * Register a close handler on the global ESC stack while `open` is true.
 * Only the topmost handler fires on Escape — safe for nested modals.
 */
export function useEscClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const handler = () => onCloseRef.current();
    escStack.push(handler);
    return () => {
      const idx = escStack.indexOf(handler);
      if (idx !== -1) escStack.splice(idx, 1);
    };
  }, [open]);
}
