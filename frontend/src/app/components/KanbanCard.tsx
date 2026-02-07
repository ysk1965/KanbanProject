import { useState, useEffect } from 'react';
import { useDrag } from 'react-dnd';
import { Task, DragItem, Tag, ChecklistItem } from '../types';
import { GripVertical, ChevronDown, ChevronUp, CheckSquare, Calendar } from 'lucide-react';
import { checklistAPI } from '../utils/api';
import { getInitials } from '../utils/assigneeColor';
import { useTranslation } from 'react-i18next';

interface KanbanCardProps {
  task: Task;
  blockId: string;
  onClick?: () => void;
  availableTags?: Tag[];
  boardId?: string | null;
  featureColor?: string;
  featureTitle?: string;
}

export function KanbanCard({
  task,
  blockId,
  onClick,
  availableTags = [],
  boardId,
  featureColor,
  featureTitle,
}: KanbanCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [{ isDragging }, drag] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: 'task',
    item: { type: 'task', taskId: task.id, currentBlock: blockId },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const taskTags = availableTags.filter((tag) => task.tags?.includes(tag.id));
  const hasChecklist = (task.checklist_total ?? 0) > 0;
  const completedChecklistItems = task.checklist_completed ?? 0;
  const cardColor = featureColor || '#6366F1';

  // Task 이름만 추출 (Feature이름 - Task이름 형식인 경우)
  const getTaskOnlyTitle = (title: string) => {
    if (featureTitle && title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts.length > 1) {
        return parts.slice(1).join(' - '); // Feature이름 이후 부분만 반환
      }
    }
    return title;
  };
  const displayTitle = getTaskOnlyTitle(task.title);

  // 체크리스트 로드
  const loadChecklist = async () => {
    if (!boardId) return;

    setIsLoading(true);
    try {
      const response = await checklistAPI.getChecklist(boardId, task.id);
      const items: ChecklistItem[] = response.items.map((item) => ({
        id: item.id,
        title: item.title,
        completed: item.completed,
        position: item.position,
        due_date: item.due_date,
        start_date: item.start_date,
        done_date: item.done_date,
        assignee: item.assignee
          ? { id: item.assignee.id, name: item.assignee.name, profile_image: item.assignee.profile_image }
          : null,
      }));
      setChecklistItems(items);
      setHasLoaded(true);
    } catch (error) {
      console.error('Failed to load checklist:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 체크리스트가 있으면 자동 로드
  useEffect(() => {
    if (hasChecklist && boardId && !hasLoaded) {
      loadChecklist();
    }
  }, [hasChecklist, boardId]);

  // 체크리스트 담당자들 (중복 제거)
  const checklistAssignees = checklistItems
    .filter((item) => item.assignee)
    .reduce((acc, item) => {
      if (item.assignee && !acc.find((a) => a.id === item.assignee!.id)) {
        acc.push(item.assignee);
      }
      return acc;
    }, [] as Array<{ id: string; name: string; profile_image: string | null }>);

  // 확장 버튼 클릭 핸들러
  const handleExpandClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isExpanded && !hasLoaded) {
      await loadChecklist();
    }
    setIsExpanded(!isExpanded);
  };

  // 체크리스트 토글
  const handleToggleItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!boardId) return;

    setChecklistItems(
      checklistItems.map((item) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      )
    );

    try {
      await checklistAPI.toggleItem(boardId, task.id, itemId);
    } catch (error) {
      console.error('Failed to toggle checklist item:', error);
      setChecklistItems(
        checklistItems.map((item) =>
          item.id === itemId ? { ...item, completed: !item.completed } : item
        )
      );
    }
  };

  const completedCount = checklistItems.filter((item) => item.completed).length;

  return (
    <div
      ref={drag}
      className={`group relative bg-kanban-card-hover rounded-2xl border border-kanban-border p-5 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all cursor-pointer overflow-hidden kanban-glow ${
        isDragging ? 'opacity-50 scale-95' : ''
      } ${task.completed ? 'border-green-500/30' : ''}`}
      onClick={onClick}
    >
      {/* 좌측 컬러 바 */}
      <div
        className="absolute top-0 left-0 bottom-0 w-1.5"
        style={{ backgroundColor: task.completed ? '#22c55e' : cardColor }}
      />

      {/* 드래그 핸들 */}
      <div className="absolute top-4 left-3 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical size={14} className="text-zinc-400" />
      </div>

      {/* 제목 영역 */}
      <div className="flex items-start justify-between mb-3 pl-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Feature 표시: 닫혀있으면 동그라미, 펼쳐있으면 태그 */}
          {featureTitle ? (
            isExpanded ? (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0"
                style={{
                  backgroundColor: `${cardColor}15`,
                  borderColor: `${cardColor}44`,
                  color: cardColor,
                }}
              >
                {featureTitle}
              </span>
            ) : (
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: task.completed ? '#22c55e' : cardColor }}
                title={featureTitle}
              />
            )
          ) : (
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: task.completed ? '#22c55e' : cardColor }}
            />
          )}
          <h4 className="font-bold text-foreground text-[14px] leading-snug group-hover:text-indigo-400 transition-colors truncate">
            {displayTitle}
          </h4>
        </div>
      </div>

      {/* 기타 태그 (펼쳐졌을 때만 표시) */}
      {isExpanded && taskTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 pl-4">
          {taskTags.map((tag) => (
            <span
              key={tag.id}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{
                backgroundColor: `${tag.color}15`,
                borderColor: `${tag.color}44`,
                color: tag.color,
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {/* 마감일 */}
      {task.due_date && (
        <div className="flex items-center gap-1.5 mb-3 pl-4">
          <Calendar size={12} className="text-amber-400" />
          <span className="text-[11px] font-bold text-amber-300">{task.due_date}</span>
        </div>
      )}

      {/* 체크리스트 & 담당자 */}
      <div className="flex items-center justify-between border-t border-kanban-border pt-3 mt-1 pl-4">
        <div className="flex items-center gap-3">
          {hasChecklist && (
            <button
              onClick={handleExpandClick}
              className="flex items-center gap-1.5 text-zinc-300 hover:text-white transition-colors"
            >
              <CheckSquare size={12} />
              <span className="text-[10px] font-semibold">
                {t('kanban.checklist')} {hasLoaded ? `${completedCount}/${checklistItems.length}` : `${completedChecklistItems}/${task.checklist_total}`}
              </span>
              {isExpanded ? (
                <ChevronUp size={12} className="text-zinc-400" />
              ) : (
                <ChevronDown size={12} className="text-zinc-400" />
              )}
            </button>
          )}
        </div>

        {/* 담당자 - v7.0: ChecklistItem 담당자들만 표시 */}
        <div className="flex items-center gap-2">
          {checklistAssignees.length > 0 ? (
            <div className="flex items-center gap-1">
              {checklistAssignees.slice(0, 3).map((assignee) => (
                <div
                  key={assignee.id}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border border-white/20"
                  style={{ backgroundColor: cardColor }}
                  title={assignee.name}
                >
                  {getInitials(assignee.name)}
                </div>
              ))}
              {checklistAssignees.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300 border border-white/20">
                  +{checklistAssignees.length - 3}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 체크리스트 펼침 */}
      {isExpanded && hasChecklist && boardId && (
        <div className="mt-3 pt-3 border-t border-kanban-border space-y-1.5 pl-4">
          {isLoading ? (
            <div className="text-xs text-zinc-400">{t('common.loading')}</div>
          ) : (
            checklistItems
              .sort((a, b) => a.position - b.position)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-kanban-surface hover:bg-white/5 transition-colors"
                  onClick={(e) => handleToggleItem(e, item.id)}
                >
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                      item.completed
                        ? 'bg-green-500 border-green-500'
                        : 'bg-transparent border-zinc-400 hover:border-zinc-300'
                    }`}
                  >
                    {item.completed && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span
                    className={`text-xs flex-1 ${
                      item.completed ? 'text-zinc-400 line-through' : 'text-zinc-200'
                    }`}
                  >
                    {item.title}
                  </span>
                  {item.assignee && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 border border-white/20"
                      style={{ backgroundColor: cardColor }}
                      title={item.assignee.name}
                    >
                      {getInitials(item.assignee.name)}
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
