import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Plus, Check, AlertTriangle, Clock, Calendar, CalendarDays,
  Inbox, Trash2, Flag, X, CalendarClock, Package, ChevronDown,
} from 'lucide-react';
import { personalTaskAPI } from '../../utils/api';
import { PersonalTask, PersonalTaskPriority } from '../../types';
import {
  getDDay, getDeadlineGroup, getWeekRangeLabel, getTodayDateString,
  type DeadlineGroup, type DdayUrgency,
} from '../../utils/dateUtils';

// ── Types ───────────────────────────────────────────────────

interface PersonalTaskBoardProps {
  tasks: PersonalTask[];
  onRefresh: () => void;
}

type SortBy = 'deadline' | 'priority' | 'created';

// ── Constants ───────────────────────────────────────────────

const GROUP_ORDER: DeadlineGroup[] = [
  'overdue', 'today', 'tomorrow', 'thisWeek', 'nextWeek', 'later', 'noDate',
];

const PRIORITY_ORDER: Record<PersonalTaskPriority, number> = {
  URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0,
};

const PRIORITY_CONFIG: Record<PersonalTaskPriority, { label: string; color: string; dot: string }> = {
  NONE:   { label: '없음', color: '',              dot: '' },
  LOW:    { label: '낮음', color: 'text-blue-400',   dot: 'bg-blue-400' },
  MEDIUM: { label: '보통', color: 'text-amber-400',  dot: 'bg-amber-400' },
  HIGH:   { label: '높음', color: 'text-orange-500', dot: 'bg-orange-500' },
  URGENT: { label: '긴급', color: 'text-red-500',    dot: 'bg-red-500' },
};

const DDAY_STYLES: Record<DdayUrgency, string> = {
  overdue: 'bg-red-500/15 text-red-400',
  today:   'bg-orange-500/15 text-orange-400',
  soon:    'bg-amber-500/15 text-amber-400',
  normal:  'bg-white/5 text-slate-400',
  none:    '',
};

const GROUP_CONFIG: Record<DeadlineGroup, { icon: React.ElementType; color: string; bg: string }> = {
  overdue:  { icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-500/10' },
  today:    { icon: Clock,         color: 'text-orange-400', bg: 'bg-orange-500/10' },
  tomorrow: { icon: CalendarClock, color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  thisWeek: { icon: Calendar,      color: 'text-slate-400',  bg: 'bg-white/5' },
  nextWeek: { icon: CalendarDays,  color: 'text-slate-400',  bg: 'bg-white/5' },
  later:    { icon: Package,       color: 'text-slate-500',  bg: 'bg-white/5' },
  noDate:   { icon: Inbox,         color: 'text-slate-500',  bg: 'bg-white/5' },
};

// ── Main Component ──────────────────────────────────────────

export function PersonalTaskBoard({ tasks, onRefresh }: PersonalTaskBoardProps) {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortBy>('deadline');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);

  // Quick add
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState(getTodayDateString());
  const [newPriority, setNewPriority] = useState<PersonalTaskPriority>('NONE');
  const [isAddFocused, setIsAddFocused] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

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

  // ── Group by deadline ──
  const groupedTasks = useMemo(() => {
    const groups = new Map<DeadlineGroup, PersonalTask[]>();
    GROUP_ORDER.forEach(g => groups.set(g, []));

    for (const task of activeTasks) {
      const group = getDeadlineGroup(task.due_date);
      groups.get(group)!.push(task);
    }

    // Sort within each group
    for (const [, list] of groups) {
      list.sort((a, b) => {
        if (sortBy === 'priority') {
          const pd = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
          if (pd !== 0) return pd;
        }
        if (sortBy === 'created') {
          return (b.created_at ?? '').localeCompare(a.created_at ?? '');
        }
        // Default: due date asc, then position
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return a.position - b.position;
      });
    }

    return groups;
  }, [activeTasks, sortBy]);

  // ── Handlers ──
  const handleAddTask = async () => {
    if (!newTitle.trim()) return;
    try {
      await personalTaskAPI.create({
        title: newTitle.trim(),
        due_date: newDueDate || undefined,
        priority: newPriority !== 'NONE' ? newPriority : undefined,
      });
      setNewTitle('');
      setNewDueDate(getTodayDateString());
      setNewPriority('NONE');
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
      if (expandedTaskId === taskId) setExpandedTaskId(null);
      onRefresh();
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleUpdate = async (taskId: string, data: {
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
  };

  // ── Group label ──
  function groupLabel(group: DeadlineGroup): string {
    switch (group) {
      case 'overdue':  return t('personal.tasks.overdue', '기한 지남');
      case 'today':    return t('personal.tasks.today', '오늘');
      case 'tomorrow': return t('personal.tasks.tomorrow', '내일');
      case 'thisWeek': return `${t('personal.tasks.thisWeek', '이번 주')} (${getWeekRangeLabel('thisWeek')})`;
      case 'nextWeek': return `${t('personal.tasks.nextWeek', '다음 주')} (${getWeekRangeLabel('nextWeek')})`;
      case 'later':    return t('personal.tasks.later', '나중에');
      case 'noDate':   return t('personal.tasks.noDate', '마감일 없음');
    }
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">

        {/* ── Quick Add Bar ── */}
        <div className={`bg-bridge-obsidian rounded-xl border transition-all ${
          isAddFocused ? 'border-bridge-accent/50 shadow-lg shadow-bridge-accent/5' : 'border-white/10'
        }`}>
          <div className="flex items-center gap-3 px-4 py-3">
            <Plus size={18} className={isAddFocused ? 'text-bridge-accent' : 'text-slate-500'} />
            <input
              ref={addInputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onFocus={() => setIsAddFocused(true)}
              onBlur={() => { if (!newTitle.trim()) setIsAddFocused(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddTask();
                if (e.key === 'Escape') {
                  setNewTitle(''); setNewDueDate(getTodayDateString()); setNewPriority('NONE');
                  setIsAddFocused(false);
                  addInputRef.current?.blur();
                }
              }}
              placeholder={t('personal.tasks.addPlaceholder', '할 일 추가...')}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
            />
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="bg-transparent text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1 outline-none focus:border-bridge-accent/50 [color-scheme:dark] w-[130px]"
            />
            <PriorityDropdown value={newPriority} onChange={setNewPriority} />
          </div>
          <AnimatePresence>
            {isAddFocused && newTitle.trim() && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Sort Bar ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              {t('personal.tasks.active', '활성')}
              <span className="ml-1 text-bridge-secondary font-bold">{activeTasks.length}</span>
            </span>
            <span className="text-white/10">·</span>
            <span className="text-xs text-slate-400">
              {t('personal.tasks.completed', '완료됨')}
              <span className="ml-1 text-emerald-400 font-bold">{completedTasks.length}</span>
            </span>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="bg-white/5 border border-white/10 rounded-lg text-xs text-slate-400 px-2 py-1.5 outline-none focus:border-bridge-accent/50 [color-scheme:dark]"
          >
            <option value="deadline">{t('personal.tasks.sortDeadline', '마감일순')}</option>
            <option value="priority">{t('personal.tasks.sortPriority', '우선순위순')}</option>
            <option value="created">{t('personal.tasks.sortCreated', '생성순')}</option>
          </select>
        </div>

        {/* ── Active Tasks: Grouped by deadline ── */}
        <div className="space-y-6">
          {GROUP_ORDER.map(group => {
            const list = groupedTasks.get(group) || [];
            if (list.length === 0) return null;

            const cfg = GROUP_CONFIG[group];
            const Icon = cfg.icon;

            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1 rounded-md ${cfg.bg}`}>
                    <Icon size={14} className={cfg.color} />
                  </div>
                  <span className="text-xs font-bold text-slate-300">{groupLabel(group)}</span>
                  <span className={`text-[10px] font-bold ${cfg.color}`}>{list.length}</span>
                </div>

                <div className="space-y-1">
                  <AnimatePresence>
                    {list.map(task => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        isExpanded={expandedTaskId === task.id}
                        onToggleComplete={() => handleToggleComplete(task)}
                        onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                        onDelete={() => handleDelete(task.id)}
                        onUpdate={(data) => handleUpdate(task.id, data)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}

          {activeTasks.length === 0 && (
            <div className="text-center py-16">
              <Inbox size={48} className="mx-auto text-slate-600 mb-4" />
              <p className="text-slate-400 text-sm mb-1">{t('personal.tasks.emptyActive', '할 일이 없습니다')}</p>
              <p className="text-slate-600 text-xs">{t('personal.tasks.emptyActiveHint', '위 입력창에 새로운 할 일을 추가해보세요')}</p>
            </div>
          )}
        </div>

        {/* ── Completed Section (collapsible) ── */}
        {completedTasks.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 w-full py-2 group/completed"
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

            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1 pt-2">
                    {completedTasks.map(task => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        isExpanded={expandedTaskId === task.id}
                        onToggleComplete={() => handleToggleComplete(task)}
                        onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                        onDelete={() => handleDelete(task.id)}
                        onUpdate={(data) => handleUpdate(task.id, data)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TaskItem ────────────────────────────────────────────────

function TaskItem({ task, isExpanded, onToggleComplete, onToggleExpand, onDelete, onUpdate }: {
  task: PersonalTask;
  isExpanded: boolean;
  onToggleComplete: () => void;
  onToggleExpand: () => void;
  onDelete: () => void;
  onUpdate: (data: { title?: string; due_date?: string | null; priority?: PersonalTaskPriority; description?: string }) => void;
}) {
  const isDone = task.status === 'DONE';
  const dday = getDDay(task.due_date);
  const priorityCfg = PRIORITY_CONFIG[task.priority];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="group"
    >
      {/* Main Row */}
      <div
        onClick={onToggleExpand}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
          isDone
            ? 'bg-white/[0.02] hover:bg-white/[0.04]'
            : 'bg-bridge-obsidian hover:bg-white/[0.06] border border-white/5 hover:border-white/10'
        }`}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
            isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 hover:border-bridge-accent'
          }`}
        >
          {isDone && <Check size={12} className="text-white" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <span className={`text-sm ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
            {task.title}
          </span>
          {(task.tags?.length > 0 || task.checklists?.length > 0 || task.category) && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {task.category && (
                <span className="text-[10px] text-slate-500">{task.category}</span>
              )}
              {task.tags?.map(tag => (
                <span
                  key={tag.id}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-slate-400"
                  style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : {}}
                >
                  {tag.name}
                </span>
              ))}
              {task.checklists && task.checklists.length > 0 && (
                <span className="text-[10px] text-slate-500">
                  ✓ {task.checklists.filter(c => c.is_completed).length}/{task.checklists.length}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: priority dot + D-day badge + delete */}
        <div className="flex items-center gap-2 shrink-0">
          {task.priority !== 'NONE' && (
            <div className={`w-2 h-2 rounded-full ${priorityCfg.dot}`} title={priorityCfg.label} />
          )}
          {dday.urgency !== 'none' && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${DDAY_STYLES[dday.urgency]}`}>
              {dday.text}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Expanded Edit */}
      <AnimatePresence>
        {isExpanded && (
          <TaskExpanded task={task} onUpdate={onUpdate} onDelete={onDelete} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── TaskExpanded (inline edit) ──────────────────────────────

function TaskExpanded({ task, onUpdate, onDelete }: {
  task: PersonalTask;
  onUpdate: (data: { title?: string; due_date?: string | null; priority?: PersonalTaskPriority; description?: string }) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(task.title);
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [description, setDescription] = useState(task.description ?? '');

  const save = (patch: Parameters<typeof onUpdate>[0]) => {
    // Only send changed fields
    const filtered: typeof patch = {};
    if (patch.title !== undefined && patch.title !== task.title) filtered.title = patch.title;
    if (patch.due_date !== undefined && patch.due_date !== (task.due_date ?? '')) filtered.due_date = patch.due_date;
    if (patch.priority !== undefined && patch.priority !== task.priority) filtered.priority = patch.priority;
    if (patch.description !== undefined && patch.description !== (task.description ?? '')) filtered.description = patch.description;
    if (Object.keys(filtered).length > 0) onUpdate(filtered);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="ml-8 mt-1 p-3 bg-white/[0.03] rounded-xl border border-white/5 space-y-3">
        {/* Title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => save({ title })}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) save({ title }); }}
          className="w-full bg-transparent text-sm text-white outline-none border-b border-white/10 pb-2 focus:border-bridge-accent/50 transition-colors"
        />

        {/* Due date + Priority */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={12} className="text-slate-500" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); save({ due_date: e.target.value || null }); }}
              className="bg-transparent text-xs text-slate-400 outline-none [color-scheme:dark]"
            />
            {dueDate && (
              <button
                onClick={() => { setDueDate(''); save({ due_date: null }); }}
                className="p-0.5 text-slate-600 hover:text-red-400 transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Flag size={12} className="text-slate-500" />
            <PriorityInline
              value={priority}
              onChange={(p) => { setPriority(p); save({ priority: p }); }}
            />
          </div>
        </div>

        {/* Description */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => save({ description })}
          placeholder={t('personal.tasks.descPlaceholder', '메모 추가...')}
          rows={2}
          className="w-full bg-transparent text-xs text-slate-300 placeholder-slate-600 outline-none resize-none"
        />

        {/* Delete action */}
        <div className="flex justify-end pt-2 border-t border-white/5">
          <button
            onClick={onDelete}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-400 transition-colors"
          >
            <Trash2 size={10} />
            {t('common.delete', '삭제')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── PriorityDropdown (compact, for quick add bar) ───────────

function PriorityDropdown({ value, onChange }: {
  value: PersonalTaskPriority;
  onChange: (p: PersonalTaskPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  const ALL: PersonalTaskPriority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
        title="우선순위"
      >
        {value === 'NONE'
          ? <Flag size={12} className="text-slate-500" />
          : <div className={`w-3 h-3 rounded-full ${PRIORITY_CONFIG[value].dot}`} />
        }
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
                {p !== 'NONE' && <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].dot}`} />}
                {p === 'NONE' && <div className="w-2 h-2" />}
                {PRIORITY_CONFIG[p].label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── PriorityInline (for expanded edit) ──────────────────────

function PriorityInline({ value, onChange }: {
  value: PersonalTaskPriority;
  onChange: (p: PersonalTaskPriority) => void;
}) {
  const ALL: PersonalTaskPriority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  return (
    <div className="flex items-center gap-1">
      {ALL.map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`text-[10px] px-2 py-0.5 rounded-md transition-all ${
            value === p
              ? p === 'NONE'
                ? 'bg-white/10 text-white'
                : `bg-current/10 ${PRIORITY_CONFIG[p].color} font-bold`
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          }`}
          style={value === p && p !== 'NONE' ? {
            backgroundColor: `color-mix(in srgb, currentColor 15%, transparent)`,
          } : undefined}
        >
          {PRIORITY_CONFIG[p].label}
        </button>
      ))}
    </div>
  );
}
