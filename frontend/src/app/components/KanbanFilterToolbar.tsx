import { Search, X, User, ChevronDown, CheckCircle2, Circle, Layers, ChevronsDownUp, ChevronsUpDown, Tag as TagIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Feature, Task, Tag } from '../types';
import { BoardMember as ShareBoardMember } from './ShareBoardModal';
import { FilterOptions } from './FilterModal';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';

interface KanbanFilterToolbarProps {
  filterOptions: FilterOptions;
  onFilterChange: (options: FilterOptions) => void;
  features: Feature[];
  tags: Tag[];
  boardMembersData: ShareBoardMember[];
  tasks: Task[];
  // Expand/Collapse
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function KanbanFilterToolbar({
  filterOptions, onFilterChange,
  features, tags, boardMembersData, tasks,
  onExpandAll, onCollapseAll,
}: KanbanFilterToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="px-3 md:px-6 py-2 md:py-3 border-b border-bridge-border flex items-center gap-2 overflow-x-auto md:overflow-x-visible md:flex-wrap kanban-scrollbar">
      {/* 검색 */}
      <div className="relative w-52 sm:w-80 shrink-0">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder={t('kanban.searchPlaceholder')}
          value={filterOptions.keyword}
          onChange={(e) => onFilterChange({ ...filterOptions, keyword: e.target.value })}
          className="w-full bg-bridge-surface-hover border border-bridge-border rounded-lg py-2 pl-10 pr-8 text-sm text-foreground placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-bridge-secondary/40 focus:border-bridge-secondary/40 transition-all"
        />
        {filterOptions.keyword && (
          <button
            onClick={() => onFilterChange({ ...filterOptions, keyword: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-foreground transition-colors"
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
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all shrink-0 ${
              filterOptions.members.length > 0
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                : 'bg-bridge-surface-hover border border-bridge-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
            }`}
          >
            <User size={14} />
            <span className="hidden sm:inline">{t('kanban.assignee')}</span>
            {filterOptions.members.length > 0 && (
              <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                {filterOptions.members.length}
              </span>
            )}
            <ChevronDown size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 bg-bridge-surface border-bridge-border" align="start">
          <div className="space-y-1">
            <button
              onClick={() => {
                const exists = filterOptions.members.includes('__no_members__');
                onFilterChange({
                  ...filterOptions,
                  members: exists
                    ? filterOptions.members.filter(m => m !== '__no_members__')
                    : [...filterOptions.members, '__no_members__']
                });
              }}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                filterOptions.members.includes('__no_members__')
                  ? 'bg-zinc-600 text-foreground'
                  : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              <Circle size={14} className="text-zinc-400" />
              {t('kanban.noAssignee')}
            </button>
            {boardMembersData.map((member) => (
              <button
                key={member.id}
                onClick={() => {
                  const exists = filterOptions.members.includes(member.name);
                  onFilterChange({
                    ...filterOptions,
                    members: exists
                      ? filterOptions.members.filter(m => m !== member.name)
                      : [...filterOptions.members, member.name]
                  });
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                  filterOptions.members.includes(member.name)
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold whitespace-nowrap overflow-hidden"
                  style={{ backgroundColor: getAssigneeHex(member.name, member.assigneeColor) }}
                >
                  {getInitials(member.name)}
                </div>
                <span className="truncate">{member.name}</span>
                {filterOptions.members.includes(member.name) && (
                  <CheckCircle2 size={14} className="ml-auto text-bridge-secondary" />
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
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all shrink-0 ${
              filterOptions.features.length > 0
                ? 'bg-bridge-secondary/15 text-bridge-secondary border border-bridge-secondary/40'
                : 'bg-bridge-surface-hover border border-bridge-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
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
        <PopoverContent className="w-64 p-2 bg-bridge-surface border-bridge-border max-h-80 overflow-y-auto" align="start">
          <div className="space-y-1">
            {features.map((feature) => (
              <button
                key={feature.id}
                onClick={() => {
                  const exists = filterOptions.features.includes(feature.id);
                  onFilterChange({
                    ...filterOptions,
                    features: exists
                      ? filterOptions.features.filter(f => f !== feature.id)
                      : [...filterOptions.features, feature.id]
                  });
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                  filterOptions.features.includes(feature.id)
                    ? 'bg-bridge-secondary/15 text-bridge-secondary'
                    : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: feature.color || '#8B5CF6' }}
                />
                <span className="truncate">{feature.title}</span>
                {filterOptions.features.includes(feature.id) && (
                  <CheckCircle2 size={14} className="ml-auto text-bridge-secondary flex-shrink-0" />
                )}
              </button>
            ))}
            {features.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-2">{t('kanban.noFeatures')}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* 라벨 필터 */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all shrink-0 ${
              filterOptions.tags.length > 0
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/50'
                : 'bg-bridge-surface-hover border border-bridge-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
            }`}
          >
            <TagIcon size={14} />
            <span className="hidden sm:inline">{t('kanban.label')}</span>
            {filterOptions.tags.length > 0 && (
              <span className="bg-teal-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                {filterOptions.tags.length}
              </span>
            )}
            <ChevronDown size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 bg-bridge-surface border-bridge-border max-h-80 overflow-y-auto" align="start">
          <div className="space-y-1">
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => {
                  const exists = filterOptions.tags.includes(tag.id);
                  onFilterChange({
                    ...filterOptions,
                    tags: exists
                      ? filterOptions.tags.filter(t => t !== tag.id)
                      : [...filterOptions.tags, tag.id]
                  });
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                  filterOptions.tags.includes(tag.id)
                    ? 'ring-1 ring-white/50'
                    : 'hover:opacity-80'
                }`}
                style={{ backgroundColor: tag.color }}
              >
                <span className="text-white truncate">{tag.name}</span>
                {filterOptions.tags.includes(tag.id) && (
                  <CheckCircle2 size={14} className="ml-auto text-white flex-shrink-0" />
                )}
              </button>
            ))}
            {tags.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-2">{t('kanban.noLabels')}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* 상태 필터 */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all shrink-0 ${
              filterOptions.cardStatus.length > 0
                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                : 'bg-bridge-surface-hover border border-bridge-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
            }`}
          >
            <CheckCircle2 size={14} />
            <span className="hidden sm:inline">{t('kanban.status')}</span>
            {filterOptions.cardStatus.length > 0 && (
              <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                {filterOptions.cardStatus.length}
              </span>
            )}
            <ChevronDown size={14} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-44 p-2 bg-bridge-surface border-bridge-border" align="start">
          <div className="space-y-1">
            <button
              onClick={() => {
                const exists = filterOptions.cardStatus.includes('completed');
                onFilterChange({
                  ...filterOptions,
                  cardStatus: exists
                    ? filterOptions.cardStatus.filter(s => s !== 'completed')
                    : [...filterOptions.cardStatus, 'completed']
                });
              }}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                filterOptions.cardStatus.includes('completed')
                  ? 'bg-green-500/20 text-green-300'
                  : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              <CheckCircle2 size={14} className="text-green-400" />
              {t('kanban.statusCompleted')}
              {filterOptions.cardStatus.includes('completed') && (
                <CheckCircle2 size={14} className="ml-auto text-green-400" />
              )}
            </button>
            <button
              onClick={() => {
                const exists = filterOptions.cardStatus.includes('incomplete');
                onFilterChange({
                  ...filterOptions,
                  cardStatus: exists
                    ? filterOptions.cardStatus.filter(s => s !== 'incomplete')
                    : [...filterOptions.cardStatus, 'incomplete']
                });
              }}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                filterOptions.cardStatus.includes('incomplete')
                  ? 'bg-yellow-500/20 text-yellow-300'
                  : 'text-zinc-300 hover:bg-white/5'
              }`}
            >
              <Circle size={14} className="text-yellow-400" />
              {t('kanban.statusIncomplete')}
              {filterOptions.cardStatus.includes('incomplete') && (
                <CheckCircle2 size={14} className="ml-auto text-yellow-400" />
              )}
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* 필터 초기화 */}
      {(filterOptions.keyword || filterOptions.members.length > 0 || filterOptions.features.length > 0 || filterOptions.tags.length > 0 || filterOptions.cardStatus.length > 0) && (
        <>
          <div className="h-6 w-px bg-bridge-border mx-1 shrink-0" />
          <button
            onClick={() => onFilterChange({ keyword: '', members: [], features: [], tags: [], cardStatus: [], dueDate: [] })}
            className="flex items-center gap-1 px-3 py-2 text-xs text-zinc-500 hover:text-foreground transition-colors shrink-0 whitespace-nowrap"
          >
            <X size={12} />
            {t('kanban.reset')}
          </button>
        </>
      )}

      {/* 스페이서 */}
      <div className="hidden md:block flex-1" />

      {/* 모두 펼치기/닫기 */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onExpandAll}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-bridge-surface-hover rounded-lg transition-colors"
          title={t('kanban.expandAll')}
        >
          <ChevronsUpDown size={14} />
          <span className="hidden sm:inline">{t('kanban.expand')}</span>
        </button>
        <button
          onClick={onCollapseAll}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-bridge-surface-hover rounded-lg transition-colors"
          title={t('kanban.collapseAll')}
        >
          <ChevronsDownUp size={14} />
          <span className="hidden sm:inline">{t('kanban.collapse')}</span>
        </button>
      </div>
    </div>
  );
}
