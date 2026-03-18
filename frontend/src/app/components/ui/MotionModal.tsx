'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './utils';
import { SPRING, FADE_SCALE } from '../../constants/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { escStack } from '../../hooks/useEscClose';

/* ── Focus trap helper ── */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  /** Accessible label for the modal dialog */
  'aria-label'?: string;
  /** ID of an element that labels the modal */
  'aria-labelledby'?: string;
}

export function MotionModal({
  open,
  onClose,
  children,
  className,
  overlayClose = true,
  accentColor,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: MotionModalProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reduced = useReducedMotion();

  // Track whether mousedown started on the overlay (not inside content, not from external drag)
  const mouseDownOnOverlayRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

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

  /* Focus trap: trap Tab key within modal */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !contentRef.current) return;

    const focusableEls = contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusableEls.length === 0) return;

    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  }, []);

  /* Save and restore focus on open/close */
  useEffect(() => {
    if (open) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      // Focus first focusable element after animation
      const timer = setTimeout(() => {
        if (contentRef.current) {
          const firstFocusable = contentRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          firstFocusable?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // Restore focus to trigger element
      previousActiveElementRef.current?.focus();
      previousActiveElementRef.current = null;
    }
  }, [open]);

  // Motion values — static when reduced motion is preferred
  const overlayMotion = reduced
    ? { initial: {}, animate: {}, exit: {}, transition: { duration: 0 } }
    : {
        initial: { backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' },
        animate: { backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' },
        exit: { backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' },
        transition: { duration: 0.3 },
      };

  const contentMotion = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 24, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 12, scale: 0.98 },
        transition: SPRING.modal,
      };

  if (!shouldRender) return null;

  return createPortal(
    <AnimatePresence onExitComplete={() => setShouldRender(false)}>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          initial={overlayMotion.initial}
          animate={overlayMotion.animate}
          exit={overlayMotion.exit}
          transition={overlayMotion.transition}
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
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            initial={contentMotion.initial}
            animate={contentMotion.animate}
            exit={contentMotion.exit}
            transition={contentMotion.transition}
            onKeyDown={handleKeyDown}
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
