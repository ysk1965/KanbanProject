import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, MoreHorizontal, Edit3, Trash2, Images, Share2, GripVertical } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import type { OrgPhotoTab } from '../../../types';

interface PhotoAlbumBarProps {
  albums: OrgPhotoTab[];
  activeAlbumId: string | null;
  onSelectAlbum: (id: string | null) => void;
  totalCount: number;
  isAdmin: boolean;
  onCreateAlbum: () => void;
  onEditAlbum: (album: OrgPhotoTab) => void;
  onDeleteAlbum: (album: OrgPhotoTab) => void;
  onShareAlbum: (album: OrgPhotoTab) => void;
  onReorderAlbums?: (reorderedAlbums: OrgPhotoTab[]) => void;
}

function SortableAlbumTab({
  album,
  activeAlbumId,
  isAdmin,
  isDragActive,
  onSelectAlbum,
  onOpenMenu,
}: {
  album: OrgPhotoTab;
  activeAlbumId: string | null;
  isAdmin: boolean;
  isDragActive: boolean;
  onSelectAlbum: (id: string) => void;
  onOpenMenu: (albumId: string, el: HTMLSpanElement) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: album.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative flex-shrink-0 flex items-center">
      {isAdmin && (
        <span
          {...attributes}
          {...listeners}
          className={`p-1 rounded cursor-grab active:cursor-grabbing text-slate-500 hover:text-foreground transition-colors ${isDragActive ? 'opacity-100' : 'opacity-0 group-hover/bar:opacity-100'}`}
        >
          <GripVertical size={12} />
        </span>
      )}
      <button
        onClick={() => onSelectAlbum(album.id)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
          activeAlbumId === album.id
            ? 'bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/30'
            : 'text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-transparent'
        }`}
      >
        {album.name}
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
          activeAlbumId === album.id
            ? 'bg-bridge-accent/20 text-bridge-accent'
            : 'bg-foreground/10 text-slate-500'
        }`}>
          {album.photo_count}
        </span>
        {isAdmin && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onOpenMenu(album.id, e.currentTarget);
            }}
            className="ml-0.5 p-0.5 rounded hover:bg-foreground/10 transition-colors"
          >
            <MoreHorizontal size={13} />
          </span>
        )}
      </button>
    </div>
  );
}

export function PhotoAlbumBar({
  albums,
  activeAlbumId,
  onSelectAlbum,
  totalCount,
  isAdmin,
  onCreateAlbum,
  onEditAlbum,
  onDeleteAlbum,
  onShareAlbum,
  onReorderAlbums,
}: PhotoAlbumBarProps) {
  const { t } = useTranslation();
  const [menuAlbumId, setMenuAlbumId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const openMenu = useCallback((albumId: string, triggerEl: HTMLSpanElement) => {
    if (menuAlbumId === albumId) {
      setMenuAlbumId(null);
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left });
    setMenuAlbumId(albumId);
  }, [menuAlbumId]);

  // Close menu on outside click or scroll
  useEffect(() => {
    if (!menuAlbumId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAlbumId(null);
      }
    };
    const scrollHandler = () => setMenuAlbumId(null);
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', scrollHandler, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', scrollHandler, true);
    };
  }, [menuAlbumId]);

  const menuAlbum = menuAlbumId ? albums.find((a) => a.id === menuAlbumId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setMenuAlbumId(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = albums.findIndex((a) => a.id === active.id);
    const newIndex = albums.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(albums, oldIndex, newIndex);
    onReorderAlbums?.(reordered);
  }, [albums, onReorderAlbums]);

  const activeAlbum = activeId ? albums.find((a) => a.id === activeId) : null;

  const albumContent = (
    <SortableContext items={albums.map((a) => a.id)} strategy={horizontalListSortingStrategy}>
      {albums.map((album) => (
        <SortableAlbumTab
          key={album.id}
          album={album}
          activeAlbumId={activeAlbumId}
          isAdmin={isAdmin}
          isDragActive={activeId !== null}
          onSelectAlbum={onSelectAlbum}
          onOpenMenu={openMenu}
        />
      ))}
    </SortableContext>
  );

  return (
    <div className="group/bar flex items-center gap-1 py-3 overflow-x-auto custom-scrollbar">
      {/* "All" virtual tab */}
      <button
        onClick={() => onSelectAlbum(null)}
        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
          activeAlbumId === null
            ? 'bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/30'
            : 'text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-transparent'
        }`}
      >
        <Images size={14} />
        {t('photoGallery.allPhotos', 'All')}
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
          activeAlbumId === null
            ? 'bg-bridge-accent/20 text-bridge-accent'
            : 'bg-foreground/10 text-slate-500'
        }`}>
          {totalCount}
        </span>
      </button>

      {/* Album list with drag & drop */}
      {isAdmin ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {albumContent}
          <DragOverlay>
            {activeAlbum && (
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/30 shadow-2xl shadow-bridge-accent/20 whitespace-nowrap">
                <GripVertical size={12} />
                {activeAlbum.name}
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/20 text-bridge-accent">
                  {activeAlbum.photo_count}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        albums.map((album) => (
          <div key={album.id} className="relative flex-shrink-0">
            <button
              onClick={() => onSelectAlbum(album.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                activeAlbumId === album.id
                  ? 'bg-bridge-accent/15 text-bridge-accent border border-bridge-accent/30'
                  : 'text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-transparent'
              }`}
            >
              {album.name}
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                activeAlbumId === album.id
                  ? 'bg-bridge-accent/20 text-bridge-accent'
                  : 'bg-foreground/10 text-slate-500'
              }`}>
                {album.photo_count}
              </span>
            </button>
          </div>
        ))
      )}

      {/* Add album button — ADMIN only */}
      {isAdmin && (
        <button
          onClick={onCreateAlbum}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-dashed border-foreground/[0.12] transition-all shrink-0"
          title={t('photoGallery.createAlbum', 'Create album')}
        >
          <Plus size={14} />
          <span className="hidden md:inline">{t('photoGallery.newAlbum', 'New Album')}</span>
        </button>
      )}

      {/* Context menu — rendered via portal to avoid overflow clipping */}
      {menuAlbum && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] bg-bridge-obsidian border border-foreground/[0.08] rounded-xl shadow-2xl overflow-hidden"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <button
            onClick={() => {
              setMenuAlbumId(null);
              onShareAlbum(menuAlbum);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-foreground/5 transition-colors"
          >
            <Share2 size={13} className={menuAlbum.is_shared ? 'text-bridge-accent' : 'text-slate-400'} />
            {t('photoGallery.shareAlbum', 'Share')}
            {menuAlbum.is_shared && (
              <span className="ml-auto text-xs font-bold px-1 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">ON</span>
            )}
          </button>
          <button
            onClick={() => {
              setMenuAlbumId(null);
              onEditAlbum(menuAlbum);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-foreground hover:bg-foreground/5 transition-colors"
          >
            <Edit3 size={13} className="text-slate-400" />
            {t('photoGallery.editAlbum', 'Edit')}
          </button>
          <button
            onClick={() => {
              setMenuAlbumId(null);
              onDeleteAlbum(menuAlbum);
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} />
            {t('photoGallery.deleteAlbum', 'Delete')}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
