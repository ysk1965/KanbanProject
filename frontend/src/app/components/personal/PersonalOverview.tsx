import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock, CalendarDays, CheckCircle2, BookHeart, Sparkles,
  ArrowRight, Sun, Sunset, Moon, Loader2, Flame,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { personalEventService, diaryService } from '../../utils/services';
import { personalTaskAPI, personalHabitAPI } from '../../utils/api';
import { getTodayDateString } from '../../utils/dateUtils';
import { PersonalEvent, DiaryDetail, PersonalTask, HabitTodayItem } from '../../types';

type TabType = 'overview' | 'tasks' | 'schedule' | 'calendar' | 'diary';

interface PersonalOverviewProps {
  onNavigateTab: (tab: TabType) => void;
}

// ── Shared WidgetCard shell ──────────────────────────────────────────

function WidgetCard({
  icon,
  title,
  badge,
  action,
  children,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="bg-bridge-obsidian rounded-2xl border border-white/5 p-5 flex flex-col min-h-[340px]"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {icon}
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {badge}
        </div>
        {action}
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </motion.div>
  );
}

function ViewAllButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-bridge-secondary transition-colors"
    >
      <span>{label || 'View all'}</span>
      <ArrowRight size={12} />
    </button>
  );
}

// ── 좌상단: Today's Schedule ─────────────────────────────────────────

function TodayScheduleWidget({
  todayDate,
  onViewAll,
}: {
  todayDate: string;
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const data = await personalEventService.getByDate(todayDate);
        setEvents(data);
      } catch {
        console.error('Failed to load today events');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [todayDate]);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const toMin = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const allDayEvents = events.filter(e => e.all_day);
  const timedEvents = events
    .filter(e => !e.all_day && e.start_time)
    .sort((a, b) => toMin(a.start_time!) - toMin(b.start_time!));

  const getStatus = (ev: PersonalEvent) => {
    if (ev.all_day) return 'allday';
    const start = toMin(ev.start_time!);
    const end = ev.end_time ? toMin(ev.end_time) : start + 60;
    if (currentMinutes >= start && currentMinutes < end) return 'current';
    if (currentMinutes < start) return 'upcoming';
    return 'past';
  };

  const formatTimeRange = (ev: PersonalEvent) => {
    if (!ev.start_time) return '';
    const s = ev.start_time.slice(0, 5);
    const e = ev.end_time ? ev.end_time.slice(0, 5) : '';
    return e ? `${s} - ${e}` : s;
  };

  return (
    <WidgetCard
      icon={<Clock size={16} className="text-bridge-secondary" />}
      title={t('personal.overview.todaySchedule', "Today's Schedule")}
      badge={
        events.length > 0 ? (
          <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded-full">
            {events.length}
          </span>
        ) : null
      }
      action={<ViewAllButton onClick={onViewAll} />}
      delay={0}
    >
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent/50" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <CalendarDays size={28} className="text-slate-600" />
          <p className="text-sm text-slate-500">{t('personal.overview.noEvents', 'No events today')}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 -mx-1 px-1">
          {allDayEvents.map(ev => {
            const color = ev.color || '#6366F1';
            return (
              <div key={ev.id} className="flex items-center gap-3">
                <div className="w-[46px] flex-shrink-0 text-right">
                  <span className="text-[13px] text-slate-500 font-light">All day</span>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full border-[1.5px]" style={{ borderColor: color }} />
                </div>
                <div
                  className="flex-1 rounded-xl px-4 py-3 border-l-[3px]"
                  style={{
                    borderLeftColor: color,
                    background: `linear-gradient(135deg, ${color}18 0%, ${color}0a 60%, transparent 100%)`,
                  }}
                >
                  <div className="text-sm text-white">{ev.title}</div>
                </div>
              </div>
            );
          })}
          {timedEvents.map(ev => {
            const status = getStatus(ev);
            const color = ev.color || '#6366F1';
            return (
              <div key={ev.id} className="flex items-start gap-3">
                <div className="w-[46px] flex-shrink-0 pt-3 text-right">
                  <span className="text-[13px] text-slate-500 font-light">{ev.start_time?.slice(0, 5)}</span>
                </div>
                <div className="flex-shrink-0 pt-[14px]">
                  <div className="w-2.5 h-2.5 rounded-full border-[1.5px]" style={{ borderColor: color }} />
                </div>
                <div
                  className={`flex-1 rounded-xl px-4 py-3 border-l-[3px] transition-all ${
                    status === 'current' ? 'ring-1 ring-white/10' : ''
                  }`}
                  style={{
                    borderLeftColor: color,
                    background: `linear-gradient(135deg, ${color}18 0%, ${color}0a 60%, transparent 100%)`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium" style={{ color }}>
                      {formatTimeRange(ev)}
                    </span>
                    {status === 'current' && (
                      <span className="text-[9px] font-bold text-bridge-accent bg-bridge-accent/15 px-1.5 py-0.5 rounded-full animate-pulse">
                        NOW
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-white mt-1">{ev.title}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

// ── 우상단: Upcoming Deadlines (PersonalTask 기반) ───────────────────

function UpcomingDeadlinesWidget({
  todayDate,
  onViewAll,
}: {
  todayDate: string;
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const today = new Date(todayDate + 'T00:00:00');

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const data = await personalTaskAPI.getAll();
        const filtered = data
          .filter(t => t.status !== 'DONE' && t.status !== 'ARCHIVED' && t.due_date)
          .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
        setTasks(filtered);
      } catch {
        console.error('Failed to load tasks');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [todayDate]);

  const getDday = (dueDate: string) => {
    const due = new Date(dueDate + 'T00:00:00');
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const displayTasks = tasks.slice(0, 8);
  const remaining = tasks.length - 8;

  const PRIORITY_DOT: Record<string, string> = {
    URGENT: '#EF4444',
    HIGH: '#F97316',
    MEDIUM: '#F59E0B',
    LOW: '#3B82F6',
    NONE: '#6366F1',
  };

  return (
    <WidgetCard
      icon={<CalendarDays size={16} className="text-bridge-accent" />}
      title={t('personal.overview.upcomingDeadlines', 'Upcoming Deadlines')}
      badge={
        tasks.length > 0 ? (
          <span className="text-[10px] font-bold text-bridge-accent bg-bridge-accent/10 px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        ) : null
      }
      action={<ViewAllButton onClick={onViewAll} />}
      delay={0.05}
    >
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent/50" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <CalendarDays size={28} className="text-slate-600" />
          <p className="text-sm text-slate-500">{t('personal.overview.noDeadlines', 'No upcoming deadlines')}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 -mx-1 px-1">
          {displayTasks.map(task => {
            const dday = getDday(task.due_date!);
            const isOverdue = dday < 0;
            return (
              <button
                key={task.id}
                onClick={onViewAll}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-1 h-6 rounded-full" style={{ backgroundColor: PRIORITY_DOT[task.priority] || '#6366F1' }} />
                <div className="w-[60px] flex-shrink-0">
                  <span className="text-[11px] text-slate-400">{formatDueDate(task.due_date!)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-300 truncate">{task.title}</div>
                  {task.category && (
                    <div className="text-[10px] text-slate-500">{task.category}</div>
                  )}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  isOverdue
                    ? 'text-red-400 bg-red-400/10'
                    : dday === 0
                    ? 'text-bridge-secondary bg-bridge-secondary/10'
                    : dday <= 3
                    ? 'text-amber-400 bg-amber-400/10'
                    : dday <= 7
                    ? 'text-blue-400 bg-blue-400/10'
                    : 'text-slate-400 bg-white/5'
                }`}>
                  {isOverdue
                    ? `D+${Math.abs(dday)}`
                    : dday === 0
                    ? t('personal.overview.today', 'Today')
                    : `D-${dday}`}
                </span>
              </button>
            );
          })}
          {remaining > 0 && (
            <button onClick={onViewAll} className="w-full text-center py-1.5 text-[11px] text-slate-500 hover:text-bridge-secondary transition-colors">
              +{remaining} more
            </button>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// ── 좌하단: Habits Today (DailyChecklist 대체) ──────────────────────

function HabitsTodayWidget({
  onViewAll,
}: {
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  const [habits, setHabits] = useState<HabitTodayItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const data = await personalHabitAPI.getToday();
        setHabits(data);
      } catch {
        console.error('Failed to load habits');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const completedCount = habits.filter(h => h.is_completed).length;
  const totalCount = habits.length;
  const rate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleCheckIn = async (habitId: string) => {
    try {
      const updated = await personalHabitAPI.checkIn(habitId);
      setHabits(prev => prev.map(h => h.habit_id === habitId ? updated : h));
    } catch {
      console.error('Failed to check in');
    }
  };

  return (
    <WidgetCard
      icon={<Flame size={16} className="text-purple-400" />}
      title={t('personal.overview.habitsToday', 'Habits Today')}
      badge={
        totalCount > 0 ? (
          <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full">
            {completedCount}/{totalCount}
          </span>
        ) : null
      }
      action={<ViewAllButton onClick={onViewAll} />}
      delay={0.1}
    >
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent/50" />
        </div>
      ) : habits.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <Flame size={28} className="text-slate-600" />
          <p className="text-sm text-slate-500">{t('personal.overview.noHabits', 'No habits set up yet')}</p>
          <p className="text-[11px] text-slate-600">{t('personal.overview.addHabitsHint', 'Set up daily habits in the Schedule tab')}</p>
        </div>
      ) : (
        <div className="flex flex-col flex-1">
          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="mb-3">
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${rate}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-purple-500 to-bridge-secondary rounded-full"
                />
              </div>
            </div>
          )}

          {/* Habit items */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 -mx-1 px-1">
            {habits.map(habit => (
              <button
                key={habit.habit_id}
                onClick={() => handleCheckIn(habit.habit_id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors"
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  habit.is_completed
                    ? 'bg-bridge-secondary border-bridge-secondary'
                    : 'border-white/20 hover:border-bridge-secondary/50'
                }`}>
                  {habit.is_completed && <CheckCircle2 size={10} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className={`text-xs truncate ${
                    habit.is_completed ? 'line-through text-slate-500' : 'text-slate-300'
                  }`}>
                    {habit.icon && <span className="mr-1">{habit.icon}</span>}
                    {habit.title}
                  </div>
                  {habit.target_count > 1 && (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {habit.completed_count}/{habit.target_count}{habit.unit ? ` ${habit.unit}` : ''}
                    </div>
                  )}
                </div>
                {habit.current_streak > 0 && (
                  <div className="flex items-center gap-0.5 text-[10px] text-orange-400 font-bold flex-shrink-0">
                    <Flame size={10} />
                    {habit.current_streak}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

// ── 우하단: AI Diary ─────────────────────────────────────────────────

const MOODS: Record<string, string> = {
  happy: '😊',
  calm: '😌',
  thoughtful: '🤔',
  tired: '😔',
  sad: '😢',
  frustrated: '😠',
  excited: '🤩',
  bored: '🥱',
};

function DiaryWidget({
  todayDate,
  onViewAll,
}: {
  todayDate: string;
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  const [diary, setDiary] = useState<DiaryDetail | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const data = await diaryService.getByDate(todayDate);
        setDiary(data);
      } catch {
        console.error('Failed to load diary');
        setDiary(null);
      }
    })();
  }, [todayDate]);

  const isLoading = diary === undefined;

  const hour = new Date().getHours();
  const greeting = hour < 12
    ? { text: t('personal.overview.goodMorning', 'Good morning'), icon: <Sun size={20} className="text-amber-400" /> }
    : hour < 18
    ? { text: t('personal.overview.goodAfternoon', 'Good afternoon'), icon: <Sunset size={20} className="text-orange-400" /> }
    : { text: t('personal.overview.goodEvening', 'How was your day?'), icon: <Moon size={20} className="text-indigo-400" /> };

  return (
    <WidgetCard
      icon={<BookHeart size={16} className="text-rose-400" />}
      title={t('personal.overview.aiDiary', 'AI Diary')}
      badge={
        diary && diary.status === 'COMPLETED' ? (
          <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded-full">
            {t('personal.overview.done', 'Done')}
          </span>
        ) : diary && diary.status === 'CHATTING' ? (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
            {t('personal.overview.inProgress', 'In progress')}
          </span>
        ) : null
      }
      action={diary ? <ViewAllButton onClick={onViewAll} label={t('personal.overview.readMore', 'Read more')} /> : undefined}
      delay={0.15}
    >
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent/50" />
        </div>
      ) : !diary ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-4">
          {greeting.icon}
          <div>
            <p className="text-base font-bold text-white mb-1">{greeting.text}</p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {t('personal.overview.diaryPrompt', 'Take a moment to reflect on your day')}
            </p>
          </div>
          <button
            onClick={onViewAll}
            className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-bridge-accent to-purple-500 text-white text-sm font-bold rounded-xl hover:shadow-[0_0_24px_rgba(99,102,241,0.3)] transition-all"
          >
            <Sparkles size={14} />
            {t('personal.overview.startDiary', "Start today's diary")}
          </button>
        </div>
      ) : diary.status === 'CHATTING' ? (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 space-y-3">
            {diary.messages.length > 0 && (
              <div className="bg-white/[0.03] rounded-xl p-3">
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                  {diary.messages[diary.messages.length - 1].content}
                </p>
                <span className="text-[10px] text-slate-600 mt-1 block">
                  {diary.messages[diary.messages.length - 1].role === 'AI' ? 'AI' : 'You'}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onViewAll}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-white text-sm font-medium rounded-xl hover:bg-white/10 transition-all"
          >
            <BookHeart size={14} />
            {t('personal.overview.continueDiary', 'Continue writing')}
          </button>
        </div>
      ) : (
        <button onClick={onViewAll} className="flex-1 flex flex-col text-left">
          <div className="flex items-center gap-2 mb-3">
            {diary.mood && MOODS[diary.mood] && (
              <span className="text-2xl">{MOODS[diary.mood]}</span>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-white truncate">
                {diary.title || t('personal.overview.diaryTitle', "Today's diary")}
              </h4>
            </div>
          </div>
          {diary.content && (
            <div className="flex-1">
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-5">
                {diary.content}
              </p>
            </div>
          )}
          <div className="mt-3 text-[11px] text-bridge-secondary hover:text-bridge-secondary/80 transition-colors">
            {t('personal.overview.readFull', 'Read full diary →')}
          </div>
        </button>
      )}
    </WidgetCard>
  );
}

// ── Main Overview Component ──────────────────────────────────────────

export function PersonalOverview({ onNavigateTab }: PersonalOverviewProps) {
  const todayDate = getTodayDateString();

  return (
    <div className="h-full overflow-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-[1800px] mx-auto h-[calc(100%-1rem)]">
        <TodayScheduleWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('schedule')}
        />
        <UpcomingDeadlinesWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('tasks')}
        />
        <HabitsTodayWidget
          onViewAll={() => onNavigateTab('schedule')}
        />
        <DiaryWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('diary')}
        />
      </div>
    </div>
  );
}
