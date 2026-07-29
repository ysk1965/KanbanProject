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
  // 사용자가 이 날짜로 직접 당겨온(핀) 항목만 순서를 저장할 수 있다.
  // 기간에서 파생된 항목은 그 뒤에 붙이되, 오늘 할 것 → 지연 → 완료 순으로 내린다.
  // (마감일 오름차순 그대로 두면 지연 항목이 맨 위로 올라와 오늘 할 일을 가린다)
  const pinnedItems = items.filter((i) => i.pinned);
  const derivedRank = (i: DailyChecklistItemType) =>
    i.completed ? 2 : i.source === "OVERDUE" ? 1 : 0;
  const derivedItems = items
    .filter((i) => !i.pinned)
    .sort((a, b) => derivedRank(a) - derivedRank(b));
  const [localItems, setLocalItems] =
    useState<DailyChecklistItemType[]>(pinnedItems);
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

  // Sync with parent prop (핀 항목만 로컬 DnD 상태에 반영)
  if (JSON.stringify(pinnedItems) !== JSON.stringify(localItems)) {
    setLocalItems(pinnedItems);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const combinedItems = [...localItems, ...derivedItems];
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

  /**
   * 오늘 목록에서 빼기 — 원본 체크리스트는 그대로 둔다.
   * 기간 때문에 자동으로 들어온 항목은 행을 지워도 다시 나타나므로 제외 API를 쓴다.
   */
  const handleRemoveItem = useCallback(
    async (item: DailyChecklistItemType) => {
      try {
        if (item.checklist_item_id) {
          await dailyChecklistAPI.excludeItem(boardId, {
            checklist_item_id: item.checklist_item_id,
            assigned_date: item.assigned_date,
            assignee_id: item.assignee.id,
          });
        } else {
          // 원본이 없는 임시 항목만 실제로 삭제된다
          await dailyChecklistAPI.removeItem(boardId, item.id);
        }
        onRefresh();
      } catch (error) {
        console.error("Failed to remove item from today:", error);
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
      isDraggable={draggable && !!item.pinned}
      canRemove
      compact
      onRemove={() => handleRemoveItem(item)}
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
            aria-label={t("dailySchedule.addToToday")}
            title={t("dailySchedule.addToToday")}
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
        {/* 기간에서 파생된 항목 — 순서는 마감일 기준이라 직접 정렬하지 않는다 */}
        {derivedItems.map((item) => renderItem(item, false))}
      </div>
    </div>
  );
}
