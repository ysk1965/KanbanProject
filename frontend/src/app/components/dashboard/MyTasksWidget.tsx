import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListTodo, Clock, AlertTriangle, CalendarDays, Loader2, ChevronRight } from 'lucide-react';
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

  const filters: { key: FilterType; label: string; icon: typeof ListTodo }[] = [
    { key: 'today', label: t('myTasks.today', '오늘'), icon: CalendarDays },
    { key: 'week', label: t('myTasks.thisWeek', '이번 주'), icon: Clock },
    { key: 'overdue', label: t('myTasks.overdue', '지연'), icon: AlertTriangle },
  ];

  const handleTaskClick = (boardId: string) => {
    navigate(`/boards/${boardId}`);
  };

  if (isLoading && boardGroups.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-bridge-obsidian/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/10 flex items-center justify-center">
            <ListTodo size={16} className="text-bridge-accent" />
          </div>
          <h3 className="text-sm font-bold text-white">{t('myTasks.title', '내 할 일')}</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-bridge-obsidian/50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-bridge-accent/10 flex items-center justify-center">
            <ListTodo size={16} className="text-bridge-accent" />
          </div>
          <h3 className="text-sm font-bold text-white">{t('myTasks.title', '내 할 일')}</h3>
          {totalCount > 0 && (
            <span className="text-[10px] font-bold bg-bridge-accent/20 text-bridge-accent px-2 py-0.5 rounded-full">
              {totalCount}
            </span>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`relative px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                filter === f.key
                  ? 'text-white bg-white/10'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        </div>
      ) : boardGroups.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500">
            {filter === 'today' && t('myTasks.noToday', '오늘 할 일이 없습니다')}
            {filter === 'week' && t('myTasks.noWeek', '이번 주 할 일이 없습니다')}
            {filter === 'overdue' && t('myTasks.noOverdue', '지연된 할 일이 없습니다')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {boardGroups.map((group) => (
            <div key={group.board_id}>
              {/* Board Header */}
              <button
                onClick={() => handleTaskClick(group.board_id)}
                className="flex items-center gap-2 mb-2 group"
              >
                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 group-hover:text-white transition-colors">
                  {group.board_name}
                  {group.board_type === 'PERSONAL' && ' (My Space)'}
                </span>
                <ChevronRight size={10} className="text-slate-500 group-hover:text-white transition-colors" />
              </button>

              {/* Tasks */}
              <div className="space-y-1">
                {group.tasks.slice(0, 5).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleTaskClick(group.board_id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: task.feature_color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-foreground truncate">{task.title}</div>
                      <div className="text-[10px] text-slate-500">{task.block_name}</div>
                    </div>
                    {task.due_date && (
                      <span className={`text-[10px] flex-shrink-0 ${
                        filter === 'overdue' ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {formatDate(task.due_date)}
                      </span>
                    )}
                  </button>
                ))}
                {group.tasks.length > 5 && (
                  <div className="text-[10px] text-slate-500 px-3 py-1">
                    +{group.tasks.length - 5} more
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
