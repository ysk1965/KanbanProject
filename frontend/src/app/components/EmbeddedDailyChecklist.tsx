import { useState, useCallback, useRef, useLayoutEffect } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DailyChecklistItem as DailyChecklistItemType } from "../types";
import { DailyChecklistItem } from "./DailyChecklistItem";
import { dailyChecklistAPI } from "../utils/api";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface EmbeddedDailyChecklistProps {
  boardId: string;
  items: DailyChecklistItemType[];
  isViewer: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggle: (
    itemId: string,
    checklistItemId: string,
    taskId: string,
    newCompleted: boolean,
  ) => Promise<void>;
  onRefresh: () => void;
  onAddClick: () => void;
}

export function EmbeddedDailyChecklist({
  boardId,
  items,
  isViewer,
  isExpanded,
  onToggleExpand,
  onToggle,
  onRefresh,
  onAddClick,
}: EmbeddedDailyChecklistProps) {
  const { t } = useTranslation();
  // 워크로드 날짜 범위 기반 가상 항목은 DnD/삭제 대상에서 분리
  const realItems = items.filter((i) => !i.isVirtual);
  const virtualItems = items.filter((i) => i.isVirtual);
  const [localItems, setLocalItems] =
    useState<DailyChecklistItemType[]>(realItems);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef<number>(0);

  // Track scroll position continuously
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      scrollTopRef.current = scrollRef.current.scrollTop;
    }
  }, []);

  // Restore scroll position after re-render
  useLayoutEffect(() => {
    if (scrollRef.current && scrollTopRef.current > 0) {
      scrollRef.current.scrollTop = scrollTopRef.current;
    }
  });

  // Sync with parent prop (실제 항목만 로컬 DnD 상태에 반영)
  if (JSON.stringify(realItems) !== JSON.stringify(localItems)) {
    setLocalItems(realItems);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const combinedItems = [...localItems, ...virtualItems];
  const completedCount = combinedItems.filter((i) => i.completed).length;
  const totalCount = combinedItems.length;

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = localItems.findIndex((item) => item.id === active.id);
      const newIndex = localItems.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newItems = arrayMove(localItems, oldIndex, newIndex);
      setLocalItems(newItems);

      try {
        await dailyChecklistAPI.updatePosition(boardId, active.id as string, {
          position: newIndex,
        });
        onRefresh();
      } catch {
        setLocalItems(localItems);
      }
    },
    [boardId, localItems, onRefresh],
  );

  const handleRemoveItem = useCallback(
    async (itemId: string) => {
      try {
        await dailyChecklistAPI.removeItem(boardId, itemId);
        onRefresh();
      } catch (error) {
        console.error("Failed to remove item:", error);
      }
    },
    [boardId, onRefresh],
  );

  const handleToggleItem = useCallback(
    async (item: DailyChecklistItemType) => {
      if (!item.checklist_item_id || !item.task?.id) return;
      const newCompleted = !item.completed;
      // Optimistic local update
      setLocalItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, completed: newCompleted } : i,
        ),
      );
      try {
        await onToggle(
          item.id,
          item.checklist_item_id,
          item.task.id,
          newCompleted,
        );
      } catch {
        setLocalItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, completed: !newCompleted } : i,
          ),
        );
      }
    },
    [onToggle],
  );

  const renderItem = (item: DailyChecklistItemType, draggable: boolean) => (
    <DailyChecklistItem
      key={item.id}
      item={item}
      isReadOnly={isViewer}
      isDraggable={draggable && !item.isVirtual}
      canRemove={!item.isVirtual}
      compact
      onRemove={item.isVirtual ? () => {} : () => handleRemoveItem(item.id)}
      onToggle={
        item.checklist_item_id && item.task?.id
          ? () => handleToggleItem(item)
          : undefined
      }
    />
  );

  // Header row (always visible)
  const header = (
    <div className="flex items-center justify-between text-xs">
      <button
        onClick={onToggleExpand}
        className="flex items-center gap-1 text-slate-400 hover:text-foreground transition-colors min-w-0"
      >
        {isExpanded ? (
          <ChevronUp className="h-3 w-3 flex-shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        )}
        <span className="truncate">{t("dailySchedule.todayChecklist")}</span>
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span
          className={`font-medium ${
            totalCount > 0 && completedCount === totalCount
              ? "text-green-400"
              : "text-bridge-accent"
          }`}
        >
          {totalCount > 0 ? `${completedCount}/${totalCount}` : "0"}
        </span>
        {!isViewer && (
          <button
            onClick={onAddClick}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-foreground/10 text-slate-400 hover:text-foreground transition-colors"
            aria-label="추가"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );

  if (totalCount === 0) {
    return <div className="py-1">{header}</div>;
  }

  // Collapsed: show first 4 items (no drag)
  if (!isExpanded) {
    return (
      <div className="space-y-1">
        {header}
        <div className="space-y-1 mt-1">
          {combinedItems.slice(0, 4).map((item) => renderItem(item, false))}
          {combinedItems.length > 4 && (
            <button
              onClick={onToggleExpand}
              className="text-xs text-slate-400 hover:text-foreground pl-2 transition-colors"
            >
              {t("dailySchedule.moreItems", {
                count: combinedItems.length - 4,
              })}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded: all items with drag-and-drop
  return (
    <div className="space-y-1">
      {header}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="space-y-1 mt-1 max-h-[300px] overflow-y-auto"
      >
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
            {localItems.map((item) => renderItem(item, !isViewer))}
          </SortableContext>
        </DndContext>
        {/* 워크로드 날짜 범위 기반 가상 항목 (순서변경/삭제 불가) */}
        {virtualItems.map((item) => renderItem(item, false))}
      </div>
    </div>
  );
}
