import { useState } from 'react';
import { Check, X, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DailyChecklistItem as DailyChecklistItemType } from '../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DailyChecklistItemProps {
  item: DailyChecklistItemType;
  isReadOnly: boolean;
  onRemove: () => void;
  onToggle?: () => void;
  isDraggable?: boolean;
  compact?: boolean;
}

export function DailyChecklistItem({
  item,
  isReadOnly,
  onRemove,
  onToggle,
  isDraggable = true,
  compact = false,
}: DailyChecklistItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState(item.completed);

  // Sync optimistic state with prop
  if (optimisticCompleted !== item.completed && !isToggling) {
    setOptimisticCompleted(item.completed);
  }

  const handleToggle = async () => {
    if (isReadOnly || !onToggle || isToggling) return;
    setIsToggling(true);
    setOptimisticCompleted(!optimisticCompleted);
    try {
      await onToggle();
    } catch {
      setOptimisticCompleted(item.completed);
    } finally {
      setIsToggling(false);
    }
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: isReadOnly || !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleRemove = async () => {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      await onRemove();
    } catch {
      setIsRemoving(false);
    }
  };

  const featureColor = item.feature?.color || '#6366f1';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${compact ? 'rounded-lg' : 'rounded-xl'} border border-bridge-border bg-foreground/5 overflow-hidden transition-all ${
        isDragging ? 'shadow-2xl ring-2 ring-bridge-accent' : 'hover:border-bridge-border'
      } ${optimisticCompleted ? 'opacity-60' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Feature 색상 바 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: featureColor }}
      />

      <div className={`flex items-start ${compact ? 'gap-1.5 pl-3 pr-2 py-1.5' : 'gap-3 pl-4 pr-3 py-3'}`}>
        {/* 드래그 핸들 */}
        {isDraggable && !isReadOnly && (
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-200 transition-colors pt-0.5"
          >
            <GripVertical className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
          </div>
        )}

        {/* 완료 체크박스 */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={isReadOnly || !onToggle || isToggling}
          className={`flex-shrink-0 ${compact ? 'w-4 h-4 rounded' : 'w-5 h-5 rounded-md'} border mt-0.5 flex items-center justify-center transition-colors ${
            optimisticCompleted
              ? 'bg-green-500 border-green-500'
              : 'border-bridge-border bg-foreground/5 hover:border-foreground/40'
          } ${!isReadOnly && onToggle ? 'cursor-pointer' : 'cursor-default'}`}
        >
          {optimisticCompleted && <Check className={compact ? 'h-2.5 w-2.5 text-white' : 'h-3 w-3 text-white'} />}
        </button>

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <p
            className={`${compact ? 'text-xs' : 'text-sm'} font-medium ${
              optimisticCompleted ? 'text-slate-400 line-through' : 'text-foreground'
            } truncate`}
          >
            {item.title}
          </p>

          {/* Task 정보 */}
          {item.task && (
            <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-slate-400 mt-0.5 truncate`}>
              {item.task.title}
            </p>
          )}

          {/* Feature 정보 */}
          {item.feature && !compact && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: featureColor }}
              />
              <span className="text-xs text-slate-400 truncate">
                {item.feature.title}
              </span>
            </div>
          )}
        </div>

        {/* 삭제 버튼 (hover 시 표시) */}
        {!isReadOnly && isHovered && (
          <button
            onClick={handleRemove}
            disabled={isRemoving}
            className={`flex-shrink-0 ${compact ? 'p-0.5' : 'p-1.5'} rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors`}
          >
            <X className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
        )}
      </div>
    </div>
  );
}
