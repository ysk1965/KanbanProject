import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Check, Trash2, Flag, Calendar, ChevronDown,
  Flame, CalendarClock, Zap, Archive, X, Pencil, Repeat,
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { MotionModal } from '../ui/MotionModal';
import { personalTaskAPI, personalHabitAPI } from '../../utils/api';
import { PersonalTask, PersonalTaskPriority, PersonalHabit, HabitTodayItem, HabitFrequency, HabitWeeklyMatrix } from '../../types';
import { getDDay, getTodayDateString, type DdayUrgency } from '../../utils/dateUtils';
import { startOfDay, parseISO, addDays, format } from 'date-fns';
import { CheckInConfirmModal, TaskCompleteConfirmModal, HabitFormModal, DeleteConfirmModal, type HabitFormData } from './PersonalHabits';

// ── Types ─────────────────────────────────────────────────────

interface PersonalTaskBoardProps {
  tasks: PersonalTask[];
  onRefresh: () => void;
  onOptimisticUpdate: (taskId: string, updates: Partial<PersonalTask>) => void;
}

type Quadrant = 'q1' | 'q2' | 'q3' | 'q4';

// ── Constants ─────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<PersonalTaskPriority, { color: string; dot: string }> = {
  MEDIUM: { color: 'text-amber-400',  dot: 'bg-amber-400' },
  HIGH:   { color: 'text-orange-500', dot: 'bg-orange-500' },
  URGENT: { color: 'text-red-500',    dot: 'bg-red-500' },
};

const PRIORITY_LABEL_KEYS: Record<PersonalTaskPriority, string> = {
  MEDIUM: 'personal.tasks.priorityMedium',
  HIGH:   'personal.tasks.priorityHigh',
  URGENT: 'personal.tasks.priorityUrgent',
};

const QUADRANT_CONFIG: Record<Quadrant, {
  icon: React.ElementType;
  color: string; border: string; bg: string; headerBg: string;
  dropBorder: string;
}> = {
  q1: {
    icon: Flame,
    color: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/[0.03]',
    headerBg: 'bg-red-500/10', dropBorder: 'border-red-400/50',
  },
  q2: {
    icon: CalendarClock,
    color: 'text-bridge-accent', border: 'border-bridge-accent/20', bg: 'bg-bridge-accent/[0.03]',
    headerBg: 'bg-bridge-accent/10', dropBorder: 'border-bridge-accent/50',
  },
  q3: {
    icon: Zap,
    color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/[0.03]',
    headerBg: 'bg-amber-500/10', dropBorder: 'border-amber-400/50',
  },
  q4: {
    icon: Archive,
    color: 'text-slate-400', border: 'border-foreground/10', bg: 'bg-white/[0.02]',
    headerBg: 'bg-foreground/5', dropBorder: 'border-slate-400/50',
  },
};

const QUADRANT_LABEL_KEYS: Record<Quadrant, { label: string; sublabel: string }> = {
  q1: { label: 'personal.tasks.q1Label', sublabel: 'personal.tasks.q1Sublabel' },
  q2: { label: 'personal.tasks.q2Label', sublabel: 'personal.tasks.q2Sublabel' },
  q3: { label: 'personal.tasks.q3Label', sublabel: 'personal.tasks.q3Sublabel' },
  q4: { label: 'personal.tasks.q4Label', sublabel: 'personal.tasks.q4Sublabel' },
};

const DDAY_STYLES: Record<DdayUrgency, string> = {
  overdue: 'bg-red-500/15 text-red-400',
  today:   'bg-orange-500/15 text-orange-400',
  soon:    'bg-amber-500/15 text-amber-400',
  normal:  'bg-foreground/5 text-slate-400',
  none:    '',
};

// ── Helpers ───────────────────────────────────────────────────

const URGENT_DAYS = 3;

function getUrgentDeadline(): Date {
  return addDays(startOfDay(new Date()), URGENT_DAYS);
}

function isTaskUrgent(dueDate: string | null): boolean {
  if (!dueDate) return true;
  const due = startOfDay(parseISO(dueDate));
  return due <= getUrgentDeadline();
}

function getNotUrgentDateString(): string {
  return format(addDays(startOfDay(new Date()), URGENT_DAYS + 1), 'yyyy-MM-dd');
}

function getQuadrant(task: PersonalTask): Quadrant {
  const isImportant = task.priority === 'HIGH' || task.priority === 'URGENT';
  const urgent = isTaskUrgent(task.due_date);
  if (isImportant && urgent) return 'q1';
  if (isImportant) return 'q2';
  if (urgent) return 'q3';
  return 'q4';
}

// ── Quick Add: Habit day chips & frequency helper ────────────

const HABIT_DAY_CHIPS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
];

const HABIT_COLORS_INLINE = [
  '#8B5CF6', '#6366F1', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

function deriveFrequency(days: number[]): { type: HabitFrequency; days?: string } {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return { type: 'DAILY' };
  const weekdays = [1, 2, 3, 4, 5];
  const weekend = [0, 6];
  if (sorted.length === 5 && weekdays.every(d => sorted.includes(d))) return { type: 'WEEKDAY' };
  if (sorted.length === 2 && weekend.every(d => sorted.includes(d))) return { type: 'WEEKEND' };
  return { type: 'CUSTOM', days: sorted.join(',') };
}

// ── Habits Horizontal Bar (all active habits) ────────────────

const DAY_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_LABELS_TWO = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_DISPLAY_ORDER = [0, 1, 2, 3, 4, 5, 6]; // Sun → Sat

function getScheduledDays(frequencyType: HabitFrequency, frequencyDays?: string): Set<number> {
  switch (frequencyType) {
    case 'DAILY': return new Set([0, 1, 2, 3, 4, 5, 6]);
    case 'WEEKDAY': return new Set([1, 2, 3, 4, 5]);
    case 'WEEKEND': return new Set([0, 6]);
    case 'CUSTOM': return new Set(frequencyDays ? frequencyDays.split(',').map(Number) : []);
    default: return new Set([0, 1, 2, 3, 4, 5, 6]);
  }
}

function AllHabitsBar({ onNavigateHabits, refreshKey }: { onNavigateHabits?: () => void; refreshKey?: number }) {
  const { t } = useTranslation();
  const [allHabits, setAllHabits] = useState<PersonalHabit[]>([]);
  const [todayHabits, setTodayHabits] = useState<HabitTodayItem[]>([]);
  const [weeklyMatrix, setWeeklyMatrix] = useState<HabitWeeklyMatrix | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkInConfirm, setCheckInConfirm] = useState<{ id: string; isUndo: boolean; isNonToday?: boolean } | null>(null);
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

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
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
  }, []);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  // Map today's completion status by habit_id
  const todayStatusMap = useMemo(() => {
    const map = new Map<string, HabitTodayItem>();
    todayHabits.forEach(h => map.set(h.habit_id, h));
    return map;
  }, [todayHabits]);

  const completedCount = todayHabits.filter(h => h.is_completed).length;

  const handleCheckIn = async (habitId: string, isUndo?: boolean) => {
    const revertTo = !!isUndo;
    const todayDate = getTodayDateString();
    const isInTodayHabits = todayHabits.some(h => h.habit_id === habitId);

    // Optimistic update for todayHabits (only if habit is scheduled today)
    if (isInTodayHabits) {
      setTodayHabits(prev => prev.map(h =>
        h.habit_id === habitId ? { ...h, is_completed: !isUndo } : h
      ));
    }
    // Optimistic update for weekly matrix (works for all habits)
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
      if (isInTodayHabits) {
        setTodayHabits(prev => prev.map(h => h.habit_id === habitId ? updated : h));
      }
    } catch {
      if (isInTodayHabits) {
        setTodayHabits(prev => prev.map(h =>
          h.habit_id === habitId ? { ...h, is_completed: revertTo } : h
        ));
      }
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
    }
  };

  const handleUpdateHabit = async (habitId: string, data: HabitFormData) => {
    try {
      await personalHabitAPI.update(habitId, data);
      setEditHabit(null);
      await loadData();
    } catch (err) {
      console.error('Failed to update habit:', err);
    }
  };

  const handleDeleteHabit = async (habitId: string) => {
    try {
      await personalHabitAPI.delete(habitId);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      console.error('Failed to delete habit:', err);
    }
  };

  if (isLoading || allHabits.length === 0) return null;

  return (
    <>
      <div className="rounded-xl border border-foreground/[0.08] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-foreground/[0.04] border-b border-foreground/[0.06]">
          <Flame size={13} className="text-purple-400" />
          <span className="text-xs font-bold text-foreground">
            {t('personal.habit.habits', '습관 관리')}
          </span>
          <span className="text-[10px] font-bold text-purple-400 bg-purple-400/10 px-1.5 py-0.5 rounded-full">
            {completedCount}/{todayHabits.length}
          </span>
          <div className="flex-1" />
          {onNavigateHabits && (
            <button
              onClick={onNavigateHabits}
              className="text-[11px] text-slate-500 hover:text-bridge-secondary transition-colors"
            >
              {t('personal.overview.viewAll', 'View all')} →
            </button>
          )}
        </div>

        {/* Horizontal scroll cards */}
        <div className="flex gap-2.5 p-3 overflow-x-auto custom-scrollbar">
          {[...allHabits].sort((a, b) => {
            const aScheduled = getScheduledDays(a.frequency_type, a.frequency_days).has(todayDow);
            const bScheduled = getScheduledDays(b.frequency_type, b.frequency_days).has(todayDow);
            if (aScheduled === bScheduled) return 0;
            return aScheduled ? -1 : 1;
          }).map((habit, idx) => {
            const todayStatus = todayStatusMap.get(habit.id);
            const scheduledDays = getScheduledDays(habit.frequency_type, habit.frequency_days);
            const isScheduledToday = scheduledDays.has(todayDow);
            const isCompleted = todayStatus?.is_completed ?? weeklyCompletionMap.get(habit.id)?.has(todayDow) ?? false;
            const color = habit.color || '#8B5CF6';
            const streak = todayStatus?.current_streak ?? habit.best_streak;
            const weeklyCompleted = todayStatus?.weekly_completed ?? 0;
            const weeklyTarget = todayStatus?.weekly_target ?? 0;

            return (
              <motion.div
                key={habit.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={`flex-shrink-0 w-[164px] md:w-[188px] rounded-xl border p-3.5 text-left relative group transition-colors cursor-pointer ${
                  isScheduledToday
                    ? 'bg-foreground/[0.03] hover:bg-foreground/[0.06]'
                    : 'border-dashed border-foreground/[0.06] bg-foreground/[0.02] hover:bg-foreground/[0.04] opacity-60 hover:opacity-80'
                }`}
                style={isScheduledToday ? { borderColor: `${color}40` } : undefined}
                onClick={() => setEditHabit(habit)}
              >
                {/* Top progress gauge bar */}
                <div className="absolute top-0 left-3 right-3 h-[2.5px] rounded-b-full overflow-hidden"
                  style={{ backgroundColor: `${color}22`, opacity: isScheduledToday ? 1 : 0.4 }}
                >
                  <motion.div
                    className="h-full rounded-b-full"
                    initial={{ width: 0 }}
                    animate={{ width: weeklyTarget > 0 ? `${Math.min((weeklyCompleted / weeklyTarget) * 100, 100)}%` : '100%' }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{ backgroundColor: weeklyCompleted >= weeklyTarget ? '#2DD4BF' : color }}
                  />
                </div>

                  {/* Icon + title + check */}
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCompleted) {
                          setCheckInConfirm({
                            id: habit.id,
                            isUndo: true,
                          });
                        } else if (!isScheduledToday) {
                          setCheckInConfirm({
                            id: habit.id,
                            isUndo: false,
                            isNonToday: true,
                          });
                        } else {
                          handleCheckIn(habit.id);
                        }
                      }}
                      className="flex-shrink-0"
                    >
                      <motion.div
                        className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${
                          isCompleted
                            ? 'bg-bridge-secondary border-bridge-secondary'
                            : isScheduledToday
                            ? 'border-foreground/20 group-hover:border-purple-400/50'
                            : 'border-dashed border-foreground/15 group-hover:border-blue-400/50'
                        }`}
                        animate={isCompleted ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ duration: 0.3 }}
                      >
                        {isCompleted && <Check size={10} className="text-white" />}
                      </motion.div>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-bold truncate leading-tight ${
                        isCompleted ? 'text-slate-500 line-through'
                          : !isScheduledToday ? 'text-slate-500'
                          : 'text-foreground'
                      }`}>
                        {habit.icon && <span className="mr-1">{habit.icon}</span>}
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
                  <div className="flex gap-[3px]">
                    {DAY_DISPLAY_ORDER.map(dayIdx => {
                      const isScheduled = scheduledDays.has(dayIdx);
                      const isTodayDay = dayIdx === todayDow;
                      const isDayCompleted = weeklyCompletionMap.get(habit.id)?.has(dayIdx) ?? false;
                      return (
                        <div key={dayIdx} className="flex flex-col items-center gap-1 flex-1">
                          <span className={`text-[9px] leading-none ${
                            dayIdx === 0
                              ? isTodayDay && isScheduled
                                ? 'font-extrabold text-red-400'
                                : isTodayDay
                                ? 'font-bold text-red-400/70'
                                : 'font-medium text-red-400/60'
                              : isTodayDay && isScheduled
                              ? 'font-extrabold text-purple-300'
                              : isTodayDay
                              ? 'font-bold text-slate-400'
                              : isScheduled
                              ? 'font-medium text-slate-400'
                              : 'text-slate-600/30'
                          }`}>
                            {DAY_LABELS_SHORT[dayIdx]}
                          </span>
                          {isDayCompleted ? (
                            <div
                              className={`rounded-full flex items-center justify-center transition-all ${
                                isTodayDay
                                  ? 'w-3 h-3 ring-[1.5px] ring-purple-400/60'
                                  : 'w-2.5 h-2.5'
                              }`}
                              style={{ backgroundColor: color }}
                            >
                              <Check size={isTodayDay ? 8 : 7} className="text-white" strokeWidth={3} />
                            </div>
                          ) : (
                            <div
                              className={`rounded-full transition-all ${
                                isTodayDay && isScheduled
                                  ? 'w-3 h-3 ring-[1.5px] ring-purple-400/60'
                                  : isScheduled
                                  ? 'w-2 h-2'
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

      {/* Check-in Confirm Modal */}
      <CheckInConfirmModal
        open={!!checkInConfirm}
        habitName={checkInConfirm ? (allHabits.find(h => h.id === checkInConfirm.id)?.title || '') : ''}
        habitIcon={checkInConfirm ? allHabits.find(h => h.id === checkInConfirm.id)?.icon : undefined}
        streakCount={checkInConfirm ? todayStatusMap.get(checkInConfirm.id)?.current_streak : undefined}
        isUndo={checkInConfirm?.isUndo}
        isNonToday={checkInConfirm?.isNonToday}
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
    </>
  );
}

// ── Main Component ────────────────────────────────────────────

export function PersonalTaskBoard({ tasks, onRefresh, onOptimisticUpdate }: PersonalTaskBoardProps) {
  const { t } = useTranslation();
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverQuadrant, setDragOverQuadrant] = useState<Quadrant | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number | null>(null);

  // Quick add
  const [captureType, setCaptureType] = useState<'task' | 'habit'>('task');
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState(getTodayDateString());
  const [newPriority, setNewPriority] = useState<PersonalTaskPriority>('MEDIUM');
  const [isAddFocused, setIsAddFocused] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  // Habit quick add fields
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [habitColor, setHabitColor] = useState(HABIT_COLORS_INLINE[0]);
  const [habitRefreshKey, setHabitRefreshKey] = useState(0);

  const [taskConfirm, setTaskConfirm] = useState<{ id: string; title: string; isDone: boolean } | null>(null);

  // Restore scroll position after data refresh
  useEffect(() => {
    if (savedScrollTop.current != null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = savedScrollTop.current;
      savedScrollTop.current = null;
    }
  }, [tasks]);

  // ── Filtered lists ──
  const todayDate = getTodayDateString();
  const activeTasks = useMemo(
    () => tasks.filter(t => t.status !== 'DONE' && t.status !== 'ARCHIVED'),
    [tasks],
  );
  const completedTasks = useMemo(
    () => tasks
      .filter(t => t.status === 'DONE')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
    [tasks],
  );
  // Today's completed tasks → shown inline in quadrants (exclude overdue ones)
  const todayCompletedTasks = useMemo(
    () => completedTasks.filter(t => {
      if (!t.completed_at) return false;
      if (t.due_date && t.due_date < todayDate) return false;
      return format(new Date(t.completed_at), 'yyyy-MM-dd') === todayDate;
    }),
    [completedTasks, todayDate],
  );
  // Past completed tasks → only shown in modal
  const pastCompletedTasks = useMemo(
    () => completedTasks.filter(t => {
      if (!t.completed_at) return true;
      return format(new Date(t.completed_at), 'yyyy-MM-dd') !== todayDate;
    }),
    [completedTasks, todayDate],
  );

  // ── Group by quadrant ──
  const taskQuadrants = useMemo(() => {
    const result: Record<Quadrant, PersonalTask[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const task of activeTasks) {
      result[getQuadrant(task)].push(task);
    }
    for (const list of Object.values(result)) {
      list.sort((a, b) => {
        const po = { URGENT: 3, HIGH: 2, MEDIUM: 1 };
        const pd = (po[b.priority] ?? 0) - (po[a.priority] ?? 0);
        if (pd !== 0) return pd;
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return a.position - b.position;
      });
    }
    // Append today's completed tasks at the end of each quadrant
    for (const task of todayCompletedTasks) {
      result[getQuadrant(task)].push(task);
    }
    return result;
  }, [activeTasks, todayCompletedTasks]);

  // ── Task Handlers ──
  const handleQuickAdd = async () => {
    if (captureType === 'habit') return handleQuickAddHabit();
    if (!newTitle.trim()) return;
    try {
      await personalTaskAPI.create({
        title: newTitle.trim(),
        due_date: newDueDate || getTodayDateString(),
        priority: newPriority,
      });
      setNewTitle('');
      setNewDueDate(getTodayDateString());
      setNewPriority('MEDIUM');
      onRefresh();
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleQuickAddHabit = async () => {
    if (!newTitle.trim() || selectedDays.length === 0) return;
    try {
      const freq = deriveFrequency(selectedDays);
      await personalHabitAPI.create({
        title: newTitle.trim(),
        frequency_type: freq.type,
        frequency_days: freq.days,
        color: habitColor,
      });
      setNewTitle('');
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
      setHabitColor(HABIT_COLORS_INLINE[0]);
      setHabitRefreshKey(k => k + 1);
    } catch (error) {
      console.error('Failed to create habit:', error);
    }
  };

  const handleToggleComplete = async (task: PersonalTask) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    // Optimistic update — no full refresh
    onOptimisticUpdate(task.id, { status: newStatus });
    try {
      await personalTaskAPI.updateStatus(task.id, newStatus);
    } catch (error) {
      console.error('Failed to toggle task:', error);
      // Revert on failure
      onOptimisticUpdate(task.id, { status: task.status });
    }
  };

  const requestTaskToggle = (task: PersonalTask) => {
    if (task.status === 'DONE') {
      setTaskConfirm({ id: task.id, title: task.title, isDone: true });
    } else {
      handleToggleComplete(task);
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await personalTaskAPI.delete(taskId);
      onRefresh();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleUpdate = useCallback(async (taskId: string, data: {
    title?: string;
    due_date?: string | null;
    priority?: PersonalTaskPriority;
    description?: string;
  }) => {
    try {
      await personalTaskAPI.update(taskId, data);
      onRefresh();
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  }, [onRefresh]);

  // ── DnD handlers ──
  const handleDragStart = useCallback((taskId: string) => {
    setDraggedTaskId(taskId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedTaskId(null);
    setDragOverQuadrant(null);
  }, []);

  const handleQuadrantDrop = useCallback((targetQuadrant: Quadrant) => {
    if (!draggedTaskId) return;
    const task = activeTasks.find(t => t.id === draggedTaskId);
    if (!task) return;

    const currentQuadrant = getQuadrant(task);
    if (currentQuadrant === targetQuadrant) {
      setDraggedTaskId(null);
      setDragOverQuadrant(null);
      return;
    }

    const updates: { priority?: PersonalTaskPriority; due_date?: string } = {};

    const targetImportant = targetQuadrant === 'q1' || targetQuadrant === 'q2';
    const currentImportant = currentQuadrant === 'q1' || currentQuadrant === 'q2';
    if (targetImportant && !currentImportant) {
      updates.priority = 'HIGH';
    } else if (!targetImportant && currentImportant) {
      updates.priority = 'MEDIUM';
    }

    const targetUrgent = targetQuadrant === 'q1' || targetQuadrant === 'q3';
    const currentUrgent = currentQuadrant === 'q1' || currentQuadrant === 'q3';
    if (targetUrgent && !currentUrgent) {
      updates.due_date = getTodayDateString();
    } else if (!targetUrgent && currentUrgent) {
      updates.due_date = getNotUrgentDateString();
    }

    if (Object.keys(updates).length > 0) {
      // Optimistic: 로컬 state만 즉시 변경 → 옮긴 카드만 부드럽게 이동
      onOptimisticUpdate(draggedTaskId, updates);
      // Background API call (실패 시 전체 리프레시로 롤백)
      personalTaskAPI.update(draggedTaskId, updates).catch(() => onRefresh());
    }
    setDraggedTaskId(null);
    setDragOverQuadrant(null);
  }, [draggedTaskId, activeTasks, onOptimisticUpdate, onRefresh]);

  const urgentDeadlineLabel = format(getUrgentDeadline(), 'M/d');

  return (
    <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto p-4 md:p-6 pb-6 space-y-4">

        {/* ── Quick Add Bar (hidden on mobile – use FAB instead) ── */}
        <div className={`hidden md:block bg-bridge-obsidian rounded-xl border transition-all ${
          isAddFocused
            ? (captureType === 'habit' ? 'border-purple-500/50 shadow-lg shadow-purple-500/5' : 'border-bridge-accent/50 shadow-lg shadow-bridge-accent/5')
            : 'border-foreground/10'
        }`}>
          <div className="flex items-center gap-2 px-3 md:px-4 py-3">
            {/* Mode Toggle */}
            <div className="flex items-center gap-0.5 bg-foreground/5 rounded-lg p-0.5 shrink-0">
              <button
                onClick={() => setCaptureType('task')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                  captureType === 'task'
                    ? 'bg-bridge-accent text-white shadow-sm'
                    : 'text-slate-400 hover:text-foreground'
                }`}
              >
                <Flag size={11} />
                {t('personal.quickCapture.task', '할 일')}
              </button>
              <button
                onClick={() => setCaptureType('habit')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                  captureType === 'habit'
                    ? 'bg-purple-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-foreground'
                }`}
              >
                <Repeat size={11} />
                {t('personal.quickCapture.habit', '습관')}
              </button>
            </div>
            <input
              ref={addInputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onFocus={() => setIsAddFocused(true)}
              onBlur={() => { if (!newTitle.trim()) setIsAddFocused(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleQuickAdd();
                if (e.key === 'Escape') {
                  setNewTitle(''); setNewDueDate(getTodayDateString()); setNewPriority('MEDIUM');
                  setSelectedDays([0, 1, 2, 3, 4, 5, 6]); setHabitColor(HABIT_COLORS_INLINE[0]);
                  setIsAddFocused(false);
                  addInputRef.current?.blur();
                }
              }}
              placeholder={captureType === 'task'
                ? t('personal.tasks.addPlaceholder', '할 일 추가...')
                : t('personal.quickCapture.habitPlaceholder', '습관 이름을 입력하세요...')
              }
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder-slate-600 outline-none"
            />
            {captureType === 'task' ? (
              <>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="hidden sm:block bg-transparent text-xs text-slate-400 border border-foreground/10 rounded-lg px-2 py-1 outline-none focus:border-bridge-accent/50 [color-scheme:dark] w-[130px]"
                />
                <PriorityDropdown value={newPriority} onChange={setNewPriority} />
              </>
            ) : (
              <div className="hidden sm:flex items-center gap-1">
                {HABIT_DAY_CHIPS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setSelectedDays(prev => prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value])}
                    className={`w-7 h-7 text-[10px] font-bold rounded-md transition-all ${
                      selectedDays.includes(value)
                        ? 'bg-purple-500 text-white'
                        : 'bg-foreground/5 text-slate-500 hover:bg-foreground/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Task: mobile date row */}
          {captureType === 'task' && isAddFocused && (
            <div className="sm:hidden px-3 pb-2">
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-400 border border-foreground/10 rounded-lg px-3 py-1.5 outline-none focus:border-bridge-accent/50 [color-scheme:dark]"
              />
            </div>
          )}
          {/* Habit: mobile day chips row */}
          {captureType === 'habit' && isAddFocused && (
            <div className="sm:hidden px-3 pb-2">
              <div className="flex gap-1">
                {HABIT_DAY_CHIPS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setSelectedDays(prev => prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value])}
                    className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                      selectedDays.includes(value)
                        ? 'bg-purple-500 text-white'
                        : 'bg-foreground/5 text-slate-500 hover:bg-foreground/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Habit: color picker row */}
          {captureType === 'habit' && isAddFocused && (
            <div className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 shrink-0">{t('personal.habit.color', '색상')}</span>
                <div className="flex gap-1.5">
                  {HABIT_COLORS_INLINE.map((c) => (
                    <button
                      key={c}
                      onClick={() => setHabitColor(c)}
                      className={`w-5 h-5 rounded-full transition-all ${
                        habitColor === c
                          ? 'ring-2 ring-white ring-offset-1 ring-offset-bridge-obsidian scale-110'
                          : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          {isAddFocused && newTitle.trim() && (
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between pt-2 border-t border-foreground/5">
                <span className="text-[10px] text-slate-500">Enter {t('personal.tasks.toAdd', '추가')} · Esc {t('common.cancel', '취소')}</span>
                <button
                  onClick={handleQuickAdd}
                  className={`px-3 py-1 text-white text-xs rounded-lg font-medium transition-colors ${
                    captureType === 'habit'
                      ? 'bg-purple-500 hover:bg-purple-500/90'
                      : 'bg-bridge-accent hover:bg-bridge-accent/90'
                  }`}
                >
                  {t('personal.tasks.add', '추가')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── All Habits Bar ── */}
        <AllHabitsBar refreshKey={habitRefreshKey} />

        {/* ── Eisenhower Matrix Container ── */}
        <div className="rounded-xl border border-foreground/[0.08] overflow-hidden">
          {/* Header bar (same pattern as AllHabitsBar) */}
          <div className="flex items-center gap-2 px-3 py-2 bg-foreground/[0.04] border-b border-foreground/[0.06]">
            <CalendarClock size={13} className="text-bridge-accent" />
            <span className="text-xs font-bold text-foreground">
              {t('personal.tasks.matrixTitle', '아이젠하워 매트릭스')}
            </span>
            <span className="text-[10px] font-bold text-bridge-secondary bg-bridge-secondary/10 px-1.5 py-0.5 rounded-full">
              {activeTasks.length}
            </span>
            <div className="flex-1" />
            <span className="text-[10px] text-slate-500 hidden sm:inline mr-1">
              {t('personal.tasks.thisWeek', { date: urgentDeadlineLabel })}
            </span>
            {completedTasks.length > 0 && (
              <button
                onClick={() => setShowCompleted(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all"
              >
                <Check size={11} />
                {t('personal.tasks.completed', '완료됨')}
                <span className="font-bold">{completedTasks.length}</span>
              </button>
            )}
            {todayCompletedTasks.length > 0 && (
              <span className="text-[10px] text-emerald-400/60 hidden sm:inline">
                ({t('personal.tasks.todayDone', '오늘 {{count}}개', { count: todayCompletedTasks.length })})
              </span>
            )}
          </div>

          {/* Matrix content */}
          <div className="p-2.5 space-y-0">
            {/* Column axis labels */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-1.5">
              <div className="text-center hidden sm:block">
                <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-red-400/80">
                  {t('personal.tasks.urgentColumn')}
                </span>
                <span className="text-[10px] text-slate-500 ml-1.5">~{urgentDeadlineLabel} (D-{URGENT_DAYS})</span>
              </div>
              <div className="text-center hidden sm:block">
                <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-slate-400/80">
                  {t('personal.tasks.notUrgentColumn')}
                </span>
                <span className="text-[10px] text-slate-500 ml-1.5">D-{URGENT_DAYS}+</span>
              </div>
            </div>

            {/* Matrix 2x2 Grid */}
            <LayoutGroup>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {(['q1', 'q2', 'q3', 'q4'] as Quadrant[]).map(q => (
                  <div key={q} className={
                    q === 'q1' ? 'order-1 sm:order-none' :
                    q === 'q2' ? 'order-3 sm:order-none' :
                    q === 'q3' ? 'order-2 sm:order-none' :
                                'order-4 sm:order-none'
                  }>
                  <QuadrantCell
                    quadrant={q}
                    tasks={taskQuadrants[q]}
                    isDragOver={dragOverQuadrant === q}
                    draggedTaskId={draggedTaskId}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={() => setDragOverQuadrant(q)}
                    onDragLeave={() => setDragOverQuadrant(null)}
                    onDrop={() => handleQuadrantDrop(q)}
                    onToggleComplete={requestTaskToggle}
                    onOpenModal={(id) => setModalTaskId(id)}
                    onUpdate={handleUpdate}
                  />
                  </div>
                ))}
              </div>
            </LayoutGroup>

            {/* Quadrant legend */}
            <div className="flex items-center gap-3 sm:gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[10px] text-red-400/80">{t('personal.tasks.q1Desc')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] text-amber-400/80">{t('personal.tasks.q3Desc')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-bridge-accent" />
                <span className="text-[10px] text-bridge-accent/80">{t('personal.tasks.q2Desc')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-[10px] text-slate-400/80">{t('personal.tasks.q4Desc')}</span>
              </div>
              <div className="flex-1" />
              <span className="text-[10px] text-slate-500 italic hidden sm:inline">{t('personal.tasks.dragToMove')}</span>
            </div>
          </div>
        </div>

      </div>

      {/* ── Task Detail Modal ── */}
      <TaskDetailModal
        open={!!modalTaskId}
        task={modalTaskId ? tasks.find(t => t.id === modalTaskId) ?? null : null}
        onClose={() => setModalTaskId(null)}
        onUpdate={(data) => modalTaskId && handleUpdate(modalTaskId, data)}
        onDelete={() => { if (modalTaskId) { handleDelete(modalTaskId); setModalTaskId(null); } }}
        onToggleComplete={() => { const t = modalTaskId ? tasks.find(t => t.id === modalTaskId) : null; if (t) requestTaskToggle(t); }}
      />

      {/* Task Complete Confirm Modal */}
      <TaskCompleteConfirmModal
        open={!!taskConfirm}
        taskName={taskConfirm?.title || ''}
        isUndo={taskConfirm?.isDone}
        onConfirm={() => {
          if (taskConfirm) {
            const task = tasks.find(t => t.id === taskConfirm.id);
            if (task) handleToggleComplete(task);
            setTaskConfirm(null);
          }
        }}
        onCancel={() => setTaskConfirm(null)}
      />

      {/* Completed Tasks Modal */}
      <MotionModal open={showCompleted} onClose={() => setShowCompleted(false)} className="sm:max-w-md p-0 overflow-hidden border-foreground/[0.12]">
        <div>
          <div className="h-[2px] bg-gradient-to-r from-emerald-500/60 via-emerald-400/30 to-transparent" />
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
            <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Check size={14} className="text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">
                {t('personal.tasks.completed', '완료됨')}
              </h3>
              <span className="text-[10px] text-slate-500">
                {completedTasks.length}{t('personal.tasks.completedCount', '개 완료')} · 7일 후 자동 삭제
              </span>
            </div>
            <button
              onClick={() => setShowCompleted(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {completedTasks.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">
              {t('personal.tasks.noCompleted', '완료된 할 일이 없습니다')}
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2 space-y-1">
              {completedTasks.map(task => (
                <CompletedTaskRow
                  key={task.id}
                  task={task}
                  onToggleComplete={() => requestTaskToggle(task)}
                  onDelete={() => handleDelete(task.id)}
                />
              ))}
            </div>
          )}
        </div>
      </MotionModal>
    </div>
  );
}

// ── QuadrantCell ──────────────────────────────────────────────

function QuadrantCell({
  quadrant, tasks, isDragOver, draggedTaskId,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  onToggleComplete, onOpenModal, onUpdate,
}: {
  quadrant: Quadrant;
  tasks: PersonalTask[];
  isDragOver: boolean;
  draggedTaskId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onToggleComplete: (task: PersonalTask) => void;
  onOpenModal: (id: string) => void;
  onUpdate: (id: string, data: { title?: string; due_date?: string | null; priority?: PersonalTaskPriority; description?: string }) => void;
}) {
  const { t } = useTranslation();
  const cfg = QUADRANT_CONFIG[quadrant];
  const Icon = cfg.icon;
  const labelKeys = QUADRANT_LABEL_KEYS[quadrant];
  const totalCount = tasks.length;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver();
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`
        rounded-xl border transition-all min-h-[80px] sm:min-h-[260px] flex flex-col
        ${cfg.border} ${cfg.bg}
        ${isDragOver ? `${cfg.dropBorder} border-dashed ring-1 ring-current/20 scale-[1.01]` : ''}
      `}
    >
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${cfg.headerBg}`}>
        <Icon size={13} className={cfg.color} />
        <span className={`text-xs font-bold ${cfg.color}`}>{t(labelKeys.label)}</span>
        <span className="text-[9px] text-slate-500">{t(labelKeys.sublabel)}</span>
        <div className="flex-1" />
        <span className={`text-[10px] font-bold ${cfg.color}`}>{totalCount}</span>
      </div>

      {/* Items */}
      <div className="flex-1 p-1.5 space-y-1 overflow-y-auto max-h-[400px] custom-scrollbar">
        {totalCount === 0 && !isDragOver && (
          <div className="flex items-center justify-center h-full min-h-[40px] sm:min-h-[80px]">
            <span className="text-[10px] text-slate-600">{t('personal.tasks.empty')}</span>
          </div>
        )}

        {isDragOver && totalCount === 0 && (
          <div className="h-12 border border-dashed border-bridge-secondary/40 rounded-lg bg-bridge-secondary/5 flex items-center justify-center">
            <span className="text-[10px] text-bridge-secondary">{t('personal.tasks.dropHere')}</span>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {tasks.map(task => (
            <motion.div
              key={task.id}
              layoutId={`task-${task.id}`}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
            >
              <MatrixTaskCard
                task={task}
                isDragging={draggedTaskId === task.id}
                onDragStart={() => onDragStart(task.id)}
                onDragEnd={onDragEnd}
                onToggleComplete={() => onToggleComplete(task)}
                onOpenModal={() => onOpenModal(task.id)}
                onUpdate={(data) => onUpdate(task.id, data)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── HabitMatrixCard ──────────────────────────────────────────

function HabitMatrixCard({ habit, onCheckIn, onEdit, onDelete }: {
  habit: HabitTodayItem;
  onCheckIn: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const urgencyRatio = getHabitUrgencyRatio(habit);

  return (
    <div
      onClick={onCheckIn}
      className={`
        group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer
        border transition-all
        ${habit.is_completed
          ? 'bg-bridge-secondary/5 border-bridge-secondary/20'
          : 'bg-bridge-obsidian border-foreground/5 hover:border-purple-400/30 hover:bg-purple-500/5'
        }
      `}
    >
      {/* Check circle (left) */}
      <motion.div
        className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
          habit.is_completed
            ? 'bg-bridge-secondary border-bridge-secondary shadow-[0_0_8px_rgba(45,212,191,0.4)]'
            : 'border-bridge-border hover:border-bridge-secondary/50'
        }`}
        initial={false}
        animate={habit.is_completed ? { scale: [1, 1.3, 0.9, 1.1, 1] } : { scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <AnimatePresence mode="wait">
          {habit.is_completed && (
            <motion.div
              key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            >
              <Check size={10} className="text-white" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Color bar + icon */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          className="w-1 h-7 rounded-full shrink-0"
          style={{ backgroundColor: habit.color }}
        />
        <span className="text-sm">{habit.icon || '🔥'}</span>
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <span className={`text-[12px] leading-tight line-clamp-1 ${
          habit.is_completed ? 'line-through text-slate-500' : 'text-foreground'
        }`}>
          {habit.title}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {/* Weekly progress */}
          <span className="text-[9px] text-purple-400 font-bold">
            {habit.weekly_completed}/{habit.weekly_target} {t('personal.habit.thisWeek', '이번 주')}
          </span>
          {/* Urgency indicator */}
          {!habit.is_completed && urgencyRatio >= 1.0 && (
            <span className="text-[8px] font-bold text-red-400 bg-red-400/10 px-1 rounded">
              {t('personal.habit.tight', '빠듯')}
            </span>
          )}
        </div>
      </div>

      {/* Edit/Delete (hover) */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1 text-slate-500 hover:text-foreground rounded transition-colors"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Right side: donut + streak */}
      <div className="flex items-center gap-2 shrink-0">
        {habit.weekly_target > 0 && (
          <TaskBoardWeeklyDonut
            completed={habit.weekly_completed}
            target={habit.weekly_target}
            color={habit.color || '#8B5CF6'}
          />
        )}
        {habit.current_streak > 0 && (
          <div className="flex items-center gap-0.5 text-[9px] text-orange-400 font-bold">
            <Flame size={10} />
            {habit.current_streak}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TaskBoard Weekly Donut ────────────────────────────────────

function TaskBoardWeeklyDonut({ completed, target, color }: {
  completed: number;
  target: number;
  color: string;
}) {
  const size = 20;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const rate = Math.min(completed / Math.max(target, 1), 1);
  const isComplete = completed >= target;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
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
            fontSize: 5.5,
            ...(isComplete ? { color: '#2DD4BF' } : {}),
          }}
        >
          {completed}/{target}
        </span>
      </div>
    </div>
  );
}

// ── MatrixTaskCard ────────────────────────────────────────────

function MatrixTaskCard({
  task, isDragging,
  onDragStart, onDragEnd, onToggleComplete, onOpenModal, onUpdate,
}: {
  task: PersonalTask;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggleComplete: () => void;
  onOpenModal: () => void;
  onUpdate: (data: { title?: string; due_date?: string | null; priority?: PersonalTaskPriority; description?: string }) => void;
}) {
  const isDone = task.status === 'DONE';
  const dday = getDDay(task.due_date);
  const priorityCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const dateInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      draggable={!isDone}
      onDragStart={(e) => {
        if (isDone) { e.preventDefault(); return; }
        e.dataTransfer?.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group"
    >
      <div
        onClick={onOpenModal}
        className={`
          flex items-center gap-2 px-2.5 py-2 rounded-lg
          ${isDone
            ? 'bg-emerald-500/[0.04] border border-emerald-500/10 opacity-60 cursor-pointer'
            : `cursor-grab active:cursor-grabbing bg-white/[0.03] border border-foreground/5 hover:border-foreground/10 hover:bg-white/[0.06] ${isDragging ? 'opacity-40 rotate-1' : ''}`
          }
          transition-all
        `}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
          className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
            isDone
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-slate-600 hover:border-bridge-accent'
          }`}
        >
          {isDone && <Check size={10} className="text-white" strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          <span className={`text-[12px] leading-tight line-clamp-2 ${
            isDone ? 'line-through text-slate-500' : 'text-foreground'
          }`}>{task.title}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isDone ? (
            <span className="text-[9px] font-bold text-emerald-400/70 px-1.5 py-0.5 rounded bg-emerald-500/10">
              ✓
            </span>
          ) : (
            <>
              <div className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
              {dday.urgency !== 'none' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dateInputRef.current?.showPicker();
                  }}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded hover:ring-1 hover:ring-white/20 transition-all ${DDAY_STYLES[dday.urgency]}`}
                >
                  {dday.text}
                </button>
              )}
              <input
                ref={dateInputRef}
                type="date"
                value={task.due_date ?? ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  onUpdate({ due_date: e.target.value || getTodayDateString() });
                }}
                className="sr-only"
                tabIndex={-1}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CompletedTaskRow ──────────────────────────────────────────

function CompletedTaskRow({ task, onToggleComplete, onDelete }: {
  task: PersonalTask;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  const dday = task.due_date ? getDDay(task.due_date) : null;
  const daysLeft = task.completed_at
    ? 7 - Math.floor((Date.now() - new Date(task.completed_at).getTime()) / 86_400_000)
    : null;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
      <button
        onClick={onToggleComplete}
        className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center shrink-0"
      >
        <Check size={12} className="text-white" />
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-sm line-through text-slate-500 truncate block">{task.title}</span>
        <div className="flex items-center gap-1.5 text-[10px]">
          {task.due_date && (
            <span className={dday?.urgency === 'overdue' ? 'text-red-400/60' : 'text-slate-600'}>
              {task.due_date.slice(5).replace('-', '/')}
              {dday?.urgency === 'overdue' && ` (${dday.text})`}
            </span>
          )}
          {task.due_date && daysLeft != null && <span className="text-slate-700">·</span>}
          {daysLeft != null && (
            <span className={daysLeft <= 1 ? 'text-red-400/50' : 'text-slate-700'}>
              {daysLeft <= 0 ? '곧 삭제' : `${daysLeft}일 후 삭제`}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── TaskDetailModal ───────────────────────────────────────────

export function TaskDetailModal({ open, task, onClose, onUpdate, onDelete, onToggleComplete }: {
  open: boolean;
  task: PersonalTask | null;
  onClose: () => void;
  onUpdate: (data: { title?: string; due_date?: string | null; priority?: PersonalTaskPriority; description?: string }) => void;
  onDelete: () => void;
  onToggleComplete: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task?.title ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [priority, setPriority] = useState<PersonalTaskPriority>(task?.priority ?? 'MEDIUM');
  const [description, setDescription] = useState(task?.description ?? '');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDueDate(task.due_date ?? '');
      setPriority(task.priority);
      setDescription(task.description ?? '');
    }
  }, [task]);

  if (!task) return null;

  const isDone = task.status === 'DONE';
  const dday = getDDay(dueDate);

  const hasChanges =
    title !== task.title ||
    dueDate !== (task.due_date ?? '') ||
    priority !== task.priority ||
    description !== (task.description ?? '');

  const handleSave = () => {
    if (!title.trim() || !hasChanges) return;
    const patch: Parameters<typeof onUpdate>[0] = {};
    if (title !== task.title) patch.title = title.trim();
    if (dueDate !== (task.due_date ?? '')) patch.due_date = dueDate || null;
    if (priority !== task.priority) patch.priority = priority;
    if (description !== (task.description ?? '')) patch.description = description;
    onUpdate(patch);
    onClose();
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md p-0 overflow-hidden border-foreground/[0.12]">
      <div>
        {/* Top accent line */}
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

        {/* Header: checkbox + title + delete + close */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <button
            onClick={onToggleComplete}
            className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
              isDone
                ? 'bg-emerald-500 border-emerald-500'
                : 'border-slate-500 hover:border-bridge-accent'
            }`}
          >
            {isDone && <Check size={12} className="text-white" />}
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur(); }}
            className={`flex-1 min-w-0 bg-transparent text-sm font-bold outline-none placeholder-slate-600 ${isDone ? 'line-through text-slate-500' : 'text-foreground'}`}
            placeholder={t('personal.tasks.titlePlaceholder', '할 일 제목')}
          />
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-foreground/5 transition-colors shrink-0"
            title={t('common.delete', '삭제')}
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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-foreground/[0.04] border border-foreground/10 hover:border-foreground/15 transition-colors">
              <Calendar size={13} className="text-slate-400" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-transparent text-xs text-muted-foreground outline-none [color-scheme:dark]"
              />
              {dday.urgency !== 'none' && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DDAY_STYLES[dday.urgency]}`}>
                  {dday.text}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-foreground/[0.04] border border-foreground/10">
              <Flag size={13} className="text-slate-400" />
              <PriorityInline
                value={priority}
                onChange={(p) => setPriority(p)}
              />
            </div>
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('personal.tasks.descPlaceholder', '메모 추가...')}
            rows={3}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-muted-foreground placeholder-slate-600 outline-none resize-none focus:border-bridge-accent/30 focus:ring-1 focus:ring-bridge-accent/10 transition-all"
          />

          <div className="flex items-center justify-between pt-3 border-t border-foreground/[0.08]">
            <span className="text-[10px] text-slate-600">
              Esc {t('common.close', '닫기')}
            </span>
            <button
              onClick={handleSave}
              disabled={!title.trim() || !hasChanges}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {t('personal.schedule.save', '저장')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}

// ── PriorityDropdown ─────────────────────────────────────────

function PriorityDropdown({ value, onChange }: {
  value: PersonalTaskPriority;
  onChange: (p: PersonalTaskPriority) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ALL: PersonalTaskPriority[] = ['MEDIUM', 'HIGH', 'URGENT'];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg border border-foreground/10 hover:bg-foreground/5 transition-colors"
        title={t('personal.tasks.priority')}
      >
        <div className={`w-3 h-3 rounded-full ${PRIORITY_CONFIG[value].dot}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-bridge-obsidian border border-foreground/10 rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
            {ALL.map(p => (
              <button
                key={p}
                onClick={() => { onChange(p); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-foreground/5 transition-colors ${
                  value === p ? 'text-foreground' : 'text-slate-400'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].dot}`} />
                {t(PRIORITY_LABEL_KEYS[p])}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── PriorityInline ───────────────────────────────────────────

function PriorityInline({ value, onChange }: {
  value: PersonalTaskPriority;
  onChange: (p: PersonalTaskPriority) => void;
}) {
  const { t } = useTranslation();
  const ALL: PersonalTaskPriority[] = ['MEDIUM', 'HIGH', 'URGENT'];

  return (
    <div className="flex items-center gap-0.5">
      {ALL.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`text-[10px] px-1.5 py-0.5 rounded-md transition-all ${
            value === p
              ? `${PRIORITY_CONFIG[p].color} font-bold`
              : 'text-slate-500 hover:text-muted-foreground hover:bg-foreground/5'
          }`}
          style={value === p ? {
            backgroundColor: `color-mix(in srgb, currentColor 15%, transparent)`,
          } : undefined}
        >
          {t(PRIORITY_LABEL_KEYS[p])}
        </button>
      ))}
    </div>
  );
}
