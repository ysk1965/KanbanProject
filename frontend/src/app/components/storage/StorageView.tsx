import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Upload,
  FolderPlus,
  Trash2,
  Loader2,
  ChevronRight,
  Pencil,
  FolderX,
  FolderOpen,
  FileText,
  HardDrive,
  UploadCloud,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  myStorageAPI,
  makeBoardStorageAPI,
  makeOrgStorageAPI,
  type StorageApi,
} from "../../utils/api";
import type {
  StorageFolderTree as FolderNode,
  StorageFileItem,
  StorageUsage,
} from "../../utils/api";
import { StorageFolderTree } from "./StorageFolderTree";
import { StorageFileCard } from "./StorageFileCard";
import { StoragePreviewModal } from "./StoragePreviewModal";
import { StorageTrashModal } from "./StorageTrashModal";
import { StorageUsageDetailModal } from "./StorageUsageDetailModal";
import { BoardReportSpace } from "./BoardReportSpace";
import { formatBytes, folderPath } from "./storageUtils";

interface StorageViewProps {
  /** 개인 스코프 (마이스페이스) */
  personal?: boolean;
  /** 보드 스코프 */
  boardId?: string;
  /** 조직 스코프 */
  orgId?: string;
  /** 보드 스코프에서 보고서 설정을 바꿀 수 있는 권한(관리자/소유자) */
  canManage?: boolean;
  /** 보드 이름 — 보고서 헤더에 표시 */
  boardName?: string;
}

const API_ORIGIN = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1"
).replace(/\/$/, "");

function publicFileLink(shareCode: string): string {
  return `${API_ORIGIN}/public/storage/files/${shareCode}/download`;
}

export function StorageView({
  boardId,
  orgId,
  canManage,
  boardName,
}: StorageViewProps) {
  const api: StorageApi = useMemo(() => {
    if (boardId) return makeBoardStorageAPI(boardId);
    if (orgId) return makeOrgStorageAPI(orgId);
    return myStorageAPI;
  }, [boardId, orgId]);

  // 보드 스코프에서만 '파일 / 보고서' 섹션을 전환한다.
  const [section, setSection] = useState<"files" | "reports">("files");

  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [files, setFiles] = useState<StorageFileItem[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<StorageFileItem | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [usageDetailOpen, setUsageDetailOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragOverMain, setDragOverMain] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2600);
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const [f, u] = await Promise.all([api.getFolders(), api.getUsage()]);
      setFolders(f);
      setUsage(u);
    } catch (e) {
      console.error("Failed to load storage folders:", e);
    }
  }, []);

  const loadFiles = useCallback(async (folderId: string | null) => {
    setFilesLoading(true);
    try {
      setFiles(await api.getFiles(folderId));
    } catch (e) {
      console.error("Failed to load files:", e);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadFolders();
      await loadFiles(null);
      setLoading(false);
    })();
  }, [loadFolders, loadFiles]);

  useEffect(() => {
    if (!loading) loadFiles(currentFolderId);
  }, [currentFolderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const breadcrumb = useMemo(
    () => folderPath(folders, currentFolderId),
    [folders, currentFolderId],
  );

  // ===== Upload =====

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const arr = Array.from(fileList);
      for (const file of arr) {
        const key = `${file.name}-${file.size}-${Date.now()}`;
        setUploads((prev) => ({ ...prev, [key]: 0 }));
        try {
          await api.uploadFile(file, currentFolderId, (p) =>
            setUploads((prev) => ({ ...prev, [key]: p })),
          );
        } catch (e: unknown) {
          const msg =
            (e as { message?: string })?.message || "업로드에 실패했습니다";
          const code = (e as { code?: string })?.code;
          showFlash(code === "ST003" ? "스토리지 용량이 부족합니다" : msg);
        } finally {
          setUploads((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
      await Promise.all([loadFiles(currentFolderId), loadFolders()]);
    },
    [currentFolderId, loadFiles, loadFolders, showFlash],
  );

  const onDropMain = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverMain(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  // ===== Folder ops =====

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      return;
    }
    try {
      await api.createFolder(name, currentFolderId);
      setNewFolderName("");
      setCreatingFolder(false);
      await loadFolders();
    } catch (e) {
      console.error("Create folder failed:", e);
      showFlash("폴더 생성에 실패했습니다");
    }
  };

  const renameCurrentFolder = async () => {
    if (!currentFolderId) return;
    const current = breadcrumb[breadcrumb.length - 1];
    const name = window.prompt("폴더 이름", current?.name ?? "");
    if (!name || name.trim() === current?.name) return;
    try {
      await api.renameFolder(currentFolderId, name.trim());
      await loadFolders();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  };

  const deleteCurrentFolder = async () => {
    if (!currentFolderId) return;
    if (!window.confirm("이 폴더와 안의 파일을 휴지통으로 이동할까요?")) return;
    try {
      await api.deleteFolder(currentFolderId);
      setCurrentFolderId(
        breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2].id : null,
      );
      await Promise.all([loadFolders(), loadFiles(null)]);
    } catch (e) {
      console.error("Delete folder failed:", e);
    }
  };

  // ===== File ops =====

  const handleDropFileToFolder = async (
    fileId: string,
    targetFolderId: string | null,
  ) => {
    try {
      await api.moveFile(fileId, targetFolderId);
      await loadFiles(currentFolderId);
      showFlash("이동되었습니다");
    } catch (e) {
      console.error("Move file failed:", e);
    }
  };

  const handleDownload = async (file: StorageFileItem) => {
    try {
      await api.downloadAndSave(file.id, file.original_filename);
    } catch (e) {
      console.error("Download failed:", e);
      showFlash("다운로드에 실패했습니다");
    }
  };

  const handleToggleShare = async (file: StorageFileItem) => {
    try {
      if (file.is_shared) {
        await api.disableFileShare(file.id);
        showFlash("공유가 해제되었습니다");
      } else {
        const updated = await api.enableFileShare(file.id);
        if (updated.share_code) {
          await navigator.clipboard
            ?.writeText(publicFileLink(updated.share_code))
            .catch(() => {});
          showFlash("공유 링크가 복사되었습니다");
        }
      }
      await loadFiles(currentFolderId);
      setPreview((p) =>
        p && p.id === file.id ? { ...p, is_shared: !file.is_shared } : p,
      );
    } catch (e) {
      console.error("Toggle share failed:", e);
    }
  };

  const handleDeleteFile = async (file: StorageFileItem) => {
    try {
      await api.deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      loadFolders();
    } catch (e) {
      console.error("Delete file failed:", e);
    }
  };

  const activeUploads = Object.entries(uploads);
  const usagePercent =
    usage && usage.quota > 0
      ? Math.min(100, (usage.used / usage.quota) * 100)
      : 0;
  const nearFull = usagePercent >= 90;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 md:p-5">
      {/* 보드 스코프: 파일 / 보고서 섹션 스위처 */}
      {boardId && (
        <div className="inline-flex gap-0.5 p-0.5 rounded-xl bg-bridge-obsidian border border-foreground/[0.08] self-start">
          <button
            type="button"
            onClick={() => setSection("files")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              section === "files"
                ? "bg-foreground/[0.08] text-foreground"
                : "text-slate-400 hover:text-foreground"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            파일
          </button>
          <button
            type="button"
            onClick={() => setSection("reports")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              section === "reports"
                ? "bg-foreground/[0.08] text-foreground"
                : "text-slate-400 hover:text-foreground"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            보고서
          </button>
        </div>
      )}

      {boardId && section === "reports" ? (
        <BoardReportSpace
          boardId={boardId}
          canManage={!!canManage}
          boardName={boardName}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4">
          {/* Sidebar */}
          <aside className="w-full md:w-56 flex-none flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCreatingFolder(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors"
              >
                <FolderPlus className="w-4 h-4" />새 폴더
              </button>
              <button
                type="button"
                aria-label="휴지통"
                onClick={() => setTrashOpen(true)}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-foreground hover:bg-foreground/5 flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {creatingFolder && (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitNewFolder();
                    if (e.key === "Escape") {
                      setCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  placeholder="폴더 이름"
                  className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 px-2.5 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                />
                <button
                  type="button"
                  aria-label="생성"
                  onClick={submitNewFolder}
                  className="w-8 h-8 rounded-lg bg-bridge-accent text-white flex items-center justify-center"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian p-2 overflow-y-auto custom-scrollbar max-h-[40vh] md:max-h-none md:flex-1">
              <StorageFolderTree
                folders={folders}
                currentFolderId={currentFolderId}
                onSelect={setCurrentFolderId}
                onDropFile={handleDropFileToFolder}
              />
            </div>

            {/* Usage (클릭 → 상세 보기) */}
            {usage && (
              <button
                type="button"
                onClick={() => setUsageDetailOpen(true)}
                className="w-full text-left rounded-2xl border border-foreground/[0.08] hover:border-foreground/[0.12] bg-bridge-obsidian p-3 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                    {formatBytes(usage.used)}
                    <span className="text-slate-500 font-normal">
                      / {formatBytes(usage.quota)}
                    </span>
                  </span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                    {usage.tier}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      nearFull
                        ? "bg-amber-500"
                        : "bg-gradient-to-r from-bridge-secondary to-bridge-accent"
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span
                    className={`text-xs ${nearFull ? "text-amber-500" : "text-slate-500"}`}
                  >
                    <b
                      className={
                        nearFull ? "text-amber-500" : "text-emerald-500"
                      }
                    >
                      {formatBytes(Math.max(0, usage.quota - usage.used))}
                    </b>{" "}
                    남음
                  </span>
                  <span className="text-xs text-slate-500">자세히 ›</span>
                </div>
              </button>
            )}
          </aside>

          {/* Main */}
          <section className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 text-sm min-w-0">
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(null)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    currentFolderId === null
                      ? "text-foreground font-bold"
                      : "text-slate-400 hover:text-foreground"
                  }`}
                >
                  전체 파일
                </button>
                {breadcrumb.map((node, i) => (
                  <span
                    key={node.id}
                    className="flex items-center gap-1 min-w-0"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-none" />
                    <button
                      type="button"
                      onClick={() => setCurrentFolderId(node.id)}
                      className={`px-1.5 py-0.5 rounded truncate transition-colors ${
                        i === breadcrumb.length - 1
                          ? "text-foreground font-bold"
                          : "text-slate-400 hover:text-foreground"
                      }`}
                    >
                      {node.name}
                    </button>
                  </span>
                ))}
                {currentFolderId && (
                  <span className="flex items-center gap-0.5 ml-1">
                    <button
                      type="button"
                      aria-label="폴더 이름 변경"
                      onClick={renameCurrentFolder}
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 flex items-center justify-center"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="폴더 삭제"
                      onClick={deleteCurrentFolder}
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-foreground/5 flex items-center justify-center"
                    >
                      <FolderX className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
              >
                <Upload className="w-4 h-4" />
                업로드
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Active uploads */}
            {activeUploads.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {activeUploads.map(([key, percent]) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-foreground/[0.08] bg-bridge-obsidian"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-bridge-accent flex-none" />
                    <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className="h-full bg-bridge-accent rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums w-9 text-right">
                      {percent}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Drop zone / grid */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverMain(true);
              }}
              onDragLeave={() => setDragOverMain(false)}
              onDrop={onDropMain}
              className={`flex-1 min-h-[240px] rounded-2xl border transition-colors ${
                dragOverMain
                  ? "border-bridge-accent border-dashed bg-bridge-accent/5"
                  : "border-foreground/[0.08]"
              } p-3 overflow-y-auto custom-scrollbar`}
            >
              {filesLoading ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
                </div>
              ) : files.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center h-full min-h-[200px] text-center gap-3"
                >
                  <UploadCloud className="w-12 h-12 text-slate-600" />
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      파일을 여기에 끌어다 놓으세요
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      이미지 · 영상 · 문서 · 압축파일 등 모든 형식을 올릴 수
                      있어요
                    </p>
                  </div>
                </motion.div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {files.map((file, index) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.04, 0.4) }}
                    >
                      <StorageFileCard
                        file={file}
                        onPreview={setPreview}
                        onDownload={handleDownload}
                        onToggleShare={handleToggleShare}
                        onDelete={handleDeleteFile}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Flash toast */}
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-bridge-obsidian border border-foreground/10 shadow-2xl text-xs font-medium text-foreground"
          >
            {flash}
          </motion.div>
        )}
      </AnimatePresence>

      <StoragePreviewModal
        file={preview}
        onClose={() => setPreview(null)}
        onDownload={handleDownload}
        onToggleShare={handleToggleShare}
      />
      <StorageUsageDetailModal
        api={api}
        open={usageDetailOpen}
        onClose={() => setUsageDetailOpen(false)}
      />
      <StorageTrashModal
        api={api}
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onChanged={() => {
          loadFolders();
          loadFiles(currentFolderId);
        }}
      />
    </div>
  );
}
