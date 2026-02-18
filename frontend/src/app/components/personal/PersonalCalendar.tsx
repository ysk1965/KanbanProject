import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar, ListTodo, CalendarDays, CheckCircle2, Clock, RotateCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { personalTaskAPI } from '../../utils/api';
import { personalEventService } from '../../utils/services';
import { formatDate } from '../../utils/dateUtils';
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

  // Event create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState('');

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
    } catch (err) {
      console.error('Failed to delete event:', err);
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
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={goToPrevMonth} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-base font-bold text-white min-w-[140px] text-center">{monthLabel}</h2>
          <button onClick={goToNextMonth} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="hidden md:flex items-center gap-3 mr-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <ListTodo size={10} className="text-bridge-accent" />
              Task
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays size={10} className="text-bridge-secondary" />
              Event
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
            Today
          </button>
          <button
            onClick={() => {
              setCreateDate(todayKey);
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bridge-accent text-white text-xs font-bold rounded-lg hover:bg-bridge-accent/90 transition-colors"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Event</span>
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-white/5 shrink-0">
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
                const items = dayItemsMap.get(dateKey) || [];
                const isTodayCell = isSameDay(date, today);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
                const hiddenCount = Math.max(0, items.length - MAX_VISIBLE_ITEMS);

                return (
                  <div
                    key={colIdx}
                    onClick={() => {
                      if (items.length > 0) {
                        setModalDate({ dateKey, date });
                      } else {
                        setCreateDate(dateKey);
                        setIsCreateOpen(true);
                      }
                    }}
                    className={`border-b border-r border-white/5 flex flex-col overflow-hidden transition-colors cursor-pointer hover:bg-white/[0.03] ${
                      !isCurrentMonth ? 'bg-white/[0.01]' : isWeekend ? 'bg-white/[0.015]' : ''
                    } ${isTodayCell ? 'ring-1 ring-inset ring-bridge-accent/30 bg-bridge-accent/[0.04]' : ''}`}
                  >
                    {/* Date number */}
                    <div className="px-1.5 pt-1 flex items-center justify-between shrink-0">
                      <span
                        className={`text-[11px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                          isTodayCell
                            ? 'bg-bridge-accent text-white'
                            : !isCurrentMonth
                              ? 'text-zinc-700'
                              : date.getDay() === 0
                                ? 'text-red-400/70'
                                : date.getDay() === 6
                                  ? 'text-blue-400/70'
                                  : 'text-zinc-400'
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {items.length > 0 && (
                        <span className="text-[9px] text-zinc-600 tabular-nums">{items.length}</span>
                      )}
                    </div>

                    {/* Items */}
                    <div className="px-1 md:px-1.5 pb-0.5 flex-1 space-y-0.5 overflow-hidden">
                      {visibleItems.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] md:text-[11px] truncate ${
                            item.isDone ? 'opacity-50' : ''
                          } ${item.isOverdue ? 'bg-red-500/10' : ''}`}
                          style={{
                            backgroundColor: item.isOverdue ? undefined : `${item.color}15`,
                            borderLeft: `3px solid ${item.isOverdue ? '#EF4444' : item.color}`,
                          }}
                        >
                          {item.type === 'task' ? (
                            <ListTodo size={9} className="shrink-0 text-bridge-accent/70" />
                          ) : (
                            <CalendarDays size={9} className="shrink-0 text-bridge-secondary/70" />
                          )}
                          <span className={`truncate ${item.isDone ? 'line-through text-zinc-600' : 'text-zinc-300'}`}>
                            {item.startTime && <span className="text-zinc-500 mr-0.5">{item.startTime}</span>}
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

      {/* ── Day Detail Modal ── */}
      <AnimatePresence>
        {modalDate && (
          <DayDetailModal
            date={modalDate.date}
            dateKey={modalDate.dateKey}
            items={dayItemsMap.get(modalDate.dateKey) || []}
            dayLabels={dayLabels}
            onClose={() => setModalDate(null)}
            onDeleteEvent={handleDeleteEvent}
            onAddEvent={() => {
              setCreateDate(modalDate.dateKey);
              setIsCreateOpen(true);
              setModalDate(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Create Event Modal ── */}
      <AnimatePresence>
        {isCreateOpen && (
          <CreateEventModal
            date={createDate}
            onClose={() => setIsCreateOpen(false)}
            onCreate={handleCreateEvent}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Day Detail Modal ──

function DayDetailModal({
  date,
  dateKey,
  items,
  dayLabels,
  onClose,
  onDeleteEvent,
  onAddEvent,
}: {
  date: Date;
  dateKey: string;
  items: CalendarItem[];
  dayLabels: string[];
  onClose: () => void;
  onDeleteEvent: (eventId: string) => void;
  onAddEvent: () => void;
}) {
  const taskCount = items.filter(i => i.type === 'task').length;
  const eventCount = items.filter(i => i.type === 'event').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-bridge-obsidian rounded-2xl border border-white/10 shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-bridge-accent/10 flex items-center justify-center">
              <Calendar size={18} className="text-bridge-accent" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {date.getMonth() + 1}월 {date.getDate()}일 ({dayLabels[date.getDay()]})
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {taskCount > 0 && `${taskCount} tasks`}
                {taskCount > 0 && eventCount > 0 && ' · '}
                {eventCount > 0 && `${eventCount} events`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onAddEvent}
              className="p-2 rounded-xl text-zinc-400 hover:text-bridge-accent hover:bg-white/5 transition-colors"
              title="Add event"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-white/5 ${
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
                  item.isDone ? 'line-through text-zinc-500' : 'text-white'
                }`}>
                  {item.title}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.type === 'task' && (
                    <span className="text-[10px] font-semibold text-bridge-accent/70 bg-bridge-accent/10 px-1.5 py-0.5 rounded">
                      Task
                    </span>
                  )}
                  {item.type === 'event' && (
                    <span className="text-[10px] font-semibold text-bridge-secondary/70 bg-bridge-secondary/10 px-1.5 py-0.5 rounded">
                      Event
                    </span>
                  )}
                  {item.startTime && (
                    <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                      <Clock size={8} />
                      {item.startTime}
                      {item.event?.end_time && ` - ${item.event.end_time.slice(0, 5)}`}
                    </span>
                  )}
                  {item.isOverdue && (
                    <span className="text-[10px] font-semibold text-red-400">Overdue</span>
                  )}
                  {item.task?.priority && item.task.priority !== 'NONE' && (
                    <span className="text-[10px] text-zinc-500">{item.task.priority}</span>
                  )}
                  {item.event?.recurrence_group_id && (
                    <span className="text-[10px] text-purple-400 flex items-center gap-0.5">
                      <RotateCw size={8} />
                      Recurring
                    </span>
                  )}
                </div>
              </div>

              {/* Delete event button */}
              {item.type === 'event' && item.event && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent(item.event!.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-500 hover:text-red-400 transition-all rounded-lg hover:bg-white/5"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-8">
              <Calendar size={24} className="mx-auto text-zinc-600 mb-2" />
              <p className="text-zinc-500 text-sm">No items for this day</p>
            </div>
          )}
        </div>

        {/* Footer legend */}
        <div className="flex items-center gap-4 px-6 py-3 border-t border-white/5 shrink-0">
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <ListTodo size={10} className="text-bridge-accent" />
            Task deadline
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <CalendarDays size={10} className="text-bridge-secondary" />
            Event
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Overdue
          </span>
        </div>
      </motion.div>
    </div>
  );
}

// ── Create Event Modal ──

function CreateEventModal({
  date,
  onClose,
  onCreate,
}: {
  date: string;
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [allDay, setAllDay] = useState(true);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">New Event</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Date */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Date</label>
            <div className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
              {formatDate(date)}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="Event title"
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            />
          </div>

          {/* All-day toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAllDay(!allDay)}
              className={`relative w-10 h-5 rounded-full transition-colors ${allDay ? 'bg-bridge-accent' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${allDay ? 'left-5' : 'left-0.5'}`} />
            </button>
            <span className="text-sm text-slate-300">All day</span>
          </div>

          {/* Time inputs (only if not all-day) */}
          {!allDay && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all [color-scheme:dark]"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">End</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          {/* Color picker */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Color</label>
            <div className="flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian scale-110'
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
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="flex-1 py-3 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Create
          </button>
        </div>
      </motion.div>
    </div>
  );
}
