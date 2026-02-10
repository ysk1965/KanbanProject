import { useRef, useState, useMemo, useEffect } from 'react';
import { Task, Tag, Feature, ChecklistItem } from '../types';
import { Calendar, Clock, ChevronDown, ChevronUp, CheckSquare, Check } from 'lucide-react';
import { checklistAPI } from '../utils/api';
import { useDragContext } from '../contexts/DragContext';
import { getAssigneeHex, getInitials } from '../utils/assigneeColor';
import { useTranslation } from 'react-i18next';

// 클릭으로 인정할 최대 이동 거리 (픽셀)
const CLICK_THRESHOLD = 5;

interface DraggableCardProps {
  task: Task;
  blockId: string;
  index: number;
  onClick?: () => void;
  availableTags?: Tag[];
  features?: Feature[];
  boardId?: string | null;
  isChecklistExpanded?: boolean;
  onToggleChecklistExpand?: (taskId: string) => void;
  // 부모로부터 전달받는 체크리스트 데이터 (배치 로드용)
  checklistData?: ChecklistItem[];
  memberColorMap?: Record<string, string | null>;
  showFeatureLabel?: boolean;
  isScheduled?: boolean;
}

export function DraggableCard({
  task,
  blockId,
  index,
  onClick,
  availableTags = [],
  features = [],
  boardId,
  isChecklistExpanded = false,
  onToggleChecklistExpand,
  checklistData,
  memberColorMap,
  showFeatureLabel = false,
}: DraggableCardProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // 부모에서 전달받은 체크리스트 데이터를 사용하거나 로컬 상태 사용
  const [localChecklistItems, setLocalChecklistItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // 부모에서 전달받은 데이터가 있으면 사용, 없으면 로컬 상태 사용
  const checklistItems = checklistData || localChecklistItems;
  const hasLoaded = checklistData !== undefined || localChecklistItems.length > 0;

  // 클릭 vs 드래그 판별을 위한 마우스 위치 추적
  const mouseStartRef = useRef<{ x: number; y: number } | null>(null);
  const wasDraggedRef = useRef(false);

  const { state, startTaskDrag, endTaskDrag } = useDragContext();

  // 현재 이 카드가 드래그 중인지 확인
  const isThisCardDragging = state.draggedTask?.id === task.id;

  // 마우스 다운 - 시작 위치 기록
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // 버튼 클릭은 무시
    if ((e.target as HTMLElement).closest('button')) return;

    mouseStartRef.current = { x: e.clientX, y: e.clientY };
    wasDraggedRef.current = false;
  };

  // 드래그 시작
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    // 버튼에서 시작된 드래그는 취소
    if ((e.target as HTMLElement).closest('button')) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/task', task.id);
    e.dataTransfer.setData('text/plain', task.id);

    if (ref.current) {
      e.dataTransfer.setDragImage(ref.current, 20, 20);
    }

    wasDraggedRef.current = true;
    setIsDragging(true);
    startTaskDrag(task, blockId);
  };

  // 드래그 종료
  const handleDragEnd = () => {
    setIsDragging(false);
    endTaskDrag();
  };

  // 클릭 처리 - 드래그가 아닌 경우에만
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 버튼 클릭은 무시
    if ((e.target as HTMLElement).closest('button')) return;

    // 드래그였으면 클릭 무시
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false;
      return;
    }

    // 마우스 이동 거리 체크
    if (mouseStartRef.current) {
      const dx = Math.abs(e.clientX - mouseStartRef.current.x);
      const dy = Math.abs(e.clientY - mouseStartRef.current.y);

      // threshold 이내면 클릭으로 처리
      if (dx <= CLICK_THRESHOLD && dy <= CLICK_THRESHOLD) {
        onClick?.();
      }
    }

    mouseStartRef.current = null;
  };

  const taskTags = task.tags || [];

  // 연결된 Feature 찾기 (task has feature_id now)
  const linkedFeature = features.find((f) => f.id === task.feature_id);

  // Feature 색상 (기본값: indigo)
  const featureColor = linkedFeature?.color || '#6366F1';

  // Task 이름만 추출 (Feature이름 - Task이름 형식인 경우)
  const getTaskOnlyTitle = (title: string) => {
    if (linkedFeature && title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts.length > 1) {
        return parts.slice(1).join(' - '); // Feature이름 이후 부분만 반환
      }
    }
    return title;
  };
  const displayTitle = getTaskOnlyTitle(task.title);

  // 마감일 포맷팅
  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}. ${month}. ${day}.`;
  };

  // 마감일이 임박했는지 확인
  const isOverdue = (dateString: string) => {
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  const isDueSoon = (dateString: string) => {
    const dueDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    return dueDate >= today && dueDate <= threeDaysLater;
  };

  // 체크리스트 로드 (부모에서 데이터가 전달되지 않은 경우에만 사용)
  const loadChecklist = async () => {
    // 부모에서 데이터가 전달되면 개별 API 호출하지 않음
    if (!boardId || checklistData !== undefined) return;

    setIsLoading(true);
    try {
      const response = await checklistAPI.getChecklist(boardId, task.id);
      const items: ChecklistItem[] = response.items.map((item) => ({
        id: item.id,
        title: item.title,
        completed: item.completed,
        position: item.position,
        due_date: item.due_date,
        assignee: item.assignee ? { id: item.assignee.id, name: item.assignee.name } : null,
      }));
      setLocalChecklistItems(items);
    } catch (error) {
      console.error('Failed to load checklist:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 확장 버튼 클릭 핸들러
  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleChecklistExpand?.(task.id);
  };

  // 체크리스트 토글 (로컬 상태 사용 시에만 동작, 부모 데이터 사용 시 낙관적 업데이트 후 API 호출)
  const handleToggleItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!boardId) return;

    // 로컬 상태를 사용하는 경우에만 직접 업데이트
    if (checklistData === undefined) {
      setLocalChecklistItems(
        localChecklistItems.map((item) =>
          item.id === itemId ? { ...item, completed: !item.completed } : item
        )
      );
    }

    try {
      await checklistAPI.toggleItem(boardId, task.id, itemId);
    } catch (error) {
      console.error('Failed to toggle checklist item:', error);
      // 롤백 (로컬 상태 사용 시에만)
      if (checklistData === undefined) {
        setLocalChecklistItems(
          localChecklistItems.map((item) =>
            item.id === itemId ? { ...item, completed: !item.completed } : item
          )
        );
      }
    }
  };

  const completedCount = checklistItems.filter((item) => item.completed).length;
  const hasChecklist = (task.checklist_total ?? 0) > 0;

  // 체크리스트 펼칠 때 데이터가 없으면 자동 로드
  useEffect(() => {
    if (isChecklistExpanded && hasChecklist && boardId && checklistData === undefined && localChecklistItems.length === 0 && !isLoading) {
      loadChecklist();
    }
  }, [isChecklistExpanded]);

  // 모든 담당자 수집 (task 담당자 + 체크리스트 담당자)
  const allAssignees = useMemo(() => {
    const assigneeMap = new Map<string, { id: string; name: string }>();

    // task 담당자 추가
    if (task.assignee) {
      assigneeMap.set(task.assignee.id, { id: task.assignee.id, name: task.assignee.name });
    }

    // 체크리스트 담당자 추가
    checklistItems.forEach((item) => {
      if (item.assignee && !assigneeMap.has(item.assignee.id)) {
        assigneeMap.set(item.assignee.id, { id: item.assignee.id, name: item.assignee.name });
      }
    });

    return Array.from(assigneeMap.values());
  }, [task.assignee, checklistItems]);

  // 드래그 중인 다른 카드가 있으면 이 카드는 pointer-events: none (이벤트가 블록으로 직접 전달됨)
  const shouldDisablePointerEvents = state.draggedTask && state.draggedTask.id !== task.id;

  return (
    <div
      ref={ref}
      data-task-id={task.id}
      data-task-index={index}
      draggable={!shouldDisablePointerEvents}
      className={`group relative bg-kanban-card-hover rounded-xl border border-kanban-border px-3 py-2.5 hover:border-[#2DD4BF]/40 hover:shadow-2xl hover:shadow-[#2DD4BF]/10 transition-all cursor-pointer overflow-hidden kanban-glow select-none ${
        isDragging || isThisCardDragging
          ? 'opacity-30 scale-95 border-2 border-dashed border-[#2DD4BF]'
          : ''
      } ${task.completed ? 'opacity-60' : ''} ${
        shouldDisablePointerEvents ? 'pointer-events-none' : ''
      }`}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragEnter={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
      }}
    >
      {/* 좌측 컬러 바 */}
      <div
        className="absolute top-0 left-0 bottom-0 w-1.5"
        style={{ backgroundColor: featureColor }}
      />

      {/* 완료 체크 배지 */}
      {task.completed && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_8px_rgba(34,197,94,0.4)]">
          <Check className="w-3 h-3 text-white" strokeWidth={3} />
        </div>
      )}

      {/* 제목 영역 */}
      <div className="mb-2 pl-2.5">
        {/* Feature 표시: showFeatureLabel이면 뱃지를 윗줄에, 아니면 dot + 제목 한 줄 */}
        {linkedFeature ? (
          (showFeatureLabel || isChecklistExpanded) ? (
            <div className="flex flex-col gap-1">
              <span
                className="text-[9px] font-bold px-1.5 py-px rounded-full border self-start"
                style={{
                  backgroundColor: `${featureColor}15`,
                  borderColor: `${featureColor}44`,
                  color: featureColor,
                }}
              >
                {linkedFeature.title}
              </span>
              <h4 className="font-bold text-foreground text-[13px] leading-snug group-hover:text-[#2DD4BF] transition-colors line-clamp-2">
                {displayTitle}
              </h4>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: featureColor }}
                title={linkedFeature.title}
              />
              <h4 className="font-bold text-foreground text-[13px] leading-snug group-hover:text-[#2DD4BF] transition-colors truncate">
                {displayTitle}
              </h4>
            </div>
          )
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: task.completed ? '#22c55e' : featureColor }}
            />
            <h4 className="font-bold text-foreground text-[13px] leading-snug group-hover:text-[#2DD4BF] transition-colors truncate">
              {displayTitle}
            </h4>
          </div>
        )}
      </div>

      {/* 태그 표시 (펼쳐졌을 때만) */}
      {isChecklistExpanded && taskTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 pl-2.5">
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

      {/* 마감일 표시 */}
      {task.due_date && (
        <div className="flex items-center gap-1.5 mb-2 pl-2.5">
          <Calendar size={12} className={`${
            isOverdue(task.due_date) ? 'text-red-400' : isDueSoon(task.due_date) ? 'text-amber-400' : 'text-amber-400'
          }`} />
          <span className={`text-[11px] font-bold ${
            isOverdue(task.due_date) ? 'text-red-300' : isDueSoon(task.due_date) ? 'text-amber-300' : 'text-amber-300'
          }`}>
            {formatDueDate(task.due_date)}
          </span>
        </div>
      )}

      {/* 체크리스트 & 담당자 */}
      <div className="flex items-center justify-between border-t border-kanban-border pt-2 pl-2.5">
        <div className="flex items-center gap-3">
          {hasChecklist && boardId && (
            <button
              onClick={handleExpandClick}
              className="flex items-center gap-2 text-zinc-400 hover:text-foreground transition-colors"
            >
              <CheckSquare size={12} className="text-indigo-400" />
              <div className="flex items-center gap-2">
                <div className="w-12 h-1 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{
                      width: `${hasLoaded
                        ? (checklistItems.length > 0 ? (completedCount / checklistItems.length) * 100 : 0)
                        : ((task.checklist_total ?? 0) > 0 ? ((task.checklist_completed ?? 0) / (task.checklist_total ?? 0)) * 100 : 0)
                      }%`
                    }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-zinc-300">
                  {hasLoaded ? `${completedCount}/${checklistItems.length}` : `${task.checklist_completed ?? 0}/${task.checklist_total ?? 0}`}
                </span>
              </div>
              {isChecklistExpanded ? (
                <ChevronUp size={12} className="text-zinc-400" />
              ) : (
                <ChevronDown size={12} className="text-zinc-400" />
              )}
            </button>
          )}
        </div>

        {/* 담당자들 */}
        {allAssignees.length > 0 && (
          <div className="flex items-center">
            <div className="flex items-center -space-x-2">
              {allAssignees.slice(0, 3).map((assignee, index) => (
                <div
                  key={assignee.id}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-kanban-card-hover whitespace-nowrap overflow-hidden"
                  style={{
                    backgroundColor: getAssigneeHex(assignee.name, memberColorMap?.[assignee.id]),
                    zIndex: 3 - index,
                  }}
                  title={assignee.name}
                >
                  {getInitials(assignee.name)}
                </div>
              ))}
              {allAssignees.length > 3 && (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white bg-zinc-600 border-2 border-kanban-card-hover"
                  style={{ zIndex: 0 }}
                  title={allAssignees.slice(3).map(a => a.name).join(', ')}
                >
                  +{allAssignees.length - 3}
                </div>
              )}
            </div>
            {allAssignees.length === 1 && (
              <span className="text-[10px] font-medium text-zinc-400 ml-1.5">{allAssignees[0].name}</span>
            )}
          </div>
        )}
      </div>

      {/* 체크리스트 펼침 */}
      {isChecklistExpanded && hasChecklist && boardId && (
        <div className="mt-2 pt-2 border-t border-kanban-border space-y-1 pl-2.5">
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
                        : 'bg-transparent border-zinc-500 hover:border-zinc-400'
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
                      item.completed ? 'text-zinc-400 line-through' : 'text-zinc-300'
                    }`}
                  >
                    {item.title}
                  </span>
                  {item.assignee && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 border border-white/20 whitespace-nowrap overflow-hidden"
                      style={{ backgroundColor: getAssigneeHex(item.assignee.name, item.assignee?.id ? memberColorMap?.[item.assignee.id] : undefined) }}
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
