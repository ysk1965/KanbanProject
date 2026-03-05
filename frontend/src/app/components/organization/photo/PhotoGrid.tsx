import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download, Check, Camera } from 'lucide-react';
import type { OrgPhoto } from '../../../types';
import { resolveFileUrl } from '../../../utils/api';

interface PhotoGridProps {
  photos: OrgPhoto[];
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpenLightbox: (photo: OrgPhoto) => void;
  onDownloadSingle: (photo: OrgPhoto) => void;
  loading: boolean;
  hasNext: boolean;
  onLoadMore: () => void;
}

export function PhotoGrid({
  photos,
  selectMode,
  selectedIds,
  onToggleSelect,
  onOpenLightbox,
  onDownloadSingle,
  loading,
  hasNext,
  onLoadMore,
}: PhotoGridProps) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll with IntersectionObserver
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNext && !loading) {
        onLoadMore();
      }
    },
    [hasNext, loading, onLoadMore],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '200px',
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [handleIntersect]);

  if (!loading && photos.length === 0) {
    return null; // Empty state is rendered by parent
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {photos.map((photo, i) => (
          <motion.div
            key={photo.id}
            className="relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-bridge-obsidian border border-foreground/[0.08] hover:border-foreground/[0.12] transition-all group"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            onClick={() => {
              if (selectMode) {
                onToggleSelect(photo.id);
              } else {
                onOpenLightbox(photo);
              }
            }}
          >
            <img
              src={resolveFileUrl(photo.thumbnail_url || photo.url)}
              alt={photo.caption || photo.original_filename}
              className="w-full h-full object-cover"
              loading="lazy"
            />

            {/* Hover overlay */}
            {!selectMode && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                <span className="text-[10px] text-white/90 truncate flex-1">
                  {photo.original_filename}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadSingle(photo);
                  }}
                  className="p-1 rounded-md hover:bg-white/20 transition-colors shrink-0"
                >
                  <Download size={14} className="text-white" />
                </button>
              </div>
            )}

            {/* Select mode checkbox */}
            {selectMode && (
              <div className="absolute top-2 left-2">
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    selectedIds.has(photo.id)
                      ? 'bg-bridge-accent border-bridge-accent'
                      : 'border-white/60 bg-black/20'
                  }`}
                >
                  {selectedIds.has(photo.id) && (
                    <Check size={12} className="text-white" />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Skeleton loading placeholders */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-xl bg-foreground/5 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
