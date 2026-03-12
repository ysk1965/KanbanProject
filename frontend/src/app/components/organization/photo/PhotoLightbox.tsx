import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const currentIndex = useMemo(() => {
    if (!photo) return -1;
    return photos.findIndex((p) => p.id === photo.id);
  }, [photo, photos]);

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

  // Touch swipe navigation
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const dt = Date.now() - touchStartRef.current.time;
      touchStartRef.current = null;

      // Require: horizontal > 50px, more horizontal than vertical, within 300ms
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 300) {
        if (dx < 0) {
          goNext();
        } else {
          goPrev();
        }
      }
    },
    [goPrev, goNext],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!photo) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [photo, goPrev, goNext, onClose]);

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
          <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-sm">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/90 truncate">
                {photo.caption || photo.original_filename}
              </p>
              <p className="text-[10px] text-white/40">
                {photo.original_filename} &middot; {formatFileSize(photo.file_size)}
              </p>
            </div>
            <div className="flex items-center gap-1 ml-4">
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
                onClick={onClose}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title={t('common.close', 'Close')}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Image area — swipeable */}
          <div
            className="flex-1 flex items-center justify-center px-4 sm:px-12 py-4"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <motion.img
              key={photo.id}
              src={resolveFileUrl(photo.url)}
              alt={photo.caption || photo.original_filename}
              className="max-w-full max-h-full object-contain rounded-lg select-none"
              draggable={false}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            />
          </div>

          {/* Left/right navigation arrows */}
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white/60 hover:text-white transition-all"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {currentIndex < photos.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 text-white/60 hover:text-white transition-all"
            >
              <ChevronRight size={20} />
            </button>
          )}

          {/* Bottom index indicator */}
          <div className="text-center py-3">
            <span className="text-[11px] text-white/40 font-medium">
              {currentIndex + 1} / {photos.length}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
