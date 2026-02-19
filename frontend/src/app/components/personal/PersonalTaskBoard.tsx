import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Check, Trash2, Flag, Calendar, ChevronDown,
  Flame, CalendarClock, Zap, Archive, X, Pencil,
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { personalTaskAPI, personalHabitAPI } from '../../utils/api';
import { PersonalTask, PersonalTaskPriority, HabitTodayItem, PersonalHabit } from '../../types';
import { getDDay, getTodayDateString, type DdayUrgency } from '../../utils/dateUtils';
import { startOfDay, parseISO, addDays, format } from 'date-fns';
import { HabitFormModal, DeleteConfirmModal } from './PersonalHabits';
import type { HabitFormData } from './PersonalHabits';

// ── Types ─────────────────────────────────────────────────────

interface PersonalTaskBoardProps {
  tasks: PersonalTask[];
  onRefresh: () => void;
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
    color: 'text-slate-400', border: 'border-white/10', bg: 'bg-white/[0.02]',
    headerBg: 'bg-white/5', dropBorder: 'border-slate-400/50',
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
  normal:  'bg-white/5 text-slate-400',
  none:    '',
};

// ── Helpers ───────────────────────────────────────────────────

function getThisSaturday(): Date {
  const today = startOfDay(new Date());
  const day = today.getDay();
  const daysUntilSat = day === 6 ? 0 : (6 - day);
  return addDays(today, daysUntilSat);
}

function isTaskUrgent(dueDate: string | null): boolean {
  if (!dueDate) return true;
  const due = startOfDay(parseISO(dueDate));
  return due <= getThisSaturday();
}

function getNextMondayString(): string {
  const sat = getThisSaturday();
  return format(addDays(sat, 2), 'yyyy-MM-dd');
}

function getQuadrant(task: PersonalTask): Quadrant {
  const isImportant = task.priority === 'HIGH' || task.priority === 'URGENT';
  const urgent = isTaskUrgent(task.due_date);
  if (isImportant && urgent) return 'q1';
  if (isImportant) return 'q2';
  if (urgent) return 'q3';
  return 'q4';
}

function getHabitUrgencyRatio(habit: HabitTodayItem): number {
  const remaining = habit.weekly_target - habit.weekly_completed;
  if (remaining <= 0) return 0;
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const daysRemaining = dayOfWeek === 0 ? 1 : (7 - dayOfWeek + 1);
  return remaining / daysRemaining;
}

function getHabitQuadrant(habit: HabitTodayItem): Quadrant {
  const isImportant = habit.importance === 'HIGH';
  const isUrgent = getHabitUrgencyRatio(habit) >= 0.7;
  if (isImportant && isUrgent) return 'q1';
  if (isImportant) return 'q2';
  if (isUrgent) return 'q3';
  return 'q4';
}

// ── Main Component ────────────────────────────────────────────

export function PersonalTaskBoard({ tasks, onRefresh }: PersonalTaskBoardProps) {
  const { t } = useTranslation();
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverQuadrant, setDragOverQuadrant] = useState<Quadrant | null>(null);

  // Quick add
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState(getTodayDateString());
  const [newPriority, setNewPriority] = useState<PersonalTaskPriority>('MEDIUM');
  const [isAddFocused, setIsAddFocused] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  // ── Habits state ──
  const [todayHabits, setTodayHabits] = useState<HabitTodayItem[]>([]);
  const [allHabits, setAllHabits] = useState<PersonalHabit[]>([]);
  const [isHabitCreateOpen, setIsHabitCreateOpen] = useState(false);
  const [editHabitData, setEditHabitData] = useState<PersonalHabit | null>(null);
  const [deleteHabitId, setDeleteHabitId] = useState<string | null>(null);
  const [showHabitMenu, setShowHabitMenu] = useState(false);

  // Load habits
  const loadHabits = useCallback(async () => {
    try {
      const [today, all] = await Promise.all([
        personalHabitAPI.getToday(),
        personalHabitAPI.getAll(),
      ]);
      setTodayHabits(today);
      setAllHabits(all.filter(h => h.is_active));
    } catch (err) {
      console.error('Failed to load habits:', err);
    }
  }, []);

  useEffect(() => {
    loadHabits();
  }, [loadHabits]);

  // ── Filtered lists ──
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

  // Active habits (not yet met weekly goal, or today's check-in pending)
  const activeHabits = useMemo(
    () => todayHabits.filter(h => h.weekly_completed < h.weekly_target || !h.is_completed),
    [todayHabits],
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
    return result;
  }, [activeTasks]);

  const habitQuadrants = useMemo(() => {
    const result: Record<Quadrant, HabitTodayItem[]> = { q1: [], q2: [], q3: [], q4: [] };
    for (const habit of activeHabits) {
      result[getHabitQuadrant(habit)].push(habit);
    }
    return result;
  }, [activeHabits]);

  // ── Task Handlers ──
  const handleAddTask = async () => {
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

  const handleToggleComplete = async (task: PersonalTask) => {
    try {
      await personalTaskAPI.updateStatus(task.id, task.status === 'DONE' ? 'TODO' : 'DONE');
      onRefresh();
    } catch (error) {
      console.error('Failed to toggle task:', error);
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
      updates.due_date = getNextMondayString();
    }

    if (Object.keys(updates).length > 0) {
      handleUpdate(draggedTaskId, updates);
    }
    setDraggedTaskId(null);
    setDragOverQuadrant(null);
  }, [draggedTaskId, activeTasks, handleUpdate]);

  // ── Habit handlers ──
  const handleHabitCheckIn = useCallback(async (habitId: string) => {
    try {
      const updated = await personalHabitAPI.checkIn(habitId);
      setTodayHabits(prev => prev.map(h => h.habit_id === habitId ? updated : h));
    } catch {
      console.error('Failed to check in habit');
    }
  }, []);

  const handleHabitCreate = useCallback(async (data: HabitFormData) => {
    try {
      await personalHabitAPI.create(data);
      setIsHabitCreateOpen(false);
      await loadHabits();
    } catch (err) {
      console.error('Failed to create habit:', err);
    }
  }, [loadHabits]);

  const handleHabitUpdate = useCallback(async (habitId: string, data: HabitFormData) => {
    try {
      await personalHabitAPI.update(habitId, data);
      setEditHabitData(null);
      await loadHabits();
    } catch (err) {
      console.error('Failed to update habit:', err);
    }
  }, [loadHabits]);

  const handleHabitDelete = useCallback(async (habitId: string) => {
    try {
      await personalHabitAPI.delete(habitId);
      setDeleteHabitId(null);
      await loadHabits();
    } catch (err) {
      console.error('Failed to delete habit:', err);
    }
  }, [loadHabits]);

  const saturdayLabel = format(getThisSaturday(), 'M/d');
  const completedHabitsToday = todayHabits.filter(h => h.is_completed).length;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">

        {/* ── Quick Add Bar ── */}
        <div className={`bg-bridge-obsidian rounded-xl border transition-all ${
          isAddFocused ? 'border-bridge-accent/50 shadow-lg shadow-bridge-accent/5' : 'border-white/10'
        }`}>
          <div className="flex items-center gap-3 px-3 md:px-4 py-3">
            <Plus size={18} className={`shrink-0 ${isAddFocused ? 'text-bridge-accent' : 'text-slate-500'}`} />
            <input
              ref={addInputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onFocus={() => setIsAddFocused(true)}
              onBlur={() => { if (!newTitle.trim()) setIsAddFocused(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddTask();
                if (e.key === 'Escape') {
                  setNewTitle(''); setNewDueDate(getTodayDateString()); setNewPriority('MEDIUM');
                  setIsAddFocused(false);
                  addInputRef.current?.blur();
                }
              }}
              placeholder={t('personal.tasks.addPlaceholder', '할 일 추가...')}
              className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
            />
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="hidden sm:block bg-transparent text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1 outline-none focus:border-bridge-accent/50 [color-scheme:dark] w-[130px]"
            />
            <PriorityDropdown value={newPriority} onChange={setNewPriority} />
          </div>
          {isAddFocused && (
            <div className="sm:hidden px-3 pb-2">
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-400 border border-white/10 rounded-lg px-3 py-1.5 outline-none focus:border-bridge-accent/50 [color-scheme:dark]"
              />
            </div>
          )}
          {isAddFocused && newTitle.trim() && (
            <div className="px-4 pb-3">
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <span className="text-[10px] text-slate-500">Enter {t('personal.tasks.toAdd', '추가')} · Esc {t('common.cancel', '취소')}</span>
                <button
                  onClick={handleAddTask}
                  className="px-3 py-1 bg-bridge-accent text-white text-xs rounded-lg font-medium hover:bg-bridge-accent/90 transition-colors"
                >
                  {t('personal.tasks.add', '추가')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Stats Bar ── */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <span className="text-xs text-slate-400">
            {t('personal.tasks.active', '활성')}
            <span className="ml-1 text-bridge-secondary font-bold">{activeTasks.length}</span>
          </span>
          <span className="text-white/10">·</span>
          <span className="text-xs text-slate-400">
            {t('personal.tasks.completed', '완료됨')}
            <span className="ml-1 text-emerald-400 font-bold">{completedTasks.length}</span>
          </span>
          {todayHabits.length > 0 && (
            <>
              <span className="text-white/10">·</span>
              <span className="text-xs text-slate-400">
                <Flame size={11} className="inline text-purple-400 mr-0.5 -mt-0.5" />
                {t('personal.habit.habits', '습관')}
                <span className="ml-1 text-purple-400 font-bold">
                  {completedHabitsToday}/{todayHabits.length}
                </span>
              </span>
            </>
          )}
          <div className="flex-1" />
          {/* Habit management button */}
          <div className="relative">
            <button
              onClick={() => setShowHabitMenu(!showHabitMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-purple-400 bg-purple-400/10 hover:bg-purple-400/20 transition-colors"
            >
              <Flame size={12} />
              {t('personal.habit.manage', '습관 관리')}
            </button>
            {showHabitMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHabitMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-bridge-obsidian border border-white/10 rounded-xl shadow-2xl z-50 py-1 min-w-[180px]">
                  <button
                    onClick={() => { setShowHabitMenu(false); setIsHabitCreateOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/5 transition-colors"
                  >
                    <Plus size={14} className="text-purple-400" />
                    {t('personal.habit.newHabit', '새 습관 추가')}
                  </button>
                  <div className="h-px bg-white/5 mx-2 my-1" />
                  {allHabits.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-slate-500">{t('personal.habit.noHabits', '등록된 습관이 없습니다')}</div>
                  ) : (
                    allHabits.map(habit => (
                      <div key={habit.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors group">
                        <span className="text-sm">{habit.icon || '🔥'}</span>
                        <span className="flex-1 text-xs text-slate-300 truncate">{habit.title}</span>
                        <button
                          onClick={() => { setShowHabitMenu(false); setEditHabitData(habit); }}
                          className="p-0.5 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => { setShowHabitMenu(false); setDeleteHabitId(habit.id); }}
                          className="p-0.5 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            {t('personal.tasks.thisWeek', { date: saturdayLabel })}
          </span>
        </div>

        {/* ── Eisenhower Matrix ── */}
        <div className="space-y-0">
          {/* Column axis labels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-1.5">
            <div className="text-center hidden sm:block">
              <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-red-400/80">
                {t('personal.tasks.urgentColumn')}
              </span>
              <span className="text-[10px] text-slate-500 ml-1.5">~{saturdayLabel}</span>
            </div>
            <div className="text-center hidden sm:block">
              <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-slate-400/80">
                {t('personal.tasks.notUrgentColumn')}
              </span>
              <span className="text-[10px] text-slate-500 ml-1.5">{t('personal.tasks.nextWeekPlus')}</span>
            </div>
          </div>

          {/* Matrix 2x2 Grid */}
          <LayoutGroup>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {(['q1', 'q2', 'q3', 'q4'] as Quadrant[]).map(q => (
                <QuadrantCell
                  key={q}
                  quadrant={q}
                  tasks={taskQuadrants[q]}
                  habits={habitQuadrants[q]}
                  isDragOver={dragOverQuadrant === q}
                  draggedTaskId={draggedTaskId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOver={() => setDragOverQuadrant(q)}
                  onDragLeave={() => setDragOverQuadrant(null)}
                  onDrop={() => handleQuadrantDrop(q)}
                  onToggleComplete={handleToggleComplete}
                  onOpenModal={(id) => setModalTaskId(id)}
                  onUpdate={handleUpdate}
                  onHabitCheckIn={handleHabitCheckIn}
                />
              ))}
            </div>
          </LayoutGroup>

          {/* Row axis labels */}
          <div className="flex items-center gap-2 sm:gap-3 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-[10px] text-slate-500">{t('personal.tasks.importantLegend')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[10px] text-slate-500">{t('personal.tasks.normalLegend')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-4 rounded-full bg-purple-500" />
              <span className="text-[10px] text-slate-500">{t('personal.habit.habits', '습관')}</span>
            </div>
            <div className="flex-1" />
            <span className="text-[10px] text-slate-500 italic hidden sm:inline">{t('personal.tasks.dragToMove')}</span>
          </div>
        </div>

        {/* ── Completed Section ── */}
        {completedTasks.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 w-full py-2"
            >
              <div className="h-px flex-1 bg-white/5" />
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/[0.08] transition-colors">
                <Check size={12} className="text-emerald-400" />
                <span className="text-xs text-slate-400 font-medium">
                  {t('personal.tasks.completed', '완료됨')}
                  <span className="ml-1 text-emerald-400 font-bold">{completedTasks.length}</span>
                </span>
                <ChevronDown
                  size={12}
                  className={`text-slate-500 transition-transform ${showCompleted ? 'rotate-180' : ''}`}
                />
              </div>
              <div className="h-px flex-1 bg-white/5" />
            </button>

            {showCompleted && (
              <div className="space-y-1 pt-2">
                <AnimatePresence mode="popLayout">
                  {completedTasks.map(task => (
                    <motion.div
                      key={task.id}
                      layoutId={`task-${task.id}`}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
                    >
                      <CompletedTaskRow
                        task={task}
                        onToggleComplete={() => handleToggleComplete(task)}
                        onDelete={() => handleDelete(task.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Task Detail Modal ── */}
      {modalTaskId && (() => {
        const modalTask = tasks.find(t => t.id === modalTaskId);
        if (!modalTask) return null;
        return (
          <TaskDetailModal
            task={modalTask}
            onClose={() => setModalTaskId(null)}
            onUpdate={(data) => handleUpdate(modalTaskId, data)}
            onDelete={() => { handleDelete(modalTaskId); setModalTaskId(null); }}
            onToggleComplete={() => { handleToggleComplete(modalTask); }}
          />
        );
      })()}

      {/* ── Habit Modals ── */}
      <AnimatePresence>
        {isHabitCreateOpen && (
          <HabitFormModal
            onClose={() => setIsHabitCreateOpen(false)}
            onSubmit={handleHabitCreate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editHabitData && (
          <HabitFormModal
            habit={editHabitData}
            onClose={() => setEditHabitData(null)}
            onSubmit={(data) => handleHabitUpdate(editHabitData.id, data)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteHabitId && (
          <DeleteConfirmModal
            habitName={allHabits.find(h => h.id === deleteHabitId)?.title || ''}
            onConfirm={() => handleHabitDelete(deleteHabitId)}
            onCancel={() => setDeleteHabitId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── QuadrantCell ──────────────────────────────────────────────

function QuadrantCell({
  quadrant, tasks, habits, isDragOver, draggedTaskId,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  onToggleComplete, onOpenModal, onUpdate, onHabitCheckIn,
}: {
  quadrant: Quadrant;
  tasks: PersonalTask[];
  habits: HabitTodayItem[];
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
  onHabitCheckIn: (habitId: string) => void;
}) {
  const { t } = useTranslation();
  const cfg = QUADRANT_CONFIG[quadrant];
  const Icon = cfg.icon;
  const labelKeys = QUADRANT_LABEL_KEYS[quadrant];
  const totalCount = tasks.length + habits.length;

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
        rounded-xl border transition-all min-h-[180px] sm:min-h-[260px] flex flex-col
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
          <div className="flex items-center justify-center h-full min-h-[80px]">
            <span className="text-[10px] text-slate-600">{t('personal.tasks.empty')}</span>
          </div>
        )}

        {isDragOver && totalCount === 0 && (
          <div className="h-12 border border-dashed border-bridge-secondary/40 rounded-lg bg-bridge-secondary/5 flex items-center justify-center">
            <span className="text-[10px] text-bridge-secondary">{t('personal.tasks.dropHere')}</span>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {/* Habits first */}
          {habits.map(habit => (
            <motion.div
              key={`habit-${habit.habit_id}`}
              layoutId={`habit-${habit.habit_id}`}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.8 }}
            >
              <HabitMatrixCard
                habit={habit}
                onCheckIn={() => onHabitCheckIn(habit.habit_id)}
              />
            </motion.div>
          ))}

          {/* Then tasks */}
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

function HabitMatrixCard({ habit, onCheckIn }: {
  habit: HabitTodayItem;
  onCheckIn: () => void;
}) {
  const { t } = useTranslation();
  const urgencyRatio = getHabitUrgencyRatio(habit);

  return (
    <div
      onClick={onCheckIn}
      className={`
        flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer
        border transition-all
        ${habit.is_completed
          ? 'bg-purple-500/5 border-purple-500/20 opacity-60'
          : 'bg-bridge-obsidian border-white/5 hover:border-purple-400/30 hover:bg-purple-500/5'
        }
      `}
    >
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
          habit.is_completed ? 'line-through text-slate-500' : 'text-white'
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

      {/* Right side: dots + streak + check */}
      <div className="flex items-center gap-2 shrink-0">
        {habit.target_count > 1 && (
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(habit.target_count, 7) }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i >= habit.completed_count ? 'bg-white/[0.08] border border-white/10' : ''
                }`}
                style={i < habit.completed_count ? {
                  backgroundColor: habit.color || '#8B5CF6',
                  boxShadow: `0 0 4px ${habit.color || '#8B5CF6'}40`,
                } : {}}
              />
            ))}
            {habit.target_count > 7 && (
              <span className="text-[8px] text-slate-500">+{habit.target_count - 7}</span>
            )}
          </div>
        )}
        {habit.current_streak > 0 && (
          <div className="flex items-center gap-0.5 text-[9px] text-orange-400 font-bold">
            <Flame size={10} />
            {habit.current_streak}
          </div>
        )}
        <div className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-colors ${
          habit.is_completed
            ? 'bg-purple-500 border-purple-500'
            : 'border-purple-400/40 hover:border-purple-400'
        }`}>
          {habit.is_completed && <Check size={10} className="text-white" />}
        </div>
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
  const dday = getDDay(task.due_date);
  const priorityCfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.MEDIUM;
  const dateInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer?.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group"
    >
      <div
        onClick={onOpenModal}
        className={`
          flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-grab active:cursor-grabbing
          bg-bridge-obsidian border border-white/5 hover:border-white/10
          transition-all hover:bg-white/[0.04]
          ${isDragging ? 'opacity-40 rotate-1' : ''}
        `}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
          className="w-4 h-4 rounded-full border-[1.5px] border-slate-600 hover:border-bridge-accent flex items-center justify-center shrink-0 transition-colors"
        >
        </button>

        <div className="flex-1 min-w-0">
          <span className="text-[12px] text-white leading-tight line-clamp-2">{task.title}</span>
          {(task.checklists?.length > 0 || task.tags?.length > 0) && (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {task.tags?.map(tag => (
                <span
                  key={tag.id}
                  className="text-[9px] px-1 py-0 rounded bg-white/5 text-slate-400"
                  style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : {}}
                >
                  {tag.name}
                </span>
              ))}
              {task.checklists?.length > 0 && (
                <span className="text-[9px] text-slate-500">
                  ✓{task.checklists.filter(c => c.is_completed).length}/{task.checklists.length}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
      <button
        onClick={onToggleComplete}
        className="w-5 h-5 rounded-full bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center shrink-0"
      >
        <Check size={12} className="text-white" />
      </button>
      <span className="flex-1 text-sm line-through text-slate-500 truncate">{task.title}</span>
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

function TaskDetailModal({ task, onClose, onUpdate, onDelete, onToggleComplete }: {
  task: PersonalTask;
  onClose: () => void;
  onUpdate: (data: { title?: string; due_date?: string | null; priority?: PersonalTaskPriority; description?: string }) => void;
  onDelete: () => void;
  onToggleComplete: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [description, setDescription] = useState(task.description ?? '');
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(task.title);
    setDueDate(task.due_date ?? '');
    setPriority(task.priority);
    setDescription(task.description ?? '');
  }, [task]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const save = (patch: Parameters<typeof onUpdate>[0]) => {
    const filtered: typeof patch = {};
    if (patch.title !== undefined && patch.title !== task.title) filtered.title = patch.title;
    if (patch.due_date !== undefined && patch.due_date !== (task.due_date ?? '')) filtered.due_date = patch.due_date;
    if (patch.priority !== undefined && patch.priority !== task.priority) filtered.priority = patch.priority;
    if (patch.description !== undefined && patch.description !== (task.description ?? '')) filtered.description = patch.description;
    if (Object.keys(filtered).length > 0) onUpdate(filtered);
  };

  const isDone = task.status === 'DONE';
  const dday = getDDay(task.due_date);

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4"
    >
      <div
        className="bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl w-full sm:max-w-md overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
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
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => save({ title })}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { save({ title }); (e.target as HTMLInputElement).blur(); } }}
            className="w-full bg-transparent text-base font-bold text-white outline-none placeholder-slate-600"
            placeholder={t('personal.tasks.titlePlaceholder', '할 일 제목')}
          />

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
              <Calendar size={13} className="text-slate-400" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); save({ due_date: e.target.value || getTodayDateString() }); }}
                className="bg-transparent text-xs text-slate-300 outline-none [color-scheme:dark]"
              />
              {dday.urgency !== 'none' && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${DDAY_STYLES[dday.urgency]}`}>
                  {dday.text}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
              <Flag size={13} className="text-slate-400" />
              <PriorityInline
                value={priority}
                onChange={(p) => { setPriority(p); save({ priority: p }); }}
              />
            </div>
          </div>

          {task.tags?.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {task.tags.map(tag => (
                <span
                  key={tag.id}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400"
                  style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : {}}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {task.checklists?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {t('personal.tasks.checklist')} {task.checklists.filter(c => c.is_completed).length}/{task.checklists.length}
              </span>
              <div className="space-y-1">
                {task.checklists.map(item => (
                  <div key={item.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/[0.03]">
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      item.is_completed
                        ? 'bg-emerald-500/20 border-emerald-500/50'
                        : 'border-slate-600'
                    }`}>
                      {item.is_completed && <Check size={9} className="text-emerald-400" />}
                    </div>
                    <span className={`text-xs ${item.is_completed ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                      {item.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => save({ description })}
            placeholder={t('personal.tasks.descPlaceholder', '메모 추가...')}
            rows={3}
            className="w-full bg-white/[0.03] border border-white/5 rounded-xl p-3 text-sm text-slate-300 placeholder-slate-600 outline-none resize-none focus:border-bridge-accent/30 transition-colors"
          />

          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-[10px] text-slate-600">
              Esc {t('common.close', '닫기')}
            </span>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={12} />
              {t('common.delete', '삭제')}
            </button>
          </div>
        </div>
      </div>
    </div>
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
        className="p-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
        title={t('personal.tasks.priority')}
      >
        <div className={`w-3 h-3 rounded-full ${PRIORITY_CONFIG[value].dot}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-bridge-obsidian border border-white/10 rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
            {ALL.map(p => (
              <button
                key={p}
                onClick={() => { onChange(p); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 transition-colors ${
                  value === p ? 'text-white' : 'text-slate-400'
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
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
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
