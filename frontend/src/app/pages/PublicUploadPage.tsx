import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Upload,
  Loader2,
  ImagePlus,
  AlertCircle,
  Trash2,
  Images,
} from "lucide-react";
import { motion } from "framer-motion";
import { publicUploadAPI, resolveFileUrl } from "../utils/api";
import {
  PhotoUploadQueue,
  PHOTO_ACCEPTED_TYPES,
  PHOTO_UPLOAD_MAX_FILES,
  validatePhotoFile,
  type PhotoUploadTarget,
} from "../utils/photoUploadQueue";
import {
  usePhotoUploadQueue,
  usePhotoUploadConfirmed,
} from "../hooks/usePhotoUploadQueue";
import { PhotoUploadProgress } from "../components/organization/photo/PhotoUploadProgress";
import { SelectedPhotoGrid } from "../components/organization/photo/SelectedPhotoGrid";
import type { SharedPhotoItem, UploadAlbumInfo } from "../types";

const PHOTO_PAGE_SIZE = 30;

export function PublicUploadPage() {
  const { uploadToken } = useParams<{ uploadToken: string }>();
  const { t } = useTranslation();
  const [albumInfo, setAlbumInfo] = useState<UploadAlbumInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue] = useState(() => new PhotoUploadQueue());
  const snap = usePhotoUploadQueue(queue);
  const uploading = snap.active;

  // 앨범에 이미 올라간 사진 (링크 소지자 누구나 보기/삭제)
  const [photos, setPhotos] = useState<SharedPhotoItem[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  // 실수 삭제 방지: 휴지통을 한 번 누르면 확인 상태, 한 번 더 눌러야 삭제
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uploadToken) return;
    const load = async () => {
      try {
        setLoading(true);
        const info = await publicUploadAPI.getUploadAlbumInfo(uploadToken);
        setAlbumInfo(info);
      } catch {
        setError("This upload link is invalid or has expired.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uploadToken]);

  const fetchPhotos = useCallback(
    async (cursor?: string) => {
      if (!uploadToken) return;
      try {
        setPhotosLoading(true);
        const data = await publicUploadAPI.getPhotos(uploadToken, {
          cursor,
          size: PHOTO_PAGE_SIZE,
        });
        setPhotos((prev) => (cursor ? [...prev, ...data.photos] : data.photos));
        setNextCursor(data.next_cursor);
        setHasNext(data.has_next);
        setTotalCount(data.total_count);
      } catch {
        console.warn("Failed to fetch upload link photos");
      } finally {
        setPhotosLoading(false);
      }
    },
    [uploadToken],
  );

  useEffect(() => {
    if (albumInfo) fetchPhotos();
  }, [albumInfo, fetchPhotos]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNext && !photosLoading && nextCursor) {
          fetchPhotos(nextCursor);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, photosLoading, nextCursor, fetchPhotos]);

  // confirm 묶음이 들어올 때마다 목록 갱신 (1.5초 디바운스)
  usePhotoUploadConfirmed(queue, () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      fetchPhotos();
    }, 1500);
  });

  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  // 확인 상태는 3초 뒤 자동 해제
  useEffect(() => {
    if (!pendingDeleteId) return;
    const timer = setTimeout(() => setPendingDeleteId(null), 3000);
    return () => clearTimeout(timer);
  }, [pendingDeleteId]);

  const handleDeletePhoto = useCallback(
    async (photo: SharedPhotoItem) => {
      if (!uploadToken || deletingPhotoId) return;
      if (pendingDeleteId !== photo.id) {
        setPendingDeleteId(photo.id);
        return;
      }
      setPendingDeleteId(null);
      try {
        setDeletingPhotoId(photo.id);
        await publicUploadAPI.deletePhoto(uploadToken, photo.id);
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        setTotalCount((prev) => Math.max(0, prev - 1));
      } catch {
        setNotice(t("photoGallery.deleteError", "Failed to delete photo"));
      } finally {
        setDeletingPhotoId(null);
      }
    },
    [uploadToken, deletingPhotoId, pendingDeleteId, t],
  );

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const valid = newFiles.filter((f) => !validatePhotoFile(f));
      const skipped = newFiles.length - valid.length;
      setNotice(
        skipped > 0
          ? t(
              "photoGallery.filesSkipped",
              "{{count}} files skipped (unsupported format or over 30MB)",
              { count: skipped },
            )
          : null,
      );
      setFiles((prev) => {
        const remaining = PHOTO_UPLOAD_MAX_FILES - prev.length;
        if (remaining < valid.length) {
          setNotice(
            t("photoGallery.maxFiles", "Maximum {{max}} files", {
              max: PHOTO_UPLOAD_MAX_FILES,
            }),
          );
        }
        if (remaining <= 0) return prev;
        return [...prev, ...valid.slice(0, remaining)];
      });
    },
    [t],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    },
    [addFiles],
  );

  const handleUpload = useCallback(() => {
    if (!uploadToken || files.length === 0) return;
    const target: PhotoUploadTarget = {
      key: uploadToken,
      presign: (f) => publicUploadAPI.presign(uploadToken, f),
      confirm: (items) => publicUploadAPI.confirm(uploadToken, items),
      uploadDirect: (f) => publicUploadAPI.uploadChunk(uploadToken, f),
    };
    queue.enqueue(files, target);
    setFiles([]);
    setNotice(null);
  }, [uploadToken, files, queue]);

  // Expiry info
  const expiresAt = albumInfo?.expires_at
    ? new Date(albumInfo.expires_at)
    : null;
  const now = new Date();
  const hoursLeft = expiresAt
    ? Math.max(
        0,
        Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)),
      )
    : 0;
  const daysLeft = Math.floor(hoursLeft / 24);

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

  if (error || !albumInfo) {
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
            Link Expired
          </h1>
          <p className="text-sm text-slate-400">
            {error || "This upload link is no longer valid."}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bridge-dark">
      {/* Header */}
      <div className="border-b border-foreground/[0.08] bg-bridge-obsidian">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {albumInfo.organization_logo_url ? (
            <img
              src={albumInfo.organization_logo_url}
              alt={albumInfo.organization_name || "조직 로고"}
              className="w-8 h-8 rounded-lg object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
              <Upload size={16} className="text-bridge-accent" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              {albumInfo.album_name}
            </h1>
            <p className="text-xs text-slate-500">
              {albumInfo.organization_name}
            </p>
          </div>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary shrink-0">
            {daysLeft > 0 ? `${daysLeft}d left` : `${hoursLeft}h left`}
          </span>
        </div>
      </div>

      {/* Upload Area */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-bridge-accent bg-bridge-accent/5"
                : "border-foreground/[0.12] hover:border-foreground/[0.2] hover:bg-foreground/[0.02]"
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-bridge-accent/15 flex items-center justify-center mx-auto mb-4">
              <ImagePlus className="w-6 h-6 text-bridge-accent" />
            </div>
            <p className="text-sm font-bold text-foreground mb-1">
              Drop photos here or click to browse
            </p>
            <p className="text-xs text-slate-500">
              {t(
                "photoGallery.uploadFormats",
                "JPG, PNG, WebP, GIF - max {{max}} files",
                { max: PHOTO_UPLOAD_MAX_FILES },
              )}
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={PHOTO_ACCEPTED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                addFiles(Array.from(e.target.files));
                e.target.value = "";
              }
            }}
          />

          {notice && (
            <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
              {notice}
            </p>
          )}

          {/* Upload progress (실패 시 실패분만 다시 시도) */}
          {snap.total > 0 && (
            <div className="mt-6">
              <PhotoUploadProgress queue={queue} />
            </div>
          )}

          {/* Preview grid */}
          {files.length > 0 && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {files.length} photo{files.length !== 1 ? "s" : ""} selected
                </span>
                <button
                  onClick={() => setFiles([])}
                  className="text-xs text-slate-500 hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>

              <SelectedPhotoGrid files={files} onRemove={removeFile} />

              <button
                onClick={handleUpload}
                className="w-full py-3 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {t("photoGallery.addToQueue", "Add {{count}} to upload", {
                      count: files.length,
                    })}
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Upload {files.length} Photo{files.length !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>

        {/* Album photos */}
        <section className="mt-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t("photoGallery.uploadedPhotos", "Photos in this album")}
            </span>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
              {totalCount}
            </span>
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {photos.map((photo, i) => {
                const isPending = pendingDeleteId === photo.id;
                const isDeleting = deletingPhotoId === photo.id;
                return (
                  <motion.div
                    key={photo.id}
                    className="relative aspect-square rounded-xl overflow-hidden bg-bridge-obsidian border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors group"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.04 }}
                  >
                    <a
                      href={resolveFileUrl(photo.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full h-full"
                    >
                      <img
                        src={resolveFileUrl(photo.thumbnail_url || photo.url)}
                        alt={photo.caption || photo.original_filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </a>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
                      <span className="text-xs text-white/90 truncate flex-1">
                        {photo.original_filename}
                      </span>
                      <button
                        onClick={() => handleDeletePhoto(photo)}
                        disabled={isDeleting}
                        aria-label={
                          isPending
                            ? t("photoGallery.confirmDeletePhoto", "Tap again to delete")
                            : t("photoGallery.deletePhoto", "Delete photo")
                        }
                        className={`pointer-events-auto min-w-[44px] min-h-[44px] px-2 flex items-center justify-center gap-1 rounded-md transition-colors shrink-0 ${
                          isPending ? "bg-red-500 text-white" : "text-white hover:bg-red-500/30"
                        }`}
                      >
                        {isDeleting ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        {isPending && (
                          <span className="text-xs font-bold">
                            {t("photoGallery.confirmDeleteShort", "Delete?")}
                          </span>
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {photosLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
            </div>
          )}

          {photos.length === 0 && !photosLoading && (
            <div className="text-center py-8">
              <Images size={28} className="mx-auto mb-2 text-slate-500/50" />
              <p className="text-sm text-slate-500">
                {t("photoGallery.emptyTitle", "No photos yet")}
              </p>
            </div>
          )}
          <div ref={sentinelRef} className="h-1" />
        </section>
      </div>
    </div>
  );
}
