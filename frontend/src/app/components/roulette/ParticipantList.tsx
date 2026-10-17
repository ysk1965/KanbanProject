import { useState } from 'react';
import { X, UserPlus, GripVertical, Shuffle } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useRouletteLanguage } from './rouletteI18n';

interface ParticipantListProps {
  participants: string[];
  onAdd: (name: string) => void;
  onRemove: (index: number) => void;
  onReorder: (participants: string[]) => void;
  isSpinning?: boolean;
}

interface DraggableItemProps {
  id: string;
  participant: string;
  index: number;
  onRemove: (index: number) => void;
  disabled?: boolean;
}

function DraggableItem({ id, participant, index, onRemove, disabled }: DraggableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-2 sm:px-3 py-2 sm:py-3 border border-gray-200 dark:border-gray-600 transition-all ${
        isDragging ? 'opacity-50 scale-95' : 'opacity-100'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={`text-gray-400 dark:text-gray-500 touch-none ${
            disabled
              ? 'cursor-not-allowed'
              : 'cursor-grab active:cursor-grabbing hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <GripVertical className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <span className="font-medium text-gray-800 dark:text-gray-100 text-sm sm:text-base truncate">
          {participant}
        </span>
      </div>
      <button
        onClick={() => onRemove(index)}
        disabled={disabled}
        className={`transition-colors shrink-0 ml-2 ${
          disabled
            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            : 'text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
        }`}
        aria-label="Remove participant"
      >
        <X className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
    </div>
  );
}

export function ParticipantList({
  participants,
  onAdd,
  onRemove,
  onReorder,
  isSpinning = false,
}: ParticipantListProps) {
  const [inputValue, setInputValue] = useState('');
  const { t } = useRouletteLanguage();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onAdd(inputValue.trim());
      setInputValue('');
    }
  };

  // 같은 이름이 여러 번 들어올 수 있어 이름+순번으로 정렬 id 를 만든다
  const itemIds = participants.map((participant, index) => `${participant}-${index}`);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = itemIds.indexOf(String(active.id));
    const to = itemIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(participants, from, to));
  };

  const shuffleParticipants = () => {
    const shuffled = [...participants];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    onReorder(shuffled);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="w-full">
        <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isSpinning ? t('spinning') : t('participantPlaceholder')}
            disabled={isSpinning}
            className="flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <Button type="submit" size="icon" className="shrink-0" disabled={isSpinning}>
            <UserPlus className="w-4 h-4" />
          </Button>
        </form>

        {participants.length >= 2 && (
          <div className="flex justify-end mb-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={shuffleParticipants}
              disabled={isSpinning}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Shuffle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              {t('shuffleOrder')}
            </Button>
          </div>
        )}

        <div className="space-y-2 max-h-[300px] sm:max-h-[400px] overflow-y-auto">
          {participants.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-4 text-sm sm:text-base">
              {t('noParticipants')}
            </p>
          ) : (
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              {participants.map((participant, index) => (
                <DraggableItem
                  key={itemIds[index]}
                  id={itemIds[index]}
                  participant={participant}
                  index={index}
                  onRemove={onRemove}
                  disabled={isSpinning}
                />
              ))}
            </SortableContext>
          )}
        </div>

        {participants.length > 0 && (
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
            {participants.length}
            {t('participants')}
          </p>
        )}
      </div>
    </DndContext>
  );
}
