import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Users, CheckCircle2, Loader2, Flag, ChevronDown, ChevronUp } from "lucide-react";
import { BoardMember } from "../ShareBoardModal";
import { Milestone } from "../../types";
import {
  boardChecklistAPI,
  checklistAPI,
  AssigneeItemResponse,
  ChecklistByAssigneeResponse,
} from "../../utils/api";
import { getInitials, getAssigneeHex } from "../../utils/assigneeColor";

// ========================================
// Constants
// ========================================

const DAY_WIDTH = 60;
const ROW_HEIGHT = 80;
const MILESTONE_ROW_HEIGHT = 48;
const BAR_HEIGHT = 32;
const BAR_TOP_OFFSET = 4;
const LEFT_COL_WIDTH = 200;
const HEADER_HEIGHT = 48;
const MIN_BAR_WIDTH = 20;
/** Maximum number of visible bar lanes before collapsing with "+N more" */
const MAX_VISIBLE_LANES = 3;

// ========================================
// Types
// ========================================

interface ScheduleResourceViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  milestones: Milestone[];
  memberColorMap?: Record<string, string | null>;
  onViewTask?: (taskId: string) => void;
  onDropChecklist?: (
    item: { id: string; task_id: string },
    targetDate: string,
    targetAssigneeId: string,
  ) => void;
  /** External drag state forwarded from parent (ChecklistItemPanel ghost) */
  externalDragItem?: AssigneeItemResponse | null;
  /** Increment to trigger data refresh */
  refreshTrigger?: number;
  onMilestoneClick?: (milestone: Milestone) => void;
}

interface DragState {
  itemId: string;
  taskId: string;
  assigneeId: string | null;
  assigneeIndex: number;
  startDate: string;
  dueDate: string;
  featureColor: string;
  dragType: "move" | "resize-left" | "resize-right";
  /** Day index of the cursor column at mousedown (for day-aligned snapping) */
  initialCursorDayIndex: number;
  currentDeltaDays: number;
}

interface TooltipState {
  x: number;
  y: number;
  item: AssigneeItemResponse;
  featureName: string;
}

interface DropHighlight {
  rowIndex: number;
  dayIndex: number;
}

// ========================================
// Utility functions
// ========================================

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToDate(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateStr(date);
}

function diffDays(a: string, b: string): number {
  // Use UTC to avoid DST-related off-by-one errors
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const utcA = Date.UTC(ay, am - 1, ad);
  const utcB = Date.UTC(by, bm - 1, bd);
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getDayLabel(date: Date, locale: string): string {
  const days: Record<string, string[]> = {
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ko: ["일", "월", "화", "수", "목", "금", "토"],
    ja: ["日", "月", "火", "水", "木", "金", "土"],
    zh: ["日", "一", "二", "三", "四", "五", "六"],
    "zh-TW": ["日", "一", "二", "三", "四", "五", "六"],
    vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
    th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
    es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
    "pt-BR": ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    hi: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"],
  };
  const arr = days[locale] || days.en;
  return arr[date.getDay()];
}

// ========================================
// Component
// ========================================

export function ScheduleResourceView({
  boardId,
  boardMembers,
  milestones,
  memberColorMap,
  onViewTask,
  onDropChecklist,
  externalDragItem,
  refreshTrigger,
  onMilestoneClick,
}: ScheduleResourceViewProps) {
  const { t, i18n } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ─── State ───
  const [data, setData] = useState<ChecklistByAssigneeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [dropHighlight, setDropHighlight] = useState<DropHighlight | null>(
    null,
  );
  /** Track which member rows are expanded (showing all lanes) */
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // Refs for mouse event handlers (avoid stale closure)
  const dragStateRef = useRef<DragState | null>(null);
  // 드래그/리사이즈 후 click 이벤트 방지용 ref
  const wasDraggedRef = useRef(false);

  // ─── Timeline range: wide fixed range (12 weeks before + 40 weeks after today) ───
  const { timelineDays, todayIndex, rangeStart, rangeEnd } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(start.getDate() - 84); // 12 weeks before
    const end = new Date(today);
    end.setDate(end.getDate() + 280); // 40 weeks after

    const days: Date[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const todayStr = formatDateStr(today);
    const todayIdx = days.findIndex((d) => formatDateStr(d) === todayStr);

    return {
      timelineDays: days,
      todayIndex: todayIdx,
      rangeStart: formatDateStr(start),
      rangeEnd: formatDateStr(end),
    };
  }, []);

  // ─── Fetch data ───
  const fetchData = useCallback(
    async (silent = false) => {
      if (!boardId) return;
      try {
        if (!silent) setLoading(true);
        const result = await boardChecklistAPI.getItemsByAssignee(boardId, {
          start_date: rangeStart,
          end_date: rangeEnd,
        });
        setData(result);
      } catch (err) {
        console.warn("Failed to fetch checklist items by assignee", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [boardId, rangeStart, rangeEnd],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh when parent triggers (e.g. after external drop) — silent to avoid chart unmount
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchData(true);
    }
  }, [refreshTrigger, fetchData]);

  // Scroll to today on mount
  useEffect(() => {
    if (!loading && scrollContainerRef.current && todayIndex >= 0) {
      const scrollTo =
        todayIndex * DAY_WIDTH -
        scrollContainerRef.current.clientWidth / 2 +
        DAY_WIDTH / 2;
      scrollContainerRef.current.scrollLeft = Math.max(0, scrollTo);
    }
  }, [loading, todayIndex]);

  // ─── External DnD drop tracking (from ChecklistItemPanel) ───
  const externalDropRef = useRef<{ rowId: string; dayIndex: number } | null>(
    null,
  );

  useEffect(() => {
    if (!externalDragItem) {
      setDropHighlight(null);
      externalDropRef.current = null;
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Find which row the cursor is over via data attribute
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const rowEl = el?.closest("[data-resource-row]") as HTMLElement | null;
      if (!rowEl) {
        setDropHighlight(null);
        externalDropRef.current = null;
        return;
      }

      const rowId = rowEl.getAttribute("data-resource-row") || "";
      const rowIndex = Number(
        rowEl.getAttribute("data-resource-row-index") || "0",
      );

      // Determine day index: prefer DOM data attribute for accuracy,
      // fall back to pixel math if no grid column element is found.
      let dayIndex = -1;
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const gridCol = elements.find(
        (el) => el.getAttribute("data-day-index") != null,
      );
      if (gridCol) {
        dayIndex = Number(gridCol.getAttribute("data-day-index"));
      } else {
        const containerRect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        dayIndex = Math.floor(
          (e.clientX - containerRect.left - LEFT_COL_WIDTH + scrollLeft) /
            DAY_WIDTH,
        );
      }

      if (dayIndex >= 0 && dayIndex < timelineDays.length) {
        setDropHighlight({ rowIndex, dayIndex });
        externalDropRef.current = { rowId, dayIndex };
      } else {
        setDropHighlight(null);
        externalDropRef.current = null;
      }
    };

    const handleMouseUp = () => {
      const drop = externalDropRef.current;
      if (drop && externalDragItem && onDropChecklist) {
        const targetDate = formatDateStr(timelineDays[drop.dayIndex]);

        // Optimistic update: immediately add the bar to the chart
        const optimisticItem: AssigneeItemResponse = {
          ...externalDragItem,
          start_date: targetDate,
          due_date: targetDate,
        };
        setData((prevData) => {
          if (!prevData)
            return {
              assignees: [
                {
                  assignee: {
                    id: drop.rowId,
                    name: "",
                    email: "",
                    avatar: null,
                  },
                  items: [optimisticItem],
                },
              ],
              unassigned: [],
            };

          const targetGroupExists = prevData.assignees.some(
            (g) => g.assignee.id === drop.rowId,
          );

          return {
            assignees: targetGroupExists
              ? prevData.assignees.map((group) =>
                  group.assignee.id === drop.rowId
                    ? {
                        ...group,
                        items: [...group.items, optimisticItem],
                      }
                    : group,
                )
              : [
                  ...prevData.assignees,
                  {
                    assignee: {
                      id: drop.rowId,
                      name: "",
                      email: "",
                      avatar: null,
                    },
                    items: [optimisticItem],
                  },
                ],
            // Remove from unassigned if it was there
            unassigned: prevData.unassigned.filter(
              (i) => i.id !== externalDragItem.id,
            ),
          };
        });

        onDropChecklist(
          { id: externalDragItem.id, task_id: externalDragItem.task?.id || "" },
          targetDate,
          drop.rowId,
        );
      }
      setDropHighlight(null);
      externalDropRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [externalDragItem, timelineDays, onDropChecklist]);

  // ─── Build row data ───
  // Always show board members as rows, even when API data is not yet loaded
  const rows = useMemo(() => {
    // Filter members to exclude viewers
    const activeMembers = boardMembers.filter((m) => m.role !== "viewer");

    // Build member rows — always show all active members
    const memberRows = activeMembers.map((member) => {
      const assigneeGroup = data?.assignees.find(
        (a) => a.assignee.id === member.userId,
      );
      return {
        type: "member" as const,
        id: member.userId,
        name: member.name,
        avatar: member.avatar || null,
        color: memberColorMap?.[member.name] || null,
        items: assigneeGroup?.items || [],
      };
    });

    // Add unassigned row if there are unassigned items
    if (data && data.unassigned.length > 0) {
      memberRows.push({
        type: "member" as const,
        id: "__unassigned__",
        name: t("schedule.resource.unassigned", "Unassigned"),
        avatar: null,
        color: null,
        items: data.unassigned,
      });
    }

    return memberRows;
  }, [data, boardMembers, memberColorMap, t]);

  // ─── Bar position calculations ───
  const getBarPosition = useCallback(
    (startDate: string | null, dueDate: string | null) => {
      if (!startDate && !dueDate) return null;

      const effectiveStart = startDate || dueDate!;
      const effectiveEnd = dueDate || startDate!;
      const startDayIndex = diffDays(rangeStart, effectiveStart);
      const endDayIndex = diffDays(rangeStart, effectiveEnd);

      const left = startDayIndex * DAY_WIDTH;
      const width = Math.max(
        (endDayIndex - startDayIndex + 1) * DAY_WIDTH,
        MIN_BAR_WIDTH,
      );

      return { left, width, startDayIndex, endDayIndex };
    },
    [rangeStart],
  );

  // ─── Milestone bar positions ───
  const milestoneBarData = useMemo(() => {
    return milestones
      .filter((m) => m.start_date && m.end_date)
      .map((m) => {
        const pos = getBarPosition(m.start_date, m.end_date);
        return { milestone: m, pos };
      })
      .filter((d) => d.pos !== null);
  }, [milestones, getBarPosition]);

  // ─── Handle bar interactions ───
  const handleBarClick = useCallback(
    (item: AssigneeItemResponse) => {
      // 드래그/리사이즈 직후 click 이벤트 무시
      if (wasDraggedRef.current) {
        wasDraggedRef.current = false;
        return;
      }
      if (item.task && onViewTask) {
        onViewTask(item.task.id);
      }
    },
    [onViewTask],
  );

  const handleBarMouseEnter = useCallback(
    (e: React.MouseEvent, item: AssigneeItemResponse) => {
      const featureName = item.feature?.title || "";
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        item,
        featureName,
      });
    },
    [],
  );

  const handleBarMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // ─── Resize/Move handlers ───
  const handleResizeStart = useCallback(
    (
      e: React.MouseEvent,
      item: AssigneeItemResponse,
      assigneeIndex: number,
      type: "resize-left" | "resize-right" | "move",
    ) => {
      e.stopPropagation();
      e.preventDefault();

      if (!item.start_date && !item.due_date) return;

      const startDate = item.start_date || item.due_date!;
      const dueDate = item.due_date || item.start_date!;

      wasDraggedRef.current = true;

      // Compute cursor's day-column index at mousedown for grid-aligned snapping
      const container = scrollContainerRef.current;
      const containerRect = container?.getBoundingClientRect();
      const scrollLeft = container?.scrollLeft || 0;
      const cursorContentX =
        e.clientX - (containerRect?.left || 0) - LEFT_COL_WIDTH + scrollLeft;
      const initialCursorDayIndex = Math.floor(cursorContentX / DAY_WIDTH);

      const rowId = rows[assigneeIndex]?.id || null;
      const newDragState: DragState = {
        itemId: item.id,
        taskId: item.task?.id || "",
        assigneeId: rowId && rowId !== "__unassigned__" ? rowId : null,
        assigneeIndex,
        startDate,
        dueDate,
        featureColor: item.feature?.color || "#6366F1",
        dragType: type,
        initialCursorDayIndex,
        currentDeltaDays: 0,
      };

      setDragState(newDragState);
      dragStateRef.current = newDragState;
      document.body.style.userSelect = "none";
      document.body.style.cursor = type === "move" ? "grabbing" : "ew-resize";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const ds = dragStateRef.current;
        if (!ds) return;

        // Compute current cursor day-column index for grid-aligned delta
        const cont = scrollContainerRef.current;
        const rect = cont?.getBoundingClientRect();
        const sl = cont?.scrollLeft || 0;
        const contentX =
          moveEvent.clientX - (rect?.left || 0) - LEFT_COL_WIDTH + sl;
        const currentDayIndex = Math.floor(contentX / DAY_WIDTH);
        const deltaDays = currentDayIndex - ds.initialCursorDayIndex;

        if (deltaDays !== ds.currentDeltaDays) {
          const updated = { ...ds, currentDeltaDays: deltaDays };
          dragStateRef.current = updated;
          setDragState(updated);
        }
      };

      const handleMouseUp = async () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        const ds = dragStateRef.current;
        if (!ds || ds.currentDeltaDays === 0) {
          setDragState(null);
          dragStateRef.current = null;
          return;
        }

        let newStart = ds.startDate;
        let newDue = ds.dueDate;

        if (ds.dragType === "move") {
          newStart = addDaysToDate(ds.startDate, ds.currentDeltaDays);
          newDue = addDaysToDate(ds.dueDate, ds.currentDeltaDays);
        } else if (ds.dragType === "resize-left") {
          newStart = addDaysToDate(ds.startDate, ds.currentDeltaDays);
          // Ensure start <= due
          if (diffDays(newStart, newDue) < 0) {
            newStart = newDue;
          }
        } else if (ds.dragType === "resize-right") {
          newDue = addDaysToDate(ds.dueDate, ds.currentDeltaDays);
          // Ensure due >= start
          if (diffDays(newStart, newDue) < 0) {
            newDue = newStart;
          }
        }

        // Optimistic update: apply new dates to local data immediately
        // so the bar stays at the dragged position without flashing back
        setData((prevData) => {
          if (!prevData) return prevData;
          const updateItems = (
            items: AssigneeItemResponse[],
          ): AssigneeItemResponse[] =>
            items.map((item) =>
              item.id === ds.itemId
                ? { ...item, start_date: newStart, due_date: newDue }
                : item,
            );
          return {
            assignees: prevData.assignees.map((group) => ({
              ...group,
              items: updateItems(group.items),
            })),
            unassigned: updateItems(prevData.unassigned),
          };
        });

        setDragState(null);
        dragStateRef.current = null;

        // Call API to persist, then silently refresh (no loading spinner)
        if (ds.taskId) {
          try {
            await checklistAPI.updateItem(boardId, ds.taskId, ds.itemId, {
              start_date: newStart,
              due_date: newDue,
              assignee_id: ds.assigneeId,
            });
            // Silent refresh without loading spinner
            const result = await boardChecklistAPI.getItemsByAssignee(boardId, {
              start_date: rangeStart,
              end_date: rangeEnd,
            });
            setData(result);
          } catch (err) {
            console.warn("Failed to update checklist item dates", err);
            // Revert: re-fetch server state
            fetchData();
          }
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [boardId, fetchData, rangeStart, rangeEnd, rows],
  );

  // ─── External DnD drop handling ───
  const handleDrop = useCallback(
    (e: React.DragEvent, rowId: string, dayIndex: number) => {
      e.preventDefault();
      setDropHighlight(null);

      try {
        const rawData = e.dataTransfer.getData("application/checklist-item");
        if (!rawData) return;
        const parsed = JSON.parse(rawData);

        if (parsed.id && parsed.task_id) {
          const targetDate = formatDateStr(timelineDays[dayIndex]);
          if (onDropChecklist) {
            onDropChecklist(
              { id: parsed.id, task_id: parsed.task_id },
              targetDate,
              rowId,
            );
          }
        }
      } catch {
        // Ignore invalid data
      }
    },
    [timelineDays, onDropChecklist],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, rowIndex: number, dayIndex: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropHighlight({ rowIndex, dayIndex });
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropHighlight(null);
  }, []);

  // ─── Compute bar styles during drag ───
  const computeDraggedBarPosition = useCallback(
    (item: AssigneeItemResponse) => {
      if (!dragState || dragState.itemId !== item.id) return null;

      let startDate = dragState.startDate;
      let dueDate = dragState.dueDate;

      if (dragState.dragType === "move") {
        startDate = addDaysToDate(startDate, dragState.currentDeltaDays);
        dueDate = addDaysToDate(dueDate, dragState.currentDeltaDays);
      } else if (dragState.dragType === "resize-left") {
        startDate = addDaysToDate(startDate, dragState.currentDeltaDays);
        if (diffDays(startDate, dueDate) < 0) startDate = dueDate;
      } else if (dragState.dragType === "resize-right") {
        dueDate = addDaysToDate(dueDate, dragState.currentDeltaDays);
        if (diffDays(startDate, dueDate) < 0) dueDate = startDate;
      }

      return getBarPosition(startDate, dueDate);
    },
    [dragState, getBarPosition],
  );

  // ─── Header drag-to-scroll ───
  const headerDragRef = useRef<{
    isDown: boolean;
    startX: number;
    scrollLeft: number;
  } | null>(null);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    headerDragRef.current = {
      isDown: true,
      startX: e.clientX,
      scrollLeft: container.scrollLeft,
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const state = headerDragRef.current;
      if (!state?.isDown) return;
      const dx = moveEvent.clientX - state.startX;
      container.scrollLeft = state.scrollLeft - dx;
    };

    const handleMouseUp = () => {
      headerDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-bridge-dark">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  // ─── Empty state: only when no board members at all ───
  if (rows.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-bridge-dark">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <div className="w-14 h-14 rounded-2xl bg-bridge-secondary/10 border border-bridge-secondary/20 flex items-center justify-center">
            <Users className="w-7 h-7 text-bridge-secondary" />
          </div>
          <h2 className="text-sm md:text-lg font-bold text-foreground tracking-tight">
            {t("schedule.subTab.resource", "Workload")}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {t("schedule.resource.noItems", "No items assigned")}
          </p>
        </div>
      </div>
    );
  }

  const totalTimelineWidth = timelineDays.length * DAY_WIDTH;
  const totalContentHeight =
    (milestoneBarData.length > 0 ? MILESTONE_ROW_HEIGHT : 0) +
    rows.length * ROW_HEIGHT;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bridge-dark relative">
      {/* Main scrollable container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto custom-scrollbar"
      >
        <div
          style={{
            width: LEFT_COL_WIDTH + totalTimelineWidth,
            minHeight: HEADER_HEIGHT + totalContentHeight,
          }}
        >
          {/* ─── Header row ─── */}
          <div className="flex sticky top-0 z-20 bg-bridge-obsidian border-b border-foreground/[0.08]">
            {/* Empty left corner */}
            <div
              className="shrink-0 sticky left-0 z-30 bg-bridge-obsidian border-r border-foreground/[0.08]"
              style={{ width: LEFT_COL_WIDTH, height: HEADER_HEIGHT }}
            />

            {/* Day headers — drag to scroll */}
            <div
              className="relative cursor-grab active:cursor-grabbing"
              style={{ width: totalTimelineWidth, height: HEADER_HEIGHT }}
              onMouseDown={handleHeaderMouseDown}
            >
              {timelineDays.map((day, idx) => {
                const weekend = isWeekend(day);
                const isToday = idx === todayIndex;
                const dayNum = day.getDate();
                const showMonth = dayNum === 1 || idx === 0;
                const locale = i18n.language || "en";

                return (
                  <div
                    key={idx}
                    className={`absolute top-0 flex flex-col items-center justify-center border-r border-foreground/[0.04]
                      ${weekend ? "bg-foreground/[0.02]" : ""}
                      ${isToday ? "bg-bridge-accent/5" : ""}`}
                    style={{
                      left: idx * DAY_WIDTH,
                      width: DAY_WIDTH,
                      height: HEADER_HEIGHT,
                    }}
                  >
                    <span
                      className={`text-xs ${weekend ? "text-slate-500" : "text-slate-400"}`}
                    >
                      {getDayLabel(day, locale)}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? "w-6 h-6 rounded-full bg-bridge-accent text-white flex items-center justify-center"
                          : weekend
                            ? "text-slate-500"
                            : "text-foreground"
                      }`}
                    >
                      {dayNum}
                    </span>
                    {showMonth && (
                      <span className="text-xs text-slate-500 absolute top-0.5 left-1">
                        {day.toLocaleDateString(locale, { month: "short" })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Milestone row ─── */}
          {milestoneBarData.length > 0 && (
            <div className="flex border-b border-foreground/[0.08]">
              {/* Left label */}
              <div
                className="shrink-0 sticky left-0 z-10 bg-bridge-obsidian border-r border-foreground/[0.08]
                  flex items-center gap-2 px-4"
                style={{ width: LEFT_COL_WIDTH, height: MILESTONE_ROW_HEIGHT }}
              >
                <Flag size={14} className="text-bridge-accent shrink-0" />
                <span className="text-xs font-medium text-foreground truncate">
                  {t("schedule.resource.milestone", "Milestone")}
                </span>
              </div>

              {/* Timeline area */}
              <div
                className="relative"
                style={{
                  width: totalTimelineWidth,
                  height: MILESTONE_ROW_HEIGHT,
                }}
              >
                {/* Weekend columns */}
                {timelineDays.map(
                  (day, idx) =>
                    isWeekend(day) && (
                      <div
                        key={`mw-${idx}`}
                        className="absolute top-0 bottom-0 bg-foreground/[0.02]"
                        style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                      />
                    ),
                )}

                {/* Milestone bars */}
                {milestoneBarData.map(
                  ({ milestone, pos }) =>
                    pos && (
                      <div
                        key={milestone.id}
                        className="absolute h-7 rounded-lg flex items-center px-2 text-xs font-medium
                        text-white bg-bridge-accent/80 hover:bg-bridge-accent hover:shadow-lg transition-all cursor-pointer"
                        style={{
                          left: pos.left,
                          width: pos.width,
                          top: (MILESTONE_ROW_HEIGHT - 28) / 2,
                        }}
                        title={`${milestone.title} (${milestone.start_date} ~ ${milestone.end_date})`}
                        onClick={() => onMilestoneClick?.(milestone)}
                      >
                        <span className="truncate">{milestone.title}</span>
                      </div>
                    ),
                )}

                {/* Today line */}
                {todayIndex >= 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                    style={{ left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }}
                  />
                )}
              </div>
            </div>
          )}

          {/* ─── Member rows ─── */}
          {rows.map((row, rowIndex) => {
            // Compute bars for this row based on items with valid dates
            const itemsWithBars = row.items
              .filter((item) => item.start_date || item.due_date)
              .map((item) => {
                const isDragging = dragState?.itemId === item.id;
                const pos = isDragging
                  ? computeDraggedBarPosition(item)
                  : getBarPosition(item.start_date, item.due_date);
                return { item, pos, isDragging };
              })
              .filter((d) => d.pos !== null);

            // Stack bars to avoid overlap
            const barLanes = computeBarLanes(
              itemsWithBars.map((d) => ({
                id: d.item.id,
                startDayIndex: d.pos!.startDayIndex,
                endDayIndex: d.pos!.endDayIndex,
              })),
            );

            const maxLane = Math.max(0, ...Object.values(barLanes));
            const isExpanded = expandedRows.has(row.id);
            const needsCollapse = maxLane >= MAX_VISIBLE_LANES;
            const visibleMaxLane = (!isExpanded && needsCollapse)
              ? MAX_VISIBLE_LANES - 1
              : maxLane;
            const hiddenCount = needsCollapse && !isExpanded
              ? itemsWithBars.filter((d) => (barLanes[d.item.id] || 0) >= MAX_VISIBLE_LANES).length
              : 0;
            const COLLAPSE_BTN_HEIGHT = needsCollapse ? 28 : 0;
            const dynamicRowHeight = Math.max(
              ROW_HEIGHT,
              (visibleMaxLane + 1) * (BAR_HEIGHT + BAR_TOP_OFFSET) +
                BAR_TOP_OFFSET * 2 + COLLAPSE_BTN_HEIGHT,
            );

            return (
              <div
                key={row.id}
                className="flex border-b border-foreground/[0.08]"
                style={{ height: dynamicRowHeight }}
                data-resource-row={row.id}
                data-resource-row-index={rowIndex}
              >
                {/* Left label */}
                <div
                  className="shrink-0 sticky left-0 z-10 bg-bridge-obsidian border-r border-foreground/[0.08]
                    flex flex-col px-4 pt-3"
                  style={{ width: LEFT_COL_WIDTH, minHeight: dynamicRowHeight }}
                >
                  <div className="flex items-start gap-2">
                    {row.avatar ? (
                      <img
                        src={row.avatar}
                        alt={row.name}
                        className="w-7 h-7 rounded-full shrink-0 object-cover"
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{
                          backgroundColor:
                            row.id === "__unassigned__"
                              ? "#64748b"
                              : getAssigneeHex(row.name, row.color),
                        }}
                      >
                        {getInitials(row.name)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-foreground truncate mt-1">
                      {row.name}
                    </span>
                  </div>
                  {needsCollapse && (
                    <button
                      className="flex items-center gap-1 mt-1.5 text-xs text-slate-400 hover:text-foreground transition-colors"
                      onClick={() => {
                        setExpandedRows((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) {
                            next.delete(row.id);
                          } else {
                            next.add(row.id);
                          }
                          return next;
                        });
                      }}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp size={12} />
                          {t("schedule.resource.collapse", "Collapse")}
                        </>
                      ) : (
                        <>
                          <ChevronDown size={12} />
                          +{hiddenCount} {t("schedule.resource.more", "more")}
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Timeline area */}
                <div
                  className="relative"
                  style={{
                    width: totalTimelineWidth,
                    minHeight: dynamicRowHeight,
                  }}
                  onDragOver={(e) => {
                    const rect =
                      scrollContainerRef.current?.getBoundingClientRect();
                    const scrollLeft =
                      scrollContainerRef.current?.scrollLeft || 0;
                    const di = Math.floor(
                      (e.clientX -
                        (rect?.left || 0) -
                        LEFT_COL_WIDTH +
                        scrollLeft) /
                        DAY_WIDTH,
                    );
                    handleDragOver(e, rowIndex, di);
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    const rect =
                      scrollContainerRef.current?.getBoundingClientRect();
                    const scrollLeft =
                      scrollContainerRef.current?.scrollLeft || 0;
                    const dayIndex = Math.floor(
                      (e.clientX -
                        (rect?.left || 0) -
                        LEFT_COL_WIDTH +
                        scrollLeft) /
                        DAY_WIDTH,
                    );
                    handleDrop(e, row.id, dayIndex);
                  }}
                >
                  {/* Weekend + grid columns */}
                  {timelineDays.map((day, idx) => {
                    const weekend = isWeekend(day);
                    const isHighlighted =
                      dropHighlight?.rowIndex === rowIndex &&
                      dropHighlight?.dayIndex === idx;

                    return (
                      <div
                        key={`grid-${idx}`}
                        data-day-index={idx}
                        className={`absolute top-0 bottom-0 border-r border-foreground/[0.04]
                          ${weekend ? "bg-foreground/[0.02]" : ""}
                          ${isHighlighted ? "bg-bridge-accent/10 ring-2 ring-bridge-accent/30 ring-inset" : ""}`}
                        style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                      />
                    );
                  })}

                  {/* Checklist item bars */}
                  {itemsWithBars.map(
                    ({ item, pos, isDragging: isItemDragging }) => {
                      if (!pos) return null;

                      const lane = barLanes[item.id] || 0;
                      // Hide bars beyond MAX_VISIBLE_LANES when collapsed
                      if (!isExpanded && needsCollapse && lane >= MAX_VISIBLE_LANES) return null;

                      const featureColor = item.feature?.color || "#6366F1";
                      const barTop =
                        BAR_TOP_OFFSET + lane * (BAR_HEIGHT + BAR_TOP_OFFSET);

                      return (
                        <div
                          key={item.id}
                          className={`absolute rounded-lg flex items-center px-2 text-xs font-medium
                          text-white cursor-pointer hover:brightness-110 hover:shadow-lg transition-all
                          ${item.completed ? "opacity-50" : ""}
                          ${isItemDragging ? "z-20 shadow-2xl ring-2 ring-white/30" : ""}`}
                          style={{
                            left: pos.left,
                            width: pos.width,
                            top: barTop,
                            height: BAR_HEIGHT,
                            backgroundColor: featureColor,
                          }}
                          onClick={() => handleBarClick(item)}
                          onMouseDown={(e) => {
                            // Ignore if clicking on resize handles
                            if ((e.target as HTMLElement).dataset.resizeHandle)
                              return;
                            handleResizeStart(e, item, rowIndex, "move");
                          }}
                          onMouseEnter={(e) => handleBarMouseEnter(e, item)}
                          onMouseLeave={handleBarMouseLeave}
                        >
                          {/* Left resize handle */}
                          <div
                            data-resize-handle="true"
                            className="absolute top-0 left-0 w-2 h-full cursor-ew-resize
                            hover:bg-white/30 rounded-l-lg"
                            onMouseDown={(e) =>
                              handleResizeStart(
                                e,
                                item,
                                rowIndex,
                                "resize-left",
                              )
                            }
                          />

                          {/* Content */}
                          <span
                            className={`truncate flex-1 ${item.completed ? "line-through" : ""}`}
                          >
                            {item.title}
                          </span>
                          {item.completed && (
                            <CheckCircle2 size={12} className="ml-1 shrink-0" />
                          )}

                          {/* Right resize handle */}
                          <div
                            data-resize-handle="true"
                            className="absolute top-0 right-0 w-2 h-full cursor-ew-resize
                            hover:bg-white/30 rounded-r-lg"
                            onMouseDown={(e) =>
                              handleResizeStart(
                                e,
                                item,
                                rowIndex,
                                "resize-right",
                              )
                            }
                          />
                        </div>
                      );
                    },
                  )}

                  {/* Today line */}
                  {todayIndex >= 0 && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
                      style={{
                        left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2,
                        borderLeft: "1px dashed",
                        borderColor: "rgb(248 113 113)",
                        width: 0,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Tooltip ─── */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-bridge-obsidian border border-foreground/[0.12]
            rounded-lg px-3 py-2 shadow-xl max-w-[240px]"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y + 12,
          }}
        >
          <p className="text-xs font-medium text-foreground truncate">
            {tooltip.item.title}
          </p>
          {tooltip.featureName && (
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {tooltip.featureName}
              {tooltip.item.task && ` > ${tooltip.item.task.title}`}
            </p>
          )}
          {(tooltip.item.start_date || tooltip.item.due_date) && (
            <p className="text-xs text-slate-400 mt-1">
              {tooltip.item.start_date || "?"} ~ {tooltip.item.due_date || "?"}
            </p>
          )}
          {tooltip.item.completed && (
            <span className="text-xs font-bold text-emerald-400 mt-0.5 block">
              {t("schedule.resource.completed", "Completed")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

ScheduleResourceView.displayName = "ScheduleResourceView";

// ========================================
// Bar lane computation (stack bars to avoid overlap)
// ========================================

interface BarRange {
  id: string;
  startDayIndex: number;
  endDayIndex: number;
}

function computeBarLanes(bars: BarRange[]): Record<string, number> {
  // Sort by start, then by width (wider first)
  const sorted = [...bars].sort((a, b) => {
    if (a.startDayIndex !== b.startDayIndex)
      return a.startDayIndex - b.startDayIndex;
    return b.endDayIndex - b.startDayIndex - (a.endDayIndex - a.startDayIndex);
  });

  const lanes: Record<string, number> = {};
  const laneEnds: number[] = []; // Track where each lane's last bar ends

  for (const bar of sorted) {
    let assigned = false;
    for (let lane = 0; lane < laneEnds.length; lane++) {
      if (laneEnds[lane] < bar.startDayIndex) {
        lanes[bar.id] = lane;
        laneEnds[lane] = bar.endDayIndex;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      lanes[bar.id] = laneEnds.length;
      laneEnds.push(bar.endDayIndex);
    }
  }

  return lanes;
}
