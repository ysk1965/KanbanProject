import { useState } from 'react';
import { Check, X, GripVertical } from 'lucide-react';
import { DailyChecklistItem as DailyChecklistItemType } from '../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DailyChecklistItemProps {
  item: DailyChecklistItemType;
  isReadOnly: boolean;
  onRemove: () => void;
  isDraggable?: boolean;
}

export function DailyChecklistItem({
  item,
  isReadOnly,
  onRemove,
  isDraggable = true,
}: DailyChecklistItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

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
      className={`group relative rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all ${
        isDragging ? 'shadow-2xl ring-2 ring-bridge-accent' : 'hover:border-white/20'
      } ${item.completed ? 'opacity-60' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Feature 색상 바 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: featureColor }}
      />

      <div className="flex items-start gap-3 pl-4 pr-3 py-3">
        {/* 드래그 핸들 */}
        {isDraggable && !isReadOnly && (
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 transition-colors pt-0.5"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}

        {/* 완료 체크박스 (읽기 전용) */}
        <div
          className={`flex-shrink-0 w-5 h-5 rounded-md border mt-0.5 flex items-center justify-center ${
            item.completed
              ? 'bg-green-500 border-green-500'
              : 'border-white/20 bg-white/5'
          }`}
        >
          {item.completed && <Check className="h-3 w-3 text-white" />}
        </div>

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium ${
              item.completed ? 'text-slate-400 line-through' : 'text-white'
            }`}
          >
            {item.title}
          </p>

          {/* Task 정보 */}
          {item.task && (
            <p className="text-xs text-slate-500 mt-1 truncate">
              {item.task.title}
            </p>
          )}

          {/* Feature 정보 */}
          {item.feature && (
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
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
