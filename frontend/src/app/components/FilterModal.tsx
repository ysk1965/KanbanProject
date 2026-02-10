import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import {
  User,
  Calendar,
  Tag as TagIcon,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  Search,
  X,
  Layers,
  Users,
} from 'lucide-react';
import { Tag, Feature } from '../types';
import { Button } from './ui/button';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';

export interface FilterOptions {
  keyword: string;
  members: string[];
  features: string[];
  tags: string[];
  cardStatus: ('completed' | 'incomplete')[];
  dueDate: ('no-date' | 'overdue' | 'next-day' | 'next-week' | 'next-month')[];
}

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  onApplyFilter: (filters: FilterOptions) => void;
  availableMembers: string[];
  availableTags: Tag[];
  availableFeatures: Feature[];
  currentFilters: FilterOptions;
  memberColorMap?: Record<string, string | null>;
}

type TabType = 'quick' | 'members' | 'features' | 'status' | 'labels';

export function FilterModal({
  open,
  onClose,
  onApplyFilter,
  availableMembers,
  availableTags,
  availableFeatures,
  currentFilters,
  memberColorMap,
}: FilterModalProps) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<FilterOptions>(currentFilters);
  const [activeTab, setActiveTab] = useState<TabType>('quick');

  useEffect(() => {
    if (open) {
      setFilters(currentFilters);
    }
  }, [open, currentFilters]);

  const handleToggleMember = (member: string) => {
    setFilters((prev) => {
      const currentMembers = prev.members || [];
      const exists = currentMembers.includes(member);
      return {
        ...prev,
        members: exists
          ? currentMembers.filter((m) => m !== member)
          : [...currentMembers, member],
      };
    });
  };

  const handleToggleFeature = (featureId: string) => {
    setFilters((prev) => {
      const currentFeatures = prev.features || [];
      const exists = currentFeatures.includes(featureId);
      return {
        ...prev,
        features: exists
          ? currentFeatures.filter((f) => f !== featureId)
          : [...currentFeatures, featureId],
      };
    });
  };

  const handleToggleTag = (tagId: string) => {
    setFilters((prev) => {
      const currentTags = prev.tags || [];
      const exists = currentTags.includes(tagId);
      return {
        ...prev,
        tags: exists
          ? currentTags.filter((t) => t !== tagId)
          : [...currentTags, tagId],
      };
    });
  };

  const handleToggleCardStatus = (status: 'completed' | 'incomplete') => {
    setFilters((prev) => {
      const currentStatus = prev.cardStatus || [];
      const exists = currentStatus.includes(status);
      return {
        ...prev,
        cardStatus: exists
          ? currentStatus.filter((s) => s !== status)
          : [...currentStatus, status],
      };
    });
  };

  const handleToggleDueDate = (
    date: 'no-date' | 'overdue' | 'next-day' | 'next-week' | 'next-month'
  ) => {
    setFilters((prev) => {
      const currentDates = prev.dueDate || [];
      const exists = currentDates.includes(date);
      return {
        ...prev,
        dueDate: exists
          ? currentDates.filter((d) => d !== date)
          : [...currentDates, date],
      };
    });
  };

  const handleApply = () => {
    onApplyFilter(filters);
    onClose();
  };

  const handleClear = () => {
    const emptyFilters: FilterOptions = {
      keyword: '',
      members: [],
      features: [],
      tags: [],
      cardStatus: [],
      dueDate: [],
    };
    setFilters(emptyFilters);
    onApplyFilter(emptyFilters);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.keyword) count++;
    count += filters.members.length;
    count += filters.features.length;
    count += filters.tags.length;
    count += filters.cardStatus.length;
    count += filters.dueDate.length;
    return count;
  };

  const isFilterActive = getActiveFilterCount() > 0;

  // 퀵 필터 프리셋
  const quickFilters = [
    {
      id: 'assigned-to-me',
      label: t('filter.assignedToMe'),
      icon: <User className="h-3.5 w-3.5" />,
      isActive: filters.members.includes('__current_user__'),
      onClick: () => handleToggleMember('__current_user__'),
      color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      activeColor: 'bg-indigo-500 text-white border-indigo-500',
    },
    {
      id: 'overdue',
      label: t('filter.overdue'),
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      isActive: filters.dueDate.includes('overdue'),
      onClick: () => handleToggleDueDate('overdue'),
      color: 'bg-red-500/20 text-red-400 border-red-500/30',
      activeColor: 'bg-red-500 text-white border-red-500',
    },
    {
      id: 'due-soon',
      label: t('filter.dueSoon'),
      icon: <Clock className="h-3.5 w-3.5" />,
      isActive: filters.dueDate.includes('next-day'),
      onClick: () => handleToggleDueDate('next-day'),
      color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      activeColor: 'bg-orange-500 text-white border-orange-500',
    },
    {
      id: 'incomplete',
      label: t('filter.incomplete'),
      icon: <Circle className="h-3.5 w-3.5" />,
      isActive: filters.cardStatus.includes('incomplete'),
      onClick: () => handleToggleCardStatus('incomplete'),
      color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      activeColor: 'bg-yellow-500 text-white border-yellow-500',
    },
    {
      id: 'completed',
      label: t('filter.completed'),
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      isActive: filters.cardStatus.includes('completed'),
      onClick: () => handleToggleCardStatus('completed'),
      color: 'bg-green-500/20 text-green-400 border-green-500/30',
      activeColor: 'bg-green-500 text-white border-green-500',
    },
  ];

  const tabs = [
    { id: 'quick' as TabType, label: t('filter.quickFilter'), icon: <Clock className="h-4 w-4" /> },
    { id: 'members' as TabType, label: t('filter.assignee'), icon: <Users className="h-4 w-4" />, count: filters.members.length },
    { id: 'features' as TabType, label: 'Feature', icon: <Layers className="h-4 w-4" />, count: filters.features.length },
    { id: 'status' as TabType, label: t('filter.statusDue'), icon: <Calendar className="h-4 w-4" />, count: filters.cardStatus.length + filters.dueDate.length },
    { id: 'labels' as TabType, label: t('filter.label'), icon: <TagIcon className="h-4 w-4" />, count: filters.tags.length },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-kanban-bg text-foreground border-kanban-border p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b border-kanban-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-foreground text-lg font-semibold">{t('filter.title')}</DialogTitle>
            {isFilterActive && (
              <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30">
                {t('filter.activeCount', { count: getActiveFilterCount() })}
              </Badge>
            )}
          </div>
          <DialogDescription className="sr-only">
            {t('filter.description')}
          </DialogDescription>
        </DialogHeader>

        {/* 검색바 */}
        <div className="px-4 py-3 border-b border-kanban-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              placeholder={t('filter.searchPlaceholder')}
              className="pl-9 bg-kanban-card border-kanban-border text-foreground placeholder:text-zinc-400 h-9"
            />
            {filters.keyword && (
              <button
                onClick={() => setFilters({ ...filters, keyword: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex border-b border-kanban-border px-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-indigo-500/20 text-indigo-400">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="p-4 min-h-[280px] max-h-[360px] overflow-y-auto">
          {/* 빠른 필터 탭 */}
          {activeTab === 'quick' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">{t('filter.quickFilterDesc')}</p>
              <div className="flex flex-wrap gap-2">
                {quickFilters.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={filter.onClick}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      filter.isActive ? filter.activeColor : filter.color
                    } hover:opacity-90`}
                  >
                    {filter.icon}
                    {filter.label}
                  </button>
                ))}
              </div>

              {/* 이번 주 마감 */}
              <div className="pt-2">
                <p className="text-xs text-zinc-400 mb-2">{t('filter.dueDate')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleToggleDueDate('no-date')}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-all ${
                      filters.dueDate.includes('no-date')
                        ? 'bg-gray-500 text-white border-gray-500'
                        : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                    }`}
                  >
                    {t('filter.noDate')}
                  </button>
                  <button
                    onClick={() => handleToggleDueDate('next-week')}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-all ${
                      filters.dueDate.includes('next-week')
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                    }`}
                  >
                    {t('filter.thisWeek')}
                  </button>
                  <button
                    onClick={() => handleToggleDueDate('next-month')}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-all ${
                      filters.dueDate.includes('next-month')
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                    }`}
                  >
                    {t('filter.thisMonth')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 담당자 탭 */}
          {activeTab === 'members' && (
            <div className="space-y-3">
              {/* 기본 옵션 */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleToggleMember('__no_members__')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    filters.members.includes('__no_members__')
                      ? 'bg-gray-500 text-white border-gray-500'
                      : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                  }`}
                >
                  <User className="h-4 w-4 text-zinc-400" />
                  {t('filter.noAssignee')}
                </button>
                <button
                  onClick={() => handleToggleMember('__current_user__')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    filters.members.includes('__current_user__')
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/30'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-[10px] text-white font-bold">
                    {t('filter.meShort')}
                  </div>
                  {t('filter.assignedToMe')}
                </button>
              </div>

              {/* 멤버 목록 */}
              {availableMembers.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-400 mb-2">{t('filter.teamMembers')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {availableMembers.map((member) => (
                      <button
                        key={member}
                        onClick={() => handleToggleMember(member)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                          filters.members.includes(member)
                            ? 'bg-white/10 text-white border-white/20'
                            : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0 whitespace-nowrap overflow-hidden"
                          style={{ backgroundColor: getAssigneeHex(member, memberColorMap?.[member]) }}
                        >
                          {getInitials(member)}
                        </div>
                        <span className="truncate">{member}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {availableMembers.length === 0 && (
                <p className="text-sm text-zinc-400 text-center py-4">
                  {t('filter.noTeamMembers')}
                </p>
              )}
            </div>
          )}

          {/* Feature 탭 */}
          {activeTab === 'features' && (
            <div className="space-y-3">
              <button
                onClick={() => handleToggleFeature('__no_feature__')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                  filters.features.includes('__no_feature__')
                    ? 'bg-gray-500 text-white border-gray-500'
                    : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                }`}
              >
                <Circle className="h-4 w-4 text-zinc-400" />
                {t('filter.noFeature')}
              </button>

              {availableFeatures.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-400 mb-2">{t('filter.selectFeature')}</p>
                  <div className="space-y-1.5">
                    {availableFeatures.map((feature) => (
                      <button
                        key={feature.id}
                        onClick={() => handleToggleFeature(feature.id)}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                          filters.features.includes(feature.id)
                            ? 'bg-purple-500/20 border-purple-500 text-white'
                            : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: feature.color || '#8B5CF6' }}
                        />
                        <span className="truncate flex-1">{feature.title}</span>
                        {filters.features.includes(feature.id) && (
                          <CheckCircle2 className="h-4 w-4 text-purple-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {availableFeatures.length === 0 && (
                <p className="text-sm text-zinc-400 text-center py-4">
                  {t('filter.noFeatures')}
                </p>
              )}
            </div>
          )}

          {/* 상태/마감 탭 */}
          {activeTab === 'status' && (
            <div className="space-y-4">
              {/* 완료 상태 */}
              <div>
                <p className="text-xs text-zinc-400 mb-2">{t('filter.completionStatus')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleCardStatus('completed')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm flex-1 justify-center transition-all ${
                      filters.cardStatus.includes('completed')
                        ? 'bg-green-500 text-white border-green-500'
                        : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {t('filter.completed')}
                  </button>
                  <button
                    onClick={() => handleToggleCardStatus('incomplete')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm flex-1 justify-center transition-all ${
                      filters.cardStatus.includes('incomplete')
                        ? 'bg-yellow-500 text-white border-yellow-500'
                        : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                    }`}
                  >
                    <Circle className="h-4 w-4" />
                    {t('filter.incomplete')}
                  </button>
                </div>
              </div>

              {/* 마감일 */}
              <div>
                <p className="text-xs text-zinc-400 mb-2">{t('filter.dueDate')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleToggleDueDate('no-date')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                      filters.dueDate.includes('no-date')
                        ? 'bg-gray-500 text-white border-gray-500'
                        : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                    }`}
                  >
                    <Calendar className="h-4 w-4 text-zinc-400" />
                    {t('filter.noDate')}
                  </button>
                  <button
                    onClick={() => handleToggleDueDate('overdue')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                      filters.dueDate.includes('overdue')
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                    }`}
                  >
                    <AlertCircle className="h-4 w-4" />
                    {t('filter.overdue')}
                  </button>
                  <button
                    onClick={() => handleToggleDueDate('next-day')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                      filters.dueDate.includes('next-day')
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30'
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    {t('filter.byTomorrow')}
                  </button>
                  <button
                    onClick={() => handleToggleDueDate('next-week')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                      filters.dueDate.includes('next-week')
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    {t('filter.thisWeek')}
                  </button>
                  <button
                    onClick={() => handleToggleDueDate('next-month')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm col-span-2 transition-all ${
                      filters.dueDate.includes('next-month')
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    {t('filter.thisMonth')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 라벨 탭 */}
          {activeTab === 'labels' && (
            <div className="space-y-3">
              <button
                onClick={() => handleToggleTag('__no_labels__')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                  filters.tags.includes('__no_labels__')
                    ? 'bg-gray-500 text-white border-gray-500'
                    : 'bg-kanban-surface text-zinc-300 border-kanban-border hover:bg-white/5'
                }`}
              >
                <TagIcon className="h-4 w-4 text-zinc-400" />
                {t('filter.noLabel')}
              </button>

              {availableTags.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-400 mb-2">{t('filter.selectLabel')}</p>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => handleToggleTag(tag.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          filters.tags.includes(tag.id)
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-kanban-bg'
                            : 'hover:opacity-80'
                        }`}
                        style={{ backgroundColor: tag.color }}
                      >
                        <span className="text-white">{tag.name}</span>
                        {filters.tags.includes(tag.id) && (
                          <CheckCircle2 className="h-4 w-4 text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {availableTags.length === 0 && (
                <p className="text-sm text-zinc-400 text-center py-4">
                  {t('filter.noLabels')}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 선택된 필터 요약 & 액션 */}
        <div className="px-4 py-3 border-t border-kanban-border bg-kanban-card">
          {/* 선택된 필터 표시 */}
          {isFilterActive && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {filters.members.map((member) => (
                <Badge
                  key={member}
                  className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 gap-1 pr-1"
                >
                  {member === '__current_user__' ? t('filter.assignedToMe') : member === '__no_members__' ? t('filter.noAssignee') : member}
                  <button onClick={() => handleToggleMember(member)} className="hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {filters.features.map((featureId) => {
                const feature = availableFeatures.find((f) => f.id === featureId);
                return (
                  <Badge
                    key={featureId}
                    className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 gap-1 pr-1"
                  >
                    {featureId === '__no_feature__' ? t('filter.noFeature') : feature?.title || featureId}
                    <button onClick={() => handleToggleFeature(featureId)} className="hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
              {filters.cardStatus.map((status) => (
                <Badge
                  key={status}
                  className={`gap-1 pr-1 ${
                    status === 'completed'
                      ? 'bg-green-500/20 text-green-400 border-green-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                  }`}
                >
                  {status === 'completed' ? t('filter.completed') : t('filter.incomplete')}
                  <button onClick={() => handleToggleCardStatus(status)} className="hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {filters.dueDate.map((date) => (
                <Badge
                  key={date}
                  className={`gap-1 pr-1 ${
                    date === 'overdue'
                      ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : 'bg-gray-500/20 text-zinc-400 border-gray-500/30'
                  }`}
                >
                  {date === 'no-date' ? t('filter.noDate') :
                   date === 'overdue' ? t('filter.overdue') :
                   date === 'next-day' ? t('filter.byTomorrow') :
                   date === 'next-week' ? t('filter.thisWeek') : t('filter.thisMonth')}
                  <button onClick={() => handleToggleDueDate(date)} className="hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {filters.tags.map((tagId) => {
                const tag = availableTags.find((t) => t.id === tagId);
                return (
                  <Badge
                    key={tagId}
                    className="gap-1 pr-1"
                    style={{ backgroundColor: tag?.color || '#6b7280' }}
                  >
                    <span className="text-white">
                      {tagId === '__no_labels__' ? t('filter.noLabel') : tag?.name || tagId}
                    </span>
                    <button onClick={() => handleToggleTag(tagId)} className="hover:text-white/80">
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={!isFilterActive}
              className="flex-1 border-kanban-border text-zinc-300 hover:bg-white/5 disabled:opacity-50"
            >
              {t('filter.reset')}
            </Button>
            <Button onClick={handleApply} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
              {t('filter.apply')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
