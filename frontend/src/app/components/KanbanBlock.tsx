import { useRef, useCallback, useMemo, useState, memo } from "react";
import { Block, Task, Feature, ChecklistItem } from "../types";
import { DraggableCard } from "./DraggableCard";
import {
  GripVertical,
  MoreVertical,
  Plus,
  BarChart2,
  Check,
  X,
  Clock,
  Circle,
} from "lucide-react";
import {
  parseUTCDate,
  formatRelativeTime,
  getTodayDateString,
} from "../utils/dateUtils";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { MotionModal } from "./ui/MotionModal";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  useTaskDragState,
  useTaskPlaceholder,
  useDragActions,
} from "../contexts/DragContext";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface KanbanBlockProps {
  block: Block;
  tasks: Task[];
  features?: Feature[];
  onMoveTask: (taskId: string, targetBlock: string, newOrder: number) => void;
  onReorderTask: (taskId: string, blockId: string, newPosition: number) => void;
  onTaskClick?: (task: Task) => void;
  onEditBlock?: (block: Block) => void;
  onDeleteBlock?: (blockId: string) => void;
  onToggleProgressBar?: (blockId: string, enabled: boolean) => void;
  onHideBlock?: (blockId: string) => void;
  boardId?: string | null;
  expandedChecklistTaskIds?: Set<string>;
  onToggleChecklistExpand?: (taskId: string) => void;
  // 배치 로드된 체크리스트 데이터
  checklistDataMap?: { [taskId: string]: ChecklistItem[] };
  memberColorMap?: Record<string, string | null>;
  showFeatureLabel?: boolean;
  scheduledTaskIds?: Set<string>;
  onQuickAddTask?: (blockId: string) => void;
  isPersonal?: boolean;
  recentlyCompletedTaskIds?: Set<string>;
  selectedMilestoneId?: string;
  // 담당자 필터 (선택된 멤버 이름 배열)
  assigneeFilter?: string[];
}

export const KanbanBlock = memo(function KanbanBlock({
  block,
  tasks,
  features,
  onMoveTask,
  onReorderTask,
  onTaskClick,
  onEditBlock,
  onDeleteBlock,
  onToggleProgressBar,
  onHideBlock,
  boardId,
  expandedChecklistTaskIds,
  onToggleChecklistExpand,
  checklistDataMap,
  memberColorMap,
  showFeatureLabel,
  scheduledTaskIds,
  onQuickAddTask,
  isPersonal = false,
  recentlyCompletedTaskIds,
  selectedMilestoneId,
  assigneeFilter,
}: KanbanBlockProps) {
  const { t } = useTranslation();
  const taskContainerRef = useRef<HTMLDivElement>(null);
  const dragOverThrottleRef = useRef<number>(0);

  const { draggedTask } = useTaskDragState();
  const taskPlaceholder = useTaskPlaceholder();
  const { updateTaskPlaceholder, clearTaskPlaceholder, endTaskDrag } =
    useDragActions();

  // @dnd-kit sortable - TASK 블록은 드래그 비활성화
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    disabled: block.fixed_type === "TASK",
  });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCustomBlock = block.type === "CUSTOM";
  const isFixedBlock = block.type === "FIXED";

  // 카드별 features.find() 대신 O(1) 조회 맵
  const featuresById = useMemo(
    () => new Map((features ?? []).map((f) => [f.id, f])),
    [features],
  );

  // 체크리스트 진행 현황 모달 (진행률 바 연계)
  const [recentDoneOpen, setRecentDoneOpen] = useState(false);
  const [recentDoneTab, setRecentDoneTab] = useState<
    "todayDone" | "inProgress" | "earlierDone" | "notStarted"
  >("todayDone");
  // 완료 시각 소스: completed_at(정확) 우선, 없으면 done_date(과거 데이터 폴백, day 단위)
  const doneTs = (i: ChecklistItem) =>
    parseUTCDate(i.completed_at ?? i.done_date)?.getTime() ?? 0;
  // 블록 안 전체 체크리스트 항목 (task 동봉) — 상태 분류의 단일 소스
  const allChecklistItems = useMemo(() => {
    if (!checklistDataMap) return [] as { item: ChecklistItem; task: Task }[];
    const acc: { item: ChecklistItem; task: Task }[] = [];
    for (const task of tasks) {
      const items = checklistDataMap[task.id];
      if (!items) continue;
      for (const item of items) acc.push({ item, task });
    }
    return acc;
  }, [checklistDataMap, tasks]);

  // 플레이스홀더가 이 블록에 표시되어야 하는지 확인
  const taskPlaceholderInThisBlock = taskPlaceholder?.blockId === block.id;
  const placeholderIndex = taskPlaceholder?.index ?? -1;

  // Task 드래그 오버 핸들러 - Y좌표로 플레이스홀더 위치 계산
  const handleTaskDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Task 드래그인지 확인
      if (!e.dataTransfer.types.includes("application/task")) {
        return;
      }

      // 16ms 쓰로틀 (약 60fps)
      const now = Date.now();
      if (now - dragOverThrottleRef.current < 16) {
        return;
      }
      dragOverThrottleRef.current = now;

      if (!draggedTask) return;

      const container = taskContainerRef.current;
      if (!container) return;

      // 모든 카드의 위치 정보 수집 (드래그 중인 것 포함)
      const children = container.querySelectorAll("[data-task-id]");
      let insertIndex = tasks.length; // 기본값: 맨 끝

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const taskId = child.getAttribute("data-task-id");
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
    },
    [draggedTask, block.id, tasks.length, updateTaskPlaceholder],
  );

  // Task 드래그 리브 핸들러 - placeholder는 drop/dragend에서만 정리
  const handleTaskDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // dragleave에서는 placeholder를 정리하지 않음
      // 다른 블록으로 이동하면 그 블록의 dragover에서 새 placeholder가 설정됨
    },
    [],
  );

  // Task 드롭 핸들러
  const handleTaskDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const taskId = e.dataTransfer.getData("application/task");
      if (!taskId) return;

      // 플레이스홀더가 있으면 그 위치로 이동
      const placeholder = taskPlaceholder;
      if (!placeholder || placeholder.blockId !== block.id) {
        // 플레이스홀더가 없거나 다른 블록의 플레이스홀더면, 맨 끝에 추가
        onMoveTask(taskId, block.id, tasks.length);
        clearTaskPlaceholder();
        endTaskDrag();
        return;
      }

      const insertIndex = placeholder.index;

      // 같은 블록 내 이동인지 확인
      const draggedOriginalIndex = tasks.findIndex((t) => t.id === taskId);
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
    },
    [
      taskPlaceholder,
      block.id,
      tasks,
      onMoveTask,
      onReorderTask,
      clearTaskPlaceholder,
      endTaskDrag,
    ],
  );

  // 플레이스홀더 JSX
  const placeholderElement = (
    <div
      className="h-16 border-2 border-dashed border-bridge-secondary/50 rounded-xl bg-bridge-secondary/10 flex items-center justify-center"
      onDragEnter={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleTaskDrop(e);
      }}
    >
      <span className="text-bridge-secondary text-xs font-medium pointer-events-none">
        {t("kanbanBlock.dropHere")}
      </span>
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      style={sortableStyle}
      onDragEnter={(e) => {
        // Task 드래그용 dragenter
        if (e.dataTransfer.types.includes("application/task")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragOver={(e) => {
        // Task 드래그용 dragover
        if (e.dataTransfer.types.includes("application/task")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          handleTaskDragOver(e);
        }
      }}
      onDragLeave={handleTaskDragLeave}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("application/task")) {
          e.preventDefault();
          e.stopPropagation();
          handleTaskDrop(e);
        }
      }}
      className={`relative flex flex-col bg-bridge-surface rounded-2xl overflow-hidden border border-bridge-border min-w-[260px] max-w-[260px] md:min-w-[280px] md:max-w-[280px] transition-shadow duration-200 ${
        taskPlaceholderInThisBlock
          ? "ring-2 ring-bridge-secondary/50 bg-bridge-secondary/5"
          : ""
      } ${isDragging ? "opacity-40 scale-95 z-10" : ""}`}
    >
      {/* 고정 블록 상단 강조선 */}
      {isFixedBlock && (
        <div
          className={`h-1 ${
            block.fixed_type === "TASK"
              ? "bg-gradient-to-r from-bridge-accent/60 via-bridge-accent/30 to-transparent"
              : "bg-gradient-to-r from-emerald-500/60 via-emerald-500/30 to-transparent"
          }`}
        />
      )}

      {/* 블록 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bridge-border group">
        {/* 드래그 핸들 - TASK 제외 모든 블록 표시 */}
        {block.fixed_type !== "TASK" && (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 mr-1 rounded-lg hover:bg-bridge-surface-hover opacity-40 group-hover:opacity-100 transition-all"
            title={t("kanbanBlock.dragToMove")}
          >
            <GripVertical className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <div className="flex items-center gap-2 flex-1">
          {block.color && (
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: block.color }}
            />
          )}
          <h3 className="font-bold text-sm text-foreground tracking-tight">
            {block.name}
          </h3>
          {isFixedBlock && (
            <span
              className={`text-xs font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${
                block.fixed_type === "TASK"
                  ? "bg-bridge-accent/15 text-bridge-accent"
                  : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              Fixed
            </span>
          )}
          <span className="text-xs font-medium text-slate-400 bg-bridge-surface-hover px-2 py-0.5 rounded-md">
            {tasks.length}
          </span>
          {block.milestone_title && !selectedMilestoneId && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
              {block.milestone_title}
            </span>
          )}
        </div>

        {!isFixedBlock && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-400 hover:text-foreground hover:bg-bridge-surface-hover opacity-0 group-hover:opacity-100 transition-all"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-bridge-surface border-bridge-border"
            >
              <DropdownMenuItem
                onClick={() => onEditBlock?.(block)}
                className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs"
              >
                {t("kanbanBlock.rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onEditBlock?.(block)}
                className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs"
              >
                {t("kanbanBlock.changeColor")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onToggleProgressBar?.(block.id, !block.show_progress_bar)
                }
                className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs"
              >
                <BarChart2 className="h-3.5 w-3.5 mr-2" />
                {block.show_progress_bar
                  ? t("kanbanBlock.disableProgressBar", "프로그레스바 끄기")
                  : t("kanbanBlock.enableProgressBar", "프로그레스바 켜기")}
              </DropdownMenuItem>
              {/* 마일스톤 선택 중 + 마일스톤 비전속 블록만 숨김 가능 */}
              {onHideBlock && !block.milestone_id && selectedMilestoneId && (
                <>
                  <DropdownMenuSeparator className="bg-bridge-border" />
                  <DropdownMenuItem
                    onClick={() => onHideBlock(block.id)}
                    className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs"
                  >
                    {t("kanbanBlock.hideInMilestone", "이 마일스톤에서 숨기기")}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator className="bg-bridge-border" />
              <DropdownMenuItem
                onClick={() => onDeleteBlock?.(block.id)}
                className="text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs"
              >
                {t("kanbanBlock.deleteBlock")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* 프로그레스바: 블록 내 태스크들의 체크리스트 진행 현황 */}
      {block.show_progress_bar &&
        (() => {
          // 오늘 경계 (완료 시각 비교용 ms) + 오늘 날짜 문자열 (기간 비교용)
          const now = new Date();
          const startToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          ).getTime();
          const todayStr = getTodayDateString();

          // 4개 상태로 분류: 오늘 완료 / 진행 중 / 기존 완료 / 미완료
          const bTodayDone: { item: ChecklistItem; task: Task }[] = [];
          const bEarlierDone: { item: ChecklistItem; task: Task }[] = [];
          const bInProgress: { item: ChecklistItem; task: Task }[] = [];
          const bNotStarted: { item: ChecklistItem; task: Task }[] = [];
          for (const rc of allChecklistItems) {
            const it = rc.item;
            if (it.completed) {
              if ((it.completed_at || it.done_date) && doneTs(it) >= startToday)
                bTodayDone.push(rc);
              else bEarlierDone.push(rc);
            } else {
              // 진행 중 = 기간(start~due)이 오늘과 겹치는 미완료 항목
              const s = it.start_date;
              const d = it.due_date;
              const hasDate = !!(s || d);
              const afterStart = !s || s <= todayStr;
              const beforeDue = !d || todayStr <= d;
              if (hasDate && afterStart && beforeDue) bInProgress.push(rc);
              else bNotStarted.push(rc);
            }
          }
          bTodayDone.sort((a, b) => doneTs(b.item) - doneTs(a.item));
          bEarlierDone.sort((a, b) => doneTs(b.item) - doneTs(a.item));
          const byDue = (
            a: { item: ChecklistItem },
            b: { item: ChecklistItem },
          ) =>
            (a.item.due_date ?? "9999-99-99").localeCompare(
              b.item.due_date ?? "9999-99-99",
            );
          bInProgress.sort(byDue);
          bNotStarted.sort(byDue);

          const nToday = bTodayDone.length;
          const nEarlier = bEarlierDone.length;
          const nProg = bInProgress.length;
          const nNot = bNotStarted.length;
          const total = allChecklistItems.length;
          const done = nToday + nEarlier;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const denom = total || 1;
          const segEarlier = (nEarlier / denom) * 100;
          const segToday = (nToday / denom) * 100;
          const segProg = (nProg / denom) * 100;

          const buckets = {
            todayDone: bTodayDone,
            inProgress: bInProgress,
            earlierDone: bEarlierDone,
            notStarted: bNotStarted,
          } as const;
          const counts = {
            todayDone: nToday,
            inProgress: nProg,
            earlierDone: nEarlier,
            notStarted: nNot,
          } as const;
          const list = buckets[recentDoneTab];

          const TABS = [
            "todayDone",
            "inProgress",
            "earlierDone",
            "notStarted",
          ] as const;

          return (
            <>
              <button
                type="button"
                onClick={() => setRecentDoneOpen(true)}
                aria-haspopup="dialog"
                aria-label={t("kanbanBlock.recentDone.toggle")}
                className="w-full flex items-center gap-2 px-3 py-1.5 border-b border-bridge-border hover:bg-foreground/5 transition-colors"
              >
                <div className="flex-1 h-1.5 bg-slate-600 rounded-full overflow-hidden relative">
                  <div
                    className="absolute left-0 top-0 h-full bg-bridge-accent rounded-full transition-all duration-300"
                    style={{ width: `${segEarlier}%` }}
                  />
                  {segToday > 0 && (
                    <div
                      className="absolute top-0 h-full bg-bridge-secondary rounded-full transition-all duration-300"
                      style={{
                        left: `${segEarlier}%`,
                        width: `${segToday}%`,
                        boxShadow: "0 0 8px var(--bridge-secondary)",
                      }}
                    />
                  )}
                </div>
                <span className="text-xs font-medium text-slate-400">
                  {done}/{total} ({pct}%)
                </span>
                {nToday > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary shrink-0">
                    ▲ {t("kanbanBlock.recentDone.todayDelta", { count: nToday })}
                  </span>
                )}
              </button>

              <MotionModal
                open={recentDoneOpen}
                onClose={() => setRecentDoneOpen(false)}
                accentColor
                aria-label={t("kanbanBlock.recentDone.title")}
                className="sm:max-w-lg"
              >
                {/* Header */}
                <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
                  <Check className="w-4 h-4 text-bridge-secondary shrink-0" />
                  <h3 className="text-sm font-bold text-foreground truncate">
                    {t("kanbanBlock.recentDone.title")}
                  </h3>
                  <span className="text-xs text-slate-500 truncate min-w-0">
                    · {block.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRecentDoneOpen(false)}
                    aria-label={t("common.close")}
                    className="ml-auto text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1.5 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress summary */}
                <div className="px-5 py-4 border-b border-foreground/[0.08]">
                  <div className="flex items-baseline gap-2 mb-2.5">
                    <span className="text-2xl font-bold text-foreground tracking-tight">
                      {pct}%
                    </span>
                    <span className="text-sm text-slate-400">
                      {done} / {total}
                    </span>
                    {nToday > 0 && (
                      <span className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
                        ▲{" "}
                        {t("kanbanBlock.recentDone.todayDelta", {
                          count: nToday,
                        })}
                      </span>
                    )}
                  </div>
                  {/* 4색 스택 바: 기존완료 / 오늘완료 / 진행중 / 미완료(트랙) */}
                  <div className="h-2 bg-slate-600 rounded-full overflow-hidden relative">
                    <div
                      className="absolute left-0 top-0 h-full bg-bridge-accent"
                      style={{ width: `${segEarlier}%` }}
                    />
                    <div
                      className="absolute top-0 h-full bg-bridge-secondary"
                      style={{ left: `${segEarlier}%`, width: `${segToday}%` }}
                    />
                    <div
                      className="absolute top-0 h-full bg-amber-500"
                      style={{
                        left: `${segEarlier + segToday}%`,
                        width: `${segProg}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-x-3.5 gap-y-1.5 mt-2.5 flex-wrap">
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-2 h-2 rounded-sm bg-bridge-secondary" />
                      {t("kanbanBlock.recentDone.tab.todayDone")} {nToday}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-2 h-2 rounded-sm bg-amber-500" />
                      {t("kanbanBlock.recentDone.tab.inProgress")} {nProg}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-2 h-2 rounded-sm bg-bridge-accent" />
                      {t("kanbanBlock.recentDone.tab.earlierDone")} {nEarlier}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-2 h-2 rounded-sm bg-slate-600" />
                      {t("kanbanBlock.recentDone.tab.notStarted")} {nNot}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="px-5 pb-5 pt-4">
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setRecentDoneTab(tab)}
                        className={`text-xs px-3 py-1 rounded-full transition-colors ${
                          recentDoneTab === tab
                            ? "bg-bridge-secondary/15 text-bridge-secondary font-bold"
                            : "text-slate-500 hover:text-slate-300 bg-foreground/[0.03]"
                        }`}
                      >
                        {t(`kanbanBlock.recentDone.tab.${tab}`)} {counts[tab]}
                      </button>
                    ))}
                  </div>

                  {list.length === 0 ? (
                    <div className="text-sm text-slate-500 py-12 text-center">
                      {t("kanbanBlock.recentDone.empty")}
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-[60dvh] overflow-y-auto custom-scrollbar">
                      {list.slice(0, 100).map(({ item, task }) => {
                        const isDone = item.completed;
                        const isProg = recentDoneTab === "inProgress";
                        const rightLabel = isDone
                          ? formatRelativeTime(item.completed_at ?? item.done_date)
                          : item.due_date
                            ? `~ ${item.due_date}`
                            : item.start_date
                              ? `${item.start_date} ~`
                              : "";
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              onTaskClick?.(task);
                              setRecentDoneOpen(false);
                            }}
                            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl bg-foreground/[0.03] hover:bg-foreground/[0.06] border border-foreground/[0.06] transition-colors text-left"
                          >
                            <span
                              className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                isDone
                                  ? "bg-emerald-500/15"
                                  : isProg
                                    ? "bg-amber-500/15"
                                    : "bg-slate-500/15"
                              }`}
                            >
                              {isDone ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : isProg ? (
                                <Clock className="w-3 h-3 text-amber-500" />
                              ) : (
                                <Circle className="w-3 h-3 text-slate-400" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-foreground font-medium break-words">
                                {item.title}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                                <span className="text-xs text-slate-500 truncate">
                                  {task.title}
                                </span>
                                {item.assignee && (
                                  <>
                                    <span className="text-xs text-slate-600 shrink-0">
                                      ·
                                    </span>
                                    <span className="flex items-center gap-1 shrink-0">
                                      <span
                                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white border border-foreground/[0.08] overflow-hidden"
                                        style={{
                                          backgroundColor: getAssigneeHex(
                                            item.assignee.name,
                                            item.assignee.id
                                              ? memberColorMap?.[
                                                  item.assignee.id
                                                ]
                                              : undefined,
                                          ),
                                        }}
                                        title={item.assignee.name}
                                      >
                                        {getInitials(item.assignee.name)}
                                      </span>
                                      <span className="text-xs text-slate-400">
                                        {item.assignee.name}
                                      </span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-slate-500 shrink-0 mt-0.5">
                              {rightLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </MotionModal>
            </>
          );
        })()}

      {/* 카드 리스트 */}
      <div
        ref={taskContainerRef}
        className="flex-1 p-2 space-y-2 overflow-y-auto min-h-0 custom-scrollbar"
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes("application/task")) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/task")) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            handleTaskDragOver(e);
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer.types.includes("application/task")) {
            e.preventDefault();
            e.stopPropagation();
            handleTaskDrop(e);
          }
        }}
      >
        {tasks.map((task, index) => (
          <div
            key={task.id}
            onDragEnter={(e) => {
              if (e.dataTransfer.types.includes("application/task")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/task")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => {
              if (e.dataTransfer.types.includes("application/task")) {
                e.preventDefault();
                e.stopPropagation();
                handleTaskDrop(e);
              }
            }}
          >
            {/* 플레이스홀더 - 해당 인덱스 전에 표시 */}
            {taskPlaceholderInThisBlock &&
              placeholderIndex === index &&
              draggedTask?.id !== task.id && (
                <div className="mb-2">{placeholderElement}</div>
              )}
            <DraggableCard
              task={task}
              blockId={block.id}
              index={index}
              onTaskClick={onTaskClick}
              feature={
                task.feature_id ? featuresById.get(task.feature_id) : undefined
              }
              boardId={boardId}
              isChecklistExpanded={expandedChecklistTaskIds?.has(task.id)}
              onToggleChecklistExpand={onToggleChecklistExpand}
              checklistData={checklistDataMap?.[task.id]}
              memberColorMap={memberColorMap}
              showFeatureLabel={showFeatureLabel}
              isScheduled={scheduledTaskIds?.has(task.id)}
              hideAssignees={isPersonal}
              justCompleted={recentlyCompletedTaskIds?.has(task.id)}
              assigneeFilter={assigneeFilter}
            />
          </div>
        ))}
        {/* 맨 끝에 플레이스홀더 (빈 블록 포함) */}
        {taskPlaceholderInThisBlock &&
          placeholderIndex >= tasks.length &&
          placeholderElement}
      </div>

      {/* Quick Add Card Button - always visible at bottom */}
      {onQuickAddTask && (
        <div className="px-2 py-1.5 border-t border-foreground/5">
          <button
            onClick={() => onQuickAddTask(block.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-all group"
          >
            <Plus
              size={16}
              className="text-slate-500 group-hover:text-bridge-accent transition-colors"
            />
            <span className="text-xs font-medium">
              {t("quickAdd.addCard", "Add a card")}
            </span>
          </button>
        </div>
      )}
    </div>
  );
});
