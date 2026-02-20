import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Loader2, CheckSquare, ChevronDown } from 'lucide-react';
import { Clock } from 'lucide-react';
import { boardChecklistAPI, BoardChecklistItemResponse } from '../utils/api';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible';
import { MotionModal } from './ui/MotionModal';

interface ChecklistSelectModalProps {
  boardId: string;
  assigneeId: string;
  startTime: string;
  endTime: string;
  onSelect: (checklistItemId: string) => void;
  onClose: () => void;
}

export function ChecklistSelectModal({
  boardId,
  assigneeId,
  startTime,
  endTime,
  onSelect,
  onClose,
}: ChecklistSelectModalProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<BoardChecklistItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 체크리스트 아이템 로드 (스케줄되지 않은 것만)
  useEffect(() => {
    const loadItems = async () => {
      setIsLoading(true);
      try {
        const response = await boardChecklistAPI.getItems(boardId, {
          is_scheduled: false,
        });
        setItems(response.items);
      } catch (error) {
        console.error('Failed to load checklist items:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadItems();
  }, [boardId]);

  // 검색 필터링
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.task?.title.toLowerCase().includes(query) ||
        item.feature?.title.toLowerCase().includes(query)
    );
  }, [items, searchQuery]);

  // Task별로 그룹화
  const groupedItems = useMemo(() => {
    const groups = new Map<string, {
      task: { id: string; title: string } | null;
      feature: { id: string; title: string; color: string } | null;
      items: BoardChecklistItemResponse[]
    }>();

    filteredItems.forEach((item) => {
      const taskKey = item.task?.id || 'no-task';
      if (!groups.has(taskKey)) {
        groups.set(taskKey, { task: item.task, feature: item.feature, items: [] });
      }
      groups.get(taskKey)!.items.push(item);
    });

    return Array.from(groups.values());
  }, [filteredItems]);

  return (
    <MotionModal open={true} onClose={onClose} className="sm:max-w-[500px] p-0 overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bridge-border">
          <h2 className="text-xl font-semibold text-foreground">{t('checklist.selectTitle')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Time Display */}
        <div className="px-6 py-3 border-b border-bridge-border">
          <div className="bg-bridge-accent/20 rounded-lg px-4 py-2 flex items-center gap-3">
            <Clock className="h-4 w-4 text-bridge-accent" />
            <span className="text-bridge-accent font-medium text-sm">
              {startTime} - {endTime}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-bridge-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('checklist.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-foreground/5 border border-bridge-border rounded-xl text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-bridge-accent animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {searchQuery ? t('checklist.noMatchingItems') : t('checklist.noUnscheduledItems')}
            </div>
          ) : (
            <div className="space-y-3">
              {groupedItems.map((group) => (
                <Collapsible
                  key={group.task?.id || 'no-task'}
                  defaultOpen={true}
                  className="border border-bridge-border rounded-xl overflow-hidden"
                >
                  {/* Task Header - Collapsible Trigger */}
                  <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 bg-foreground/5 hover:bg-foreground/10 transition-colors group">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {group.feature && (
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: group.feature.color }}
                        />
                      )}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {group.feature && (
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {group.feature.title}
                          </span>
                        )}
                        {group.feature && group.task && (
                          <span className="text-xs text-slate-400 flex-shrink-0">/</span>
                        )}
                        {group.task ? (
                          <span className="text-sm font-medium text-muted-foreground truncate">
                            {group.task.title}
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-slate-400">
                            {t('checklist.noTask')}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 bg-foreground/10 px-2 py-0.5 rounded-full flex-shrink-0">
                        {group.items.length}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=closed]:rotate-[-90deg] flex-shrink-0 ml-2" />
                  </CollapsibleTrigger>

                  {/* Items - Collapsible Content */}
                  <CollapsibleContent>
                    <div className="p-2 space-y-2">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => onSelect(item.id)}
                          className="w-full text-left p-3 border border-bridge-border rounded-xl hover:border-bridge-accent/50 hover:bg-bridge-accent/10 transition-all group"
                        >
                          <div className="flex items-start gap-3">
                            <CheckSquare className="h-5 w-5 text-slate-400 group-hover:text-bridge-accent mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-foreground truncate">
                                {item.title}
                              </div>
                              {(item.start_date || item.due_date) && (
                                <div className="text-xs text-slate-400 mt-1">
                                  {item.start_date && `Start: ${item.start_date}`}
                                  {item.start_date && item.due_date && ' · '}
                                  {item.due_date && `Due: ${item.due_date}`}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-bridge-border bg-foreground/5">
          <p className="text-xs text-slate-400 text-center">
            {t('checklist.selectFooter')}
          </p>
        </div>
    </MotionModal>
  );
}
