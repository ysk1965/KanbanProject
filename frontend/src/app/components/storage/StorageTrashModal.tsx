import { useEffect, useState, useCallback } from "react";
import { RotateCcw, Trash2, X, Loader2, Folder, FileText } from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import { myStorageService } from "../../utils/services";
import type { StorageTrashItem } from "../../utils/api";
import { formatRelativeTime } from "../../utils/dateUtils";

interface StorageTrashModalProps {
  open: boolean;
  onClose: () => void;
  /** 복원/삭제 후 상위 뷰 새로고침 */
  onChanged: () => void;
}

export function StorageTrashModal({
  open,
  onClose,
  onChanged,
}: StorageTrashModalProps) {
  const [items, setItems] = useState<StorageTrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await myStorageService.getTrash());
    } catch (e) {
      console.error("Failed to load trash:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const restore = async (item: StorageTrashItem) => {
    setBusy(item.id);
    try {
      if (item.type === "FOLDER") await myStorageService.restoreFolder(item.id);
      else await myStorageService.restoreFile(item.id);
      await load();
      onChanged();
    } catch (e) {
      console.error("Restore failed:", e);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (item: StorageTrashItem) => {
    setBusy(item.id);
    try {
      if (item.type === "FOLDER")
        await myStorageService.permanentDeleteFolder(item.id);
      else await myStorageService.permanentDeleteFile(item.id);
      await load();
      onChanged();
    } catch (e) {
      console.error("Permanent delete failed:", e);
    } finally {
      setBusy(null);
    }
  };

  const emptyAll = async () => {
    setBusy("__all__");
    try {
      await myStorageService.emptyTrash();
      await load();
      onChanged();
    } catch (e) {
      console.error("Empty trash failed:", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label="스토리지 휴지통"
      className="w-full sm:max-w-lg bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-bold text-foreground">휴지통</span>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={emptyAll}
              disabled={busy === "__all__"}
              className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
            >
              비우기
            </button>
          )}
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-xs text-slate-500 py-12">
            휴지통이 비어 있습니다
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li
                key={`${item.type}-${item.id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02]"
              >
                {item.type === "FOLDER" ? (
                  <Folder className="w-4 h-4 text-slate-400 flex-none" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 flex-none" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {item.name}
                  </p>
                  {item.deleted_at && (
                    <p className="text-xs text-slate-500">
                      {formatRelativeTime(item.deleted_at)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="복원"
                  onClick={() => restore(item)}
                  disabled={busy === item.id}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-bridge-accent hover:bg-foreground/5 flex items-center justify-center disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="영구 삭제"
                  onClick={() => remove(item)}
                  disabled={busy === item.id}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-foreground/5 flex items-center justify-center disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MotionModal>
  );
}
