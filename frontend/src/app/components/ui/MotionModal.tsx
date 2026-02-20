'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './utils';

/* ── Global ESC stack: only the topmost modal closes on Escape ── */
const escStack: (() => void)[] = [];

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && escStack.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      escStack[escStack.length - 1]();
    }
  });
}

/* ── MotionModal ── */
interface MotionModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Classes applied to the content wrapper (override max-width, padding, etc.) */
  className?: string;
  /** Whether clicking the overlay closes the modal (default: true) */
  overlayClose?: boolean;
}

export function MotionModal({
  open,
  onClose,
  children,
  className,
  overlayClose = true,
}: MotionModalProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) setShouldRender(true);
  }, [open]);

  /* Register / unregister on the ESC stack */
  useEffect(() => {
    if (!open) return;
    const handler = () => onCloseRef.current();
    escStack.push(handler);
    return () => {
      const idx = escStack.indexOf(handler);
      if (idx !== -1) escStack.splice(idx, 1);
    };
  }, [open]);

  if (!shouldRender) return null;

  return createPortal(
    <AnimatePresence onExitComplete={() => setShouldRender(false)}>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          initial={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
          animate={{ backgroundColor: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
          exit={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.3 }}
          onClick={overlayClose ? () => onCloseRef.current() : undefined}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            className={cn(
              'w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl max-h-[90vh] overflow-y-auto',
              className,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
