import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Upload,
  Loader2,
  Check,
  ImagePlus,
  AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { publicUploadAPI } from "../utils/api";
import {
  PhotoUploadQueue,
  PHOTO_ACCEPTED_TYPES,
  PHOTO_UPLOAD_MAX_FILES,
  validatePhotoFile,
  type PhotoUploadTarget,
} from "../utils/photoUploadQueue";
import { usePhotoUploadQueue } from "../hooks/usePhotoUploadQueue";
import { PhotoUploadProgress } from "../components/organization/photo/PhotoUploadProgress";
import { SelectedPhotoGrid } from "../components/organization/photo/SelectedPhotoGrid";
import type { UploadAlbumInfo } from "../types";

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
  // 큐가 모두 성공으로 끝나면 완료 화면
  const uploaded = snap.total > 0 && !snap.active && snap.failed === 0;

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

  const handleUploadMore = useCallback(() => {
    queue.clearFinished();
  }, [queue]);

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

  if (uploaded) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-2">
            Upload Complete!
          </h1>
          <p className="text-sm text-slate-400 mb-6">
            {snap.confirmed} photo{snap.confirmed !== 1 ? "s" : ""} uploaded to{" "}
            <span className="text-foreground font-medium">
              {albumInfo.album_name}
            </span>
          </p>
          <button
            onClick={handleUploadMore}
            className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all"
          >
            Upload More
          </button>
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
      </div>

    </div>
  );
}
