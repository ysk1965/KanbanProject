import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  FileText,
  FolderPlus,
  FilePlus,
  PenTool,
  Workflow,
  Search,
  List,
  FolderTree,
  Loader2,
  Menu,
  Trash2,
} from "lucide-react";
import { NoteTreeSidebar } from "./NoteTreeSidebar";
import { NoteEditor } from "./NoteEditor";
import { NoteListView } from "./NoteListView";
import { NoteTrashModal } from "./NoteTrashModal";
import { noteService, orgNoteService } from "../../utils/services";
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
} from "../../utils/api";
import type { BreadcrumbItem } from "./NoteEditor";

interface NotesViewProps {
  boardId?: string;
  orgId?: string;
  currentUserRole: string;
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

export function NotesView({ boardId, orgId, currentUserRole }: NotesViewProps) {
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
  // Track which scope the selected note belongs to (org notes vs board notes)
  const [selectedNoteScope, setSelectedNoteScope] = useState<{
    type: "org" | "board";
    id: string;
  } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  // Determine scope
  const scopeId = boardId || orgId || "";
  const scopeType = orgId ? "org" : "board";
  const svc = scopeType === "org" ? orgNoteService : noteService;

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
      chain.unshift({ id: parent.id, title: parent.title, type: parent.type });
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
            orgId
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

  const handleCreateFlow = useCallback(
    async (parentId?: string | null) => {
      if (!canEdit) return;
      try {
        const title = t("notes.newFlow", "새 플로우");
        const created = await svc.create(scopeId, {
          title,
          type: "FLOW",
          parentId: parentId || null,
        });
        await loadTree();

        handleSelectNote(created.id);
      } catch (err) {
        console.error("Failed to create flow:", err);
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
          type: detail.type as "FOLDER" | "DOCUMENT" | "BOARD" | "FLOW",
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
            {t("notes.title", "노트")}
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
            placeholder={t("notes.searchPlaceholder", "검색...")}
            className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-2 pl-9 pr-3 text-sm text-foreground placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
        {/* Create Actions */}
        {canEdit && (
          <div className="flex gap-1.5 mt-3">
            <button
              onClick={() => handleCreateDocument(null)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <FilePlus size={15} />
              {t("notes.newDocument", "새 문서")}
            </button>
            <button
              onClick={() => handleCreateBoard(null)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <PenTool size={15} />
              {t("notes.newBoard", "새 보드")}
            </button>
            <button
              onClick={() => handleCreateFlow(null)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <Workflow size={15} />
              {t("notes.newFlow", "새 플로우")}
            </button>
            <button
              onClick={() => handleCreateFolder(null)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <FolderPlus size={15} />
              {t("notes.newFolder", "새 폴더")}
            </button>
          </div>
        )}
      </div>

      {/* Tree or List Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {viewType === "tree" ? (
          <NoteTreeSidebar
            tree={tree}
            selectedNoteId={selectedNoteId}
            searchQuery={searchQuery}
            onSelect={handleSelectNote}
            onCreateFolder={handleCreateFolder}
            onCreateDocument={handleCreateDocument}
            onCreateBoard={handleCreateBoard}
            onCreateFlow={handleCreateFlow}
            onDelete={handleDeleteNote}
            onRename={handleRenameNote}
            onMove={handleMoveNote}
            onDuplicate={handleDuplicateNote}
            canEdit={canEdit}
            boardNoteSections={orgId ? boardNoteSections : undefined}
            onSelectBoardNote={orgId ? handleSelectBoardNote : undefined}
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

      {/* Trash entry */}
      {canEdit && (
        <div className="border-t border-foreground/5 p-2 flex-shrink-0">
          <button
            onClick={() => setTrashOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <Trash2 size={14} />
            <span className="flex-1 text-left">
              {t("notes.trash.title", "휴지통")}
            </span>
          </button>
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

      {/* Trash Modal */}
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

      {/* Right Content - Editor */}
      <div className="flex-1 flex flex-col overflow-hidden bg-bridge-dark">
        {selectedNote ? (
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
              {t("notes.selectOrCreate", "문서를 선택하거나 새로 만들어주세요")}
            </p>
            {canEdit && (
              <button
                onClick={() => handleCreateDocument(null)}
                className="mt-4 px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all"
              >
                <FilePlus size={14} className="inline mr-1.5" />
                {t("notes.createFirstDocument", "첫 문서 만들기")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
