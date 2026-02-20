import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar, ListTodo, CalendarDays, CheckCircle2, Clock, RotateCw, Trash2, Pencil, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionModal } from '../ui/MotionModal';
import { TimePicker } from '../ui/TimePicker';
import { personalTaskAPI } from '../../utils/api';
import { personalEventService } from '../../utils/services';
import { formatDate } from '../../utils/dateUtils';
import { useHolidays } from '../../hooks/useHolidays';
import type { PersonalTask, PersonalEvent } from '../../types';

// ── helpers ──

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#EAB308',
};

const EVENT_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

const DAY_LABELS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_ITEMS = 3;


interface CalendarItem {
  id: string;
  title: string;
  color: string;
  type: 'task' | 'event';
  isDone: boolean;
  isOverdue: boolean;
  startTime?: string;
  task?: PersonalTask;
  event?: PersonalEvent;
}

// ── component ──

export function PersonalCalendar() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const isKo = i18n.language === 'ko';
  const dayLabels = isKo ? DAY_LABELS_KO : DAY_LABELS_EN;

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [modalDate, setModalDate] = useState<{ dateKey: string; date: Date } | null>(null);

  // Holidays
  const { holidayMap } = useHolidays(i18n.language, currentYear);

  // Event create / edit modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState('');
  const [editEvent, setEditEvent] = useState<PersonalEvent | null>(null);

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

  const weekRows = useMemo(() => {
    const rows: (typeof calendarDays)[] = [];
    for (let i = 0; i < calendarDays.length; i += 7) rows.push(calendarDays.slice(i, i + 7));
    return rows;
  }, [calendarDays]);

  // ── data range for fetching ──
  const gridStartDate = calendarDays[0] ? toDateKey(calendarDays[0].date) : '';
  const gridEndDate = calendarDays.length > 0 ? toDateKey(calendarDays[calendarDays.length - 1].date) : '';

  // ── load tasks ──
  const loadTasks = useCallback(async () => {
    try {
      const data = await personalTaskAPI.getAll();
      setTasks(data.filter(t => t.due_date && t.status !== 'ARCHIVED'));
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // ── load events for the visible month range ──
  const loadEvents = useCallback(async () => {
    if (!gridStartDate || !gridEndDate) return;
    try {
      const data = await personalEventService.getWeekly(gridStartDate, gridEndDate);
      setEvents(data);
    } catch {
      setEvents([]);
    }
  }, [gridStartDate, gridEndDate]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── build per-day items ──
  const dayItemsMap = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();

    // Tasks
    tasks.forEach((task) => {
      if (!task.due_date) return;
      const dk = task.due_date;
      if (!map.has(dk)) map.set(dk, []);
      const isOverdue = dk < todayKey && task.status !== 'DONE';
      map.get(dk)!.push({
        id: `task-${task.id}`,
        title: task.title,
        color: task.color || PRIORITY_COLORS[task.priority] || '#6366F1',
        type: 'task',
        isDone: task.status === 'DONE',
        isOverdue,
        task,
      });
    });

    // Events
    events.forEach((ev) => {
      const dk = ev.event_date;
      if (!map.has(dk)) map.set(dk, []);
      map.get(dk)!.push({
        id: `event-${ev.id}`,
        title: ev.title,
        color: ev.color || '#6366F1',
        type: 'event',
        isDone: false,
        isOverdue: false,
        startTime: ev.start_time?.slice(0, 5),
        event: ev,
      });
    });

    // Sort: events with time first (by time), then tasks, then all-day events
    map.forEach((items) => {
      items.sort((a, b) => {
        if (a.type === 'event' && a.startTime && b.type === 'event' && b.startTime) {
          return a.startTime.localeCompare(b.startTime);
        }
        if (a.type === 'event' && a.startTime) return -1;
        if (b.type === 'event' && b.startTime) return 1;
        if (a.type === 'task' && b.type === 'event') return -1;
        if (a.type === 'event' && b.type === 'task') return 1;
        return 0;
      });
    });

    return map;
  }, [tasks, events, todayKey]);

  // Calendar cell items: exclude recurring events (shown only in detail modal)
  const dayCellItemsMap = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    dayItemsMap.forEach((items, key) => {
      const filtered = items.filter((item) => !(item.event?.recurrence_group_id));
      if (filtered.length > 0) map.set(key, filtered);
    });
    return map;
  }, [dayItemsMap]);

  // ── event CRUD ──
  const handleCreateEvent = async (data: {
    title: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    color: string;
    all_day: boolean;
  }) => {
    try {
      await personalEventService.create({ ...data, event_date: createDate });
      await loadEvents();
      setIsCreateOpen(false);
    } catch (err) {
      console.error('Failed to create event:', err);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await personalEventService.delete(eventId);
      await loadEvents();
      if (editEvent?.id === eventId) setEditEvent(null);
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  const handleUpdateEvent = async (eventId: string, data: {
    title?: string;
    description?: string;
    event_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    color?: string;
    all_day?: boolean;
  }) => {
    try {
      await personalEventService.update(eventId, data);
      await loadEvents();
      setEditEvent(null);
    } catch (err) {
      console.error('Failed to update event:', err);
    }
  };

  // ── render ──
  const monthLabel = isKo
    ? `${currentYear}년 ${currentMonth + 1}월`
    : `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][currentMonth]} ${currentYear}`;

  const isTodayMonth = currentYear === today.getFullYear() && currentMonth === today.getMonth();

  return (
    <div className="h-full flex flex-col bg-bridge-dark overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-foreground/5 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={goToPrevMonth} className="p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-foreground/5 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-base font-bold text-foreground min-w-[140px] text-center">{monthLabel}</h2>
          <button onClick={goToNextMonth} className="p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-foreground/5 transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3 mr-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <ListTodo size={10} className="text-bridge-accent" />
              {t('personal.calendar.task')}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays size={10} className="text-bridge-secondary" />
              {t('personal.calendar.event')}
            </span>
          </div>

          <button
            onClick={goToToday}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              isTodayMonth
                ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white'
                : 'text-bridge-secondary border border-bridge-secondary/30 hover:bg-bridge-secondary/10'
            }`}
          >
            {t('personal.calendar.today')}
          </button>
          <button
            onClick={() => {
              setCreateDate(todayKey);
              setIsCreateOpen(true);
            }}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-bridge-accent text-white text-xs font-bold rounded-lg hover:bg-bridge-accent/90 transition-colors"
          >
            <Plus size={14} />
            <span>{t('personal.calendar.event')}</span>
          </button>
        </div>
      </div>

      {/* Today's schedule */}
      <TodaySchedule
        today={today}
        todayKey={todayKey}
        dayItemsMap={dayItemsMap}
        isKo={isKo}
        onViewAll={() => setModalDate({ dateKey: todayKey, date: today })}
        onAddEvent={() => {
          setCreateDate(todayKey);
          setIsCreateOpen(true);
        }}
        onEditEvent={(ev) => setEditEvent(ev)}
      />

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-foreground/5 shrink-0">
        {dayLabels.map((label, i) => (
          <div
            key={label}
            className={`py-2 text-center text-[11px] font-bold uppercase tracking-widest ${
              i === 0 ? 'text-red-400/70' : i === 6 ? 'text-blue-400/70' : 'text-slate-500'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-hidden">
        <div className="grid h-full" style={{ gridTemplateRows: `repeat(${weekRows.length}, 1fr)` }}>
          {weekRows.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 min-h-0 overflow-hidden">
              {week.map(({ date, isCurrentMonth }, colIdx) => {
                const dateKey = toDateKey(date);
                const cellItems = dayCellItemsMap.get(dateKey) || [];
                const allItems = dayItemsMap.get(dateKey) || [];
                const holidays = holidayMap.get(dateKey) || [];
                const isTodayCell = isSameDay(date, today);
                const isHoliday = holidays.length > 0 && isCurrentMonth;
                const visibleItems = cellItems.slice(0, MAX_VISIBLE_ITEMS);
                const hiddenCount = Math.max(0, cellItems.length - MAX_VISIBLE_ITEMS);

                return (
                  <div
                    key={colIdx}
                    onClick={() => {
                      if (allItems.length > 0) {
                        setModalDate({ dateKey, date });
                      } else {
                        setCreateDate(dateKey);
                        setIsCreateOpen(true);
                      }
                    }}
                    className={`border-b border-r border-foreground/5 flex flex-col overflow-hidden transition-colors cursor-pointer hover:bg-foreground/[0.03] ${
                      !isCurrentMonth ? 'bg-foreground/[0.01]' : isHoliday ? 'bg-red-500/[0.03]' : date.getDay() === 0 || date.getDay() === 6 ? 'bg-foreground/[0.015]' : ''
                    } ${isTodayCell ? 'ring-1 ring-inset ring-bridge-accent/30 bg-bridge-accent/[0.04]' : ''}`}
                  >
                    {/* Date number + holiday name */}
                    <div className="px-1 sm:px-1.5 pt-1 flex items-center gap-1 shrink-0 min-w-0">
                      <span
                        className={`text-[11px] font-semibold w-6 h-6 flex items-center justify-center rounded-full shrink-0 ${
                          isTodayCell
                            ? 'bg-bridge-accent text-white'
                            : !isCurrentMonth
                              ? 'text-muted-foreground/50'
                              : isHoliday || date.getDay() === 0
                                ? 'text-red-400'
                                : date.getDay() === 6
                                  ? 'text-blue-400/70'
                                  : 'text-zinc-400'
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {isHoliday && (
                        <span className="text-[9px] text-red-300/80 truncate font-medium leading-none hidden sm:inline">
                          {holidays[0].name}
                        </span>
                      )}
                      {cellItems.length > 0 && (
                        <span className="text-[9px] text-zinc-600 tabular-nums ml-auto shrink-0">{cellItems.length}</span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="flex-1 space-y-px overflow-hidden">
                      {visibleItems.map((item) => (
                        <div
                          key={item.id}
                          className={`px-1 py-0.5 rounded text-[10px] md:text-[11px] overflow-hidden whitespace-nowrap text-center ${
                            item.isDone ? 'opacity-50' : ''
                          }`}
                          style={{
                            backgroundColor: item.isOverdue ? 'rgba(239,68,68,0.18)' : `${item.color}25`,
                          }}
                        >
                          <span className={`truncate ${item.isDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {item.title}
                          </span>
                        </div>
                      ))}
                      {hiddenCount > 0 && (
                        <div className="text-[9px] text-zinc-600 text-center">+{hiddenCount}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* FAB - 우하단 일정 추가 */}
      <button
        onClick={() => {
          setCreateDate(todayKey);
          setIsCreateOpen(true);
        }}
        className="fixed fab-bottom-safe right-6 w-12 h-12 md:w-14 md:h-14 rounded-full bg-bridge-accent text-white shadow-lg shadow-bridge-accent/30 flex items-center justify-center hover:bg-bridge-accent/90 hover:scale-105 active:scale-95 transition-all z-50"
      >
        <Plus size={20} className="md:w-6 md:h-6" />
      </button>

      {/* ── Day Detail Modal ── */}
      <DayDetailModal
        open={!!modalDate}
        date={modalDate?.date ?? new Date()}
        dateKey={modalDate?.dateKey ?? ''}
        items={modalDate ? (dayItemsMap.get(modalDate.dateKey) || []) : []}
        dayLabels={dayLabels}
        onClose={() => setModalDate(null)}
        onDeleteEvent={handleDeleteEvent}
        onEditEvent={(ev) => { setEditEvent(ev); setModalDate(null); }}
        onAddEvent={() => {
          if (modalDate) {
            setCreateDate(modalDate.dateKey);
            setIsCreateOpen(true);
            setModalDate(null);
          }
        }}
      />

      {/* ── Edit Event Modal ── */}
      <EditEventModal
        open={!!editEvent}
        event={editEvent}
        existingEvents={events}
        onClose={() => setEditEvent(null)}
        onUpdate={handleUpdateEvent}
        onDelete={handleDeleteEvent}
      />

      {/* ── Create Event Modal ── */}
      <CreateEventModal
        open={isCreateOpen}
        date={createDate}
        existingEvents={events}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateEvent}
      />
    </div>
  );
}

// ── Today's Schedule ──

function TodaySchedule({
  today,
  todayKey,
  dayItemsMap,
  isKo,
  onViewAll,
  onAddEvent,
  onEditEvent,
}: {
  today: Date;
  todayKey: string;
  dayItemsMap: Map<string, CalendarItem[]>;
  isKo: boolean;
  onViewAll: () => void;
  onAddEvent: () => void;
  onEditEvent: (event: PersonalEvent) => void;
}) {
  const { t } = useTranslation();
  const items = dayItemsMap.get(todayKey) || [];
  const MAX_PREVIEW = 3;
  const visibleItems = items.slice(0, MAX_PREVIEW);
  const hiddenCount = Math.max(0, items.length - MAX_PREVIEW);

  const dateLabel = isKo
    ? `${today.getMonth() + 1}월 ${today.getDate()}일`
    : `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][today.getMonth()]} ${today.getDate()}`;

  return (
    <div className="mx-3 md:mx-5 my-2.5 border border-bridge-border rounded-xl shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 md:px-4 py-2.5 mb-0 bg-foreground/[0.04] border-b border-foreground/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {t('personal.calendar.todaySchedule', "Today's Schedule")}
          </span>
          <span className="text-[10px] text-zinc-600">{dateLabel}</span>
        </div>
        {items.length > MAX_PREVIEW && (
          <button
            onClick={onViewAll}
            className="text-[10px] text-bridge-accent hover:text-bridge-accent/80 font-semibold transition-colors"
          >
            {t('personal.calendar.viewAll', 'View all')} ({items.length})
          </button>
        )}
      </div>

      <div className="divide-y divide-foreground/5 px-3 md:px-4 py-1" style={{ minHeight: `${MAX_PREVIEW * 32}px` }}>
        {items.length === 0 ? (
          <button
            onClick={onAddEvent}
            className="w-full h-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/10 text-zinc-600 hover:text-zinc-400 hover:border-bridge-border transition-colors"
            style={{ minHeight: `${MAX_PREVIEW * 32}px` }}
          >
            <Plus size={14} />
            <span className="text-xs">{t('personal.calendar.noScheduleToday', 'No schedule today — add one')}</span>
          </button>
        ) : (
          <>
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-foreground/5 ${
                item.isDone ? 'opacity-50' : ''
              }`}
            >
              {/* Color dot / status */}
              {item.type === 'task' ? (
                item.isDone ? (
                  <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
                ) : (
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-foreground/10"
                    style={{ backgroundColor: item.isOverdue ? '#EF4444' : item.color }}
                  />
                )
              ) : (
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-foreground/10"
                  style={{ backgroundColor: item.color }}
                />
              )}

              {/* Time */}
              {item.startTime ? (
                <span className="text-[11px] text-zinc-500 tabular-nums w-10 shrink-0">{item.startTime}</span>
              ) : (
                <span className="text-[11px] text-muted-foreground w-10 shrink-0">
                  {item.type === 'event' ? t('personal.calendar.allDay', 'All day') : ''}
                </span>
              )}

              {/* Title */}
              <span className={`text-xs truncate flex-1 ${
                item.isDone ? 'line-through text-muted-foreground' : item.isOverdue ? 'text-red-400' : 'text-foreground'
              }`}>
                {item.title}
              </span>

              {/* Type badge */}
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                item.type === 'task'
                  ? 'text-bridge-accent/70 bg-bridge-accent/10'
                  : 'text-bridge-secondary/70 bg-bridge-secondary/10'
              }`}>
                {item.type === 'task' ? t('personal.calendar.task') : t('personal.calendar.event')}
              </span>

              {/* Edit button (event only) */}
              {item.type === 'event' && item.event && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditEvent(item.event!); }}
                  className="p-1 text-zinc-600 hover:text-bridge-accent transition-colors rounded shrink-0"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
          ))}

          {hiddenCount > 0 && (
            <button
              onClick={onViewAll}
              className="w-full text-center text-[11px] text-zinc-500 hover:text-foreground py-1 transition-colors"
            >
              +{hiddenCount} {t('personal.calendar.more', 'more')}
            </button>
          )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Day Detail Modal ──

function DayDetailModal({
  open,
  date,
  dateKey,
  items,
  dayLabels,
  onClose,
  onDeleteEvent,
  onEditEvent,
  onAddEvent,
}: {
  open: boolean;
  date: Date;
  dateKey: string;
  items: CalendarItem[];
  dayLabels: string[];
  onClose: () => void;
  onDeleteEvent: (eventId: string) => void;
  onEditEvent: (event: PersonalEvent) => void;
  onAddEvent: () => void;
}) {
  const { t } = useTranslation();
  const taskCount = items.filter(i => i.type === 'task').length;
  const eventCount = items.filter(i => i.type === 'event').length;

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-lg max-h-[85vh] flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-foreground/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-bridge-accent/10 flex items-center justify-center">
              <Calendar size={18} className="text-bridge-accent" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">
                {date.getMonth() + 1}월 {date.getDate()}일 ({dayLabels[date.getDay()]})
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {taskCount > 0 && t('personal.calendar.tasksCount', { count: taskCount })}
                {taskCount > 0 && eventCount > 0 && ' · '}
                {eventCount > 0 && t('personal.calendar.eventsCount', { count: eventCount })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onAddEvent}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-bridge-accent border border-bridge-accent/30 rounded-lg hover:bg-bridge-accent/10 transition-colors"
            >
              <Plus size={14} />
              <span>{t('personal.calendar.addSchedule', '스케줄 추가')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-foreground/5 ${
                item.isDone ? 'opacity-50' : ''
              }`}
              style={{ borderLeft: `3px solid ${item.isOverdue ? '#EF4444' : item.color}` }}
            >
              {/* Icon */}
              {item.type === 'task' ? (
                item.isDone ? (
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                ) : (
                  <div
                    className="w-4 h-4 rounded-full border-2 shrink-0"
                    style={{ borderColor: item.isOverdue ? '#EF4444' : item.color }}
                  />
                )
              ) : (
                <CalendarDays size={16} className="shrink-0" style={{ color: item.color }} />
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium block truncate ${
                  item.isDone ? 'line-through text-zinc-500' : 'text-foreground'
                }`}>
                  {item.title}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.type === 'task' && (
                    <span className="text-[10px] font-semibold text-bridge-accent/70 bg-bridge-accent/10 px-1.5 py-0.5 rounded">
                      {t('personal.calendar.task')}
                    </span>
                  )}
                  {item.type === 'event' && (
                    <span className="text-[10px] font-semibold text-bridge-secondary/70 bg-bridge-secondary/10 px-1.5 py-0.5 rounded">
                      {t('personal.calendar.event')}
                    </span>
                  )}
                  {item.startTime && (
                    <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                      <Clock size={8} />
                      {item.startTime}
                      {item.event?.end_time && ` - ${item.event.end_time.slice(0, 5)}`}
                      {item.event?.start_time && item.event?.end_time && item.event.end_time < item.event.start_time && <span className="text-bridge-accent ml-0.5">({t('personal.schedule.nextDay')})</span>}
                    </span>
                  )}
                  {item.isOverdue && (
                    <span className="text-[10px] font-semibold text-red-400">{t('personal.calendar.overdue')}</span>
                  )}
                  {item.task?.priority && item.task.priority !== 'NONE' && (
                    <span className="text-[10px] text-zinc-500">{item.task.priority}</span>
                  )}
                  {item.event?.recurrence_group_id && (
                    <span className="text-[10px] text-purple-400 flex items-center gap-0.5">
                      <RotateCw size={8} />
                      {t('personal.calendar.recurring')}
                    </span>
                  )}
                </div>
              </div>

              {/* Edit / Delete event buttons */}
              {item.type === 'event' && item.event && (
                <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditEvent(item.event!);
                    }}
                    className="p-1.5 text-zinc-500 hover:text-bridge-accent rounded-lg hover:bg-foreground/5 transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteEvent(item.event!.id);
                    }}
                    className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-foreground/5 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-8">
              <Calendar size={24} className="mx-auto text-zinc-600 mb-2" />
              <p className="text-zinc-500 text-sm">{t('personal.calendar.noItems')}</p>
            </div>
          )}
        </div>

        {/* Footer legend */}
        <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 border-t border-foreground/5 shrink-0 flex-wrap">
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <ListTodo size={10} className="text-bridge-accent" />
            {t('personal.calendar.taskDeadline')}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <CalendarDays size={10} className="text-bridge-secondary" />
            {t('personal.calendar.event')}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {t('personal.calendar.overdue')}
          </span>
        </div>
    </MotionModal>
  );
}

// ── Create Event Modal ──

function getOverlappingEvents(
  events: PersonalEvent[],
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
): PersonalEvent[] {
  if (!startTime || !endTime) return [];
  return events.filter((ev) => {
    if (ev.id === excludeId) return false;
    if (ev.event_date !== date) return false;
    if (!ev.start_time || !ev.end_time) return false;
    const evStart = ev.start_time.slice(0, 5);
    const evEnd = ev.end_time.slice(0, 5);
    return startTime < evEnd && endTime > evStart;
  });
}

function CreateEventModal({
  open,
  date,
  existingEvents,
  onClose,
  onCreate,
}: {
  open: boolean;
  date: string;
  existingEvents: PersonalEvent[];
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    color: string;
    all_day: boolean;
  }) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [allDay, setAllDay] = useState(true);

  const overlapping = useMemo(
    () => allDay ? [] : getOverlappingEvents(existingEvents, date, startTime, endTime),
    [existingEvents, date, startTime, endTime, allDay],
  );

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      start_time: allDay ? undefined : (startTime || undefined),
      end_time: allDay ? undefined : (endTime || undefined),
      color,
      all_day: allDay,
    });
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">{t('personal.calendar.newEvent')}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Date */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.date')}</label>
            <div className="text-sm text-foreground/80 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5">
              {formatDate(date)}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder={t('personal.calendar.eventTitle')}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-2.5 px-4 text-foreground text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('personal.calendar.optionalDesc')}
              rows={2}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-2.5 px-4 text-foreground text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            />
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAllDay(!allDay)}
              className={`relative w-10 h-5 rounded-full transition-colors ${allDay ? 'bg-bridge-accent' : 'bg-foreground/10'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${allDay ? 'left-5' : 'left-0.5'}`} />
            </button>
            <span className="text-sm text-muted-foreground">{t('personal.calendar.allDay')}</span>
          </div>

          {/* Time inputs (only if not all-day) */}
          {!allDay && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.start')}</label>
                <TimePicker
                  value={startTime}
                  onChange={(val) => {
                    setStartTime(val);
                    if (val && !endTime) {
                      const [h, m] = val.split(':').map(Number);
                      const endH = (h + 1) % 24;
                      setEndTime(`${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.end')}</label>
                <TimePicker
                  value={endTime}
                  onChange={setEndTime}
                />
              </div>
            </div>
          )}

          {/* Overlap warning */}
          {overlapping.length > 0 && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-400">
                  {t('personal.schedule.overlapWarning', { count: overlapping.length })}
                </p>
                <div className="mt-1 space-y-0.5">
                  {overlapping.slice(0, 3).map((ev) => (
                    <p key={ev.id} className="text-[11px] text-amber-400/70 truncate">
                      {ev.start_time?.slice(0, 5)}–{ev.end_time?.slice(0, 5)}{ev.start_time && ev.end_time && ev.end_time < ev.start_time ? ` (${t('personal.schedule.nextDay')})` : ''} {ev.title}
                    </p>
                  ))}
                  {overlapping.length > 3 && (
                    <p className="text-[11px] text-amber-400/50">
                      +{overlapping.length - 3}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Color picker */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">{t('personal.calendar.color')}</label>
            <div className="flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c
                      ? 'ring-2 ring-foreground ring-offset-2 ring-offset-bridge-obsidian scale-110'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-foreground border border-foreground/10 rounded-xl hover:bg-foreground/5 transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="flex-1 py-3 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {t('common.create')}
          </button>
        </div>
    </MotionModal>
  );
}

// ── Edit Event Modal ──

function EditEventModal({
  open,
  event,
  existingEvents,
  onClose,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  event: PersonalEvent | null;
  existingEvents: PersonalEvent[];
  onClose: () => void;
  onUpdate: (eventId: string, data: {
    title?: string;
    description?: string;
    event_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    color?: string;
    all_day?: boolean;
  }) => void;
  onDelete: (eventId: string) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description || '');
  const [startTime, setStartTime] = useState(event?.start_time?.slice(0, 5) || '');
  const [endTime, setEndTime] = useState(event?.end_time?.slice(0, 5) || '');
  const [color, setColor] = useState(event?.color || EVENT_COLORS[0]);
  const [allDay, setAllDay] = useState(event?.all_day ?? true);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setStartTime(event.start_time?.slice(0, 5) || '');
      setEndTime(event.end_time?.slice(0, 5) || '');
      setColor(event.color || EVENT_COLORS[0]);
      setAllDay(event.all_day);
    }
  }, [event]);

  const overlapping = useMemo(
    () => event && !allDay ? getOverlappingEvents(existingEvents, event.event_date, startTime, endTime, event.id) : [],
    [existingEvents, event, startTime, endTime, allDay],
  );

  if (!event) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    onUpdate(event.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      event_date: event.event_date,
      start_time: allDay ? null : (startTime || null),
      end_time: allDay ? null : (endTime || null),
      color,
      all_day: allDay,
    });
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md p-5 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground">{t('personal.calendar.editEvent', 'Edit Event')}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Date (read-only) */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.date')}</label>
            <div className="text-sm text-foreground/80 bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5">
              {formatDate(event.event_date)}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-2.5 px-4 text-foreground text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('personal.calendar.optionalDesc')}
              rows={2}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-2.5 px-4 text-foreground text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            />
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAllDay(!allDay)}
              className={`relative w-10 h-5 rounded-full transition-colors ${allDay ? 'bg-bridge-accent' : 'bg-foreground/10'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${allDay ? 'left-5' : 'left-0.5'}`} />
            </button>
            <span className="text-sm text-muted-foreground">{t('personal.calendar.allDay')}</span>
          </div>

          {/* Time inputs */}
          {!allDay && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.start')}</label>
                <TimePicker
                  value={startTime}
                  onChange={(val) => {
                    setStartTime(val);
                    if (val && !endTime) {
                      const [h, m] = val.split(':').map(Number);
                      const endH = (h + 1) % 24;
                      setEndTime(`${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">{t('personal.calendar.end')}</label>
                <TimePicker
                  value={endTime}
                  onChange={setEndTime}
                />
              </div>
            </div>
          )}

          {/* Overlap warning */}
          {overlapping.length > 0 && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-amber-400">
                  {t('personal.schedule.overlapWarning', { count: overlapping.length })}
                </p>
                <div className="mt-1 space-y-0.5">
                  {overlapping.slice(0, 3).map((ev) => (
                    <p key={ev.id} className="text-[11px] text-amber-400/70 truncate">
                      {ev.start_time?.slice(0, 5)}–{ev.end_time?.slice(0, 5)}{ev.start_time && ev.end_time && ev.end_time < ev.start_time ? ` (${t('personal.schedule.nextDay')})` : ''} {ev.title}
                    </p>
                  ))}
                  {overlapping.length > 3 && (
                    <p className="text-[11px] text-amber-400/50">
                      +{overlapping.length - 3}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Color picker */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">{t('personal.calendar.color')}</label>
            <div className="flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c
                      ? 'ring-2 ring-foreground ring-offset-2 ring-offset-bridge-obsidian scale-110'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => onDelete(event.id)}
            className="py-3 px-4 text-sm font-bold text-red-400 border border-red-400/20 rounded-xl hover:bg-red-400/10 transition-all"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-foreground border border-foreground/10 rounded-xl hover:bg-foreground/5 transition-all"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="flex-1 py-3 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {t('common.save', 'Save')}
          </button>
        </div>
    </MotionModal>
  );
}

