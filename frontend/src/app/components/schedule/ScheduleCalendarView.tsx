import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isToday,
  getDay,
} from "date-fns";
import { BoardMember } from "../ShareBoardModal";
import {
  boardChecklistAPI,
  AssigneeItemResponse,
  ChecklistByAssigneeResponse,
} from "../../utils/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleCalendarViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  memberColorMap?: Record<string, string | null>;
  onViewTask?: (taskId: string) => void;
  onDropChecklist?: (item: AssigneeItemResponse, targetDate: string) => void;
  /** External drag state forwarded from parent (ChecklistItemPanel ghost) */
  externalDragItem?: AssigneeItemResponse | null;
  /** Increment to trigger data refresh */
  refreshTrigger?: number;
}

/** Normalised calendar item – one per checklist item, pre-processed for rendering */
interface CalendarItem {
  id: string;
  title: string;
  completed: boolean;
  startDate: string | null;
  dueDate: string | null;
  featureColor: string;
  featureTitle: string;
  taskId: string | null;
  taskTitle: string | null;
  assigneeProfileImage: string | null;
  assigneeName: string | null;
}

/** Multiday bar segment that spans across a calendar row */
interface BarSegment {
  item: CalendarItem;
  /** 0-based column index within the week row where this segment starts */
  startCol: number;
  /** How many columns this segment spans */
  span: number;
  /** Row index in the stacking order for the cell (to position vertically) */
  row: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parse date string (YYYY-MM-DD or ISO) to midnight local Date */
function parseDate(dateStr: string): Date {
  // Handle YYYY-MM-DD without timezone shift
  if (dateStr.length === 10) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

/** Format a Date as YYYY-MM-DD */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Flatten the by-assignee response into a single CalendarItem array
 * containing only items that have at least one date set.
 */
function flattenToCalendarItems(
  data: ChecklistByAssigneeResponse,
): CalendarItem[] {
  const items: CalendarItem[] = [];

  const mapItem = (
    item: AssigneeItemResponse,
    assignee: { name: string; profile_image: string | null } | null,
  ): CalendarItem => ({
    id: item.id,
    title: item.title,
    completed: item.completed,
    startDate: item.start_date,
    dueDate: item.due_date,
    featureColor: item.feature?.color || "#6366F1",
    featureTitle: item.feature?.title || "",
    taskId: item.task?.id || null,
    taskTitle: item.task?.title || null,
    assigneeProfileImage: assignee?.profile_image || null,
    assigneeName: assignee?.name || null,
  });

  for (const group of data.assignees) {
    for (const item of group.items) {
      if (item.start_date || item.due_date) {
        items.push(mapItem(item, group.assignee));
      }
    }
  }

  for (const item of data.unassigned) {
    if (item.start_date || item.due_date) {
      items.push(mapItem(item, null));
    }
  }

  return items;
}

/**
 * Compute bar segments for multiday items across a calendar grid.
 * Returns an array of BarSegment for each week-row of the calendar.
 */
function computeBarSegments(
  items: CalendarItem[],
  weeks: Date[][],
): BarSegment[][] {
  return weeks.map((week) => {
    const weekStart = week[0];
    const weekEnd = week[week.length - 1];
    const segments: BarSegment[] = [];

    // Track occupied rows per column for stacking
    const columnMaxRow: number[] = new Array(7).fill(0);

    for (const item of items) {
      if (!item.startDate && !item.dueDate) continue;

      const itemStart = item.startDate
        ? parseDate(item.startDate)
        : parseDate(item.dueDate!);
      const itemEnd = item.dueDate
        ? parseDate(item.dueDate)
        : parseDate(item.startDate!);

      // Skip if item doesn't overlap this week
      if (itemEnd < weekStart || itemStart > weekEnd) continue;

      const clippedStart = itemStart < weekStart ? weekStart : itemStart;
      const clippedEnd = itemEnd > weekEnd ? weekEnd : itemEnd;

      const startCol = getDay(clippedStart);
      const endCol = getDay(clippedEnd);
      const span = endCol - startCol + 1;

      // Find the first available row for the columns this segment spans
      let row = 0;
      for (let c = startCol; c <= endCol; c++) {
        row = Math.max(row, columnMaxRow[c]);
      }
      // Occupy the row
      for (let c = startCol; c <= endCol; c++) {
        columnMaxRow[c] = row + 1;
      }

      segments.push({ item, startCol, span, row });
    }

    return segments;
  });
}

/**
 * Compute dot items: items with only one date set (no range).
 * Returns a Map<dateString, CalendarItem[]>.
 */
function computeDotItems(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();

  for (const item of items) {
    const hasRange = item.startDate && item.dueDate;
    if (hasRange) continue;

    const dateStr = item.startDate || item.dueDate;
    if (!dateStr) continue;

    const existing = map.get(dateStr) || [];
    existing.push(item);
    map.set(dateStr, existing);
  }

  return map;
}

// Maximum visible bars per cell row before "+N more" is shown
const MAX_VISIBLE_BARS = 3;
const BAR_HEIGHT = 24; // h-6 = 24px
const BAR_GAP = 2;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleCalendarView({
  boardId,
  boardMembers: _boardMembers,
  memberColorMap: _memberColorMap,
  onViewTask,
  onDropChecklist,
  externalDragItem,
  refreshTrigger,
}: ScheduleCalendarViewProps) {
  const { t } = useTranslation();

  // ------ State ------
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [data, setData] = useState<ChecklistByAssigneeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  // DnD drop target
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  // ------ Data fetching ------
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      // Expand range to include cells from adjacent months visible in the grid
      const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

      const response = await boardChecklistAPI.getItemsByAssignee(boardId, {
        start_date: toDateString(gridStart),
        end_date: toDateString(gridEnd),
      });
      setData(response);
    } catch (err) {
      // Silently handle – data stays null and empty state shown
    } finally {
      setIsLoading(false);
    }
  }, [boardId, currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh when parent triggers (e.g. after external drop)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // ------ Calendar grid computation ------
  const weeks: Date[][] = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const result: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      result.push(allDays.slice(i, i + 7));
    }
    return result;
  }, [currentMonth]);

  // ------ Calendar items ------
  const calendarItems = useMemo(() => {
    if (!data) return [];
    const all = flattenToCalendarItems(data);
    if (!showCompleted) return all.filter((i) => !i.completed);
    return all;
  }, [data, showCompleted]);

  // Items that span multiple days (have both start_date and due_date)
  const multidayItems = useMemo(
    () => calendarItems.filter((i) => i.startDate && i.dueDate),
    [calendarItems],
  );

  // Items that are dots (only one date)
  const dotItemsMap = useMemo(
    () => computeDotItems(calendarItems),
    [calendarItems],
  );

  // Bar segments per week row
  const barSegmentsByWeek = useMemo(
    () => computeBarSegments(multidayItems, weeks),
    [multidayItems, weeks],
  );

  // ------ Navigation ------
  const handlePrevMonth = useCallback(
    () => setCurrentMonth((m) => subMonths(m, 1)),
    [],
  );
  const handleNextMonth = useCallback(
    () => setCurrentMonth((m) => addMonths(m, 1)),
    [],
  );
  const handleToday = useCallback(() => setCurrentMonth(new Date()), []);

  // ------ DnD drop target tracking ------
  useEffect(() => {
    if (!externalDragItem) {
      setDropTargetDate(null);
      dropTargetRef.current = null;
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Find which cell the cursor is over
      let found: string | null = null;
      cellRefs.current.forEach((cell, dateStr) => {
        const rect = cell.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          found = dateStr;
        }
      });
      dropTargetRef.current = found;
      setDropTargetDate(found);
    };

    const handleMouseUp = () => {
      if (dropTargetRef.current && externalDragItem && onDropChecklist) {
        onDropChecklist(externalDragItem, dropTargetRef.current);
      }
      dropTargetRef.current = null;
      setDropTargetDate(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [externalDragItem, onDropChecklist]);

  // ------ Bar click handler ------
  const handleBarClick = useCallback(
    (item: CalendarItem) => {
      if (item.taskId && onViewTask) {
        onViewTask(item.taskId);
      }
    },
    [onViewTask],
  );

  // ------ Render helpers ------
  const renderBar = useCallback(
    (item: CalendarItem, widthPercent: number = 100) => {
      const completedClasses = item.completed ? "opacity-50" : "";
      return (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          aria-label={`${item.title}${item.completed ? " (completed)" : ""}`}
          className={`h-6 rounded-md px-1.5 flex items-center gap-1 text-[10px] font-medium
            text-white truncate cursor-pointer hover:brightness-110 transition-all ${completedClasses}`}
          style={{
            backgroundColor: item.featureColor,
            width: `${widthPercent}%`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            handleBarClick(item);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleBarClick(item);
            }
          }}
        >
          {item.assigneeProfileImage && (
            <img
              src={item.assigneeProfileImage}
              alt={item.assigneeName || ""}
              className="w-4 h-4 rounded-full shrink-0"
            />
          )}
          <span className={`truncate ${item.completed ? "line-through" : ""}`}>
            {item.title}
          </span>
        </div>
      );
    },
    [handleBarClick],
  );

  const renderDot = useCallback(
    (item: CalendarItem) => {
      const completedClasses = item.completed ? "opacity-50" : "";
      return (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          aria-label={`${item.title}${item.completed ? " (completed)" : ""}`}
          className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] truncate
            cursor-pointer hover:bg-foreground/5 transition-colors ${completedClasses}`}
          onClick={(e) => {
            e.stopPropagation();
            handleBarClick(item);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleBarClick(item);
            }
          }}
        >
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: item.featureColor }}
          />
          <span
            className={`truncate text-foreground ${item.completed ? "line-through" : ""}`}
          >
            {item.title}
          </span>
        </div>
      );
    },
    [handleBarClick],
  );

  // ------ Loading state ------
  if (isLoading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bridge-dark">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  // ------ Render ------
  return (
    <div
      className="flex-1 flex flex-col h-full bg-bridge-dark overflow-hidden"
      ref={calendarRef}
    >
      {/* ===== Top toolbar ===== */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/[0.08] bg-bridge-obsidian shrink-0">
        <div className="flex items-center gap-2">
          <button
            aria-label={t("schedule.calendar.prevMonth", "Previous month")}
            className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
            onClick={handlePrevMonth}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="px-3 py-1 rounded-lg text-xs font-medium text-bridge-accent hover:bg-bridge-accent/10 transition-colors"
            onClick={handleToday}
          >
            {t("schedule.calendar.today", "Today")}
          </button>
          <button
            aria-label={t("schedule.calendar.nextMonth", "Next month")}
            className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
            onClick={handleNextMonth}
          >
            <ChevronRight size={16} />
          </button>
          <span className="text-sm font-bold text-foreground tracking-tight ml-2">
            {format(currentMonth, "MMMM yyyy")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Completed toggle */}
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="accent-bridge-accent w-3.5 h-3.5"
            />
            {t("schedule.calendar.allCards", "All cards")}
          </label>
        </div>
      </div>

      {/* ===== Calendar grid ===== */}
      <div className="flex-1 overflow-hidden">
        <table
          className="w-full h-full table-fixed border-collapse"
          role="grid"
          aria-label="Monthly calendar"
        >
          {/* Weekday headers */}
          <thead>
            <tr>
              {WEEKDAY_LABELS_EN.map((label, idx) => (
                <th
                  key={idx}
                  scope="col"
                  className="text-[11px] font-bold uppercase tracking-widest text-slate-400
                    py-2 text-center border-b border-foreground/[0.08]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {weeks.map((week, weekIdx) => {
              const segments = barSegmentsByWeek[weekIdx] || [];
              // Compute max row count for this week to size the bar area
              const maxRow = segments.reduce(
                (m, s) => Math.max(m, s.row + 1),
                0,
              );
              const visibleRows = Math.min(maxRow, MAX_VISIBLE_BARS);
              const barAreaHeight = visibleRows * (BAR_HEIGHT + BAR_GAP);

              return (
                <tr key={weekIdx} style={{ height: `${100 / weeks.length}%` }}>
                  {week.map((day, colIdx) => {
                    const dateStr = toDateString(day);
                    const inMonth = isSameMonth(day, currentMonth);
                    const today = isToday(day);
                    const isDropTarget = dropTargetDate === dateStr;
                    const dots = dotItemsMap.get(dateStr) || [];

                    // Count how many multiday bar segments start or pass through this column
                    const cellSegments = segments.filter(
                      (s) =>
                        colIdx >= s.startCol && colIdx < s.startCol + s.span,
                    );
                    const overflowCount =
                      cellSegments.filter((s) => s.row >= MAX_VISIBLE_BARS)
                        .length +
                      (dots.length > 0 && visibleRows >= MAX_VISIBLE_BARS
                        ? dots.length
                        : 0);

                    return (
                      <td
                        key={colIdx}
                        ref={(el) => {
                          if (el) cellRefs.current.set(dateStr, el);
                        }}
                        role="gridcell"
                        aria-label={format(day, "MMMM d, yyyy")}
                        className={`align-top border border-foreground/[0.05] p-1
                          transition-colors relative
                          ${!inMonth ? "opacity-40" : ""}
                          ${isDropTarget ? "bg-bridge-accent/10 ring-2 ring-bridge-accent/30 ring-inset" : ""}
                        `}
                      >
                        {/* Date number */}
                        <div className="flex items-center justify-end mb-1">
                          <span
                            className={`text-[11px] font-medium leading-none
                              ${
                                today
                                  ? "bg-bridge-accent text-white w-6 h-6 rounded-full flex items-center justify-center font-bold"
                                  : inMonth
                                    ? "text-foreground"
                                    : "text-slate-500"
                              }
                            `}
                          >
                            {day.getDate()}
                          </span>
                        </div>

                        {/* Multiday bar area – rendered absolutely positioned within cell row */}
                        {colIdx === 0 && barAreaHeight > 0 && (
                          <div
                            className="absolute left-0 right-0 pointer-events-none"
                            style={{
                              top: "28px",
                              height: `${barAreaHeight}px`,
                            }}
                          >
                            {segments
                              .filter((s) => s.row < MAX_VISIBLE_BARS)
                              .map((segment) => {
                                const leftPercent =
                                  (segment.startCol / 7) * 100;
                                const widthPercent = (segment.span / 7) * 100;
                                const topPx =
                                  segment.row * (BAR_HEIGHT + BAR_GAP);

                                return (
                                  <div
                                    key={segment.item.id}
                                    className="absolute pointer-events-auto"
                                    style={{
                                      left: `calc(${leftPercent}% + 4px)`,
                                      width: `calc(${widthPercent}% - 8px)`,
                                      top: `${topPx}px`,
                                      height: `${BAR_HEIGHT}px`,
                                    }}
                                  >
                                    {renderBar(segment.item)}
                                  </div>
                                );
                              })}
                          </div>
                        )}

                        {/* Dot items (single-date items) */}
                        <div
                          className="flex flex-col gap-0.5"
                          style={{
                            marginTop:
                              colIdx === 0
                                ? `${barAreaHeight + 2}px`
                                : `${barAreaHeight + 2}px`,
                          }}
                        >
                          {dots
                            .slice(0, MAX_VISIBLE_BARS)
                            .map((item) => renderDot(item))}
                        </div>

                        {/* Overflow indicator – pinned to bottom */}
                        {overflowCount > 0 && (
                          <div className="absolute bottom-1 right-1 text-[9px] text-slate-400">
                            +{overflowCount} more
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

ScheduleCalendarView.displayName = "ScheduleCalendarView";
