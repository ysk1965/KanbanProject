import { forwardRef, useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  X,
  User,
  ChevronDown,
  CheckCircle2,
  Circle,
  Layers,
  Tag as TagIcon,
  Pin,
  Plus,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Feature, Task, Tag, BoardResource } from "../types";
import { BoardMember as ShareBoardMember } from "./ShareBoardModal";
import { FilterOptions } from "./FilterModal";
import { getInitials, getAssigneeHex } from "../utils/assigneeColor";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { boardResourceAPI } from "../utils/api";
import { BoardResourceAddModal } from "./BoardResourceAddModal";

interface KanbanFilterToolbarProps {
  filterOptions: FilterOptions;
  onFilterChange: (options: FilterOptions) => void;
  features: Feature[];
  tags: Tag[];
  boardMembersData: ShareBoardMember[];
  tasks: Task[];
  boardId: string;
  canEdit: boolean;
}

export const KanbanFilterToolbar = forwardRef<
  HTMLInputElement,
  KanbanFilterToolbarProps
>(function KanbanFilterToolbar(
  {
    filterOptions,
    onFilterChange,
    features,
    tags,
    boardMembersData,
    tasks,
    boardId,
    canEdit,
  },
  ref,
) {
  const { t } = useTranslation();

  // === Resource state (from BoardResourceBar) ===
  const [resources, setResources] = useState<BoardResource[]>([]);
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

  const handleCreateResource = async (data: { title: string; url: string; description?: string }) => {
    await boardResourceAPI.createResource(boardId, data);
    await fetchResources();
  };

  const handleUpdateResource = async (data: { title: string; url: string; description?: string }) => {
    if (!editingResource) return;
    await boardResourceAPI.updateResource(boardId, editingResource.id, data);
    setEditingResource(null);
    await fetchResources();
  };

  const handleDeleteResource = async (resourceId: string) => {
    await boardResourceAPI.deleteResource(boardId, resourceId);
    setContextMenu(null);
    await fetchResources();
  };

  const handleResourceContextMenu = (e: React.MouseEvent, resource: BoardResource) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ id: resource.id, x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div className="px-3 md:px-6 py-1.5 md:py-2 border-b border-bridge-border flex items-center gap-2 overflow-x-auto md:overflow-x-visible md:flex-wrap shrink-0 custom-scrollbar">
        {/* 검색 */}
        <div className="relative w-52 sm:w-80 shrink-0">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            ref={ref}
            type="text"
            placeholder={t("kanban.searchPlaceholder")}
            value={filterOptions.keyword}
            onChange={(e) =>
              onFilterChange({ ...filterOptions, keyword: e.target.value })
            }
            className="w-full bg-bridge-surface-hover border border-bridge-border rounded-lg py-1.5 pl-10 pr-8 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-bridge-secondary/40 focus:border-bridge-secondary/40 transition-all"
          />
          {filterOptions.keyword && (
            <button
              onClick={() => onFilterChange({ ...filterOptions, keyword: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="h-6 w-px bg-bridge-border mx-1 shrink-0" />

        {/* 담당자 필터 */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all shrink-0 ${
                filterOptions.members.length > 0
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/50"
                  : "bg-bridge-surface-hover border border-bridge-border text-slate-400 hover:text-foreground hover:border-slate-600"
              }`}
            >
              <User size={14} />
              <span className="hidden sm:inline">{t("kanban.assignee")}</span>
              {filterOptions.members.length > 0 && (
                <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                  {filterOptions.members.length}
                </span>
              )}
              <ChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-56 p-2 bg-bridge-surface border-bridge-border"
            align="start"
          >
            <div className="space-y-1">
              <button
                onClick={() => {
                  const exists = filterOptions.members.includes("__no_members__");
                  onFilterChange({
                    ...filterOptions,
                    members: exists
                      ? filterOptions.members.filter(
                          (m) => m !== "__no_members__",
                        )
                      : [...filterOptions.members, "__no_members__"],
                  });
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                  filterOptions.members.includes("__no_members__")
                    ? "bg-slate-600 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5"
                }`}
              >
                <Circle size={14} className="text-slate-400" />
                {t("kanban.noAssignee")}
              </button>
              {boardMembersData.map((member) => (
                <button
                  key={member.id}
                  onClick={() => {
                    const exists = filterOptions.members.includes(member.name);
                    onFilterChange({
                      ...filterOptions,
                      members: exists
                        ? filterOptions.members.filter((m) => m !== member.name)
                        : [...filterOptions.members, member.name],
                    });
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                    filterOptions.members.includes(member.name)
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5"
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs text-white font-bold whitespace-nowrap overflow-hidden"
                    style={{
                      backgroundColor: getAssigneeHex(
                        member.name,
                        member.assigneeColor,
                      ),
                    }}
                  >
                    {getInitials(member.name)}
                  </div>
                  <span className="truncate">{member.name}</span>
                  {filterOptions.members.includes(member.name) && (
                    <CheckCircle2
                      size={14}
                      className="ml-auto text-bridge-secondary"
                    />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Feature 필터 */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all shrink-0 ${
                filterOptions.features.length > 0
                  ? "bg-bridge-secondary/15 text-bridge-secondary border border-bridge-secondary/40"
                  : "bg-bridge-surface-hover border border-bridge-border text-slate-400 hover:text-foreground hover:border-slate-600"
              }`}
            >
              <Layers size={14} />
              <span className="hidden sm:inline">Feature</span>
              {filterOptions.features.length > 0 && (
                <span className="bg-bridge-secondary text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                  {filterOptions.features.length}
                </span>
              )}
              <ChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 p-2 bg-bridge-surface border-bridge-border max-h-80 overflow-y-auto"
            align="start"
          >
            <div className="space-y-1">
              {features.map((feature) => (
                <button
                  key={feature.id}
                  onClick={() => {
                    const exists = filterOptions.features.includes(feature.id);
                    onFilterChange({
                      ...filterOptions,
                      features: exists
                        ? filterOptions.features.filter((f) => f !== feature.id)
                        : [...filterOptions.features, feature.id],
                    });
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                    filterOptions.features.includes(feature.id)
                      ? "bg-bridge-secondary/15 text-bridge-secondary"
                      : "text-muted-foreground hover:bg-foreground/5"
                  }`}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: feature.color || "#8B5CF6" }}
                  />
                  <span className="truncate">{feature.title}</span>
                  {filterOptions.features.includes(feature.id) && (
                    <CheckCircle2
                      size={14}
                      className="ml-auto text-bridge-secondary flex-shrink-0"
                    />
                  )}
                </button>
              ))}
              {features.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-2">
                  {t("kanban.noFeatures")}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* 라벨 필터 */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all shrink-0 ${
                filterOptions.tags.length > 0
                  ? "bg-teal-500/20 text-teal-400 border border-teal-500/50"
                  : "bg-bridge-surface-hover border border-bridge-border text-slate-400 hover:text-foreground hover:border-slate-600"
              }`}
            >
              <TagIcon size={14} />
              <span className="hidden sm:inline">{t("kanban.label")}</span>
              {filterOptions.tags.length > 0 && (
                <span className="bg-teal-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                  {filterOptions.tags.length}
                </span>
              )}
              <ChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-56 p-2 bg-bridge-surface border-bridge-border max-h-80 overflow-y-auto"
            align="start"
          >
            <div className="space-y-1">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => {
                    const exists = filterOptions.tags.includes(tag.id);
                    onFilterChange({
                      ...filterOptions,
                      tags: exists
                        ? filterOptions.tags.filter((t) => t !== tag.id)
                        : [...filterOptions.tags, tag.id],
                    });
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                    filterOptions.tags.includes(tag.id)
                      ? "ring-1 ring-white/50"
                      : "hover:opacity-80"
                  }`}
                  style={{ backgroundColor: tag.color }}
                >
                  <span className="text-white truncate">{tag.name}</span>
                  {filterOptions.tags.includes(tag.id) && (
                    <CheckCircle2
                      size={14}
                      className="ml-auto text-white flex-shrink-0"
                    />
                  )}
                </button>
              ))}
              {tags.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-2">
                  {t("kanban.noLabels")}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* 상태 필터 */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all shrink-0 ${
                filterOptions.cardStatus.length > 0
                  ? "bg-green-500/20 text-green-400 border border-green-500/50"
                  : "bg-bridge-surface-hover border border-bridge-border text-slate-400 hover:text-foreground hover:border-slate-600"
              }`}
            >
              <CheckCircle2 size={14} />
              <span className="hidden sm:inline">{t("kanban.status")}</span>
              {filterOptions.cardStatus.length > 0 && (
                <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                  {filterOptions.cardStatus.length}
                </span>
              )}
              <ChevronDown size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-44 p-2 bg-bridge-surface border-bridge-border"
            align="start"
          >
            <div className="space-y-1">
              <button
                onClick={() => {
                  const exists = filterOptions.cardStatus.includes("completed");
                  onFilterChange({
                    ...filterOptions,
                    cardStatus: exists
                      ? filterOptions.cardStatus.filter((s) => s !== "completed")
                      : [...filterOptions.cardStatus, "completed"],
                  });
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                  filterOptions.cardStatus.includes("completed")
                    ? "bg-green-500/20 text-green-300"
                    : "text-muted-foreground hover:bg-foreground/5"
                }`}
              >
                <CheckCircle2 size={14} className="text-green-400" />
                {t("kanban.statusCompleted")}
                {filterOptions.cardStatus.includes("completed") && (
                  <CheckCircle2 size={14} className="ml-auto text-green-400" />
                )}
              </button>
              <button
                onClick={() => {
                  const exists = filterOptions.cardStatus.includes("incomplete");
                  onFilterChange({
                    ...filterOptions,
                    cardStatus: exists
                      ? filterOptions.cardStatus.filter((s) => s !== "incomplete")
                      : [...filterOptions.cardStatus, "incomplete"],
                  });
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                  filterOptions.cardStatus.includes("incomplete")
                    ? "bg-yellow-500/20 text-yellow-300"
                    : "text-muted-foreground hover:bg-foreground/5"
                }`}
              >
                <Circle size={14} className="text-yellow-400" />
                {t("kanban.statusIncomplete")}
                {filterOptions.cardStatus.includes("incomplete") && (
                  <CheckCircle2 size={14} className="ml-auto text-yellow-400" />
                )}
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* 필터 초기화 */}
        {(filterOptions.keyword ||
          filterOptions.members.length > 0 ||
          filterOptions.features.length > 0 ||
          filterOptions.tags.length > 0 ||
          filterOptions.cardStatus.length > 0) && (
          <>
            <div className="h-6 w-px bg-bridge-border mx-1 shrink-0" />
            <button
              onClick={() =>
                onFilterChange({
                  keyword: "",
                  members: [],
                  features: [],
                  tags: [],
                  cardStatus: [],
                  dueDate: [],
                })
              }
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-foreground transition-colors shrink-0 whitespace-nowrap"
            >
              <X size={12} />
              {t("kanban.reset")}
            </button>
          </>
        )}

        {/* 스페이서 */}
        <div className="hidden md:block flex-1 min-w-4" />

        {/* 오른쪽: 리소스 영역 */}
        {(resources.length > 0 || canEdit) && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1 mr-1">
              <Pin size={12} className="text-bridge-secondary" />
              <span className="text-xs font-medium text-slate-400">{t('boardResource.title')}</span>
            </div>

            <AnimatePresence mode="popLayout">
              {resources.map((resource, index) => (
                <motion.button
                  key={resource.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => window.open(resource.url, '_blank', 'noopener,noreferrer')}
                  onContextMenu={(e) => handleResourceContextMenu(e, resource)}
                  className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-foreground/5 border border-foreground/[0.08] hover:border-foreground/[0.12] hover:bg-foreground/10 text-foreground transition-all whitespace-nowrap shrink-0"
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
                        handleResourceContextMenu(e as unknown as React.MouseEvent, resource);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          handleResourceContextMenu(e as unknown as React.MouseEvent, resource);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 ml-0.5 text-slate-400 hover:text-foreground transition-opacity"
                    >
                      <MoreHorizontal size={12} />
                    </span>
                  )}
                </motion.button>
              ))}
            </AnimatePresence>

            {canEdit && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-dashed border-foreground/[0.08] hover:border-foreground/[0.12] transition-all whitespace-nowrap shrink-0"
              >
                <Plus size={13} />
                {resources.length === 0 && <span>{t('boardResource.addFirst')}</span>}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Resource Context Menu */}
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
                handleDeleteResource(contextMenu.id);
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

      {/* Add Resource Modal */}
      <BoardResourceAddModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreateResource}
      />

      {/* Edit Resource Modal */}
      <BoardResourceAddModal
        open={!!editingResource}
        onClose={() => setEditingResource(null)}
        onSubmit={handleUpdateResource}
        editingResource={editingResource}
      />
    </>
  );
});
