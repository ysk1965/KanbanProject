import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  FileText,
  FolderPlus,
  FilePlus,
  PenTool,
  Search,
  List,
  FolderTree,
  Loader2,
  Menu,
  Trash2,
  Upload,
  HardDrive,
} from "lucide-react";
import { NoteTreeSidebar } from "./NoteTreeSidebar";
import { NoteEditor } from "./NoteEditor";
import { NoteListView } from "./NoteListView";
import { NoteTrashModal } from "./NoteTrashModal";
import { LibraryFilePane } from "../library/LibraryFilePane";
import { LibraryTrashModal } from "../library/LibraryTrashModal";
import {
  buildLibraryTree,
  fileIdFromNodeId,
  findStorageChild,
  folderNodeOf,
  folderTitlePath,
  isFileNodeId,
  isStorageFolderNodeId,
  storageFolderIdFromNodeId,
} from "../library/libraryTree";
import { StorageUsageDetailModal } from "../storage/StorageUsageDetailModal";
import { formatBytes, publicFileLink } from "../storage/storageUtils";
import {
  noteService,
  orgNoteService,
  myNoteService,
} from "../../utils/services";
import {
  makeBoardStorageAPI,
  makeOrgStorageAPI,
  myStorageAPI,
  type StorageApi,
} from "../../utils/api";
import { useAuth } from "../../contexts/AuthContext";
import { useCollaboration } from "../../hooks/useCollaboration";
import { getAssigneeHex } from "../../utils/assigneeColor";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { IconButton } from "../ui/IconButton";
import type {
  NoteTreeItem,
  NoteDetail,
  NoteListItem,
  NoteTagInfo,
  BoardNoteSection,
  StorageFileItem,
  StorageFolderTree,
  StorageUsage,
} from "../../utils/api";
import type { BreadcrumbItem } from "./NoteEditor";

interface NotesViewProps {
  boardId?: string;
  orgId?: string;
  /** 마이 스페이스 개인 노트 스코프. board/org 대신 현재 사용자 소유 노트를 사용. */
  personal?: boolean;
  currentUserRole: string;
  /**
   * 자료실 모드. 스토리지 파일을 같은 트리에 얹고 업로드·용량·통합 휴지통을 켠다.
   * 끄면 기존 노트 탭과 동일하게 동작한다.
   * @see components/library/LibraryView.tsx
   */
  withFiles?: boolean;
}

/**
 * 드롭 직후 서버 응답을 기다리지 않고 트리를 즉시 갱신하기 위한 로컬 이동.
 * position은 이동 항목을 제외한 형제 목록 내 삽입 인덱스 (백엔드 의미론과 동일).
 */
function applyLocalMove(
  tree: NoteTreeItem[],
  noteId: string,
  parentId: string | null,
  position: number,
): NoteTreeItem[] {
  let moved: NoteTreeItem | null = null;

  const remove = (items: NoteTreeItem[]): NoteTreeItem[] =>
    items
      .filter((item) => {
        if (item.id === noteId) {
          moved = item;
          return false;
        }
        return true;
      })
      .map((item) =>
        item.children && item.children.length > 0
          ? { ...item, children: remove(item.children) }
          : item,
      );

  const without = remove(tree);
  if (!moved) return tree;

  const withDepth = (item: NoteTreeItem, depth: number): NoteTreeItem => ({
    ...item,
    depth,
    children: (item.children || []).map((c) => withDepth(c, depth + 1)),
  });

  if (parentId === null) {
    const next = [...without];
    const index = Math.max(0, Math.min(position, next.length));
    next.splice(index, 0, { ...withDepth(moved, 0), parent_id: null });
    return next;
  }

  const insert = (items: NoteTreeItem[]): NoteTreeItem[] =>
    items.map((item) => {
      if (item.id === parentId) {
        const children = [...(item.children || [])];
        const index = Math.max(0, Math.min(position, children.length));
        children.splice(index, 0, {
          ...withDepth(moved!, item.depth + 1),
          parent_id: parentId,
        });
        return { ...item, children };
      }
      return item.children && item.children.length > 0
        ? { ...item, children: insert(item.children) }
        : item;
    });

  return insert(without);
}

export function NotesView({
  boardId,
  orgId,
  personal,
  currentUserRole,
  withFiles = false,
}: NotesViewProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlNoteId = searchParams.get("note");
  const urlNoteBoard = searchParams.get("noteBoard");
  const [tree, setTree] = useState<NoteTreeItem[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    urlNoteId,
  );
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);
  const [tags, setTags] = useState<NoteTagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteLoading, setNoteLoading] = useState(false);
  const [viewType, setViewType] = useState<"tree" | "list">("tree");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [boardNoteSections, setBoardNoteSections] = useState<
    BoardNoteSection[]
  >([]);
  // Track which scope the selected note belongs to (org notes vs board notes vs personal)
  const [selectedNoteScope, setSelectedNoteScope] = useState<{
    type: "org" | "board" | "personal";
    id: string;
  } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  // Determine scope
  const scopeId = personal ? "me" : boardId || orgId || "";
  const scopeType = personal ? "personal" : orgId ? "org" : "board";
  const svc = personal
    ? myNoteService
    : scopeType === "org"
      ? orgNoteService
      : noteService;

  const isViewer = currentUserRole === "viewer";
  const canEdit = !isViewer;
  const normalizedRole = currentUserRole?.toLowerCase();
  const canManageTrash =
    normalizedRole === "admin" || normalizedRole === "owner";

  const userName = currentUser?.name || "Anonymous";
  const userColor = useMemo(() => getAssigneeHex(userName), [userName]);

  // Bumped after draft discard to force a fresh Y.Doc/provider/editor so the
  // initial-content useEffect in NoteEditor cleanly re-hydrates from the
  // published snapshot. See NoteEditor.handleDiscardDraft.
  const [collabResetCounter, setCollabResetCounter] = useState(0);
  const handleCollabReset = useCallback(() => {
    setCollabResetCounter((v) => v + 1);
  }, []);

  // Real-time collaboration for the selected note
  const collaboration = useCollaboration({
    noteId: selectedNoteId || "",
    userName,
    userColor,
    enabled:
      !!selectedNoteId &&
      (selectedNote?.type === "DOCUMENT" || selectedNote?.type === "BOARD"),
    resetCounter: collabResetCounter,
  });

  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    if (!selectedNoteId || tree.length === 0) return [];
    const flatMap = new Map<string, NoteTreeItem>();
    function walk(items: NoteTreeItem[]) {
      for (const item of items) {
        flatMap.set(item.id, item);
        if (item.children) walk(item.children);
      }
    }
    walk(tree);
    const chain: BreadcrumbItem[] = [];
    let current = flatMap.get(selectedNoteId);
    while (current?.parent_id) {
      const parent = flatMap.get(current.parent_id);
      if (!parent) break;
      // FILE은 자료실 합성 노드라 노트 경로에 등장하지 않는다.
      if (parent.type !== "FILE") {
        chain.unshift({
          id: parent.id,
          title: parent.title,
          type: parent.type,
        });
      }
      current = parent;
    }
    return chain;
  }, [selectedNoteId, tree]);

  const loadTree = useCallback(async () => {
    try {
      const data = await svc.getTree(scopeId);
      setTree(data);
    } catch (err) {
      console.error("Failed to load note tree:", err);
    } finally {
      setLoading(false);
    }
  }, [scopeId, svc]);

  const loadTags = useCallback(async () => {
    try {
      const data = await svc.getTags(scopeId);
      setTags(data);
    } catch (err) {
      console.error("Failed to load note tags:", err);
    }
  }, [scopeId, svc]);

  // Load board note sections for org mode
  const loadBoardNotes = useCallback(async () => {
    if (!orgId) return;
    try {
      const data = await orgNoteService.getBoardNotes(orgId);
      setBoardNoteSections(data);
    } catch (err) {
      console.error("Failed to load board notes:", err);
    }
  }, [orgId]);

  useEffect(() => {
    loadTree();
    loadTags();
    loadBoardNotes();
  }, [loadTree, loadTags, loadBoardNotes]);

  // 새로고침 시 URL의 note ID로 노트 디테일 복원
  useEffect(() => {
    if (loading) return;
    if (!urlNoteId) return;
    if (selectedNote?.id === urlNoteId) return;

    const targetBoard =
      urlNoteBoard && urlNoteBoard !== scopeId ? urlNoteBoard : null;
    let cancelled = false;

    (async () => {
      setNoteLoading(true);
      try {
        if (targetBoard) {
          const detail = await noteService.getDetail(targetBoard, urlNoteId);
          if (cancelled) return;
          setSelectedNoteId(urlNoteId);
          setSelectedNoteScope({ type: "board", id: targetBoard });
          setSelectedNote(detail);
        } else {
          const detail = await svc.getDetail(scopeId, urlNoteId);
          if (cancelled) return;
          setSelectedNoteId(urlNoteId);
          setSelectedNoteScope(
            personal
              ? { type: "personal", id: "me" }
              : orgId
                ? { type: "org", id: orgId }
                : { type: "board", id: boardId || "" },
          );
          setSelectedNote(detail);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to restore note from URL:", err);
        const next = new URLSearchParams(searchParams);
        next.delete("note");
        next.delete("noteBoard");
        setSearchParams(next, { replace: true });
        setSelectedNoteId(null);
        setSelectedNote(null);
      } finally {
        if (!cancelled) setNoteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, urlNoteId, urlNoteBoard]);

  const handleSelectNote = useCallback(
    async (noteId: string) => {
      if (noteId === selectedNoteId) return;

      setSelectedNoteId(noteId);
      setSelectedNoteScope(
        orgId
          ? { type: "org", id: orgId }
          : { type: "board", id: boardId || "" },
      );
      setNoteLoading(true);
      setMobileSidebarOpen(false);
      const next = new URLSearchParams(searchParams);
      next.set("note", noteId);
      next.delete("noteBoard");
      setSearchParams(next, { replace: true });
      try {
        const detail = await svc.getDetail(scopeId, noteId);
        setSelectedNote(detail);
      } catch (err) {
        console.error("Failed to load note detail:", err);
      } finally {
        setNoteLoading(false);
      }
    },
    [
      scopeId,
      svc,
      selectedNoteId,
      orgId,
      boardId,
      searchParams,
      setSearchParams,
    ],
  );

  // Handle selecting a board note from within org view
  const handleSelectBoardNote = useCallback(
    async (noteId: string, noteBoardId: string) => {
      if (noteId === selectedNoteId) return;

      setSelectedNoteId(noteId);
      setSelectedNoteScope({ type: "board", id: noteBoardId });
      setNoteLoading(true);
      setMobileSidebarOpen(false);
      const next = new URLSearchParams(searchParams);
      next.set("note", noteId);
      next.set("noteBoard", noteBoardId);
      setSearchParams(next, { replace: true });
      try {
        const detail = await noteService.getDetail(noteBoardId, noteId);
        setSelectedNote(detail);
      } catch (err) {
        console.error("Failed to load board note detail:", err);
      } finally {
        setNoteLoading(false);
      }
    },
    [selectedNoteId, searchParams, setSearchParams],
  );

  const handleCreateFolder = useCallback(
    async (parentId?: string | null) => {
      if (!canEdit) return;
      try {
        const title = t("notes.newFolder", "새 폴더");
        await svc.create(scopeId, {
          title,
          type: "FOLDER",
          parentId: parentId || null,
        });
        await loadTree();
      } catch (err) {
        console.error("Failed to create folder:", err);
      }
    },
    [scopeId, svc, canEdit, loadTree, t],
  );

  const handleCreateDocument = useCallback(
    async (parentId?: string | null) => {
      if (!canEdit) return;
      try {
        const title = t("notes.newDocument", "새 문서");
        const created = await svc.create(scopeId, {
          title,
          type: "DOCUMENT",
          parentId: parentId || null,
        });
        await loadTree();

        handleSelectNote(created.id);
      } catch (err) {
        console.error("Failed to create document:", err);
      }
    },
    [scopeId, svc, canEdit, loadTree, handleSelectNote, t],
  );

  const handleCreateBoard = useCallback(
    async (parentId?: string | null) => {
      if (!canEdit) return;
      try {
        const title = t("notes.newBoard", "새 보드");
        const created = await svc.create(scopeId, {
          title,
          type: "BOARD",
          parentId: parentId || null,
        });
        await loadTree();

        handleSelectNote(created.id);
      } catch (err) {
        console.error("Failed to create board:", err);
      }
    },
    [scopeId, svc, canEdit, loadTree, handleSelectNote, t],
  );

  const handleDuplicateNote = useCallback(
    async (noteId: string) => {
      if (!canEdit) return;
      try {
        const detail = await svc.getDetail(scopeId, noteId);
        const created = await svc.create(scopeId, {
          title: `${detail.title} (${t("notes.copy", "사본")})`,
          type: detail.type as "FOLDER" | "DOCUMENT" | "BOARD",
          parentId: detail.parent_id || null,
          content: detail.content || undefined,
          tagIds: detail.tags?.map((tag: NoteTagInfo) => tag.id),
        });
        await loadTree();
        if (created.type !== "FOLDER") {
          handleSelectNote(created.id);
        }
      } catch (err) {
        console.error("Failed to duplicate note:", err);
      }
    },
    [scopeId, svc, canEdit, loadTree, handleSelectNote, t],
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      try {
        await svc.delete(scopeId, noteId);
        if (selectedNoteId === noteId) {
          setSelectedNoteId(null);
          setSelectedNote(null);
          const next = new URLSearchParams(searchParams);
          next.delete("note");
          next.delete("noteBoard");
          setSearchParams(next, { replace: true });
        }
        await loadTree();
      } catch (err) {
        console.error("Failed to delete note:", err);
      }
    },
    [scopeId, svc, selectedNoteId, loadTree, searchParams, setSearchParams],
  );

  const handleRenameNote = useCallback(
    async (noteId: string, newTitle: string) => {
      try {
        await svc.update(scopeId, noteId, { title: newTitle }, false);
        await loadTree();
        if (selectedNoteId === noteId && selectedNote) {
          setSelectedNote({ ...selectedNote, title: newTitle });
        }
      } catch (err) {
        console.error("Failed to rename note:", err);
      }
    },
    [scopeId, svc, selectedNoteId, selectedNote, loadTree],
  );

  const handleSaveNote = useCallback(
    async (
      noteId: string,
      data: { title?: string; content?: string; tagIds?: string[] },
      createVersion = true,
      discardDraft = true,
    ) => {
      try {
        // Use the correct service based on which scope the note belongs to
        const saveSvc =
          selectedNoteScope?.type === "board" && selectedNoteScope.id !== orgId
            ? noteService
            : svc;
        const saveId =
          selectedNoteScope?.type === "board" && selectedNoteScope.id !== orgId
            ? selectedNoteScope.id
            : scopeId;
        const updated = await saveSvc.update(
          saveId,
          noteId,
          data,
          createVersion,
          discardDraft,
        );
        setSelectedNote(updated);
        await loadTree();
        if (selectedNoteScope?.type === "board") await loadBoardNotes();
      } catch (err) {
        console.error("Failed to save note:", err);
      }
    },
    [scopeId, svc, loadTree, loadBoardNotes, selectedNoteScope, orgId],
  );

  const handleMoveNote = useCallback(
    async (noteId: string, parentId: string | null, position: number) => {
      // 드롭 즉시 화면에 반영하고, 서버 응답으로 재동기화 (실패 시 리로드로 원복)
      setTree((prev) => applyLocalMove(prev, noteId, parentId, position));
      try {
        await svc.move(scopeId, noteId, { parentId, position });
        await loadTree();
      } catch (err) {
        console.error("Failed to move note:", err);
        toast.error(t("notes.moveFailed", "노트 이동에 실패했습니다"));
        await loadTree();
      }
    },
    [scopeId, svc, loadTree, t],
  );

  // ===================================================================
  // 자료실 모드 — 스토리지 파일을 같은 트리에 얹는 레이어 (withFiles)
  // ===================================================================

  const storageApi: StorageApi = useMemo(() => {
    if (personal) return myStorageAPI;
    if (orgId) return makeOrgStorageAPI(orgId);
    return makeBoardStorageAPI(boardId || "");
  }, [personal, orgId, boardId]);

  const [storageFolders, setStorageFolders] = useState<StorageFolderTree[]>([]);
  const [filesByFolder, setFilesByFolder] = useState<
    Map<string | null, StorageFileItem[]>
  >(() => new Map());
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [selectedFileNodeId, setSelectedFileNodeId] = useState<string | null>(
    null,
  );
  // 자료실 다중 선택 — 체크한 파일·노트 노드 id 집합
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const [usageDetailOpen, setUsageDetailOpen] = useState(false);
  const [dragOverMain, setDragOverMain] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStorage = useCallback(async () => {
    if (!withFiles) return;
    try {
      const [folders, nextUsage] = await Promise.all([
        storageApi.getFolders(),
        storageApi.getUsage(),
      ]);
      const flat: StorageFolderTree[] = [];
      const walk = (items: StorageFolderTree[]) => {
        items.forEach((folder) => {
          flat.push(folder);
          walk(folder.children ?? []);
        });
      };
      walk(folders);

      // 폴더별 파일 목록 API라 폴더 수만큼 병렬 조회한다.
      const lists = await Promise.all([
        storageApi.getFiles(null),
        ...flat.map((folder) => storageApi.getFiles(folder.id)),
      ]);
      const nextFiles = new Map<string | null, StorageFileItem[]>();
      nextFiles.set(null, lists[0]);
      flat.forEach((folder, index) =>
        nextFiles.set(folder.id, lists[index + 1]),
      );

      setStorageFolders(folders);
      setFilesByFolder(nextFiles);
      setUsage(nextUsage);
    } catch (err) {
      console.error("Failed to load library storage:", err);
    }
  }, [withFiles, storageApi]);

  useEffect(() => {
    void loadStorage();
  }, [loadStorage]);

  const library = useMemo(
    () =>
      withFiles
        ? buildLibraryTree(tree, storageFolders, filesByFolder)
        : { tree, storageFolderByNode: new Map(), fileByNodeId: new Map() },
    [withFiles, tree, storageFolders, filesByFolder],
  );

  const selectedFile = selectedFileNodeId
    ? (library.fileByNodeId.get(selectedFileNodeId) ?? null)
    : null;

  /** 파일 노드 / 스토리지 전용 폴더 / 노트를 한 핸들러에서 갈라 보낸다. */
  const handleSelectTreeNode = useCallback(
    (nodeId: string) => {
      if (withFiles && isFileNodeId(nodeId)) {
        setSelectedFileNodeId(nodeId);
        setMobileSidebarOpen(false);
        return;
      }
      if (withFiles && isStorageFolderNodeId(nodeId)) {
        // 스토리지 전용 폴더는 노트 상세가 없다 — 펼치기만 한다.
        setSelectedFileNodeId(null);
        return;
      }
      setSelectedFileNodeId(null);
      handleSelectNote(nodeId);
    },
    [withFiles, handleSelectNote],
  );

  /**
   * 업로드 목적지 스토리지 폴더. 노트 폴더에 짝이 없으면 같은 이름·같은 계층으로
   * 만들어 짝을 맞춘다 (이름 병합 규칙과 동일).
   */
  const resolveUploadFolderId = useCallback(async (): Promise<
    string | null
  > => {
    const anchor = selectedFileNodeId ?? selectedNoteId;
    const folderNode = folderNodeOf(library.tree, anchor);
    if (!folderNode) return null;

    const mapped = library.storageFolderByNode.get(folderNode.id);
    if (mapped) return mapped;

    let parentId: string | null = null;
    for (const title of folderTitlePath(library.tree, folderNode.id)) {
      const existing = findStorageChild(storageFolders, parentId, title);
      parentId = existing
        ? existing.id
        : (await storageApi.createFolder(title, parentId)).id;
    }
    return parentId;
  }, [selectedFileNodeId, selectedNoteId, library, storageFolders, storageApi]);

  const handleUploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (!canEdit) return;
      let folderId: string | null = null;
      try {
        folderId = await resolveUploadFolderId();
      } catch (err) {
        console.error("Failed to prepare upload folder:", err);
      }

      for (const file of Array.from(fileList)) {
        const key = `${file.name}-${file.size}-${Date.now()}`;
        setUploads((prev) => ({ ...prev, [key]: 0 }));
        try {
          await storageApi.uploadFile(file, folderId, (percent) =>
            setUploads((prev) => ({ ...prev, [key]: percent })),
          );
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code;
          toast.error(
            code === "ST003"
              ? t("library.quotaExceeded", "스토리지 용량이 부족합니다")
              : ((err as { message?: string })?.message ??
                  t("library.uploadFailed", "업로드에 실패했습니다")),
          );
        } finally {
          setUploads((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
      await loadStorage();
    },
    [canEdit, resolveUploadFolderId, storageApi, loadStorage, t],
  );

  const fileActions = useMemo(
    () => ({
      onDownload: (file: StorageFileItem) => {
        void storageApi
          .downloadAndSave(file.id, file.original_filename)
          .catch(() =>
            toast.error(t("library.downloadFailed", "다운로드에 실패했습니다")),
          );
      },
      onToggleShare: async (file: StorageFileItem) => {
        try {
          if (file.is_shared) {
            await storageApi.disableFileShare(file.id);
            toast.success(t("library.unshared", "공유가 해제되었습니다"));
          } else {
            const updated = await storageApi.enableFileShare(file.id);
            if (updated.share_code) {
              await navigator.clipboard
                ?.writeText(publicFileLink(updated.share_code))
                .catch(() => {});
            }
            toast.success(t("library.shared", "공유 링크가 복사되었습니다"));
          }
          await loadStorage();
        } catch (err) {
          console.error("Failed to toggle file share:", err);
        }
      },
      onDelete: async (file: StorageFileItem) => {
        try {
          await storageApi.deleteFile(file.id);
          setSelectedFileNodeId((prev) =>
            prev && fileIdFromNodeId(prev) === file.id ? null : prev,
          );
          await loadStorage();
        } catch (err) {
          console.error("Failed to delete file:", err);
        }
      },
    }),
    [storageApi, loadStorage, t],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const treeSelection = useMemo(
    () => ({ selectedIds, toggle: toggleSelect }),
    [selectedIds, toggleSelect],
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (
      !window.confirm(
        t("library.bulkDeleteConfirm", "선택한 {{count}}개 항목을 휴지통으로 옮길까요?", {
          count: ids.length,
        }),
      )
    )
      return;

    setBulkDeleting(true);
    let failed = 0;
    for (const id of ids) {
      try {
        if (isFileNodeId(id)) {
          await storageApi.deleteFile(fileIdFromNodeId(id));
        } else if (isStorageFolderNodeId(id)) {
          await storageApi.deleteFolder(storageFolderIdFromNodeId(id));
        } else {
          await svc.delete(scopeId, id);
        }
      } catch (err) {
        failed += 1;
        console.error("Failed to bulk-delete node:", id, err);
      }
    }

    // 삭제된 항목이 현재 열려 있으면 상세 패널을 닫는다.
    setSelectedFileNodeId((prev) => (prev && selectedIds.has(prev) ? null : prev));
    if (selectedNoteId && selectedIds.has(selectedNoteId)) {
      setSelectedNoteId(null);
      setSelectedNote(null);
    }
    clearSelection();
    await Promise.all([loadTree(), loadStorage()]);
    setBulkDeleting(false);

    if (failed > 0) {
      toast.error(
        t("library.bulkDeletePartial", "{{count}}개 항목을 삭제하지 못했습니다", {
          count: failed,
        }),
      );
    } else {
      toast.success(
        t("library.bulkDeleteDone", "{{count}}개 항목을 휴지통으로 옮겼습니다", {
          count: ids.length,
        }),
      );
    }
  }, [
    selectedIds,
    storageApi,
    svc,
    scopeId,
    selectedNoteId,
    loadTree,
    loadStorage,
    clearSelection,
    t,
  ]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-bridge-accent" />
      </div>
    );
  }

  const sidebarContent = (
    <>
      {/* Sidebar Header */}
      <div className="p-4 border-b border-foreground/5 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <FileText size={18} className="text-bridge-accent" />
            {withFiles
              ? t("library.title", "자료실")
              : t("notes.title", "노트")}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewType("tree")}
              className={`p-1.5 rounded transition-colors ${viewType === "tree" ? "text-bridge-accent bg-bridge-accent/10" : "text-slate-400 hover:text-foreground"}`}
              title={t("notes.treeView", "트리 뷰")}
            >
              <FolderTree size={16} />
            </button>
            <button
              onClick={() => setViewType("list")}
              className={`p-1.5 rounded transition-colors ${viewType === "list" ? "text-bridge-accent bg-bridge-accent/10" : "text-slate-400 hover:text-foreground"}`}
              title={t("notes.listView", "리스트 뷰")}
            >
              <List size={16} />
            </button>
          </div>
        </div>
        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              withFiles
                ? t("library.searchPlaceholder", "노트 · 파일 검색")
                : t("notes.searchPlaceholder", "검색...")
            }
            className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-2 pl-9 pr-3 text-sm text-foreground placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
        {/* Create Actions — 가장 잦은 '새 문서'를 주 버튼으로, 보드·폴더는 아이콘 버튼으로 분리 */}
        {canEdit && (
          <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 mt-3">
            <button
              onClick={() => handleCreateDocument(null)}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-colors"
            >
              <FilePlus size={15} />
              {t("notes.newDocument", "새 문서")}
            </button>
            {withFiles ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label={t("library.upload", "파일 업로드")}
                title={t("library.upload", "파일 업로드")}
                className="flex items-center justify-center w-9 text-bridge-secondary bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-colors"
              >
                <Upload size={16} />
              </button>
            ) : (
              <button
                onClick={() => handleCreateBoard(null)}
                aria-label={t("notes.newBoard", "새 보드")}
                title={t("notes.newBoard", "새 보드")}
                className="flex items-center justify-center w-9 text-bridge-secondary bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-colors"
              >
                <PenTool size={16} />
              </button>
            )}
            <button
              onClick={() => handleCreateFolder(null)}
              aria-label={t("notes.newFolder", "새 폴더")}
              title={t("notes.newFolder", "새 폴더")}
              className="flex items-center justify-center w-9 text-bridge-accent bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-colors"
            >
              <FolderPlus size={16} />
            </button>
          </div>
        )}

        {/* 업로드 진행 */}
        {withFiles && Object.keys(uploads).length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {Object.entries(uploads).map(([key, percent]) => (
              <div key={key} className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                  <div
                    className="h-full bg-bridge-secondary rounded-full transition-all"
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
      </div>

      {/* 다중 선택 액션바 — 선택 항목이 있을 때만 노출 */}
      {withFiles && canEdit && selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-foreground/5 bg-bridge-accent/5 flex-shrink-0">
          <span className="text-xs font-bold text-foreground">
            {t("library.selectedCount", "{{count}}개 선택됨", {
              count: selectedIds.size,
            })}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={clearSelection}
              className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-foreground rounded-lg hover:bg-foreground/5 transition-colors"
            >
              {t("common.cancel", "취소")}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-white bg-rose-500 rounded-lg hover:bg-rose-600 transition-colors disabled:opacity-50"
            >
              {bulkDeleting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              {t("common.delete", "삭제")}
            </button>
          </div>
        </div>
      )}

      {/* Tree or List Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {viewType === "tree" ? (
          <NoteTreeSidebar
            tree={library.tree}
            selectedNoteId={selectedFileNodeId ?? selectedNoteId}
            searchQuery={searchQuery}
            onSelect={handleSelectTreeNode}
            onCreateFolder={handleCreateFolder}
            onCreateDocument={handleCreateDocument}
            onCreateBoard={handleCreateBoard}
            onDelete={handleDeleteNote}
            onRename={handleRenameNote}
            onMove={handleMoveNote}
            onDuplicate={handleDuplicateNote}
            canEdit={canEdit}
            boardNoteSections={orgId ? boardNoteSections : undefined}
            onSelectBoardNote={orgId ? handleSelectBoardNote : undefined}
            fileActions={withFiles ? fileActions : undefined}
            selection={withFiles && canEdit ? treeSelection : undefined}
          />
        ) : (
          <NoteListView
            boardId={scopeId}
            selectedNoteId={selectedNoteId}
            searchQuery={searchQuery}
            onSelect={handleSelectNote}
            tags={tags}
          />
        )}
      </div>

      {/* 하단 — 자료실은 용량 미터를 함께 둔다 */}
      {(canEdit || (withFiles && usage)) && (
        <div className="border-t border-foreground/5 p-2 flex-shrink-0 flex flex-col gap-1">
          {withFiles && usage && (
            <button
              onClick={() => setUsageDetailOpen(true)}
              className="w-full flex flex-col gap-1.5 px-3 py-2 rounded-lg hover:bg-foreground/5 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs text-slate-400">
                <HardDrive size={13} />
                <span className="font-bold text-foreground">
                  {formatBytes(usage.used)}
                </span>
                <span>/ {formatBytes(usage.quota)}</span>
                <span className="ml-auto">자세히 ›</span>
              </span>
              <span className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-bridge-secondary to-bridge-accent"
                  style={{
                    width: `${
                      usage.quota > 0
                        ? Math.min(100, (usage.used / usage.quota) * 100)
                        : 0
                    }%`,
                  }}
                />
              </span>
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => setTrashOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Trash2 size={14} />
              <span className="flex-1 text-left">
                {t("notes.trash.title", "휴지통")}
              </span>
            </button>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-[340px] flex-shrink-0 border-r border-foreground/5 bg-bridge-dark flex-col">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0 bg-bridge-dark border-foreground/10 flex flex-col"
        >
          <SheetTitle className="sr-only">
            {t("notes.title", "노트")}
          </SheetTitle>
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Trash Modal — 자료실은 노트와 파일을 한 목록에서 되돌린다 */}
      {withFiles ? (
        <LibraryTrashModal
          open={trashOpen}
          onClose={() => setTrashOpen(false)}
          scopeType={scopeType}
          scopeId={scopeId}
          storageApi={storageApi}
          canPermanentDelete={canManageTrash}
          onChanged={() => {
            loadTree();
            void loadStorage();
            if (orgId) loadBoardNotes();
          }}
        />
      ) : (
        <NoteTrashModal
          open={trashOpen}
          onClose={() => setTrashOpen(false)}
          scopeType={scopeType}
          scopeId={scopeId}
          canPermanentDelete={canManageTrash}
          onChanged={() => {
            loadTree();
            if (orgId) loadBoardNotes();
          }}
        />
      )}

      {withFiles && (
        <>
          <StorageUsageDetailModal
            api={storageApi}
            open={usageDetailOpen}
            onClose={() => setUsageDetailOpen(false)}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length)
                void handleUploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </>
      )}

      {/* Right Content - Editor / File */}
      <div
        className={`flex-1 flex flex-col overflow-hidden bg-bridge-dark ${
          dragOverMain ? "ring-2 ring-inset ring-bridge-secondary" : ""
        }`}
        onDragOver={
          withFiles && canEdit
            ? (e) => {
                e.preventDefault();
                setDragOverMain(true);
              }
            : undefined
        }
        onDragLeave={withFiles ? () => setDragOverMain(false) : undefined}
        onDrop={
          withFiles && canEdit
            ? (e) => {
                e.preventDefault();
                setDragOverMain(false);
                if (e.dataTransfer.files?.length) {
                  void handleUploadFiles(e.dataTransfer.files);
                }
              }
            : undefined
        }
      >
        {selectedFile ? (
          <LibraryFilePane
            file={selectedFile}
            canEdit={canEdit}
            onDownload={fileActions.onDownload}
            onToggleShare={fileActions.onToggleShare}
            onDelete={fileActions.onDelete}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
          />
        ) : selectedNote ? (
          <>
            {/* Mobile top bar with sidebar toggle */}
            <div className="flex md:hidden items-center gap-2 px-3 py-2 border-b border-foreground/5">
              <IconButton
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="사이드바 열기"
              >
                <Menu />
              </IconButton>
              <span className="text-sm text-foreground font-medium truncate">
                {selectedNote.title}
              </span>
            </div>
            <NoteEditor
              boardId={
                selectedNoteScope?.type === "board"
                  ? selectedNoteScope.id
                  : boardId
              }
              orgId={
                selectedNoteScope?.type === "org"
                  ? selectedNoteScope.id
                  : selectedNoteScope?.type === "board"
                    ? undefined
                    : orgId
              }
              personal={personal}
              note={selectedNote}
              tags={tags}
              loading={noteLoading}
              canEdit={
                selectedNoteScope?.type === "board" && orgId
                  ? boardNoteSections.find(
                      (s) => s.board_id === selectedNoteScope.id,
                    )?.user_role !== "VIEWER"
                  : canEdit
              }
              onSave={handleSaveNote}
              onTagsChange={loadTags}
              onNoteUpdate={(updated) => setSelectedNote(updated)}
              onCollabReset={handleCollabReset}
              collaboration={collaboration}
              currentUserName={userName}
              currentUserColor={userColor}
              breadcrumbs={breadcrumbs}
              onBreadcrumbClick={handleSelectNote}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            {/* Mobile: show sidebar toggle when no note selected */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden mb-4 p-2 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Menu size={24} />
            </button>
            <FileText size={48} className="mb-4 opacity-30" />
            <p className="text-sm">
              {withFiles
                ? t(
                    "library.selectOrCreate",
                    "왼쪽에서 노트나 파일을 고르세요. 파일은 여기에 끌어다 놓아도 됩니다",
                  )
                : t(
                    "notes.selectOrCreate",
                    "문서를 선택하거나 새로 만들어주세요",
                  )}
            </p>
            {canEdit && (
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => handleCreateDocument(null)}
                  className="px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all"
                >
                  <FilePlus size={14} className="inline mr-1.5" />
                  {t("notes.createFirstDocument", "첫 문서 만들기")}
                </button>
                {withFiles && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground rounded-xl text-xs font-bold hover:bg-foreground/10 transition-all"
                  >
                    <Upload size={14} className="inline mr-1.5" />
                    {t("library.upload", "파일 업로드")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
