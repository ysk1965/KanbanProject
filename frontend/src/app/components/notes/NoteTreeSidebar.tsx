import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, MoreHorizontal, Pencil, Trash2, FolderPlus, FilePlus, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import type { NoteTreeItem } from '../../utils/api';

interface NoteTreeSidebarProps {
  tree: NoteTreeItem[];
  selectedNoteId: string | null;
  searchQuery: string;
  onSelect: (noteId: string) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onCreateDocument: (parentId?: string | null) => void;
  onDelete: (noteId: string) => void;
  onRename: (noteId: string, newTitle: string) => void;
  onMove: (noteId: string, parentId: string | null, position: number) => void;
  canEdit: boolean;
}

type DropZone = 'before' | 'inside' | 'after';

interface DropTargetInfo {
  id: string;
  zone: DropZone;
}

const MAX_DEPTH = 4; // depth 0~4 = 5 levels

function getMaxSubtreeDepth(item: NoteTreeItem): number {
  if (!item.children || item.children.length === 0) return 0;
  return 1 + Math.max(...item.children.map(getMaxSubtreeDepth));
}

export function NoteTreeSidebar({
  tree,
  selectedNoteId,
  searchQuery,
  onSelect,
  onCreateFolder,
  onCreateDocument,
  onDelete,
  onRename,
  onMove,
  canEdit,
}: NoteTreeSidebarProps) {
  const [activeItem, setActiveItem] = useState<NoteTreeItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTargetInfo | null>(null);
  const dropTargetRef = useRef<DropTargetInfo | null>(null);
  const pointerYRef = useRef<number>(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const filteredTree = searchQuery ? filterTree(tree, searchQuery.toLowerCase()) : tree;

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
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [activeItem]);

  const handleDragStart = (event: DragStartEvent) => {
    const item = flatMap.get(event.active.id as string);
    if (item) setActiveItem(item);
    // Initialize pointer Y from activator event to avoid stale 0 value
    if (event.activatorEvent instanceof PointerEvent) {
      pointerYRef.current = event.activatorEvent.clientY;
    }
  };

  const calculateDropZone = (
    overItem: NoteTreeItem,
    rect: { top: number; height: number },
    pointerY: number,
    draggedItem: NoteTreeItem,
  ): DropZone => {
    const ratio = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height));

    let zone: DropZone;
    // All items (folders & documents) support inside drop (Notion-style)
    if (ratio < 0.25) zone = 'before';
    else if (ratio > 0.75) zone = 'after';
    else zone = 'inside';

    // Depth validation: prevent nesting if it would exceed max depth
    if (zone === 'inside') {
      const maxSubDepth = getMaxSubtreeDepth(draggedItem);
      if (overItem.depth + 1 + maxSubDepth > MAX_DEPTH) {
        zone = ratio < 0.5 ? 'before' : 'after';
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

    if (overId === 'root-drop-zone') {
      setDropTargetBoth({ id: 'root-drop-zone', zone: 'inside' });
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

    const zone = calculateDropZone(overItem, over.rect, pointerYRef.current, activeItem);
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

    if (overId === 'root-drop-zone') {
      onMove(dragged.id, null, 9999);
      return;
    }

    if (overId === dragged.id || isDescendant(dragged.id, overId)) return;

    const targetItem = flatMap.get(overId);
    if (!targetItem) return;

    const zone = calculateDropZone(targetItem, over.rect, pointerYRef.current, dragged);

    const getSiblings = () =>
      targetItem.parent_id
        ? flatMap.get(targetItem.parent_id)?.children || []
        : tree;

    switch (zone) {
      case 'before': {
        const siblings = getSiblings();
        const targetIndex = siblings.findIndex(s => s.id === overId);
        onMove(dragged.id, targetItem.parent_id, targetIndex);
        break;
      }
      case 'inside': {
        onMove(dragged.id, overId, 9999);
        break;
      }
      case 'after': {
        const siblings = getSiblings();
        const targetIndex = siblings.findIndex(s => s.id === overId);
        onMove(dragged.id, targetItem.parent_id, targetIndex + 1);
        break;
      }
    }
  };

  if (filteredTree.length === 0) {
    return (
      <div className="text-center text-slate-500 text-xs py-8">
        {searchQuery ? '검색 결과가 없습니다' : '노트가 없습니다'}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <RootDropZone isOver={dropTarget?.id === 'root-drop-zone'} canEdit={canEdit}>
        <div>
          <SiblingGroup
            items={filteredTree}
            parentId={null}
            selectedNoteId={selectedNoteId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onCreateDocument={onCreateDocument}
            onDelete={onDelete}
            onRename={onRename}
            canEdit={canEdit}
            depth={0}
            activeId={activeItem?.id ?? null}
            dropTarget={dropTarget}
          />
        </div>
      </RootDropZone>

      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <div className="flex items-center gap-2.5 px-3 py-2 bg-bridge-obsidian border border-bridge-accent/50 rounded-lg shadow-lg text-[15px] text-white opacity-90">
            {activeItem.type === 'FOLDER' ? (
              <Folder size={18} className="text-bridge-accent" />
            ) : (
              <FileText size={18} className="text-slate-400" />
            )}
            <span className="truncate max-w-[200px]">{activeItem.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function SiblingGroup({
  items, parentId, selectedNoteId, onSelect, onCreateFolder, onCreateDocument,
  onDelete, onRename, canEdit, depth, activeId, dropTarget,
}: {
  items: NoteTreeItem[];
  parentId: string | null;
  selectedNoteId: string | null;
  onSelect: (noteId: string) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onCreateDocument: (parentId?: string | null) => void;
  onDelete: (noteId: string) => void;
  onRename: (noteId: string, newTitle: string) => void;
  canEdit: boolean;
  depth: number;
  activeId: string | null;
  dropTarget: DropTargetInfo | null;
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
          onDelete={onDelete}
          onRename={onRename}
          canEdit={canEdit}
          depth={depth}
          activeId={activeId}
          dropTarget={dropTarget}
        />
      ))}
    </>
  );
}

function RootDropZone({ isOver, canEdit, children }: { isOver: boolean; canEdit: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'root-drop-zone', disabled: !canEdit });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[40px] rounded-lg transition-colors ${isOver ? 'bg-bridge-accent/10 ring-1 ring-bridge-accent/30' : ''}`}
    >
      {children}
    </div>
  );
}

interface TreeItemComponentProps {
  item: NoteTreeItem;
  selectedNoteId: string | null;
  onSelect: (noteId: string) => void;
  onCreateFolder: (parentId?: string | null) => void;
  onCreateDocument: (parentId?: string | null) => void;
  onDelete: (noteId: string) => void;
  onRename: (noteId: string, newTitle: string) => void;
  canEdit: boolean;
  depth: number;
  activeId: string | null;
  dropTarget: DropTargetInfo | null;
}

function TreeItemComponent({
  item,
  selectedNoteId,
  onSelect,
  onCreateFolder,
  onCreateDocument,
  onDelete,
  onRename,
  canEdit,
  depth,
  activeId,
  dropTarget,
}: TreeItemComponentProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.title);

  const isFolder = item.type === 'FOLDER';
  const isSelected = selectedNoteId === item.id;
  const hasChildren = item.children && item.children.length > 0;
  const isDragging = activeId === item.id;

  // Drop zone indicators
  const isBeforeTarget = dropTarget?.id === item.id && dropTarget?.zone === 'before';
  const isInsideTarget = dropTarget?.id === item.id && dropTarget?.zone === 'inside';
  const isAfterTarget = dropTarget?.id === item.id && dropTarget?.zone === 'after';

  // Auto-expand collapsed items when dragging over "inside" zone
  useEffect(() => {
    if (isInsideTarget && !expanded) {
      const timer = setTimeout(() => setExpanded(true), 600);
      return () => clearTimeout(timer);
    }
  }, [isInsideTarget, expanded]);

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: item.id,
    disabled: !canEdit || renaming,
  });

  // All items are droppable (before/inside/after)
  const { setNodeRef: setDropRef } = useDroppable({
    id: item.id,
    disabled: !canEdit || activeId === item.id,
  });

  // Combine drag + drop refs on the row element
  const setRef = useCallback((node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  }, [setDragRef, setDropRef]);

  const handleClick = () => {
    if (hasChildren || isFolder) setExpanded(!expanded);
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
    <div className={isDragging ? 'opacity-30' : ''}>
      {/* Before drop indicator line */}
      {isBeforeTarget && (
        <div
          className="h-0.5 rounded-full bg-bridge-accent my-0.5"
          style={{ marginLeft: indentPx, marginRight: 8 }}
        />
      )}

      {/* Item row — draggable + droppable */}
      <div
        ref={setRef}
        className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 text-[15px] ${
          isInsideTarget
            ? 'bg-bridge-accent/20 text-white'
            : isSelected
              ? 'bg-bridge-accent/15 text-white'
              : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
        style={{
          paddingLeft: `${indentPx}px`,
          ...(isInsideTarget ? {
            boxShadow: '0 0 16px rgba(99,102,241,0.5), inset 0 0 0 1.5px rgba(99,102,241,0.6)',
          } : {}),
        }}
        {...attributes}
        {...listeners}
        onClick={handleClick}
      >
        {/* Drag handle */}
        {canEdit && !renaming && (
          <span className="flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical size={14} />
          </span>
        )}

        {/* Expand/Collapse */}
        {(isFolder || hasChildren) ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="flex-shrink-0 p-0.5 hover:bg-white/10 rounded"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="w-6 flex-shrink-0" />
        )}

        {/* Icon */}
        {isFolder ? (
          expanded ? <FolderOpen size={18} className="flex-shrink-0 text-bridge-accent" /> : <Folder size={18} className="flex-shrink-0 text-bridge-accent" />
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
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(item.title); }
            }}
            className="flex-1 min-w-0 bg-white/10 border border-bridge-accent/50 rounded px-2 py-1 text-[15px] text-white focus:outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 min-w-0 truncate">{item.title}</span>
        )}

        {/* Context Menu */}
        {canEdit && !renaming && (
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              className="p-0.5 hover:bg-white/10 rounded"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-bridge-obsidian border border-white/10 rounded-lg shadow-xl py-1.5 min-w-[160px]">
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameValue(item.title); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    <Pencil size={14} /> {t('notes.rename', '이름 변경')}
                  </button>
                  {item.depth < MAX_DEPTH && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCreateDocument(item.id); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      >
                        <FilePlus size={14} /> {t('notes.newDocumentInFolder', '문서 추가')}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCreateFolder(item.id); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      >
                        <FolderPlus size={14} /> {t('notes.newSubfolder', '하위 폴더')}
                      </button>
                    </>
                  )}
                  <div className="border-t border-white/5 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(t('notes.confirmDelete', '정말 삭제하시겠습니까?'))) {
                        onDelete(item.id);
                      }
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 size={14} /> {t('common.delete', '삭제')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* After drop indicator line */}
      {isAfterTarget && (
        <div
          className="h-0.5 rounded-full bg-bridge-accent my-0.5"
          style={{ marginLeft: indentPx, marginRight: 8 }}
        />
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          <SiblingGroup
            items={item.children}
            parentId={item.id}
            selectedNoteId={selectedNoteId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onCreateDocument={onCreateDocument}
            onDelete={onDelete}
            onRename={onRename}
            canEdit={canEdit}
            depth={depth + 1}
            activeId={activeId}
            dropTarget={dropTarget}
          />
        </div>
      )}
    </div>
  );
}

function filterTree(items: NoteTreeItem[], query: string): NoteTreeItem[] {
  return items.reduce<NoteTreeItem[]>((acc, item) => {
    const titleMatch = item.title.toLowerCase().includes(query);
    const tagMatch = item.tags?.some(t => t.name.toLowerCase().includes(query));
    const filteredChildren = filterTree(item.children || [], query);

    if (titleMatch || tagMatch || filteredChildren.length > 0) {
      acc.push({
        ...item,
        children: filteredChildren.length > 0 ? filteredChildren : item.children,
      });
    }
    return acc;
  }, []);
}
