import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Folder,
  Image as ImageIcon,
  Loader2,
  PenTool,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import {
  myNoteService,
  noteService,
  orgNoteService,
} from "../../utils/services";
import type {
  NoteTrashItem,
  StorageApi,
  StorageTrashItem,
} from "../../utils/api";
import { formatRelativeTime } from "../../utils/dateUtils";
import { MotionModal } from "../ui/MotionModal";

interface LibraryTrashModalProps {
  open: boolean;
  onClose: () => void;
  scopeType: "board" | "org" | "personal";
  scopeId: string;
  storageApi: StorageApi;
  canPermanentDelete: boolean;
  onChanged: () => void;
}

type Row =
  | {
      kind: "note";
      id: string;
      title: string;
      when: string | null;
      type: string;
    }
  | {
      kind: "file";
      id: string;
      title: string;
      when: string | null;
      type: string;
    };

/**
 * 자료실 휴지통 — 지운 노트와 파일을 한 목록에서 되돌린다.
 * 노트 휴지통(note API)과 스토리지 휴지통(storage API)을 함께 읽어 하나로 보여준다.
 */
export function LibraryTrashModal({
  open,
  onClose,
  scopeType,
  scopeId,
  storageApi,
  canPermanentDelete,
  onChanged,
}: LibraryTrashModalProps) {
  const svc =
    scopeType === "personal"
      ? myNoteService
      : scopeType === "org"
        ? orgNoteService
        : noteService;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [notes, files] = await Promise.all([
        svc.getTrash(scopeId).catch(() => [] as NoteTrashItem[]),
        storageApi.getTrash().catch(() => [] as StorageTrashItem[]),
      ]);
      setRows([
        ...notes.map((n: NoteTrashItem): Row => ({
          kind: "note",
          id: n.id,
          title: n.title,
          when: n.deleted_at,
          type: n.type,
        })),
        ...files.map((f: StorageTrashItem): Row => ({
          kind: "file",
          id: f.id,
          title: f.name,
          when: f.deleted_at,
          type: f.type,
        })),
      ]);
    } finally {
      setLoading(false);
    }
  }, [scopeId, svc, storageApi]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const restore = async (row: Row) => {
    setBusyId(row.id);
    try {
      if (row.kind === "note") {
        await svc.restoreFromTrash(scopeId, row.id);
      } else if (row.type === "FOLDER") {
        await storageApi.restoreFolder(row.id);
      } else {
        await storageApi.restoreFile(row.id);
      }
      await load();
      onChanged();
    } catch (err) {
      console.error("Failed to restore from library trash:", err);
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (row: Row) => {
    if (!window.confirm(`"${row.title}"을(를) 영구 삭제할까요?`)) return;
    setBusyId(row.id);
    try {
      if (row.kind === "note") {
        await svc.permanentDelete(scopeId, row.id);
      } else if (row.type === "FOLDER") {
        await storageApi.permanentDeleteFolder(row.id);
      } else {
        await storageApi.permanentDeleteFile(row.id);
      }
      await load();
      onChanged();
    } catch (err) {
      console.error("Failed to permanently delete:", err);
    } finally {
      setBusyId(null);
    }
  };

  const iconOf = (row: Row) => {
    if (row.kind === "file") {
      return row.type === "FOLDER" ? (
        <Folder className="w-4 h-4 text-bridge-secondary" />
      ) : (
        <ImageIcon className="w-4 h-4 text-bridge-secondary" />
      );
    }
    if (row.type === "FOLDER")
      return <Folder className="w-4 h-4 text-bridge-accent" />;
    if (row.type === "BOARD")
      return <PenTool className="w-4 h-4 text-bridge-accent" />;
    return <FileText className="w-4 h-4 text-slate-400" />;
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label="자료실 휴지통"
      className="w-full sm:max-w-lg bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl"
    >
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Trash2 className="w-4 h-4 text-bridge-accent" />
        <span className="text-sm font-bold text-foreground flex-1">
          휴지통 — 노트와 파일
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 pb-5 pt-4 max-h-[60vh] overflow-y-auto custom-scrollbar flex flex-col gap-2">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-10">
            휴지통이 비어 있습니다
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={`${row.kind}-${row.id}`}
              className="flex items-center gap-2.5 rounded-xl border border-foreground/[0.08] px-3 py-2.5"
            >
              {iconOf(row)}
              <span
                className="flex-1 min-w-0 truncate text-xs text-foreground"
                title={row.title}
              >
                {row.title}
              </span>
              <span
                className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  row.kind === "note"
                    ? "bg-bridge-accent/15 text-bridge-accent"
                    : "bg-bridge-secondary/15 text-bridge-secondary"
                }`}
              >
                {row.kind === "note" ? "노트" : "파일"}
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {row.when ? formatRelativeTime(row.when) : "—"}
              </span>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => restore(row)}
                className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg px-2 py-1 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                복구
              </button>
              {canPermanentDelete && (
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => purge(row)}
                  aria-label="영구 삭제"
                  className="text-slate-500 hover:text-rose-500 hover:bg-foreground/5 rounded-lg p-1 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">Esc 닫기</span>
        <span className="text-xs text-slate-500">30일 후 자동 삭제</span>
      </div>
    </MotionModal>
  );
}
