import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { useEscClose } from "../../hooks/useEscClose";
import {
  History,
  RotateCcw,
  X,
  Loader2,
  Eye,
  Trash2,
  GitCompare,
  FileText,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useCreateBlockNote } from "@blocknote/react";
import { noteService, orgNoteService } from "../../utils/services";
import { formatDateTime } from "../../utils/dateUtils";
import { useTheme } from "../../contexts/ThemeContext";
import { NoteVersionDiffView } from "./NoteVersionDiffView";
import { DIFF_COLORS } from "../../utils/excalidrawDiff";
import type { NoteVersionInfo, NoteVersionDetail } from "../../utils/api";
import { contentToHtml } from "../../utils/blocknoteContent";
import { noteSchema } from "./blocks/schema";

const ExcalidrawLazy = lazy(async () => {
  const mod = await import("@excalidraw/excalidraw");
  return { default: mod.Excalidraw };
});

interface NoteVersionHistoryProps {
  boardId?: string;
  orgId?: string;
  noteId: string;
  noteType: string;
  currentTitle: string;
  currentContent: string | null | undefined;
  versionCount: number;
  canEdit: boolean;
  onRestore: () => void;
  onVersionsChanged?: () => void;
}

export function NoteVersionHistory({
  boardId,
  orgId,
  noteId,
  noteType,
  currentTitle,
  currentContent,
  versionCount,
  canEdit,
  onRestore,
  onVersionsChanged,
}: NoteVersionHistoryProps) {
  const svc = orgId ? orgNoteService : noteService;
  const scopeId = boardId || orgId || "";
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  useEscClose(isOpen, () => {
    setIsOpen(false);
    setSelectedVersion(null);
  });
  const [versions, setVersions] = useState<NoteVersionInfo[]>([]);
  const [selectedVersion, setSelectedVersion] =
    useState<NoteVersionDetail | null>(null);
  const [diffMode, setDiffMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await svc.getVersions(scopeId, noteId);
      setVersions(data);
    } catch (err) {
      console.error("Failed to load versions:", err);
    } finally {
      setLoading(false);
    }
  }, [scopeId, noteId, svc]);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, loadVersions]);

  const handleViewVersion = useCallback(
    async (versionId: string) => {
      try {
        const detail = await svc.getVersionDetail(scopeId, noteId, versionId);
        setSelectedVersion(detail);
        setDiffMode(true);
      } catch (err) {
        console.error("Failed to load version detail:", err);
      }
    },
    [scopeId, noteId, svc],
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
        await svc.restoreVersion(scopeId, noteId, versionId);
        onRestore();
        setIsOpen(false);
        setSelectedVersion(null);
      } catch (err) {
        console.error("Failed to restore version:", err);
      } finally {
        setRestoring(false);
      }
    },
    [scopeId, noteId, onRestore, t, svc],
  );

  const handleDeleteVersion = useCallback(
    async (versionId: string) => {
      if (
        !window.confirm(
          t("notes.deleteVersionConfirm", "이 버전을 삭제하시겠습니까?"),
        )
      )
        return;
      setDeletingId(versionId);
      try {
        await svc.deleteVersion(scopeId, noteId, versionId);
        setVersions((prev) => prev.filter((v) => v.id !== versionId));
        if (selectedVersion?.id === versionId) {
          setSelectedVersion(null);
        }
        onVersionsChanged?.();
      } catch (err) {
        console.error("Failed to delete version:", err);
      } finally {
        setDeletingId(null);
      }
    },
    [scopeId, noteId, svc, t, selectedVersion, onVersionsChanged],
  );

  const handleClearAll = useCallback(async () => {
    if (
      !window.confirm(
        t(
          "notes.clearAllVersionsConfirm",
          "모든 버전 히스토리를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
        ),
      )
    )
      return;
    setClearingAll(true);
    try {
      await svc.deleteAllVersions(scopeId, noteId);
      setVersions([]);
      setSelectedVersion(null);
      onVersionsChanged?.();
    } catch (err) {
      console.error("Failed to clear all versions:", err);
    } finally {
      setClearingAll(false);
    }
  }, [scopeId, noteId, svc, t, onVersionsChanged]);

  // Panel width — wider when showing detail (need room for diff)
  const panelWidthClass = selectedVersion
    ? "w-full sm:w-[min(960px,95vw)]"
    : "w-full sm:w-96";

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
          <span className="text-bridge-accent font-medium">{versionCount}</span>
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
          <div
            className={`absolute right-0 top-0 bottom-0 ${panelWidthClass} bg-bridge-obsidian border-l border-foreground/10 shadow-2xl flex flex-col`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <History size={14} className="text-bridge-accent" />
                {selectedVersion
                  ? `v${selectedVersion.version_number} → ${t("notes.diff.current", "현재")}`
                  : t("notes.versionHistory", "버전 히스토리")}
              </h3>
              <div className="flex items-center gap-1">
                {canEdit && versions.length > 0 && !selectedVersion && (
                  <button
                    onClick={handleClearAll}
                    disabled={clearingAll}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded disabled:opacity-50 transition-colors"
                    aria-label={t("notes.clearAllVersions", "비우기")}
                  >
                    {clearingAll ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    <span>{t("notes.clearAllVersions", "비우기")}</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setSelectedVersion(null);
                  }}
                  className="p-1 text-slate-400 hover:text-foreground hover:bg-foreground/10 rounded"
                  aria-label={t("common.close", "닫기")}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-bridge-accent" />
              </div>
            ) : selectedVersion ? (
              /* Version Detail View */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-foreground/5 flex items-center justify-between flex-wrap gap-2">
                  <div className="min-w-0">
                    <button
                      onClick={() => setSelectedVersion(null)}
                      className="text-xs text-bridge-accent hover:underline"
                    >
                      ← {t("notes.backToList", "목록으로")}
                    </button>
                    <p className="text-xs font-medium text-foreground mt-1 truncate">
                      v{selectedVersion.version_number} ·{" "}
                      {selectedVersion.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedVersion.created_by?.name} ·{" "}
                      {formatDateTime(selectedVersion.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Diff / Original toggle */}
                    <div className="flex items-center bg-foreground/5 rounded-lg p-0.5">
                      <button
                        onClick={() => setDiffMode(true)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                          diffMode
                            ? "bg-bridge-accent text-white"
                            : "text-slate-400 hover:text-foreground"
                        }`}
                        title={t("notes.diff.showDiff", "변경 사항 보기")}
                      >
                        <GitCompare size={10} />
                        <span className="hidden md:inline">
                          {t("notes.diff.diffLabel", "변경")}
                        </span>
                      </button>
                      <button
                        onClick={() => setDiffMode(false)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                          !diffMode
                            ? "bg-bridge-accent text-white"
                            : "text-slate-400 hover:text-foreground"
                        }`}
                        title={t("notes.diff.showOriginal", "원본 보기")}
                      >
                        <FileText size={10} />
                        <span className="hidden md:inline">
                          {t("notes.diff.originalLabel", "원본")}
                        </span>
                      </button>
                    </div>
                    {canEdit && (
                      <>
                        <button
                          onClick={() =>
                            handleDeleteVersion(selectedVersion.id)
                          }
                          disabled={deletingId === selectedVersion.id}
                          className="flex items-center gap-1 px-2 py-1.5 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors"
                          aria-label={t("notes.deleteVersion", "버전 삭제")}
                        >
                          {deletingId === selectedVersion.id ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Trash2 size={10} />
                          )}
                        </button>
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
                      </>
                    )}
                  </div>
                </div>

                {/* Legend bar — only in diff mode */}
                {diffMode && noteType !== "BOARD" && (
                  <div className="px-4 py-2 border-b border-foreground/5 flex items-center gap-3 text-xs flex-wrap">
                    <span className="text-slate-500 font-bold">
                      {t("notes.diff.key", "범례")}:
                    </span>
                    <span className="note-diff">
                      <ins>{t("notes.diff.legendAdded", "추가된 내용")}</ins>
                    </span>
                    <span className="note-diff">
                      <del>{t("notes.diff.legendRemoved", "삭제된 내용")}</del>
                    </span>
                  </div>
                )}

                {/* Detail body */}
                {diffMode ? (
                  <NoteVersionDiffView
                    noteType={noteType}
                    previousTitle={selectedVersion.title}
                    currentTitle={currentTitle}
                    previousContent={selectedVersion.content}
                    currentContent={currentContent}
                  />
                ) : noteType === "BOARD" ? (
                  <BoardOriginalView content={selectedVersion.content} />
                ) : (
                  <DocumentVersionPreview content={selectedVersion.content} />
                )}
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
                      <div
                        key={version.id}
                        className="relative rounded-lg hover:bg-foreground/5 transition-colors group"
                      >
                        <button
                          onClick={() => handleViewVersion(version.id)}
                          className="w-full text-left px-3 py-2.5"
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
                          <p className="text-xs text-slate-400 mt-0.5 truncate pr-6">
                            {version.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {version.created_by?.name} ·{" "}
                            {formatDateTime(version.created_at)}
                          </p>
                        </button>
                        {canEdit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVersion(version.id);
                            }}
                            disabled={deletingId === version.id}
                            className="absolute bottom-2 right-2 p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                            aria-label={t("notes.deleteVersion", "버전 삭제")}
                          >
                            {deletingId === version.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                          </button>
                        )}
                      </div>
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

function DocumentVersionPreview({
  content,
}: {
  content: string | null | undefined;
}) {
  // Throwaway BlockNote editor used only to normalize stored content (JSON or
  // legacy HTML) to HTML for the read-only preview. The editor lives for the
  // lifetime of the version drawer, not per-render.
  const converter = useCreateBlockNote({ schema: noteSchema } as any);
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rendered = await contentToHtml(converter as any, content);
      if (!cancelled) setHtml(rendered);
    })();
    return () => {
      cancelled = true;
    };
  }, [content, converter]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div
        className="prose prose-invert prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
      />
    </div>
  );
}

function BoardOriginalView({
  content,
}: {
  content: string | null | undefined;
}) {
  const { isDark } = useTheme();
  const bgColor = isDark ? "#1e1e1e" : "#ffffff";

  let parsed: any = null;
  try {
    parsed = content ? JSON.parse(content) : null;
  } catch {
    /* ignore */
  }

  const initialData = parsed
    ? {
        elements: Array.isArray(parsed.elements) ? parsed.elements : [],
        appState: {
          ...(parsed.appState || {}),
          viewBackgroundColor: bgColor,
        },
        files: parsed.files || {},
      }
    : { elements: [], appState: { viewBackgroundColor: bgColor }, files: {} };

  return (
    <div className="flex-1 relative">
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        }
      >
        <ExcalidrawLazy
          initialData={initialData}
          viewModeEnabled
          theme={isDark ? "dark" : "light"}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
              saveAsImage: false,
            },
          }}
        />
      </Suspense>
    </div>
  );
}

// Keep import to avoid tree-shaking warning when not used inline
export { DIFF_COLORS };
