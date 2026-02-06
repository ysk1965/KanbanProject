import { useState, useCallback } from 'react';
import { Plus, User, ClipboardList } from 'lucide-react';
import { DailyChecklistItem as DailyChecklistItemType } from '../types';
import { DailyChecklistItem } from './DailyChecklistItem';
import { dailyChecklistAPI } from '../utils/api';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface DailyChecklistColumnProps {
  boardId: string;
  user: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  items: DailyChecklistItemType[];
  selectedDate: Date;
  isReadOnly: boolean;
  onItemAdded: () => void;
  onItemRemoved: () => void;
  onPositionChanged: () => void;
  onAddClick: () => void;
}

export function DailyChecklistColumn({
  boardId,
  user,
  items,
  isReadOnly,
  onItemRemoved,
  onPositionChanged,
  onAddClick,
}: DailyChecklistColumnProps) {
  const [localItems, setLocalItems] = useState<DailyChecklistItemType[]>(items);

  // items prop이 변경되면 localItems 업데이트
  if (JSON.stringify(items) !== JSON.stringify(localItems)) {
    setLocalItems(items);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      const oldIndex = localItems.findIndex((item) => item.id === active.id);
      const newIndex = localItems.findIndex((item) => item.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Optimistic update
      const newItems = arrayMove(localItems, oldIndex, newIndex);
      setLocalItems(newItems);

      try {
        await dailyChecklistAPI.updatePosition(boardId, active.id as string, {
          position: newIndex,
        });
        onPositionChanged();
      } catch (error) {
        console.error('Failed to update position:', error);
        // Revert on error
        setLocalItems(localItems);
      }
    },
    [boardId, localItems, onPositionChanged]
  );

  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      try {
        await dailyChecklistAPI.removeItem(boardId, itemId);
        onItemRemoved();
      } catch (error) {
        console.error('Failed to remove item:', error);
        throw error;
      }
    },
    [boardId, onItemRemoved]
  );

  const completedCount = localItems.filter((item) => item.completed).length;
  const totalCount = localItems.length;

  return (
    <div className="flex flex-col w-64 md:w-72 flex-shrink-0 bg-bridge-obsidian rounded-2xl border border-white/15 overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-white/15">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user.profile_image ? (
              <img
                src={user.profile_image}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-bridge-accent flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-white">{user.name}</h3>
              <p className="text-xs text-slate-400">
                {completedCount}/{totalCount} 완료
              </p>
            </div>
          </div>

          {/* 추가 버튼 */}
          {!isReadOnly && (
            <button
              onClick={onAddClick}
              className="p-2 rounded-lg text-slate-400 hover:text-bridge-accent hover:bg-bridge-accent/10 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 항목 리스트 */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-300px)]">
        {localItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ClipboardList className="h-10 w-10 text-slate-400 mb-3" />
            <p className="text-sm text-slate-400">오늘의 체크리스트가 없습니다</p>
            {!isReadOnly && (
              <button
                onClick={onAddClick}
                className="mt-3 px-4 py-2 text-xs font-medium text-bridge-accent hover:bg-bridge-accent/10 rounded-lg transition-colors"
              >
                + 추가하기
              </button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={localItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {localItems.map((item) => (
                <DailyChecklistItem
                  key={item.id}
                  item={item}
                  isReadOnly={isReadOnly}
                  isDraggable={!isReadOnly}
                  onRemove={() => handleRemoveItem(item.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
