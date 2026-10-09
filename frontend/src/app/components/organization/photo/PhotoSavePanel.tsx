import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Download, Loader2, X } from "lucide-react";
import type { PhotoSaveState } from "../../../hooks/usePhotoSaver";

interface PhotoSavePanelProps {
  state: PhotoSaveState;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Floating panel for the iOS two-step save (usePhotoSaver).
 * Sits above the lightbox (z-50) so single-photo saves from the viewer work too.
 */
export function PhotoSavePanel({ state, onSave, onCancel }: PhotoSavePanelProps) {
  const { t } = useTranslation();
  const { phase, chunkIndex, chunkCount, chunkSize, prepared, savedCount, failedCount } = state;
  const multiChunk = chunkCount > 1;
  const percent = chunkSize > 0 ? Math.round((prepared / chunkSize) * 100) : 0;

  return (
    <AnimatePresence>
      {phase !== "idle" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] w-[min(340px,calc(100%-2rem))]"
          role="status"
          aria-live="polite"
        >
          <div className="bg-bridge-obsidian border border-foreground/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {phase === "done" ? (
                    <Check size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : phase === "cancelled" ? (
                    <X size={16} className="text-slate-400 shrink-0" />
                  ) : phase === "preparing" ? (
                    <Loader2 size={16} className="animate-spin text-bridge-accent shrink-0" />
                  ) : (
                    <Download size={16} className="text-bridge-accent shrink-0" />
                  )}
                  <span className="text-xs font-bold text-foreground truncate">
                    {phase === "preparing" &&
                      t("photoSave.preparing", { current: prepared, total: chunkSize })}
                    {(phase === "ready" || phase === "sharing") &&
                      t("photoSave.ready", { count: chunkSize })}
                    {phase === "done" && t("photoSave.done", { count: savedCount })}
                    {phase === "cancelled" && t("photoSave.cancelled")}
                  </span>
                </div>
                {multiChunk && phase !== "done" && phase !== "cancelled" && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent shrink-0">
                    {t("photoSave.chunk", { current: chunkIndex + 1, total: chunkCount })}
                  </span>
                )}
              </div>

              {phase === "preparing" && (
                <div className="h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-bridge-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}

              {(phase === "ready" || phase === "sharing") && (
                <button
                  onClick={onSave}
                  disabled={phase === "sharing"}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl text-sm font-bold hover:bg-bridge-accent/90 disabled:opacity-60 transition-all"
                >
                  <Download size={16} />
                  {t("photoSave.saveButton")}
                </button>
              )}

              {(phase === "ready" || phase === "sharing") && (
                <p className="text-xs text-slate-500">{t("photoSave.hint")}</p>
              )}

              {failedCount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("photoSave.failed", { count: failedCount })}
                </p>
              )}

              {(phase === "preparing" || phase === "ready") && (
                <div className="flex justify-end">
                  <button
                    onClick={onCancel}
                    className="text-xs font-bold text-slate-400 hover:text-foreground transition-colors"
                  >
                    {t("common.cancel", "Cancel")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
