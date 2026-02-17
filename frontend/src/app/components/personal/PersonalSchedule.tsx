import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Loader2, Settings, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { personalEventService } from '../../utils/services';
import { formatDate } from '../../utils/dateUtils';
import type { PersonalEvent } from '../../types';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  format,
} from 'date-fns';

const EVENT_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

const SLOT_HEIGHT = 40;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 23;
const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const COL_MIN_W = 'min-w-[130px]';
const TIME_COL_W = 'w-16';
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

  // Edit modal
  const [editEvent, setEditEvent] = useState<PersonalEvent | null>(null);

  // Drag selection
  const [dragState, setDragState] = useState<{
    dateStr: string;
    startSlotIndex: number;
    endSlotIndex: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const timeSlots = useMemo(() => generateTimeSlots(startHour, endHour), [startHour, endHour]);

  const weekDays = useMemo(() => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    const we = endOfWeek(currentDate, { weekStartsOn: 1 });
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

  // ---- Render ----
  return (
    <div
      className="h-full flex flex-col"
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (isDragging) {
          setIsDragging(false);
          setDragState(null);
        }
      }}
    >
      {/* ======== Navigation header ======== */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={handlePrev}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-sm md:text-lg font-bold min-w-0 sm:min-w-[260px] text-center whitespace-nowrap">
            {format(weekDays[0], 'MMM d')} - {format(weekDays[6], 'MMM d, yyyy')}
          </h2>
          <button
            onClick={handleNext}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={handleToday}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              isTodayInWeek
                ? 'bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white'
                : 'text-bridge-secondary border border-bridge-secondary/30 hover:bg-bridge-secondary/10'
            }`}
          >
            Today
          </button>
          {isLoading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
            title="Schedule settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={() => {
              setCreateDate(todayStr);
              setCreateStartTime('');
              setCreateEndTime('');
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add Event</span>
          </button>
        </div>
      </div>

      {/* ======== Time-grid ======== */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[1060px]">
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
                      isToday ? 'text-bridge-secondary' : 'text-slate-500'
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
            <div className={`absolute top-0 ${TIME_COL_W === 'w-16' ? 'left-16' : 'left-16'} right-0 pointer-events-none`}>
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

                        let evHeight = SLOT_HEIGHT;
                        if (ev.end_time) {
                          const [eh, em] = ev.end_time.split(':').map(Number);
                          const endMin = eh * 60 + em;
                          evHeight = Math.max(
                            ((endMin - startMin) / 30) * SLOT_HEIGHT,
                            SLOT_HEIGHT * 0.6,
                          );
                        }

                        if (evTop < 0) return null;

                        return (
                          <div
                            key={ev.id}
                            onClick={() => setEditEvent(ev)}
                            className="absolute left-1 right-1 rounded-md border-l-4 px-2 py-1 pointer-events-auto cursor-pointer hover:shadow-lg transition-shadow overflow-hidden group"
                            style={{
                              top: `${evTop}px`,
                              height: `${evHeight}px`,
                              backgroundColor: `${ev.color}25`,
                              borderLeftColor: ev.color,
                            }}
                          >
                            <div className="flex flex-col h-full overflow-hidden">
                              <span className="text-xs font-medium text-white truncate flex items-center gap-1">
                                {ev.recurrence_group_id && <RotateCw className="h-2.5 w-2.5 text-purple-400 flex-shrink-0" />}
                                {ev.title}
                              </span>
                              {evHeight > 30 && ev.start_time && (
                                <span className="text-[10px] text-slate-400">
                                  {ev.start_time.slice(0, 5)}
                                  {ev.end_time && ` - ${ev.end_time.slice(0, 5)}`}
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
        <p className="text-xs text-slate-500">
          Drag on the grid to create a new event, or click an existing event to edit
        </p>
      </div>

      {/* ======== Modals ======== */}
      <AnimatePresence>
        {isCreateOpen && (
          <CreateEventModal
            date={createDate}
            initialStartTime={createStartTime}
            initialEndTime={createEndTime}
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
  onClose,
  onCreate,
}: {
  date: string;
  initialStartTime?: string;
  initialEndTime?: string;
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
  const [allDay, setAllDay] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>([]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (recurrenceRule && !recurrenceEndDate) return;
    if (recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length === 0) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      start_time: allDay ? undefined : startTime || undefined,
      end_time: allDay ? undefined : endTime || undefined,
      color,
      all_day: allDay,
      recurrence_rule: recurrenceRule || undefined,
      recurrence_end_date: recurrenceEndDate || undefined,
      recurrence_days_of_week: recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length > 0
        ? recurrenceDaysOfWeek : undefined,
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

          {/* All day toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-bridge-accent focus:ring-bridge-accent/50"
            />
            <span className="text-sm text-slate-300">All day</span>
          </label>

          {/* Time inputs */}
          {!allDay && (
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
          )}

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
            disabled={!title.trim() || (!!recurrenceRule && !recurrenceEndDate) || (recurrenceRule === 'WEEKLY' && recurrenceDaysOfWeek.length === 0)}
            className="flex-1 py-3 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Create
          </button>
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
  const [allDay, setAllDay] = useState(event.all_day);
  const [showDeleteScope, setShowDeleteScope] = useState(false);

  const handleSave = () => {
    if (!title.trim()) return;
    onUpdate(event.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      event_date: event.event_date,
      start_time: allDay ? null : startTime || null,
      end_time: allDay ? null : endTime || null,
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
          <h3 className="text-lg font-bold text-white">Edit Event</h3>
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

          {/* All day */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-bridge-accent focus:ring-bridge-accent/50"
            />
            <span className="text-sm text-slate-300">All day</span>
          </label>

          {/* Time */}
          {!allDay && (
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
          )}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">Schedule Settings</h3>
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
