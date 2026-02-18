import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Flame, CheckCircle2, Trash2, X, Loader2,
  ChevronDown, ChevronUp, Hash, Pencil, MoreHorizontal,
  TrendingUp, Target, Calendar, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { personalHabitAPI } from '../../utils/api';
import type { PersonalHabit, HabitTodayItem, HabitFrequency } from '../../types';

/* ================================================================
   Constants
   ================================================================ */

const HABIT_COLORS = [
  '#8B5CF6', '#6366F1', '#EC4899', '#F43F5E',
  '#F59E0B', '#10B981', '#06B6D4', '#3B82F6',
];

const HABIT_ICONS = [
  '🏃', '📚', '💧', '🧘', '💪', '🎯', '✍️', '🎵',
  '🧠', '🌿', '💊', '🍎', '😴', '🚶', '🧹', '📵',
];

const FREQ_PRESETS: { value: HabitFrequency; label: string }[] = [
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

const FREQ_LABELS: Record<HabitFrequency, string> = {
  DAILY: 'Every day',
  WEEKDAY: 'Weekdays',
  WEEKEND: 'Weekends',
  CUSTOM: 'Custom',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatFrequency(habit: PersonalHabit): string {
  if (habit.frequency_type === 'CUSTOM' && habit.frequency_days) {
    const days = habit.frequency_days.split(',').map(Number);
    return days.map(d => DAY_NAMES[d]).join(', ');
  }
  return FREQ_LABELS[habit.frequency_type] || habit.frequency_type;
}

/* ================================================================
   PersonalHabits — Main Tab Component
   ================================================================ */

export function PersonalHabits() {
  const [habits, setHabits] = useState<PersonalHabit[]>([]);
  const [todayItems, setTodayItems] = useState<HabitTodayItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editHabit, setEditHabit] = useState<PersonalHabit | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [allHabits, today] = await Promise.all([
        personalHabitAPI.getAll(),
        personalHabitAPI.getToday(),
      ]);
      setHabits(allHabits.filter(h => h.is_active));
      setTodayItems(today);
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
    const totalCurrentStreak = habits.reduce((sum, h) => sum + h.current_streak, 0);
    return { total, todayCompleted, todayTotal, bestStreak, totalCurrentStreak };
  }, [habits, todayItems]);

  const handleCheckIn = async (habitId: string) => {
    try {
      const updated = await personalHabitAPI.checkIn(habitId);
      setTodayItems(prev => prev.map(h => h.habit_id === habitId ? updated : h));
    } catch {
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
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent/50" />
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
            <h2 className="text-lg md:text-xl font-bold text-white">Habits</h2>
            {habits.length > 0 && (
              <span className="text-xs font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">
                {habits.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-500 text-white text-sm font-bold rounded-xl hover:bg-purple-500/90 transition-all"
          >
            <Plus size={16} />
            New Habit
          </button>
        </div>

        {/* Stats Cards */}
        {habits.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Target size={16} className="text-purple-400" />}
              label="Today"
              value={`${stats.todayCompleted}/${stats.todayTotal}`}
              sub={stats.todayTotal > 0 ? `${Math.round((stats.todayCompleted / stats.todayTotal) * 100)}%` : '—'}
            />
            <StatCard
              icon={<Flame size={16} className="text-orange-400" />}
              label="Active Streaks"
              value={String(stats.totalCurrentStreak)}
              sub="combined days"
            />
            <StatCard
              icon={<TrendingUp size={16} className="text-emerald-400" />}
              label="Best Streak"
              value={String(stats.bestStreak)}
              sub="days"
            />
            <StatCard
              icon={<Zap size={16} className="text-amber-400" />}
              label="Total Habits"
              value={String(stats.total)}
              sub="tracking"
            />
          </div>
        )}

        {/* Today's Habits */}
        {todayItems.length > 0 && (
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
              Today&apos;s Progress
            </h3>
            <div className="space-y-1.5">
              {todayItems.map(item => {
                const habit = habits.find(h => h.id === item.habit_id);
                return (
                  <motion.div
                    key={item.habit_id}
                    layout
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer ${
                      item.is_completed
                        ? 'bg-bridge-secondary/5 border border-bridge-secondary/20'
                        : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]'
                    }`}
                    onClick={() => handleCheckIn(item.habit_id)}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        item.is_completed
                          ? 'bg-bridge-secondary border-bridge-secondary'
                          : 'border-white/20 hover:border-purple-400'
                      }`}
                    >
                      {item.is_completed && <CheckCircle2 size={12} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${
                        item.is_completed ? 'line-through text-slate-500' : 'text-white'
                      }`}>
                        {item.icon && <span className="mr-1.5">{item.icon}</span>}
                        {item.title}
                      </div>
                      {item.target_count > 1 && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {item.completed_count}/{item.target_count}{item.unit ? ` ${item.unit}` : ''}
                        </div>
                      )}
                    </div>
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

        {/* All Habits List */}
        <section>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">
            {habits.length > 0 ? 'All Habits' : ''}
          </h3>

          {habits.length === 0 ? (
            <EmptyState onAdd={() => setIsCreateOpen(true)} />
          ) : (
            <div className="space-y-2">
              {habits.map(habit => (
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
      <AnimatePresence>
        {isCreateOpen && (
          <HabitFormModal
            onClose={() => setIsCreateOpen(false)}
            onSubmit={handleCreate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editHabit && (
          <HabitFormModal
            habit={editHabit}
            onClose={() => setEditHabit(null)}
            onSubmit={(data) => handleUpdate(editHabit.id, data)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm && (
          <DeleteConfirmModal
            habitName={habits.find(h => h.id === deleteConfirm)?.title || ''}
            onConfirm={() => handleDelete(deleteConfirm)}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>
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
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-bridge-obsidian rounded-xl border border-white/5 p-3 md:p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      </div>
      <div className="text-xl md:text-2xl font-bold text-white">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </motion.div>
  );
}

/* ================================================================
   Empty State
   ================================================================ */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-4">
        <Flame size={32} className="text-purple-400" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">Start building habits</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-xs">
        Track daily routines, build streaks, and stay consistent with your goals.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 bg-purple-500 text-white text-sm font-bold rounded-xl hover:bg-purple-500/90 transition-all"
      >
        <Plus size={16} />
        Add Your First Habit
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
  const [showMenu, setShowMenu] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="group bg-bridge-obsidian rounded-xl border border-white/5 hover:border-white/10 p-4 transition-all"
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
            <h4 className="text-sm font-bold text-white truncate">{habit.title}</h4>
            {habit.current_streak > 0 && (
              <div className="flex items-center gap-0.5 text-[10px] text-orange-400 font-bold flex-shrink-0 bg-orange-400/10 px-1.5 py-0.5 rounded-full">
                <Flame size={10} />
                {habit.current_streak}d
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Calendar size={10} />
              {formatFrequency(habit)}
            </span>
            {habit.target_count > 1 && (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Target size={10} />
                {habit.target_count}{habit.unit ? ` ${habit.unit}` : ''}
              </span>
            )}
            {habit.best_streak > 0 && (
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <TrendingUp size={10} />
                Best: {habit.best_streak}d
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
            className="p-1.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 z-50 bg-bridge-obsidian border border-white/10 rounded-xl shadow-2xl py-1 min-w-[120px]">
                <button
                  onClick={() => { setShowMenu(false); onEdit(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 transition-colors"
                >
                  <Pencil size={12} />
                  Edit
                </button>
                <button
                  onClick={() => { setShowMenu(false); onDelete(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-400/5 transition-colors"
                >
                  <Trash2 size={12} />
                  Delete
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

interface HabitFormData {
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  frequency_type?: HabitFrequency;
  frequency_days?: string;
  target_count?: number;
  unit?: string;
}

function HabitFormModal({ habit, onClose, onSubmit }: {
  habit?: PersonalHabit;
  onClose: () => void;
  onSubmit: (data: HabitFormData) => void;
}) {
  const isEdit = !!habit;

  const [title, setTitle] = useState(habit?.title || '');
  const [frequencyType, setFrequencyType] = useState<HabitFrequency>(habit?.frequency_type || 'DAILY');
  const [customDays, setCustomDays] = useState<number[]>(
    habit?.frequency_days ? habit.frequency_days.split(',').map(Number) : [],
  );
  const [showMore, setShowMore] = useState(isEdit);

  const [icon, setIcon] = useState(habit?.icon || '');
  const [color, setColor] = useState(habit?.color || HABIT_COLORS[0]);
  const [goalType, setGoalType] = useState<'check' | 'count'>(
    (habit?.target_count || 1) > 1 ? 'count' : 'check',
  );
  const [targetCount, setTargetCount] = useState(habit?.target_count || 1);
  const [unit, setUnit] = useState(habit?.unit || '');
  const [description, setDescription] = useState(habit?.description || '');

  const isValid = title.trim().length > 0 && (frequencyType !== 'CUSTOM' || customDays.length > 0);

  const toggleDay = (day: number) => {
    setCustomDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({
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
            <h3 className="text-base md:text-lg font-bold text-white">
              {isEdit ? 'Edit Habit' : 'New Habit'}
            </h3>
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
              {FREQ_PRESETS.map(({ value, label }) => (
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

                {/* Target + Unit */}
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
            {isEdit ? 'Save Changes' : 'Add Habit'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ================================================================
   Delete Confirm Modal
   ================================================================ */

function DeleteConfirmModal({ habitName, onConfirm, onCancel }: {
  habitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm bg-bridge-obsidian rounded-2xl border border-white/10 p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <Trash2 size={18} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Delete Habit</h3>
            <p className="text-xs text-slate-400 mt-0.5">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-6">
          Are you sure you want to delete <span className="font-bold text-white">&ldquo;{habitName}&rdquo;</span>?
          All streak data and history will be permanently lost.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-bold text-slate-400 hover:text-white border border-white/10 rounded-xl hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-500/90 transition-all"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
}
