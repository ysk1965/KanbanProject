import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { FEATURE_COLORS } from '../../constants';
import {
  Clock, CalendarDays, CheckCircle2, BookHeart, Sparkles,
  ArrowRight, Sun, Sunrise, Sunset, Moon, Loader2, Flame, Check,
  Plus, X, ChevronDown, ChevronUp, ListTodo, Zap, Trophy,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionModal } from '../ui/MotionModal';
import { ColorPickerPopover } from '../ui/ColorPickerPopover';
import { personalEventService, diaryService } from '../../utils/services';
import { personalTaskAPI, personalHabitAPI, personalDashboardAPI } from '../../utils/api';
import { getTodayDateString } from '../../utils/dateUtils';
import { PersonalEvent, DiaryDetail, PersonalTask, PersonalHabit, HabitTodayItem, HabitFrequency, HabitWeeklyMatrix, PersonalTaskPriority, PersonalDashboardToday, PersonalOverviewData, DiaryOverviewInfo } from '../../types';
import { CheckInConfirmModal, TaskCompleteConfirmModal, HabitFormModal, DeleteConfirmModal } from './PersonalHabits';
import { TaskDetailModal } from './PersonalTaskBoard';
import { BoardTasksWidget } from './BoardTasksWidget';
import { CelebrationsWidget } from './CelebrationsWidget';
import { useAuth } from '../../contexts/AuthContext';

type TabType = 'overview' | 'tasks' | 'schedule' | 'habits' | 'calendar' | 'diary';

interface PersonalOverviewProps {
  onNavigateTab: (tab: TabType) => void;
  onRefreshTasks?: () => void;
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl border border-foreground/[0.08] flex flex-col min-h-[120px] md:min-h-[140px] lg:min-h-0 overflow-hidden"
    >
      <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.08]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-[13px] md:text-sm font-bold text-foreground">{title}</h3>
            {badge}
          </div>
          {action}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-0 bg-bridge-dark p-3 md:p-5">{children}</div>
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

// ── Completion Sparkles (for 100% stat cards) ──────────────────────────

const SPARKLE_COLORS = ['#2dd4bf', '#34d399', '#6366f1', '#fbbf24', '#f9a8d4', '#a78bfa', '#5eead4'];

/** Idle twinkle sparkles (always visible when complete) */
function CompletionSparkles({ active }: { active: boolean }) {
  const sparkles = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 2 + Math.random() * 2.5,
    delay: i * 0.3 + Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1,
    color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
  })), []);

  if (!active) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
      {sparkles.map(s => (
        <motion.div
          key={s.id}
          className="absolute"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            backgroundColor: s.color,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            repeatDelay: 1 + Math.random() * 2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/** One-shot burst confetti (fires each time triggerKey increments above 0) */
function CompletionBurst({ triggerKey }: { triggerKey: number }) {
  const [show, setShow] = useState(false);
  const prevKey = useRef(0);
  const particles = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 360;
    const rad = (angle * Math.PI) / 180;
    const dist = 20 + Math.random() * 25;
    return {
      id: i,
      x: Math.cos(rad) * dist,
      y: Math.sin(rad) * dist - 8,
      color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
      size: 3 + Math.random() * 3,
      delay: i * 0.025,
    };
  }), []);

  useEffect(() => {
    if (triggerKey > 0 && triggerKey !== prevKey.current) {
      prevKey.current = triggerKey;
      setShow(true);
      const timer = setTimeout(() => setShow(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [triggerKey]);

  return (
    <AnimatePresence>
      {show && particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: p.delay, ease: 'easeOut' }}
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
            zIndex: 10,
          }}
        />
      ))}
    </AnimatePresence>
  );
}

// ── 좌상단: Today's Schedule (Timeline) ──────────────────────────────

const TIMELINE_SLOT_H = 48; // px per 30min slot

function TodayScheduleWidget({
  todayDate,
  onViewAll,
  events: externalEvents,
}: {
  todayDate: string;
  onViewAll: () => void;
  events?: PersonalEvent[];
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (externalEvents) {
      setEvents(externalEvents);
      setIsLoading(false);
      return;
    }
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
  }, [todayDate, externalEvents]);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const toMin = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const calendarEvents = events.filter(e => e.event_type === 'CALENDAR');

  const allTimedEvents = events
    .filter(e => e.event_type !== 'CALENDAR' && !e.all_day && e.start_time)
    .sort((a, b) => toMin(a.start_time!) - toMin(b.start_time!));

  const allDayEvents: PersonalEvent[] = [];

  // 반응형 윈도우: 모바일 ±1시간(2h), 데스크탑 ±1.5시간(3h)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const halfWindow = isMobile ? 60 : 90;
  const rawWindowStart = currentMinutes - halfWindow;
  const rawWindowEnd = currentMinutes + halfWindow;
  const windowStartMin = rawWindowStart >= 0 ? (Math.floor(rawWindowStart / 30) * 30) : 0;
  const windowEndMin = Math.min(24 * 60, Math.ceil(rawWindowEnd / 30) * 30);

  // 윈도우와 겹치는 이벤트
  const timedEvents = allTimedEvents.filter(ev => {
    const evStart = toMin(ev.start_time!);
    const evEnd = ev.end_time ? toMin(ev.end_time) : evStart + 60;
    return evStart < rawWindowEnd && evEnd > rawWindowStart;
  });

  // 30분 단위 타임슬롯 생성
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let m = windowStartMin; m < windowEndMin; m += 30) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      slots.push(`${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`);
    }
    return slots;
  }, [windowStartMin, windowEndMin]);

  const totalHeight = timeSlots.length * TIMELINE_SLOT_H;

  // 현재 시간 indicator 위치
  const nowTop = useMemo(() => {
    const mins = currentMinutes - windowStartMin;
    if (mins < 0 || mins > (windowEndMin - windowStartMin)) return null;
    return (mins / 30) * TIMELINE_SLOT_H;
  }, [currentMinutes, windowStartMin, windowEndMin]);

  // 초기 스크롤: 현재 시간을 중앙으로
  useEffect(() => {
    if (nowTop != null && indicatorRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const target = nowTop - container.clientHeight / 2;
      container.scrollTop = Math.max(0, target);
    }
  }, [nowTop, isLoading]);

  const fmtTime = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  };

  return (
    <WidgetCard
      icon={<Clock size={16} className="text-bridge-secondary" />}
      title={t('personal.overview.todaySchedule', "Today's Schedule")}
      badge={
        (allTimedEvents.length + calendarEvents.length) > 0 ? (
          <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/15 px-1.5 py-0.5 rounded-full">
            {timedEvents.length + calendarEvents.length}/{allTimedEvents.length + calendarEvents.length}
          </span>
        ) : null
      }
      action={<ViewAllButton onClick={onViewAll} />}
      delay={0}
    >
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
        </div>
      ) : allTimedEvents.length === 0 && calendarEvents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 md:gap-3">
          <CalendarDays size={24} className="text-slate-600 md:w-7 md:h-7" />
          <p className="text-xs md:text-sm text-slate-500">{t('personal.overview.noEvents', 'No events today')}</p>
          <button
            onClick={onViewAll}
            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-bold text-bridge-secondary bg-bridge-secondary/15 hover:bg-bridge-secondary/25 rounded-xl transition-all"
          >
            <Plus size={14} />
            {t('personal.overview.addSchedule', 'Add a schedule')}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* ── 캘린더 일정 ── */}
          {calendarEvents.length > 0 && (
            <div className="pb-1.5 space-y-0.5 border-t border-foreground/[0.08] pt-1.5">
              {calendarEvents.map((ev) => {
                const color = ev.color || '#6366F1';
                return (
                  <button
                    key={ev.id}
                    onClick={onViewAll}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-foreground/5 transition-colors text-left"
                  >
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[11px] text-foreground truncate flex-1">{ev.title}</span>
                    <span className="text-[9px] text-slate-500 tabular-nums shrink-0">
                      {ev.start_time ? `${ev.start_time.slice(0, 5)}${ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ''}` : t('personal.mobile.allDay', 'All day')}
                    </span>
                  </button>
                );
              })}
              {allTimedEvents.length > 0 && (
                <div className="h-0" />
              )}
            </div>
          )}

          {/* ── 타임라인 ── */}
          {allTimedEvents.length > 0 && (
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1 border-t border-foreground/[0.08] pt-1.5">
              <div className="relative" style={{ height: `${totalHeight}px` }}>
                {/* ── 30분 단위 시간 그리드 ── */}
                {timeSlots.map((time, idx) => (
                  <div
                    key={time}
                    className="absolute left-0 right-0 flex border-b border-foreground/[0.04]"
                    style={{ top: `${idx * TIMELINE_SLOT_H}px`, height: `${TIMELINE_SLOT_H}px` }}
                  >
                    <div className="w-10 md:w-12 flex-shrink-0 pr-2 pt-0.5 text-right">
                      {time.endsWith(':00') && (
                        <span className="text-[10px] md:text-[11px] text-slate-500 tabular-nums font-light">
                          {time}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 border-l border-foreground/[0.08]" />
                  </div>
                ))}

                {/* ── 이벤트 블록 ── */}
                {timedEvents.map(ev => {
                  const evStart = toMin(ev.start_time!);
                  const evEnd = ev.end_time ? toMin(ev.end_time) : evStart + 60;
                  const color = ev.color || '#6366F1';

                  // 윈도우 내로 클램프
                  const clampedStart = Math.max(evStart, windowStartMin);
                  const clampedEnd = Math.min(evEnd, windowEndMin);

                  const top = ((clampedStart - windowStartMin) / 30) * TIMELINE_SLOT_H;
                  const height = Math.max(((clampedEnd - clampedStart) / 30) * TIMELINE_SLOT_H, TIMELINE_SLOT_H * 0.6);

                  const isCurrent = currentMinutes >= evStart && currentMinutes < evEnd;
                  const isPast = currentMinutes >= evEnd;

                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`absolute rounded-lg border-l-[3px] px-2.5 py-1.5 overflow-hidden cursor-pointer
                        hover:shadow-lg transition-shadow ${isPast ? 'opacity-50' : ''}`}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: '2.75rem',
                        right: '0.25rem',
                        borderLeftColor: color,
                        background: isCurrent
                          ? `linear-gradient(135deg, ${color}22 0%, ${color}10 100%)`
                          : `linear-gradient(135deg, ${color}14 0%, ${color}08 100%)`,
                      }}
                      onClick={onViewAll}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[11px] font-semibold truncate ${isCurrent ? 'text-foreground' : 'text-foreground/80'}`}>
                          {ev.title}
                        </span>
                        {isCurrent && (
                          <span className="text-[8px] font-bold text-bridge-secondary bg-bridge-secondary/15 px-1 py-px rounded-full flex-shrink-0 animate-pulse">
                            NOW
                          </span>
                        )}
                      </div>
                      {height >= TIMELINE_SLOT_H * 0.8 && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {ev.start_time?.slice(0, 5)}{ev.end_time ? ` - ${ev.end_time.slice(0, 5)}` : ''}
                        </div>
                      )}
                    </motion.div>
                  );
                })}

                {/* ── 현재 시간 표시선 ── */}
                {nowTop != null && (
                  <div
                    ref={indicatorRef}
                    className="absolute left-0 right-0 z-10 pointer-events-none flex items-center"
                    style={{ top: `${nowTop}px` }}
                  >
                    <div className="w-10 md:w-12 flex-shrink-0 flex justify-end pr-1">
                      <span className="text-[9px] font-bold text-red-400 bg-red-500/15 px-1 rounded tabular-nums">
                        {fmtTime(currentMinutes)}
                      </span>
                    </div>
                    <div className="flex items-center flex-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 -ml-[3px] flex-shrink-0" />
                      <div className="flex-1 h-[1.5px] bg-red-500/60" />
                    </div>
                  </div>
                )}

                {/* 윈도우 내 이벤트 없을 때 빈 상태 */}
                {timedEvents.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-1.5">
                    <Clock size={20} className="text-slate-600" />
                    <p className="text-[11px] text-slate-500">
                      {t('personal.overview.noNearbyEvents', 'No events in the next hour')}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {t('personal.overview.totalEventsToday', '{{count}} events today', { count: allTimedEvents.length })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// ── 우상단: Upcoming Deadlines (PersonalTask 기반) ───────────────────

type DeadlineItem =
  { kind: 'task'; id: string; date: string; title: string; priority: string; status: string; category?: string | null; isDone: boolean };

function UpcomingDeadlinesWidget({
  todayDate,
  onViewAll,
  onTaskToggle,
  allTasks: externalTasks,
  onRefresh,
}: {
  todayDate: string;
  onViewAll: () => void;
  onTaskToggle?: (taskId: string, isDone: boolean) => void;
  allTasks?: PersonalTask[];
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [taskConfirm, setTaskConfirm] = useState<{ id: string; title: string; isDone: boolean } | null>(null);

  // Full data maps for detail modals
  const [taskMap, setTaskMap] = useState<Map<string, PersonalTask>>(new Map());
  const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);

  const today = new Date(todayDate + 'T00:00:00');

  const priorityOrder: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
  const sortDeadlines = useCallback((list: DeadlineItem[]) =>
    [...list].sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      const aPri = a.kind === 'task' ? (priorityOrder[a.priority] ?? 0) : -1;
      const bPri = b.kind === 'task' ? (priorityOrder[b.priority] ?? 0) : -1;
      return bPri - aPri;
    }), []);

  useEffect(() => {
    const processTaskData = (taskData: PersonalTask[]) => {
      const taskItems: DeadlineItem[] = taskData
        .filter(t => t.status !== 'ARCHIVED' && t.due_date && t.due_date >= todayDate)
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

      const sorted = sortDeadlines(taskItems);

      const tMap = new Map<string, PersonalTask>();
      taskData.forEach(t => tMap.set(t.id, t));
      setTaskMap(tMap);

      setItems(sorted);
      setIsLoading(false);
    };

    if (externalTasks) {
      processTaskData(externalTasks);
      return;
    }

    (async () => {
      try {
        setIsLoading(true);
        const taskData = await personalTaskAPI.getAll();
        processTaskData(taskData);
      } catch {
        console.error('Failed to load deadlines');
        setIsLoading(false);
      }
    })();
  }, [todayDate, externalTasks]);

  const handleToggleTask = useCallback(async (taskId: string, currentlyDone: boolean) => {
    setTogglingIds(prev => new Set(prev).add(taskId));
    const newStatus = currentlyDone ? 'TODO' as const : 'DONE' as const;
    // Optimistic: update parent dashboard stats immediately
    onTaskToggle?.(taskId, newStatus === 'DONE');
    try {
      await personalTaskAPI.updateStatus(taskId, newStatus);

      setTogglingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });

      if (!currentlyDone) {
        // Checked → animate but keep in list
        setItems(prev => prev.map(item =>
          item.kind === 'task' && item.id === taskId
            ? { ...item, isDone: true, status: newStatus }
            : item
        ));
        setAnimatingIds(prev => new Set(prev).add(taskId));
        setTimeout(() => {
          setAnimatingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
        }, 600);
      } else {
        // Unchecked → restore and re-sort
        setItems(prev => prev.map(item =>
          item.kind === 'task' && item.id === taskId
            ? { ...item, isDone: false, status: newStatus }
            : item
        ));
        setItems(prev => sortDeadlines(prev));
      }
      onRefresh?.();
    } catch {
      console.error('Failed to toggle task status');
      setTogglingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
      // Revert optimistic update
      onTaskToggle?.(taskId, currentlyDone);
    }
  }, [sortDeadlines, onTaskToggle, onRefresh]);

  // Task detail modal callbacks
  const handleTaskUpdate = useCallback(async (data: { title?: string; due_date?: string | null; priority?: PersonalTaskPriority; description?: string }) => {
    if (!selectedTask) return;
    try {
      const updated = await personalTaskAPI.update(selectedTask.id, data);
      setSelectedTask(updated);
      setTaskMap(prev => { const n = new Map(prev); n.set(updated.id, updated); return n; });
      // Update deadline item in list
      setItems(prev => prev.map(item =>
        item.kind === 'task' && item.id === updated.id
          ? { ...item, title: updated.title, date: updated.due_date || item.date, priority: updated.priority }
          : item
      ));
      onRefresh?.();
    } catch {
      console.error('Failed to update task');
    }
  }, [selectedTask, onRefresh]);

  const handleTaskDelete = useCallback(async () => {
    if (!selectedTask) return;
    try {
      await personalTaskAPI.delete(selectedTask.id);
      setItems(prev => prev.filter(item => !(item.kind === 'task' && item.id === selectedTask.id)));
      setSelectedTask(null);
      onRefresh?.();
    } catch {
      console.error('Failed to delete task');
    }
  }, [selectedTask, onRefresh]);

  const handleTaskToggleComplete = useCallback(async () => {
    if (!selectedTask) return;
    const newStatus = selectedTask.status === 'DONE' ? 'TODO' as const : 'DONE' as const;
    onTaskToggle?.(selectedTask.id, newStatus === 'DONE');
    try {
      const updated = await personalTaskAPI.updateStatus(selectedTask.id, newStatus);
      setSelectedTask(updated);
      setTaskMap(prev => { const n = new Map(prev); n.set(updated.id, updated); return n; });
      // Update isDone in list (keep item visible)
      setItems(prev => prev.map(item =>
        item.kind === 'task' && item.id === selectedTask.id
          ? { ...item, isDone: newStatus === 'DONE', status: newStatus }
          : item
      ));
    } catch {
      console.error('Failed to toggle task');
    }
  }, [selectedTask]);

  const getDday = (dateStr: string) => {
    const due = new Date(dateStr + 'T00:00:00');
    return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const displayItems = items.slice(0, 5);
  const remaining = items.length - 5;

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
          <span className="text-[10px] font-bold text-bridge-accent bg-bridge-accent/15 px-1.5 py-0.5 rounded-full">
            {items.length}
          </span>
        ) : null
      }
      action={<ViewAllButton onClick={onViewAll} />}
      delay={0.05}
    >
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 md:gap-3">
          <CalendarDays size={24} className="text-slate-600 md:w-7 md:h-7" />
          <p className="text-xs md:text-sm text-slate-500">{t('personal.overview.noDeadlines', 'No upcoming deadlines')}</p>
          <button
            onClick={onViewAll}
            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-bold text-bridge-accent bg-bridge-accent/15 hover:bg-bridge-accent/25 rounded-xl transition-all"
          >
            <Plus size={14} />
            {t('personal.overview.addDeadline', 'Add a task')}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1">
          {displayItems.map((item, idx) => {
            const prevDate = idx > 0 ? displayItems[idx - 1].date : null;
            const showDivider = idx > 0 && item.date !== prevDate;
            const dday = getDday(item.date);
            const isOverdue = dday < 0;
            const isDone = item.isDone;
            const isToggling = togglingIds.has(item.id);
            const isAnimating = animatingIds.has(item.id);
            const dotColor = PRIORITY_DOT[item.priority] || '#6366F1';
            return (
              <Fragment key={`task-${item.id}`}>
                {showDivider && <div className="h-px bg-foreground/15 mx-2 my-1" />}
                <motion.div
                  layout
                  transition={{ layout: { type: 'spring', stiffness: 500, damping: 35 } }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-foreground/5 transition-colors ${isDone && !isAnimating ? 'opacity-50' : ''} ${
                    dday === 0 && !isDone ? 'bg-bridge-secondary/[0.06] ring-1 ring-bridge-secondary/15' : ''
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isToggling && !isAnimating) {
                        if (isDone) {
                          setTaskConfirm({ id: item.id, title: item.title, isDone: true });
                        } else {
                          handleToggleTask(item.id, false);
                        }
                      }
                    }}
                    disabled={isToggling || isAnimating}
                    className="flex-shrink-0 w-[18px] h-[18px] relative overflow-visible"
                  >
                    {isToggling ? (
                      <Loader2 size={16} className="animate-spin text-bridge-accent" />
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
                    onClick={() => {
                      const task = taskMap.get(item.id);
                      if (task) setSelectedTask(task);
                    }}
                    className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                  >
                    <div className="w-[60px] flex-shrink-0">
                      <span className={`text-[11px] ${dday === 0 && !isDone ? 'text-bridge-secondary font-medium' : 'text-slate-400'}`}>{formatDueDate(item.date)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <motion.div
                        animate={{ opacity: isDone ? 0.5 : 1 }}
                        transition={{ duration: 0.3 }}
                        className={`text-xs truncate ${isDone ? 'line-through text-muted-foreground' : dday === 0 ? 'text-foreground font-medium' : 'text-foreground'}`}
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
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 text-emerald-400 bg-emerald-400/15"
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
                            ? 'text-red-400 bg-red-400/15'
                            : dday === 0
                            ? 'text-bridge-secondary bg-bridge-secondary/15 ring-1 ring-bridge-secondary/30'
                            : dday <= 3
                            ? 'text-amber-400 bg-amber-400/15'
                            : dday <= 7
                            ? 'text-blue-400 bg-blue-400/15'
                            : 'text-slate-400 bg-foreground/5'
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
              </Fragment>
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
      <TaskCompleteConfirmModal
        open={!!taskConfirm}
        taskName={taskConfirm?.title || ''}
        isUndo={taskConfirm?.isDone}
        onConfirm={() => {
          if (taskConfirm) {
            handleToggleTask(taskConfirm.id, taskConfirm.isDone);
            setTaskConfirm(null);
          }
        }}
        onCancel={() => setTaskConfirm(null)}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        open={!!selectedTask}
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={handleTaskUpdate}
        onDelete={handleTaskDelete}
        onToggleComplete={handleTaskToggleComplete}
      />

    </WidgetCard>
  );
}

// ── 좌하단: Habits Today (카드 스타일) ──────────────────────

const HABIT_DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HABIT_DAY_ORDER = [0, 1, 2, 3, 4, 5, 6]; // Sun → Sat

function getHabitScheduledDays(frequencyType: HabitFrequency, frequencyDays?: string | null): Set<number> {
  switch (frequencyType) {
    case 'DAILY': return new Set([0, 1, 2, 3, 4, 5, 6]);
    case 'WEEKDAY': return new Set([1, 2, 3, 4, 5]);
    case 'WEEKEND': return new Set([0, 6]);
    case 'CUSTOM': return new Set(frequencyDays ? frequencyDays.split(',').map(Number) : []);
    default: return new Set([0, 1, 2, 3, 4, 5, 6]);
  }
}

function HabitsTodayWidget({
  onViewAll,
  allHabits: externalAllHabits,
  todayHabits: externalTodayHabits,
  weeklyMatrix: externalWeeklyMatrix,
  onRefresh,
}: {
  onViewAll: () => void;
  allHabits?: PersonalHabit[];
  todayHabits?: HabitTodayItem[];
  weeklyMatrix?: HabitWeeklyMatrix;
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const [allHabits, setAllHabits] = useState<PersonalHabit[]>([]);
  const [todayHabits, setTodayHabits] = useState<HabitTodayItem[]>([]);
  const [weeklyMatrix, setWeeklyMatrix] = useState<HabitWeeklyMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [checkInConfirm, setCheckInConfirm] = useState<{ id: string; isUndo: boolean } | null>(null);
  const [editHabit, setEditHabit] = useState<PersonalHabit | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const todayDow = new Date().getDay();

  // Build a map: habitId → Set of completed day-of-week indices (0=Sun ... 6=Sat)
  const weeklyCompletionMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    if (!weeklyMatrix) return map;
    weeklyMatrix.habits.forEach(row => {
      const completedDays = new Set<number>();
      row.days.forEach(day => {
        if (day.is_completed) {
          completedDays.add(new Date(day.date + 'T00:00:00').getDay());
        }
      });
      map.set(row.habit_id, completedDays);
    });
    return map;
  }, [weeklyMatrix]);

  const loadHabits = useCallback(async () => {
    if (externalAllHabits && externalTodayHabits && externalWeeklyMatrix) {
      setAllHabits(externalAllHabits.filter(h => h.is_active));
      setTodayHabits(externalTodayHabits);
      setWeeklyMatrix(externalWeeklyMatrix);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      // Calculate this week's Monday~Sunday range
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const [all, today, weekly] = await Promise.all([
        personalHabitAPI.getAll(),
        personalHabitAPI.getToday(fmt(now)),
        personalHabitAPI.getWeekly(fmt(monday), fmt(sunday)),
      ]);
      setAllHabits(all.filter(h => h.is_active));
      setTodayHabits(today);
      setWeeklyMatrix(weekly);
    } catch {
      console.error('Failed to load habits');
    } finally {
      setIsLoading(false);
    }
  }, [externalAllHabits, externalTodayHabits, externalWeeklyMatrix]);

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
      onRefresh ? onRefresh() : await loadHabits();
    } catch (err) {
      console.error('Failed to create habit:', err);
    }
  };

  const todayStatusMap = useMemo(() => {
    const map = new Map<string, HabitTodayItem>();
    todayHabits.forEach(h => map.set(h.habit_id, h));
    return map;
  }, [todayHabits]);

  const completedCount = todayHabits.filter(h => h.is_completed).length;
  const totalCount = todayHabits.length;

  const handleUpdateHabit = async (habitId: string, data: Record<string, unknown>) => {
    try {
      await personalHabitAPI.update(habitId, data);
      setEditHabit(null);
      onRefresh ? onRefresh() : await loadHabits();
    } catch (err) {
      console.error('Failed to update habit:', err);
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    try {
      await personalHabitAPI.delete(habitId);
      setDeleteConfirm(null);
      onRefresh ? onRefresh() : await loadHabits();
    } catch (err) {
      console.error('Failed to delete habit:', err);
    }
  };

  const handleCheckIn = async (habitId: string, isUndo?: boolean) => {
    const revertTo = !!isUndo;
    const todayDate = getTodayDateString();
    setTodayHabits(prev => prev.map(h =>
      h.habit_id === habitId ? { ...h, is_completed: !isUndo } : h
    ));
    // Optimistic update for weekly matrix
    setWeeklyMatrix(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        habits: prev.habits.map(row => {
          if (row.habit_id !== habitId) return row;
          return {
            ...row,
            days: row.days.map(day =>
              day.date === todayDate ? { ...day, is_completed: !isUndo } : day
            ),
          };
        }),
      };
    });
    try {
      const updated = await personalHabitAPI.checkIn(habitId, { log_date: todayDate });
      setTodayHabits(prev => prev.map(h => h.habit_id === habitId ? updated : h));
    } catch {
      setTodayHabits(prev => prev.map(h =>
        h.habit_id === habitId ? { ...h, is_completed: revertTo } : h
      ));
      // Revert weekly matrix
      setWeeklyMatrix(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          habits: prev.habits.map(row => {
            if (row.habit_id !== habitId) return row;
            return {
              ...row,
              days: row.days.map(day =>
                day.date === todayDate ? { ...day, is_completed: revertTo } : day
              ),
            };
          }),
        };
      });
      console.error('Failed to check in');
    }
  };

  return (
    <WidgetCard
      icon={<Flame size={16} className="text-purple-400" />}
      title={t('personal.overview.habitsToday', 'Habits Today')}
      badge={
        totalCount > 0 ? (
          <span className="text-[10px] font-bold text-purple-400 bg-purple-400/15 px-1.5 py-0.5 rounded-full">
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
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
        </div>
      ) : allHabits.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 md:gap-3">
          <Flame size={24} className="text-slate-600 md:w-7 md:h-7" />
          <p className="text-xs md:text-sm text-slate-500">{t('personal.overview.noHabits', 'No habits set up yet')}</p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-bold text-purple-400 bg-purple-400/15 hover:bg-purple-400/25 rounded-xl transition-all"
          >
            <Plus size={14} />
            {t('personal.overview.addFirstHabit', 'Add Your First Habit')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar">
          {/* Grid layout for habit cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {allHabits.filter(h => {
              const scheduled = getHabitScheduledDays(h.frequency_type, h.frequency_days);
              return scheduled.has(todayDow);
            }).map((habit, idx) => {
              const todayStatus = todayStatusMap.get(habit.id);
              const isScheduledToday = todayStatus !== undefined;
              const isCompleted = todayStatus?.is_completed ?? false;
              const scheduledDays = getHabitScheduledDays(habit.frequency_type, habit.frequency_days);
              const color = habit.color || '#8B5CF6';
              const streak = todayStatus?.current_streak ?? habit.best_streak;
              const weeklyCompleted = todayStatus?.weekly_completed ?? 0;
              const weeklyTarget = todayStatus?.weekly_target ?? 0;

              return (
                <motion.div
                  key={habit.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => setEditHabit(habit)}
                  className="rounded-xl border p-3 text-left relative group transition-colors cursor-pointer border-foreground/[0.08] bg-foreground/[0.03] hover:bg-foreground/5"
                >
                  {/* Top progress gauge bar */}
                  <div className="absolute top-0 left-3 right-3 h-[2.5px] rounded-b-full overflow-hidden"
                    style={{ backgroundColor: `${color}22` }}
                  >
                    <motion.div
                      className="h-full rounded-b-full"
                      initial={{ width: 0 }}
                      animate={{ width: weeklyTarget > 0 ? `${Math.min((weeklyCompleted / weeklyTarget) * 100, 100)}%` : '100%' }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      style={{ backgroundColor: weeklyCompleted >= weeklyTarget ? '#2DD4BF' : color }}
                    />
                  </div>

                  {/* Icon + title + check + count */}
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isScheduledToday) {
                          if (isCompleted) {
                            setCheckInConfirm({ id: habit.id, isUndo: true });
                          } else {
                            handleCheckIn(habit.id);
                          }
                        }
                      }}
                      className="flex-shrink-0"
                    >
                      <motion.div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isCompleted
                            ? 'bg-bridge-secondary border-bridge-secondary'
                            : isScheduledToday
                            ? 'border-foreground/20 group-hover:border-purple-400/50'
                            : 'border-foreground/10'
                        }`}
                        animate={isCompleted ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        {isCompleted && <Check size={11} className="text-white" />}
                      </motion.div>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-bold truncate ${
                        isCompleted ? 'text-slate-500 line-through' : 'text-foreground'
                      }`}>
                        {habit.icon && <span className="mr-0.5">{habit.icon}</span>}
                        {habit.title}
                      </div>
                    </div>
                    {streak > 0 && (
                      <span className="inline-flex items-center gap-px text-[9px] text-orange-400 font-bold shrink-0">
                        <Flame size={9} className="shrink-0" />
                        {streak}
                      </span>
                    )}
                  </div>

                  {/* Day chips */}
                  <div className="flex gap-1">
                    {HABIT_DAY_ORDER.map(dayIdx => {
                      const isScheduled = scheduledDays.has(dayIdx);
                      const isTodayDay = dayIdx === todayDow;
                      const isDayCompleted = weeklyCompletionMap.get(habit.id)?.has(dayIdx) ?? false;
                      return (
                        <div key={dayIdx} className="flex flex-col items-center gap-1 flex-1">
                          <span className={`text-[9px] leading-none ${
                            dayIdx === 0
                              ? isTodayDay && isScheduled
                                ? 'font-black text-red-400'
                                : isTodayDay
                                ? 'font-bold text-red-400/70'
                                : 'font-medium text-red-400/60'
                              : isTodayDay && isScheduled
                              ? 'font-black text-purple-300'
                              : isTodayDay
                              ? 'font-bold text-slate-400'
                              : isScheduled
                              ? 'text-slate-400'
                              : 'text-slate-600/30'
                          }`}>
                            {HABIT_DAY_LABELS[dayIdx]}
                          </span>
                          {isDayCompleted ? (
                            <div
                              className={`rounded-full flex items-center justify-center transition-all ${
                                isTodayDay
                                  ? 'w-2.5 h-2.5 ring-[1.5px] ring-purple-400/60'
                                  : 'w-2.5 h-2.5'
                              }`}
                              style={{ backgroundColor: color }}
                            >
                              <Check size={7} className="text-white" strokeWidth={3.5} />
                            </div>
                          ) : (
                            <div
                              className={`rounded-full transition-all ${
                                isTodayDay && isScheduled
                                  ? 'w-2.5 h-2.5 ring-[1.5px] ring-purple-400/60'
                                  : 'w-1.5 h-1.5'
                              }`}
                              style={{
                                backgroundColor: isScheduled
                                  ? isTodayDay ? color : `${color}55`
                                  : 'rgba(255,255,255,0.04)',
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Habit Modal */}
      <OverviewCreateHabitModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreateHabit}
      />

      {/* Check-in Confirm Modal */}
      <CheckInConfirmModal
        open={!!checkInConfirm}
        habitName={checkInConfirm ? (allHabits.find(h => h.id === checkInConfirm.id)?.title || '') : ''}
        habitIcon={checkInConfirm ? allHabits.find(h => h.id === checkInConfirm.id)?.icon : undefined}
        streakCount={checkInConfirm ? todayStatusMap.get(checkInConfirm.id)?.current_streak : undefined}
        isUndo={checkInConfirm?.isUndo}
        onConfirm={() => {
          if (checkInConfirm) {
            handleCheckIn(checkInConfirm.id, checkInConfirm.isUndo);
            setCheckInConfirm(null);
          }
        }}
        onCancel={() => setCheckInConfirm(null)}
      />

      {/* Edit Habit Modal */}
      <HabitFormModal
        open={!!editHabit}
        habit={editHabit ?? undefined}
        onClose={() => setEditHabit(null)}
        onSubmit={(data) => editHabit && handleUpdateHabit(editHabit.id, data)}
        onDelete={() => {
          if (editHabit) {
            setEditHabit(null);
            setDeleteConfirm(editHabit.id);
          }
        }}
      />

      <DeleteConfirmModal
        open={!!deleteConfirm}
        habitName={allHabits.find(h => h.id === deleteConfirm)?.title || ''}
        onConfirm={() => deleteConfirm && handleDeleteHabit(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
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
          className="stroke-foreground/10"
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
          className="font-bold leading-none text-muted-foreground"
          style={{
            fontSize: 6,
            ...(isComplete ? { color: '#2DD4BF' } : {}),
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
  diaryInfo,
}: {
  todayDate: string;
  onViewAll: () => void;
  diaryInfo?: DiaryOverviewInfo | null;
}) {
  const { t } = useTranslation();
  const [diary, setDiary] = useState<DiaryDetail | null | undefined>(undefined);
  const hasExternalData = diaryInfo !== undefined;

  useEffect(() => {
    if (hasExternalData) return;
    (async () => {
      try {
        const data = await diaryService.getByDate(todayDate);
        setDiary(data);
      } catch {
        console.error('Failed to load diary');
        setDiary(null);
      }
    })();
  }, [todayDate, hasExternalData]);

  // Use external data when available, fallback to self-fetched data
  const diaryData = hasExternalData
    ? (diaryInfo ? {
        id: diaryInfo.id,
        status: diaryInfo.status as 'CHATTING' | 'COMPLETED',
        title: diaryInfo.title,
        mood: diaryInfo.mood,
        messages: diaryInfo.last_message_content
          ? [{ id: 'last', content: diaryInfo.last_message_content, role: diaryInfo.last_message_role || 'AI', message_order: 0 }]
          : [],
      } : null)
    : diary;

  const isLoading = hasExternalData ? false : diary === undefined;

  const hour = new Date().getHours();
  const greeting = hour < 5
    ? { text: t('personal.overview.lateNight', "It's late — how was your day?"), icon: <Moon size={20} className="text-indigo-400" /> }
    : hour < 9
    ? { text: t('personal.overview.earlyMorning', 'Fresh morning! How are you feeling?'), icon: <Sunrise size={20} className="text-violet-400" /> }
    : hour < 12
    ? { text: t('personal.overview.goodMorning', 'How are you feeling today?'), icon: <Sun size={20} className="text-amber-400" /> }
    : hour < 18
    ? { text: t('personal.overview.goodAfternoon', "How's your day going?"), icon: <Sunset size={20} className="text-orange-400" /> }
    : { text: t('personal.overview.goodEvening', 'How was your day?'), icon: <Moon size={20} className="text-indigo-400" /> };

  return (
    <WidgetCard
      icon={<BookHeart size={16} className="text-rose-400" />}
      title={t('personal.overview.aiDiary', 'AI Diary')}
      badge={
        diaryData && diaryData.status === 'COMPLETED' ? (
          <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/15 px-1.5 py-0.5 rounded-full">
            {t('personal.overview.done', 'Done')}
          </span>
        ) : diaryData && diaryData.status === 'CHATTING' ? (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded-full">
            {t('personal.overview.inProgress', 'In progress')}
          </span>
        ) : null
      }
      action={diaryData ? <ViewAllButton onClick={onViewAll} label={t('personal.overview.readMore', 'Read more')} /> : undefined}
      delay={0.15}
    >
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
        </div>
      ) : !diaryData ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 md:gap-3 px-4">
          {greeting.icon}
          <div>
            <p className="text-sm md:text-base font-bold text-foreground mb-0.5 md:mb-1">{greeting.text}</p>
            <p className="text-[10px] md:text-[11px] text-slate-500 leading-relaxed hidden md:block">
              {t('personal.overview.diaryPrompt', 'Take a moment to reflect on your day')}
            </p>
          </div>
          <button
            onClick={onViewAll}
            className="mt-1 md:mt-2 flex items-center gap-2 px-4 py-2 md:px-5 md:py-2.5 bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white text-xs md:text-sm font-bold rounded-xl hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all"
          >
            <Sparkles size={14} />
            {t('personal.overview.startDiary', "Start today's diary")}
          </button>
        </div>
      ) : diaryData.status === 'CHATTING' ? (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 space-y-3">
            {diaryData.messages.length > 0 && (
              <div className="bg-white/[0.03] rounded-xl p-3">
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                  {diaryData.messages[diaryData.messages.length - 1].content}
                </p>
                <span className="text-[10px] text-slate-600 mt-1 block">
                  {diaryData.messages[diaryData.messages.length - 1].role === 'AI' ? t('personal.overview.roleAI', 'AI') : t('personal.overview.roleYou', 'You')}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onViewAll}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground/5 border border-foreground/10 text-foreground text-sm font-medium rounded-xl hover:bg-foreground/10 transition-all"
          >
            <BookHeart size={14} />
            {t('personal.overview.continueDiary', 'Continue writing')}
          </button>
        </div>
      ) : (
        <button onClick={onViewAll} className="flex-1 flex flex-col text-left">
          <div className="flex items-center gap-2 mb-3">
            {diaryData.mood && MOODS[diaryData.mood] && (
              <span className="text-2xl">{MOODS[diaryData.mood]}</span>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-foreground truncate">
                {diaryData.title || t('personal.overview.diaryTitle', "Today's diary")}
              </h4>
            </div>
          </div>
          {'content' in diaryData && diaryData.content && (
            <div className="flex-1">
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-5">
                {diaryData.content}
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

// ── Mobile Greeting Header ───────────────────────────────────────────

function MobileGreetingHeader({
  dashboardData,
  onNavigateTab,
}: {
  dashboardData: PersonalDashboardToday | null;
  onNavigateTab: (tab: TabType) => void;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();

  const now = new Date();
  const hour = now.getHours();
  const greetingIcon = hour < 5 ? <Moon size={18} className="text-indigo-400" />
    : hour < 9 ? <Sunrise size={18} className="text-violet-400" />
    : hour < 12 ? <Sun size={18} className="text-amber-400" />
    : hour < 18 ? <Sunset size={18} className="text-orange-400" />
    : <Moon size={18} className="text-indigo-400" />;
  const greetingText = hour < 5
    ? t('personal.mobile.lateNight', "Still Up Late?")
    : hour < 9
    ? t('personal.mobile.earlyMorning', 'Up Early!')
    : hour < 12
    ? t('personal.mobile.goodMorning', 'Good Morning')
    : hour < 18
    ? t('personal.mobile.goodAfternoon', 'Good Afternoon')
    : t('personal.mobile.goodEvening', 'Good Evening');

  const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const userName = currentUser?.name || currentUser?.email?.split('@')[0] || '';

  const habitsDone = dashboardData?.habits_today?.filter(h => h.is_completed).length || 0;
  const habitsTotal = dashboardData?.habits_today?.length || 0;

  // Tasks due today: count done vs total
  const dueTodayTasks = dashboardData?.due_today_tasks || [];
  const dueTodayDone = dueTodayTasks.filter(t => t.status === 'DONE').length;
  const dueTodayTotal = dueTodayTasks.length;

  // AI Diary status
  const diary = dashboardData?.diary_today;
  const MOOD_EMOJI: Record<string, string> = { happy: '😊', calm: '😌', thoughtful: '🤔', tired: '😔', sad: '😢', frustrated: '😠', excited: '🤩', bored: '🥱' };
  const diaryLabel = !diary
    ? t('personal.mobile.diaryNotStarted', 'Not started')
    : diary.status === 'COMPLETED'
    ? t('personal.mobile.diaryDone', 'Done')
    : t('personal.mobile.diaryChatting', 'Writing...');
  const diaryEmoji = diary?.mood ? MOOD_EMOJI[diary.mood] : undefined;

  const habitsRate = habitsTotal > 0 ? habitsDone / habitsTotal : 0;
  const tasksRate = dueTodayTotal > 0 ? dueTodayDone / dueTodayTotal : undefined;
  const diaryRate = !diary ? 0 : diary.status === 'COMPLETED' ? 1 : 0.5;

  // celebrate: visual state (teal, trophy, sparkles) — set when gauge ARRIVES at 100%
  // burstKeys: counter that fires a one-shot confetti each time it increments
  // bounce: temporary scale-up on the card at the moment of celebration
  const [celebrate, setCelebrate] = useState({ habits: false, tasks: false, diary: false });
  const [burstKeys, setBurstKeys] = useState({ habits: 0, tasks: 0, diary: 0 });
  const [bounce, setBounce] = useState({ habits: false, tasks: false, diary: false });

  // Called by gauge bar's onAnimationComplete — fires at the exact moment the bar finishes
  const handleGaugeDone = useCallback((key: 'habits' | 'tasks' | 'diary', rate: number) => {
    if (rate >= 1) {
      setCelebrate(prev => prev[key] ? prev : { ...prev, [key]: true });
      setBurstKeys(prev => ({ ...prev, [key]: prev[key] + 1 }));
      setBounce(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setBounce(prev => ({ ...prev, [key]: false })), 500);
    } else {
      setCelebrate(prev => !prev[key] ? prev : { ...prev, [key]: false });
    }
  }, []);

  const stats = [
    {
      key: 'habits' as const,
      label: t('personal.mobile.habits', 'Habits'),
      value: habitsTotal > 0 ? `${habitsDone}/${habitsTotal}` : '0',
      icon: celebrate.habits
        ? <Trophy size={14} className="text-bridge-secondary" />
        : <Flame size={14} className="text-purple-400" />,
      rate: habitsRate,
      onTap: () => onNavigateTab('tasks'),
    },
    {
      key: 'tasks' as const,
      label: t('personal.mobile.tasks', 'Tasks'),
      value: dueTodayTotal > 0 ? `${dueTodayDone}/${dueTodayTotal}` : '0',
      icon: celebrate.tasks
        ? <Trophy size={14} className="text-bridge-secondary" />
        : <ListTodo size={14} className="text-bridge-accent" />,
      rate: tasksRate,
      onTap: () => onNavigateTab('tasks'),
    },
    {
      key: 'diary' as const,
      label: t('personal.mobile.diary', 'AI Diary'),
      value: diaryEmoji || (diary ? (diary.status === 'COMPLETED' ? '✅' : '✍️') : '—'),
      sub: diaryLabel,
      icon: celebrate.diary
        ? <Trophy size={14} className="text-bridge-secondary" />
        : <BookHeart size={14} className="text-rose-400" />,
      rate: diaryRate,
      onTap: () => onNavigateTab('diary'),
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Greeting */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-bridge-secondary/20 to-bridge-accent/20 border border-foreground/10 flex items-center justify-center">
          {greetingIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold text-foreground">{greetingText}</span>
            {userName && <span className="text-[13px] text-slate-400 truncate">{userName}</span>}
          </div>
          <span className="text-[11px] text-slate-500">{dateStr}</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex gap-2">
        {stats.map((stat) => {
          const isCelebrating = celebrate[stat.key];
          const isBouncing = bounce[stat.key];
          const bk = burstKeys[stat.key];
          return (
            <motion.button
              key={stat.label}
              onClick={stat.onTap}
              animate={isBouncing
                ? { scale: [1, 1.07, 1], borderColor: 'rgba(45,212,191,0.5)' }
                : isCelebrating
                ? { scale: 1, borderColor: ['rgba(45,212,191,0.3)', 'rgba(45,212,191,0.15)', 'rgba(45,212,191,0.3)'] }
                : { scale: 1 }
              }
              transition={isBouncing
                ? { scale: { duration: 0.4, ease: 'easeOut' } }
                : isCelebrating
                ? { duration: 3, repeat: Infinity, ease: 'easeInOut' }
                : {}
              }
              className={`flex-1 rounded-xl border p-3 active:bg-foreground/[0.06] text-left relative overflow-hidden transition-colors duration-500 ${
                isCelebrating
                  ? 'border-bridge-secondary/30 bg-gradient-to-br from-bridge-secondary/[0.08] to-bridge-secondary/[0.02]'
                  : 'border-foreground/[0.08] bg-foreground/[0.03]'
              }`}
            >
              <CompletionSparkles active={isCelebrating} />
              <CompletionBurst triggerKey={bk} />
              <div className="relative z-[1]">
                <div className="flex items-center gap-1.5 mb-1.5">
                  {isCelebrating ? (
                    <motion.div
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 12 }}
                    >
                      {stat.icon}
                    </motion.div>
                  ) : stat.icon}
                  <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-500 ${
                    isCelebrating ? 'text-bridge-secondary' : 'text-slate-500'
                  }`}>{stat.label}</span>
                  {isCelebrating && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 15 }}
                      className="text-[8px]"
                    >
                      ✨
                    </motion.span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg font-bold transition-colors duration-500 ${
                    isCelebrating ? 'text-bridge-secondary' : 'text-foreground'
                  }`}>{stat.value}</span>
                  {stat.sub && <span className={`text-[10px] font-medium transition-colors duration-500 ${
                    isCelebrating ? 'text-bridge-secondary/70' : 'text-slate-400'
                  }`}>{stat.sub}</span>}
                </div>
                {stat.rate !== undefined && stat.rate >= 0 && (
                  <div className="mt-1.5 h-1 rounded-full bg-foreground/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: isCelebrating
                          ? '#2DD4BF'
                          : stat.key === 'tasks' ? '#6366F1'
                          : stat.key === 'diary' ? '#D494CE'
                          : '#8B5CF6',
                        ...(isCelebrating ? { boxShadow: '0 0 8px rgba(45,212,191,0.5)' } : {}),
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round(stat.rate * 100)}%` }}
                      transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
                      onAnimationComplete={() => {
                        handleGaugeDone(stat.key, stat.rate!);
                      }}
                    />
                  </div>
                )}
              </div>
              {/* Subtle glow behind the card */}
              {isCelebrating && (
                <motion.div
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.03, 0.08, 0.03] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ background: 'radial-gradient(ellipse at center, rgba(45,212,191,0.3) 0%, transparent 70%)' }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Mobile Quick Habits Strip ────────────────────────────────────────

function MobileQuickHabits({
  dashboardData,
  onNavigateTab,
  onHabitToggle,
}: {
  dashboardData: PersonalDashboardToday | null;
  onNavigateTab: (tab: TabType) => void;
  onHabitToggle: (habitId: string, isCompleted: boolean) => void;
}) {
  const { t } = useTranslation();
  const [habits, setHabits] = useState<HabitTodayItem[]>([]);
  const [checkInConfirm, setCheckInConfirm] = useState<{ id: string; name: string; icon?: string; streak?: number; isUndo: boolean } | null>(null);

  useEffect(() => {
    if (dashboardData?.habits_today) {
      setHabits(dashboardData.habits_today);
    }
  }, [dashboardData]);

  const handleCheckIn = async (habitId: string, isUndo?: boolean) => {
    const revert = !!isUndo;
    // Optimistic: update local strip
    setHabits(prev => prev.map(h =>
      h.habit_id === habitId ? { ...h, is_completed: !isUndo } : h
    ));
    // Optimistic: update parent dashboardData (header stats)
    onHabitToggle(habitId, !isUndo);
    try {
      const updated = await personalHabitAPI.checkIn(habitId, { log_date: getTodayDateString() });
      setHabits(prev => prev.map(h => h.habit_id === habitId ? updated : h));
      onHabitToggle(habitId, updated.is_completed);
    } catch {
      setHabits(prev => prev.map(h =>
        h.habit_id === habitId ? { ...h, is_completed: revert } : h
      ));
      onHabitToggle(habitId, revert);
    }
  };

  const completedCount = habits.filter(h => h.is_completed).length;
  const totalCount = habits.length;
  const allDone = totalCount > 0 && completedCount >= totalCount;

  if (!dashboardData || habits.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="rounded-2xl border border-foreground/[0.08] overflow-hidden"
      >
        <div className="px-3 py-2 bg-foreground/[0.06] border-b border-foreground/[0.08]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame size={16} className="text-purple-400" />
              <h3 className="text-[13px] font-bold text-foreground">{t('personal.mobile.habitsToday', 'Habits')}</h3>
            </div>
            <button
              onClick={() => onNavigateTab('tasks')}
              className="flex items-center gap-1 text-[11px] font-bold text-purple-400"
            >
              <Plus size={12} />
              {t('personal.mobile.addHabit', 'Add')}
            </button>
          </div>
        </div>
        <div className="bg-bridge-dark p-3 flex items-center justify-center">
          <p className="text-xs text-slate-500">{t('personal.overview.noHabits', 'No habits set up yet')}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.3 }}
      className={`rounded-2xl border overflow-hidden relative ${
        allDone
          ? 'border-bridge-secondary/30'
          : 'border-foreground/[0.08]'
      }`}
    >
      {allDone && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none z-[1]"
          animate={{ opacity: [0.02, 0.06, 0.02] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: 'radial-gradient(ellipse at top center, rgba(45,212,191,0.25) 0%, transparent 60%)' }}
        />
      )}
      <div className={`px-3 py-2 border-b relative z-[2] ${
        allDone
          ? 'bg-bridge-secondary/[0.06] border-bridge-secondary/10'
          : 'bg-foreground/[0.06] border-foreground/[0.08]'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {allDone ? (
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 12 }}
              >
                <Trophy size={16} className="text-bridge-secondary" />
              </motion.div>
            ) : (
              <Flame size={16} className="text-purple-400" />
            )}
            <h3 className={`text-[13px] font-bold ${
              allDone ? 'text-bridge-secondary' : 'text-foreground'
            }`}>{t('personal.mobile.habitsToday', 'Habits')}</h3>
            {totalCount > 0 && (
              <motion.span
                layout
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  allDone
                    ? 'text-bridge-secondary bg-bridge-secondary/15'
                    : 'text-purple-400 bg-purple-400/15'
                }`}
              >
                {allDone ? '✨ ' : ''}{completedCount}/{totalCount}
              </motion.span>
            )}
          </div>
          <ViewAllButton onClick={() => onNavigateTab('tasks')} />
        </div>
      </div>
      <div className="bg-bridge-dark p-3">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {habits.map((habit, idx) => {
          const isCompleted = habit.is_completed;
          const color = habit.color || '#8B5CF6';
          return (
            <motion.button
              key={habit.habit_id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * idx }}
              onClick={() => {
                if (isCompleted) {
                  setCheckInConfirm({
                    id: habit.habit_id,
                    name: habit.title,
                    icon: habit.icon || undefined,
                    streak: habit.current_streak,
                    isUndo: true,
                  });
                } else {
                  handleCheckIn(habit.habit_id);
                }
              }}
              className={`flex-shrink-0 flex flex-col items-center gap-1.5 w-[68px] py-2.5 rounded-xl border transition-all active:scale-95 ${
                isCompleted
                  ? 'border-bridge-secondary/30 bg-bridge-secondary/[0.08]'
                  : 'border-foreground/[0.08] bg-foreground/[0.03]'
              }`}
            >
              <div className="relative">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-base transition-all ${
                    isCompleted
                      ? 'ring-2 ring-bridge-secondary/50'
                      : 'ring-2 ring-transparent'
                  }`}
                  style={{
                    background: isCompleted
                      ? 'linear-gradient(135deg, rgba(45,212,191,0.2), rgba(45,212,191,0.08))'
                      : `linear-gradient(135deg, ${color}25, ${color}10)`,
                  }}
                >
                  {habit.icon ? (
                    <span className="text-lg">{habit.icon}</span>
                  ) : (
                    <Flame size={16} style={{ color }} />
                  )}
                </div>
                {isCompleted && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-bridge-secondary rounded-full flex items-center justify-center"
                  >
                    <Check size={10} className="text-white" strokeWidth={3} />
                  </motion.div>
                )}
                {habit.current_streak > 0 && (
                  <div className="absolute -bottom-1 -right-1 min-w-[16px] h-[14px] bg-orange-500 rounded-full flex items-center justify-center px-0.5 shadow-sm">
                    <span className="text-[8px] font-bold text-white leading-none">{habit.current_streak}</span>
                  </div>
                )}
              </div>
              <span className={`text-[10px] font-medium truncate w-full text-center px-1 ${
                isCompleted ? 'text-bridge-secondary' : 'text-foreground'
              }`}>
                {habit.title}
              </span>
            </motion.button>
          );
        })}
      </div>
      </div>

      <CheckInConfirmModal
        open={!!checkInConfirm}
        habitName={checkInConfirm?.name || ''}
        habitIcon={checkInConfirm?.icon}
        streakCount={checkInConfirm?.streak}
        isUndo={checkInConfirm?.isUndo}
        onConfirm={() => {
          if (checkInConfirm) {
            handleCheckIn(checkInConfirm.id, checkInConfirm.isUndo);
            setCheckInConfirm(null);
          }
        }}
        onCancel={() => setCheckInConfirm(null)}
      />
    </motion.div>
  );
}

// ── Main Overview Component ──────────────────────────────────────────

export function PersonalOverview({ onNavigateTab, onRefreshTasks }: PersonalOverviewProps) {
  const todayDate = getTodayDateString();
  const [overviewData, setOverviewData] = useState<PersonalOverviewData | null>(null);

  // Single fetch for all overview data
  const loadOverview = useCallback(async () => {
    try {
      const data = await personalDashboardAPI.getOverview(todayDate);
      setOverviewData(data);
    } catch {
      console.error('Failed to load overview data');
    }
  }, [todayDate]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const refreshOverview = useCallback(() => {
    loadOverview();
    onRefreshTasks?.();
  }, [loadOverview, onRefreshTasks]);

  // Derive dashboardData for mobile components (MobileGreetingHeader, MobileQuickHabits)
  const dashboardData: PersonalDashboardToday | null = overviewData ? {
    due_today_tasks: overviewData.due_today_tasks,
    in_progress_tasks: overviewData.in_progress_tasks,
    personal_events: overviewData.today_events,
    habits_today: overviewData.habits_today,
    task_completion_rate: overviewData.task_completion_rate,
    habit_completion_rate: overviewData.habit_completion_rate,
    active_task_count: overviewData.active_task_count,
    completed_today_count: overviewData.completed_today_count,
    diary_today: overviewData.diary_today,
  } : null;

  // Optimistically update overviewData when habit is toggled from the quick strip
  const handleHabitToggle = useCallback((habitId: string, isCompleted: boolean) => {
    setOverviewData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        habits_today: prev.habits_today.map(h =>
          h.habit_id === habitId ? { ...h, is_completed: isCompleted } : h
        ),
      };
    });
  }, []);

  // Optimistically update overviewData when task is toggled from deadlines widget
  const handleTaskToggle = useCallback((taskId: string, isDone: boolean) => {
    setOverviewData(prev => {
      if (!prev) return prev;
      const newStatus = isDone ? 'DONE' : 'TODO';
      return {
        ...prev,
        due_today_tasks: prev.due_today_tasks.map(t =>
          t.id === taskId ? { ...t, status: newStatus } : t
        ),
      };
    });
  }, []);

  return (
    <div className="h-full overflow-auto p-3 md:p-6">
      <div className="max-w-[1800px] mx-auto flex flex-col gap-2.5 md:gap-5">
        {/* Mobile Greeting Header + Stats */}
        <div className="md:hidden">
          <MobileGreetingHeader dashboardData={dashboardData} onNavigateTab={onNavigateTab} />
        </div>

        {/* Mobile Quick Habits Strip */}
        <div className="md:hidden">
          <MobileQuickHabits dashboardData={dashboardData} onNavigateTab={onNavigateTab} onHabitToggle={handleHabitToggle} />
        </div>

        {/* 2x2 Widget grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2.5 md:gap-5 flex-1">
          <TodayScheduleWidget
            todayDate={todayDate}
            onViewAll={() => onNavigateTab('schedule')}
            events={overviewData?.today_events}
          />
          <UpcomingDeadlinesWidget
            todayDate={todayDate}
            onViewAll={() => onNavigateTab('tasks')}
            onTaskToggle={handleTaskToggle}
            allTasks={overviewData?.all_tasks}
            onRefresh={refreshOverview}
          />
          {/* Habits widget: hidden on mobile (quick strip replaces it), visible on desktop */}
          <div className="hidden md:block">
            <HabitsTodayWidget
              onViewAll={() => onNavigateTab('tasks')}
              allHabits={overviewData?.all_habits}
              todayHabits={overviewData?.habits_today}
              weeklyMatrix={overviewData?.weekly_matrix}
              onRefresh={refreshOverview}
            />
          </div>
          <DiaryWidget
            todayDate={todayDate}
            onViewAll={() => onNavigateTab('diary')}
            diaryInfo={overviewData ? overviewData.diary_today : undefined}
          />
        </div>

        {/* Celebrations (conditional - only shows when celebrations exist) */}
        <CelebrationsWidget date={todayDate} />

        {/* Board Tasks */}
        <BoardTasksWidget date={todayDate} />
      </div>
    </div>
  );
}

/* ================================================================
   Create Habit Modal for Overview (Lightweight version)
   ================================================================ */

const OV_HABIT_COLORS = FEATURE_COLORS;

const OV_HABIT_ICONS = [
  '🏃', '📚', '💧', '🧘', '💪', '🎯', '✍️', '🎵',
  '🧠', '🌿', '💊', '🍎', '😴', '🚶', '🧹', '📵',
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
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [showMore, setShowMore] = useState(false);

  const [icon, setIcon] = useState('');
  const [color, setColor] = useState(OV_HABIT_COLORS[0]);
  const [description, setDescription] = useState('');

  const isValid = title.trim().length > 0 && selectedDays.length > 0;

  const toggleDay = (day: number) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  /** Derive frequency_type from selected days */
  const deriveFrequency = (days: number[]): { type: HabitFrequency; days?: string } => {
    const sorted = [...days].sort((a, b) => a - b);
    if (sorted.length === 7) return { type: 'DAILY' };
    const weekdays = [1, 2, 3, 4, 5];
    const weekend = [0, 6];
    if (sorted.length === 5 && weekdays.every(d => sorted.includes(d))) return { type: 'WEEKDAY' };
    if (sorted.length === 2 && weekend.every(d => sorted.includes(d))) return { type: 'WEEKEND' };
    return { type: 'CUSTOM', days: sorted.join(',') };
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const freq = deriveFrequency(selectedDays);
    onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      icon: icon || undefined,
      color,
      frequency_type: freq.type,
      frequency_days: freq.days,
      target_count: 1,
    });
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md p-0 overflow-hidden border-foreground/[0.08]">
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
            placeholder={t('personal.habit.habitPlaceholder', 'e.g. Morning Run, Read 10 pages')}
            className="flex-1 min-w-0 bg-transparent text-sm font-bold text-foreground placeholder-slate-500 outline-none"
            autoFocus
          />
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 pb-5 space-y-3">
          {/* Day Selector */}
          <div className="flex gap-1.5">
            {OV_DAY_CHIPS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => toggleDay(value)}
                className="flex-1 py-2 text-xs font-bold rounded-lg transition-all"
                style={selectedDays.includes(value)
                  ? { backgroundColor: color, color: '#fff' }
                  : undefined}
                {...(!selectedDays.includes(value) && {
                  className: 'flex-1 py-2 text-xs font-bold rounded-lg transition-all bg-foreground/5 text-slate-400 hover:bg-foreground/10',
                })}
              >
                {label}
              </button>
            ))}
          </div>
          {selectedDays.length === 0 && (
            <p className="text-xs text-amber-400">
              {t('personal.habit.selectDay', 'Select at least one day')}
            </p>
          )}

          {/* More Options Toggle */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-muted-foreground transition-colors"
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
                className="space-y-3 overflow-hidden"
              >
                {/* Icon Picker */}
                <div className="flex flex-wrap gap-1.5">
                  {OV_HABIT_ICONS.map((emoji) => (
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
                <ColorPickerPopover
                  colors={OV_HABIT_COLORS}
                  selectedColor={color}
                  onColorChange={setColor}
                  triggerShape="circle"
                  showCustomColor={false}
                />

                {/* Description */}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('personal.habit.descPlaceholder', 'Why this habit matters to you')}
                  rows={2}
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg p-3 text-sm text-muted-foreground placeholder-slate-500 outline-none resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
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
              {t('personal.habit.addHabit', 'Add Habit')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}
