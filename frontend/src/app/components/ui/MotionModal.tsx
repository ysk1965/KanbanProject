'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './utils';
import { SPRING, FADE_SCALE } from '../../constants/motion';

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
  /** Optional accent color gradient line at the top of the modal */
  accentColor?: boolean;
}

export function MotionModal({
  open,
  onClose,
  children,
  className,
  overlayClose = true,
  accentColor,
}: MotionModalProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Track whether mousedown started on the overlay (not inside content, not from external drag)
  const mouseDownOnOverlayRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
          animate={{ backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
          exit={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.3 }}
          onMouseDown={() => { mouseDownOnOverlayRef.current = true; }}
          onClick={overlayClose ? () => {
            // Only close if mousedown also started on the overlay (not from drag or inside content)
            if (mouseDownOnOverlayRef.current) {
              onCloseRef.current();
            }
            mouseDownOnOverlayRef.current = false;
          } : undefined}
        >
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={SPRING.modal}
            onAnimationComplete={() => {
              // Clear residual transform after enter animation.
              // Mobile browsers miscalculate input caret position when
              // an ancestor has a CSS transform (even identity transform).
              if (open && contentRef.current) {
                contentRef.current.style.transform = 'none';
              }
            }}
            className={cn(
              'relative w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl ring-1 ring-inset ring-white/[0.06] max-h-[90dvh] overflow-y-auto custom-scrollbar',
              className,
            )}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            onMouseDown={(e) => { e.stopPropagation(); mouseDownOnOverlayRef.current = false; }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top shimmer line */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-t-2xl pointer-events-none" />
            {accentColor && (
              <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
