import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock, CalendarDays, CheckCircle2, BookHeart, Sparkles,
  ArrowRight, Sun, Sunset, Moon, Loader2, Plus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { personalEventService, diaryService } from '../../utils/services';
import { checklistAPI, dailyChecklistAPI } from '../../utils/api';
import { getTodayDateString } from '../../utils/dateUtils';
import { PersonalEvent, DiaryDetail, DailyChecklistItem, Task } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

type TabType = 'overview' | 'kanban' | 'schedule' | 'diary' | 'calendar';

interface PersonalOverviewProps {
  boardId: string;
  tasks?: Task[];
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
      className="bg-bridge-obsidian rounded-2xl border border-white/5 p-4 md:p-5 flex flex-col min-h-[240px] md:min-h-[300px]"
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

  const nextIdx = timedEvents.findIndex(e => getStatus(e) === 'upcoming');

  const formatTimeRange = (ev: PersonalEvent) => {
    if (!ev.start_time) return '';
    const s = ev.start_time.slice(0, 5);
    const e = ev.end_time ? ev.end_time.slice(0, 5) : '';
    return e ? `${s} - ${e}` : s;
  };

  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

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
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 -mx-1 px-1">
          {/* Current time marker */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[11px] font-mono text-red-400">{currentTimeStr}</span>
            <div className="flex-1 h-px bg-red-400/20" />
          </div>

          {/* All-day events */}
          {allDayEvents.map(ev => (
            <button
              key={ev.id}
              onClick={onViewAll}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/5 transition-colors text-left"
            >
              <div className="w-1 h-6 rounded-full" style={{ backgroundColor: ev.color || '#6366F1' }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white truncate">{ev.title}</div>
                <div className="text-[10px] text-slate-500">All day</div>
              </div>
            </button>
          ))}

          {/* Timed events */}
          {timedEvents.map((ev, idx) => {
            const status = getStatus(ev);
            const isNext = idx === nextIdx && status === 'upcoming';
            return (
              <button
                key={ev.id}
                onClick={onViewAll}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors text-left ${
                  status === 'current'
                    ? 'bg-bridge-accent/10 border border-bridge-accent/20'
                    : isNext
                    ? 'bg-bridge-secondary/5 border border-bridge-secondary/10'
                    : status === 'past'
                    ? 'opacity-50 hover:opacity-70'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="w-1 h-6 rounded-full" style={{ backgroundColor: ev.color || '#6366F1' }} />
                <div className="w-[70px] md:w-[90px] flex-shrink-0">
                  <span className={`text-[11px] font-mono ${
                    status === 'current' ? 'text-bridge-accent' : 'text-slate-400'
                  }`}>
                    {formatTimeRange(ev)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${
                    status === 'current' ? 'text-white font-medium' : 'text-slate-300'
                  }`}>
                    {ev.title}
                  </div>
                </div>
                {status === 'current' && (
                  <span className="text-[9px] font-bold text-bridge-accent bg-bridge-accent/10 px-1.5 py-0.5 rounded-full">
                    NOW
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

// ── 우상단: This Month's Events ──────────────────────────────────────

function MonthEventsWidget({
  todayDate,
  onViewAll,
}: {
  todayDate: string;
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const today = new Date(todayDate + 'T00:00:00');
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });
  const year = today.getFullYear();
  const month = today.getMonth();

  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const data = await personalEventService.getWeekly(startDate, endDate);
        // Filter: today and future only, sort by date
        const filtered = data
          .filter(e => e.event_date >= todayDate)
          .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.start_time || '').localeCompare(b.start_time || ''));
        setEvents(filtered);
      } catch {
        console.error('Failed to load month events');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [todayDate, year, month]);

  const getDday = (eventDate: string) => {
    const ev = new Date(eventDate + 'T00:00:00');
    const diff = Math.round((ev.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const formatEventDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const displayEvents = events.slice(0, 8);
  const remaining = events.length - 8;

  return (
    <WidgetCard
      icon={<CalendarDays size={16} className="text-bridge-accent" />}
      title={monthName}
      badge={
        events.length > 0 ? (
          <span className="text-[10px] font-bold text-bridge-accent bg-bridge-accent/10 px-1.5 py-0.5 rounded-full">
            {events.length}
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
      ) : events.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <CalendarDays size={28} className="text-slate-600" />
          <p className="text-sm text-slate-500">{t('personal.overview.noMonthEvents', 'No upcoming events this month')}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 -mx-1 px-1">
          {displayEvents.map(ev => {
            const dday = getDday(ev.event_date);
            return (
              <button
                key={ev.id}
                onClick={onViewAll}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-1 h-6 rounded-full" style={{ backgroundColor: ev.color || '#6366F1' }} />
                <div className="w-[60px] flex-shrink-0">
                  <span className="text-[11px] text-slate-400">{formatEventDate(ev.event_date)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-300 truncate">{ev.title}</div>
                  {ev.start_time && (
                    <div className="text-[10px] text-slate-500">{ev.start_time.slice(0, 5)}</div>
                  )}
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  dday === 0
                    ? 'text-bridge-secondary bg-bridge-secondary/10'
                    : dday <= 3
                    ? 'text-amber-400 bg-amber-400/10'
                    : 'text-slate-400 bg-white/5'
                }`}>
                  {dday === 0 ? t('personal.overview.today', 'Today') : `D-${dday}`}
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

// ── 좌하단: Daily Checklist ──────────────────────────────────────────

function DailyChecklistWidget({
  boardId,
  todayDate,
  tasks: boardTasks,
  onViewAll,
}: {
  boardId: string;
  todayDate: string;
  tasks?: Task[];
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const [items, setItems] = useState<DailyChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadChecklist = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await dailyChecklistAPI.getDailyChecklist(boardId, todayDate);
      const allItems = data.columns.flatMap(col => col.items).sort((a, b) => a.position - b.position);
      setItems(allItems);
    } catch {
      console.error('Failed to load daily checklist');
    } finally {
      setIsLoading(false);
    }
  }, [boardId, todayDate]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length;
  const rate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleToggle = async (item: DailyChecklistItem) => {
    if (!item.checklist_item_id || !item.task?.id) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i));
    try {
      await checklistAPI.toggleItem(boardId, item.task.id, item.checklist_item_id);
    } catch {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i));
    }
  };

  // Get the first available task for quick add
  const defaultTaskId = boardTasks && boardTasks.length > 0 ? boardTasks[0].id : null;

  const handleAddItem = async () => {
    const title = newItemTitle.trim();
    if (!title || !defaultTaskId || !currentUser?.id) return;

    setIsAdding(true);
    try {
      await dailyChecklistAPI.addWithNewItem(boardId, {
        task_id: defaultTaskId,
        title,
        assignee_id: currentUser.id,
        assigned_date: todayDate,
      });
      setNewItemTitle('');
      await loadChecklist();
    } catch (err) {
      console.error('Failed to add daily checklist item:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAddItem();
    }
  };

  const canAdd = !!defaultTaskId && !!currentUser?.id;

  return (
    <WidgetCard
      icon={<CheckCircle2 size={16} className="text-purple-400" />}
      title={t('personal.overview.dailyChecklist', 'Daily Checklist')}
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
      ) : items.length === 0 && !canAdd ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <CheckCircle2 size={28} className="text-slate-600" />
          <p className="text-sm text-slate-500">{t('personal.overview.noChecklist', 'No checklist items today')}</p>
          <p className="text-[11px] text-slate-600">{t('personal.overview.addFromKanban', 'Add items from your Kanban board')}</p>
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

          {/* Items */}
          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 -mx-1 px-1">
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center gap-1.5 py-6">
                <CheckCircle2 size={24} className="text-slate-600" />
                <p className="text-xs text-slate-500">{t('personal.overview.noChecklist', 'No checklist items today')}</p>
              </div>
            )}
            {items.map(item => {
              const canToggle = !!item.checklist_item_id && !!item.task?.id;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors"
                >
                  <button
                    onClick={() => canToggle && handleToggle(item)}
                    disabled={!canToggle}
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      item.completed
                        ? 'bg-bridge-secondary border-bridge-secondary'
                        : canToggle
                        ? 'border-white/20 hover:border-bridge-secondary/50'
                        : 'border-white/10 opacity-50'
                    }`}
                  >
                    {item.completed && <CheckCircle2 size={10} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs truncate ${
                      item.completed ? 'line-through text-slate-500' : 'text-slate-300'
                    }`}>
                      {item.title}
                    </div>
                    {item.feature && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: item.feature.color || '#6366F1' }}
                        />
                        <span className="text-[10px] text-slate-500 truncate">{item.feature.title}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick add input */}
          {canAdd && (
            <div className="mt-2 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 px-2">
                <Plus size={14} className={`flex-shrink-0 ${newItemTitle.trim() ? 'text-purple-400' : 'text-slate-600'} transition-colors`} />
                <input
                  ref={inputRef}
                  type="text"
                  value={newItemTitle}
                  onChange={e => setNewItemTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('personal.overview.addChecklistItem', 'Add an item...')}
                  disabled={isAdding}
                  className="flex-1 bg-transparent text-xs text-white placeholder-slate-600 outline-none disabled:opacity-50"
                />
                {isAdding && <Loader2 size={12} className="animate-spin text-purple-400 flex-shrink-0" />}
              </div>
            </div>
          )}
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
        /* Not written yet */
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 md:gap-3 px-3 md:px-4">
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
        /* In progress */
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
        /* Completed */
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

export function PersonalOverview({ boardId, tasks, onNavigateTab }: PersonalOverviewProps) {
  const todayDate = getTodayDateString();

  return (
    <div className="h-full overflow-auto p-3 md:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-5 max-w-6xl mx-auto">
        <TodayScheduleWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('schedule')}
        />
        <MonthEventsWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('calendar')}
        />
        <DailyChecklistWidget
          boardId={boardId}
          todayDate={todayDate}
          tasks={tasks}
          onViewAll={() => onNavigateTab('kanban')}
        />
        <DiaryWidget
          todayDate={todayDate}
          onViewAll={() => onNavigateTab('diary')}
        />
      </div>
    </div>
  );
}
