import { useRef, useCallback, memo } from 'react';
import { Block, Task, Tag, Feature, ChecklistItem } from '../types';
import { DraggableCard } from './DraggableCard';
import { GripVertical, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { useDragContext } from '../contexts/DragContext';

interface KanbanBlockProps {
  block: Block;
  tasks: Task[];
  features?: Feature[];
  availableTags?: Tag[];
  onMoveTask: (taskId: string, targetBlock: string, newOrder: number) => void;
  onReorderTask: (taskId: string, blockId: string, newPosition: number) => void;
  onTaskClick?: (task: Task) => void;
  onEditBlock?: () => void;
  onDeleteBlock?: () => void;
  onMoveBlockLeft?: () => void;
  onMoveBlockRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  boardId?: string | null;
  expandedChecklistTaskIds?: Set<string>;
  onToggleChecklistExpand?: (taskId: string) => void;
  // Block drag and drop
  blockIndex?: number;
  onMoveBlockDrag?: (dragIndex: number, hoverIndex: number) => void;
  // 배치 로드된 체크리스트 데이터
  checklistDataMap?: { [taskId: string]: ChecklistItem[] };
  memberColorMap?: Record<string, string | null>;
  showFeatureLabel?: boolean;
  scheduledTaskIds?: Set<string>;
}

export const KanbanBlock = memo(function KanbanBlock({
  block,
  tasks,
  features,
  availableTags = [],
  onMoveTask,
  onReorderTask,
  onTaskClick,
  onEditBlock,
  onDeleteBlock,
  boardId,
  expandedChecklistTaskIds,
  onToggleChecklistExpand,
  blockIndex = 0,
  onMoveBlockDrag,
  checklistDataMap,
  memberColorMap,
  showFeatureLabel,
  scheduledTaskIds,
}: KanbanBlockProps) {
  const { t } = useTranslation();
  const blockRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const taskContainerRef = useRef<HTMLDivElement>(null);
  const dragOverThrottleRef = useRef<number>(0);

  const {
    state,
    startBlockDrag,
    updateBlockPlaceholder,
    clearBlockPlaceholder,
    endBlockDrag,
    updateTaskPlaceholder,
    clearTaskPlaceholder,
    endTaskDrag,
  } = useDragContext();

  const isCustomBlock = block.type === 'CUSTOM';
  const isFixedBlock = block.type === 'FIXED';

  // 현재 이 블록이 드래그 중인지 확인
  const isThisBlockDragging = state.draggedBlock?.id === block.id;

  // 플레이스홀더가 이 블록에 표시되어야 하는지 확인
  const taskPlaceholderInThisBlock = state.taskPlaceholder?.blockId === block.id;
  const placeholderIndex = state.taskPlaceholder?.index ?? -1;

  // 블록 드래그 시작
  const handleBlockDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isCustomBlock) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/block', block.id);

    if (blockRef.current) {
      e.dataTransfer.setDragImage(blockRef.current, 140, 20);
    }

    startBlockDrag(block, blockIndex);
  };

  // 블록 드래그 종료
  const handleBlockDragEnd = () => {
    endBlockDrag();
  };

  // Task 드래그 오버 핸들러 - Y좌표로 플레이스홀더 위치 계산
  const handleTaskDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Task 드래그인지 확인
    if (!e.dataTransfer.types.includes('application/task')) {
      return;
    }

    // 16ms 쓰로틀 (약 60fps)
    const now = Date.now();
    if (now - dragOverThrottleRef.current < 16) {
      return;
    }
    dragOverThrottleRef.current = now;

    const draggedTask = state.draggedTask;
    if (!draggedTask) return;

    const container = taskContainerRef.current;
    if (!container) return;

    // 모든 카드의 위치 정보 수집 (드래그 중인 것 포함)
    const children = container.querySelectorAll('[data-task-id]');
    let insertIndex = tasks.length; // 기본값: 맨 끝

    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      const taskId = child.getAttribute('data-task-id');
      const rect = child.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      // 커서가 카드의 중간보다 위에 있으면 그 위치에 삽입
      if (e.clientY < midY) {
        // 드래그 중인 카드면 건너뛰고 그 다음 인덱스 사용
        if (taskId === draggedTask.id) {
          continue;
        }
        insertIndex = i;
        break;
      }
    }

    updateTaskPlaceholder(block.id, insertIndex);
  }, [state.draggedTask, block.id, tasks.length, updateTaskPlaceholder]);

  // Task 드래그 리브 핸들러 - placeholder는 drop/dragend에서만 정리
  const handleTaskDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // dragleave에서는 placeholder를 정리하지 않음
    // 다른 블록으로 이동하면 그 블록의 dragover에서 새 placeholder가 설정됨
  }, []);

  // Task 드롭 핸들러
  const handleTaskDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const taskId = e.dataTransfer.getData('application/task');
    if (!taskId) return;

    // 플레이스홀더가 있으면 그 위치로 이동
    const placeholder = state.taskPlaceholder;
    if (!placeholder || placeholder.blockId !== block.id) {
      // 플레이스홀더가 없거나 다른 블록의 플레이스홀더면, 맨 끝에 추가
      onMoveTask(taskId, block.id, tasks.length);
      clearTaskPlaceholder();
      endTaskDrag();
      return;
    }

    const insertIndex = placeholder.index;

    // 같은 블록 내 이동인지 확인
    const draggedOriginalIndex = tasks.findIndex(t => t.id === taskId);
    const isSameBlock = draggedOriginalIndex !== -1;

    if (!isSameBlock) {
      // 다른 블록에서 이동
      onMoveTask(taskId, block.id, insertIndex);
    } else {
      // 같은 블록 내에서 이동
      // 같은 위치면 이동 불필요
      if (draggedOriginalIndex === insertIndex) {
        clearTaskPlaceholder();
        endTaskDrag();
        return;
      }

      // 아래로 이동하는 경우 position 조정
      let newPosition = insertIndex;
      if (insertIndex > draggedOriginalIndex) {
        newPosition = insertIndex - 1;
      }

      onReorderTask(taskId, block.id, newPosition);
    }

    clearTaskPlaceholder();
    endTaskDrag();
  }, [state.taskPlaceholder, block.id, tasks, onMoveTask, onReorderTask, clearTaskPlaceholder, endTaskDrag]);

  // 블록 드래그 오버 핸들러 (블록 순서 변경용)
  const handleBlockDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/block')) {
      return;
    }

    const draggedBlock = state.draggedBlock;
    if (!draggedBlock || draggedBlock.id === block.id) return;

    // X좌표로 삽입 위치 결정
    const rect = blockRef.current?.getBoundingClientRect();
    if (!rect) return;

    const midX = rect.left + rect.width / 2;
    let newIndex = e.clientX < midX ? blockIndex : blockIndex + 1;

    // Task 블록 앞으로는 placeholder 표시 안 함
    if (block.fixed_type === 'TASK') {
      newIndex = blockIndex + 1;
    }

    updateBlockPlaceholder(newIndex);
  }, [state.draggedBlock, block.id, block.fixed_type, blockIndex, updateBlockPlaceholder]);

  // 블록 드롭 핸들러
  const handleBlockDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('application/block')) {
      return;
    }

    e.preventDefault();

    const draggedBlock = state.draggedBlock;
    if (!draggedBlock || draggedBlock.id === block.id) return;

    // 드래그된 블록의 원래 인덱스와 타겟 인덱스를 사용해 이동
    const originalIndex = state.sourceBlockIndex;
    const targetIndex = state.blockPlaceholderIndex;

    if (onMoveBlockDrag && originalIndex !== null && targetIndex !== null && originalIndex !== targetIndex) {
      onMoveBlockDrag(originalIndex, targetIndex);
    }

    clearBlockPlaceholder();
    endBlockDrag();
  }, [state.draggedBlock, state.sourceBlockIndex, state.blockPlaceholderIndex, block.id, onMoveBlockDrag, clearBlockPlaceholder, endBlockDrag]);

  // 플레이스홀더 JSX
  const placeholderElement = (
    <div
      className="h-16 border-2 border-dashed border-bridge-secondary/50 rounded-xl bg-bridge-secondary/10 flex items-center justify-center"
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
        e.stopPropagation();
        handleTaskDrop(e);
      }}
    >
      <span className="text-bridge-secondary text-xs font-semibold pointer-events-none">{t('kanbanBlock.dropHere')}</span>
    </div>
  );

  return (
    <div
      ref={blockRef}
      onDragEnter={(e) => {
        // dragenter에서도 preventDefault 필요
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragOver={(e) => {
        // 항상 preventDefault를 먼저 호출해야 drop 이벤트가 발생함
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        handleTaskDragOver(e);
        handleBlockDragOver(e);
      }}
      onDragLeave={handleTaskDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleTaskDrop(e);
        handleBlockDrop(e);
      }}
      className={`relative flex flex-col bg-bridge-surface rounded-2xl border border-bridge-border min-w-[260px] max-w-[260px] md:min-w-[280px] md:max-w-[280px] transition-all duration-200 ${
        taskPlaceholderInThisBlock ? 'ring-2 ring-bridge-secondary/50 bg-bridge-secondary/5' : ''
      } ${isThisBlockDragging ? 'opacity-40 scale-95 rotate-1' : ''} ${
        state.blockPlaceholderIndex === blockIndex && state.draggedBlock ? 'ring-2 ring-bridge-secondary' : ''
      }`}
    >
      {/* 드롭 인디케이터 (왼쪽) */}
      {state.blockPlaceholderIndex === blockIndex && state.draggedBlock && (
        <div className="absolute -left-2 top-0 bottom-0 w-1 bg-bridge-secondary rounded-full animate-pulse" />
      )}

      {/* 블록 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bridge-border group">
        {/* 드래그 핸들 - 커스텀 블록만 표시 */}
        {isCustomBlock && (
          <div
            ref={dragHandleRef}
            draggable
            onDragStart={handleBlockDragStart}
            onDragEnd={handleBlockDragEnd}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 mr-1 rounded-lg hover:bg-bridge-surface-hover opacity-40 group-hover:opacity-100 transition-all"
            title={t('kanbanBlock.dragToMove')}
          >
            <GripVertical className="h-4 w-4 text-zinc-400" />
          </div>
        )}
        <div className="flex items-center gap-2 flex-1">
          {block.color && (
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: block.color }}
            />
          )}
          <h3 className="font-bold text-sm text-foreground tracking-tight">{block.name}</h3>
          <span className="text-xs font-semibold text-zinc-400 bg-bridge-surface-hover px-2 py-0.5 rounded-md">{tasks.length}</span>
        </div>

        {!isFixedBlock && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover opacity-0 group-hover:opacity-100 transition-all">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-bridge-surface border-bridge-border">
              <DropdownMenuItem onClick={onEditBlock} className="text-zinc-300 hover:bg-bridge-surface-hover hover:text-foreground text-xs">
                {t('kanbanBlock.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEditBlock} className="text-zinc-300 hover:bg-bridge-surface-hover hover:text-foreground text-xs">
                {t('kanbanBlock.changeColor')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-bridge-border" />
              <DropdownMenuItem
                onClick={onDeleteBlock}
                className="text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs"
              >
                {t('kanbanBlock.deleteBlock')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* 카드 리스트 */}
      <div
        ref={taskContainerRef}
        className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-250px)] kanban-scrollbar"
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          handleTaskDragOver(e);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleTaskDrop(e);
        }}
      >
        {tasks.map((task, index) => (
          <div
            key={task.id}
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
              e.stopPropagation();
              handleTaskDrop(e);
            }}
          >
            {/* 플레이스홀더 - 해당 인덱스 전에 표시 */}
            {taskPlaceholderInThisBlock && placeholderIndex === index && state.draggedTask?.id !== task.id && (
              <div className="mb-3">
                {placeholderElement}
              </div>
            )}
            <DraggableCard
              task={task}
              blockId={block.id}
              index={index}
              onClick={() => onTaskClick?.(task)}
              availableTags={availableTags}
              features={features}
              boardId={boardId}
              isChecklistExpanded={expandedChecklistTaskIds?.has(task.id)}
              onToggleChecklistExpand={onToggleChecklistExpand}
              checklistData={checklistDataMap?.[task.id]}
              memberColorMap={memberColorMap}
              showFeatureLabel={showFeatureLabel}
              isScheduled={scheduledTaskIds?.has(task.id)}
            />
          </div>
        ))}
        {/* 맨 끝에 플레이스홀더 (빈 블록 포함) */}
        {taskPlaceholderInThisBlock && placeholderIndex >= tasks.length && (
          placeholderElement
        )}
      </div>
    </div>
  );
});
