import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Layers, ListChecks, X, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Feature, Task, ChecklistItem } from '../types';
import { useHolidays } from '../hooks/useHolidays';

interface CalendarViewProps {
  boardId: string;
  features: Feature[];
  tasks: Task[];
  checklistDataMap: { [taskId: string]: ChecklistItem[] };
  onViewFeature: (featureId: string) => void;
  onViewTask: (taskId: string) => void;
}

// ── helpers ──

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Task status → color
function getTaskStatusBorder(task: Task, today: Date): string {
  if (task.completed) return '#10b981'; // emerald-500
  const dueDate = task.due_date ? parseLocalDate(task.due_date) : null;
  if (dueDate) {
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    if (dueNorm < todayNorm) return '#ef4444'; // red-500
    const tomorrow = new Date(todayNorm);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isSameDay(dueNorm, todayNorm) || isSameDay(dueNorm, tomorrow)) return '#f97316'; // orange-500
  }
  const startDate = task.start_date ? parseLocalDate(task.start_date) : null;
  if (startDate) {
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (startDate > todayNorm) return '#71717a'; // zinc-500
  }
  return '#2dd4bf'; // bridge-secondary (teal)
}

function getStatusLabel(task: Task, today: Date, t: (key: string, fallback: string) => string): string {
  if (task.completed) return t('weeklySchedule.completed', '완료');
  const dueDate = task.due_date ? parseLocalDate(task.due_date) : null;
  if (dueDate) {
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    if (dueNorm < todayNorm) return t('weeklySchedule.overdue', '마감 초과');
    const tomorrow = new Date(todayNorm);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isSameDay(dueNorm, todayNorm) || isSameDay(dueNorm, tomorrow)) return t('weeklySchedule.dueSoon', '마감 임박');
  }
  return t('weeklySchedule.inProgress', '진행 중');
}

// ── per-day grouped data ──

interface DayFeatureGroup {
  feature: Feature;
  tasks: Task[];
}

interface DayData {
  featureGroups: DayFeatureGroup[];
  orphanTasks: Task[];
}

interface WeekFeatureSpan {
  feature: Feature;
  startCol: number;
  endCol: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

const MAX_VISIBLE_GROUPS = 2;
const MAX_TASKS_PER_FEATURE = 2;
const LANE_HEIGHT = 22;

// ── component ──

export function CalendarView({ features, tasks, checklistDataMap, onViewFeature, onViewTask }: CalendarViewProps) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [modalDate, setModalDate] = useState<{ dateKey: string; date: Date } | null>(null);

  // Holidays
  const { holidayMap } = useHolidays(i18n.language, currentYear);

  const dayLabels = [
    t('calendar.sun', '일'),
    t('calendar.mon', '월'),
    t('calendar.tue', '화'),
    t('calendar.wed', '수'),
    t('calendar.thu', '목'),
    t('calendar.fri', '금'),
    t('calendar.sat', '토'),
  ];

  // ── navigation ──
  const goToPrevMonth = useCallback(() => {
    setCurrentMonth((m) => { if (m === 0) { setCurrentYear((y) => y - 1); return 11; } return m - 1; });
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth((m) => { if (m === 11) { setCurrentYear((y) => y + 1); return 0; } return m + 1; });
  }, []);

  const goToToday = useCallback(() => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  }, [today]);

  // ── calendar grid ──
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({ date: new Date(currentYear, currentMonth, -i), isCurrentMonth: false });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ date: new Date(currentYear, currentMonth, d), isCurrentMonth: true });
    }
    const remainingSlots = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remainingSlots; i++) {
      days.push({ date: new Date(currentYear, currentMonth + 1, i), isCurrentMonth: false });
    }
    return days;
  }, [currentYear, currentMonth]);

  // Feature lookup
  const featureMap = useMemo(() => {
    const m = new Map<string, Feature>();
    features.forEach((f) => m.set(f.id, f));
    return m;
  }, [features]);

  // ── build per-day data with Feature→Task grouping ──
  const dayDataMap = useMemo(() => {
    const map = new Map<string, DayData>();

    const ensureDay = (dateKey: string): DayData => {
      if (!map.has(dateKey)) map.set(dateKey, { featureGroups: [], orphanTasks: [] });
      return map.get(dateKey)!;
    };

    const dayTaskSets = new Map<string, Set<string>>();

    tasks.forEach((task) => {
      const start = task.start_date;
      const end = task.due_date;
      if (!start && !end) return;

      const gridStart = calendarDays[0]?.date;
      const gridEnd = calendarDays[calendarDays.length - 1]?.date;
      if (!gridStart || !gridEnd) return;

      const effectiveStart = start ? parseLocalDate(start) : parseLocalDate(end!);
      const effectiveEnd = end ? parseLocalDate(end) : parseLocalDate(start!);

      const clampedStart = effectiveStart < gridStart ? gridStart : effectiveStart;
      const clampedEnd = effectiveEnd > gridEnd ? gridEnd : effectiveEnd;

      const cursor = new Date(clampedStart);
      while (cursor <= clampedEnd) {
        const dateKey = toDateKey(cursor);
        if (!dayTaskSets.has(dateKey)) dayTaskSets.set(dateKey, new Set());
        dayTaskSets.get(dateKey)!.add(task.id);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    const taskMap = new Map<string, Task>();
    tasks.forEach((t) => taskMap.set(t.id, t));

    dayTaskSets.forEach((taskIds, dateKey) => {
      const day = ensureDay(dateKey);
      const featureTaskMap = new Map<string, Task[]>();
      const orphans: Task[] = [];

      taskIds.forEach((tid) => {
        const task = taskMap.get(tid);
        if (!task) return;
        const feature = featureMap.get(task.feature_id);
        if (feature) {
          if (!featureTaskMap.has(feature.id)) featureTaskMap.set(feature.id, []);
          featureTaskMap.get(feature.id)!.push(task);
        } else {
          orphans.push(task);
        }
      });

      featureTaskMap.forEach((fTasks, fId) => {
        const feature = featureMap.get(fId)!;
        day.featureGroups.push({ feature, tasks: fTasks });
      });

      day.featureGroups.sort((a, b) => a.feature.position - b.feature.position);
      day.orphanTasks = orphans;
    });

    features.forEach((f) => {
      if (!f.due_date) return;
      const dk = f.due_date.substring(0, 10);
      const day = ensureDay(dk);
      const alreadyHasFeature = day.featureGroups.some((g) => g.feature.id === f.id);
      if (!alreadyHasFeature) {
        day.featureGroups.unshift({ feature: f, tasks: [] });
      }
    });

    return map;
  }, [features, tasks, calendarDays, featureMap]);

  // ── feature date ranges (for multi-day spanning bars) ──
  const featureDateRanges = useMemo(() => {
    const ranges = new Map<string, { feature: Feature; minDate: Date; maxDate: Date }>();
    tasks.forEach((task) => {
      if (!task.feature_id) return;
      const feature = featureMap.get(task.feature_id);
      if (!feature) return;
      const s = task.start_date ? parseLocalDate(task.start_date) : null;
      const e = task.due_date ? parseLocalDate(task.due_date) : null;
      if (!s && !e) return;
      const lo = s && e ? new Date(Math.min(s.getTime(), e.getTime())) : (s || e)!;
      const hi = s && e ? new Date(Math.max(s.getTime(), e.getTime())) : (s || e)!;
      if (!ranges.has(feature.id)) {
        ranges.set(feature.id, { feature, minDate: new Date(lo.getTime()), maxDate: new Date(hi.getTime()) });
      } else {
        const r = ranges.get(feature.id)!;
        if (lo < r.minDate) r.minDate = new Date(lo.getTime());
        if (hi > r.maxDate) r.maxDate = new Date(hi.getTime());
      }
    });
    features.forEach((f) => {
      if (!f.due_date) return;
      const d = parseLocalDate(f.due_date.substring(0, 10));
      if (!ranges.has(f.id)) {
        ranges.set(f.id, { feature: f, minDate: d, maxDate: d });
      } else {
        const r = ranges.get(f.id)!;
        if (d < r.minDate) r.minDate = new Date(d.getTime());
        if (d > r.maxDate) r.maxDate = new Date(d.getTime());
      }
    });
    return ranges;
  }, [features, tasks, featureMap]);

  // ── week rows ──
  const weekRows = useMemo(() => {
    const rows: (typeof calendarDays)[] = [];
    for (let i = 0; i < calendarDays.length; i += 7) rows.push(calendarDays.slice(i, i + 7));
    return rows;
  }, [calendarDays]);

  // ── spanning features per week with lane assignment ──
  const weekSpansData = useMemo<WeekFeatureSpan[][]>(() => {
    const DAY_MS = 86400000;
    return weekRows.map((week) => {
      const ws = week[0].date;
      const we = week[6].date;
      const weekStartMs = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate()).getTime();
      const weekEndMs = new Date(we.getFullYear(), we.getMonth(), we.getDate()).getTime();
      const rawSpans: Array<Omit<WeekFeatureSpan, 'lane'>> = [];
      featureDateRanges.forEach(({ feature, minDate, maxDate }) => {
        const minMs = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime();
        const maxMs = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()).getTime();
        if (maxMs < weekStartMs || minMs > weekEndMs) return;
        const clampedStartMs = Math.max(minMs, weekStartMs);
        const clampedEndMs = Math.min(maxMs, weekEndMs);
        const startCol = Math.round((clampedStartMs - weekStartMs) / DAY_MS);
        const endCol = Math.round((clampedEndMs - weekStartMs) / DAY_MS);
        if (endCol > startCol) {
          rawSpans.push({ feature, startCol, endCol, continuesLeft: minMs < weekStartMs, continuesRight: maxMs > weekEndMs });
        }
      });
      rawSpans.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));
      const assigned: WeekFeatureSpan[] = [];
      rawSpans.forEach((span) => {
        let lane = 0;
        while (assigned.some((a) => a.lane === lane && a.startCol <= span.endCol && a.endCol >= span.startCol)) lane++;
        assigned.push({ ...span, lane });
      });
      return assigned;
    });
  }, [weekRows, featureDateRanges]);

  // ── render helpers ──

  const renderChecklistBadge = (task: Task, compact = true) => {
    const items = checklistDataMap[task.id];
    const iconSz = compact ? 9 : 12;
    const textCls = compact ? 'text-[9px]' : 'text-xs';

    if (!items || items.length === 0) {
      if (task.checklist_total && task.checklist_total > 0) {
        return (
          <span className={`flex items-center gap-0.5 ${textCls} text-zinc-500 ml-auto shrink-0`}>
            <ListChecks size={iconSz} />
            {task.checklist_completed || 0}/{task.checklist_total}
          </span>
        );
      }
      return null;
    }
    const done = items.filter((i) => i.completed).length;
    const total = items.length;
    return (
      <span className={`flex items-center gap-0.5 ${textCls} ml-auto shrink-0 ${done === total ? 'text-emerald-400' : 'text-zinc-500'}`}>
        <ListChecks size={iconSz} />
        {done}/{total}
      </span>
    );
  };

  const isToday = (date: Date) => isSameDay(date, today);
  const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;
  const monthLabel = `${currentYear}${t('calendar.yearSuffix', '년')} ${currentMonth + 1}${t('calendar.monthSuffix', '월')}`;

  const getDayItemCount = (day: DayData) => {
    let count = 0;
    day.featureGroups.forEach((g) => { count += 1 + g.tasks.length; });
    count += day.orphanTasks.length;
    return count;
  };

  const openDayModal = (dateKey: string, date: Date) => {
    const dayData = dayDataMap.get(dateKey);
    if (dayData && getDayItemCount(dayData) > 0) {
      setModalDate({ dateKey, date });
    }
  };

  // ── modal data ──
  const modalDayData = modalDate ? dayDataMap.get(modalDate.dateKey) : null;

  return (
    <div className="h-full flex flex-col bg-bridge-dark overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3 border-b border-foreground/5">
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={goToPrevMonth} className="p-1 md:p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-foreground/5 transition-colors">
            <ChevronLeft size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <h2 className="text-sm md:text-base font-bold text-foreground min-w-[80px] md:min-w-[120px] text-center">{monthLabel}</h2>
          <button onClick={goToNextMonth} className="p-1 md:p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-foreground/5 transition-colors">
            <ChevronRight size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-3 mr-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-bridge-secondary" />{t('weeklySchedule.inProgress', '진행 중')}</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />{t('weeklySchedule.dueSoon', '마감 임박')}</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{t('weeklySchedule.overdue', '마감 초과')}</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{t('weeklySchedule.completed', '완료')}</span>
          </div>
          <button onClick={goToToday} className="px-2 md:px-3 py-1 text-[10px] md:text-xs font-medium rounded-lg bg-foreground/5 text-foreground/80 hover:bg-foreground/10 hover:text-foreground transition-colors">
            {t('calendar.today', '오늘')}
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-foreground/5">
        {dayLabels.map((label, i) => (
          <div
            key={label}
            className={`py-1.5 md:py-2 text-center text-[10px] md:text-[11px] font-bold uppercase tracking-widest ${
              i === 0 ? 'text-red-400/70' : i === 6 ? 'text-blue-400/70' : 'text-slate-500'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid - week rows with spanning feature bars */}
      <div className="flex-1 overflow-hidden">
        <div className="grid h-full" style={{ gridTemplateRows: `repeat(${weekRows.length}, 1fr)` }}>
          {weekRows.map((week, weekIdx) => {
            const spans = weekSpansData[weekIdx];
            const maxLane = spans.length > 0 ? Math.max(...spans.map((s) => s.lane)) + 1 : 0;
            const spanningFeatureIds = new Set(spans.map((s) => s.feature.id));

            return (
              <div key={weekIdx} className="grid grid-cols-7 min-h-0 overflow-hidden">
                {week.map(({ date, isCurrentMonth }, colIdx) => {
                  const dateKey = toDateKey(date);
                  const dayData = dayDataMap.get(dateKey);
                  const holidays = holidayMap.get(dateKey) || [];
                  const isTodayCell = isToday(date);
                  const weekend = isWeekend(date);
                  const isHoliday = holidays.length > 0 && isCurrentMonth;

                  const allGroups = dayData?.featureGroups || [];
                  const orphans = dayData?.orphanTasks || [];
                  const totalItems = dayData ? getDayItemCount(dayData) : 0;

                  // Separate spanning vs non-spanning features
                  const nonSpanningGroups = allGroups.filter((g) => !spanningFeatureIds.has(g.feature.id));
                  const spanningTasksForDay = allGroups
                    .filter((g) => spanningFeatureIds.has(g.feature.id))
                    .flatMap((g) => g.tasks);

                  const visibleNonSpanning = nonSpanningGroups.slice(0, MAX_VISIBLE_GROUPS);
                  const visibleSpanningTasks = spanningTasksForDay.slice(0, MAX_TASKS_PER_FEATURE);

                  // Hidden count (items only visible in modal)
                  let hiddenCount = orphans.length;
                  hiddenCount += Math.max(0, spanningTasksForDay.length - MAX_TASKS_PER_FEATURE);
                  nonSpanningGroups.forEach((g, i) => {
                    if (i >= MAX_VISIBLE_GROUPS) {
                      hiddenCount += 1 + g.tasks.length;
                    } else {
                      hiddenCount += Math.max(0, g.tasks.length - MAX_TASKS_PER_FEATURE);
                    }
                  });

                  return (
                    <div
                      key={colIdx}
                      className={`border-b border-r border-foreground/5 flex flex-col overflow-hidden transition-colors ${
                        !isCurrentMonth ? 'bg-white/[0.01]' : isHoliday ? 'bg-red-500/[0.03]' : weekend ? 'bg-white/[0.015]' : ''
                      } ${isTodayCell ? 'ring-1 ring-inset ring-bridge-accent/30 bg-bridge-accent/[0.04]' : ''}`}
                    >
                      {/* Date number + holiday name */}
                      <div className="px-1 md:px-1.5 pt-0.5 md:pt-1 flex items-center gap-1 shrink-0 min-w-0">
                        <button
                          onClick={() => openDayModal(dateKey, date)}
                          className={`text-[10px] md:text-[11px] font-semibold w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full transition-colors shrink-0 ${
                            totalItems > 0 ? 'cursor-pointer hover:bg-foreground/10' : 'cursor-default'
                          } ${
                            isTodayCell
                              ? 'bg-bridge-accent text-white'
                              : !isCurrentMonth
                                ? 'text-zinc-700'
                                : isHoliday || date.getDay() === 0
                                  ? 'text-red-400'
                                  : date.getDay() === 6
                                    ? 'text-blue-400/70'
                                    : 'text-zinc-400'
                          }`}
                        >
                          {date.getDate()}
                        </button>
                        {isHoliday && (
                          <span className="text-[9px] text-red-300/80 truncate font-medium leading-none hidden sm:inline">
                            {holidays[0].name}
                          </span>
                        )}
                        {totalItems > 0 && (
                          <span className="text-[9px] text-zinc-600 tabular-nums ml-auto shrink-0">{totalItems}</span>
                        )}
                      </div>

                      {/* Spanning feature bar slots */}
                      {maxLane > 0 && (
                        <div className="shrink-0 hidden sm:block">
                          {Array.from({ length: maxLane }, (_, lane) => {
                            const span = spans.find(
                              (s) => s.lane === lane && s.startCol <= colIdx && s.endCol >= colIdx,
                            );
                            if (!span) {
                              return <div key={lane} style={{ height: LANE_HEIGHT }} />;
                            }
                            const isStart = colIdx === span.startCol;
                            const isEnd = colIdx === span.endCol;
                            const isVisualStart = isStart && !span.continuesLeft;
                            const isVisualEnd = isEnd && !span.continuesRight;
                            const isFeatureDueDay = span.feature.due_date && span.feature.due_date.substring(0, 10) === dateKey;

                            return (
                              <button
                                key={lane}
                                onClick={(e) => { e.stopPropagation(); onViewFeature(span.feature.id); }}
                                className="w-full flex items-center gap-1 overflow-hidden hover:brightness-125 transition-all"
                                style={{
                                  height: LANE_HEIGHT,
                                  backgroundColor: `${span.feature.color}20`,
                                  borderLeft: isVisualStart ? `3px solid ${span.feature.color}` : 'none',
                                  borderTopLeftRadius: isVisualStart ? 4 : 0,
                                  borderBottomLeftRadius: isVisualStart ? 4 : 0,
                                  borderTopRightRadius: isVisualEnd ? 4 : 0,
                                  borderBottomRightRadius: isVisualEnd ? 4 : 0,
                                  paddingLeft: isStart ? 6 : 2,
                                  paddingRight: isEnd ? 4 : 0,
                                }}
                              >
                                {isStart && <Layers size={10} className="shrink-0 opacity-60" style={{ color: span.feature.color }} />}
                                {isStart && (
                                  <span className="truncate text-[10px] font-semibold text-foreground">{span.feature.title}</span>
                                )}
                                {isFeatureDueDay && (
                                  <span className="ml-auto text-[8px] px-1 py-px rounded bg-foreground/10 text-zinc-400 shrink-0">D-Day</span>
                                )}
                                {isEnd && span.feature.status === 'DONE' && (
                                  <CheckCircle2 size={10} className="ml-auto shrink-0 text-emerald-400" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Mobile: dot indicators only */}
                      {totalItems > 0 && (
                        <div className="sm:hidden flex justify-center gap-0.5 py-0.5">
                          {allGroups.slice(0, 3).map((g) => (
                            <span
                              key={g.feature.id}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: g.feature.color || '#6366F1' }}
                            />
                          ))}
                          {totalItems > 3 && (
                            <span className="text-[8px] text-zinc-500 leading-none">+</span>
                          )}
                        </div>
                      )}

                      {/* Per-day content (desktop) */}
                      <div className="px-0.5 md:px-1.5 pb-0.5 flex-1 space-y-0.5 overflow-hidden hidden sm:block">
                        {/* Tasks from spanning features */}
                        {visibleSpanningTasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={(e) => { e.stopPropagation(); onViewTask(task.id); }}
                            className="w-full flex items-center gap-1.5 pl-2 pr-2 py-0.5 rounded group/t transition-all hover:bg-foreground/5"
                            style={{ borderLeft: `2px solid ${getTaskStatusBorder(task, today)}` }}
                          >
                            {task.completed ? (
                              <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />
                            ) : (
                              <span className="w-[11px] h-[11px] rounded-full border shrink-0" style={{ borderColor: getTaskStatusBorder(task, today) }} />
                            )}
                            <span className={`truncate text-[11px] group-hover/t:text-foreground ${task.completed ? 'text-zinc-500 line-through' : 'text-foreground/80'}`}>
                              {task.title}
                            </span>
                            {renderChecklistBadge(task)}
                          </button>
                        ))}

                        {/* Non-spanning feature groups */}
                        {visibleNonSpanning.map((group) => {
                          const f = group.feature;
                          const visibleTasks = group.tasks.slice(0, MAX_TASKS_PER_FEATURE);
                          const hiddenTaskCount = group.tasks.length - MAX_TASKS_PER_FEATURE;
                          const isFeatureDueDay = f.due_date && f.due_date.substring(0, 10) === dateKey;

                          return (
                            <div key={f.id} className="space-y-0.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); onViewFeature(f.id); }}
                                className="w-full flex items-center gap-1.5 px-2 py-1 rounded group/fh transition-all hover:brightness-125"
                                style={{ backgroundColor: `${f.color}18`, borderLeft: `3px solid ${f.color}` }}
                              >
                                <Layers size={11} className="shrink-0 opacity-60" style={{ color: f.color }} />
                                <span className="truncate text-[11px] font-semibold text-foreground group-hover/fh:text-foreground">
                                  {f.title}
                                </span>
                                {isFeatureDueDay && (
                                  <span className="ml-auto text-[9px] px-1 py-px rounded bg-foreground/10 text-zinc-400 shrink-0">D-Day</span>
                                )}
                                {f.status === 'DONE' && (
                                  <CheckCircle2 size={11} className="ml-auto shrink-0 text-emerald-400" />
                                )}
                              </button>

                              {visibleTasks.map((task) => (
                                <button
                                  key={task.id}
                                  onClick={(e) => { e.stopPropagation(); onViewTask(task.id); }}
                                  className="w-full flex items-center gap-1.5 pl-3.5 pr-2 py-0.5 rounded group/t transition-all hover:bg-foreground/5"
                                  style={{ borderLeft: `2px solid ${getTaskStatusBorder(task, today)}` }}
                                >
                                  {task.completed ? (
                                    <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />
                                  ) : (
                                    <span className="w-[11px] h-[11px] rounded-full border shrink-0" style={{ borderColor: getTaskStatusBorder(task, today) }} />
                                  )}
                                  <span className={`truncate text-[11px] group-hover/t:text-foreground ${task.completed ? 'text-zinc-500 line-through' : 'text-foreground/80'}`}>
                                    {task.title}
                                  </span>
                                  {renderChecklistBadge(task)}
                                </button>
                              ))}

                              {hiddenTaskCount > 0 && (
                                <div className="pl-3.5 text-[9px] text-zinc-600 leading-none">+{hiddenTaskCount}</div>
                              )}
                            </div>
                          );
                        })}

                        {/* More → opens modal */}
                        {hiddenCount > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openDayModal(dateKey, date); }}
                            className="w-full text-[8px] text-zinc-600 hover:text-bridge-secondary text-center leading-none transition-colors"
                          >
                            +{hiddenCount}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Day Detail Modal ── */}
      {modalDate && modalDayData && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModalDate(null)}
        >
          <div
            className="bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl w-full sm:max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-foreground/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-bridge-accent/10 flex items-center justify-center">
                  <Calendar size={18} className="text-bridge-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {modalDate.date.getMonth() + 1}{t('calendar.monthSuffix', '월')} {modalDate.date.getDate()}{t('calendar.daySuffix', '일')} ({dayLabels[modalDate.date.getDay()]})
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {modalDayData.featureGroups.length}{t('calendar.featureCount', '개 피처')} · {modalDayData.featureGroups.reduce((sum, g) => sum + g.tasks.length, 0) + modalDayData.orphanTasks.length}{t('calendar.taskCount', '개 태스크')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalDate(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-3 md:py-4 space-y-3 md:space-y-4">
              {modalDayData.featureGroups.map((group) => {
                const f = group.feature;
                const isFeatureDueDay = f.due_date && f.due_date.substring(0, 10) === modalDate.dateKey;

                return (
                  <div key={f.id} className="space-y-1.5">
                    {/* Feature header */}
                    <button
                      onClick={() => { onViewFeature(f.id); setModalDate(null); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl group/fh transition-all hover:brightness-125"
                      style={{ backgroundColor: `${f.color}12`, borderLeft: `3px solid ${f.color}` }}
                    >
                      <Layers size={14} className="shrink-0 opacity-70" style={{ color: f.color }} />
                      <span className="truncate text-sm font-semibold text-foreground group-hover/fh:text-foreground">
                        {f.title}
                      </span>
                      {isFeatureDueDay && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-foreground/10 text-zinc-400 shrink-0 font-medium">D-Day</span>
                      )}
                      {f.status === 'DONE' && (
                        <CheckCircle2 size={14} className="ml-auto shrink-0 text-emerald-400" />
                      )}
                    </button>

                    {/* Tasks under this feature */}
                    {group.tasks.length > 0 ? (
                      <div className="space-y-0.5">
                        {group.tasks.map((task) => {
                          const statusColor = getTaskStatusBorder(task, today);
                          return (
                            <button
                              key={task.id}
                              onClick={() => { onViewTask(task.id); setModalDate(null); }}
                              className="w-full flex items-center gap-2.5 pl-5 pr-3 py-2 rounded-lg group/t transition-all hover:bg-foreground/5"
                              style={{ borderLeft: `2px solid ${statusColor}` }}
                            >
                              {task.completed ? (
                                <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
                              ) : (
                                <span className="w-3 h-3 rounded-full border-[1.5px] shrink-0" style={{ borderColor: statusColor }} />
                              )}
                              <div className="flex-1 min-w-0 text-left">
                                <span className={`block truncate text-sm group-hover/t:text-foreground ${task.completed ? 'text-zinc-500 line-through' : 'text-foreground/80'}`}>
                                  {task.title}
                                </span>
                                {(task.due_date || task.start_date) && (
                                  <span className="text-[10px] text-zinc-600">
                                    {task.start_date && task.start_date.substring(5, 10).replace('-', '/')}
                                    {task.start_date && task.due_date && ' → '}
                                    {task.due_date && task.due_date.substring(5, 10).replace('-', '/')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ color: statusColor, backgroundColor: `${statusColor}15` }}>
                                  {getStatusLabel(task, today, t)}
                                </span>
                                {renderChecklistBadge(task, false)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="pl-5 text-xs text-zinc-600 italic">{t('calendar.noTasks', '태스크 없음')}</p>
                    )}
                  </div>
                );
              })}

              {/* Orphan tasks */}
              {modalDayData.orphanTasks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                    {t('calendar.otherTasks', '기타 태스크')}
                  </div>
                  {modalDayData.orphanTasks.map((task) => {
                    const statusColor = getTaskStatusBorder(task, today);
                    return (
                      <button
                        key={task.id}
                        onClick={() => { onViewTask(task.id); setModalDate(null); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg group/t transition-all hover:bg-foreground/5"
                        style={{ borderLeft: `2px solid ${statusColor}` }}
                      >
                        {task.completed ? (
                          <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
                        ) : (
                          <span className="w-3 h-3 rounded-full border-[1.5px] shrink-0" style={{ borderColor: statusColor }} />
                        )}
                        <span className={`flex-1 truncate text-sm text-left group-hover/t:text-foreground ${task.completed ? 'text-zinc-500 line-through' : 'text-foreground/80'}`}>
                          {task.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ color: statusColor, backgroundColor: `${statusColor}15` }}>
                          {getStatusLabel(task, today, t)}
                        </span>
                        {renderChecklistBadge(task, false)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal footer - legend */}
            <div className="flex items-center gap-3 md:gap-4 px-4 md:px-6 py-2 md:py-3 border-t border-foreground/5 shrink-0 flex-wrap">
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500"><span className="w-2 h-2 rounded-full bg-bridge-secondary" />{t('weeklySchedule.inProgress', '진행 중')}</span>
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500"><span className="w-2 h-2 rounded-full bg-orange-500" />{t('weeklySchedule.dueSoon', '마감 임박')}</span>
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500"><span className="w-2 h-2 rounded-full bg-red-500" />{t('weeklySchedule.overdue', '마감 초과')}</span>
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500"><span className="w-2 h-2 rounded-full bg-emerald-500" />{t('weeklySchedule.completed', '완료')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
