import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, LayoutGrid, Clock, Users, CheckSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { organizationService } from '../../../../utils/services';
import type { OrgBoardResource, OrgBoardResourceResponse } from '../../../../types';
import { INSIGHT_CHART_COLORS, formatMinutesToHours } from './insightsUtils';

interface BoardsResourceViewProps {
  orgId: string;
  startDate: string;
  endDate: string;
  onDataLoaded?: (data: OrgBoardResourceResponse | null) => void;
}

export function BoardsResourceView({ orgId, startDate, endDate, onDataLoaded }: BoardsResourceViewProps) {
  const { t } = useTranslation();
  const [boards, setBoards] = useState<OrgBoardResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>('work_minutes');

  useEffect(() => {
    const fetchBoards = async () => {
      try {
        setLoading(true);
        const data = await organizationService.getInsightBoards(orgId, {
          start_date: startDate,
          end_date: endDate,
          sort_by: sortBy,
        });
        setBoards(data.boards);
        onDataLoaded?.(data);
      } catch (error) {
        console.warn('Failed to fetch board resources:', error);
        onDataLoaded?.(null);
      } finally {
        setLoading(false);
      }
    };
    fetchBoards();
  }, [orgId, startDate, endDate, sortBy]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <div className="h-7 w-28 bg-bridge-obsidian rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort */}
      <div className="flex justify-end">
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="appearance-none bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 pr-7 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            <option value="work_minutes">{t('organization.insights.boards.sortByHours', 'By Hours')}</option>
            <option value="contributor_count">{t('organization.insights.boards.sortByContributors', 'By Contributors')}</option>
            <option value="completed_tasks">{t('organization.insights.boards.sortByTasks', 'By Tasks')}</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Board Cards */}
      {boards.length === 0 ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-bridge-secondary/10 flex items-center justify-center mx-auto mb-3">
            <LayoutGrid size={24} className="text-bridge-secondary/60" />
          </div>
          <p className="text-sm text-slate-400">
            {t('organization.insights.noData', 'No data for the selected period.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {boards.map((board, index) => (
            <motion.div
              key={board.board.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-6 hover:border-bridge-accent/30 transition-all"
            >
              {/* Board Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${INSIGHT_CHART_COLORS[index % INSIGHT_CHART_COLORS.length]}20` }}>
                  <LayoutGrid size={14} style={{ color: INSIGHT_CHART_COLORS[index % INSIGHT_CHART_COLORS.length] }} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-slate-900 dark:text-white block truncate">{board.board.name}</span>
                  <span className="text-[11px] text-slate-400">{board.board.owner_name}</span>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="flex items-center gap-1.5">
                  <Clock size={12} className="text-slate-400" />
                  <div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{formatMinutesToHours(board.total_work_minutes)}</span>
                    <span className="text-[10px] text-slate-400 block">{t('organization.insights.boards.totalHours', 'Total Hours')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users size={12} className="text-slate-400" />
                  <div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{board.contributor_count}</span>
                    <span className="text-[10px] text-slate-400 block">{t('organization.insights.boards.contributors', 'Contributors')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckSquare size={12} className="text-slate-400" />
                  <div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{board.completed_tasks}</span>
                    <span className="text-[10px] text-slate-400 block">{t('organization.insights.boards.completedTasks', 'Completed')}</span>
                  </div>
                </div>
              </div>

              {/* Feature Progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400">{t('organization.insights.boards.featureProgress', 'Feature Progress')}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{board.feature_progress}%</span>
                </div>
                <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-bridge-secondary rounded-full transition-all"
                    style={{ width: `${board.feature_progress}%` }}
                  />
                </div>
              </div>

              {/* Org Share */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-400">{t('organization.insights.boards.orgShare', 'Org Share')}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{board.org_share_percentage.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-bridge-accent rounded-full transition-all"
                    style={{ width: `${board.org_share_percentage}%` }}
                  />
                </div>
              </div>

              {/* Top Contributors */}
              {board.top_contributors.length > 0 && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 block">
                    {t('organization.insights.boards.topContributors', 'Top Contributors')}
                  </span>
                  <div className="flex items-center gap-2">
                    {board.top_contributors.slice(0, 3).map((c) => (
                      <div key={c.member_id} className="flex items-center gap-1.5">
                        {c.profile_image ? (
                          <img src={c.profile_image} alt={c.name} className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                            <span className="text-[8px] font-bold text-bridge-accent">{c.name.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="text-[11px] text-slate-400">{c.name}</span>
                        <span className="text-[10px] text-slate-500">{c.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
