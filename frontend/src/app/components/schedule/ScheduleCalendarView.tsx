import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Loader2, Briefcase } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { JobRole } from "../../types";
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
import { useHolidays, HolidayInfo } from "../../hooks/useHolidays";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleCalendarViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  memberColorMap?: Record<string, string | null>;
  jobRoles?: JobRole[];
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
  assigneeJobRoleId: string | null;
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
    assignee: {
      name: string;
      profile_image: string | null;
      job_role?: { id: string } | null;
    } | null,
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
    assigneeJobRoleId: assignee?.job_role?.id || null,
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
 * Compute bar segments for ALL dated items (single-day and multiday) across the
 * calendar grid. Single-day items naturally collapse to a 1-column span. Items
 * are placed into stacking lanes (rows) so nothing overlaps. Returns an array of
 * BarSegment for each week-row of the calendar.
 */
function computeBarSegments(
  items: CalendarItem[],
  weeks: Date[][],
): BarSegment[][] {
  // Stable lane order: earliest start first, then longest duration first, then id.
  // Longer multiday bars settle into top lanes, single-day items cascade below.
  const sorted = [...items].sort((a, b) => {
    const aStart = a.startDate || a.dueDate || "";
    const bStart = b.startDate || b.dueDate || "";
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    // Same start: longer span first (later end → top lane)
    const aEnd = a.dueDate || a.startDate || "";
    const bEnd = b.dueDate || b.startDate || "";
    if (aEnd !== bEnd) return aEnd > bEnd ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  return weeks.map((week) => {
    const weekStart = week[0];
    const weekEnd = week[week.length - 1];
    const segments: BarSegment[] = [];

    // Track occupied rows per column for stacking
    const columnMaxRow: number[] = new Array(7).fill(0);

    for (const item of sorted) {
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

// Maximum visible bars per cell row before "+N more" is shown
const MAX_VISIBLE_BARS = 3;
const BAR_HEIGHT = 24; // h-6 = 24px
const BAR_GAP = 2;
// Vertical offset where the bar overlay starts (cell padding p-1 = 4px + today badge h-6 = 24px)
const HEADER_HEIGHT = 28;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleCalendarView({
  boardId,
  boardMembers: _boardMembers,
  memberColorMap: _memberColorMap,
  jobRoles = [],
  onViewTask,
  onDropChecklist,
  externalDragItem,
  refreshTrigger,
}: ScheduleCalendarViewProps) {
  const { t, i18n } = useTranslation();

  // ------ State ------
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [data, setData] = useState<ChecklistByAssigneeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  // 직군 필터 (멀티 선택, 빈 Set = 전체)
  const jobRoleFilterKey = `scheduleCalendarJobRoleFilter_${boardId}`;
  const [selectedJobRoleIds, setSelectedJobRoleIds] = useState<Set<string>>(
    () => {
      if (typeof window === "undefined") return new Set();
      try {
        const raw = window.localStorage.getItem(jobRoleFilterKey);
        return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
      } catch {
        return new Set();
      }
    },
  );
  const toggleJobRoleFilter = useCallback(
    (key: string) => {
      setSelectedJobRoleIds((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        try {
          window.localStorage.setItem(
            jobRoleFilterKey,
            JSON.stringify([...next]),
          );
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [jobRoleFilterKey],
  );
  const clearJobRoleFilter = useCallback(() => {
    setSelectedJobRoleIds(new Set());
    try {
      window.localStorage.removeItem(jobRoleFilterKey);
    } catch {
      /* ignore */
    }
  }, [jobRoleFilterKey]);

  // DnD drop target
  const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  // Refresh when parent triggers (e.g. after external drop) — debounced to batch rapid updates
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      const timer = setTimeout(() => fetchData(), 400);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // ------ Holidays (cover prev/current/next year for grid spillover) ------
  const calendarYear = currentMonth.getFullYear();
  const { holidayMap: hPrev } = useHolidays(i18n.language, calendarYear - 1);
  const { holidayMap: hCur } = useHolidays(i18n.language, calendarYear);
  const { holidayMap: hNext } = useHolidays(i18n.language, calendarYear + 1);
  const holidayMap = useMemo(() => {
    const merged = new Map<string, HolidayInfo[]>();
    [hPrev, hCur, hNext].forEach((m) => m.forEach((v, k) => merged.set(k, v)));
    return merged;
  }, [hPrev, hCur, hNext]);

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
    let all = flattenToCalendarItems(data);
    if (!showCompleted) all = all.filter((i) => !i.completed);
    // 직군 필터: 빈 Set이면 전체, 아니면 선택된 직군 OR "__none__"(미지정 포함)만
    if (selectedJobRoleIds.size > 0) {
      all = all.filter((i) => {
        const key = i.assigneeJobRoleId || "__none__";
        return selectedJobRoleIds.has(key);
      });
    }
    return all;
  }, [data, showCompleted, selectedJobRoleIds]);

  // Bar segments per week row — all dated items (single-day collapse to 1-col bars)
  const barSegmentsByWeek = useMemo(
    () => computeBarSegments(calendarItems, weeks),
    [calendarItems, weeks],
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
          className={`h-6 rounded-md px-1.5 flex items-center gap-1 text-xs font-medium
            truncate cursor-pointer hover:brightness-110 transition-all ${completedClasses} text-white`}
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
          <IconButton
            aria-label={t("schedule.calendar.prevMonth", "Previous month")}
            onClick={handlePrevMonth}
          >
            <ChevronLeft />
          </IconButton>
          <button
            className="px-3 py-1 rounded-lg text-xs font-medium text-bridge-accent hover:bg-bridge-accent/10 transition-colors"
            onClick={handleToday}
          >
            {t("schedule.calendar.today", "Today")}
          </button>
          <IconButton
            aria-label={t("schedule.calendar.nextMonth", "Next month")}
            onClick={handleNextMonth}
          >
            <ChevronRight />
          </IconButton>
          <span className="text-sm font-bold text-foreground tracking-tight ml-2">
            {format(currentMonth, "MMMM yyyy")}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 직군 필터 칩 */}
          {jobRoles.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Briefcase className="w-3.5 h-3.5 text-slate-500" />
              {jobRoles.map((r) => {
                const active = selectedJobRoleIds.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleJobRoleFilter(r.id)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition-all ${
                      active ? "ring-1" : "opacity-60 hover:opacity-100"
                    }`}
                    style={{
                      backgroundColor: active
                        ? `${r.color || "#6366F1"}26`
                        : "rgba(255,255,255,0.04)",
                      color: active ? r.color || "#6366F1" : "rgb(148 163 184)",
                      borderColor: r.color || "#6366F1",
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: r.color || "#6366F1" }}
                    />
                    {r.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => toggleJobRoleFilter("__none__")}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition-all ${
                  selectedJobRoleIds.has("__none__")
                    ? "bg-slate-500/20 text-slate-300 ring-1 ring-slate-500/50"
                    : "bg-foreground/[0.04] text-slate-500 hover:opacity-100 opacity-60"
                }`}
              >
                {t("jobRole.unassigned", "미지정")}
              </button>
              {selectedJobRoleIds.size > 0 && (
                <button
                  type="button"
                  onClick={clearJobRoleFilter}
                  className="text-xs text-slate-500 hover:text-foreground px-1.5"
                  title={t("common.clear", "Clear")}
                >
                  ×
                </button>
              )}
            </div>
          )}

          {/* Completed toggle */}
          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
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
      <div
        className="flex-1 overflow-hidden flex flex-col"
        role="grid"
        aria-label="Monthly calendar"
      >
        {/* Weekday headers */}
        <div
          role="row"
          className="grid grid-cols-7 border-b border-foreground/[0.08]"
        >
          {WEEKDAY_LABELS_EN.map((label, idx) => (
            <div
              key={idx}
              role="columnheader"
              className="text-xs font-bold uppercase tracking-widest text-slate-400 py-2 text-center"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div
          role="rowgroup"
          className="flex-1 grid"
          style={{
            gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))`,
          }}
        >
          {weeks.map((week, weekIdx) => {
            const segments = barSegmentsByWeek[weekIdx] || [];

            return (
              <div
                key={weekIdx}
                role="row"
                className="relative grid grid-cols-7 min-h-0"
              >
                {week.map((day, colIdx) => {
                  const dateStr = toDateString(day);
                  const inMonth = isSameMonth(day, currentMonth);
                  const today = isToday(day);
                  const isDropTarget = dropTargetDate === dateStr;
                  const holidays = holidayMap.get(dateStr);
                  const isHoliday = !!holidays && holidays.length > 0;
                  const holidayName = isHoliday
                    ? holidays!.map((h) => h.name).join(", ")
                    : undefined;

                  // Count hidden segments (row >= MAX_VISIBLE_BARS) overlapping this column
                  const overflowCount = segments.filter(
                    (s) =>
                      colIdx >= s.startCol &&
                      colIdx < s.startCol + s.span &&
                      s.row >= MAX_VISIBLE_BARS,
                  ).length;

                  return (
                    <div
                      key={colIdx}
                      ref={(el) => {
                        if (el) cellRefs.current.set(dateStr, el);
                      }}
                      role="gridcell"
                      aria-label={format(day, "MMMM d, yyyy")}
                      title={holidayName}
                      className={`align-top border border-foreground/[0.05] p-1
                        transition-colors relative min-w-0 overflow-hidden
                        ${!inMonth ? "opacity-40" : ""}
                        ${isHoliday ? "bg-red-500/[0.04]" : ""}
                        ${isDropTarget ? "bg-bridge-accent/10 ring-2 ring-bridge-accent/30 ring-inset" : ""}
                      `}
                    >
                      {/* Date number + holiday label */}
                      <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                        {isHoliday ? (
                          <span className="text-xs font-medium text-red-400 truncate">
                            {holidayName}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span
                          className={`text-xs font-medium leading-none shrink-0
                            ${
                              today
                                ? "bg-bridge-accent text-white w-6 h-6 rounded-full flex items-center justify-center font-bold"
                                : isHoliday
                                  ? "text-red-400"
                                  : inMonth
                                    ? "text-foreground"
                                    : "text-slate-500"
                            }
                          `}
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      {/* Overflow indicator – pinned to bottom */}
                      {overflowCount > 0 && (
                        <div className="absolute bottom-1 right-1 text-xs text-slate-400">
                          +{overflowCount} more
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Item bar overlay – spans the full week row (single + multiday) */}
                {segments.length > 0 && (
                  <div
                    className="absolute inset-x-0 bottom-0 pointer-events-none overflow-hidden"
                    style={{
                      top: `${HEADER_HEIGHT}px`,
                    }}
                  >
                    {segments
                      .filter((s) => s.row < MAX_VISIBLE_BARS)
                      .map((segment) => {
                        const leftPercent = (segment.startCol / 7) * 100;
                        const widthPercent = (segment.span / 7) * 100;
                        const topPx = segment.row * (BAR_HEIGHT + BAR_GAP);

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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

ScheduleCalendarView.displayName = "ScheduleCalendarView";
