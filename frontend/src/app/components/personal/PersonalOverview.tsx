import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock, CalendarDays, CheckCircle2, BookHeart, Sparkles,
  ArrowRight, Sun, Sunset, Moon, Loader2, Flame, Check,
  Plus, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { personalEventService, diaryService } from '../../utils/services';
import { personalTaskAPI, personalHabitAPI, personalEventAPI } from '../../utils/api';
import { getTodayDateString } from '../../utils/dateUtils';
import { PersonalEvent, DiaryDetail, PersonalTask, HabitTodayItem, HabitFrequency } from '../../types';
import { CheckInConfirmModal, TaskCompleteConfirmModal } from './PersonalHabits';

type TabType = 'overview' | 'tasks' | 'schedule' | 'habits' | 'calendar' | 'diary';

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
      className="bg-bridge-obsidian rounded-2xl border border-white/5 p-4 md:p-5 flex flex-col min-h-[140px] lg:min-h-0 overflow-hidden"
    >
      <div className="flex items-center justify-between mb-2.5 md:mb-4">
        <div className="flex items-center gap-2.5">
          {icon}
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {badge}
        </div>
        {action}
      </div>
      <div className="flex-1 flex flex-col min-h-0">{children}</div>
    </motion.div>
  );
}

function ViewAllButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-bridge-secondary transition-colors"
    >
      <span>{label || t('personal.overview.viewAll', 'View all')}</span>
      <ArrowRight size={12} />
    </button>
  );
}

// ── Check Particles ─────────────────────────────────────────────────

const PARTICLE_COLORS = ['#34d399', '#6ee7b7', '#a7f3d0', '#2dd4bf', '#5eead4', '#fbbf24', '#f9a8d4'];

function CheckParticles({ trigger }: { trigger: boolean }) {
  const particles = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 360;
    const rad = (angle * Math.PI) / 180;
    const distance = 14 + Math.random() * 10;
    return {
      id: i,
      x: Math.cos(rad) * distance,
      y: Math.sin(rad) * distance,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      size: 2.5 + Math.random() * 2,
      delay: i * 0.02,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trigger]);

  return (
    <AnimatePresence>
      {trigger && particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: p.size,
            height: p.size,
            marginTop: -p.size / 2,
            marginLeft: -p.size / 2,
            borderRadius: '50%',
            backgroundColor: p.color,
            pointerEvents: 'none',
          }}
        />
      ))}
    </AnimatePresence>
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
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 md:gap-3">
          <CalendarDays size={24} className="text-slate-600 md:w-7 md:h-7" />
          <p className="text-xs md:text-sm text-slate-500">{t('personal.overview.noEvents', 'No events today')}</p>
          <button
            onClick={onViewAll}
            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-bold text-bridge-secondary bg-bridge-secondary/10 hover:bg-bridge-secondary/20 rounded-xl transition-all"
          >
            <Plus size={14} />
            {t('personal.overview.addSchedule', 'Add a schedule')}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 -mx-1 px-1">
          {allDayEvents.map(ev => {
            const color = ev.color || '#6366F1';
            return (
              <div key={ev.id} className="flex items-center gap-2.5 md:gap-3">
                <div className="w-[40px] md:w-[46px] flex-shrink-0 text-right">
                  <span className="text-[11px] md:text-[13px] text-slate-500 font-light">{t('personal.overview.allDay', 'All day')}</span>
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
              <div key={ev.id} className="flex items-start gap-2.5 md:gap-3">
                <div className="w-[40px] md:w-[46px] flex-shrink-0 pt-3 text-right">
                  <span className="text-[11px] md:text-[13px] text-slate-500 font-light">{ev.start_time?.slice(0, 5)}</span>
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
                        {t('personal.overview.now', 'NOW')}
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

type DeadlineItem =
  | { kind: 'task'; id: string; date: string; title: string; priority: string; status: string; category?: string | null; isDone: boolean }
  | { kind: 'event'; id: string; date: string; title: string; color: string; startTime?: string | null };

function UpcomingDeadlinesWidget({
  todayDate,
  onViewAll,
  onNavigateCalendar,
}: {
  todayDate: string;
  onViewAll: () => void;
  onNavigateCalendar: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [taskConfirm, setTaskConfirm] = useState<{ id: string; title: string; isDone: boolean } | null>(null);

  const today = new Date(todayDate + 'T00:00:00');

  const priorityOrder: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
  const sortDeadlines = useCallback((list: DeadlineItem[]) =>
    [...list].sort((a, b) => {
      const aDone = a.kind === 'task' && a.isDone ? 1 : 0;
      const bDone = b.kind === 'task' && b.isDone ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      const aPri = a.kind === 'task' ? (priorityOrder[a.priority] ?? 0) : -1;
      const bPri = b.kind === 'task' ? (priorityOrder[b.priority] ?? 0) : -1;
      return bPri - aPri;
    }), []);

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);

        // Fetch upcoming range: today ~ 30 days ahead
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 30);
        const endDateStr = endDate.toISOString().split('T')[0];

        const [taskData, eventData] = await Promise.all([
          personalTaskAPI.getAll(),
          personalEventAPI.getWeekly(todayDate, endDateStr),
        ]);

        const taskItems: DeadlineItem[] = taskData
          .filter(t => t.status !== 'ARCHIVED' && t.due_date)
          .map(t => ({
            kind: 'task' as const,
            id: t.id,
            date: t.due_date!,
            title: t.title,
            priority: t.priority,
            status: t.status,
            category: t.category,
            isDone: t.status === 'DONE',
          }));

        const eventItems: DeadlineItem[] = eventData.map(ev => ({
          kind: 'event' as const,
          id: ev.id,
          date: ev.event_date,
          title: ev.title,
          color: ev.color || '#6366F1',
          startTime: ev.start_time,
        }));

        const merged = sortDeadlines([...taskItems, ...eventItems]);

        setItems(merged);
      } catch {
        console.error('Failed to load deadlines');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [todayDate]);

  const handleToggleTask = useCallback(async (taskId: string, currentlyDone: boolean) => {
    setTogglingIds(prev => new Set(prev).add(taskId));
    try {
      const newStatus = currentlyDone ? 'TODO' as const : 'DONE' as const;
      await personalTaskAPI.updateStatus(taskId, newStatus);

      // Update done state immediately (triggers check animation)
      setItems(prev => prev.map(item =>
        item.kind === 'task' && item.id === taskId
          ? { ...item, isDone: !currentlyDone, status: newStatus }
          : item
      ));
      setTogglingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });

      // Mark as animating → after delay, re-sort
      if (!currentlyDone) {
        setAnimatingIds(prev => new Set(prev).add(taskId));
        setTimeout(() => {
          setAnimatingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
          // Re-sort: done items to bottom, then date, then priority
          setItems(prev => sortDeadlines(prev));
        }, 600);
      } else {
        // Unchecking → re-sort immediately
        setItems(prev => sortDeadlines(prev));
      }
    } catch {
      console.error('Failed to toggle task status');
      setTogglingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
    }
  }, [sortDeadlines]);

  const getDday = (dateStr: string) => {
    const due = new Date(dateStr + 'T00:00:00');
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const displayItems = items.slice(0, 8);
  const remaining = items.length - 8;

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
        items.length > 0 ? (
          <span className="text-[10px] font-bold text-bridge-accent bg-bridge-accent/10 px-1.5 py-0.5 rounded-full">
            {items.length}
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
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 md:gap-3">
          <CalendarDays size={24} className="text-slate-600 md:w-7 md:h-7" />
          <p className="text-xs md:text-sm text-slate-500">{t('personal.overview.noDeadlines', 'No upcoming deadlines')}</p>
          <button
            onClick={onViewAll}
            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-bold text-bridge-accent bg-bridge-accent/10 hover:bg-bridge-accent/20 rounded-xl transition-all"
          >
            <Plus size={14} />
            {t('personal.overview.addDeadline', 'Add a task')}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 -mx-1 px-1">
          {displayItems.map(item => {
            const dday = getDday(item.date);
            const isOverdue = dday < 0;

            if (item.kind === 'event') {
              return (
                <button
                  key={`event-${item.id}`}
                  onClick={onNavigateCalendar}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors text-left"
                >
                  <CalendarDays size={14} className="flex-shrink-0" style={{ color: item.color }} />
                  <div className="w-[60px] flex-shrink-0">
                    <span className="text-[11px] text-slate-400">{formatDueDate(item.date)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate text-slate-300">{item.title}</div>
                    {item.startTime && (
                      <div className="text-[10px] text-slate-500">{item.startTime.slice(0, 5)}</div>
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
            }

            // Task item
            const isDone = item.isDone;
            const isToggling = togglingIds.has(item.id);
            const isAnimating = animatingIds.has(item.id);
            const dotColor = PRIORITY_DOT[item.priority] || '#6366F1';
            return (
              <motion.div
                key={`task-${item.id}`}
                layout
                transition={{ layout: { type: 'spring', stiffness: 500, damping: 35 } }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors ${isDone && !isAnimating ? 'opacity-50' : ''}`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isToggling && !isAnimating) setTaskConfirm({ id: item.id, title: item.title, isDone });
                  }}
                  disabled={isToggling || isAnimating}
                  className="flex-shrink-0 w-[18px] h-[18px] relative overflow-visible"
                >
                  {isToggling ? (
                    <Loader2 size={16} className="animate-spin text-bridge-accent/50" />
                  ) : (
                    <>
                      {/* Empty circle */}
                      <motion.div
                        className="absolute inset-0 rounded-full border-2"
                        style={{ borderColor: isDone ? '#34d399' : dotColor }}
                        animate={isDone ? { borderColor: '#34d399' } : { borderColor: dotColor }}
                        transition={{ duration: 0.2 }}
                      />
                      {/* Fill + check */}
                      <AnimatePresence>
                        {isDone && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                            className="absolute inset-0 rounded-full bg-emerald-400 flex items-center justify-center"
                          >
                            <motion.div
                              initial={{ pathLength: 0, opacity: 0 }}
                              animate={{ pathLength: 1, opacity: 1 }}
                              transition={{ delay: 0.1, duration: 0.2 }}
                            >
                              <Check size={11} className="text-white" strokeWidth={3} />
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {/* Particles */}
                      <CheckParticles trigger={isAnimating} />
                    </>
                  )}
                </button>
                <button
                  onClick={onViewAll}
                  className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                >
                  <div className="w-[60px] flex-shrink-0">
                    <span className="text-[11px] text-slate-400">{formatDueDate(item.date)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <motion.div
                      animate={{
                        color: isDone ? '#64748b' : '#cbd5e1',
                      }}
                      transition={{ duration: 0.3 }}
                      className={`text-xs truncate ${isDone ? 'line-through' : ''}`}
                    >
                      {item.title}
                    </motion.div>
                    {item.category && (
                      <div className="text-[10px] text-slate-500">{item.category}</div>
                    )}
                  </div>
                  <AnimatePresence mode="wait">
                    {isDone ? (
                      <motion.span
                        key="done"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 text-emerald-400 bg-emerald-400/10"
                      >
                        {t('personal.overview.done', 'Done')}
                      </motion.span>
                    ) : (
                      <motion.span
                        key="dday"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
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
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            );
          })}
          {remaining > 0 && (
            <button onClick={onViewAll} className="w-full text-center py-1.5 text-[11px] text-slate-500 hover:text-bridge-secondary transition-colors">
              {t('personal.overview.moreItems', { count: remaining, defaultValue: '+{{count}} more' })}
            </button>
          )}
        </div>
      )}

      {/* Task Complete Confirm Modal */}
      <AnimatePresence>
        {taskConfirm && (
          <TaskCompleteConfirmModal
            taskName={taskConfirm.title}
            isUndo={taskConfirm.isDone}
            onConfirm={() => {
              handleToggleTask(taskConfirm.id, taskConfirm.isDone);
              setTaskConfirm(null);
            }}
            onCancel={() => setTaskConfirm(null)}
          />
        )}
      </AnimatePresence>
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [checkInConfirm, setCheckInConfirm] = useState<{ id: string; isUndo: boolean } | null>(null);

  const loadHabits = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await personalHabitAPI.getToday();
      setHabits(data);
    } catch {
      console.error('Failed to load habits');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHabits();
  }, [loadHabits]);

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
      setIsCreateOpen(false);
      await loadHabits();
    } catch (err) {
      console.error('Failed to create habit:', err);
    }
  };

  const completedCount = habits.filter(h => h.is_completed).length;
  const totalCount = habits.length;
  const rate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleCheckIn = async (habitId: string, isUndo?: boolean) => {
    const revertTo = !!isUndo;
    // Optimistic update
    setHabits(prev => prev.map(h =>
      h.habit_id === habitId ? { ...h, is_completed: !isUndo } : h
    ));
    try {
      const updated = await personalHabitAPI.checkIn(habitId);
      setHabits(prev => prev.map(h => h.habit_id === habitId ? updated : h));
    } catch {
      // Revert on failure
      setHabits(prev => prev.map(h =>
        h.habit_id === habitId ? { ...h, is_completed: revertTo } : h
      ));
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
      action={
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="p-1 text-slate-500 hover:text-purple-400 transition-colors"
            title={t('personal.overview.addHabit', 'Add habit')}
          >
            <Plus size={14} />
          </button>
          <ViewAllButton onClick={onViewAll} />
        </div>
      }
      delay={0.1}
    >
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent/50" />
        </div>
      ) : habits.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 md:gap-3">
          <Flame size={24} className="text-slate-600 md:w-7 md:h-7" />
          <p className="text-xs md:text-sm text-slate-500">{t('personal.overview.noHabits', 'No habits set up yet')}</p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-bold text-purple-400 bg-purple-400/10 hover:bg-purple-400/20 rounded-xl transition-all"
          >
            <Plus size={14} />
            {t('personal.overview.addFirstHabit', 'Add Your First Habit')}
          </button>
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
                onClick={() => setCheckInConfirm({ id: habit.habit_id, isUndo: habit.is_completed })}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors"
              >
                {/* Check circle with animation */}
                <motion.div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    habit.is_completed
                      ? 'bg-bridge-secondary border-bridge-secondary'
                      : 'border-white/20 hover:border-bridge-secondary/50'
                  }`}
                  initial={false}
                  animate={habit.is_completed ? {
                    scale: [1, 1.3, 0.9, 1.1, 1],
                  } : { scale: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <AnimatePresence mode="wait">
                    {habit.is_completed && (
                      <motion.div
                        key="check"
                        initial={{ scale: 0, rotate: -90, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                        exit={{ scale: 0, rotate: 90, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 15, delay: 0.1 }}
                      >
                        <CheckCircle2 size={10} className="text-white" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                <div className="flex-1 min-w-0 text-left">
                  <div className={`text-xs truncate ${
                    habit.is_completed ? 'line-through text-slate-500' : 'text-slate-300'
                  }`}>
                    {habit.icon && <span className="mr-1">{habit.icon}</span>}
                    {habit.title}
                  </div>
                </div>
                {/* Weekly progress donut ring */}
                {habit.weekly_target > 0 && (
                  <OverviewWeeklyDonut
                    completed={habit.weekly_completed}
                    target={habit.weekly_target}
                    color={habit.color || '#8B5CF6'}
                  />
                )}
                {/* Streak fire */}
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

      {/* Create Habit Modal */}
      <AnimatePresence>
        {isCreateOpen && (
          <OverviewCreateHabitModal
            onClose={() => setIsCreateOpen(false)}
            onCreate={handleCreateHabit}
          />
        )}
      </AnimatePresence>

      {/* Check-in Confirm Modal */}
      <AnimatePresence>
        {checkInConfirm && (() => {
          const habit = habits.find(h => h.habit_id === checkInConfirm.id);
          return (
            <CheckInConfirmModal
              habitName={habit?.title || ''}
              habitIcon={habit?.icon}
              streakCount={habit?.current_streak}
              isUndo={checkInConfirm.isUndo}
              onConfirm={() => {
                handleCheckIn(checkInConfirm.id, checkInConfirm.isUndo);
                setCheckInConfirm(null);
              }}
              onCancel={() => setCheckInConfirm(null)}
            />
          );
        })()}
      </AnimatePresence>
    </WidgetCard>
  );
}

// ── Weekly Donut (compact for overview) ──────────────────────────────

function OverviewWeeklyDonut({ completed, target, color }: {
  completed: number;
  target: number;
  color: string;
}) {
  const size = 22;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const rate = Math.min(completed / Math.max(target, 1), 1);
  const isComplete = completed >= target;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block" style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isComplete ? '#2DD4BF' : color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - rate) }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-bold leading-none"
          style={{
            fontSize: 6,
            color: isComplete ? '#2DD4BF' : 'rgba(255,255,255,0.5)',
          }}
        >
          {completed}/{target}
        </span>
      </div>
    </div>
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
    ? { text: t('personal.overview.goodMorning', 'How are you feeling today?'), icon: <Sun size={20} className="text-amber-400" /> }
    : hour < 18
    ? { text: t('personal.overview.goodAfternoon', "How's your day going?"), icon: <Sunset size={20} className="text-orange-400" /> }
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
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 md:gap-3 px-4">
          {greeting.icon}
          <div>
            <p className="text-sm md:text-base font-bold text-white mb-0.5 md:mb-1">{greeting.text}</p>
            <p className="text-[10px] md:text-[11px] text-slate-500 leading-relaxed hidden md:block">
              {t('personal.overview.diaryPrompt', 'Take a moment to reflect on your day')}
            </p>
          </div>
          <button
            onClick={onViewAll}
            className="mt-1 md:mt-2 flex items-center gap-2 px-4 py-2 md:px-5 md:py-2.5 bg-gradient-to-r from-bridge-accent to-purple-500 text-white text-xs md:text-sm font-bold rounded-xl hover:shadow-[0_0_24px_rgba(99,102,241,0.3)] transition-all"
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
                  {diary.messages[diary.messages.length - 1].role === 'AI' ? t('personal.overview.roleAI', 'AI') : t('personal.overview.roleYou', 'You')}
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
    <div className="h-full overflow-auto p-3 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2.5 md:gap-5 max-w-[1800px] mx-auto lg:h-[calc(100%-1rem)]">
        <TodayScheduleWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('schedule')}
        />
        <UpcomingDeadlinesWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('tasks')}
          onNavigateCalendar={() => onNavigateTab('calendar')}
        />
        <HabitsTodayWidget
          onViewAll={() => onNavigateTab('tasks')}
        />
        <DiaryWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('diary')}
        />
      </div>
    </div>
  );
}

/* ================================================================
   Create Habit Modal for Overview (Lightweight version)
   ================================================================ */

const OV_HABIT_COLORS = [
  '#8B5CF6', '#6366F1', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

const OV_HABIT_ICONS = [
  '🏃', '📚', '💧', '🧘', '💪', '🎯', '✍️', '🎵',
  '🧠', '🌿', '💊', '🍎', '😴', '🚶', '🧹', '📵',
];

const getOvFreqPresets = (t: (key: string, fallback: string) => string): { value: HabitFrequency; label: string }[] => [
  { value: 'DAILY', label: t('personal.overview.everyDay', 'Every Day') },
  { value: 'WEEKDAY', label: t('personal.overview.weekdays', 'Weekdays') },
  { value: 'CUSTOM', label: t('personal.overview.custom', 'Custom') },
];

const OV_DAY_CHIPS = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
];

function OverviewCreateHabitModal({
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
  }) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [frequencyType, setFrequencyType] = useState<HabitFrequency>('DAILY');
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [showMore, setShowMore] = useState(false);

  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(OV_HABIT_COLORS[0]);
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
      target_count: 1,
    });
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      initial={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
      animate={{ backgroundColor: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
      exit={{ backgroundColor: 'rgba(0,0,0,0)', backdropFilter: 'blur(0px)' }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        className="w-full sm:max-w-md bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-white/10 p-5 md:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-purple-400" />
            <h3 className="text-base md:text-lg font-bold text-white">
              {t('personal.habit.newHabit', 'New Habit')}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
              {t('personal.habit.habitName', 'Habit Name')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder={t('personal.habit.habitPlaceholder', 'e.g. Morning Run, Read 10 pages')}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
              {t('personal.habit.frequency', 'Frequency')}
            </label>
            <div className="flex gap-1.5">
              {getOvFreqPresets(t).map(({ value, label }) => (
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

          {frequencyType === 'CUSTOM' && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                {t('personal.habit.repeatOn', 'Repeat on')}
              </label>
              <div className="flex gap-1.5">
                {OV_DAY_CHIPS.map(({ value, label }) => (
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
                <p className="mt-1.5 text-xs text-amber-400">
                  {t('personal.habit.selectDay', 'Select at least one day')}
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
          >
            {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showMore ? t('personal.habit.lessOptions', 'Less options') : t('personal.habit.moreOptions', 'More options')}
          </button>

          <AnimatePresence>
            {showMore && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden"
              >
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                    {t('personal.habit.icon', 'Icon')}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {OV_HABIT_ICONS.map((emoji) => (
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

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">
                    {t('personal.habit.color', 'Color')}
                  </label>
                  <div className="flex gap-2">
                    {OV_HABIT_COLORS.map((c) => (
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

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                    {t('personal.habit.description', 'Description')}
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('personal.habit.descPlaceholder', 'Why this habit matters to you')}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all resize-none"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition-all"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 py-3 bg-purple-500 text-white text-sm font-bold rounded-xl hover:bg-purple-500/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {t('personal.habit.addHabit', 'Add Habit')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
