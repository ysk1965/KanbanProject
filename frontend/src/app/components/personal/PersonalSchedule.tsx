import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Loader2, Settings, RotateCw, CalendarDays, Clock, CheckCircle2, ListTodo, AlertCircle, Search, Flame, ChevronDown, ChevronUp, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { personalEventService, personalTaskService } from '../../utils/services';
import { personalHabitAPI } from '../../utils/api';
import { formatDate } from '../../utils/dateUtils';
import type { PersonalEvent, PersonalTask, PersonalTaskPriority, HabitWeeklyRow, HabitFrequency } from '../../types';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  isSameMonth,
  isToday as isTodayFn,
  format,
} from 'date-fns';
import { ko } from 'date-fns/locale';

const EVENT_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

const PRIORITY_DOT: Record<string, string> = {
  MEDIUM: 'bg-amber-400',
  HIGH: 'bg-orange-500', URGENT: 'bg-red-500',
};

const SLOT_HEIGHT = 40;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 23;
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const COL_MIN_W = 'min-w-[100px] md:min-w-[130px]';
const TIME_COL_W = 'w-12 md:w-16';
const STORAGE_KEY = 'bridge-personal-schedule-settings';

interface ScheduleSettings {
  startHour: number;
  endHour: number;
}

const loadSettings = (): ScheduleSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        startHour: Math.max(0, Math.min(23, parsed.startHour ?? DEFAULT_START_HOUR)),
        endHour: Math.max(1, Math.min(24, parsed.endHour ?? DEFAULT_END_HOUR)),
      };
    }
  } catch { /* ignore */ }
  return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
};

const saveSettings = (s: ScheduleSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
};

const generateTimeSlots = (startHour: number, endHour: number): string[] => {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push(`${h.toString().padStart(2, '0')}:00`);
    slots.push(`${h.toString().padStart(2, '0')}:30`);
  }
  return slots;
};

const toDateString = (d: Date): string => format(d, 'yyyy-MM-dd');

/* ================================================================
   PersonalSchedule — Weekly time-grid view
   ================================================================ */
export function PersonalSchedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [habitRows, setHabitRows] = useState<HabitWeeklyRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<ScheduleSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  const startHour = settings.startHour;
  const endHour = settings.endHour;

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState('');
  const [createStartTime, setCreateStartTime] = useState('');
  const [createEndTime, setCreateEndTime] = useState('');
  const [createInitialRecurrence, setCreateInitialRecurrence] = useState('');

  // Habit create modal
  const [isCreateHabitOpen, setIsCreateHabitOpen] = useState(false);

  // Edit modal
  const [editEvent, setEditEvent] = useState<PersonalEvent | null>(null);

  // Drag selection
  const [dragState, setDragState] = useState<{
    dateStr: string;
    startSlotIndex: number;
    endSlotIndex: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Event block drag/resize interaction
  const [eventInteraction, setEventInteraction] = useState<{
    eventId: string;
    type: 'drag' | 'resize-top' | 'resize-bottom';
    offsetPx: number;
  } | null>(null);
  const eventOffsetRef = useRef(0);
  const eventLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timeSlots = useMemo(() => generateTimeSlots(startHour, endHour), [startHour, endHour]);

  const weekDays = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
    const we = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: ws, end: we });
  }, [currentDate]);

  const startDate = toDateString(weekDays[0]);
  const endDate = toDateString(weekDays[6]);

  // ---- Data loading ----
  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await personalEventService.getWeekly(startDate, endDate);
      setEvents(data);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // ---- Load tasks with due dates ----
  const loadTasks = useCallback(async () => {
    try {
      const all = await personalTaskService.getTasks();
      setTasks(all.filter((t: PersonalTask) => t.due_date && t.status !== 'ARCHIVED'));
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ---- Load habits for visible week ----
  const loadHabits = useCallback(async () => {
    try {
      const data = await personalHabitAPI.getWeekly(startDate, endDate);
      setHabitRows(data.habits ?? []);
    } catch {
      setHabitRows([]);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadHabits();
  }, [loadHabits]);

  // Group habit completions by date
  const habitsByDate = useMemo(() => {
    const grouped: Record<string, { habit_id: string; title: string; icon?: string; is_completed: boolean; count: number }[]> = {};
    habitRows.forEach((row) => {
      row.days.forEach((day) => {
        (grouped[day.date] ??= []).push({
          habit_id: row.habit_id,
          title: row.title,
          icon: row.icon,
          is_completed: day.is_completed,
          count: day.count,
        });
      });
    });
    return grouped;
  }, [habitRows]);

  // Group tasks by due_date for the visible week
  const tasksByDate = useMemo(() => {
    const grouped: Record<string, PersonalTask[]> = {};
    tasks.forEach((t) => {
      if (t.due_date && t.due_date >= startDate && t.due_date <= endDate) {
        (grouped[t.due_date] ??= []).push(t);
      }
    });
    return grouped;
  }, [tasks, startDate, endDate]);

  const hasTasksDue = useMemo(() => Object.keys(tasksByDate).length > 0, [tasksByDate]);

  const handleHabitCheckIn = async (habitId: string, date: string) => {
    // Optimistic update
    setHabitRows(prev => prev.map(row => {
      if (row.habit_id !== habitId) return row;
      return {
        ...row,
        days: row.days.map(d => d.date === date ? { ...d, is_completed: !d.is_completed, count: d.is_completed ? 0 : 1 } : d),
      };
    }));
    try {
      await personalHabitAPI.checkIn(habitId, { log_date: date, increment: 1 });
    } catch {
      await loadHabits(); // revert on error
    }
  };

  const handleCreateHabit = async (data: {
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    frequency_type?: HabitFrequency;
    frequency_days?: string;
    target_count?: number;
    unit?: string;
  }) => {
    try {
      await personalHabitAPI.create(data);
      setIsCreateHabitOpen(false);
      await loadHabits();
    } catch (err) {
      console.error('Failed to create habit:', err);
    }
  };

  // ---- Navigation ----
  const handlePrev = () => setCurrentDate((d) => subWeeks(d, 1));
  const handleNext = () => setCurrentDate((d) => addWeeks(d, 1));
  const handleToday = () => setCurrentDate(new Date());

  const todayStr = toDateString(new Date());
  const isTodayInWeek = weekDays.some((d) => toDateString(d) === todayStr);

  // ---- Events grouped by date ----
  const { allDayByDate, timedByDate, hasAllDay } = useMemo(() => {
    const allDay: Record<string, PersonalEvent[]> = {};
    const timed: Record<string, PersonalEvent[]> = {};
    let hasAny = false;
    events.forEach((e) => {
      if (e.all_day || (!e.start_time && !e.end_time)) {
        (allDay[e.event_date] ??= []).push(e);
        hasAny = true;
      } else if (e.start_time) {
        (timed[e.event_date] ??= []).push(e);
      }
    });
    return { allDayByDate: allDay, timedByDate: timed, hasAllDay: hasAny };
  }, [events]);

  // ---- Drag handlers ----
  const handleMouseDown = (e: React.MouseEvent, dateStr: string, slotIndex: number) => {
    e.preventDefault();
    setIsDragging(true);
    setDragState({ dateStr, startSlotIndex: slotIndex, endSlotIndex: slotIndex });
  };

  const handleMouseEnter = (dateStr: string, slotIndex: number) => {
    if (!isDragging || !dragState || dragState.dateStr !== dateStr) return;
    setDragState({ ...dragState, endSlotIndex: slotIndex });
  };

  const handleMouseUp = () => {
    if (!isDragging || !dragState) {
      setIsDragging(false);
      setDragState(null);
      return;
    }

    const { dateStr, startSlotIndex, endSlotIndex } = dragState;
    const minIdx = Math.min(startSlotIndex, endSlotIndex);
    const maxIdx = Math.max(startSlotIndex, endSlotIndex);
    const st = timeSlots[minIdx];
    const et = timeSlots[maxIdx + 1] || `${endHour}:00`;

    setCreateDate(dateStr);
    setCreateStartTime(st);
    setCreateEndTime(et);
    setCreateInitialRecurrence('');
    setIsCreateOpen(true);

    setIsDragging(false);
    setDragState(null);
  };

  const isSlotSelected = (dateStr: string, slotIndex: number) => {
    if (!dragState || dragState.dateStr !== dateStr) return false;
    const min = Math.min(dragState.startSlotIndex, dragState.endSlotIndex);
    const max = Math.max(dragState.startSlotIndex, dragState.endSlotIndex);
    return slotIndex >= min && slotIndex <= max;
  };

  // ---- CRUD ----
  const handleCreateEvent = async (data: {
    title: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    color: string;
    all_day: boolean;
    recurrence_rule?: string;
    recurrence_end_date?: string;
    recurrence_days_of_week?: number[];
  }) => {
    try {
      await personalEventService.create({ ...data, event_date: createDate });
      await loadEvents();
      setIsCreateOpen(false);
    } catch (err) {
      console.error('Failed to create event:', err);
    }
  };

  const handleDeleteEvent = async (eventId: string, scope?: string) => {
    try {
      await personalEventService.delete(eventId, scope);
      await loadEvents();
      if (editEvent?.id === eventId) setEditEvent(null);
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  const handleUpdateEvent = async (
    eventId: string,
    data: {
      title?: string;
      description?: string;
      event_date?: string;
      start_time?: string | null;
      end_time?: string | null;
      color?: string;
      all_day?: boolean;
    },
  ) => {
    try {
      await personalEventService.update(eventId, data);
      await loadEvents();
      setEditEvent(null);
    } catch (err) {
      console.error('Failed to update event:', err);
    }
  };

  // ---- Event block drag/resize handlers ----
  const fmtMinToTime = (min: number): string => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const handleEventTimeChange = async (eventId: string, newStartTime: string, newEndTime: string) => {
    setEvents(prev => prev.map(ev =>
      ev.id === eventId ? { ...ev, start_time: newStartTime, end_time: newEndTime } : ev
    ));
    try {
      await personalEventService.update(eventId, { start_time: newStartTime, end_time: newEndTime });
    } catch {
      loadEvents();
    }
  };

  const handleEventResizeStart = (e: React.MouseEvent, ev: PersonalEvent, handle: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault();
    if (!ev.start_time || !ev.end_time) return;

    const type = handle === 'top' ? 'resize-top' as const : 'resize-bottom' as const;
    const [esh, esm] = ev.start_time.split(':').map(Number);
    const [eeh, eem] = ev.end_time.split(':').map(Number);
    const origStartMin = esh * 60 + esm;
    const origEndMin = eeh * 60 + eem;
    const startY = e.clientY;
    const workStartMin = startHour * 60;
    const workEndMin = endHour * 60;

    eventOffsetRef.current = 0;
    setEventInteraction({ eventId: ev.id, type, offsetPx: 0 });
    document.body.style.userSelect = 'none';

    const onMove = (me: MouseEvent) => {
      const deltaY = me.clientY - startY;
      const snapped = Math.round(deltaY / SLOT_HEIGHT) * SLOT_HEIGHT;
      eventOffsetRef.current = snapped;
      setEventInteraction({ eventId: ev.id, type, offsetPx: snapped });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';

      const finalOffset = eventOffsetRef.current;
      setEventInteraction(null);
      eventOffsetRef.current = 0;

      if (finalOffset === 0) return;

      const deltaMin = (finalOffset / SLOT_HEIGHT) * 30;
      let newStartMin = origStartMin;
      let newEndMin = origEndMin;

      if (type === 'resize-top') {
        newStartMin = origStartMin + deltaMin;
        newStartMin = Math.max(workStartMin, Math.min(origEndMin - 30, newStartMin));
      } else {
        newEndMin = origEndMin + deltaMin;
        newEndMin = Math.min(workEndMin, Math.max(origStartMin + 30, newEndMin));
      }

      handleEventTimeChange(ev.id, fmtMinToTime(newStartMin), fmtMinToTime(newEndMin));
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleEventDragStart = (e: React.MouseEvent, ev: PersonalEvent) => {
    if ((e.target as HTMLElement).dataset.resizeHandle) return;
    e.stopPropagation();
    e.preventDefault();
    if (!ev.start_time || !ev.end_time) return;

    const startY = e.clientY;
    const [esh, esm] = ev.start_time.split(':').map(Number);
    const [eeh, eem] = ev.end_time.split(':').map(Number);
    const origStartMin = esh * 60 + esm;
    const origEndMin = eeh * 60 + eem;
    const duration = origEndMin - origStartMin;
    const workStartMin = startHour * 60;
    const workEndMin = endHour * 60;
    const origTop = ((origStartMin - workStartMin) / 30) * SLOT_HEIGHT;

    eventLongPressTimer.current = setTimeout(() => {
      eventOffsetRef.current = 0;
      setEventInteraction({ eventId: ev.id, type: 'drag', offsetPx: 0 });
      document.body.style.userSelect = 'none';

      const onMove = (me: MouseEvent) => {
        const deltaY = me.clientY - startY;
        const newTop = origTop + deltaY;
        const snappedTop = Math.round(newTop / SLOT_HEIGHT) * SLOT_HEIGHT;
        const snappedOffset = snappedTop - origTop;
        eventOffsetRef.current = snappedOffset;
        setEventInteraction({ eventId: ev.id, type: 'drag', offsetPx: snappedOffset });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';

        const finalOffset = eventOffsetRef.current;
        setEventInteraction(null);
        eventOffsetRef.current = 0;

        if (finalOffset === 0) return;

        const deltaMin = (finalOffset / SLOT_HEIGHT) * 30;
        let newStartMin = origStartMin + deltaMin;
        let newEndMin = newStartMin + duration;

        if (newStartMin < workStartMin) {
          newStartMin = workStartMin;
          newEndMin = workStartMin + duration;
        }
        if (newEndMin > workEndMin) {
          newEndMin = workEndMin;
          newStartMin = workEndMin - duration;
        }

        handleEventTimeChange(ev.id, fmtMinToTime(newStartMin), fmtMinToTime(newEndMin));
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }, 150);
  };

  const handleEventMouseUp = () => {
    if (eventLongPressTimer.current) {
      clearTimeout(eventLongPressTimer.current);
      eventLongPressTimer.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (eventLongPressTimer.current) clearTimeout(eventLongPressTimer.current);
    };
  }, []);

  // ---- Current time indicator ----
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const currentTimeTop = useMemo(() => {
    const mins = (now.getHours() - startHour) * 60 + now.getMinutes();
    const total = (endHour - startHour) * 60;
    if (mins < 0 || mins > total) return null;
    return mins * (SLOT_HEIGHT / 30);
  }, [now, startHour, endHour]);

  // Auto-scroll to current time on first render
  const indicatorRef = useRef<HTMLDivElement>(null);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (currentTimeTop != null && indicatorRef.current && !scrolledRef.current) {
      indicatorRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      scrolledRef.current = true;
    }
  }, [currentTimeTop]);
  useEffect(() => {
    scrolledRef.current = false;
  }, [currentDate]);

  // ---- Mini calendar state ----
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(currentDate));
  const [monthlyEvents, setMonthlyEvents] = useState<PersonalEvent[]>([]);

  // Sync calendar month when navigating weeks
  useEffect(() => {
    const weekMid = weekDays[3]; // use mid-week to determine month
    const weekMonth = startOfMonth(weekMid);
    if (!isSameMonth(weekMonth, calendarMonth)) {
      setCalendarMonth(weekMonth);
    }
  }, [weekDays]);

  // Load monthly events for mini calendar indicators
  useEffect(() => {
    const fetchMonthly = async () => {
      try {
        const ms = startOfMonth(calendarMonth);
        const me = endOfMonth(calendarMonth);
        const data = await personalEventService.getWeekly(toDateString(ms), toDateString(me));
        setMonthlyEvents(data);
      } catch { /* ignore */ }
    };
    fetchMonthly();
  }, [calendarMonth]);

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [calendarMonth]);

  // Events by date for mini calendar dots
  const eventDateSet = useMemo(() => {
    const set = new Set<string>();
    monthlyEvents.forEach((e) => set.add(e.event_date));
    // Also include currently loaded weekly events
    events.forEach((e) => set.add(e.event_date));
    // Also include habit dates
    habitRows.forEach((row) => row.days.forEach((d) => { if (d.is_completed || d.count > 0) set.add(d.date); }));
    // Also include task due dates
    tasks.forEach((t) => { if (t.due_date) set.add(t.due_date); });
    return set;
  }, [monthlyEvents, events, habitRows, tasks]);

  // Recurring events extracted from loaded data
  const recurringEvents = useMemo(() => {
    const seen = new Set<string>();
    const result: PersonalEvent[] = [];
    // Combine monthly + weekly events
    [...monthlyEvents, ...events].forEach((e) => {
      if (e.recurrence_group_id && !seen.has(e.recurrence_group_id)) {
        seen.add(e.recurrence_group_id);
        result.push(e);
      }
    });
    return result;
  }, [monthlyEvents, events]);

  const miniCalWeekDays = ['일', '월', '화', '수', '목', '금', '토'];

  const handleCalendarDateClick = (day: Date) => {
    // Navigate the weekly view to the week containing this date
    setCurrentDate(day);
    if (!isSameMonth(day, calendarMonth)) {
      setCalendarMonth(startOfMonth(day));
    }
  };

  const handlePrevMonth = () => setCalendarMonth(subMonths(calendarMonth, 1));
  const handleNextMonth = () => setCalendarMonth(addMonths(calendarMonth, 1));

  const formatRecurrenceLabel = (e: PersonalEvent): string => {
    if (e.recurrence_rule === 'DAILY') return 'Every day';
    if (e.recurrence_rule === 'WEEKLY' && e.recurrence_days_of_week) {
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = e.recurrence_days_of_week.split(',').map(Number);
      return days.map((d) => dayLabels[d]).join(', ');
    }
    return 'Recurring';
  };

  // ---- Render ----
  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* ======== Left Sidebar (desktop only) ======== */}
      <div className="hidden md:flex md:w-[340px] flex-shrink-0 border-r border-white/5 flex-col overflow-hidden">
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          {/* Title */}
          <div className="flex items-center gap-2.5 mb-4">
            <CalendarDays size={18} className="text-bridge-accent" />
            <h2 className="text-base font-bold text-white">Schedule</h2>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">
              {format(calendarMonth, 'yyyy년 M월', { locale: ko })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleToday}
                className="px-2 py-0.5 text-[10px] font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                오늘
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Mini Calendar Grid */}
        <div className="px-4 pb-4 flex-shrink-0">
          <div className="bg-bridge-obsidian rounded-xl border border-white/5 p-3">
            {/* Weekday header */}
            <div className="grid grid-cols-7 mb-1">
              {miniCalWeekDays.map((day, i) => (
                <div
                  key={`${day}-${i}`}
                  className={`text-center text-[10px] font-bold uppercase tracking-widest py-1 ${
                    i === 0 ? 'text-red-400/60' : i === 6 ? 'text-blue-400/60' : 'text-slate-500'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((day) => {
                const dateKey = toDateString(day);
                const hasEvent = eventDateSet.has(dateKey);
                const isCurrentMonth = isSameMonth(day, calendarMonth);
                const isTodayDate = isTodayFn(day);
                // Highlight if the date falls in the current displayed week
                const isInCurrentWeek = weekDays.some((wd) => toDateString(wd) === dateKey);
                const dayOfWeek = day.getDay();

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleCalendarDateClick(day)}
                    className={`
                      relative flex flex-col items-center justify-center py-1.5 rounded-lg transition-all min-h-[36px]
                      ${isInCurrentWeek
                        ? 'bg-bridge-accent/10 border border-bridge-accent/20'
                        : 'border border-transparent hover:bg-white/5'
                      }
                      ${!isCurrentMonth ? 'opacity-30' : ''}
                    `}
                  >
                    <span
                      className={`
                        text-xs font-medium leading-none
                        ${isTodayDate
                          ? 'bg-bridge-accent text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]'
                          : isInCurrentWeek
                            ? 'text-white'
                            : dayOfWeek === 0
                              ? 'text-red-400/80'
                              : dayOfWeek === 6
                                ? 'text-blue-400/80'
                                : 'text-slate-300'
                        }
                      `}
                    >
                      {format(day, 'd')}
                    </span>
                    {hasEvent && (
                      <span className="mt-0.5 w-1 h-1 rounded-full bg-bridge-secondary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recurring Events List */}
        <div className="flex-1 overflow-auto px-4 pb-4 min-h-0 custom-scrollbar">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <RotateCw size={14} className="text-purple-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Recurring
              </span>
              {recurringEvents.length > 0 && (
                <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded">
                  {recurringEvents.length}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setCreateDate(todayStr);
                setCreateStartTime('');
                setCreateEndTime('');
                setCreateInitialRecurrence('WEEKLY');
                setIsCreateOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-purple-400 bg-purple-400/10 rounded-lg hover:bg-purple-400/20 transition-colors"
            >
              <Plus size={12} />
              Add
            </button>
          </div>
          {recurringEvents.length === 0 ? (
            <div className="text-center py-6">
              <RotateCw size={20} className="mx-auto text-slate-600 mb-2" />
              <p className="text-slate-500 text-xs">No recurring events</p>
              <p className="text-slate-600 text-[10px] mt-1">Create an event with repeat to see it here</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recurringEvents.map((e) => (
                <button
                  key={e.recurrence_group_id}
                  onClick={() => setEditEvent(e)}
                  className="w-full text-left p-2.5 rounded-xl transition-all group bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-1 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: e.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-white truncate block group-hover:text-bridge-accent transition-colors">
                        {e.title}
                      </span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-semibold text-purple-400/80 bg-purple-400/10 px-1.5 py-0.5 rounded">
                          {formatRecurrenceLabel(e)}
                        </span>
                        {e.start_time && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                            <Clock size={8} />
                            {e.start_time.slice(0, 5)}
                            {e.end_time && ` - ${e.end_time.slice(0, 5)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ======== Main Time Grid ======== */}
      <div
        className="flex-1 flex flex-col min-w-0"
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (isDragging) {
            setIsDragging(false);
            setDragState(null);
          }
        }}
      >
        {/* ======== Navigation header ======== */}
        <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-1.5 md:gap-3">
            <button
              onClick={handlePrev}
              className="p-1.5 md:p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              <ChevronLeft size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <h2 className="text-xs md:text-lg font-bold min-w-0 text-center whitespace-nowrap">
              <span className="hidden sm:inline">{format(weekDays[0], 'MMM d')} - {format(weekDays[6], 'MMM d, yyyy')}</span>
              <span className="sm:hidden">{format(weekDays[0], 'M/d')} - {format(weekDays[6], 'M/d')}</span>
            </h2>
            <button
              onClick={handleNext}
              className="p-1.5 md:p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            >
              <ChevronRight size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <button
              onClick={handleToday}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-colors ${
                isTodayInWeek
                  ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white'
                  : 'text-bridge-secondary border border-bridge-secondary/30 hover:bg-bridge-secondary/10'
              }`}
            >
              Today
            </button>
            {isLoading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />}
          </div>

          <div className="flex items-center gap-1.5 md:gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 md:p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
              title="Schedule settings"
            >
              <Settings size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <button
              onClick={() => {
                setCreateDate(todayStr);
                setCreateStartTime('');
                setCreateEndTime('');
                setCreateInitialRecurrence('');
                setIsCreateOpen(true);
              }}
              className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-bridge-accent text-white text-xs md:text-sm font-bold rounded-xl hover:bg-bridge-accent/90 transition-colors"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Add Event</span>
            </button>
          </div>
        </div>

        {/* ======== Time-grid ======== */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[600px] md:min-w-[760px]">
          {/* ---- Day headers (sticky) ---- */}
          <div className="flex sticky top-0 bg-bridge-obsidian/95 backdrop-blur-sm z-10 border-b border-white/[0.06]">
            <div className={`${TIME_COL_W} flex-shrink-0 border-r border-white/[0.06]`} />
            {weekDays.map((day, idx) => {
              const ds = toDateString(day);
              const isToday = ds === todayStr;
              return (
                <div
                  key={ds}
                  className={`flex-1 ${COL_MIN_W} p-3 border-r border-white/[0.06] ${
                    isToday ? 'bg-bridge-accent/5' : ''
                  }`}
                >
                  <div
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      isToday ? 'text-bridge-secondary' : idx === 0 ? 'text-red-400/60' : idx === 6 ? 'text-blue-400/60' : 'text-slate-500'
                    }`}
                  >
                    {DAY_LABELS[idx]}
                  </div>
                  <div className={`text-lg font-bold ${isToday ? 'text-bridge-secondary' : 'text-white'}`}>
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---- All-day events row ---- */}
          {hasAllDay && (
            <div className="flex border-b border-white/[0.06] bg-white/[0.02]">
              <div
                className={`${TIME_COL_W} flex-shrink-0 p-2 text-[10px] text-slate-500 border-r border-white/[0.06] flex items-center justify-center font-bold tracking-wider`}
              >
                ALL
              </div>
              {weekDays.map((day) => {
                const ds = toDateString(day);
                const dayEvents = allDayByDate[ds] || [];
                return (
                  <div
                    key={`ad-${ds}`}
                    className={`flex-1 ${COL_MIN_W} p-1.5 border-r border-white/[0.06] space-y-1`}
                  >
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => setEditEvent(ev)}
                        className="group relative px-2 py-1 rounded-md text-xs font-medium truncate cursor-pointer"
                        style={{
                          backgroundColor: `${ev.color}25`,
                          borderLeft: `3px solid ${ev.color}`,
                        }}
                      >
                        <span className="text-white/90 truncate flex items-center gap-1">
                          {ev.recurrence_group_id && <RotateCw className="h-2.5 w-2.5 text-purple-400 flex-shrink-0" />}
                          {ev.title}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvent(ev.id);
                          }}
                          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400 transition-all"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- Task deadlines row ---- */}
          {hasTasksDue && (
            <div className="flex border-b border-white/[0.06] bg-amber-500/[0.03]">
              <div
                className={`${TIME_COL_W} flex-shrink-0 p-2 text-[10px] text-amber-400/70 border-r border-white/[0.06] flex items-center justify-center`}
              >
                <ListTodo size={12} />
              </div>
              {weekDays.map((day) => {
                const ds = toDateString(day);
                const dayTasks = tasksByDate[ds] || [];
                return (
                  <div
                    key={`tk-${ds}`}
                    className={`flex-1 ${COL_MIN_W} p-1.5 border-r border-white/[0.06] space-y-1`}
                  >
                    {dayTasks.map((task) => {
                      const isDone = task.status === 'DONE';
                      const isOverdue = !isDone && task.due_date! < todayStr;
                      const priorityColors: Record<string, string> = {
                        URGENT: 'bg-red-500',
                        HIGH: 'bg-orange-500',
                        MEDIUM: 'bg-amber-500',
                        LOW: 'bg-blue-400',
                        NONE: 'bg-slate-500',
                      };
                      return (
                        <div
                          key={task.id}
                          className={`group flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-default transition-all ${
                            isDone
                              ? 'bg-slate-500/10 border-l-[3px] border-slate-500/30'
                              : isOverdue
                                ? 'bg-red-500/10 border-l-[3px] border-red-500/60'
                                : 'bg-amber-500/10 border-l-[3px] border-amber-500/40'
                          }`}
                        >
                          <div
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityColors[task.priority] || 'bg-slate-500'}`}
                          />
                          <span className={`truncate ${
                            isDone ? 'line-through text-slate-500' : isOverdue ? 'text-red-300' : 'text-white/80'
                          }`}>
                            {task.title}
                          </span>
                          {isOverdue && (
                            <AlertCircle size={10} className="text-red-400 flex-shrink-0 ml-auto" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* ---- Habits row ---- */}
          <div className="border-b border-white/[0.06] bg-purple-500/[0.03]">
            {habitRows.length > 0 && (
              <div className="flex">
                <div
                  className={`${TIME_COL_W} flex-shrink-0 p-2 text-[10px] text-purple-400/70 border-r border-white/[0.06] flex items-center justify-center`}
                >
                  <CheckCircle2 size={12} />
                </div>
                {weekDays.map((day) => {
                  const ds = toDateString(day);
                  const dayHabits = habitsByDate[ds] || [];
                  return (
                    <div
                      key={`hb-${ds}`}
                      className={`flex-1 ${COL_MIN_W} p-1.5 border-r border-white/[0.06] space-y-1`}
                    >
                      {dayHabits.map((item) => (
                        <div
                          key={item.habit_id}
                          className={`group flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer transition-all ${
                            item.is_completed
                              ? 'bg-bridge-secondary/10 border-l-[3px] border-bridge-secondary/40'
                              : 'bg-purple-400/10 border-l-[3px] border-purple-400/60 hover:bg-purple-400/15'
                          }`}
                          onClick={() => handleHabitCheckIn(item.habit_id, ds)}
                        >
                          <div
                            className={`w-3 h-3 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${
                              item.is_completed
                                ? 'bg-bridge-secondary border-bridge-secondary'
                                : 'border-purple-400/40'
                            }`}
                          >
                            {item.is_completed && <CheckCircle2 size={8} className="text-white" />}
                          </div>
                          <span className={`truncate ${
                            item.is_completed ? 'line-through text-slate-500' : 'text-white/80'
                          }`}>
                            {item.icon && <span className="mr-0.5">{item.icon}</span>}
                            {item.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Add Habit button */}
            <div className="flex">
              <div className={`${TIME_COL_W} flex-shrink-0 border-r border-white/[0.06]`} />
              <button
                onClick={() => setIsCreateHabitOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-purple-400/70 hover:text-purple-300 hover:bg-purple-400/5 transition-all rounded-md m-1"
              >
                <Plus size={12} />
                Add Habit
              </button>
            </div>
          </div>

          {/* ---- Time slot rows + event overlay ---- */}
          <div className="relative">
            {timeSlots.map((time, slotIdx) => (
              <div
                key={time}
                className="flex border-b border-white/[0.03]"
                style={{ height: `${SLOT_HEIGHT}px` }}
              >
                {/* Time label */}
                <div
                  className={`${TIME_COL_W} flex-shrink-0 px-2 text-xs text-slate-500 border-r border-white/[0.06] flex items-start pt-1`}
                >
                  {time.endsWith(':00') ? time : ''}
                </div>

                {/* Day cells */}
                {weekDays.map((day) => {
                  const ds = toDateString(day);
                  const isToday = ds === todayStr;
                  const selected = isSlotSelected(ds, slotIdx);
                  return (
                    <div
                      key={`${ds}-${time}`}
                      className={`flex-1 ${COL_MIN_W} border-r border-white/[0.03] cursor-pointer transition-colors group relative h-full ${
                        selected
                          ? 'bg-bridge-secondary/20'
                          : isToday
                          ? 'bg-bridge-accent/[0.03]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                      onMouseDown={(e) => handleMouseDown(e, ds, slotIdx)}
                      onMouseEnter={() => handleMouseEnter(ds, slotIdx)}
                    >
                      {!selected && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <Plus className="h-3 w-3 text-slate-600" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ---- Current time indicator ---- */}
            {isTodayInWeek && currentTimeTop != null && (
              <div
                ref={indicatorRef}
                className="absolute left-0 right-0 z-[5] pointer-events-none flex items-center"
                style={{ top: `${currentTimeTop}px` }}
              >
                <div className={`${TIME_COL_W} flex-shrink-0 flex justify-end pr-1`}>
                  <span className="text-[10px] font-bold text-red-400 bg-red-500/20 px-1 rounded">
                    {now.getHours().toString().padStart(2, '0')}:
                    {now.getMinutes().toString().padStart(2, '0')}
                  </span>
                </div>
                {/* Line across all day columns */}
                {weekDays.map((day) => {
                  const ds = toDateString(day);
                  const isToday = ds === todayStr;
                  return (
                    <div key={`ti-${ds}`} className={`flex-1 ${COL_MIN_W} flex items-center`}>
                      {isToday ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                          <div className="flex-1 h-[2px] bg-red-500/70" />
                        </>
                      ) : (
                        <div className="flex-1 h-[1px] bg-red-500/20" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ---- Event blocks overlay ---- */}
            <div className="absolute top-0 left-12 md:left-16 right-0 pointer-events-none">
              <div className="flex">
                {weekDays.map((day) => {
                  const ds = toDateString(day);
                  const dayEvents = timedByDate[ds] || [];
                  return (
                    <div
                      key={`ev-${ds}`}
                      className={`flex-1 ${COL_MIN_W} relative`}
                      style={{ height: `${timeSlots.length * SLOT_HEIGHT}px` }}
                    >
                      {dayEvents.map((ev) => {
                        if (!ev.start_time) return null;
                        const [sh, sm] = ev.start_time.split(':').map(Number);
                        const startMin = sh * 60 + sm;
                        const workStartMin = startHour * 60;
                        const evTop = ((startMin - workStartMin) / 30) * SLOT_HEIGHT;

                        let endMin = startMin + 30;
                        if (ev.end_time) {
                          const [eh, em] = ev.end_time.split(':').map(Number);
                          endMin = eh * 60 + em;
                        }
                        const evHeight = Math.max(((endMin - startMin) / 30) * SLOT_HEIGHT, SLOT_HEIGHT * 0.6);

                        if (evTop < 0) return null;

                        // Drag/resize visual adjustments
                        const isActive = eventInteraction?.eventId === ev.id;
                        const interType = isActive ? eventInteraction!.type : null;
                        const offset = isActive ? eventInteraction!.offsetPx : 0;

                        let displayTop = evTop;
                        let displayHeight = evHeight;
                        let displayStartTime = ev.start_time.slice(0, 5);
                        let displayEndTime = ev.end_time?.slice(0, 5) || '';

                        if (isActive && offset !== 0) {
                          const deltaMin = (offset / SLOT_HEIGHT) * 30;
                          if (interType === 'drag') {
                            displayTop = evTop + offset;
                            displayStartTime = fmtMinToTime(startMin + deltaMin);
                            displayEndTime = fmtMinToTime(endMin + deltaMin);
                          } else if (interType === 'resize-top') {
                            displayTop = evTop + offset;
                            displayHeight = evHeight - offset;
                            displayStartTime = fmtMinToTime(startMin + deltaMin);
                          } else if (interType === 'resize-bottom') {
                            displayHeight = evHeight + offset;
                            displayEndTime = fmtMinToTime(endMin + deltaMin);
                          }
                          displayHeight = Math.max(displayHeight, SLOT_HEIGHT * 0.6);
                        }

                        return (
                          <div
                            key={ev.id}
                            onClick={() => !eventInteraction && setEditEvent(ev)}
                            onMouseDown={(e) => handleEventDragStart(e, ev)}
                            onMouseUp={handleEventMouseUp}
                            onMouseLeave={() => {
                              if (eventLongPressTimer.current && !eventInteraction) {
                                clearTimeout(eventLongPressTimer.current);
                                eventLongPressTimer.current = null;
                              }
                            }}
                            className={`absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 pointer-events-auto overflow-hidden group
                              ${isActive && interType === 'drag'
                                ? 'cursor-grabbing shadow-2xl ring-2 ring-white/30 z-20'
                                : isActive
                                  ? 'cursor-ns-resize shadow-lg z-20'
                                  : 'cursor-pointer hover:shadow-lg transition-shadow'
                              }`}
                            style={{
                              top: `${displayTop}px`,
                              height: `${displayHeight}px`,
                              backgroundColor: `${ev.color}25`,
                              borderLeftColor: ev.color,
                            }}
                          >
                            {/* Top resize handle */}
                            <div
                              data-resize-handle="true"
                              className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/20 transition-colors z-10"
                              onMouseDown={(e) => handleEventResizeStart(e, ev, 'top')}
                            />

                            <div className="flex flex-col h-full overflow-hidden">
                              <span className="text-xs font-medium text-white truncate flex items-center gap-1">
                                {ev.recurrence_group_id && <RotateCw className="h-2.5 w-2.5 text-purple-400 flex-shrink-0" />}
                                {ev.title}
                              </span>
                              {displayHeight > 30 && (
                                <span className="text-[10px] text-slate-400">
                                  {displayStartTime}
                                  {displayEndTime && ` - ${displayEndTime}`}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteEvent(ev.id);
                              }}
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400 transition-all"
                            >
                              <Trash2 size={10} />
                            </button>

                            {/* Bottom resize handle */}
                            <div
                              data-resize-handle="true"
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/20 transition-colors z-10"
                              onMouseDown={(e) => handleEventResizeStart(e, ev, 'bottom')}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* ======== Bottom guide ======== */}
        <div className="px-3 md:px-6 py-2 border-t border-white/[0.06] flex-shrink-0">
          <p className="text-[10px] md:text-xs text-slate-500">
            <span className="hidden sm:inline">Drag on the grid to create a new event, or drag edges to resize. Long-press to move</span>
            <span className="sm:hidden">Tap to create or edit events</span>
          </p>
        </div>
      </div>

      {/* ======== Modals ======== */}
      <AnimatePresence>
        {isCreateOpen && (
          <CreateEventModal
            date={createDate}
            initialStartTime={createStartTime}
            initialEndTime={createEndTime}
            initialRecurrenceRule={createInitialRecurrence}
            onClose={() => setIsCreateOpen(false)}
            onCreate={handleCreateEvent}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <ScheduleSettingsModal
            settings={settings}
            onSave={(s) => {
              setSettings(s);
              saveSettings(s);
              setShowSettings(false);
            }}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editEvent && (
          <EventDetailModal
            event={editEvent}
            onClose={() => setEditEvent(null)}
            onDelete={handleDeleteEvent}
            onUpdate={handleUpdateEvent}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreateHabitOpen && (
          <CreateHabitModal
            onClose={() => setIsCreateHabitOpen(false)}
            onCreate={handleCreateHabit}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================
   Create Event Modal
   ================================================================ */
function CreateEventModal({
  date,
  initialStartTime,
  initialEndTime,
  initialRecurrenceRule,
  onClose,
  onCreate,
}: {
  date: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialRecurrenceRule?: string;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    color: string;
    all_day: boolean;
    recurrence_rule?: string;
    recurrence_end_date?: string;
    recurrence_days_of_week?: number[];
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState(initialStartTime || '');
  const [endTime, setEndTime] = useState(initialEndTime || '');
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [recurrenceRule, setRecurrenceRule] = useState(initialRecurrenceRule || '');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>([]);

  // Mode & task selection state
  const [mode, setMode] = useState<'new' | 'task'>('new');
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);

  // Fetch tasks when switching to task mode
  useEffect(() => {
    if (mode === 'task' && tasks.length === 0 && !isLoadingTasks) {
      setIsLoadingTasks(true);
      personalTaskService.getTasks()
        .then((all: PersonalTask[]) => setTasks(all.filter(t => t.status !== 'DONE' && t.status !== 'ARCHIVED')))
        .catch(console.error)
        .finally(() => setIsLoadingTasks(false));
    }
  }, [mode]);

  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return tasks;
    const q = taskSearch.toLowerCase();
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.category && t.category.toLowerCase().includes(q)) ||
      t.tags?.some(tag => tag.name.toLowerCase().includes(q)),
    );
  }, [tasks, taskSearch]);

  const handleSelectTask = (task: PersonalTask) => {
    setSelectedTask(task);
    setTitle(task.title);
    setDescription(task.description || '');
    if (task.color && EVENT_COLORS.includes(task.color)) {
      setColor(task.color);
    }
  };

  const handleClearTask = () => {
    setSelectedTask(null);
    setTitle('');
    setDescription('');
    setColor(EVENT_COLORS[0]);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (recurrenceRule && !recurrenceEndDate) return;
    if (recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length === 0) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      color,
      all_day: false,
      recurrence_rule: recurrenceRule || undefined,
      recurrence_end_date: recurrenceEndDate || undefined,
      recurrence_days_of_week: recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length > 0
        ? recurrenceDaysOfWeek : undefined,
    });
  };

  const showForm = mode === 'new' || selectedTask !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-white/10 p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base md:text-lg font-bold text-white">New Event</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-xl mb-4 md:mb-5">
          <button
            onClick={() => { setMode('new'); setSelectedTask(null); setTitle(''); setDescription(''); setColor(EVENT_COLORS[0]); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'new'
                ? 'bg-bridge-accent text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Plus size={14} />
            New Event
          </button>
          <button
            onClick={() => setMode('task')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
              mode === 'task'
                ? 'bg-bridge-accent text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ListTodo size={14} />
            From Task
          </button>
        </div>

        {/* Task selection list (only when task mode & no task selected yet) */}
        {mode === 'task' && !selectedTask && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                autoFocus
              />
            </div>

            <div className="max-h-[40vh] overflow-y-auto space-y-1.5 -mx-1 px-1">
              {isLoadingTasks ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ListTodo size={24} className="text-slate-600 mb-2" />
                  <p className="text-sm text-slate-500">
                    {tasks.length === 0 ? 'No active tasks' : 'No tasks match your search'}
                  </p>
                  {tasks.length === 0 && (
                    <button
                      onClick={() => setMode('new')}
                      className="mt-2 text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors"
                    >
                      Create a new event instead
                    </button>
                  )}
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleSelectTask(task)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 transition-all text-left group"
                  >
                    {task.priority !== 'NONE' && (
                      <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white truncate block">{task.title}</span>
                      {(task.category || task.due_date) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.category && <span className="text-[10px] text-slate-500">{task.category}</span>}
                          {task.due_date && <span className="text-[10px] text-slate-500">{formatDate(task.due_date)}</span>}
                        </div>
                      )}
                    </div>
                    {task.color && (
                      <div
                        className="w-3 h-3 rounded-full shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: task.color }}
                      />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Event form (new mode OR task selected) */}
        {showForm && (
          <div className="space-y-3 md:space-y-4">
            {/* Selected task indicator */}
            {selectedTask && (
              <div className="flex items-center gap-2 px-3 py-2 bg-bridge-accent/10 border border-bridge-accent/20 rounded-xl">
                <CheckCircle2 size={14} className="text-bridge-accent shrink-0" />
                <span className="text-xs text-bridge-accent flex-1 truncate">
                  Scheduling: {selectedTask.title}
                </span>
                <button
                  onClick={handleClearTask}
                  className="p-0.5 text-bridge-accent/60 hover:text-bridge-accent transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                Date
              </label>
              <div className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                {formatDate(date)}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Event title"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                autoFocus={mode === 'new'}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
              />
            </div>

            {/* Time inputs */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Start
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                  End
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                Color
              </label>
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

            {/* Recurrence */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                Repeat
              </label>
              <select
                value={recurrenceRule}
                onChange={(e) => {
                  setRecurrenceRule(e.target.value);
                  if (!e.target.value) {
                    setRecurrenceDaysOfWeek([]);
                    setRecurrenceEndDate('');
                  }
                }}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              >
                <option value="" className="bg-bridge-obsidian">No repeat</option>
                <option value="DAILY" className="bg-bridge-obsidian">Every day</option>
                <option value="WEEKLY" className="bg-bridge-obsidian">Every week</option>
              </select>
            </div>

            {recurrenceRule === 'WEEKLY' && (
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Repeat on
                </label>
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3, 4, 5, 6].map((dayValue) => {
                    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const isSelected = recurrenceDaysOfWeek.includes(dayValue);
                    return (
                      <button
                        key={dayValue}
                        type="button"
                        onClick={() => {
                          setRecurrenceDaysOfWeek((prev) =>
                            isSelected ? prev.filter((d) => d !== dayValue) : [...prev, dayValue],
                          );
                        }}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                          isSelected
                            ? 'bg-bridge-accent text-white'
                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        {labels[dayValue]}
                      </button>
                    );
                  })}
                </div>
                {recurrenceDaysOfWeek.length === 0 && (
                  <p className="mt-1 text-xs text-amber-400">Select at least one day</p>
                )}
              </div>
            )}

            {recurrenceRule && (
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Repeat until
                </label>
                <input
                  type="date"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  min={date}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
                {!recurrenceEndDate && (
                  <p className="mt-1 text-xs text-amber-400">End date is required for recurring events</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          {showForm && (
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || (!!recurrenceRule && !recurrenceEndDate) || (recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length === 0)}
              className="flex-1 py-3 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Create
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ================================================================
   Event Detail / Edit Modal
   ================================================================ */
function EventDetailModal({
  event,
  onClose,
  onDelete,
  onUpdate,
}: {
  event: PersonalEvent;
  onClose: () => void;
  onDelete: (id: string, scope?: string) => void;
  onUpdate: (
    id: string,
    data: {
      title?: string;
      description?: string;
      event_date?: string;
      start_time?: string | null;
      end_time?: string | null;
      color?: string;
      all_day?: boolean;
    },
  ) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description || '');
  const [startTime, setStartTime] = useState(event.start_time?.slice(0, 5) || '');
  const [endTime, setEndTime] = useState(event.end_time?.slice(0, 5) || '');
  const [color, setColor] = useState(event.color);
  const [showDeleteScope, setShowDeleteScope] = useState(false);

  const handleSave = () => {
    if (!title.trim()) return;
    onUpdate(event.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      event_date: event.event_date,
      start_time: startTime || null,
      end_time: endTime || null,
      color,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-white/10 p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <h3 className="text-base md:text-lg font-bold text-white">Edit Event</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (event.recurrence_group_id) {
                  setShowDeleteScope(true);
                } else {
                  onDelete(event.id);
                }
              }}
              className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
              title="Delete event"
            >
              <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {showDeleteScope && (
          <div className="mb-4 p-4 bg-white/5 rounded-xl border border-white/10 space-y-2.5">
            <p className="text-sm text-slate-300 font-medium">This is a recurring event</p>
            <button
              onClick={() => onDelete(event.id, 'THIS_ONLY')}
              className="w-full px-4 py-2.5 text-sm font-semibold bg-white/5 border border-white/10 rounded-xl text-white hover:bg-white/10 transition-all"
            >
              Delete this event only
            </button>
            <button
              onClick={() => onDelete(event.id, 'THIS_AND_FUTURE')}
              className="w-full px-4 py-2.5 text-sm font-semibold bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-all"
            >
              Delete this and all future events
            </button>
            <button
              onClick={() => setShowDeleteScope(false)}
              className="w-full px-4 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <div className="space-y-4">
          {/* Date */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              Date
            </label>
            <div className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
              {formatDate(event.event_date)}
            </div>
            {event.recurrence_group_id && (
              <div className="flex items-center gap-1.5 mt-2">
                <RotateCw className="h-3 w-3 text-purple-400" />
                <span className="text-xs text-purple-400">
                  {event.recurrence_rule === 'DAILY' ? 'Repeats daily' : 'Repeats weekly'}
                  {event.recurrence_end_date && ` until ${formatDate(event.recurrence_end_date)}`}
                </span>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all resize-none"
            />
          </div>

          {/* Time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
              Color
            </label>
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
            onClick={handleSave}
            disabled={!title.trim()}
            className="flex-1 py-3 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ================================================================
   Schedule Settings Modal
   ================================================================ */
const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i); // 0~24

function ScheduleSettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: ScheduleSettings;
  onSave: (s: ScheduleSettings) => void;
  onClose: () => void;
}) {
  const [sHour, setSHour] = useState(settings.startHour);
  const [eHour, setEHour] = useState(settings.endHour);

  const isValid = eHour > sHour;

  const handleSave = () => {
    if (!isValid) return;
    onSave({ startHour: sHour, endHour: eHour });
  };

  const fmtHour = (h: number) => `${h.toString().padStart(2, '0')}:00`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        className="w-full sm:max-w-sm bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-white/10 p-5 md:p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <h3 className="text-base md:text-lg font-bold text-white">Schedule Settings</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              Start Time
            </label>
            <select
              value={sHour}
              onChange={(e) => setSHour(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all appearance-none cursor-pointer"
            >
              {HOUR_OPTIONS.filter((h) => h < 24).map((h) => (
                <option key={h} value={h} className="bg-bridge-obsidian text-white">
                  {fmtHour(h)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              End Time
            </label>
            <select
              value={eHour}
              onChange={(e) => setEHour(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all appearance-none cursor-pointer"
            >
              {HOUR_OPTIONS.filter((h) => h >= 1).map((h) => (
                <option key={h} value={h} className="bg-bridge-obsidian text-white">
                  {fmtHour(h)}
                </option>
              ))}
            </select>
          </div>

          {!isValid && (
            <p className="text-xs text-rose-400">End time must be after start time</p>
          )}

          <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/5">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Preview</span>
            <p className="text-sm text-white mt-1">
              {fmtHour(sHour)} — {fmtHour(eHour)}{' '}
              <span className="text-slate-400">({eHour - sHour}h)</span>
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="flex-1 py-3 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ================================================================
   Create Habit Modal (Progressive Disclosure)
   ================================================================ */

const HABIT_COLORS = [
  '#8B5CF6', '#6366F1', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

const HABIT_ICONS = [
  '🏃', '📚', '💧', '🧘', '💪', '🎯', '✍️', '🎵',
  '🧠', '🌿', '💊', '🍎', '😴', '🚶', '🧹', '📵',
];

const FREQUENCY_PRESETS: { value: HabitFrequency; label: string }[] = [
  { value: 'DAILY', label: 'Every Day' },
  { value: 'WEEKDAY', label: 'Weekdays' },
  { value: 'CUSTOM', label: 'Custom' },
];

const DAY_CHIPS = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
];

function CreateHabitModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    frequency_type?: HabitFrequency;
    frequency_days?: string;
    target_count?: number;
    unit?: string;
  }) => void;
}) {
  const [title, setTitle] = useState('');
  const [frequencyType, setFrequencyType] = useState<HabitFrequency>('DAILY');
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [showMore, setShowMore] = useState(false);

  // Advanced fields
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [goalType, setGoalType] = useState<'check' | 'count'>('check');
  const [targetCount, setTargetCount] = useState(1);
  const [unit, setUnit] = useState('');
  const [description, setDescription] = useState('');

  const isValid = title.trim().length > 0 && (frequencyType !== 'CUSTOM' || customDays.length > 0);

  const toggleDay = (day: number) => {
    setCustomDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      icon: icon || undefined,
      color,
      frequency_type: frequencyType,
      frequency_days: frequencyType === 'CUSTOM' ? customDays.sort((a, b) => a - b).join(',') : undefined,
      target_count: goalType === 'count' ? targetCount : 1,
      unit: goalType === 'count' && unit.trim() ? unit.trim() : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-white/10 p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-purple-400" />
            <h3 className="text-base md:text-lg font-bold text-white">New Habit</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Habit Name */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              Habit Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Morning Run, Read 10 pages"
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
              autoFocus
            />
          </div>

          {/* Frequency */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
              Frequency
            </label>
            <div className="flex gap-1.5">
              {FREQUENCY_PRESETS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => {
                    setFrequencyType(value);
                    if (value !== 'CUSTOM') setCustomDays([]);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                    frequencyType === value
                      ? 'bg-purple-500 text-white shadow-sm'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Day Selector */}
          {frequencyType === 'CUSTOM' && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                Repeat on
              </label>
              <div className="flex gap-1.5">
                {DAY_CHIPS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => toggleDay(value)}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
                      customDays.includes(value)
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {customDays.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-400">Select at least one day</p>
              )}
            </div>
          )}

          {/* More Options Toggle */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
          >
            {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showMore ? 'Less options' : 'More options'}
          </button>

          {/* Expanded Options */}
          <AnimatePresence>
            {showMore && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                {/* Icon Picker */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                    Icon
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {HABIT_ICONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => setIcon(icon === emoji ? '' : emoji)}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg text-base transition-all ${
                          icon === emoji
                            ? 'bg-purple-500/20 ring-2 ring-purple-500 scale-110'
                            : 'bg-white/5 hover:bg-white/10 hover:scale-105'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Picker */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                    Color
                  </label>
                  <div className="flex gap-2">
                    {HABIT_COLORS.map((c) => (
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

                {/* Goal Type */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                    Goal Type
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setGoalType('check'); setTargetCount(1); setUnit(''); }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
                        goalType === 'check'
                          ? 'bg-purple-500 text-white shadow-sm'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      <CheckCircle2 size={14} />
                      Check-off
                    </button>
                    <button
                      onClick={() => setGoalType('count')}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition-all ${
                        goalType === 'count'
                          ? 'bg-purple-500 text-white shadow-sm'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      <Hash size={14} />
                      Count
                    </button>
                  </div>
                </div>

                {/* Target Count + Unit (only for count goal) */}
                {goalType === 'count' && (
                  <div className="flex gap-3">
                    <div className="w-24">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                        Target
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={targetCount}
                        onChange={(e) => setTargetCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                        Unit
                      </label>
                      <input
                        type="text"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        placeholder="e.g. glasses, pages, km"
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Why this habit matters to you"
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
            disabled={!isValid}
            className="flex-1 py-3 bg-purple-500 text-white text-sm font-bold rounded-xl hover:bg-purple-500/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Add Habit
          </button>
        </div>
      </motion.div>
    </div>
  );
}
