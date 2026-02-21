import { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Loader2, Settings, RotateCw, CalendarDays, Clock, CheckCircle2, ListTodo, AlertCircle, Search, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionModal } from '../ui/MotionModal';
import { TimePicker } from '../ui/TimePicker';
import { personalEventService, personalTaskService } from '../../utils/services';
import { personalHabitAPI } from '../../utils/api';
import { CheckInConfirmModal } from './PersonalHabits';
import { formatDate } from '../../utils/dateUtils';
import { useHolidays } from '../../hooks/useHolidays';
import type { PersonalEvent, PersonalTask, PersonalTaskPriority, PersonalHabit, HabitWeeklyRow, HabitFrequency } from '../../types';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  addMonths,
  subMonths,
  isSameMonth,
  isToday as isTodayFn,
  format,
} from 'date-fns';

const EVENT_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

const PRIORITY_DOT: Record<string, string> = {
  MEDIUM: 'bg-amber-400',
  HIGH: 'bg-orange-500', URGENT: 'bg-red-500',
};

function ColorDropdown({ color, onChange, colors = EVENT_COLORS }: { color: string; onChange: (c: string) => void; colors?: string[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useLayoutEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  return (
    <div>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-foreground/5 border border-foreground/10 rounded-xl hover:bg-foreground/10 transition-all"
      >
        <span className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-bridge-obsidian border border-foreground/10 rounded-xl p-2 shadow-2xl"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => { onChange(c); setOpen(false); }}
                className={`w-7 h-7 rounded-full transition-all ${
                  color === c
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian scale-110'
                    : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const SLOT_HEIGHT = 40;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 23;
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
  const { t, i18n } = useTranslation();
  const { holidayMap } = useHolidays(i18n.language, new Date().getFullYear());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [habitRows, setHabitRows] = useState<HabitWeeklyRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<ScheduleSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);

  // View mode: day or week (mobile defaults to day, desktop to week)
  const [viewMode, setViewMode] = useState<'day' | 'week'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'
  );

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
  // Habit confirm modal
  const [habitConfirm, setHabitConfirm] = useState<{ habitId: string; date: string; isUndo: boolean; title: string; icon?: string } | null>(null);

  // Mobile sidebar
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

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
    overlap: boolean;
  } | null>(null);
  const eventOffsetRef = useRef(0);
  const eventOverlapRef = useRef(false);
  const eventLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timeSlots = useMemo(() => generateTimeSlots(startHour, endHour), [startHour, endHour]);

  const weekDays = useMemo(() => {
    if (viewMode === 'day') return [currentDate];
    const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
    const we = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: ws, end: we });
  }, [currentDate, viewMode]);

  const startDate = toDateString(weekDays[0]);
  const endDate = toDateString(weekDays[weekDays.length - 1]);

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
      await personalHabitAPI.checkIn(habitId, { log_date: date });
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
  const handlePrev = () => setCurrentDate((d) => viewMode === 'day' ? subDays(d, 1) : subWeeks(d, 1));
  const handleNext = () => setCurrentDate((d) => viewMode === 'day' ? addDays(d, 1) : addWeeks(d, 1));
  const handleToday = () => setCurrentDate(new Date());

  const todayStr = toDateString(new Date());
  const isTodayInView = weekDays.some((d) => toDateString(d) === todayStr);

  // ---- Events grouped by date ----
  const { allDayByDate, timedByDate, hasAllDay, overnightContinuations } = useMemo(() => {
    const allDay: Record<string, PersonalEvent[]> = {};
    const timed: Record<string, PersonalEvent[]> = {};
    const continuations = new Set<string>(); // "eventId:dateStr" for next-day continuation blocks
    let hasAny = false;
    events.forEach((e) => {
      if (e.all_day || (!e.start_time && !e.end_time)) {
        (allDay[e.event_date] ??= []).push(e);
        hasAny = true;
      } else if (e.start_time) {
        (timed[e.event_date] ??= []).push(e);
        // Overnight events (end_time < start_time): also add to next day
        if (e.end_time && e.end_time < e.start_time) {
          const nextDateStr = format(addDays(new Date(e.event_date + 'T00:00:00'), 1), 'yyyy-MM-dd');
          (timed[nextDateStr] ??= []).push(e);
          continuations.add(`${e.id}:${nextDateStr}`);
        }
      }
    });
    return { allDayByDate: allDay, timedByDate: timed, hasAllDay: hasAny, overnightContinuations: continuations };
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
    const et = timeSlots[maxIdx + 1] || (endHour >= 24 ? '23:59' : `${endHour}:00`);

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
      await personalEventService.create({ ...data, event_date: createDate, event_type: 'SCHEDULE' });
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
      recurrence_rule?: string;
      recurrence_end_date?: string;
      recurrence_days_of_week?: number[];
      scope?: string;
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
    if (min >= 1440) return '23:59';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const checkEventOverlap = (eventId: string, eventDate: string, newStartMin: number, newEndMin: number): boolean => {
    const dayEvents = timedByDate[eventDate] || [];
    for (const other of dayEvents) {
      if (other.id === eventId) continue;
      // Skip continuation entries (same event appearing on next day)
      if (overnightContinuations.has(`${other.id}:${eventDate}`)) continue;
      if (!other.start_time || !other.end_time) continue;
      const [osh, osm] = other.start_time.split(':').map(Number);
      const [oeh, oem] = other.end_time.split(':').map(Number);
      const otherStart = osh * 60 + osm;
      // Overnight: extend end past midnight
      const otherEnd = oeh * 60 + oem <= otherStart ? (oeh * 60 + oem) + 24 * 60 : oeh * 60 + oem;
      const effNewEnd = newEndMin <= newStartMin ? newEndMin + 24 * 60 : newEndMin;
      if (newStartMin < otherEnd && effNewEnd > otherStart) return true;
    }
    return false;
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
    eventOverlapRef.current = false;
    setEventInteraction({ eventId: ev.id, type, offsetPx: 0, overlap: false });
    document.body.style.userSelect = 'none';

    const onMove = (me: MouseEvent) => {
      const deltaY = me.clientY - startY;
      const snapped = Math.round(deltaY / SLOT_HEIGHT) * SLOT_HEIGHT;
      eventOffsetRef.current = snapped;

      const deltaMin = (snapped / SLOT_HEIGHT) * 30;
      let checkStart = origStartMin;
      let checkEnd = origEndMin;
      if (type === 'resize-top') {
        checkStart = Math.max(workStartMin, Math.min(origEndMin - 30, origStartMin + deltaMin));
      } else {
        checkEnd = Math.min(workEndMin, Math.max(origStartMin + 30, origEndMin + deltaMin));
      }
      const hasOverlap = checkEventOverlap(ev.id, ev.event_date, checkStart, checkEnd);
      eventOverlapRef.current = hasOverlap;
      setEventInteraction({ eventId: ev.id, type, offsetPx: snapped, overlap: hasOverlap });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';

      const finalOffset = eventOffsetRef.current;
      const finalOverlap = eventOverlapRef.current;
      setEventInteraction(null);
      eventOffsetRef.current = 0;
      eventOverlapRef.current = false;

      if (finalOffset === 0 || finalOverlap) return;

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
    const duration = origEndMin >= origStartMin
      ? origEndMin - origStartMin
      : (24 * 60 - origStartMin) + origEndMin;
    const workStartMin = startHour * 60;
    const workEndMin = endHour * 60;
    const origTop = ((origStartMin - workStartMin) / 30) * SLOT_HEIGHT;

    eventLongPressTimer.current = setTimeout(() => {
      eventOffsetRef.current = 0;
      eventOverlapRef.current = false;
      setEventInteraction({ eventId: ev.id, type: 'drag', offsetPx: 0, overlap: false });
      document.body.style.userSelect = 'none';

      const onMove = (me: MouseEvent) => {
        const deltaY = me.clientY - startY;
        const newTop = origTop + deltaY;
        const snappedTop = Math.round(newTop / SLOT_HEIGHT) * SLOT_HEIGHT;
        const snappedOffset = snappedTop - origTop;
        eventOffsetRef.current = snappedOffset;

        const deltaMin = (snappedOffset / SLOT_HEIGHT) * 30;
        let checkStart = origStartMin + deltaMin;
        let checkEnd = checkStart + duration;
        if (checkStart < workStartMin) { checkStart = workStartMin; checkEnd = workStartMin + duration; }
        if (checkEnd > workEndMin) { checkEnd = workEndMin; checkStart = workEndMin - duration; }
        const hasOverlap = checkEventOverlap(ev.id, ev.event_date, checkStart, checkEnd);
        eventOverlapRef.current = hasOverlap;
        setEventInteraction({ eventId: ev.id, type: 'drag', offsetPx: snappedOffset, overlap: hasOverlap });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';

        const finalOffset = eventOffsetRef.current;
        const finalOverlap = eventOverlapRef.current;
        setEventInteraction(null);
        eventOffsetRef.current = 0;
        eventOverlapRef.current = false;

        if (finalOffset === 0 || finalOverlap) return;

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
    const weekMid = weekDays[Math.min(3, weekDays.length - 1)]; // use mid-week to determine month
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

  const miniCalWeekDays = [
    t('personal.schedule.weekSun'),
    t('personal.schedule.weekMon'),
    t('personal.schedule.weekTue'),
    t('personal.schedule.weekWed'),
    t('personal.schedule.weekThu'),
    t('personal.schedule.weekFri'),
    t('personal.schedule.weekSat'),
  ];

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
    if (e.recurrence_rule === 'DAILY') return t('personal.schedule.everyDay');
    if (e.recurrence_rule === 'WEEKLY' && e.recurrence_days_of_week) {
      const dayLabels = [
        t('personal.schedule.daySun'),
        t('personal.schedule.dayMon'),
        t('personal.schedule.dayTue'),
        t('personal.schedule.dayWed'),
        t('personal.schedule.dayThu'),
        t('personal.schedule.dayFri'),
        t('personal.schedule.daySat'),
      ];
      const days = e.recurrence_days_of_week.split(',').map(Number);
      return days.map((d) => dayLabels[d]).join(', ');
    }
    return t('personal.schedule.recurring');
  };

  // ---- Render ----
  return (
    <div className="h-full flex flex-col md:flex-row relative">
      {/* Mobile Overlay Backdrop */}
      <AnimatePresence>
        {showMobileSidebar && (
          <motion.div
            className="md:hidden fixed inset-0 z-50"
            onClick={() => setShowMobileSidebar(false)}
            initial={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
            animate={{ backgroundColor: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
            exit={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      {/* ======== Left Sidebar ======== */}
      <div className={`
        fixed md:relative inset-y-0 left-0 z-50 md:z-auto
        w-[300px] md:w-[340px] flex-shrink-0 border-r border-foreground/5 flex flex-col overflow-hidden
        bg-bridge-dark md:bg-transparent
        transition-transform duration-300 ease-in-out
        ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          {/* Title */}
          <div className="flex items-center gap-2.5 mb-4">
            <CalendarDays size={18} className="text-bridge-accent" />
            <h2 className="text-base font-bold text-foreground">{t('personal.schedule.title')}</h2>
            <button
              onClick={() => setShowMobileSidebar(false)}
              className="md:hidden ml-auto p-1.5 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground">
              {t('personal.schedule.monthYear', { year: format(calendarMonth, 'yyyy'), month: format(calendarMonth, 'M') })}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleToday}
                className="px-2 py-0.5 text-[10px] font-semibold rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                {t('personal.schedule.today')}
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Mini Calendar Grid */}
        <div className="px-4 pb-4 flex-shrink-0">
          <div className="bg-bridge-obsidian rounded-xl border border-foreground/5 p-3">
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
                const isHoliday = holidayMap.has(dateKey);

                return (
                  <button
                    key={dateKey}
                    onClick={() => handleCalendarDateClick(day)}
                    className={`
                      relative flex flex-col items-center justify-center py-1.5 rounded-lg transition-all min-h-[36px]
                      ${isInCurrentWeek
                        ? 'bg-bridge-accent/10 border border-bridge-accent/20'
                        : 'border border-transparent hover:bg-foreground/5'
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
                            ? isHoliday || dayOfWeek === 0 ? 'text-red-400' : 'text-foreground'
                            : isHoliday || dayOfWeek === 0
                              ? 'text-red-400/80'
                              : dayOfWeek === 6
                                ? 'text-blue-400/80'
                                : 'text-muted-foreground'
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
                {t('personal.schedule.recurring')}
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
              {t('personal.schedule.add')}
            </button>
          </div>
          {recurringEvents.length === 0 ? (
            <div className="text-center py-6">
              <RotateCw size={20} className="mx-auto text-slate-600 mb-2" />
              <p className="text-slate-500 text-xs">{t('personal.schedule.noRecurring')}</p>
              <p className="text-slate-600 text-[10px] mt-1">{t('personal.schedule.noRecurringHint')}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recurringEvents.map((e) => (
                <button
                  key={e.recurrence_group_id}
                  onClick={() => setEditEvent(e)}
                  className="w-full text-left p-2.5 rounded-xl transition-all group bg-white/[0.03] border border-foreground/5 hover:bg-white/[0.06] hover:border-foreground/10"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-1 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: e.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium text-foreground truncate block group-hover:text-bridge-accent transition-colors">
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
                            {e.end_time && <>{` - ${e.end_time.slice(0, 5)}`}{e.end_time < e.start_time && <span className="text-bridge-accent ml-0.5">({t('personal.schedule.nextDay')})</span>}</>}
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
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
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
              className="p-1.5 md:p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
            >
              <ChevronLeft size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <h2 className="text-xs md:text-lg font-bold min-w-0 text-center whitespace-nowrap">
              {viewMode === 'day' ? (
                <>
                  <span className="hidden sm:inline">{format(weekDays[0], 'EEE, MMM d, yyyy')}</span>
                  <span className="sm:hidden">{format(weekDays[0], 'EEE M/d')}</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">{format(weekDays[0], 'MMM d')} - {format(weekDays[weekDays.length - 1], 'MMM d, yyyy')}</span>
                  <span className="sm:hidden">{format(weekDays[0], 'M/d')} - {format(weekDays[weekDays.length - 1], 'M/d')}</span>
                </>
              )}
            </h2>
            <button
              onClick={handleNext}
              className="p-1.5 md:p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
            >
              <ChevronRight size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
            <button
              onClick={handleToday}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold rounded-lg transition-colors ${
                isTodayInView
                  ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white'
                  : 'text-bridge-secondary border border-bridge-secondary/30 hover:bg-bridge-secondary/10'
              }`}
            >
              {t('personal.schedule.today')}
            </button>
            {/* Day / Week toggle */}
            <div className="flex items-center bg-foreground/5 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('day')}
                className={`px-2 md:px-2.5 py-0.5 md:py-1 text-[10px] md:text-xs font-bold rounded-md transition-all ${
                  viewMode === 'day'
                    ? 'bg-bridge-accent text-white shadow-sm'
                    : 'text-slate-400 hover:text-foreground'
                }`}
              >
                {t('personal.schedule.viewDay', 'Day')}
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-2 md:px-2.5 py-0.5 md:py-1 text-[10px] md:text-xs font-bold rounded-md transition-all ${
                  viewMode === 'week'
                    ? 'bg-bridge-accent text-white shadow-sm'
                    : 'text-slate-400 hover:text-foreground'
                }`}
              >
                {t('personal.schedule.viewWeek', 'Week')}
              </button>
            </div>
            {isLoading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />}
          </div>

          <div className="flex items-center gap-1.5 md:gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 md:p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-xl transition-colors"
              title={t('personal.schedule.settings')}
            >
              <Settings size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          </div>
        </div>

        {/* ======== Time-grid ======== */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <div className={viewMode === 'day' ? '' : 'min-w-[520px] md:min-w-[760px]'}>
          {/* ---- Day headers (sticky) ---- */}
          <div className="flex sticky top-0 bg-bridge-obsidian/95 backdrop-blur-sm z-10 border-b border-white/[0.06]">
            <div className={`${TIME_COL_W} flex-shrink-0 border-r border-white/[0.06]`} />
            {weekDays.map((day, idx) => {
              const ds = toDateString(day);
              const isToday = ds === todayStr;
              const isHoliday = holidayMap.has(ds);
              return (
                <div
                  key={ds}
                  className={`flex-1 ${COL_MIN_W} p-3 border-r border-white/[0.06] ${
                    isToday ? 'bg-bridge-accent/5' : ''
                  }`}
                >
                  <div
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      isToday ? 'text-bridge-secondary' : isHoliday || day.getDay() === 0 ? 'text-red-400/60' : day.getDay() === 6 ? 'text-blue-400/60' : 'text-slate-500'
                    }`}
                  >
                    {[
                      t('personal.schedule.daySun'),
                      t('personal.schedule.dayMon'),
                      t('personal.schedule.dayTue'),
                      t('personal.schedule.dayWed'),
                      t('personal.schedule.dayThu'),
                      t('personal.schedule.dayFri'),
                      t('personal.schedule.daySat'),
                    ][day.getDay()]}
                  </div>
                  <div className={`text-lg font-bold ${isToday ? 'text-bridge-secondary' : isHoliday ? 'text-red-400' : 'text-foreground'}`}>
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
                {t('personal.schedule.all')}
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
                        <span className="text-foreground/90 truncate flex items-center gap-1">
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
                            isDone ? 'line-through text-slate-500' : isOverdue ? 'text-red-300' : 'text-foreground/80'
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
                          onClick={() => setHabitConfirm({ habitId: item.habit_id, date: ds, isUndo: item.is_completed, title: item.title, icon: item.icon })}
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
                            item.is_completed ? 'line-through text-slate-500' : 'text-foreground/80'
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
                {t('personal.schedule.addHabit')}
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
            {isTodayInView && currentTimeTop != null && (
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
                        const isContinuation = overnightContinuations.has(`${ev.id}:${ds}`);
                        const workStartMin = startHour * 60;

                        let startMin: number;
                        let endMin: number;

                        if (isContinuation) {
                          // Continuation block: 00:00 (or grid start) → end_time
                          startMin = workStartMin;
                          const [eh, em] = ev.end_time!.split(':').map(Number);
                          endMin = eh * 60 + em;
                          if (endMin <= workStartMin) return null; // ends before grid starts
                        } else {
                          const [sh, sm] = ev.start_time.split(':').map(Number);
                          startMin = sh * 60 + sm;
                          endMin = startMin + 30;
                          if (ev.end_time) {
                            const [eh, em] = ev.end_time.split(':').map(Number);
                            endMin = eh * 60 + em;
                            // Overnight: endTime < startTime → cap to end of grid
                            if (endMin < startMin) {
                              endMin = endHour * 60;
                            }
                          }
                        }

                        const evTop = ((startMin - workStartMin) / 30) * SLOT_HEIGHT;
                        const evHeight = Math.max(((endMin - startMin) / 30) * SLOT_HEIGHT, SLOT_HEIGHT * 0.6);

                        if (evTop < 0) return null;

                        // Drag/resize visual adjustments
                        const isActive = eventInteraction?.eventId === ev.id;
                        const interType = isActive ? eventInteraction!.type : null;
                        const offset = isActive ? eventInteraction!.offsetPx : 0;
                        const hasOverlap = isActive ? eventInteraction!.overlap : false;

                        let displayTop = evTop;
                        let displayHeight = evHeight;
                        let displayStartTime = isContinuation ? '00:00' : ev.start_time.slice(0, 5);
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
                            key={isContinuation ? `${ev.id}-cont` : ev.id}
                            onClick={() => !eventInteraction && setEditEvent(ev)}
                            onMouseDown={isContinuation ? undefined : (e) => handleEventDragStart(e, ev)}
                            onMouseUp={isContinuation ? undefined : handleEventMouseUp}
                            onMouseLeave={isContinuation ? undefined : () => {
                              if (eventLongPressTimer.current && !eventInteraction) {
                                clearTimeout(eventLongPressTimer.current);
                                eventLongPressTimer.current = null;
                              }
                            }}
                            className={`absolute left-1 right-1 rounded-md px-2 py-1 pointer-events-auto overflow-hidden group
                              ${isContinuation
                                ? 'border-l-4 border-dashed cursor-pointer hover:shadow-lg transition-shadow opacity-70'
                                : isActive && hasOverlap
                                  ? 'border-l-4 ring-2 ring-red-500/70 z-20 ' + (interType === 'drag' ? 'cursor-grabbing shadow-2xl' : 'cursor-ns-resize shadow-lg')
                                  : isActive && interType === 'drag'
                                    ? 'border-l-4 cursor-grabbing shadow-2xl ring-2 ring-white/30 z-20'
                                    : isActive
                                      ? 'border-l-4 cursor-ns-resize shadow-lg z-20'
                                      : 'border-l-4 cursor-pointer hover:shadow-lg transition-shadow'
                              }`}
                            style={{
                              top: `${displayTop}px`,
                              height: `${displayHeight}px`,
                              backgroundColor: hasOverlap ? 'rgba(239,68,68,0.25)' : `${ev.color}25`,
                              borderLeftColor: hasOverlap ? '#ef4444' : ev.color,
                            }}
                          >
                            {/* Top resize handle (not for continuations) */}
                            {!isContinuation && (
                              <div
                                data-resize-handle="true"
                                className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/20 transition-colors z-10"
                                onMouseDown={(e) => handleEventResizeStart(e, ev, 'top')}
                              />
                            )}

                            <div className="flex flex-col h-full overflow-hidden">
                              <span className="text-xs font-medium text-foreground truncate flex items-center gap-1">
                                {ev.recurrence_group_id && <RotateCw className="h-2.5 w-2.5 text-purple-400 flex-shrink-0" />}
                                {isContinuation && <span className="text-bridge-accent">↳</span>}
                                {ev.title}
                              </span>
                              {displayHeight > 30 && (
                                <span className="text-[10px] text-slate-400">
                                  {isContinuation
                                    ? <>00:00 - {displayEndTime} <span className="text-bridge-accent ml-0.5">({t('personal.schedule.prevDay')})</span></>
                                    : <>{displayStartTime}{displayEndTime && ` - ${displayEndTime}`}{ev.start_time && ev.end_time && ev.end_time < ev.start_time && <span className="text-bridge-accent ml-0.5">({t('personal.schedule.nextDay')})</span>}</>
                                  }
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

                            {/* Bottom resize handle (not for continuations) */}
                            {!isContinuation && (
                              <div
                                data-resize-handle="true"
                                className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-white/20 transition-colors z-10"
                                onMouseDown={(e) => handleEventResizeStart(e, ev, 'bottom')}
                              />
                            )}
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

        {/* ======== Bottom guide + mobile toolbar ======== */}
        <div className="px-3 md:px-6 py-2 border-t border-white/[0.06] flex-shrink-0 flex items-center justify-between">
          <p className="hidden md:block text-xs text-slate-500">
            {t('personal.schedule.dragToCreateFull')}
          </p>
          <p className="md:hidden text-[10px] text-slate-500 flex-1">
            {t('personal.schedule.tapToCreate')}
          </p>
          <div className="md:hidden flex items-center gap-2">
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-3 rounded-xl bg-bridge-accent text-white shadow-lg shadow-bridge-accent/30 hover:bg-bridge-accent/90 active:scale-95 transition-all"
            >
              <CalendarDays size={18} />
            </button>
            <button
              onClick={() => {
                setCreateDate(todayStr);
                setCreateStartTime('');
                setCreateEndTime('');
                setCreateInitialRecurrence('');
                setIsCreateOpen(true);
              }}
              className="p-3 rounded-xl bg-bridge-accent text-white shadow-lg shadow-bridge-accent/30 hover:bg-bridge-accent/90 active:scale-95 transition-all"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ======== Modals ======== */}
      <CreateEventModal
        open={isCreateOpen}
        date={createDate}
        initialStartTime={createStartTime}
        initialEndTime={createEndTime}
        initialRecurrenceRule={createInitialRecurrence}
        existingEvents={events}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateEvent}
        onUpdate={handleUpdateEvent}
      />

      <ScheduleSettingsModal
        open={showSettings}
        settings={settings}
        onSave={(s) => {
          setSettings(s);
          saveSettings(s);
          setShowSettings(false);
        }}
        onClose={() => setShowSettings(false)}
      />

      <EventDetailModal
        open={!!editEvent}
        event={editEvent}
        existingEvents={events}
        onClose={() => setEditEvent(null)}
        onDelete={handleDeleteEvent}
        onUpdate={handleUpdateEvent}
      />

      <CreateHabitModal
        open={isCreateHabitOpen}
        onClose={() => setIsCreateHabitOpen(false)}
        onCreate={handleCreateHabit}
      />

      {/* Habit Check-in Confirm Modal */}
      <CheckInConfirmModal
        open={!!habitConfirm}
        habitName={habitConfirm?.title || ''}
        habitIcon={habitConfirm?.icon}
        isUndo={habitConfirm?.isUndo}
        onConfirm={() => {
          if (habitConfirm) {
            handleHabitCheckIn(habitConfirm.habitId, habitConfirm.date);
            setHabitConfirm(null);
          }
        }}
        onCancel={() => setHabitConfirm(null)}
      />

      {/* FAB – Desktop only */}
      <button
        onClick={() => {
          setCreateDate(todayStr);
          setCreateStartTime('');
          setCreateEndTime('');
          setCreateInitialRecurrence('');
          setIsCreateOpen(true);
        }}
        className="hidden md:flex fixed fab-bottom-safe right-6 w-14 h-14 rounded-full bg-bridge-accent text-white shadow-lg shadow-bridge-accent/30 items-center justify-center hover:bg-bridge-accent/90 hover:scale-105 active:scale-95 transition-all z-50"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

/* ================================================================
   Create Event Modal
   ================================================================ */
function getOverlappingEvents(
  events: PersonalEvent[],
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string,
): PersonalEvent[] {
  if (!startTime || !endTime) return [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const newStart = sh * 60 + sm;
  const newEnd = eh * 60 + em <= newStart ? (eh * 60 + em) + 24 * 60 : eh * 60 + em;

  return events.filter((ev) => {
    if (ev.id === excludeId) return false;
    if (ev.event_date !== date) return false;
    if (!ev.start_time || !ev.end_time) return false;
    const [esh, esm] = ev.start_time.split(':').map(Number);
    const [eeh, eem] = ev.end_time.split(':').map(Number);
    const evStart = esh * 60 + esm;
    const evEnd = eeh * 60 + eem <= evStart ? (eeh * 60 + eem) + 24 * 60 : eeh * 60 + eem;
    return newStart < evEnd && newEnd > evStart;
  });
}

function CreateEventModal({
  open,
  date,
  initialStartTime,
  initialEndTime,
  initialRecurrenceRule,
  existingEvents,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  date: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialRecurrenceRule?: string;
  existingEvents: PersonalEvent[];
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
  onUpdate?: (eventId: string, data: {
    title?: string;
    description?: string;
    event_date?: string;
    start_time?: string | null;
    end_time?: string | null;
    color?: string;
    all_day?: boolean;
  }) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState(initialStartTime || '');
  const [endTime, setEndTime] = useState(initialEndTime || '');
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [recurrenceRule, setRecurrenceRule] = useState(initialRecurrenceRule || '');

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setStartTime(initialStartTime || '');
      setEndTime(initialEndTime || '');
      setColor(EVENT_COLORS[0]);
      setRecurrenceRule(initialRecurrenceRule || '');
      setRecurrenceEndDate('');
      setRecurrenceDaysOfWeek([]);
      setMode('new');
      setSelectedTask(null);
      setSelectedHabit(null);
      setSelectedEvent(null);
      setTaskSearch('');
    }
  }, [open, initialStartTime, initialEndTime, initialRecurrenceRule]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>([]);

  // Mode & selection state
  const [mode, setMode] = useState<'new' | 'task'>('new');
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [habits, setHabits] = useState<PersonalHabit[]>([]);
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
  const [selectedHabit, setSelectedHabit] = useState<PersonalHabit | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PersonalEvent | null>(null);

  // Fetch tasks, habits & events when switching to task mode
  useEffect(() => {
    if (mode === 'task' && tasks.length === 0 && habits.length === 0 && events.length === 0 && !isLoadingItems) {
      setIsLoadingItems(true);
      Promise.all([
        personalTaskService.getTasks()
          .then((all: PersonalTask[]) => all.filter(t => t.status !== 'DONE' && t.status !== 'ARCHIVED'))
          .catch(() => [] as PersonalTask[]),
        personalHabitAPI.getAll()
          .then((all: PersonalHabit[]) => all.filter(h => h.is_active))
          .catch(() => [] as PersonalHabit[]),
        personalEventService.getByDate(date)
          .catch(() => [] as PersonalEvent[]),
      ]).then(([fetchedTasks, fetchedHabits, fetchedEvents]) => {
        setTasks(fetchedTasks);
        setHabits(fetchedHabits);
        setEvents(fetchedEvents);
      }).finally(() => setIsLoadingItems(false));
    }
  }, [mode]);

  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return tasks;
    const q = taskSearch.toLowerCase();
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.category && t.category.toLowerCase().includes(q)),
    );
  }, [tasks, taskSearch]);

  const filteredHabits = useMemo(() => {
    if (!taskSearch.trim()) return habits;
    const q = taskSearch.toLowerCase();
    return habits.filter(h => h.title.toLowerCase().includes(q));
  }, [habits, taskSearch]);

  const filteredEvents = useMemo(() => {
    if (!taskSearch.trim()) return events;
    const q = taskSearch.toLowerCase();
    return events.filter(e => e.title.toLowerCase().includes(q));
  }, [events, taskSearch]);

  const handleSelectTask = (task: PersonalTask) => {
    setSelectedTask(task);
    setSelectedHabit(null);
    setTitle(task.title);
    setDescription(task.description || '');
    if (task.color && EVENT_COLORS.includes(task.color)) {
      setColor(task.color);
    }
  };

  const handleSelectHabit = (habit: PersonalHabit) => {
    setSelectedHabit(habit);
    setSelectedTask(null);
    setTitle(`${habit.icon ? habit.icon + ' ' : ''}${habit.title}`);
    setDescription('');
    const closest = EVENT_COLORS.includes(habit.color) ? habit.color : EVENT_COLORS[0];
    setColor(closest);
  };

  const handleSelectEvent = (ev: PersonalEvent) => {
    setSelectedEvent(ev);
    setSelectedTask(null);
    setSelectedHabit(null);
    setTitle(ev.title);
    setDescription(ev.description || '');
    if (ev.start_time) setStartTime(ev.start_time.slice(0, 5));
    if (ev.end_time) setEndTime(ev.end_time.slice(0, 5));
    if (ev.color && EVENT_COLORS.includes(ev.color)) setColor(ev.color);
  };

  const handleClearSelection = () => {
    setSelectedTask(null);
    setSelectedHabit(null);
    setSelectedEvent(null);
    setTitle('');
    setDescription('');
    setColor(EVENT_COLORS[0]);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (recurrenceRule && !recurrenceEndDate) return;
    if (recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length === 0) return;
    // If an existing event is selected, update it instead of creating a duplicate
    if (selectedEvent && onUpdate) {
      onUpdate(selectedEvent.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        start_time: startTime || null,
        end_time: endTime || null,
        color,
        all_day: false,
      });
      return;
    }
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

  const overlapping = useMemo(
    () => getOverlappingEvents(existingEvents, date, startTime, endTime),
    [existingEvents, date, startTime, endTime],
  );

  const showForm = mode === 'new' || selectedTask !== null || selectedHabit !== null || selectedEvent !== null;

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md p-0 overflow-hidden border-foreground/[0.12]">
      <div>
        {/* Top accent line */}
        <div className="h-[2px]" style={{ background: `linear-gradient(to right, ${color}88, ${color}44, transparent)` }} />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-3 h-3 rounded-full shrink-0 border border-white/10" style={{ backgroundColor: color }} />
          <span className="text-sm font-bold text-foreground">{t('personal.schedule.newEvent')}</span>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4 pt-4">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-foreground/5 rounded-xl border border-foreground/[0.06]">
            <button
              onClick={() => { setMode('new'); setSelectedTask(null); setSelectedHabit(null); setSelectedEvent(null); setTitle(''); setDescription(''); setColor(EVENT_COLORS[0]); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === 'new'
                  ? 'bg-bridge-accent text-white shadow-sm'
                  : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <Plus size={13} />
              {t('personal.schedule.newEvent')}
            </button>
            <button
              onClick={() => setMode('task')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === 'task'
                  ? 'bg-bridge-accent text-white shadow-sm'
                  : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <ListTodo size={13} />
              {t('personal.schedule.fromTask')}
            </button>
          </div>

          {/* To Do selection list (tasks + habits) */}
          {mode === 'task' && !selectedTask && !selectedHabit && !selectedEvent && (
            <div className="space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder={t('personal.schedule.searchTasks')}
                  className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl py-2 pl-9 pr-4 text-foreground text-sm placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/30 focus:border-bridge-accent/40 transition-all"
                  autoFocus
                />
              </div>

              <div className="max-h-[32vh] overflow-y-auto space-y-1.5 -mx-1 px-1 custom-scrollbar">
                {isLoadingItems ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                  </div>
                ) : filteredTasks.length === 0 && filteredHabits.length === 0 && filteredEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ListTodo size={24} className="text-slate-600 mb-2" />
                    <p className="text-sm text-slate-500">
                      {tasks.length === 0 && habits.length === 0 && events.length === 0 ? t('personal.schedule.noActiveTasks') : t('personal.schedule.noMatchingTasks')}
                    </p>
                    {tasks.length === 0 && habits.length === 0 && events.length === 0 && (
                      <button
                        onClick={() => setMode('new')}
                        className="mt-2 text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors"
                      >
                        {t('personal.schedule.createNewInstead')}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Tasks section */}
                    {filteredTasks.length > 0 && (
                      <>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1 pt-1">
                          {t('personal.schedule.tasksSection')}
                        </div>
                        {filteredTasks.map((task) => (
                          <button
                            key={task.id}
                            onClick={() => handleSelectTask(task)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-foreground/[0.06] hover:border-foreground/10 transition-all text-left group"
                          >
                            {task.priority !== 'NONE' && (
                              <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-foreground truncate block">{task.title}</span>
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
                        ))}
                      </>
                    )}

                    {/* Habits section */}
                    {filteredHabits.length > 0 && (
                      <>
                        <div className={`text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1 ${filteredTasks.length > 0 ? 'pt-3' : 'pt-1'}`}>
                          {t('personal.schedule.habitsSection')}
                        </div>
                        {filteredHabits.map((habit) => (
                          <button
                            key={habit.id}
                            onClick={() => handleSelectHabit(habit)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-foreground/[0.06] hover:border-foreground/10 transition-all text-left group"
                          >
                            <span className="text-sm shrink-0">{habit.icon || '🔄'}</span>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-foreground truncate block">{habit.title}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Flame size={10} className="text-slate-500" />
                                <span className="text-[10px] text-slate-500">{t('personal.schedule.streakDays', { count: habit.current_streak })}</span>
                              </div>
                            </div>
                            <div
                              className="w-3 h-3 rounded-full shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                              style={{ backgroundColor: habit.color }}
                            />
                          </button>
                        ))}
                      </>
                    )}

                    {/* Calendar events section */}
                    {filteredEvents.length > 0 && (
                      <>
                        <div className={`text-[10px] font-bold uppercase tracking-widest text-slate-500 px-1 ${filteredTasks.length > 0 || filteredHabits.length > 0 ? 'pt-3' : 'pt-1'}`}>
                          {t('personal.schedule.eventsSection')}
                        </div>
                        {filteredEvents.map((ev) => (
                          <button
                            key={ev.id}
                            onClick={() => handleSelectEvent(ev)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-foreground/[0.06] hover:border-foreground/10 transition-all text-left group"
                          >
                            <CalendarDays size={14} className="text-slate-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-foreground truncate block">{ev.title}</span>
                              {(ev.start_time || ev.end_time) && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Clock size={10} className="text-slate-500" />
                                  <span className="text-[10px] text-slate-500">
                                    {ev.start_time?.slice(0, 5)}{ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ''}{ev.start_time && ev.end_time && ev.end_time < ev.start_time && <span className="text-bridge-accent ml-0.5">({t('personal.schedule.nextDay')})</span>}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div
                              className="w-3 h-3 rounded-full shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                              style={{ backgroundColor: ev.color }}
                            />
                          </button>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Event form (new mode OR task selected) */}
          {showForm && (
            <div className="space-y-3">
              {/* Selected item indicator */}
              {(selectedTask || selectedHabit || selectedEvent) && (
                <div className="flex items-center gap-2 px-3 py-2 bg-bridge-accent/10 border border-bridge-accent/20 rounded-xl">
                  <CheckCircle2 size={14} className="text-bridge-accent shrink-0" />
                  <span className="text-xs text-bridge-accent flex-1 truncate">
                    {t('personal.schedule.scheduling', { title: selectedTask?.title || selectedHabit?.title || selectedEvent?.title || '' })}
                  </span>
                  <button
                    onClick={handleClearSelection}
                    className="p-0.5 text-bridge-accent/60 hover:text-bridge-accent transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Date chip + Color picker */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-foreground/[0.04] border border-foreground/10">
                  <CalendarDays size={13} className="text-slate-400" />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(date, "PPP '('EEE')'")}
                  </span>
                </div>
                <ColorDropdown color={color} onChange={setColor} />
              </div>

              {/* Title */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder={t('personal.schedule.eventTitlePlaceholder')}
                className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl py-2.5 px-4 text-foreground text-sm placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/30 focus:border-bridge-accent/40 transition-all"
                autoFocus={mode === 'new'}
              />

              {/* Time - compact row */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
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
                    className="py-1.5 px-3 text-xs border-foreground/10"
                  />
                </div>
                <span className="text-slate-500 text-xs shrink-0">~</span>
                <div className="flex-1">
                  <TimePicker
                    value={endTime}
                    onChange={setEndTime}
                    className="py-1.5 px-3 text-xs border-foreground/10"
                  />
                </div>
                {startTime && endTime && endTime < startTime && (
                  <span className="text-[10px] font-bold text-bridge-accent shrink-0">({t('personal.schedule.nextDay')})</span>
                )}
              </div>

              {/* Description */}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('personal.schedule.optionalDesc')}
                rows={2}
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-muted-foreground placeholder-slate-600 outline-none resize-none focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
              />

              {/* Overlap warning */}
              {overlapping.length > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/10 rounded-lg">
                  <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-amber-400">
                      {t('personal.schedule.overlapWarning', { count: overlapping.length })}
                    </p>
                    <div className="mt-0.5 space-y-0.5">
                      {overlapping.slice(0, 3).map((ev) => (
                        <p key={ev.id} className="text-[10px] text-amber-400/70 truncate">
                          {ev.start_time?.slice(0, 5)}–{ev.end_time?.slice(0, 5)} {ev.title}
                        </p>
                      ))}
                      {overlapping.length > 3 && (
                        <p className="text-[10px] text-amber-400/50">
                          +{overlapping.length - 3}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Recurrence */}
              <div className="flex-1 min-w-0">
                <select
                  value={recurrenceRule}
                  onChange={(e) => {
                    setRecurrenceRule(e.target.value);
                    if (!e.target.value) {
                      setRecurrenceDaysOfWeek([]);
                      setRecurrenceEndDate('');
                    }
                  }}
                  className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl py-2 px-3 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-bridge-accent/30 transition-all"
                >
                  <option value="" className="bg-bridge-obsidian">{t('personal.schedule.noRepeat')}</option>
                  <option value="DAILY" className="bg-bridge-obsidian">{t('personal.schedule.everyDay')}</option>
                  <option value="WEEKLY" className="bg-bridge-obsidian">{t('personal.schedule.everyWeek')}</option>
                </select>
              </div>

              {recurrenceRule === 'WEEKLY' && (
                <div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4, 5, 6].map((dayValue) => {
                      const labels = [
                        t('personal.schedule.daySun'),
                        t('personal.schedule.dayMon'),
                        t('personal.schedule.dayTue'),
                        t('personal.schedule.dayWed'),
                        t('personal.schedule.dayThu'),
                        t('personal.schedule.dayFri'),
                        t('personal.schedule.daySat'),
                      ];
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
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                            isSelected
                              ? 'bg-bridge-accent text-white'
                              : 'bg-foreground/5 text-slate-400 hover:bg-foreground/10'
                          }`}
                        >
                          {labels[dayValue]}
                        </button>
                      );
                    })}
                  </div>
                  {recurrenceDaysOfWeek.length === 0 && (
                    <p className="mt-1 text-[10px] text-amber-400">{t('personal.schedule.selectDay')}</p>
                  )}
                </div>
              )}

              {recurrenceRule && (
                <div>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    min={date}
                    className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-xl py-2 px-3 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-bridge-accent/30 transition-all [color-scheme:dark]"
                  />
                  {!recurrenceEndDate && (
                    <p className="mt-1 text-[10px] text-amber-400">{t('personal.schedule.endDateRequired')}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-foreground/[0.08]">
            <span className="text-[10px] text-slate-600">
              Esc {t('common.close', '닫기')}
            </span>
            {showForm && (
              <button
                onClick={handleSubmit}
                disabled={!title.trim() || (!!recurrenceRule && !recurrenceEndDate) || (recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length === 0)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {t('personal.schedule.create')}
              </button>
            )}
          </div>
        </div>
      </div>
    </MotionModal>
  );
}

/* ================================================================
   Event Detail / Edit Modal
   ================================================================ */
export function EventDetailModal({
  open,
  event,
  existingEvents,
  onClose,
  onDelete,
  onUpdate,
}: {
  open: boolean;
  event: PersonalEvent | null;
  existingEvents: PersonalEvent[];
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
      recurrence_rule?: string;
      recurrence_end_date?: string;
      recurrence_days_of_week?: number[];
      scope?: string;
    },
  ) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description || '');
  const [startTime, setStartTime] = useState(event?.start_time?.slice(0, 5) || '');
  const [endTime, setEndTime] = useState(event?.end_time?.slice(0, 5) || '');
  const [color, setColor] = useState(event?.color ?? EVENT_COLORS[0]);
  const [showDeleteScope, setShowDeleteScope] = useState(false);

  // Recurrence editing state
  const isRecurring = !!event?.recurrence_group_id;
  const [recurrenceRule, setRecurrenceRule] = useState(event?.recurrence_rule || '');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(event?.recurrence_end_date || '');
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>(
    event?.recurrence_days_of_week ? event.recurrence_days_of_week.split(',').map(Number) : [],
  );
  const [showUpdateScope, setShowUpdateScope] = useState(false);

  // Reset state when event changes
  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setStartTime(event.start_time?.slice(0, 5) || '');
      setEndTime(event.end_time?.slice(0, 5) || '');
      setColor(event.color);
      setRecurrenceRule(event.recurrence_rule || '');
      setRecurrenceEndDate(event.recurrence_end_date || '');
      setRecurrenceDaysOfWeek(event.recurrence_days_of_week ? event.recurrence_days_of_week.split(',').map(Number) : []);
      setShowDeleteScope(false);
      setShowUpdateScope(false);
    }
  }, [event]);

  const recurrenceChanged = isRecurring && event && (
    recurrenceRule !== (event.recurrence_rule || '') ||
    recurrenceEndDate !== (event.recurrence_end_date || '') ||
    recurrenceDaysOfWeek.join(',') !== (event.recurrence_days_of_week || '')
  );

  const overlapping = useMemo(
    () => event ? getOverlappingEvents(existingEvents, event.event_date, startTime, endTime, event.id) : [],
    [existingEvents, event, startTime, endTime],
  );

  const recurrenceValid = !recurrenceRule || (
    !!recurrenceEndDate &&
    (recurrenceRule !== 'WEEKLY' || recurrenceDaysOfWeek.length > 0)
  );

  if (!event) return null;

  const hasChanged =
    title !== event.title ||
    description !== (event.description || '') ||
    startTime !== (event.start_time?.slice(0, 5) || '') ||
    endTime !== (event.end_time?.slice(0, 5) || '') ||
    color !== event.color ||
    !!recurrenceChanged;

  const handleSave = () => {
    if (!title.trim()) return;
    if (!recurrenceValid) return;

    if (recurrenceChanged) {
      setShowUpdateScope(true);
      return;
    }

    onUpdate(event.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      event_date: event.event_date,
      start_time: startTime || null,
      end_time: endTime || null,
      color,
    });
    onClose();
  };

  const handleSaveWithScope = (scope: string) => {
    onUpdate(event.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      event_date: event.event_date,
      start_time: startTime || null,
      end_time: endTime || null,
      color,
      recurrence_rule: recurrenceRule || '',
      recurrence_end_date: recurrenceEndDate || undefined,
      recurrence_days_of_week: recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length > 0
        ? recurrenceDaysOfWeek : undefined,
      scope,
    });
    onClose();
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md p-0 overflow-hidden border-foreground/[0.12]">
      <div>
        {/* Top accent line */}
        <div className="h-[2px]" style={{ background: `linear-gradient(to right, ${color}88, ${color}44, transparent)` }} />

        {/* Header: color dot + title + delete/close */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-3 h-3 rounded-full shrink-0 border border-white/10" style={{ backgroundColor: color }} />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="flex-1 min-w-0 bg-transparent text-sm font-bold text-foreground outline-none placeholder-slate-600"
            placeholder={t('personal.schedule.eventTitle')}
            autoFocus
          />
          <button
            onClick={() => {
              if (event.recurrence_group_id) {
                setShowDeleteScope(true);
              } else {
                onDelete(event.id);
              }
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-foreground/5 transition-colors shrink-0"
            title={t('personal.schedule.deleteEvent')}
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4 pt-4">
          {showDeleteScope && (
            <div className="p-3 bg-foreground/5 rounded-xl border border-foreground/10 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">{t('personal.schedule.recurringEvent')}</p>
              <button
                onClick={() => onDelete(event.id, 'THIS_ONLY')}
                className="w-full px-3 py-2 text-xs font-semibold bg-foreground/5 border border-foreground/10 rounded-lg text-foreground hover:bg-foreground/10 transition-all"
              >
                {t('personal.schedule.deleteThisOnly')}
              </button>
              <button
                onClick={() => onDelete(event.id, 'THIS_AND_FUTURE')}
                className="w-full px-3 py-2 text-xs font-semibold bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/20 transition-all"
              >
                {t('personal.schedule.deleteThisAndFuture')}
              </button>
              <button
                onClick={() => setShowDeleteScope(false)}
                className="w-full px-3 py-1.5 text-[10px] text-slate-500 hover:text-muted-foreground transition-colors"
              >
                {t('personal.schedule.cancel')}
              </button>
            </div>
          )}

          {/* Inline properties: date + color picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-foreground/[0.04] border border-foreground/10">
              <CalendarDays size={13} className="text-slate-400" />
              <span className="text-xs text-muted-foreground">
                {formatDate(event.event_date, "PPP '('EEE')'")}
              </span>
            </div>
            <ColorDropdown color={color} onChange={setColor} />
          </div>

          {/* Time - compact row */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
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
                className="py-1.5 px-3 text-xs border-foreground/10"
              />
            </div>
            <span className="text-slate-500 text-xs shrink-0">~</span>
            <div className="flex-1">
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                className="py-1.5 px-3 text-xs border-foreground/10"
              />
            </div>
            {startTime && endTime && endTime < startTime && (
              <span className="text-[10px] font-bold text-bridge-accent shrink-0">({t('personal.schedule.nextDay')})</span>
            )}
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('personal.schedule.optionalDesc')}
            rows={2}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-muted-foreground placeholder-slate-600 outline-none resize-none focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
          />

          {/* Recurrence settings (compact) */}
          {isRecurring && (
            <div className="space-y-2.5 p-3 rounded-xl bg-white/[0.02] border border-foreground/10">
              <select
                value={recurrenceRule}
                onChange={(e) => {
                  setRecurrenceRule(e.target.value);
                  if (!e.target.value) {
                    setRecurrenceDaysOfWeek([]);
                    setRecurrenceEndDate('');
                  }
                }}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-1.5 px-3 text-foreground text-xs focus:outline-none focus:border-bridge-accent/30 transition-all"
              >
                <option value="" className="bg-bridge-obsidian">{t('personal.schedule.noRepeat')}</option>
                <option value="DAILY" className="bg-bridge-obsidian">{t('personal.schedule.everyDay')}</option>
                <option value="WEEKLY" className="bg-bridge-obsidian">{t('personal.schedule.everyWeek')}</option>
              </select>

              {recurrenceRule === 'WEEKLY' && (
                <div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4, 5, 6].map((dayValue) => {
                      const labels = [
                        t('personal.schedule.daySun'),
                        t('personal.schedule.dayMon'),
                        t('personal.schedule.dayTue'),
                        t('personal.schedule.dayWed'),
                        t('personal.schedule.dayThu'),
                        t('personal.schedule.dayFri'),
                        t('personal.schedule.daySat'),
                      ];
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
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                            isSelected
                              ? 'bg-bridge-accent text-white'
                              : 'bg-foreground/5 text-slate-400 hover:bg-foreground/10'
                          }`}
                        >
                          {labels[dayValue]}
                        </button>
                      );
                    })}
                  </div>
                  {recurrenceDaysOfWeek.length === 0 && (
                    <p className="mt-1 text-[10px] text-amber-400">{t('personal.schedule.selectDay')}</p>
                  )}
                </div>
              )}

              {recurrenceRule && (
                <div>
                  <input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={(e) => setRecurrenceEndDate(e.target.value)}
                    min={event.event_date}
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-1.5 px-3 text-foreground text-xs focus:outline-none focus:border-bridge-accent/30 transition-all [color-scheme:dark]"
                  />
                  {!recurrenceEndDate && (
                    <p className="mt-1 text-[10px] text-amber-400">{t('personal.schedule.endDateRequired')}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Overlap warning */}
          {overlapping.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/10 rounded-lg">
              <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-amber-400">
                  {t('personal.schedule.overlapWarning', { count: overlapping.length })}
                </p>
                <div className="mt-0.5 space-y-0.5">
                  {overlapping.slice(0, 3).map((ev) => (
                    <p key={ev.id} className="text-[10px] text-amber-400/70 truncate">
                      {ev.start_time?.slice(0, 5)}–{ev.end_time?.slice(0, 5)} {ev.title}
                    </p>
                  ))}
                  {overlapping.length > 3 && (
                    <p className="text-[10px] text-amber-400/50">
                      +{overlapping.length - 3}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Update scope dialog */}
          {showUpdateScope && (
            <div className="p-3 bg-foreground/5 rounded-xl border border-foreground/10 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">{t('personal.schedule.recurringUpdateScope')}</p>
              <button
                onClick={() => handleSaveWithScope('THIS_AND_FUTURE')}
                className="w-full px-3 py-2 text-xs font-semibold bg-bridge-accent/10 border border-bridge-accent/20 rounded-lg text-bridge-accent hover:bg-bridge-accent/20 transition-all"
              >
                {t('personal.schedule.updateThisAndFuture')}
              </button>
              <button
                onClick={() => setShowUpdateScope(false)}
                className="w-full px-3 py-1.5 text-[10px] text-slate-500 hover:text-muted-foreground transition-colors"
              >
                {t('personal.schedule.cancel')}
              </button>
            </div>
          )}

          {/* Footer */}
          {!showUpdateScope && (
            <div className="flex items-center justify-between pt-3 border-t border-foreground/[0.08]">
              <span className="text-[10px] text-slate-600">
                Esc {t('common.close', '닫기')}
              </span>
              <button
                onClick={handleSave}
                disabled={!title.trim() || !recurrenceValid || !hasChanged}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {t('personal.schedule.save')}
              </button>
            </div>
          )}
        </div>
      </div>
    </MotionModal>
  );
}

/* ================================================================
   Schedule Settings Modal
   ================================================================ */
const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i); // 0~24

function ScheduleSettingsModal({
  open,
  settings,
  onSave,
  onClose,
}: {
  open: boolean;
  settings: ScheduleSettings;
  onSave: (s: ScheduleSettings) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [sHour, setSHour] = useState(settings.startHour);
  const [eHour, setEHour] = useState(settings.endHour);

  const isValid = eHour > sHour;

  const handleSave = () => {
    if (!isValid) return;
    onSave({ startHour: sHour, endHour: eHour });
  };

  const fmtHour = (h: number) => `${h.toString().padStart(2, '0')}:00`;

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-sm p-0 overflow-hidden border-foreground/[0.12]">
      <div>
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/10 flex items-center justify-center shrink-0">
            <Settings size={15} className="text-bridge-accent" />
          </div>
          <h3 className="flex-1 text-sm font-bold text-foreground">{t('personal.schedule.settingsTitle')}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <span className="text-[11px] text-slate-500 mb-1 block">{t('personal.schedule.settingsStartTime')}</span>
              <select
                value={sHour}
                onChange={(e) => setSHour(Number(e.target.value))}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-2 px-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-bridge-accent/10 focus:border-bridge-accent/30 transition-all appearance-none cursor-pointer"
              >
                {HOUR_OPTIONS.filter((h) => h < 24).map((h) => (
                  <option key={h} value={h} className="bg-bridge-obsidian text-foreground">
                    {fmtHour(h)}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-slate-500 mt-5">~</span>
            <div className="flex-1">
              <span className="text-[11px] text-slate-500 mb-1 block">{t('personal.schedule.settingsEndTime')}</span>
              <select
                value={eHour}
                onChange={(e) => setEHour(Number(e.target.value))}
                className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-2 px-3 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-bridge-accent/10 focus:border-bridge-accent/30 transition-all appearance-none cursor-pointer"
              >
                {HOUR_OPTIONS.filter((h) => h >= 1).map((h) => (
                  <option key={h} value={h} className="bg-bridge-obsidian text-foreground">
                    {fmtHour(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isValid && (
            <p className="text-xs text-rose-400">{t('personal.schedule.settingsEndAfterStart')}</p>
          )}

          <div className="bg-foreground/[0.03] rounded-lg px-3 py-2.5 border border-foreground/10">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('personal.schedule.settingsPreview')}</span>
            <p className="text-sm text-foreground mt-0.5">
              {fmtHour(sHour)} — {fmtHour(eHour)}{' '}
              <span className="text-slate-400">({eHour - sHour}h)</span>
            </p>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-foreground/[0.08]">
            <span className="text-[11px] text-slate-600 select-none">Esc 닫기</span>
            <button
              onClick={handleSave}
              disabled={!isValid}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-bridge-accent text-white text-xs font-bold rounded-lg hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {t('personal.schedule.save')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
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

const FREQUENCY_PRESET_VALUES: HabitFrequency[] = ['DAILY', 'WEEKDAY', 'CUSTOM'];

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
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    frequency_type?: HabitFrequency;
    frequency_days?: string;
    target_count?: number;
  }) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [frequencyType, setFrequencyType] = useState<HabitFrequency>('DAILY');
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [showMore, setShowMore] = useState(false);

  // Advanced fields
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(HABIT_COLORS[0]);
  const [description, setDescription] = useState('');

  const frequencyLabels: Record<HabitFrequency, string> = {
    DAILY: t('personal.habit.everyDay'),
    WEEKDAY: t('personal.habit.weekdays'),
    CUSTOM: t('personal.habit.custom'),
    WEEKEND: t('personal.habit.weekends'),
  };

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
      target_count: 1,
    });
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md p-0 overflow-hidden border-foreground/[0.12]">
      <div>
        <div className="h-[2px]" style={{ background: `linear-gradient(to right, ${color}88, ${color}44, transparent)` }} />

        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <span className="text-base shrink-0">{icon || <Flame size={16} className="text-purple-400" />}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSubmit()}
            placeholder={t('personal.habit.habitPlaceholder')}
            className="flex-1 min-w-0 bg-transparent text-sm font-bold text-foreground placeholder-slate-600 outline-none"
            autoFocus
          />
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5 space-y-3">
          {/* Frequency */}
          <div className="flex gap-1.5">
            {FREQUENCY_PRESET_VALUES.map((value) => (
              <button
                key={value}
                onClick={() => {
                  setFrequencyType(value);
                  if (value !== 'CUSTOM') setCustomDays([]);
                }}
                className="flex-1 py-1.5 text-xs font-bold rounded-lg transition-all"
                style={frequencyType === value
                  ? { backgroundColor: color, color: '#fff' }
                  : undefined}
                {...(frequencyType !== value && {
                  className: 'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all bg-foreground/5 text-slate-400 hover:bg-foreground/10 hover:text-foreground',
                })}
              >
                {frequencyLabels[value]}
              </button>
            ))}
          </div>

          {/* Custom Day Selector */}
          {frequencyType === 'CUSTOM' && (
            <div>
              <div className="flex gap-1.5">
                {DAY_CHIPS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => toggleDay(value)}
                    className="flex-1 py-2 text-xs font-bold rounded-lg transition-all"
                    style={customDays.includes(value)
                      ? { backgroundColor: color, color: '#fff' }
                      : undefined}
                    {...(!customDays.includes(value) && {
                      className: 'flex-1 py-2 text-xs font-bold rounded-lg transition-all bg-foreground/5 text-slate-400 hover:bg-foreground/10',
                    })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {customDays.length === 0 && (
                <p className="mt-1.5 text-xs text-amber-400">{t('personal.habit.selectDay')}</p>
              )}
            </div>
          )}

          {/* More Options Toggle */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-muted-foreground transition-colors"
          >
            {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showMore ? t('personal.habit.lessOptions') : t('personal.habit.moreOptions')}
          </button>

          {/* Expanded Options */}
          <AnimatePresence>
            {showMore && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 overflow-hidden"
              >
                {/* Icon Picker */}
                <div className="flex flex-wrap gap-1.5">
                  {HABIT_ICONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setIcon(icon === emoji ? '' : emoji)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-all ${
                        icon === emoji
                          ? 'ring-2 scale-110'
                          : 'bg-foreground/5 hover:bg-foreground/10 hover:scale-105'
                      }`}
                      style={icon === emoji ? { backgroundColor: `${color}33`, ringColor: color } : undefined}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Color Picker */}
                <ColorDropdown color={color} onChange={setColor} colors={HABIT_COLORS} />

                {/* Description */}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('personal.habit.descPlaceholder')}
                  rows={2}
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg p-3 text-sm text-muted-foreground placeholder-slate-600 outline-none resize-none focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-foreground/[0.08]">
            <span className="text-[11px] text-slate-600 select-none">Esc 닫기</span>
            <button
              onClick={handleSubmit}
              disabled={!isValid}
              className="flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-bold rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: isValid ? color : 'rgba(128,128,128,0.3)' }}
            >
              <Plus size={13} />
              {t('personal.habit.addHabit')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}
