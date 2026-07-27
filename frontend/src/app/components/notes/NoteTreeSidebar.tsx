import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
  FilePlus,
  GripVertical,
  PenTool,
  LayoutDashboard,
  Copy,
  Download,
  Link2,
  Image as ImageIcon,
  Film,
  FolderClock,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import type {
  NoteTreeItem,
  BoardNoteSection,
  StorageFileItem,
} from "../../utils/api";

interface NoteTreeSidebarProps {
  tree: NoteTreeItem[];
  selectedNoteId: string | null;
  searchQuery: string;
  onSelect: (noteId: string) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onCreateDocument: (parentId?: string | null) => void;
  onCreateBoard: (parentId?: string | null) => void;
  onDelete: (noteId: string) => void;
  onRename: (noteId: string, newTitle: string) => void;
  onMove: (noteId: string, parentId: string | null, position: number) => void;
  onDuplicate?: (noteId: string) => void;
  canEdit: boolean;
  boardNoteSections?: BoardNoteSection[];
  onSelectBoardNote?: (noteId: string, boardId: string) => void;
  /** 자료실 탭에서만 전달 — 트리에 섞인 스토리지 파일 노드의 동작 */
  fileActions?: FileActions;
  /** 다중 선택 — 넘기면 각 행에 체크박스가 나타나고 일괄 삭제를 켠다 */
  selection?: TreeSelection;
}

/** type === "FILE" 합성 노드에서 쓰는 동작. 컨텍스트로 내려 프롭 드릴링을 피한다. */
export interface FileActions {
  onDownload: (file: StorageFileItem) => void;
  onToggleShare: (file: StorageFileItem) => void;
  onDelete: (file: StorageFileItem) => void;
}

const FileActionsContext = createContext<FileActions | null>(null);

/** 자료실 다중 선택. 파일·노트 노드를 체크해 일괄 삭제한다. 컨텍스트로 내려 프롭 드릴링을 피한다. */
export interface TreeSelection {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
}

const SelectionContext = createContext<TreeSelection | null>(null);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// 'inside-first': 펼쳐진 채 자식이 보이는 항목의 아래쪽 드롭 — 첫 자식으로 삽입
type DropZone = "before" | "inside" | "after" | "inside-first";

interface DropTargetInfo {
  id: string;
  zone: DropZone;
}

const MAX_DEPTH = 4; // depth 0~4 = 5 levels

function getMaxSubtreeDepth(item: NoteTreeItem): number {
  if (!item.children || item.children.length === 0) return 0;
  return 1 + Math.max(...item.children.map(getMaxSubtreeDepth));
}

// 형제 사이(before/after)로 끼워넣는 위치를 알리는 강조 삽입선 — 발광 + 시작점 도트
function DropLine({ indent }: { indent: number }) {
  return (
    <div
      className="relative h-[3px] rounded-full bg-bridge-accent my-0.5"
      style={{
        marginLeft: indent,
        marginRight: 8,
        boxShadow: "0 0 8px rgba(99,102,241,0.6)",
      }}
    >
      <span
        className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-bridge-accent"
        style={{ boxShadow: "0 0 8px rgba(99,102,241,0.9)" }}
      />
    </div>
  );
}

export function NoteTreeSidebar({
  tree,
  selectedNoteId,
  searchQuery,
  onSelect,
  onCreateFolder,
  onCreateDocument,
  onCreateBoard,
  onDelete,
  onRename,
  onMove,
  onDuplicate,
  canEdit,
  boardNoteSections,
  onSelectBoardNote,
  fileActions,
  selection,
}: NoteTreeSidebarProps) {
  const [activeItem, setActiveItem] = useState<NoteTreeItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetInfo | null>(null);
  // 기본 전체 펼침 — collapsedIds에 있는 항목만 접힘
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const dropTargetRef = useRef<DropTargetInfo | null>(null);
  const pointerYRef = useRef<number>(0);

  const toggleExpand = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandItem = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const filteredTree = searchQuery
    ? filterTree(tree, searchQuery.toLowerCase())
    : tree;

  const flatMap = new Map<string, NoteTreeItem>();
  function buildFlatMap(items: NoteTreeItem[]) {
    for (const item of items) {
      flatMap.set(item.id, item);
      if (item.children) buildFlatMap(item.children);
    }
  }
  buildFlatMap(tree);

  const isDescendant = (parentId: string, childId: string): boolean => {
    const parent = flatMap.get(parentId);
    if (!parent || !parent.children) return false;
    for (const child of parent.children) {
      if (child.id === childId) return true;
      if (isDescendant(child.id, childId)) return true;
    }
    return false;
  };

  // Track pointer Y during drag for zone calculation
  useEffect(() => {
    if (!activeItem) return;
    const onPointerMove = (e: PointerEvent) => {
      pointerYRef.current = e.clientY;
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [activeItem]);

  const handleDragStart = (event: DragStartEvent) => {
    const item = flatMap.get(event.active.id as string);
    if (item) setActiveItem(item);
    // Initialize pointer Y from activator event to avoid stale 0 value
    if (event.activatorEvent instanceof PointerEvent) {
      pointerYRef.current = event.activatorEvent.clientY;
    }
  };

  const hasVisibleChildren = (item: NoteTreeItem): boolean =>
    !!item.children && item.children.length > 0 && !collapsedIds.has(item.id);

  const calculateDropZone = (
    overItem: NoteTreeItem,
    rect: { top: number; height: number },
    pointerY: number,
    draggedItem: NoteTreeItem,
  ): DropZone => {
    const ratio = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));

    // 폴더는 inside 영역을 넓게(25~75%), 문서/보드는 끼워넣기(reorder) 우선으로 좁게(40~60%)
    const isFolder = overItem.type === "FOLDER";
    const beforeMax = isFolder ? 0.25 : 0.4;
    const afterMin = isFolder ? 0.75 : 0.6;

    let zone: DropZone;
    if (ratio < beforeMax) zone = "before";
    else if (ratio > afterMin) zone = "after";
    else zone = "inside";

    // 펼쳐진 채 자식이 보이는 항목의 아래쪽 드롭 = 첫 자식으로 삽입
    // (표시선이 항목과 첫 자식 사이에 그려지므로 실제 동작도 일치시킴)
    if (zone === "after" && hasVisibleChildren(overItem)) zone = "inside-first";

    // Depth validation: prevent nesting if it would exceed max depth
    if (zone === "inside" || zone === "inside-first") {
      const maxSubDepth = getMaxSubtreeDepth(draggedItem);
      if (overItem.depth + 1 + maxSubDepth > MAX_DEPTH) {
        zone = ratio < 0.5 ? "before" : "after";
      }
    }
    return zone;
  };

  const setDropTargetBoth = (value: DropTargetInfo | null) => {
    dropTargetRef.current = value;
    setDropTarget(value);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over || !activeItem) {
      setDropTargetBoth(null);
      return;
    }

    const overId = over.id as string;

    if (overId === "root-drop-zone") {
      setDropTargetBoth({ id: "root-drop-zone", zone: "inside" });
      return;
    }

    if (overId === activeItem.id || isDescendant(activeItem.id, overId)) {
      setDropTargetBoth(null);
      return;
    }

    const overItem = flatMap.get(overId);
    if (!overItem) {
      setDropTargetBoth(null);
      return;
    }

    const zone = calculateDropZone(
      overItem,
      over.rect,
      pointerYRef.current,
      activeItem,
    );
    setDropTargetBoth({ id: overId, zone });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const dragged = activeItem;
    setActiveItem(null);
    setDropTargetBoth(null);

    if (!dragged) return;

    // Use event.over + pointerYRef to compute the final zone directly,
    // avoiding stale React state issues with dropTarget
    const { over } = event;
    if (!over) return;

    const overId = over.id as string;

    if (overId === "root-drop-zone") {
      onMove(dragged.id, null, tree.filter((n) => n.id !== dragged.id).length);
      return;
    }

    if (overId === dragged.id || isDescendant(dragged.id, overId)) return;

    const targetItem = flatMap.get(overId);
    if (!targetItem) return;

    const zone = calculateDropZone(
      targetItem,
      over.rect,
      pointerYRef.current,
      dragged,
    );

    // position은 "드래그 항목을 제외한" 형제 목록 내 삽입 인덱스 (백엔드 의미론과 일치)
    const getSiblings = () =>
      (targetItem.parent_id
        ? flatMap.get(targetItem.parent_id)?.children || []
        : tree
      ).filter((s) => s.id !== dragged.id);

    switch (zone) {
      case "before": {
        const targetIndex = getSiblings().findIndex((s) => s.id === overId);
        onMove(dragged.id, targetItem.parent_id, targetIndex);
        break;
      }
      case "inside": {
        const childCount = (targetItem.children || []).filter(
          (c) => c.id !== dragged.id,
        ).length;
        onMove(dragged.id, overId, childCount);
        break;
      }
      case "inside-first": {
        onMove(dragged.id, overId, 0);
        break;
      }
      case "after": {
        const targetIndex = getSiblings().findIndex((s) => s.id === overId);
        onMove(dragged.id, targetItem.parent_id, targetIndex + 1);
        break;
      }
    }
  };

  // Filter board note sections by search query
  const filteredBoardSections = boardNoteSections
    ?.map((section) => {
      if (!searchQuery) return section;
      const q = searchQuery.toLowerCase();
      const boardNameMatch = section.board_name.toLowerCase().includes(q);
      const filteredSectionTree = filterTree(section.tree, q);
      if (boardNameMatch || filteredSectionTree.length > 0) {
        return {
          ...section,
          tree:
            filteredSectionTree.length > 0 ? filteredSectionTree : section.tree,
        };
      }
      return null;
    })
    .filter((s): s is BoardNoteSection => s !== null);

  const hasBoardSections =
    filteredBoardSections && filteredBoardSections.length > 0;

  if (filteredTree.length === 0 && !hasBoardSections) {
    return (
      <div className="text-center text-slate-500 text-xs py-8">
        {searchQuery
          ? "검색 결과가 없습니다"
          : fileActions
            ? "노트와 파일이 없습니다"
            : "노트가 없습니다"}
      </div>
    );
  }

  const handleDragCancel = () => {
    setActiveItem(null);
    setDropTargetBoth(null);
  };

  return (
    <SelectionContext.Provider value={selection ?? null}>
    <FileActionsContext.Provider value={fileActions ?? null}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div>
          <SiblingGroup
            items={filteredTree}
            parentId={null}
            selectedNoteId={selectedNoteId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onCreateDocument={onCreateDocument}
            onCreateBoard={onCreateBoard}
            onDelete={onDelete}
            onRename={onRename}
            onDuplicate={onDuplicate}
            canEdit={canEdit}
            depth={0}
            activeId={activeItem?.id ?? null}
            dropTarget={dropTarget}
            collapsedIds={collapsedIds}
            onToggleExpand={toggleExpand}
            onAutoExpand={expandItem}
          />
        </div>

        {/* 트리 아래 빈 영역 — 루트 맨 끝으로 이동하는 드롭존 */}
        <RootDropZone
          isOver={dropTarget?.id === "root-drop-zone"}
          canEdit={canEdit}
          isDragging={!!activeItem}
        />

        <DragOverlay dropAnimation={null}>
          {activeItem && (
            <div className="flex items-center gap-2.5 px-3 py-2 bg-bridge-obsidian border border-bridge-accent/50 rounded-lg shadow-lg text-[15px] text-foreground opacity-90">
              {activeItem.type === "FOLDER" ? (
                <Folder size={18} className="text-bridge-accent" />
              ) : activeItem.type === "BOARD" ? (
                <PenTool size={18} className="text-bridge-secondary" />
              ) : (
                <FileText size={18} className="text-slate-400" />
              )}
              <span className="truncate max-w-[200px]">{activeItem.title}</span>
            </div>
          )}
        </DragOverlay>

        {/* Board Note Sections */}
        {hasBoardSections &&
          filteredBoardSections!.map((section) => (
            <BoardNoteGroup
              key={section.board_id}
              section={section}
              selectedNoteId={selectedNoteId}
              searchQuery={searchQuery}
              onSelect={(noteId) =>
                onSelectBoardNote?.(noteId, section.board_id)
              }
              defaultExpanded={!!searchQuery}
            />
          ))}
      </DndContext>
    </FileActionsContext.Provider>
    </SelectionContext.Provider>
  );
}

function SiblingGroup({
  items,
  parentId,
  selectedNoteId,
  onSelect,
  onCreateFolder,
  onCreateDocument,
  onCreateBoard,
  onDelete,
  onRename,
  onDuplicate,
  canEdit,
  depth,
  activeId,
  dropTarget,
  collapsedIds,
  onToggleExpand,
  onAutoExpand,
}: {
  items: NoteTreeItem[];
  parentId: string | null;
  selectedNoteId: string | null;
  onSelect: (noteId: string) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onCreateDocument: (parentId?: string | null) => void;
  onCreateBoard: (parentId?: string | null) => void;
  onDelete: (noteId: string) => void;
  onRename: (noteId: string, newTitle: string) => void;
  onDuplicate?: (noteId: string) => void;
  canEdit: boolean;
  depth: number;
  activeId: string | null;
  dropTarget: DropTargetInfo | null;
  collapsedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onAutoExpand: (id: string) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <TreeItemComponent
          key={item.id}
          item={item}
          selectedNoteId={selectedNoteId}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
          onCreateDocument={onCreateDocument}
          onCreateBoard={onCreateBoard}
          onDelete={onDelete}
          onRename={onRename}
          onDuplicate={onDuplicate}
          canEdit={canEdit}
          depth={depth}
          activeId={activeId}
          dropTarget={dropTarget}
          collapsedIds={collapsedIds}
          onToggleExpand={onToggleExpand}
          onAutoExpand={onAutoExpand}
        />
      ))}
    </>
  );
}

function RootDropZone({
  isOver,
  canEdit,
  isDragging,
}: {
  isOver: boolean;
  canEdit: boolean;
  isDragging: boolean;
}) {
  const { setNodeRef } = useDroppable({
    id: "root-drop-zone",
    disabled: !canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-all ${isDragging ? "min-h-[48px]" : "min-h-[16px]"}`}
    >
      {isOver && <DropLine indent={8} />}
    </div>
  );
}

interface TreeItemComponentProps {
  item: NoteTreeItem;
  selectedNoteId: string | null;
  onSelect: (noteId: string) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onCreateDocument: (parentId?: string | null) => void;
  onCreateBoard: (parentId?: string | null) => void;
  onDelete: (noteId: string) => void;
  onRename: (noteId: string, newTitle: string) => void;
  onDuplicate?: (noteId: string) => void;
  canEdit: boolean;
  depth: number;
  activeId: string | null;
  dropTarget: DropTargetInfo | null;
  collapsedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onAutoExpand: (id: string) => void;
}

function TreeItemComponent({
  item,
  selectedNoteId,
  onSelect,
  onCreateFolder,
  onCreateDocument,
  onCreateBoard,
  onDelete,
  onRename,
  onDuplicate,
  canEdit,
  depth,
  activeId,
  dropTarget,
  collapsedIds,
  onToggleExpand,
  onAutoExpand,
}: TreeItemComponentProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.title);

  const fileActions = useContext(FileActionsContext);
  const selection = useContext(SelectionContext);
  const isChecked = selection?.selectedIds.has(item.id) ?? false;

  const expanded = !collapsedIds.has(item.id);
  const isFolder = item.type === "FOLDER";
  // 자료실에서 합성한 스토리지 파일 노드 — 이동·이름변경 대신 다운로드·공유·삭제
  const isFile = item.type === "FILE";
  const file = item.file;
  const isSelected = selectedNoteId === item.id;
  const hasChildren = item.children && item.children.length > 0;
  const isDragging = activeId === item.id;

  // Drop zone indicators
  const isBeforeTarget =
    dropTarget?.id === item.id && dropTarget?.zone === "before";
  const isInsideTarget =
    dropTarget?.id === item.id && dropTarget?.zone === "inside";
  const isAfterTarget =
    dropTarget?.id === item.id && dropTarget?.zone === "after";
  const isInsideFirstTarget =
    dropTarget?.id === item.id && dropTarget?.zone === "inside-first";

  // Auto-expand collapsed items when dragging over "inside" zone
  useEffect(() => {
    if (isInsideTarget && !expanded) {
      const timer = setTimeout(() => onAutoExpand(item.id), 600);
      return () => clearTimeout(timer);
    }
  }, [isInsideTarget, expanded, item.id, onAutoExpand]);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: item.id,
    // 파일은 노트 트리의 이동 대상이 아니다 (스토리지 폴더 이동은 별도)
    disabled: !canEdit || renaming || isFile,
  });

  // All items are droppable (before/inside/after)
  const { setNodeRef: setDropRef } = useDroppable({
    id: item.id,
    disabled: !canEdit || activeId === item.id || isFile,
  });

  // Combine drag + drop refs on the row element
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  const handleClick = () => {
    if (hasChildren || isFolder) onToggleExpand(item.id);
    onSelect(item.id);
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== item.title) {
      onRename(item.id, renameValue.trim());
    }
    setRenaming(false);
  };

  const indentPx = depth * 20 + 8;

  return (
    <div className={isDragging ? "opacity-30" : ""}>
      {/* Before drop indicator line */}
      {isBeforeTarget && <DropLine indent={indentPx} />}

      {/* Item row — draggable + droppable */}
      <div
        ref={setRef}
        className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 text-[15px] ${
          isInsideTarget
            ? "bg-bridge-accent/20 text-foreground"
            : isSelected
              ? "bg-bridge-accent/15 text-foreground"
              : isFolder
                ? "bg-foreground/[0.03] text-foreground hover:bg-foreground/[0.06]"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        } ${isChecked ? "ring-1 ring-inset ring-bridge-accent/40" : ""}`}
        style={{
          paddingLeft: `${indentPx}px`,
          ...(isInsideTarget
            ? {
                boxShadow:
                  "0 0 16px rgba(99,102,241,0.5), inset 0 0 0 1.5px rgba(99,102,241,0.6)",
              }
            : {}),
        }}
        {...attributes}
        {...listeners}
        onClick={handleClick}
      >
        {/* 다중 선택 체크박스 — 선택 항목은 항상, 그 외엔 호버 시 노출 */}
        {selection && (
          <button
            type="button"
            role="checkbox"
            aria-checked={isChecked}
            aria-label={t("common.select", "선택")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              selection.toggle(item.id);
            }}
            className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
              isChecked
                ? "bg-bridge-accent border-bridge-accent text-white"
                : "border-foreground/25 text-transparent opacity-0 group-hover:opacity-100"
            }`}
          >
            <Check size={12} strokeWidth={3} />
          </button>
        )}

        {/* Drag handle — 평소 은은히 노출, 호버 시 또렷하게 */}
        {canEdit && !renaming && !isFile && (
          <span className="flex-shrink-0 opacity-20 group-hover:opacity-90 transition-opacity cursor-grab active:cursor-grabbing text-slate-400">
            <GripVertical size={14} />
          </span>
        )}

        {/* Expand/Collapse */}
        {isFolder || hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(item.id);
            }}
            className="flex-shrink-0 p-0.5 hover:bg-foreground/10 rounded"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="w-6 flex-shrink-0" />
        )}

        {/* Icon */}
        {isFolder ? (
          // 보고서가 자동으로 만든 폴더는 사용자가 만든 폴더와 구분해 보여준다.
          item.system_key ? (
            <FolderClock
              size={18}
              className="flex-shrink-0 text-bridge-secondary"
            />
          ) : expanded ? (
            <FolderOpen
              size={18}
              className="flex-shrink-0 text-bridge-accent"
            />
          ) : (
            <Folder size={18} className="flex-shrink-0 text-bridge-accent" />
          )
        ) : item.type === "BOARD" ? (
          <PenTool size={18} className="flex-shrink-0 text-bridge-secondary" />
        ) : isFile ? (
          file?.is_image ? (
            <ImageIcon
              size={18}
              className="flex-shrink-0 text-bridge-secondary"
            />
          ) : file?.is_video ? (
            <Film size={18} className="flex-shrink-0 text-bridge-secondary" />
          ) : (
            <FileText
              size={18}
              className="flex-shrink-0 text-bridge-secondary"
            />
          )
        ) : (
          <FileText size={18} className="flex-shrink-0 text-slate-400" />
        )}

        {/* Title */}
        {renaming ? (
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") {
                setRenaming(false);
                setRenameValue(item.title);
              }
            }}
            className="flex-1 min-w-0 bg-foreground/10 border border-bridge-accent/50 rounded px-2 py-1 text-[15px] text-foreground focus:outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={`flex-1 min-w-0 truncate ${isFolder ? "font-medium" : ""}`}
          >
            {item.title}
          </span>
        )}

        {/* 폴더 안으로 드롭 중임을 명확히 알리는 라벨 */}
        {isInsideTarget && (
          <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-md bg-bridge-accent/20 text-bridge-accent">
            {t("notes.moveInto", "안으로")}
          </span>
        )}

        {/* 접힌 폴더의 자식 개수 배지 — 펼치지 않아도 내용량 파악 */}
        {isFolder && hasChildren && !expanded && !isInsideTarget && (
          <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent group-hover:hidden">
            {item.children!.length}
          </span>
        )}

        {/* 파일 용량 — 노트와 파일을 한눈에 구분 */}
        {isFile && file && (
          <span className="flex-shrink-0 text-xs text-slate-500 tabular-nums group-hover:hidden">
            {formatFileSize(file.file_size)}
          </span>
        )}

        {/* 파일 메뉴 — 다운로드 · 공유 · 삭제 */}
        {isFile && file && fileActions && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-0.5 hover:bg-foreground/10 rounded"
                  aria-label={t("library.fileMenu", "파일 메뉴")}
                >
                  <MoreHorizontal size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={4}
                className="bg-bridge-obsidian border-foreground/10 rounded-lg shadow-xl min-w-[160px]"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={() => fileActions.onDownload(file)}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                >
                  <Download size={14} /> {t("library.download", "다운로드")}
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem
                    onClick={() => fileActions.onToggleShare(file)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                  >
                    <Link2 size={14} />{" "}
                    {file.is_shared
                      ? t("library.unshare", "공유 해제")
                      : t("library.share", "공유 링크")}
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <>
                    <DropdownMenuSeparator className="border-foreground/[0.08]" />
                    <DropdownMenuItem
                      onClick={() => {
                        if (
                          window.confirm(
                            t(
                              "library.confirmDeleteFile",
                              "이 파일을 휴지통으로 옮길까요?",
                            ),
                          )
                        ) {
                          fileActions.onDelete(file);
                        }
                      }}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 size={14} /> {t("common.delete", "삭제")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Context Menu */}
        {canEdit && !renaming && !isFile && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-0.5 hover:bg-foreground/10 rounded"
                >
                  <MoreHorizontal size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={4}
                className="bg-bridge-obsidian border-foreground/10 rounded-lg shadow-xl min-w-[160px]"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={() => {
                    setRenaming(true);
                    setRenameValue(item.title);
                  }}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                >
                  <Pencil size={14} /> {t("notes.rename", "이름 변경")}
                </DropdownMenuItem>
                {onDuplicate && (
                  <DropdownMenuItem
                    onClick={() => onDuplicate(item.id)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                  >
                    <Copy size={14} /> {t("notes.duplicate", "복제")}
                  </DropdownMenuItem>
                )}
                {item.depth < MAX_DEPTH && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onCreateDocument(item.id)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                    >
                      <FilePlus size={14} />{" "}
                      {t("notes.newDocumentInFolder", "문서 추가")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onCreateBoard(item.id)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                    >
                      <PenTool size={14} /> {t("notes.addBoard", "보드 추가")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onCreateFolder(item.id)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
                    >
                      <FolderPlus size={14} />{" "}
                      {t("notes.newSubfolder", "하위 폴더")}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator className="border-foreground/[0.08]" />
                <DropdownMenuItem
                  onClick={() => {
                    if (
                      window.confirm(
                        t("notes.confirmDelete", "정말 삭제하시겠습니까?"),
                      )
                    ) {
                      onDelete(item.id);
                    }
                  }}
                  className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 cursor-pointer"
                >
                  <Trash2 size={14} /> {t("common.delete", "삭제")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* 'inside-first' indicator — 첫 자식 위치(자식 indent)에 선 표시 */}
      {isInsideFirstTarget && <DropLine indent={(depth + 1) * 20 + 8} />}

      {/* After drop indicator line — 자식이 보이지 않을 때만 행 바로 아래 표시 */}
      {isAfterTarget && !(expanded && hasChildren) && (
        <DropLine indent={indentPx} />
      )}

      {/* Children — 좌측 세로 가이드 레일로 계층 소속을 시각화 */}
      {expanded && hasChildren && (
        <div className="relative">
          <span
            aria-hidden
            className="absolute top-0 bottom-0 w-px bg-foreground/[0.10] pointer-events-none"
            style={{ left: indentPx + 9 }}
          />
          <SiblingGroup
            items={item.children}
            parentId={item.id}
            selectedNoteId={selectedNoteId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onCreateDocument={onCreateDocument}
            onCreateBoard={onCreateBoard}
            onDelete={onDelete}
            onRename={onRename}
            onDuplicate={onDuplicate}
            canEdit={canEdit}
            depth={depth + 1}
            activeId={activeId}
            dropTarget={dropTarget}
            collapsedIds={collapsedIds}
            onToggleExpand={onToggleExpand}
            onAutoExpand={onAutoExpand}
          />
        </div>
      )}

      {/* After drop indicator — 펼쳐진 서브트리 뒤로 가는 경우 서브트리 끝에 표시 */}
      {isAfterTarget && expanded && hasChildren && (
        <DropLine indent={indentPx} />
      )}
    </div>
  );
}

// ===== Board Note Section (read-only, collapsible) =====

function BoardNoteGroup({
  section,
  selectedNoteId,
  searchQuery,
  onSelect,
  defaultExpanded,
}: {
  section: BoardNoteSection;
  selectedNoteId: string | null;
  searchQuery: string;
  onSelect: (noteId: string) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Auto-expand when search query matches
  useEffect(() => {
    if (searchQuery) setExpanded(true);
  }, [searchQuery]);

  return (
    <div className="mt-3">
      {/* Board section header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2 py-2 text-xs font-bold text-slate-400 hover:text-foreground transition-colors rounded-lg hover:bg-foreground/5"
      >
        <ChevronRight
          size={12}
          className={`transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
        <LayoutDashboard
          size={14}
          className="flex-shrink-0 text-bridge-accent"
        />
        <span className="truncate">{section.board_name}</span>
        <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent flex-shrink-0">
          {section.note_count}
        </span>
      </button>

      {/* Board notes tree (read-only) */}
      {expanded && (
        <div className="ml-1">
          {section.tree.map((item) => (
            <ReadOnlyTreeItem
              key={item.id}
              item={item}
              depth={0}
              selectedNoteId={selectedNoteId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReadOnlyTreeItem({
  item,
  depth,
  selectedNoteId,
  onSelect,
}: {
  item: NoteTreeItem;
  depth: number;
  selectedNoteId: string | null;
  onSelect: (noteId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const isFolder = item.type === "FOLDER";
  const isSelected = selectedNoteId === item.id;
  const hasChildren = item.children && item.children.length > 0;
  const indentPx = depth * 20 + 28; // extra indent for board section

  const handleClick = () => {
    if (hasChildren || isFolder) setExpanded(!expanded);
    onSelect(item.id);
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all duration-150 text-[14px] ${
          isSelected
            ? "bg-bridge-accent/15 text-foreground"
            : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        }`}
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={handleClick}
      >
        {/* Expand/Collapse */}
        {isFolder || hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex-shrink-0 p-0.5 hover:bg-foreground/10 rounded"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        {/* Icon */}
        {isFolder ? (
          item.system_key ? (
            <FolderClock
              size={16}
              className="flex-shrink-0 text-bridge-secondary"
            />
          ) : expanded ? (
            <FolderOpen
              size={16}
              className="flex-shrink-0 text-bridge-accent"
            />
          ) : (
            <Folder size={16} className="flex-shrink-0 text-bridge-accent" />
          )
        ) : item.type === "BOARD" ? (
          <PenTool size={16} className="flex-shrink-0 text-bridge-secondary" />
        ) : (
          <FileText size={16} className="flex-shrink-0 text-slate-400" />
        )}

        {/* Title */}
        <span className="flex-1 min-w-0 truncate">{item.title}</span>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {item.children.map((child) => (
            <ReadOnlyTreeItem
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedNoteId={selectedNoteId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function filterTree(items: NoteTreeItem[], query: string): NoteTreeItem[] {
  return items.reduce<NoteTreeItem[]>((acc, item) => {
    const titleMatch = item.title.toLowerCase().includes(query);
    const tagMatch = item.tags?.some((t) =>
      t.name.toLowerCase().includes(query),
    );
    const filteredChildren = filterTree(item.children || [], query);

    if (titleMatch || tagMatch || filteredChildren.length > 0) {
      acc.push({
        ...item,
        children:
          filteredChildren.length > 0 ? filteredChildren : item.children,
      });
    }
    return acc;
  }, []);
}
