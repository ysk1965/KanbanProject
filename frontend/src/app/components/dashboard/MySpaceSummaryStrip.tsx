import { motion } from 'framer-motion';
import {
  Sparkles,
  ListTodo,
  Flame,
  Clock,
  BookOpen,
  CheckCircle2,
  Circle,
  ChevronRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PersonalDashboardToday } from '../../types';

interface MySpaceSummaryStripProps {
  todayData: PersonalDashboardToday | null;
  onClick: () => void;
}

export default function MySpaceSummaryStrip({ todayData, onClick }: MySpaceSummaryStripProps) {
  const { t } = useTranslation();

  const taskTotal = todayData
    ? todayData.due_today_tasks.length + todayData.in_progress_tasks.length
    : 0;
  const taskCompleted = todayData?.completed_today_count ?? 0;

  const habitsTotal = todayData?.habits_today.length ?? 0;
  const habitsCompleted = todayData?.habits_today.filter((h) => h.is_completed).length ?? 0;

  const eventsCount = todayData?.personal_events.length ?? 0;

  const diaryCompleted = todayData?.diary_today?.status === 'COMPLETED';

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      onClick={onClick}
      className="hidden lg:flex group w-full items-center gap-4 px-4 py-2.5
        bg-bridge-obsidian rounded-2xl border border-foreground/[0.08]
        hover:border-foreground/[0.12] transition-colors cursor-pointer text-left"
    >
      {/* Left: Icon + Label */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-bridge-secondary/15 flex items-center justify-center">
          <Sparkles size={17} className="text-bridge-secondary" />
        </div>
        <span className="text-sm font-bold text-foreground font-jakarta tracking-tight">
          {t('dashboard.mySpace')}
        </span>
      </div>

      {/* Metrics */}
      {todayData && (
        <div className="flex items-center gap-0 flex-1 min-w-0">
          {/* Task */}
          <div className="flex items-center gap-2 pl-4 pr-4 border-l border-foreground/[0.08]">
            <ListTodo size={14} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400">Task</span>
            <span className="text-[13px] font-bold text-bridge-accent">
              {taskCompleted}/{taskTotal}
            </span>
          </div>

          {/* Habit */}
          <div className="flex items-center gap-2 pl-4 pr-4 border-l border-foreground/[0.08]">
            <Flame size={14} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400">Habit</span>
            <span className="text-[13px] font-bold text-amber-400">
              {habitsCompleted}/{habitsTotal}
            </span>
          </div>

          {/* Events */}
          <div className="flex items-center gap-2 pl-4 pr-4 border-l border-foreground/[0.08]">
            <Clock size={14} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400">Events</span>
            <span className="text-[13px] font-bold text-purple-400">{eventsCount}</span>
          </div>

          {/* Diary */}
          <div className="flex items-center gap-2 pl-4 pr-4 border-l border-foreground/[0.08]">
            <BookOpen size={14} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400">Diary</span>
            {diaryCompleted ? (
              <CheckCircle2 size={14} className="text-emerald-400" />
            ) : (
              <Circle size={14} className="text-slate-500" />
            )}
          </div>
        </div>
      )}

      {/* Right: Open */}
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        <span className="text-xs font-medium text-slate-600 group-hover:text-slate-400 transition-colors duration-300">
          Open
        </span>
        <ChevronRight
          size={14}
          className="text-slate-600 group-hover:text-bridge-secondary group-hover:translate-x-0.5 transition-all duration-300"
        />
      </div>
    </motion.button>
  );
}
