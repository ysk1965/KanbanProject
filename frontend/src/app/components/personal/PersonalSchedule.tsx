import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { personalEventService } from '../../utils/services';
import { formatDate } from '../../utils/dateUtils';
import type { PersonalEvent } from '../../types';

const EVENT_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

function getDaysInWeek(baseDate: Date): Date[] {
  const day = baseDate.getDay();
  const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(baseDate);
  monday.setDate(diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PersonalSchedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(toDateString(new Date()));
  const [isLoading, setIsLoading] = useState(false);

  const weekDays = useMemo(() => getDaysInWeek(currentDate), [currentDate]);
  const startDate = toDateString(weekDays[0]);
  const endDate = toDateString(weekDays[6]);

  useEffect(() => {
    loadEvents();
  }, [startDate, endDate]);

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const data = await personalEventService.getWeekly(startDate, endDate);
      setEvents(data);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateWeek = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction * 7);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(toDateString(new Date()));
  };

  const handleCreateEvent = async (data: {
    title: string;
    description?: string;
    start_time?: string;
    end_time?: string;
    color: string;
    all_day: boolean;
  }) => {
    try {
      await personalEventService.create({
        ...data,
        event_date: selectedDate,
      });
      await loadEvents();
      setIsCreateOpen(false);
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await personalEventService.delete(eventId);
      setEvents(events.filter((e) => e.id !== eventId));
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const eventsByDate = useMemo(() => {
    const map: Record<string, PersonalEvent[]> = {};
    events.forEach((e) => {
      if (!map[e.event_date]) map[e.event_date] = [];
      map[e.event_date].push(e);
    });
    return map;
  }, [events]);

  const today = toDateString(new Date());

  return (
    <div className="h-full flex flex-col p-6 overflow-auto custom-scrollbar">
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateWeek(-1)}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-lg font-bold">
            {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' - '}
            {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </h2>
          <button
            onClick={() => navigateWeek(1)}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-bold text-bridge-secondary border border-bridge-secondary/30 rounded-lg hover:bg-bridge-secondary/10 transition-colors"
          >
            Today
          </button>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white text-sm font-bold rounded-xl hover:bg-bridge-accent/90 transition-colors"
        >
          <Plus size={16} /> Add Event
        </button>
      </div>

      {/* Week Grid */}
      <div className="grid grid-cols-7 gap-3 flex-1">
        {weekDays.map((day, idx) => {
          const dateStr = toDateString(day);
          const dayEvents = eventsByDate[dateStr] || [];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;

          return (
            <div
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={`flex flex-col rounded-2xl border transition-all cursor-pointer min-h-[200px] ${
                isSelected
                  ? 'border-bridge-accent/50 bg-bridge-accent/5'
                  : isToday
                  ? 'border-bridge-secondary/30 bg-bridge-secondary/5'
                  : 'border-white/5 bg-bridge-obsidian/40 hover:border-white/10'
              }`}
            >
              {/* Day Header */}
              <div className="px-3 pt-3 pb-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                  {DAY_LABELS[idx]}
                </div>
                <div className={`text-lg font-bold ${isToday ? 'text-bridge-secondary' : 'text-white'}`}>
                  {day.getDate()}
                </div>
              </div>

              {/* Events */}
              <div className="flex-1 px-2 pb-2 space-y-1.5 overflow-auto">
                {dayEvents.map((event) => (
                  <div
                    key={event.id}
                    className="group relative px-2.5 py-1.5 rounded-lg text-xs font-medium truncate"
                    style={{ backgroundColor: `${event.color}20`, borderLeft: `3px solid ${event.color}` }}
                  >
                    <div className="truncate text-white/90">{event.title}</div>
                    {event.start_time && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                        <Clock size={10} />
                        {event.start_time?.slice(0, 5)}
                        {event.end_time && ` - ${event.end_time.slice(0, 5)}`}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEvent(event.id);
                      }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Event Modal */}
      <AnimatePresence>
        {isCreateOpen && (
          <CreateEventModal
            date={selectedDate}
            onClose={() => setIsCreateOpen(false)}
            onCreate={handleCreateEvent}
          />
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  );
}

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
  const [allDay, setAllDay] = useState(false);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      start_time: allDay ? undefined : startTime || undefined,
      end_time: allDay ? undefined : endTime || undefined,
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
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              Date
            </label>
            <div className="text-sm text-white/80 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
              {formatDate(date)}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              autoFocus
            />
          </div>

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

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-bridge-accent focus:ring-bridge-accent/50"
              />
              <span className="text-sm text-slate-300">All day</span>
            </label>
          </div>

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
                    color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-bridge-obsidian scale-110' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
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
