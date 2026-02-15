import { useState, useCallback, Fragment } from 'react';
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
  const [overId, setOverId] = useState<string | null>(null);

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

  const handleDragStart = (event: DragStartEvent) => {
    const item = flatMap.get(event.active.id as string);
    if (item) setActiveItem(item);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const currentActive = activeItem;
    setActiveItem(null);
    setOverId(null);

    const { active, over } = event;
    if (!over || active.id === over.id || !currentActive) return;

    const draggedId = active.id as string;
    const targetId = over.id as string;

    // Prevent dropping on self or descendants
    if (isDescendant(draggedId, targetId)) return;

    // Check if target is a reorder drop indicator
    const overData = over.data?.current as { type?: string; parentId?: string | null; position?: number } | undefined;
    if (overData?.type === 'reorder') {
      // Don't move to same position
      const draggedItem = flatMap.get(draggedId);
      if (draggedItem?.parent_id === overData.parentId) {
        // Same parent: check if actually changing position
        const siblings = overData.parentId
          ? flatMap.get(overData.parentId)?.children || []
          : tree;
        const currentIndex = siblings.findIndex(s => s.id === draggedId);
        const targetPos = overData.position ?? 0;
        if (currentIndex === targetPos || currentIndex === targetPos - 1) return;
      }
      onMove(draggedId, overData.parentId ?? null, overData.position ?? 0);
      return;
    }

    // Drop on root zone
    if (targetId === 'root-drop-zone') {
      onMove(draggedId, null, 9999);
      return;
    }

    // Drop on a folder
    const target = flatMap.get(targetId);
    if (target && target.type === 'FOLDER') {
      onMove(draggedId, targetId, 9999);
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
      <RootDropZone isOver={overId === 'root-drop-zone'} canEdit={canEdit}>
        <div className="space-y-0">
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
            dragOverId={overId}
            activeId={activeItem?.id ?? null}
          />
        </div>
      </RootDropZone>

      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-bridge-obsidian border border-bridge-accent/50 rounded-md shadow-lg text-xs text-white opacity-90">
            {activeItem.type === 'FOLDER' ? (
              <Folder size={14} className="text-bridge-accent" />
            ) : (
              <FileText size={14} className="text-slate-400" />
            )}
            <span className="truncate max-w-[150px]">{activeItem.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Drop indicator between items for reordering
function DropIndicator({ id, parentId, position, isActive }: {
  id: string;
  parentId: string | null;
  position: number;
  isActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: 'reorder', parentId, position },
    disabled: !isActive,
  });

  if (!isActive) return null;

  return (
    <div
      ref={setNodeRef}
      className={`h-1 mx-1 my-0 rounded-full transition-all ${
        isOver ? 'bg-bridge-accent h-0.5 mx-2' : ''
      }`}
    />
  );
}

function SiblingGroup({
  items, parentId, selectedNoteId, onSelect, onCreateFolder, onCreateDocument,
  onDelete, onRename, canEdit, depth, dragOverId, activeId,
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
  dragOverId: string | null;
  activeId: string | null;
}) {
  const isDragging = activeId !== null;
  const parentKey = parentId || 'root';

  return (
    <>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <DropIndicator
            id={`reorder-${parentKey}-${index}`}
            parentId={parentId}
            position={index}
            isActive={isDragging}
          />
          <TreeItemComponent
            item={item}
            selectedNoteId={selectedNoteId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onCreateDocument={onCreateDocument}
            onDelete={onDelete}
            onRename={onRename}
            canEdit={canEdit}
            depth={depth}
            dragOverId={dragOverId}
            activeId={activeId}
          />
        </Fragment>
      ))}
      <DropIndicator
        id={`reorder-${parentKey}-${items.length}`}
        parentId={parentId}
        position={items.length}
        isActive={isDragging}
      />
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
  dragOverId: string | null;
  activeId: string | null;
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
  dragOverId,
  activeId,
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
  const isDropTarget = isFolder && dragOverId === item.id && activeId !== item.id;

  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({
    id: item.id,
    disabled: !canEdit || renaming,
  });

  const { setNodeRef: setDropRef, isOver: isDirectlyOver } = useDroppable({
    id: item.id,
    disabled: !canEdit || !isFolder || activeId === item.id,
  });

  const handleClick = () => {
    if (isFolder) {
      setExpanded(!expanded);
    }
    onSelect(item.id);
  };

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue.trim() !== item.title) {
      onRename(item.id, renameValue.trim());
    }
    setRenaming(false);
  };

  // Combine refs for folders (both draggable + droppable)
  const setRef = useCallback((node: HTMLElement | null) => {
    setDragRef(node);
    if (isFolder) setDropRef(node);
  }, [setDragRef, setDropRef, isFolder]);

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div ref={isFolder ? undefined : setDragRef} style={!isFolder ? style : undefined}>
      <div
        ref={isFolder ? setRef : undefined}
        style={isFolder ? style : undefined}
        className={`group flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors text-xs ${
          isDragging
            ? 'opacity-30'
            : isDropTarget || isDirectlyOver
              ? 'bg-bridge-accent/20 ring-1 ring-bridge-accent/40 text-white'
              : isSelected
                ? 'bg-bridge-accent/15 text-white'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
        style={{ ...style, paddingLeft: `${depth * 16 + 6}px` }}
        {...attributes}
        {...listeners}
        onClick={handleClick}
      >
        {/* Drag handle indicator */}
        {canEdit && !renaming && (
          <span className="flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical size={10} />
          </span>
        )}

        {/* Expand/Collapse for folders */}
        {isFolder ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="flex-shrink-0 p-0.5 hover:bg-white/10 rounded"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Icon */}
        {isFolder ? (
          expanded ? <FolderOpen size={14} className="flex-shrink-0 text-bridge-accent" /> : <Folder size={14} className="flex-shrink-0 text-bridge-accent" />
        ) : (
          <FileText size={14} className="flex-shrink-0 text-slate-400" />
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
            className="flex-1 min-w-0 bg-white/10 border border-bridge-accent/50 rounded px-1 py-0.5 text-xs text-white focus:outline-none"
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
              <MoreHorizontal size={12} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-bridge-obsidian border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px]">
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameValue(item.title); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    <Pencil size={12} /> {t('notes.rename', '이름 변경')}
                  </button>
                  {isFolder && item.depth < 4 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCreateDocument(item.id); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
                      >
                        <FilePlus size={12} /> {t('notes.newDocumentInFolder', '문서 추가')}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCreateFolder(item.id); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
                      >
                        <FolderPlus size={12} /> {t('notes.newSubfolder', '하위 폴더')}
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 size={12} /> {t('common.delete', '삭제')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {isFolder && expanded && hasChildren && (
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
            dragOverId={dragOverId}
            activeId={activeId}
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
