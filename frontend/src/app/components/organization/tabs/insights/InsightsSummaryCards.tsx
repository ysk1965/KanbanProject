import { useTranslation } from 'react-i18next';
import { Clock, Users, CheckSquare, LayoutGrid, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import type { OrgInsightsSummary } from '../../../../types';
import { formatMinutesToCompactHours } from './insightsUtils';

interface InsightsSummaryCardsProps {
  data: OrgInsightsSummary | null;
  loading: boolean;
}

export function InsightsSummaryCards({ data, loading }: InsightsSummaryCardsProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-5 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    {
      icon: Clock,
      bgClass: 'bg-bridge-accent/20',
      textClass: 'text-bridge-accent',
      label: t('organization.insights.summary.totalHours', 'Total Hours'),
      value: formatMinutesToCompactHours(data.total_work_minutes),
      change: data.change_percentage,
    },
    {
      icon: Users,
      bgClass: 'bg-bridge-secondary/20',
      textClass: 'text-bridge-secondary',
      label: t('organization.insights.summary.activeMembers', 'Active Members'),
      value: `${data.active_members} / ${data.total_members}`,
      change: null,
    },
    {
      icon: CheckSquare,
      bgClass: 'bg-emerald-500/20',
      textClass: 'text-emerald-500',
      label: t('organization.insights.summary.completedTasks', 'Completed Tasks'),
      value: data.completed_tasks.toLocaleString(),
      change: null,
    },
    {
      icon: LayoutGrid,
      bgClass: 'bg-amber-500/20',
      textClass: 'text-amber-500',
      label: t('organization.insights.summary.activeBoards', 'Active Boards'),
      value: `${data.active_boards} / ${data.total_boards}`,
      change: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.06 }}
          className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-5"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-8 h-8 rounded-lg ${card.bgClass} flex items-center justify-center`}>
              <card.icon size={16} className={card.textClass} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {card.label}
            </span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {card.value}
            </span>
            {card.change !== null && (
              <div className={`flex items-center gap-1 text-xs font-bold ${
                card.change >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                {card.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                <span>{card.change >= 0 ? '+' : ''}{card.change.toFixed(1)}%</span>
                <span className="text-slate-400 font-normal ml-0.5">
                  {t('organization.insights.summary.vsLastPeriod', 'vs. last period')}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
