import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Clock, CheckSquare } from 'lucide-react';
import { IconButton } from '../../../ui/IconButton';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { organizationService } from '../../../../utils/services';
import type { OrgMemberContributionDetail } from '../../../../types';
import { INSIGHT_CHART_COLORS, formatMinutesToHours, CHART_TOOLTIP_STYLE, CHART_GRID_STROKE, CHART_AXIS_FILL } from './insightsUtils';

interface MemberContributionDetailDrawerProps {
  orgId: string;
  memberId: string | null;
  startDate: string;
  endDate: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function MemberContributionDetailDrawer({
  orgId,
  memberId,
  startDate,
  endDate,
  isOpen,
  onClose,
}: MemberContributionDetailDrawerProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<OrgMemberContributionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // ESC key handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (!memberId || !isOpen) return;
    const fetchDetail = async () => {
      try {
        setLoading(true);
        const detail = await organizationService.getInsightMemberDetail(orgId, memberId, {
          start_date: startDate,
          end_date: endDate,
        });
        setData(detail);
      } catch (error) {
        console.warn('Failed to fetch member detail:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [orgId, memberId, startDate, endDate, isOpen]);

  const boardPieData = data?.board_details.map((b) => ({
    name: b.board_name,
    value: b.work_minutes,
  })) ?? [];

  const weeklyBarData = data?.weekly_trend.map((w) => ({
    label: formatWeekLabel(w.week_start),
    hours: Math.round(w.work_minutes / 60 * 10) / 10,
    tasks: w.completed_tasks,
  })) ?? [];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 w-full max-w-md h-full bg-bridge-dark border-l border-black/10 dark:border-white/10 overflow-y-auto z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/5">
              <div>
                {data ? (
                  <>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {t('organization.insights.members.detail.title', "{{name}}'s Contribution", { name: data.member.name })}
                    </h2>
                    {(data.member.department || data.member.job_title) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {[data.member.department, data.member.job_title].filter(Boolean).join(' / ')}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="h-6 w-40 bg-white/5 rounded animate-pulse" />
                )}
              </div>
              <IconButton onClick={onClose} aria-label="닫기">
                <X />
              </IconButton>
            </div>

            {loading ? (
              <div className="p-5 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-48 bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 animate-pulse" />
                ))}
              </div>
            ) : data ? (
              <div className="p-5 space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-bridge-obsidian rounded-xl border border-black/5 dark:border-white/5 p-3 text-center">
                    <Clock size={14} className="text-bridge-accent mx-auto mb-1" />
                    <span className="text-lg font-bold text-slate-900 dark:text-white block">{formatMinutesToHours(data.total_work_minutes)}</span>
                    <span className="text-xs text-slate-400">{t('organization.insights.members.detail.hours', 'hours')}</span>
                  </div>
                  <div className="bg-bridge-obsidian rounded-xl border border-black/5 dark:border-white/5 p-3 text-center">
                    <CheckSquare size={14} className="text-emerald-500 mx-auto mb-1" />
                    <span className="text-lg font-bold text-slate-900 dark:text-white block">{data.completed_tasks}</span>
                    <span className="text-xs text-slate-400">{t('organization.insights.members.detail.tasks', 'tasks')}</span>
                  </div>
                  <div className="bg-bridge-obsidian rounded-xl border border-black/5 dark:border-white/5 p-3 text-center">
                    <Clock size={14} className="text-amber-500 mx-auto mb-1" />
                    <span className="text-lg font-bold text-slate-900 dark:text-white block">{data.activity_count}</span>
                    <span className="text-xs text-slate-400">{t('organization.insights.members.activityCount', 'Activities')}</span>
                  </div>
                </div>

                {/* Board Time Breakdown (Donut) */}
                {boardPieData.length > 0 && (
                  <div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-4">
                    <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-3">
                      {t('organization.insights.members.detail.boardBreakdown', 'Board Time Breakdown')}
                    </h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <RechartsPieChart>
                        <Pie
                          data={boardPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {boardPieData.map((_, i) => (
                            <Cell key={i} fill={INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatMinutesToHours(value)}
                          contentStyle={CHART_TOOLTIP_STYLE}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-2">
                      {boardPieData.map((b, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length] }} />
                          <span className="text-xs text-slate-400">{b.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Weekly Trend (Bar) */}
                {weeklyBarData.length > 0 && (
                  <div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-4">
                    <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-3">
                      {t('organization.insights.members.detail.weeklyTrend', 'Weekly Trend')}
                    </h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={weeklyBarData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                        <XAxis dataKey="label" tick={{ fill: CHART_AXIS_FILL, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: CHART_AXIS_FILL, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Bar dataKey="hours" fill="#6366F1" radius={[4, 4, 0, 0]} name={t('organization.insights.members.detail.hours', 'hours')} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Board Details */}
                {data.board_details.length > 0 && (
                  <div>
                    <h3 className="text-[13px] font-bold text-slate-900 dark:text-white mb-3">
                      {t('organization.insights.members.detail.boardDetails', 'Board Details')}
                    </h3>
                    <div className="space-y-3">
                      {data.board_details.map((board, i) => (
                        <div
                          key={board.board_id}
                          className="bg-bridge-obsidian rounded-xl border border-black/5 dark:border-white/5 p-4"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length] }}
                            />
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{board.board_name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                            <span>{formatMinutesToHours(board.work_minutes)}</span>
                            <span>{board.completed_tasks} {t('organization.insights.members.detail.tasks', 'tasks')}</span>
                          </div>
                          {board.top_features.length > 0 && (
                            <div>
                              <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                                {t('organization.insights.members.detail.topFeatures', 'Top Features')}
                              </span>
                              <div className="space-y-1">
                                {board.top_features.map((f) => (
                                  <div key={f.id} className="text-xs">
                                    <span className="text-slate-400 truncate">{f.title}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
