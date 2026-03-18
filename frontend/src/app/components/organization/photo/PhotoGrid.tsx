import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download, Check, Camera, Maximize2 } from 'lucide-react';
import type { OrgPhoto } from '../../../types';
import { resolveFileUrl } from '../../../utils/api';

interface PhotoGridProps {
  photos: OrgPhoto[];
  selectMode: boolean;
  selectedIds: Set<string>;
  downloadedIds: Set<string>;
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
  downloadedIds,
  onToggleSelect,
  onOpenLightbox,
  onDownloadSingle,
  loading,
  hasNext,
  onLoadMore,
}: PhotoGridProps) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  // Track previous photo count for stagger animation
  useEffect(() => {
    // Update after render so new items get relative delay
    const timer = requestAnimationFrame(() => {
      prevCountRef.current = photos.length;
    });
    return () => cancelAnimationFrame(timer);
  }, [photos.length]);

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

  const handleImageLoad = useCallback((photoId: string) => {
    setLoadedImages((prev) => new Set(prev).add(photoId));
  }, []);

  if (!loading && photos.length === 0) {
    return null; // Empty state is rendered by parent
  }

  const prevCount = prevCountRef.current;

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {photos.map((photo, i) => {
          const isNew = i >= prevCount;
          const relativeIndex = i - prevCount;

          return (
            <motion.div
              key={photo.id}
              className="relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-bridge-obsidian border border-foreground/[0.08] hover:border-foreground/[0.12] transition-all group"
              initial={isNew ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={isNew ? { delay: relativeIndex * 0.03, duration: 0.3 } : { duration: 0 }}
              onClick={() => {
                if (selectMode) {
                  onToggleSelect(photo.id);
                } else {
                  onOpenLightbox(photo);
                }
              }}
            >
              {/* Shimmer placeholder */}
              {!loadedImages.has(photo.id) && (
                <div className="absolute inset-0 bg-foreground/5 animate-pulse" />
              )}

              <img
                src={resolveFileUrl(photo.thumbnail_url || photo.url)}
                alt={photo.caption || photo.original_filename}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  loadedImages.has(photo.id) ? 'opacity-100' : 'opacity-0'
                }`}
                loading="lazy"
                onLoad={() => handleImageLoad(photo.id)}
              />

              {/* Downloaded badge — always visible (z-20: above select checkbox) */}
              {downloadedIds.has(photo.id) && (
                <div className="absolute top-1.5 right-1.5 z-20">
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white">
                    <Check size={10} strokeWidth={3} />
                    <span className="text-xs font-bold">saved</span>
                  </div>
                </div>
              )}

              {/* Hover overlay */}
              {!selectMode && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <span className="text-xs text-white/90 truncate flex-1">
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
                <div className="absolute top-2 left-2 z-10">
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

              {/* Select mode: view photo button */}
              {selectMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLightbox(photo);
                  }}
                  className="absolute bottom-2 right-2 z-10 p-1.5 rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all"
                  aria-label="View photo"
                >
                  <Maximize2 size={14} className="text-white" />
                </button>
              )}
            </motion.div>
          );
        })}
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
