import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { History, RotateCcw, X, Loader2, Eye } from "lucide-react";
import DOMPurify from "dompurify";
import { noteService } from "../../utils/services";
import { formatDateTime } from "../../utils/dateUtils";
import type { NoteVersionInfo, NoteVersionDetail } from "../../utils/api";

interface NoteVersionHistoryProps {
  boardId: string;
  noteId: string;
  versionCount: number;
  canEdit: boolean;
  onRestore: () => void;
}

export function NoteVersionHistory({
  boardId,
  noteId,
  versionCount,
  canEdit,
  onRestore,
}: NoteVersionHistoryProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [versions, setVersions] = useState<NoteVersionInfo[]>([]);
  const [selectedVersion, setSelectedVersion] =
    useState<NoteVersionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await noteService.getVersions(boardId, noteId);
      setVersions(data);
    } catch (err) {
      console.error("Failed to load versions:", err);
    } finally {
      setLoading(false);
    }
  }, [boardId, noteId]);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, loadVersions]);

  const handleViewVersion = useCallback(
    async (versionId: string) => {
      try {
        const detail = await noteService.getVersionDetail(
          boardId,
          noteId,
          versionId,
        );
        setSelectedVersion(detail);
      } catch (err) {
        console.error("Failed to load version detail:", err);
      }
    },
    [boardId, noteId],
  );

  const handleRestore = useCallback(
    async (versionId: string) => {
      if (
        !window.confirm(
          t("notes.restoreConfirm", "이 버전으로 복원하시겠습니까?"),
        )
      )
        return;
      setRestoring(true);
      try {
        await noteService.restoreVersion(boardId, noteId, versionId);
        onRestore();
        setIsOpen(false);
        setSelectedVersion(null);
      } catch (err) {
        console.error("Failed to restore version:", err);
      } finally {
        setRestoring(false);
      }
    },
    [boardId, noteId, onRestore, t],
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded transition-colors"
      >
        <History size={10} />
        <span className="hidden lg:inline">
          {t("notes.versionHistory", "버전")}
        </span>
        {versionCount > 0 && (
          <span className="text-bridge-accent font-medium">
            {versionCount}
          </span>
        )}
      </button>

      {/* Version History Panel (Overlay) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setIsOpen(false);
              setSelectedVersion(null);
            }}
          />

          {/* Panel */}
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-bridge-obsidian border-l border-foreground/10 shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <History size={14} className="text-bridge-accent" />
                {t("notes.versionHistory", "버전 히스토리")}
              </h3>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setSelectedVersion(null);
                }}
                className="p-1 text-slate-400 hover:text-foreground hover:bg-foreground/10 rounded"
              >
                <X size={14} />
              </button>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-bridge-accent" />
              </div>
            ) : selectedVersion ? (
              /* Version Detail View */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-foreground/5 flex items-center justify-between">
                  <div>
                    <button
                      onClick={() => setSelectedVersion(null)}
                      className="text-xs text-bridge-accent hover:underline"
                    >
                      ← {t("notes.backToList", "목록으로")}
                    </button>
                    <p className="text-xs font-medium text-foreground mt-1">
                      v{selectedVersion.version_number} ·{" "}
                      {selectedVersion.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedVersion.created_by?.name} ·{" "}
                      {formatDateTime(selectedVersion.created_at)}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleRestore(selectedVersion.id)}
                      disabled={restoring}
                      className="flex items-center gap-1 px-3 py-1.5 bg-bridge-accent text-white rounded-lg text-xs font-bold hover:bg-bridge-accent/90 disabled:opacity-50"
                    >
                      {restoring ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <RotateCcw size={10} />
                      )}
                      {t("notes.restore", "복원")}
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div
                    className="prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(selectedVersion.content || ""),
                    }}
                  />
                </div>
              </div>
            ) : (
              /* Version List */
              <div className="flex-1 overflow-y-auto">
                {versions.length === 0 ? (
                  <div className="text-center text-slate-500 text-xs py-12">
                    {t("notes.noVersions", "저장된 버전이 없습니다")}
                  </div>
                ) : (
                  <div className="p-2 space-y-0.5">
                    {versions.map((version) => (
                      <button
                        key={version.id}
                        onClick={() => handleViewVersion(version.id)}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-foreground/5 transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">
                            v{version.version_number}
                          </span>
                          <Eye
                            size={12}
                            className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          {version.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {version.created_by?.name} ·{" "}
                          {formatDateTime(version.created_at)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
