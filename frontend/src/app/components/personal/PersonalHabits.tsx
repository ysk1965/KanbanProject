import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FEATURE_COLORS } from '../../constants';
import {
  Plus, Flame, CheckCircle2, Trash2, X, Loader2, ChevronDown,
  Pencil, MoreHorizontal,
  TrendingUp, Calendar, Zap, RotateCcw, ListTodo,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { MotionModal } from '../ui/MotionModal';
import { IconButton } from '../ui/IconButton';
import { ColorPickerPopover } from '../ui/ColorPickerPopover';
import { personalHabitAPI } from '../../utils/api';
import { getTodayDateString } from '../../utils/dateUtils';
import type { PersonalHabit, HabitTodayItem, HabitFrequency, HabitImportance } from '../../types';

/* ================================================================
   Constants
   ================================================================ */

const HABIT_COLORS = FEATURE_COLORS;

const HABIT_ICONS = [
  '🏃', '📚', '💧', '🧘', '💪', '🎯', '✍️', '🎵',
  '🧠', '🌿', '💊', '🍎', '😴', '🚶', '🧹', '📵',
];

/** Display order: Sun → Sat, using JS getDay() values (0=Sun, 1=Mon…6=Sat) */
const DAY_DISPLAY = [
  { value: 0, key: 'calendar.sun' },
  { value: 1, key: 'calendar.mon' },
  { value: 2, key: 'calendar.tue' },
  { value: 3, key: 'calendar.wed' },
  { value: 4, key: 'calendar.thu' },
  { value: 5, key: 'calendar.fri' },
  { value: 6, key: 'calendar.sat' },
];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function formatFrequency(habit: PersonalHabit, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (habit.frequency_type === 'DAILY') return t('personal.habit.everyDay');
  if (habit.frequency_type === 'WEEKDAY') return t('personal.habit.weekdays');
  if (habit.frequency_type === 'WEEKEND') return t('personal.habit.weekends');
  if (habit.frequency_type === 'CUSTOM' && habit.frequency_days) {
    const days = habit.frequency_days.split(',').map(Number);
    // Display in Sun→Sat order
    const ordered = DAY_DISPLAY.filter(d => days.includes(d.value));
    return ordered.map(d => t(d.key)).join(', ');
  }
  return t('personal.habit.everyDay');
}

/* ================================================================
   Icon Dropdown (floating popover)
   ================================================================ */

function IconDropdown({ icon, onChange }: { icon: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
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
    <div className="flex-1">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
          open
            ? 'border-purple-500/40 bg-purple-500/5'
            : 'border-foreground/10 bg-foreground/[0.04] hover:bg-foreground/5'
        }`}
      >
        <span className="text-sm">{icon || '😊'}</span>
        <span className="text-xs text-slate-400 flex-1 text-left truncate">
          {icon ? t('personal.habit.changeIcon', '변경') : t('personal.habit.selectIcon', '선택')}
        </span>
        <ChevronDown size={12} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[100] bg-bridge-obsidian border border-foreground/10 rounded-xl p-2 shadow-2xl"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {HABIT_ICONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { onChange(icon === emoji ? '' : emoji); setOpen(false); }}
                className={`w-9 h-9 flex items-center justify-center rounded-lg text-base transition-all ${
                  icon === emoji
                    ? 'bg-purple-500/20 ring-1 ring-purple-500 scale-110'
                    : 'hover:bg-foreground/10 hover:scale-105'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ================================================================
   Color Dropdown → replaced by ColorPickerPopover
   ================================================================ */

/* ================================================================
   PersonalHabits — Main Tab Component
   ================================================================ */

export function PersonalHabits() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [habits, setHabits] = useState<PersonalHabit[]>([]);
  const [todayItems, setTodayItems] = useState<HabitTodayItem[]>([]);
  const [nonTodayCompleted, setNonTodayCompleted] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editHabit, setEditHabit] = useState<PersonalHabit | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [checkInConfirm, setCheckInConfirm] = useState<{ id: string; isUndo: boolean; isNonToday?: boolean } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const todayStr = getTodayDateString();
      const [allHabits, today, todayMatrix] = await Promise.all([
        personalHabitAPI.getAll(),
        personalHabitAPI.getToday(todayStr),
        personalHabitAPI.getWeekly(todayStr, todayStr),
      ]);
      const activeHabits = allHabits.filter(h => h.is_active);
      setHabits(activeHabits);
      setTodayItems(today);

      // Build non-today completion map from weekly matrix
      const todayHabitIds = new Set(today.map(t => t.habit_id));
      const completionMap: Record<string, boolean> = {};
      todayMatrix.habits.forEach(row => {
        if (!todayHabitIds.has(row.habit_id) && row.days.length > 0) {
          completionMap[row.habit_id] = row.days[0].is_completed;
        }
      });
      setNonTodayCompleted(completionMap);
    } catch (err) {
      console.error('Failed to load habits:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats
  const stats = useMemo(() => {
    const total = habits.length;
    const todayCompleted = todayItems.filter(t => t.is_completed).length;
    const todayTotal = todayItems.length;
    const bestStreak = habits.reduce((max, h) => Math.max(max, h.best_streak), 0);
    const maxStreak = todayItems.reduce((max, t) => Math.max(max, t.current_streak), 0);
    return { total, todayCompleted, todayTotal, bestStreak, maxStreak };
  }, [habits, todayItems]);

  // Non-today habits (not in today's scheduled list)
  const nonTodayHabits = useMemo(() => {
    const todayIds = new Set(todayItems.map(t => t.habit_id));
    return habits.filter(h => !todayIds.has(h.id));
  }, [habits, todayItems]);

  // All Habits sorted: today's first
  const sortedHabits = useMemo(() => {
    const todayIds = new Set(todayItems.map(t => t.habit_id));
    return [...habits].sort((a, b) => {
      const aToday = todayIds.has(a.id);
      const bToday = todayIds.has(b.id);
      if (aToday && !bToday) return -1;
      if (!aToday && bToday) return 1;
      return 0;
    });
  }, [habits, todayItems]);

  const handleCheckIn = async (habitId: string, isUndo?: boolean) => {
    const revertTo = !!isUndo;
    const todayDate = getTodayDateString();
    // Optimistic update
    setTodayItems(prev => prev.map(h =>
      h.habit_id === habitId ? { ...h, is_completed: !isUndo } : h
    ));
    try {
      const updated = await personalHabitAPI.checkIn(habitId, { log_date: todayDate });
      setTodayItems(prev => prev.map(h => h.habit_id === habitId ? updated : h));
    } catch {
      // Revert on failure
      setTodayItems(prev => prev.map(h =>
        h.habit_id === habitId ? { ...h, is_completed: revertTo } : h
      ));
      console.error('Failed to check in');
    }
  };

  const handleNonTodayCheckIn = async (habitId: string, isUndo?: boolean) => {
    const prev = nonTodayCompleted[habitId] ?? false;
    const todayDate = getTodayDateString();
    // Optimistic update
    setNonTodayCompleted(s => ({ ...s, [habitId]: !isUndo }));
    try {
      await personalHabitAPI.checkIn(habitId, { log_date: todayDate });
    } catch {
      // Revert on failure
      setNonTodayCompleted(s => ({ ...s, [habitId]: prev }));
      console.error('Failed to check in');
    }
  };

  const handleCreate = async (data: HabitFormData) => {
    try {
      await personalHabitAPI.create(data);
      setIsCreateOpen(false);
      await loadData();
    } catch (err) {
      console.error('Failed to create habit:', err);
    }
  };

  const handleUpdate = async (habitId: string, data: HabitFormData) => {
    try {
      await personalHabitAPI.update(habitId, data);
      setEditHabit(null);
      await loadData();
    } catch (err) {
      console.error('Failed to update habit:', err);
    }
  };

  const handleDelete = async (habitId: string) => {
    try {
      await personalHabitAPI.delete(habitId);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      console.error('Failed to delete habit:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flame size={22} className="text-purple-400" />
            <h2 className="text-lg md:text-xl font-bold text-foreground">{t('personal.habit.habits')}</h2>
            {habits.length > 0 && (
              <span className="text-xs font-bold text-purple-400 bg-purple-400/15 px-2 py-0.5 rounded-full">
                {habits.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white text-sm font-bold rounded-xl hover:bg-purple-500/90 transition-all"
          >
            <Plus size={16} />
            {t('personal.habit.newHabit')}
          </button>
        </div>

        {/* Stats Cards */}
        {habits.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Target size={16} className="text-purple-400" />}
              label={t('personal.habit.today')}
              value={`${stats.todayCompleted}/${stats.todayTotal}`}
              sub={stats.todayTotal > 0 ? `${Math.round((stats.todayCompleted / stats.todayTotal) * 100)}%` : '—'}
            />
            <StatCard
              icon={<Flame size={16} className="text-orange-400" />}
              label={t('personal.habit.activeStreaks')}
              value={String(stats.maxStreak)}
              sub={t('personal.habit.weeks', '주 연속')}
            />
            <StatCard
              icon={<TrendingUp size={16} className="text-emerald-400" />}
              label={t('personal.habit.bestStreak')}
              value={String(stats.bestStreak)}
              sub={t('personal.habit.weeks', '주 연속')}
            />
            <StatCard
              icon={<Zap size={16} className="text-amber-400" />}
              label={t('personal.habit.totalHabits')}
              value={String(stats.total)}
              sub={t('personal.habit.tracking')}
            />
          </div>
        )}

        {/* Today's Habits */}
        {todayItems.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
              {t('personal.habit.todaysProgress')}
            </h3>
            <div className="space-y-1.5">
              {todayItems.map(item => {
                const habit = habits.find(h => h.id === item.habit_id);
                return (
                  <motion.div
                    key={item.habit_id}
                    layout
                    className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer overflow-hidden ${
                      item.is_completed
                        ? 'bg-bridge-secondary/5 border border-bridge-secondary/20'
                        : 'bg-white/[0.03] border border-foreground/[0.08] hover:bg-white/[0.06]'
                    }`}
                    onClick={() => {
                      if (item.is_completed) {
                        setCheckInConfirm({ id: item.habit_id, isUndo: true });
                      } else {
                        handleCheckIn(item.habit_id);
                      }
                    }}
                  >
                    {/* Check circle with animation */}
                    <motion.div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        item.is_completed
                          ? 'bg-bridge-secondary border-bridge-secondary'
                          : 'border-bridge-border hover:border-purple-400'
                      }`}
                      initial={false}
                      animate={item.is_completed && !reduced ? {
                        scale: [1, 1.3, 0.9, 1.1, 1],
                      } : { scale: 1 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
                    >
                      <AnimatePresence mode="wait">
                        {item.is_completed && (
                          <motion.div
                            key="check"
                            initial={reduced ? false : { scale: 0, rotate: -90, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            exit={{ scale: 0, rotate: 90, opacity: 0 }}
                            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 15, delay: 0.1 }}
                          >
                            <CheckCircle2 size={12} className="text-white" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    {/* Completion ripple effect */}
                    {item.is_completed && !reduced && (
                      <motion.div
                        className="absolute left-[22px] top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full pointer-events-none"
                        initial={{ scale: 1, opacity: 0.4 }}
                        animate={{ scale: 2.5, opacity: 0 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        style={{ backgroundColor: habit?.color || '#2DD4BF' }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${
                        item.is_completed ? 'line-through text-slate-500' : 'text-foreground'
                      }`}>
                        {item.icon && <span className="mr-1.5">{item.icon}</span>}
                        {item.title}
                      </div>
                    </div>
                    {/* Weekly progress donut ring */}
                    {item.weekly_target > 0 && (
                      <WeeklyDonut
                        completed={item.weekly_completed}
                        target={item.weekly_target}
                        color={habit?.color || '#8B5CF6'}
                        size={28}
                      />
                    )}
                    {/* Weekly streak fire */}
                    {item.current_streak > 0 && (
                      <div className="flex items-center gap-1 text-xs text-orange-400 font-bold flex-shrink-0">
                        <Flame size={12} />
                        {item.current_streak}
                      </div>
                    )}
                    <div
                      className="w-1.5 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: habit?.color || '#8B5CF6', opacity: 0.6 }}
                    />
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* Non-Today Habits (checkable with confirmation) */}
        {nonTodayHabits.length > 0 && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
              <Calendar size={12} />
              {t('personal.habit.otherHabits')}
            </h3>
            <div className="space-y-1.5">
              {nonTodayHabits.map(habit => {
                const isCompleted = nonTodayCompleted[habit.id] ?? false;
                return (
                  <motion.div
                    key={habit.id}
                    layout
                    className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer overflow-hidden ${
                      isCompleted
                        ? 'bg-bridge-secondary/5 border border-bridge-secondary/20'
                        : 'bg-white/[0.02] border border-foreground/[0.08] hover:bg-white/[0.04]'
                    }`}
                    onClick={() => {
                      if (isCompleted) {
                        setCheckInConfirm({ id: habit.id, isUndo: true, isNonToday: true });
                      } else {
                        setCheckInConfirm({ id: habit.id, isUndo: false, isNonToday: true });
                      }
                    }}
                  >
                    {/* Check circle */}
                    <motion.div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        isCompleted
                          ? 'bg-bridge-secondary border-bridge-secondary'
                          : 'border-foreground/10 hover:border-purple-400'
                      }`}
                      initial={false}
                      animate={isCompleted && !reduced ? { scale: [1, 1.3, 0.9, 1.1, 1] } : { scale: 1 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.4, ease: 'easeOut' }}
                    >
                      <AnimatePresence mode="wait">
                        {isCompleted && (
                          <motion.div
                            key="check"
                            initial={reduced ? false : { scale: 0, rotate: -90, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            exit={{ scale: 0, rotate: 90, opacity: 0 }}
                            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 15, delay: 0.1 }}
                          >
                            <CheckCircle2 size={12} className="text-white" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    {isCompleted && !reduced && (
                      <motion.div
                        className="absolute left-[22px] top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full pointer-events-none"
                        initial={{ scale: 1, opacity: 0.4 }}
                        animate={{ scale: 2.5, opacity: 0 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        style={{ backgroundColor: habit.color || '#2DD4BF' }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${
                        isCompleted ? 'line-through text-slate-500' : 'text-foreground/70'
                      }`}>
                        {habit.icon && <span className="mr-1.5">{habit.icon}</span>}
                        {habit.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatFrequency(habit, t)}
                      </div>
                    </div>
                    {habit.current_streak > 0 && (
                      <div className="flex items-center gap-1 text-xs text-orange-400 font-bold flex-shrink-0">
                        <Flame size={12} />
                        {habit.current_streak}
                      </div>
                    )}
                    <div
                      className="w-1.5 h-8 rounded-full flex-shrink-0 opacity-30"
                      style={{ backgroundColor: habit.color || '#8B5CF6' }}
                    />
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* All Habits List */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            {habits.length > 0 ? t('personal.habit.allHabits') : ''}
          </h3>

          {habits.length === 0 ? (
            <EmptyState onAdd={() => setIsCreateOpen(true)} />
          ) : (
            <div className="space-y-2">
              {sortedHabits.map(habit => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  onEdit={() => setEditHabit(habit)}
                  onDelete={() => setDeleteConfirm(habit.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      <HabitFormModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />

      <HabitFormModal
        open={!!editHabit}
        habit={editHabit ?? undefined}
        onClose={() => setEditHabit(null)}
        onSubmit={(data) => editHabit && handleUpdate(editHabit.id, data)}
        onDelete={() => {
          if (editHabit) {
            setEditHabit(null);
            setDeleteConfirm(editHabit.id);
          }
        }}
      />

      <DeleteConfirmModal
        open={!!deleteConfirm}
        habitName={habits.find(h => h.id === deleteConfirm)?.title || ''}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />

      <CheckInConfirmModal
        open={!!checkInConfirm}
        habitName={checkInConfirm ? (
          todayItems.find(h => h.habit_id === checkInConfirm.id)?.title
          || habits.find(h => h.id === checkInConfirm.id)?.title
          || ''
        ) : ''}
        habitIcon={checkInConfirm ? (
          todayItems.find(h => h.habit_id === checkInConfirm.id)?.icon
          ?? habits.find(h => h.id === checkInConfirm.id)?.icon
          ?? undefined
        ) : undefined}
        streakCount={checkInConfirm ? (
          todayItems.find(h => h.habit_id === checkInConfirm.id)?.current_streak
          ?? habits.find(h => h.id === checkInConfirm.id)?.current_streak
        ) : undefined}
        isUndo={checkInConfirm?.isUndo}
        isNonToday={checkInConfirm?.isNonToday}
        onConfirm={() => {
          if (checkInConfirm) {
            if (checkInConfirm.isNonToday) {
              handleNonTodayCheckIn(checkInConfirm.id, checkInConfirm.isUndo);
            } else {
              handleCheckIn(checkInConfirm.id, checkInConfirm.isUndo);
            }
            setCheckInConfirm(null);
          }
        }}
        onCancel={() => setCheckInConfirm(null)}
      />
    </div>
  );
}

/* ================================================================
   Stat Card
   ================================================================ */

function StatCard({ icon, label, value, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : undefined}
      className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-3 md:p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <div className="text-xl md:text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </motion.div>
  );
}

/* ================================================================
   Weekly Donut — circular ring showing weekly progress
   ================================================================ */

function WeeklyDonut({ completed, target, color, size = 28 }: {
  completed: number;
  target: number;
  color: string;
  size?: number;
}) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const rate = Math.min(completed / Math.max(target, 1), 1);
  const isComplete = completed >= target;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block" style={{ transform: 'rotate(-90deg)' }}>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className="stroke-foreground/10"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
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
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-bold leading-none text-muted-foreground"
          style={{
            fontSize: size <= 24 ? 7 : 8,
            ...(isComplete ? { color: '#2DD4BF' } : {}),
          }}
        >
          {completed}/{target}
        </span>
      </div>
    </div>
  );
}

/* ================================================================
   Empty State
   ================================================================ */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduced ? { duration: 0 } : undefined}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center mb-4">
        <Flame size={32} className="text-purple-400" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2">{t('personal.habit.startBuilding')}</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-xs">
        {t('personal.habit.startBuildingDesc')}
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 bg-purple-500 text-white text-sm font-bold rounded-xl hover:bg-purple-500/90 transition-all"
      >
        <Plus size={16} />
        {t('personal.habit.addFirstHabit')}
      </button>
    </motion.div>
  );
}

/* ================================================================
   Habit Card (list item)
   ================================================================ */

function HabitCard({ habit, onEdit, onDelete }: {
  habit: PersonalHabit;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : undefined}
      className="group bg-bridge-obsidian rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] p-4 transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Icon / Color indicator */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: `${habit.color}20` }}
        >
          {habit.icon || <Flame size={18} style={{ color: habit.color }} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-foreground truncate">{habit.title}</h4>
            {habit.current_streak > 0 && (
              <div className="flex items-center gap-0.5 text-xs text-orange-400 font-bold flex-shrink-0 bg-orange-400/15 px-1.5 py-0.5 rounded-full">
                <Flame size={10} />
                {habit.current_streak}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar size={10} />
              {formatFrequency(habit, t)}
            </span>
            {habit.best_streak > 0 && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <TrendingUp size={10} />
                {t('personal.habit.bestLabel', { count: habit.best_streak })}
              </span>
            )}
          </div>
          {habit.description && (
            <p className="text-xs text-slate-500 mt-1.5 line-clamp-1">{habit.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 text-slate-500 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 z-50 bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1 min-w-[120px]">
                <button
                  onClick={() => { setShowMenu(false); onEdit(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-foreground/5 transition-colors"
                >
                  <Pencil size={12} />
                  {t('personal.habit.edit')}
                </button>
                <button
                  onClick={() => { setShowMenu(false); onDelete(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-400/5 transition-colors"
                >
                  <Trash2 size={12} />
                  {t('personal.habit.delete')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ================================================================
   Habit Form Modal (Create & Edit — shared)
   ================================================================ */

export interface HabitFormData {
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  frequency_type?: HabitFrequency;
  frequency_days?: string;
  target_count?: number;
  importance?: HabitImportance;
}

export function HabitFormModal({ open, habit, onClose, onSubmit, onDelete }: {
  open: boolean;
  habit?: PersonalHabit;
  onClose: () => void;
  onSubmit: (data: HabitFormData) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!habit;

  const getDaysFromHabit = (h?: PersonalHabit): number[] => {
    if (!h) return [...ALL_DAYS];
    switch (h.frequency_type) {
      case 'DAILY': return [...ALL_DAYS];
      case 'WEEKDAY': return [1, 2, 3, 4, 5];
      case 'WEEKEND': return [0, 6];
      case 'CUSTOM':
        // Convert legacy Java DayOfWeek 7 (Sunday) → JS getDay() 0
        return h.frequency_days ? h.frequency_days.split(',').map(Number).map(d => d === 7 ? 0 : d) : [...ALL_DAYS];
      default: return [...ALL_DAYS];
    }
  };

  const [title, setTitle] = useState(habit?.title || '');
  const [selectedDays, setSelectedDays] = useState<number[]>(getDaysFromHabit(habit));
  const [showMore, setShowMore] = useState(isEdit);
  const [importance, setImportance] = useState<HabitImportance>(habit?.importance || 'MEDIUM');
  const [icon, setIcon] = useState(habit?.icon || '');
  const [color, setColor] = useState(habit?.color || HABIT_COLORS[0]);
  const [description, setDescription] = useState(habit?.description || '');

  // Sync form state when habit prop changes (e.g. opening edit modal)
  useEffect(() => {
    if (open) {
      setTitle(habit?.title || '');
      setSelectedDays(getDaysFromHabit(habit));
      setImportance(habit?.importance || 'MEDIUM');
      setIcon(habit?.icon || '');
      setColor(habit?.color || HABIT_COLORS[0]);
      setDescription(habit?.description || '');
      setShowMore(!!habit);
    }
  }, [open, habit]);

  // Detect changes from original habit (for edit mode save button)
  const hasChanges = useMemo(() => {
    if (!isEdit || !habit) return true; // create mode: always allow
    const origDays = getDaysFromHabit(habit);
    const daysChanged = selectedDays.length !== origDays.length ||
      [...selectedDays].sort((a, b) => a - b).join(',') !== [...origDays].sort((a, b) => a - b).join(',');
    return (
      title.trim() !== (habit.title || '') ||
      (description.trim() || '') !== (habit.description || '') ||
      (icon || '') !== (habit.icon || '') ||
      (color || HABIT_COLORS[0]) !== (habit.color || HABIT_COLORS[0]) ||
      importance !== (habit.importance || 'MEDIUM') ||
      daysChanged
    );
  }, [isEdit, habit, title, description, icon, color, importance, selectedDays]);

  const isValid = title.trim().length > 0 && selectedDays.length > 0 && hasChanges;

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
    );
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const allSelected = selectedDays.length === 7;
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      icon: icon || undefined,
      color,
      frequency_type: allSelected ? 'DAILY' : 'CUSTOM',
      frequency_days: allSelected
        ? undefined
        : [...selectedDays].sort((a, b) => a - b).join(','),
      target_count: 1,
      importance,
    });
  };

  return (
    <MotionModal open={open} onClose={onClose} className="sm:max-w-md p-0 overflow-hidden border-foreground/[0.08]">
      <div>
        {/* Top accent line */}
        <div className="h-[2px]" style={{ background: `linear-gradient(to right, ${color}88, ${color}44, transparent)` }} />

        {/* Header: icon + title + delete + close */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <ColorPickerPopover
            colors={HABIT_COLORS}
            selectedColor={color}
            onColorChange={setColor}
            triggerSize="sm"
            triggerShape="circle"
            showCustomColor={false}
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={t('personal.habit.habitPlaceholder')}
            className="flex-1 min-w-0 bg-transparent text-sm font-bold text-foreground outline-none placeholder-slate-500"
            autoFocus
          />
          {isEdit && onDelete && (
            <IconButton
              onClick={onDelete}
              aria-label="삭제"
              className="hover:text-rose-400 hover:bg-rose-500/10"
            >
              <Trash2 />
            </IconButton>
          )}
          <IconButton onClick={onClose} aria-label="닫기">
            <X />
          </IconButton>
        </div>

        <div className="px-5 pb-5 space-y-3 pt-4">
          {/* Frequency — Day-of-week toggles */}
          <div className="flex gap-1.5">
            {DAY_DISPLAY.map(({ value, key }) => (
              <button
                key={value}
                onClick={() => toggleDay(value)}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                  selectedDays.includes(value)
                    ? 'text-white'
                    : 'bg-foreground/5 text-slate-400 hover:bg-foreground/10'
                }`}
                style={selectedDays.includes(value) ? { backgroundColor: color } : undefined}
              >
                {t(key).charAt(0)}
              </button>
            ))}
          </div>
          {selectedDays.length === 0 && (
            <p className="text-xs text-amber-400">{t('personal.habit.selectDay')}</p>
          )}

          {/* Importance */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setImportance('HIGH')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                importance === 'HIGH'
                  ? 'bg-orange-500 text-white'
                  : 'bg-foreground/5 text-slate-400 hover:bg-foreground/10'
              }`}
            >
              ⭐ {t('personal.habit.important')}
            </button>
            <button
              onClick={() => setImportance('MEDIUM')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                importance === 'MEDIUM'
                  ? 'bg-slate-500 text-white'
                  : 'bg-foreground/5 text-slate-400 hover:bg-foreground/10'
              }`}
            >
              {t('personal.habit.normal')}
            </button>
          </div>

          {/* Icon picker */}
          <IconDropdown icon={icon} onChange={setIcon} />

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('personal.habit.descPlaceholder')}
            rows={2}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl p-3 text-sm text-muted-foreground placeholder-slate-500 outline-none resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-foreground/[0.08]">
            <span className="text-xs text-slate-600">
              Esc {t('common.close', '닫기')}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!isValid}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={{ backgroundColor: isValid ? color : 'rgba(128,128,128,0.3)' }}
            >
              {isEdit ? t('personal.habit.saveChanges') : t('personal.habit.addHabit')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}

/* ================================================================
   Delete Confirm Modal
   ================================================================ */

export function DeleteConfirmModal({ open, habitName, onConfirm, onCancel }: {
  open: boolean;
  habitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <MotionModal open={open} onClose={onCancel} className="sm:max-w-sm p-0 overflow-hidden border-foreground/[0.08]">
      <div>
        <div className="h-[2px] bg-gradient-to-r from-red-500/60 via-red-400/30 to-transparent" />

        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
            <Trash2 size={15} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground">{t('personal.habit.deleteHabit')}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{t('personal.habit.deleteWarning')}</p>
          </div>
          <IconButton onClick={onCancel} aria-label="닫기">
            <X />
          </IconButton>
        </div>

        <div className="px-5 pt-4 pb-5">
          <p className="text-sm text-muted-foreground mb-4">
            {t('personal.habit.deleteConfirm', { name: habitName })}
          </p>

          <div className="flex items-center justify-between pt-3 border-t border-foreground/[0.08]">
            <span className="text-xs text-slate-600 select-none">Esc 닫기</span>
            <button
              onClick={onConfirm}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-500/90 transition-colors"
            >
              <Trash2 size={13} />
              {t('common.delete')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}

export function CheckInConfirmModal({ open, habitName, habitIcon, streakCount, isUndo, isNonToday, onConfirm, onCancel }: {
  open: boolean;
  habitName: string;
  habitIcon?: string;
  streakCount?: number;
  isUndo?: boolean;
  isNonToday?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  const headerIcon = isUndo
    ? <RotateCcw size={15} className="text-amber-400" />
    : isNonToday
      ? <Calendar size={15} className="text-blue-400" />
      : habitIcon
        ? <span className="text-base">{habitIcon}</span>
        : <CheckCircle2 size={15} className="text-bridge-secondary" />;

  const headerBg = isUndo ? 'bg-amber-500/10' : isNonToday ? 'bg-blue-500/10' : 'bg-bridge-secondary/10';
  const accentColor = isUndo ? '#F59E0B' : isNonToday ? '#3B82F6' : '#2DD4BF';
  const btnClass = isUndo
    ? 'bg-amber-500 hover:bg-amber-500/90'
    : isNonToday
      ? 'bg-blue-500 hover:bg-blue-500/90'
      : 'bg-bridge-secondary hover:bg-bridge-secondary/90';

  return (
    <MotionModal open={open} onClose={onCancel} className="sm:max-w-sm p-0 overflow-hidden border-foreground/[0.08]">
      <div>
        <div className="h-[2px]" style={{ background: `linear-gradient(to right, ${accentColor}88, ${accentColor}44, transparent)` }} />

        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className={`w-8 h-8 rounded-lg ${headerBg} flex items-center justify-center shrink-0`}>
            {headerIcon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground">
              {isUndo
                ? t('personal.habit.undoTitle', '완료 취소')
                : isNonToday
                  ? t('personal.habit.nonTodayCheckInTitle', '오늘 해당 요일 아님')
                  : t('personal.habit.checkInTitle', '습관 완료')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isUndo
                ? t('personal.habit.undoSubtitle', '완료를 취소하시겠습니까?')
                : isNonToday
                  ? t('personal.habit.nonTodayCheckInSubtitle', '이 습관은 오늘 지정된 요일이 아닙니다')
                  : t('personal.habit.checkInSubtitle', '오늘의 습관을 완료하시겠습니까?')}
            </p>
          </div>
          <IconButton onClick={onCancel} aria-label="닫기">
            <X />
          </IconButton>
        </div>

        <div className="px-5 pt-4 pb-5">
          <p className="text-sm text-muted-foreground">
            {isUndo
              ? t('personal.habit.undoConfirm', { name: habitName, defaultValue: '"{{name}}"의 완료를 취소하시겠습니까?' })
              : isNonToday
                ? t('personal.habit.nonTodayCheckInConfirm', { name: habitName, defaultValue: '"{{name}}"은(는) 오늘 해당하는 요일이 아닙니다. 그래도 완료 처리하시겠습니까?' })
                : t('personal.habit.checkInConfirm', { name: habitName, defaultValue: '"{{name}}"을(를) 완료 처리하시겠습니까?' })}
          </p>
          {!isUndo && !isNonToday && streakCount != null && streakCount > 0 && (
            <p className="text-xs text-orange-400 mt-2 flex items-center gap-1">
              <Flame size={12} />
              {t('personal.habit.checkInStreak', { count: streakCount, defaultValue: '{{count}}주 연속 달성 중!' })}
            </p>
          )}

          <div className="flex items-center justify-between pt-3 mt-4 border-t border-foreground/[0.08]">
            <span className="text-xs text-slate-600 select-none">Esc 닫기</span>
            <button
              onClick={onConfirm}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-bold rounded-lg transition-colors ${btnClass}`}
            >
              {isUndo
                ? t('personal.habit.undoComplete', '취소하기')
                : isNonToday
                  ? t('personal.habit.nonTodayCheckInComplete', '그래도 완료')
                  : t('personal.habit.checkInComplete', '완료')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}

export function TaskCompleteConfirmModal({ open, taskName, isUndo, onConfirm, onCancel }: {
  open: boolean;
  taskName: string;
  isUndo?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  const accentColor = isUndo ? '#F59E0B' : '#6366F1';

  return (
    <MotionModal open={open} onClose={onCancel} className="sm:max-w-sm p-0 overflow-hidden border-foreground/[0.08]">
      <div>
        <div className="h-[2px]" style={{ background: `linear-gradient(to right, ${accentColor}88, ${accentColor}44, transparent)` }} />

        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <div className={`w-8 h-8 rounded-lg ${isUndo ? 'bg-amber-500/10' : 'bg-bridge-accent/10'} flex items-center justify-center shrink-0`}>
            {isUndo ? (
              <RotateCcw size={15} className="text-amber-400" />
            ) : (
              <ListTodo size={15} className="text-bridge-accent" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground">
              {isUndo
                ? t('personal.task.undoTitle', '완료 취소')
                : t('personal.task.completeTitle', '할 일 완료')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isUndo
                ? t('personal.task.undoSubtitle', '완료를 취소하시겠습니까?')
                : t('personal.task.completeSubtitle', '할 일을 완료하시겠습니까?')}
            </p>
          </div>
          <IconButton onClick={onCancel} aria-label="닫기">
            <X />
          </IconButton>
        </div>

        <div className="px-5 pt-4 pb-5">
          <p className="text-sm text-muted-foreground">
            {isUndo
              ? t('personal.task.undoConfirm', { name: taskName, defaultValue: '"{{name}}"의 완료를 취소하시겠습니까?' })
              : t('personal.task.completeConfirm', { name: taskName, defaultValue: '"{{name}}"을(를) 완료 처리하시겠습니까?' })}
          </p>

          <div className="flex items-center justify-between pt-3 mt-4 border-t border-foreground/[0.08]">
            <span className="text-xs text-slate-600 select-none">Esc 닫기</span>
            <button
              onClick={onConfirm}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-bold rounded-lg transition-colors ${
                isUndo ? 'bg-amber-500 hover:bg-amber-500/90' : 'bg-bridge-accent hover:bg-bridge-accent/90'
              }`}
            >
              {isUndo
                ? t('personal.task.undoComplete', '취소하기')
                : t('personal.task.completeComplete', '완료')}
            </button>
          </div>
        </div>
      </div>
    </MotionModal>
  );
}
