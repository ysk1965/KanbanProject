import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Clock, CheckCircle2, Calendar, ListTodo, Loader2, Flame, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { personalDashboardAPI } from '../../utils/api';
import { PersonalDashboardToday, PersonalTask } from '../../types';
import { getDDay } from '../../utils/dateUtils';

interface TodaySidebarProps {
  tasks?: PersonalTask[];
  onTaskClick?: (taskId: string) => void;
}

export function TodaySidebar({ tasks, onTaskClick }: TodaySidebarProps) {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [todayData, setTodayData] = useState<PersonalDashboardToday | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTodayData = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await personalDashboardAPI.getToday();
      setTodayData(data);
    } catch (error) {
      console.error('Failed to load today data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTodayData();
  }, [loadTodayData]);

  const completionRate = todayData ? Math.round(todayData.task_completion_rate * 100) : 0;

  // Upcoming deadlines: overdue + within 3 days (from tasks prop)
  const upcomingDeadlines = useMemo(() => {
    if (!tasks) return [];
    return tasks
      .filter(t => t.status !== 'DONE' && t.status !== 'ARCHIVED' && t.due_date)
      .map(t => ({ ...t, dday: getDDay(t.due_date) }))
      .filter(t => t.dday.diff <= 3) // overdue + within 3 days
      .sort((a, b) => a.dday.diff - b.dday.diff);
  }, [tasks]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isCollapsed ? 'collapsed' : 'expanded'}
        initial={{ width: isCollapsed ? 280 : 44 }}
        animate={{ width: isCollapsed ? 44 : 280 }}
        transition={{ type: 'spring', duration: 0.3 }}
        className="h-full border-r border-white/[0.06] bg-bridge-obsidian/50 flex-shrink-0 overflow-hidden"
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center py-4">
            <button
              onClick={() => setIsCollapsed(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-bold text-white">{t('personal.today', 'Today')}</h3>
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
                </div>
              ) : todayData ? (
                <>
                  {/* Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                        {t('personal.progress', '진행률')}
                      </span>
                      <span className="text-xs font-bold text-bridge-secondary">
                        {completionRate}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${completionRate}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-full"
                      />
                    </div>
                  </div>

                  {/* Upcoming Deadlines (from tasks prop) */}
                  {upcomingDeadlines.length > 0 && (
                    <Section
                      icon={<AlertTriangle size={12} />}
                      title={t('personal.upcomingDeadlines', '다가오는 마감')}
                      count={upcomingDeadlines.length}
                      color="text-red-400"
                    >
                      {upcomingDeadlines.map((task) => {
                        const ddayStyle = task.dday.urgency === 'overdue'
                          ? 'text-red-400 font-bold'
                          : task.dday.urgency === 'today'
                          ? 'text-orange-400 font-bold'
                          : 'text-amber-400';
                        return (
                          <button
                            key={task.id}
                            onClick={() => onTaskClick?.(task.id)}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors flex items-center justify-between gap-2"
                          >
                            <span className="text-xs text-foreground truncate">{task.title}</span>
                            <span className={`text-[10px] shrink-0 ${ddayStyle}`}>{task.dday.text}</span>
                          </button>
                        );
                      })}
                    </Section>
                  )}

                  {/* Due Today */}
                  {!tasks && todayData.due_today_tasks.length > 0 && (
                    <Section
                      icon={<Clock size={12} />}
                      title={t('personal.dueToday', '오늘 마감')}
                      count={todayData.due_today_tasks.length}
                      color="text-orange-400"
                    >
                      {todayData.due_today_tasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          title={task.title}
                          subtitle={task.category ?? undefined}
                          completed={task.status === 'DONE'}
                          onClick={() => onTaskClick?.(task.id)}
                        />
                      ))}
                    </Section>
                  )}

                  {/* In Progress (shown when tasks prop not available) */}
                  {!tasks && todayData.in_progress_tasks.length > 0 && (
                    <Section
                      icon={<ListTodo size={12} />}
                      title={t('personal.inProgress', '진행중')}
                      count={todayData.in_progress_tasks.length}
                      color="text-bridge-accent"
                    >
                      {todayData.in_progress_tasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          title={task.title}
                          subtitle={task.category ?? undefined}
                          onClick={() => onTaskClick?.(task.id)}
                        />
                      ))}
                    </Section>
                  )}

                  {/* Personal Events */}
                  {todayData.personal_events.length > 0 && (
                    <Section
                      icon={<Calendar size={12} />}
                      title={t('personal.todayEvents', '오늘 일정')}
                      count={todayData.personal_events.length}
                      color="text-bridge-secondary"
                    >
                      {todayData.personal_events.map((event) => (
                        <div key={event.id} className="px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                          <div className="text-xs text-foreground truncate">{event.title}</div>
                          {event.start_time && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {event.start_time}{event.end_time ? ` - ${event.end_time}` : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </Section>
                  )}

                  {/* Habits Today */}
                  {todayData.habits_today.length > 0 && (
                    <Section
                      icon={<Flame size={12} />}
                      title={t('personal.habitsToday', '오늘 습관')}
                      count={todayData.habits_today.length}
                      color="text-purple-400"
                    >
                      {todayData.habits_today.map((item) => (
                        <div key={item.habit_id} className="flex items-center gap-2 px-2 py-1.5">
                          <div className={`w-3.5 h-3.5 rounded border ${
                            item.is_completed
                              ? 'bg-bridge-secondary border-bridge-secondary'
                              : 'border-white/20'
                          } flex items-center justify-center`}>
                            {item.is_completed && <CheckCircle2 size={10} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs ${item.is_completed ? 'line-through text-slate-500' : 'text-foreground'}`}>
                              {item.icon && <span className="mr-1">{item.icon}</span>}
                              {item.title}
                            </span>
                            {item.target_count > 1 && (
                              <span className="text-[10px] text-slate-500 ml-1">
                                {item.completed_count}/{item.target_count}{item.unit ? ` ${item.unit}` : ''}
                              </span>
                            )}
                          </div>
                          {item.current_streak > 0 && (
                            <span className="text-[10px] text-orange-400 font-bold">{item.current_streak}d</span>
                          )}
                        </div>
                      ))}
                    </Section>
                  )}

                  {/* Empty state */}
                  {todayData.due_today_tasks.length === 0 &&
                    todayData.in_progress_tasks.length === 0 &&
                    todayData.personal_events.length === 0 &&
                    todayData.habits_today.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-slate-500">{t('personal.noTodayItems', '오늘 항목이 없습니다')}</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function Section({
  icon,
  title,
  count,
  color,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className={color}>{icon}</span>
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{title}</span>
        <span className={`text-[10px] font-bold ${color}`}>{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function TaskItem({
  title,
  subtitle,
  completed,
  onClick,
}: {
  title: string;
  subtitle?: string;
  completed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
    >
      <div className={`text-xs truncate ${completed ? 'line-through text-slate-500' : 'text-foreground'}`}>
        {title}
      </div>
      {subtitle && (
        <div className="text-[10px] text-slate-500 truncate mt-0.5">{subtitle}</div>
      )}
    </button>
  );
}
