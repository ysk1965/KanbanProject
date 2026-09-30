import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { AlertCircle, Check, ChevronDown, ChevronUp, Loader2, RotateCcw, X } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { usePhotoUploadQueue } from "../../../hooks/usePhotoUploadQueue";
import type { PhotoUploadQueue } from "../../../utils/photoUploadQueue";

interface PhotoUploadProgressProps {
  queue: PhotoUploadQueue;
  /** true면 화면 우하단 고정 패널, false면 문서 흐름 안에 인라인 카드 */
  floating?: boolean;
}

const FAILURE_PREVIEW = 20;

/** 업로드 큐 진행 상황 — 완료/실패/전체, 실패분만 다시 시도, 끝나면 닫기 */
export function PhotoUploadProgress({ queue, floating = false }: PhotoUploadProgressProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const snap = usePhotoUploadQueue(queue);
  const [showFailures, setShowFailures] = useState(false);

  if (snap.total === 0) return null;

  const percent =
    snap.bytesTotal > 0 ? Math.min(100, Math.round((snap.bytesDone / snap.bytesTotal) * 100)) : 100;
  const reasonLabel = (reason: string) => {
    switch (reason) {
      case "UNSUPPORTED_TYPE":
      case "FILE_TYPE_NOT_ALLOWED":
      case "INVALID_CONTENT":
        return t("photoGallery.failUnsupported", "Unsupported format");
      case "FILE_TOO_LARGE":
        return t("photoGallery.failTooLarge", "Over 30MB");
      case "NETWORK":
        return t("photoGallery.failNetwork", "Network error");
      default:
        return t("photoGallery.failGeneric", "Upload failed");
    }
  };

  const title = snap.active
    ? t("photoGallery.queueUploading", "Uploading {{done}}/{{total}}", {
        done: snap.confirmed,
        total: snap.total,
      })
    : t("photoGallery.queueDone", "{{count}} photos uploaded", { count: snap.confirmed });

  const panel = (
    <div
      className="bg-bridge-obsidian rounded-2xl border border-foreground/10 shadow-2xl overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
      <div className="px-4 pt-3 pb-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center shrink-0">
            {snap.active ? (
              <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
            ) : snap.failed > 0 ? (
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{title}</p>
            <p className="text-xs text-slate-500">
              {snap.active
                ? t("photoGallery.queueKeepsRunning", "Keeps uploading even if you close this window")
                : snap.failed > 0
                  ? t("photoGallery.queueFailedCount", "{{count}} failed", { count: snap.failed })
                  : t("photoGallery.queueAllDone", "All photos are in the album")}
            </p>
          </div>
          {!snap.active && (
            <IconButton aria-label={t("common.close", "Close")} onClick={() => queue.clearFinished()}>
              <X />
            </IconButton>
          )}
        </div>

        <div className="space-y-1">
          <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-full"
              initial={false}
              animate={{ width: `${percent}%` }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 tabular-nums">
            <span>{percent}%</span>
            {snap.active && snap.failed > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {t("photoGallery.queueFailedCount", "{{count}} failed", { count: snap.failed })}
              </span>
            )}
          </div>
        </div>

        {snap.failed > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {!snap.active && (
                <button
                  type="button"
                  onClick={() => queue.retryFailed()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bridge-accent text-white text-xs font-bold hover:bg-bridge-accent/90 transition-all"
                >
                  <RotateCcw size={12} />
                  {t("photoGallery.retryFailed", "Retry {{count}} failed", { count: snap.failed })}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowFailures((v) => !v)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                {showFailures ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {t("photoGallery.showFailures", "Details")}
              </button>
            </div>
            {showFailures && (
              <ul className="max-h-40 overflow-y-auto custom-scrollbar space-y-1">
                {snap.failures.slice(0, FAILURE_PREVIEW).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-slate-400">{f.name}</span>
                    <span className="shrink-0 text-slate-500">{reasonLabel(f.reason)}</span>
                  </li>
                ))}
                {snap.failures.length > FAILURE_PREVIEW && (
                  <li className="text-xs text-slate-500">
                    {t("photoGallery.moreSelected", "+{{count}} more", {
                      count: snap.failures.length - FAILURE_PREVIEW,
                    })}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!floating) return panel;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed z-40 right-4 left-4 sm:left-auto sm:w-80 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
    >
      {panel}
    </motion.div>
  );
}
