import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListTodo, Clock, AlertTriangle, CalendarDays, Loader2, ChevronRight, ChevronDown, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { userAPI, MyTasksBoardGroup } from '../../utils/api';
import { formatDate } from '../../utils/dateUtils';

type FilterType = 'today' | 'week' | 'overdue';

export function MyTasksWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('today');
  const [boardGroups, setBoardGroups] = useState<MyTasksBoardGroup[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const data = await userAPI.getMyTasks(filter);
        setBoardGroups(data.boards || []);
        setTotalCount(data.total_count || 0);
      } catch {
        setBoardGroups([]);
        setTotalCount(0);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [filter]);

  const filters: { key: FilterType; label: string; icon: typeof ListTodo; color: string }[] = [
    { key: 'today', label: t('myTasks.today', '오늘'), icon: CalendarDays, color: 'text-bridge-accent' },
    { key: 'week', label: t('myTasks.thisWeek', '이번 주'), icon: Clock, color: 'text-blue-400' },
    { key: 'overdue', label: t('myTasks.overdue', '지연'), icon: AlertTriangle, color: 'text-rose-400' },
  ];

  const handleTaskClick = (boardId: string) => {
    navigate(`/boards/${boardId}`);
  };

  // Empty state illustration SVG
  const EmptyIllustration = () => (
    <div className="flex flex-col items-center py-6">
      <div className="relative mb-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-bridge-accent/10 to-bridge-secondary/10 border border-white/5 flex items-center justify-center">
          <CheckCircle2 size={28} className="text-bridge-secondary/40" />
        </div>
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-bridge-secondary/20 border border-bridge-secondary/30 flex items-center justify-center"
        >
          <span className="text-[10px]">✓</span>
        </motion.div>
      </div>
      <p className="text-sm text-slate-500 font-medium mb-1">
        {filter === 'today' && t('myTasks.noToday', '오늘 할 일이 없습니다')}
        {filter === 'week' && t('myTasks.noWeek', '이번 주 할 일이 없습니다')}
        {filter === 'overdue' && t('myTasks.noOverdue', '지연된 할 일이 없습니다')}
      </p>
      <p className="text-[11px] text-slate-600">
        {filter === 'overdue'
          ? t('myTasks.noOverdueHint', '모든 업무가 정상입니다')
          : t('myTasks.emptyHint', '보드에서 태스크를 만들어 보세요')
        }
      </p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-bridge-obsidian/40 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2.5 group"
        >
          <div className="w-7 h-7 rounded-lg bg-bridge-accent/10 flex items-center justify-center">
            <ListTodo size={14} className="text-bridge-accent" />
          </div>
          <h3 className="text-sm font-bold text-white">{t('myTasks.title', '내 할 일')}</h3>
          {totalCount > 0 && (
            <span className="text-[10px] font-bold bg-bridge-accent/15 text-bridge-accent px-2 py-0.5 rounded-full">
              {totalCount}
            </span>
          )}
          <motion.div animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={14} className="text-slate-500" />
          </motion.div>
        </button>

        {/* Filter Tabs */}
        {!isCollapsed && (
          <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`relative px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                  filter === f.key
                    ? 'text-white bg-white/10 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {f.label}
                {filter === f.key && f.key === 'overdue' && totalCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-rose-500" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Collapsible Content */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                </div>
              ) : boardGroups.length === 0 ? (
                <EmptyIllustration />
              ) : (
                <div className="space-y-3">
                  {boardGroups.map((group) => (
                    <div key={group.board_id}>
                      {/* Board Header */}
                      <button
                        onClick={() => handleTaskClick(group.board_id)}
                        className="flex items-center gap-2 mb-1.5 group/header"
                      >
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 group-hover/header:text-white transition-colors">
                          {group.board_name}
                          {group.board_type === 'PERSONAL' && ' (My Space)'}
                        </span>
                        <ChevronRight size={10} className="text-slate-600 group-hover/header:text-white transition-colors" />
                      </button>

                      {/* Tasks */}
                      <div className="space-y-0.5">
                        {group.tasks.slice(0, 5).map((task) => (
                          <button
                            key={task.id}
                            onClick={() => handleTaskClick(group.board_id)}
                            className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group/task"
                          >
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-white/5"
                              style={{ backgroundColor: task.feature_color }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-foreground truncate group-hover/task:text-white transition-colors">
                                {task.title}
                              </div>
                              <div className="text-[10px] text-slate-600">{task.block_name}</div>
                            </div>
                            {task.due_date && (
                              <span className={`text-[10px] flex-shrink-0 font-medium ${
                                filter === 'overdue' ? 'text-rose-400' : 'text-slate-500'
                              }`}>
                                {formatDate(task.due_date)}
                              </span>
                            )}
                          </button>
                        ))}
                        {group.tasks.length > 5 && (
                          <button
                            onClick={() => handleTaskClick(group.board_id)}
                            className="text-[10px] text-slate-500 hover:text-bridge-secondary px-3 py-1 transition-colors"
                          >
                            +{group.tasks.length - 5} more
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
