import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Trash2, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { OrgPhoto } from '../../../types';
import { resolveFileUrl } from '../../../utils/api';

interface PhotoLightboxProps {
  photo: OrgPhoto | null;
  photos: OrgPhoto[];
  isAdmin: boolean;
  onClose: () => void;
  onNavigate: (photo: OrgPhoto) => void;
  onDownload: (photo: OrgPhoto) => void;
  onDelete: (photoId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;

export function PhotoLightbox({
  photo,
  photos,
  isAdmin,
  onClose,
  onNavigate,
  onDownload,
  onDelete,
}: PhotoLightboxProps) {
  const { t } = useTranslation();

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const hasPannedRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Pinch zoom refs
  const lastPinchDistRef = useRef<number | null>(null);
  const wasPinchingRef = useRef(false);

  const isZoomed = zoom > 1;

  const currentIndex = useMemo(() => {
    if (!photo) return -1;
    return photos.findIndex((p) => p.id === photo.id);
  }, [photo, photos]);

  // Reset zoom when photo changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photo?.id]);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, z - ZOOM_STEP);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const clampPan = useCallback(
    (x: number, y: number, currentZoom: number) => {
      if (currentZoom <= 1) return { x: 0, y: 0 };
      const container = imageContainerRef.current;
      if (!container) return { x, y };
      const rect = container.getBoundingClientRect();
      const maxX = (rect.width * (currentZoom - 1)) / 2;
      const maxY = (rect.height * (currentZoom - 1)) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [],
  );

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(photos[currentIndex - 1]);
    }
  }, [currentIndex, photos, onNavigate]);

  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onNavigate(photos[currentIndex + 1]);
    }
  }, [currentIndex, photos, onNavigate]);

  // Touch handling
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch start
        wasPinchingRef.current = true;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        lastPinchDistRef.current = dist;
        touchStartRef.current = null;
        return;
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (isZoomed) {
          isPanningRef.current = true;
          hasPannedRef.current = false;
          panStartRef.current = { x: touch.clientX, y: touch.clientY, panX: pan.x, panY: pan.y };
          touchStartRef.current = null;
        } else {
          touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        }
      }
    },
    [isZoomed, pan],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (lastPinchDistRef.current !== null) {
          const scale = dist / lastPinchDistRef.current;
          setZoom((z) => {
            const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * scale));
            if (next <= 1) setPan({ x: 0, y: 0 });
            return next;
          });
        }
        lastPinchDistRef.current = dist;
        return;
      }

      if (e.touches.length === 1 && isPanningRef.current && isZoomed) {
        e.preventDefault();
        hasPannedRef.current = true;
        const touch = e.touches[0];
        const dx = touch.clientX - panStartRef.current.x;
        const dy = touch.clientY - panStartRef.current.y;
        const newPan = clampPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy, zoom);
        setPan(newPan);
      }
    },
    [isZoomed, zoom, clampPan],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        lastPinchDistRef.current = null;
      }

      // After pinch gesture ends (all fingers lifted), skip further processing
      if (wasPinchingRef.current) {
        if (e.touches.length === 0) {
          wasPinchingRef.current = false;
        }
        return;
      }

      if (isPanningRef.current) {
        isPanningRef.current = false;
        return;
      }

      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const dt = Date.now() - touchStartRef.current.time;
      touchStartRef.current = null;

      if (!isZoomed && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 300) {
        if (dx < 0) goNext();
        else goPrev();
      }
    },
    [goPrev, goNext, isZoomed],
  );

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.3 : 0.3;
      setZoom((z) => {
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
    },
    [],
  );

  // Mouse drag panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isZoomed || e.button !== 0) return;
      e.preventDefault();
      isPanningRef.current = true;
      hasPannedRef.current = false;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [isZoomed, pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanningRef.current || !isZoomed) return;
      hasPannedRef.current = true;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const newPan = clampPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy, zoom);
      setPan(newPan);
    },
    [isZoomed, zoom, clampPan],
  );

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Double click to toggle zoom
  const lastTapRef = useRef(0);
  const handleDoubleTap = useCallback(
    (e: React.TouchEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < 300 && e.changedTouches.length === 1 && !hasPannedRef.current) {
        e.preventDefault();
        if (isZoomed) {
          resetZoom();
        } else {
          setZoom(2.5);
        }
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    },
    [isZoomed, resetZoom],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (hasPannedRef.current) return;
      e.preventDefault();
      if (isZoomed) {
        resetZoom();
      } else {
        setZoom(2.5);
      }
    },
    [isZoomed, resetZoom],
  );

  // Keyboard
  useEffect(() => {
    if (!photo) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (!isZoomed) goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (!isZoomed) goNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isZoomed) resetZoom();
        else onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [photo, goPrev, goNext, onClose, isZoomed, resetZoom, zoomIn, zoomOut]);

  // Prevent body scroll
  useEffect(() => {
    if (photo) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [photo]);

  // Prevent native pinch-zoom on the container
  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el || !photo) return;
    const prevent = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, [photo]);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <AnimatePresence>
      {photo && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-sm relative z-10">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/90 truncate">
                {photo.caption || photo.original_filename}
              </p>
              <p className="text-xs text-white/40">
                {photo.original_filename} &middot; {formatFileSize(photo.file_size)}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-4">
              {/* Zoom controls */}
              <button
                onClick={zoomOut}
                disabled={zoom <= MIN_ZOOM}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-default"
                title={t('photoGallery.zoomOut', 'Zoom out (-)')}
              >
                <ZoomOut size={18} />
              </button>
              <span className="text-xs text-white/50 font-mono w-10 text-center select-none">
                {zoomPercent}%
              </span>
              <button
                onClick={zoomIn}
                disabled={zoom >= MAX_ZOOM}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-default"
                title={t('photoGallery.zoomIn', 'Zoom in (+)')}
              >
                <ZoomIn size={18} />
              </button>
              {isZoomed && (
                <button
                  onClick={resetZoom}
                  className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title={t('photoGallery.resetZoom', 'Reset zoom (0)')}
                >
                  <RotateCcw size={18} />
                </button>
              )}
              <div className="w-px h-5 bg-white/10 mx-1" />
              {/* Download */}
              <button
                onClick={() => onDownload(photo)}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title={t('photoGallery.download', 'Download')}
              >
                <Download size={18} />
              </button>
              {/* Delete — ADMIN only */}
              {isAdmin && (
                <button
                  onClick={() => onDelete(photo.id)}
                  className="p-2 rounded-lg text-white/60 hover:text-red-400 hover:bg-white/10 transition-colors"
                  title={t('photoGallery.delete', 'Delete')}
                >
                  <Trash2 size={18} />
                </button>
              )}
              {/* Close */}
              <button
                onClick={isZoomed ? resetZoom : onClose}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title={isZoomed ? t('photoGallery.resetZoom', 'Reset zoom') : t('common.close', 'Close')}
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Image area */}
          <div
            ref={imageContainerRef}
            className="flex-1 flex items-center justify-center px-4 sm:px-12 py-4 overflow-hidden touch-none"
            style={{ cursor: isZoomed ? (isPanningRef.current ? 'grabbing' : 'grab') : 'default' }}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={(e) => {
              // Skip double-tap detection after pinch gesture
              const wasPinching = wasPinchingRef.current;
              handleTouchEnd(e);
              if (!wasPinching) {
                handleDoubleTap(e);
              }
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onClick={(e) => {
              if (!isZoomed && e.target === e.currentTarget && !hasPannedRef.current) {
                onClose();
              }
            }}
          >
            <img
              key={photo.id}
              src={resolveFileUrl(photo.url)}
              alt={photo.caption || photo.original_filename}
              className="max-w-full max-h-full object-contain rounded-lg select-none"
              draggable={false}
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: 'center center',
                transition: isPanningRef.current ? 'none' : 'transform 0.2s ease-out',
              }}
            />
          </div>

          {/* Navigation arrows (hidden when zoomed) */}
          {!isZoomed && currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white/60 hover:text-white transition-all"
              aria-label="이전"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {!isZoomed && currentIndex < photos.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white/60 hover:text-white transition-all"
              aria-label="다음"
            >
              <ChevronRight size={20} />
            </button>
          )}

          {/* Bottom index indicator */}
          <div className="text-center py-3">
            <span className="text-xs text-white/40 font-medium">
              {currentIndex + 1} / {photos.length}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
