import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  AlertCircle,
  ArrowLeft,
  Download,
  Check,
  Loader2,
  Images,
  CheckSquare,
  X,
  Maximize2,
} from "lucide-react";
import { publicGalleryAPI, resolveFileUrl } from "../utils/api";
import { PhotoLightbox } from "../components/organization/photo/PhotoLightbox";
import {
  downloadPhoto,
  downloadPhotosBatch,
  getDownloadedIds,
} from "../utils/nativeDownload";
import type { BatchDownloadProgress } from "../utils/nativeDownload";
import { isNative } from "../utils/platform";
import { IconButton } from "../components/ui/IconButton";
import type {
  SharedGalleryInfo,
  SharedAlbumSummary,
  SharedPhotoItem,
  OrgPhoto,
} from "../types";

/** Map SharedPhotoItem → OrgPhoto shape so we can reuse PhotoLightbox */
function toOrgPhoto(item: SharedPhotoItem): OrgPhoto {
  return {
    id: item.id,
    tab_id: "",
    s3_key: "",
    thumbnail_key: null,
    url: item.url,
    thumbnail_url: item.thumbnail_url,
    original_filename: item.original_filename,
    file_size: item.file_size,
    content_type: item.content_type,
    width: item.width,
    height: item.height,
    caption: item.caption,
    uploaded_by: { id: "", name: "", email: "", profile_image_url: null },
    created_at: item.created_at,
  };
}

export function SharedGalleryPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { t } = useTranslation();
  const [galleryInfo, setGalleryInfo] = useState<SharedGalleryInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active album tab
  const [activeAlbum, setActiveAlbum] = useState<SharedAlbumSummary | null>(
    null,
  );

  // Photos for current album
  const [photos, setPhotos] = useState<OrgPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);

  // Lightbox
  const [lightboxPhoto, setLightboxPhoto] = useState<OrgPhoto | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Select mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch download progress
  const [batchProgress, setBatchProgress] =
    useState<BatchDownloadProgress | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);

  // Download history
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (photos.length > 0) {
      setDownloadedIds(getDownloadedIds(photos.map((p) => p.id)));
    }
  }, [photos]);

  // Fetch gallery info
  useEffect(() => {
    if (!shareToken) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const info = await publicGalleryAPI.getSharedGallery(shareToken);
        setGalleryInfo(info);
        if (info.albums.length > 0) {
          setActiveAlbum(info.albums[0]);
        }
      } catch {
        setError(t("photoGallery.shareNotAvailable", "Album not available"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [shareToken, t]);

  // Fetch photos for active album
  const fetchPhotos = useCallback(
    async (cursor?: string) => {
      if (!shareToken || !activeAlbum) return;
      try {
        setPhotosLoading(true);
        const data = await publicGalleryAPI.getSharedGalleryPhotos(
          shareToken,
          activeAlbum.id,
          { cursor, size: 12 },
        );
        const mapped = data.photos.map(toOrgPhoto);
        if (cursor) {
          setPhotos((prev) => [...prev, ...mapped]);
        } else {
          setPhotos(mapped);
        }
        setNextCursor(data.next_cursor);
        setHasNext(data.has_next);
      } catch {
        console.warn("Failed to fetch shared gallery photos");
      } finally {
        setPhotosLoading(false);
      }
    },
    [shareToken, activeAlbum],
  );

  useEffect(() => {
    if (activeAlbum) {
      setPhotos([]);
      setNextCursor(null);
      setHasNext(false);
      fetchPhotos();
    }
  }, [activeAlbum, fetchPhotos]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasNext &&
          !photosLoading &&
          nextCursor
        ) {
          fetchPhotos(nextCursor);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, photosLoading, nextCursor, fetchPhotos]);

  // Reset selection when switching albums or exiting select mode
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeAlbum, selectMode]);

  // Toggle select
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Cancel batch download
  const handleCancelBatch = useCallback(() => {
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
  }, []);

  // Batch download
  const handleBatchDownload = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const abortController = new AbortController();
    batchAbortRef.current = abortController;

    try {
      const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
      const batchItems = selectedPhotos.map((p) => ({
        url: p.url,
        filename: p.original_filename,
        id: p.id,
      }));

      const downloadedPhotoIds = await downloadPhotosBatch(batchItems, {
        onProgress: setBatchProgress,
        signal: abortController.signal,
      });

      if (downloadedPhotoIds.length > 0) {
        setDownloadedIds((prev) => {
          const next = new Set(prev);
          downloadedPhotoIds.forEach((id) => next.add(id));
          return next;
        });
      }
    } catch (error) {
      console.warn("Batch download failed:", error);
    } finally {
      setTimeout(() => setBatchProgress(null), 1500);
      batchAbortRef.current = null;
    }
  }, [selectedIds, photos]);

  // Download single photo
  const handleDownload = useCallback(async (photo: OrgPhoto) => {
    try {
      await downloadPhoto(photo.url, photo.original_filename, photo.id);
      setDownloadedIds((prev) => new Set(prev).add(photo.id));
    } catch (error) {
      console.warn("Download failed:", error);
    }
  }, []);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-bridge-accent mx-auto mb-4" />
          <p className="text-slate-400 text-sm">
            {t("app.loading", "Loading...")}
          </p>
        </div>
      </div>
    );
  }

  // Error
  if (error || !galleryInfo) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {t("photoGallery.shareNotAvailable", "Album not available")}
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            {t(
              "photoGallery.shareNotAvailableDesc",
              "This shared link has expired or the album has been deleted.",
            )}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl text-sm font-medium hover:bg-bridge-accent/90 transition-colors"
          >
            <ArrowLeft size={14} />
            {t("photoGallery.shareGoHome", "Go to Home")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Sticky header wrapper */}
      <div className="sticky top-0 z-30 bg-bridge-dark">
        {/* Top bar */}
        <header className="border-b border-foreground/5 bg-bridge-obsidian">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {galleryInfo.organization_logo_url ? (
                <img
                  src={resolveFileUrl(galleryInfo.organization_logo_url)}
                  alt={galleryInfo.organization_name}
                  className="h-7 w-7 rounded-lg object-cover"
                />
              ) : (
                <img
                  src="/BridgeSpotsIcon.png"
                  alt="BRIDGE"
                  className="h-6 w-6"
                />
              )}
              <span className="text-sm font-bold text-foreground">
                {galleryInfo.organization_name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs tracking-[0.3em] uppercase text-slate-500">
              <Camera size={12} />
              {t("photoGallery.shareReadOnly", "READ ONLY")}
            </div>
          </div>
        </header>

        {/* Gallery header */}
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-1">
            {galleryInfo.gallery_title || t("photoGallery.title", "Photos")}
          </h1>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
              {galleryInfo.total_photo_count}{" "}
              {t("photoGallery.photosUnit", "photos")}
            </span>
            {photos.length > 0 && (
              <button
                onClick={() => setSelectMode((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectMode
                    ? "bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/30"
                    : "bg-foreground/5 text-slate-400 border border-foreground/10 hover:text-foreground hover:bg-foreground/10"
                }`}
              >
                <CheckSquare size={14} />
                {selectMode
                  ? t("photoGallery.selectModeOff", "Cancel")
                  : t("photoGallery.selectMode", "Select")}
              </button>
            )}
          </div>
        </div>

        {/* Album tabs */}
        {galleryInfo.albums.length > 1 && (
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex items-center gap-2 pb-3 overflow-x-auto custom-scrollbar">
              {galleryInfo.albums.map((album) => (
                <button
                  key={album.id}
                  onClick={() => setActiveAlbum(album)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                    activeAlbum?.id === album.id
                      ? "bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/30"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-transparent"
                  }`}
                >
                  {album.name}
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      activeAlbum?.id === album.id
                        ? "bg-bridge-accent/20 text-bridge-accent"
                        : "bg-foreground/10 text-slate-500"
                    }`}
                  >
                    {album.photo_count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-foreground/5" />
      </div>
      {/* end sticky header wrapper */}

      {/* Photo grid */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {photos.length === 0 && !photosLoading ? (
          <div className="text-center py-20">
            <Images size={36} className="mx-auto mb-3 text-slate-500/50" />
            <p className="text-sm text-slate-500">
              {t("photoGallery.emptyTitle", "No photos yet")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {photos.map((photo, i) => (
              <motion.div
                key={photo.id}
                className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-bridge-obsidian border transition-all group ${
                  selectMode && selectedIds.has(photo.id)
                    ? "border-bridge-accent ring-2 ring-bridge-accent/50"
                    : "border-foreground/[0.08] hover:border-foreground/[0.12]"
                }`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() =>
                  selectMode
                    ? handleToggleSelect(photo.id)
                    : setLightboxPhoto(photo)
                }
              >
                <img
                  src={resolveFileUrl(photo.thumbnail_url || photo.url)}
                  alt={photo.caption || photo.original_filename}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Select checkbox */}
                {selectMode && (
                  <div className="absolute top-1.5 left-1.5 z-10">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        selectedIds.has(photo.id)
                          ? "bg-bridge-accent border-bridge-accent"
                          : "border-white/70 bg-black/30"
                      }`}
                    >
                      {selectedIds.has(photo.id) && (
                        <Check
                          size={14}
                          className="text-white"
                          strokeWidth={3}
                        />
                      )}
                    </div>
                  </div>
                )}
                {/* Downloaded badge */}
                {downloadedIds.has(photo.id) && (
                  <div className="absolute top-1.5 right-1.5 z-10">
                    <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white">
                      <Check size={10} strokeWidth={3} />
                      <span className="text-xs font-bold">saved</span>
                    </div>
                  </div>
                )}
                {/* Select mode: view photo button */}
                {selectMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxPhoto(photo);
                    }}
                    className="absolute bottom-2 right-2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all"
                    aria-label="View photo"
                  >
                    <Maximize2 size={14} className="text-white" />
                  </button>
                )}
                {!selectMode && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <span className="text-xs text-white/90 truncate flex-1">
                      {photo.original_filename}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(photo);
                      }}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-white/20 transition-colors shrink-0"
                    >
                      <Download size={14} className="text-white" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Skeleton loading */}
        {photosLoading && (
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

      {/* Lightbox */}
      <PhotoLightbox
        photo={lightboxPhoto}
        photos={photos}
        isAdmin={false}
        onClose={() => setLightboxPhoto(null)}
        onNavigate={setLightboxPhoto}
        onDownload={handleDownload}
        onDelete={() => {}}
      />

      {/* Batch download progress bar */}
      <AnimatePresence>
        {batchProgress && batchProgress.phase !== "done" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[min(320px,calc(100%-2rem))]"
          >
            <div className="bg-bridge-obsidian border border-foreground/[0.08] rounded-2xl shadow-2xl overflow-hidden">
              <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
              <div className="px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {batchProgress.phase === "cancelled" ? (
                      <X size={14} className="text-slate-400" />
                    ) : (
                      <Loader2
                        size={14}
                        className="animate-spin text-bridge-accent"
                      />
                    )}
                    <span className="text-xs font-bold text-foreground">
                      {batchProgress.phase === "saving"
                        ? t("photoGallery.progressSaving", "Saving...")
                        : batchProgress.phase === "cancelled"
                          ? t("photoGallery.progressCancelled", "Cancelled")
                          : t(
                              "photoGallery.progressDownloading",
                              "{{current}} / {{total}}",
                              {
                                current: batchProgress.current,
                                total: batchProgress.total,
                              },
                            )}
                    </span>
                  </div>
                  {batchProgress.phase === "downloading" && (
                    <button
                      onClick={handleCancelBatch}
                      className="text-xs font-bold text-slate-400 hover:text-foreground transition-colors"
                    >
                      {t("common.cancel", "Cancel")}
                    </button>
                  )}
                </div>
                <div className="h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${
                      batchProgress.phase === "cancelled"
                        ? "bg-slate-400"
                        : "bg-bridge-accent"
                    }`}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                {batchProgress.failedCount > 0 && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    {t("photoGallery.progressFailed", "{{count}} failed", {
                      count: batchProgress.failedCount,
                    })}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection floating action bar */}
      <AnimatePresence>
        {selectMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-2xl bg-bridge-obsidian border border-foreground/[0.08] shadow-2xl whitespace-nowrap"
          >
            <span className="text-xs font-bold text-foreground">
              {selectedIds.size}
            </span>
            <button
              onClick={handleBatchDownload}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all"
            >
              <Download size={13} />
              {t("photoGallery.download", "Download")}
            </button>
            <button
              onClick={() => {
                setSelectedIds(new Set());
                setSelectMode(false);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              aria-label="선택 해제"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-foreground/5 mt-8">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <span className="text-xs tracking-[0.3em] uppercase text-slate-600">
            Shared via BRIDGE
          </span>
          <a
            href="https://bridgespots.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-bridge-accent transition-colors"
          >
            bridgespots.com
          </a>
        </div>
      </footer>
    </div>
  );
}
