import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Upload,
  Loader2,
  Check,
  ImagePlus,
  X,
  AlertCircle,
  Plus,
  Trash2,
  Images,
  Download,
  CheckSquare,
  Square,
} from "lucide-react";
import {
  publicGalleryUploadAPI,
  resolveFileUrl,
  type ChunkedUploadProgress,
} from "../utils/api";
import { PhotoLightbox } from "../components/organization/photo/PhotoLightbox";
import { IconButton } from "../components/ui/IconButton";
import {
  downloadPhoto,
  downloadPhotosBatch,
  getDownloadedIds,
  markManyAsDownloaded,
} from "../utils/nativeDownload";
import type {
  GalleryUploadInfo,
  SharedAlbumSummary,
  SharedPhotoItem,
  OrgPhoto,
} from "../types";

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

export function GalleryUploadPage() {
  const { uploadToken } = useParams<{ uploadToken: string }>();
  const { t } = useTranslation();
  const [galleryInfo, setGalleryInfo] = useState<GalleryUploadInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active album
  const [activeAlbum, setActiveAlbum] = useState<SharedAlbumSummary | null>(
    null,
  );

  // Photos for current album
  const [photos, setPhotos] = useState<OrgPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);

  // Upload state
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadProgress, setUploadProgress] =
    useState<ChunkedUploadProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Album management
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingAlbumId, setDeletingAlbumId] = useState<string | null>(null);
  const [confirmDeleteAlbum, setConfirmDeleteAlbum] =
    useState<SharedAlbumSummary | null>(null);

  // Photo deletion
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Lightbox
  const [lightboxPhoto, setLightboxPhoto] = useState<OrgPhoto | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Download history
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  // Sync download history when photos change
  useEffect(() => {
    if (photos.length > 0) {
      setDownloadedIds(getDownloadedIds(photos.map((p) => p.id)));
    }
  }, [photos]);

  // Download single photo
  const handleDownload = useCallback(async (photo: OrgPhoto) => {
    try {
      await downloadPhoto(photo.url, photo.original_filename, photo.id);
      setDownloadedIds((prev) => new Set(prev).add(photo.id));
    } catch (error) {
      console.warn("Download failed:", error);
    }
  }, []);

  // Toggle selection
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === photos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(photos.map((p) => p.id)));
    }
  }, [photos, selectedIds.size]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  }, []);

  // Batch download (Web Share on mobile, individual on desktop/native)
  const handleBatchDownload = useCallback(async () => {
    if (selectedIds.size === 0 || batchDownloading) return;
    setBatchDownloading(true);
    try {
      const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
      const batchItems = selectedPhotos.map((p) => ({
        url: p.url,
        filename: p.original_filename,
        id: p.id,
      }));
      const downloadedBatch = await downloadPhotosBatch(batchItems);
      if (downloadedBatch.length > 0) {
        setDownloadedIds((prev) => {
          const next = new Set(prev);
          downloadedBatch.forEach((id) => next.add(id));
          return next;
        });
      }
    } finally {
      setBatchDownloading(false);
    }
  }, [selectedIds, photos, batchDownloading]);

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0 || batchDeleting || !uploadToken || !activeAlbum)
      return;
    setBatchDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      for (const photoId of ids) {
        try {
          await publicGalleryUploadAPI.deletePhoto(
            uploadToken,
            activeAlbum.id,
            photoId,
          );
        } catch {
          console.warn("Failed to delete photo:", photoId);
        }
      }
      const deletedCount = ids.length;
      setPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setGalleryInfo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          albums: prev.albums.map((a) =>
            a.id === activeAlbum.id
              ? { ...a, photo_count: Math.max(0, a.photo_count - deletedCount) }
              : a,
          ),
        };
      });
      setActiveAlbum((prev) =>
        prev
          ? {
              ...prev,
              photo_count: Math.max(0, prev.photo_count - deletedCount),
            }
          : prev,
      );
      exitSelectMode();
    } finally {
      setBatchDeleting(false);
    }
  }, [selectedIds, batchDeleting, uploadToken, activeAlbum, exitSelectMode]);

  // Expiry info
  const expiresAt = galleryInfo?.expires_at
    ? new Date(galleryInfo.expires_at)
    : null;
  const now = new Date();
  const hoursLeft = expiresAt
    ? Math.max(
        0,
        Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)),
      )
    : 0;
  const daysLeft = Math.floor(hoursLeft / 24);

  // Fetch gallery info
  useEffect(() => {
    if (!uploadToken) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const info =
          await publicGalleryUploadAPI.getGalleryUploadInfo(uploadToken);
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
  }, [uploadToken, t]);

  // Fetch photos for active album
  const fetchPhotos = useCallback(
    async (cursor?: string) => {
      if (!uploadToken || !activeAlbum) return;
      try {
        setPhotosLoading(true);
        const data = await publicGalleryUploadAPI.getAlbumPhotos(
          uploadToken,
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
        console.warn("Failed to fetch gallery upload photos");
      } finally {
        setPhotosLoading(false);
      }
    },
    [uploadToken, activeAlbum],
  );

  useEffect(() => {
    if (activeAlbum) {
      setPhotos([]);
      setNextCursor(null);
      setHasNext(false);
      fetchPhotos();
      // Reset upload state when switching albums
      setUploaded(false);
      setUploadCount(0);
      exitSelectMode();
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

  // File handling
  const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB
  const MAX_TOTAL_FILES = 100;

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const imageFiles = newFiles.filter((f) => f.type.startsWith("image/"));
      const oversized = imageFiles.filter((f) => f.size > MAX_FILE_SIZE);
      if (oversized.length > 0) {
        setError(
          t(
            "photoGallery.fileTooLarge",
            `${oversized.length} file(s) exceed 30MB limit`,
          ),
        );
        return;
      }
      setFiles((prev) => {
        const remaining = MAX_TOTAL_FILES - prev.length;
        if (remaining <= 0) {
          setError(
            t(
              "photoGallery.maxFilesReached",
              `Maximum ${MAX_TOTAL_FILES} photos per upload`,
            ),
          );
          return prev;
        }
        const toAdd = imageFiles.slice(0, remaining);
        if (toAdd.length < imageFiles.length) {
          setError(
            t(
              "photoGallery.filesLimited",
              `Only ${toAdd.length} of ${imageFiles.length} photos added (max ${MAX_TOTAL_FILES})`,
            ),
          );
        }
        const objectUrls = toAdd.map((f) => URL.createObjectURL(f));
        setPreviews((p) => [...p, ...objectUrls]);
        return [...prev, ...toAdd];
      });
    },
    [t],
  );

  const removeFile = useCallback((index: number) => {
    setPreviews((prev) => {
      if (prev[index]) URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleUpload = useCallback(async () => {
    if (!uploadToken || !activeAlbum || files.length === 0 || uploading) return;
    try {
      setUploading(true);
      setUploadProgress(null);
      await publicGalleryUploadAPI.uploadPhotos(
        uploadToken,
        activeAlbum.id,
        files,
        (progress) => setUploadProgress(progress),
      );
      setUploadCount(files.length);
      setUploaded(true);
      setUploadProgress(null);
      setError(null);
      previews.forEach((u) => URL.revokeObjectURL(u));
      setFiles([]);
      setPreviews([]);
      // Refresh photos and album info
      fetchPhotos();
      // Update photo count in gallery info
      setGalleryInfo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          albums: prev.albums.map((a) =>
            a.id === activeAlbum.id
              ? { ...a, photo_count: a.photo_count + files.length }
              : a,
          ),
        };
      });
      setActiveAlbum((prev) =>
        prev ? { ...prev, photo_count: prev.photo_count + files.length } : prev,
      );
    } catch (err: unknown) {
      setUploadProgress(null);
      const code = (err as { error?: { code?: string } })?.error?.code;
      const message =
        code === "FILE_TOO_LARGE"
          ? t(
              "photoGallery.errorFileTooLarge",
              "File size exceeds the limit (max 30MB)",
            )
          : code === "FILE_TYPE_NOT_ALLOWED"
            ? t("photoGallery.errorFileType", "Unsupported file format")
            : code === "PHOTO_UPLOAD_LIMIT_EXCEEDED"
              ? t(
                  "photoGallery.errorUploadLimit",
                  "Maximum 20 photos per upload",
                )
              : code === "ORGANIZATION_NOT_FOUND"
                ? t("photoGallery.errorTokenExpired", "Upload link has expired")
                : t(
                    "photoGallery.errorUploadFailed",
                    "Upload failed. Please try again.",
                  );
      setError(message);
    } finally {
      setUploading(false);
    }
  }, [uploadToken, activeAlbum, files, uploading, fetchPhotos]);

  // Create album
  const handleCreateAlbum = useCallback(async () => {
    if (!uploadToken || !newAlbumName.trim() || creating) return;
    try {
      setCreating(true);
      const album = await publicGalleryUploadAPI.createAlbum(uploadToken, {
        name: newAlbumName.trim(),
      });
      setGalleryInfo((prev) => {
        if (!prev) return prev;
        return { ...prev, albums: [...prev.albums, album] };
      });
      setActiveAlbum(album);
      setNewAlbumName("");
      setShowCreateAlbum(false);
    } catch {
      setError("Failed to create album.");
    } finally {
      setCreating(false);
    }
  }, [uploadToken, newAlbumName, creating]);

  // Delete album
  const handleDeleteAlbum = useCallback(
    async (album: SharedAlbumSummary) => {
      if (!uploadToken || deletingAlbumId) return;
      try {
        setDeletingAlbumId(album.id);
        await publicGalleryUploadAPI.deleteAlbum(uploadToken, album.id);
        setGalleryInfo((prev) => {
          if (!prev) return prev;
          const remaining = prev.albums.filter((a) => a.id !== album.id);
          // If we deleted the active album, switch to first remaining
          if (activeAlbum?.id === album.id) {
            setActiveAlbum(remaining.length > 0 ? remaining[0] : null);
          }
          return { ...prev, albums: remaining };
        });
        setConfirmDeleteAlbum(null);
      } catch {
        setError("Failed to delete album.");
      } finally {
        setDeletingAlbumId(null);
      }
    },
    [uploadToken, deletingAlbumId, activeAlbum],
  );

  // Delete photo
  const handleDeletePhoto = useCallback(
    async (photo: OrgPhoto) => {
      if (!uploadToken || !activeAlbum || deletingPhotoId) return;
      try {
        setDeletingPhotoId(photo.id);
        await publicGalleryUploadAPI.deletePhoto(
          uploadToken,
          activeAlbum.id,
          photo.id,
        );
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        setGalleryInfo((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            albums: prev.albums.map((a) =>
              a.id === activeAlbum.id
                ? { ...a, photo_count: Math.max(0, a.photo_count - 1) }
                : a,
            ),
          };
        });
        setActiveAlbum((prev) =>
          prev
            ? { ...prev, photo_count: Math.max(0, prev.photo_count - 1) }
            : prev,
        );
      } catch {
        console.warn("Failed to delete photo");
      } finally {
        setDeletingPhotoId(null);
      }
    },
    [uploadToken, activeAlbum, deletingPhotoId],
  );

  if (loading) {
    return (
      <div
        className="min-h-screen bg-bridge-dark flex items-center justify-center"
        role="status"
        aria-label="로딩 중"
      >
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (error || !galleryInfo) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            {t("photoGallery.shareNotAvailable", "Link Expired")}
          </h1>
          <p className="text-sm text-slate-400">
            {t(
              "photoGallery.shareNotAvailableDesc",
              "This upload link is no longer valid.",
            )}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 mt-6 bg-bridge-accent text-white rounded-xl text-sm font-medium hover:bg-bridge-accent/90 transition-colors"
          >
            {t("photoGallery.shareGoHome", "Go to Home")}
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <header className="border-b border-foreground/5 bg-bridge-obsidian">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {galleryInfo.organization_logo_url ? (
              <img
                src={resolveFileUrl(galleryInfo.organization_logo_url)}
                alt={galleryInfo.organization_name || "조직 로고"}
                className="w-8 h-8 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-bridge-secondary/20 flex items-center justify-center shrink-0">
                <Upload size={16} className="text-bridge-secondary" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground truncate">
                {galleryInfo.organization_name}
              </h1>
              <p className="text-xs text-slate-500">
                {t("photoGallery.title", "Photos")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
              {daysLeft > 0 ? `${daysLeft}d left` : `${hoursLeft}h left`}
            </span>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary uppercase tracking-wider">
              Upload
            </span>
          </div>
        </div>
      </header>

      {/* Album tabs */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4">
        <div className="flex items-center gap-2 pb-3 overflow-x-auto custom-scrollbar">
          {galleryInfo.albums.map((album) => (
            <div key={album.id} className="relative flex-shrink-0 group/tab">
              <button
                onClick={() => setActiveAlbum(album)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  activeAlbum?.id === album.id
                    ? "bg-bridge-secondary/15 text-bridge-secondary border border-bridge-secondary/30"
                    : "text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-transparent"
                }`}
              >
                {album.name}
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    activeAlbum?.id === album.id
                      ? "bg-bridge-secondary/20 text-bridge-secondary"
                      : "bg-foreground/10 text-slate-500"
                  }`}
                >
                  {album.photo_count}
                </span>
              </button>
              {/* Delete album button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (album.photo_count > 0) {
                    setConfirmDeleteAlbum(album);
                  } else {
                    handleDeleteAlbum(album);
                  }
                }}
                disabled={!!deletingAlbumId}
                className="absolute -top-1 -right-1 p-2 flex items-center justify-center rounded-full bg-bridge-dark border border-foreground/[0.08] text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-100 md:opacity-0 md:group-hover/tab:opacity-100 transition-all"
              >
                {deletingAlbumId === album.id ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <X size={10} />
                )}
              </button>
            </div>
          ))}
          {/* Add album button */}
          {showCreateAlbum ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                autoFocus
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateAlbum();
                  if (e.key === "Escape") {
                    setShowCreateAlbum(false);
                    setNewAlbumName("");
                  }
                }}
                placeholder={t(
                  "photoGallery.albumNamePlaceholder",
                  "Album name",
                )}
                className="w-32 px-3 py-1.5 bg-foreground/[0.03] border border-foreground/10 rounded-xl text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              />
              <button
                onClick={handleCreateAlbum}
                disabled={creating || !newAlbumName.trim()}
                className="p-1.5 rounded-lg bg-bridge-secondary text-white hover:bg-bridge-secondary/90 transition-colors disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
              </button>
              <IconButton
                onClick={() => {
                  setShowCreateAlbum(false);
                  setNewAlbumName("");
                }}
                aria-label="취소"
              >
                <X />
              </IconButton>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateAlbum(true)}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-bridge-secondary hover:bg-bridge-secondary/10 border border-dashed border-foreground/[0.12] hover:border-bridge-secondary/30 transition-all"
            >
              <Plus size={14} />
              {t("photoGallery.createAlbum", "Add Album")}
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-foreground/5" />

      {/* Error toast */}
      {error && galleryInfo && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Delete album confirmation */}
      {confirmDeleteAlbum && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <Trash2 size={16} className="text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">
                {t("photoGallery.deleteAlbumConfirm", "Delete album?")}
              </p>
              <p className="text-xs text-slate-400">
                "{confirmDeleteAlbum.name}" — {confirmDeleteAlbum.photo_count}{" "}
                {t("photoGallery.photosUnit", "photos")}{" "}
                {t(
                  "photoGallery.deleteAlbumWarning",
                  "will be permanently deleted.",
                )}
              </p>
            </div>
            <button
              onClick={() => handleDeleteAlbum(confirmDeleteAlbum)}
              disabled={!!deletingAlbumId}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 shrink-0"
            >
              {deletingAlbumId ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                t("photoGallery.deleteButton", "Delete")
              )}
            </button>
            <IconButton
              onClick={() => setConfirmDeleteAlbum(null)}
              aria-label="닫기"
            >
              <X />
            </IconButton>
          </div>
        </div>
      )}

      {activeAlbum ? (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Existing photos */}
          {photos.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {activeAlbum.photo_count}{" "}
                  {t("photoGallery.photosUnit", "photos")}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {selectMode ? (
                    <>
                      <button
                        onClick={handleSelectAll}
                        className="text-xs text-slate-400 hover:text-foreground transition-colors"
                      >
                        {selectedIds.size === photos.length
                          ? t("photoGallery.deselectAll", "Deselect all")
                          : t("photoGallery.selectAll", "Select all")}
                      </button>
                      <button
                        onClick={handleBatchDownload}
                        disabled={selectedIds.size === 0 || batchDownloading}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-bridge-accent/15 text-bridge-accent hover:bg-bridge-accent/25 transition-colors disabled:opacity-40"
                      >
                        {batchDownloading ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Download size={12} />
                        )}
                        {selectedIds.size > 0 && selectedIds.size}
                      </button>
                      <button
                        onClick={() =>
                          selectedIds.size > 0 && setShowDeleteConfirm(true)
                        }
                        disabled={selectedIds.size === 0 || batchDeleting}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40"
                      >
                        {batchDeleting ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        {selectedIds.size > 0 && selectedIds.size}
                      </button>
                      <IconButton
                        onClick={exitSelectMode}
                        aria-label="선택 해제"
                      >
                        <X />
                      </IconButton>
                    </>
                  ) : (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <CheckSquare size={12} />
                      {t("photoGallery.select", "Select")}
                    </button>
                  )}
                </div>
              </div>

              {/* Batch delete confirmation */}
              {showDeleteConfirm && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-3">
                  <Trash2 size={16} className="text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {t(
                        "photoGallery.deletePhotosConfirm",
                        "Delete {{count}} photos?",
                        { count: selectedIds.size },
                      )}
                    </p>
                    <p className="text-xs text-slate-400">
                      {t(
                        "photoGallery.deleteAlbumWarning",
                        "will be permanently deleted.",
                      )}
                    </p>
                  </div>
                  <button
                    onClick={handleBatchDelete}
                    disabled={batchDeleting}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {batchDeleting ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      t("photoGallery.deleteButton", "Delete")
                    )}
                  </button>
                  <IconButton
                    onClick={() => setShowDeleteConfirm(false)}
                    aria-label="닫기"
                  >
                    <X />
                  </IconButton>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {photos.map((photo, i) => {
                  const isSelected = selectedIds.has(photo.id);
                  return (
                    <motion.div
                      key={photo.id}
                      className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer bg-bridge-obsidian border transition-all group ${
                        isSelected
                          ? "border-bridge-accent ring-2 ring-bridge-accent/30"
                          : "border-foreground/[0.08] hover:border-foreground/[0.12]"
                      }`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => {
                        if (selectMode) {
                          handleToggleSelect(photo.id);
                        } else {
                          setLightboxPhoto(photo);
                        }
                      }}
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
                          {isSelected ? (
                            <div className="w-5 h-5 rounded bg-bridge-accent flex items-center justify-center">
                              <Check size={12} className="text-white" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded border-2 border-white/70 bg-black/30" />
                          )}
                        </div>
                      )}
                      {/* Downloaded badge */}
                      {!selectMode && downloadedIds.has(photo.id) && (
                        <div className="absolute top-1.5 right-1.5 z-10">
                          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white">
                            <Check size={10} strokeWidth={3} />
                            <span className="text-xs font-bold">saved</span>
                          </div>
                        </div>
                      )}
                      {/* Hover overlay (only in non-select mode) */}
                      {!selectMode && (
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
                          <span className="text-xs text-white/90 truncate flex-1">
                            {photo.original_filename}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(photo);
                              }}
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-white/20 transition-colors"
                            >
                              <Download size={14} className="text-white" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePhoto(photo);
                              }}
                              disabled={deletingPhotoId === photo.id}
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-red-500/30 transition-colors"
                            >
                              {deletingPhotoId === photo.id ? (
                                <Loader2
                                  size={14}
                                  className="text-white animate-spin"
                                />
                              ) : (
                                <Trash2 size={14} className="text-white" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {photosLoading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-xl bg-foreground/5 animate-pulse"
                    />
                  ))}
                </div>
              )}
              <div ref={sentinelRef} className="h-1" />
            </div>
          )}

          {photos.length === 0 && !photosLoading && !uploaded && (
            <div className="text-center py-8">
              <Images size={28} className="mx-auto mb-2 text-slate-500/50" />
              <p className="text-sm text-slate-500">
                {t("photoGallery.emptyTitle", "No photos yet")}
              </p>
            </div>
          )}

          {/* Upload success message */}
          {uploaded && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
            >
              <Check size={16} className="text-emerald-400 shrink-0" />
              <p className="text-sm text-foreground">
                {uploadCount} {t("photoGallery.photosUnit", "photos")}{" "}
                {t("photoGallery.uploadSuccess", "uploaded")}
              </p>
              <button
                onClick={() => setUploaded(false)}
                className="ml-auto text-slate-500 hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}

          {/* Drop zone */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-bridge-secondary bg-bridge-secondary/5"
                  : "border-foreground/[0.12] hover:border-foreground/[0.2] hover:bg-foreground/[0.02]"
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-bridge-secondary/15 flex items-center justify-center mx-auto mb-4">
                <ImagePlus className="w-6 h-6 text-bridge-secondary" />
              </div>
              <p className="text-sm font-bold text-foreground mb-1">
                {t(
                  "photoGallery.dragAndDrop",
                  "Drop photos here or click to browse",
                )}
              </p>
              <p className="text-xs text-slate-500">
                {t("photoGallery.uploadHint", "Supports JPG, PNG, GIF, WebP")}
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }
              }}
            />

            {/* Preview grid */}
            {files.length > 0 && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {files.length} {t("photoGallery.photosUnit", "photos")}{" "}
                    selected
                  </span>
                  <button
                    onClick={() => {
                      previews.forEach((u) => URL.revokeObjectURL(u));
                      setFiles([]);
                      setPreviews([]);
                    }}
                    className="text-xs text-slate-500 hover:text-foreground transition-colors"
                  >
                    Clear all
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {previews.map((preview, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="relative aspect-square rounded-xl overflow-hidden group"
                    >
                      <img
                        src={preview}
                        alt="업로드 미리보기"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="absolute top-1 right-1 p-1 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </motion.div>
                  ))}
                </div>

                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full py-3 bg-bridge-secondary text-white rounded-xl font-bold hover:bg-bridge-secondary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {t("photoGallery.uploading", "Uploading...")}
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      {t("photoGallery.upload", "Upload")} {files.length}{" "}
                      {t("photoGallery.photosUnit", "photos")}
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 text-center">
          <Images size={36} className="mx-auto mb-3 text-slate-500/50" />
          <p className="text-sm text-slate-500 mb-4">
            {t("photoGallery.noAlbums", "No albums yet")}
          </p>
          <button
            onClick={() => setShowCreateAlbum(true)}
            className="px-5 py-2.5 bg-bridge-secondary text-white rounded-xl font-bold hover:bg-bridge-secondary/90 transition-all inline-flex items-center gap-2"
          >
            <Plus size={16} />
            {t("photoGallery.createAlbum", "Add Album")}
          </button>
        </div>
      )}

      {/* Upload Progress Modal */}
      {uploading && uploadProgress && uploadProgress.totalBatches > 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm mx-4 bg-bridge-obsidian rounded-2xl border border-foreground/10 shadow-2xl overflow-hidden"
          >
            <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
            <div className="px-5 pt-5 pb-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-bridge-secondary/15 flex items-center justify-center shrink-0">
                  <Loader2 className="w-5 h-5 animate-spin text-bridge-secondary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {t("photoGallery.uploading", "Uploading...")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {uploadProgress.uploadedFiles} / {uploadProgress.totalFiles}{" "}
                    {t("photoGallery.photosUnit", "photos")}
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-foreground/[0.08] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-bridge-secondary rounded-full"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(uploadProgress.uploadedFiles / uploadProgress.totalFiles) * 100}%`,
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-slate-600 text-center">
                Batch {uploadProgress.currentBatch} /{" "}
                {uploadProgress.totalBatches}
              </p>
            </div>
          </motion.div>
        </div>
      )}

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

      {/* Footer */}
      <footer className="border-t border-foreground/5 mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
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
