import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Pin, Plus, ChevronDown, ChevronUp, ExternalLink, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { boardResourceAPI } from '../utils/api';
import { BoardResourceAddModal } from './BoardResourceAddModal';
import type { BoardResource } from '../types';

interface BoardResourceBarProps {
  boardId: string;
  canEdit: boolean;
}

export function BoardResourceBar({ boardId, canEdit }: BoardResourceBarProps) {
  const { t } = useTranslation();
  const [resources, setResources] = useState<BoardResource[]>([]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(`bridge_resource_bar_${boardId}`) === 'collapsed';
    } catch {
      return false;
    }
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingResource, setEditingResource] = useState<BoardResource | null>(null);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const fetchResources = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await boardResourceAPI.getResources(boardId);
      setResources(res.resources || []);
    } catch {
      // silently fail
    }
  }, [boardId]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    try {
      localStorage.setItem(`bridge_resource_bar_${boardId}`, collapsed ? 'collapsed' : 'expanded');
    } catch {
      // ignore
    }
  }, [collapsed, boardId]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const handleCreate = async (data: { title: string; url: string; description?: string }) => {
    await boardResourceAPI.createResource(boardId, data);
    await fetchResources();
  };

  const handleUpdate = async (data: { title: string; url: string; description?: string }) => {
    if (!editingResource) return;
    await boardResourceAPI.updateResource(boardId, editingResource.id, data);
    setEditingResource(null);
    await fetchResources();
  };

  const handleDelete = async (resourceId: string) => {
    await boardResourceAPI.deleteResource(boardId, resourceId);
    setContextMenu(null);
    await fetchResources();
  };

  const handleContextMenu = (e: React.MouseEvent, resource: BoardResource) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ id: resource.id, x: e.clientX, y: e.clientY });
  };

  const toggleCollapse = () => setCollapsed((prev) => !prev);

  // Don't render anything if no resources and can't edit
  if (resources.length === 0 && !canEdit) return null;

  return (
    <>
      <div className="shrink-0 border-b border-foreground/[0.08]">
        {/* Toggle row - always visible */}
        <div className="flex items-center px-3 md:px-6">
          <button
            onClick={toggleCollapse}
            className="flex items-center gap-1.5 py-1.5 text-slate-400 hover:text-foreground transition-colors"
            aria-label={collapsed ? t('boardResource.expand') : t('boardResource.collapse')}
          >
            <Pin size={12} className="text-bridge-secondary" />
            <span className="text-xs font-medium">{t('boardResource.title')}</span>
            {resources.length > 0 && (
              <span className="text-xs text-slate-500">({resources.length})</span>
            )}
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>

        {/* Expandable content */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 md:px-6 pb-2 overflow-x-auto custom-scrollbar">
                {resources.map((resource, index) => (
                  <motion.button
                    key={resource.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    onClick={() => window.open(resource.url, '_blank', 'noopener,noreferrer')}
                    onContextMenu={(e) => handleContextMenu(e, resource)}
                    className="group flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-foreground/5 border border-foreground/[0.08] hover:border-foreground/[0.12] hover:bg-foreground/10 text-foreground transition-all whitespace-nowrap shrink-0"
                    title={resource.description || resource.url}
                  >
                    {resource.favicon_url ? (
                      <img
                        src={resource.favicon_url}
                        alt=""
                        className="w-3.5 h-3.5 rounded-sm"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <ExternalLink size={12} className={resource.favicon_url ? 'hidden' : 'text-slate-400'} />
                    <span>{resource.title}</span>
                    {canEdit && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContextMenu(e as unknown as React.MouseEvent, resource);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            handleContextMenu(e as unknown as React.MouseEvent, resource);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 ml-0.5 text-slate-400 hover:text-foreground transition-opacity"
                      >
                        <MoreHorizontal size={12} />
                      </span>
                    )}
                  </motion.button>
                ))}

                {canEdit && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-dashed border-foreground/[0.08] hover:border-foreground/[0.12] transition-all whitespace-nowrap shrink-0"
                  >
                    <Plus size={13} />
                    {resources.length === 0 && <span>{t('boardResource.addFirst')}</span>}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const res = resources.find((r) => r.id === contextMenu.id);
              if (res) {
                setEditingResource(res);
                setContextMenu(null);
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-foreground/5 transition-colors"
          >
            <Pencil size={13} />
            {t('boardResource.editResource')}
          </button>
          <button
            onClick={() => {
              if (window.confirm(t('boardResource.deleteConfirm'))) {
                handleDelete(contextMenu.id);
              } else {
                setContextMenu(null);
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-foreground/5 transition-colors"
          >
            <Trash2 size={13} />
            {t('boardResource.deleteResource')}
          </button>
        </div>
      )}

      {/* Add Modal */}
      <BoardResourceAddModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreate}
      />

      {/* Edit Modal */}
      <BoardResourceAddModal
        open={!!editingResource}
        onClose={() => setEditingResource(null)}
        onSubmit={handleUpdate}
        editingResource={editingResource}
      />
    </>
  );
}
