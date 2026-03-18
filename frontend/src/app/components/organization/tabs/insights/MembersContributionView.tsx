import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { organizationService } from '../../../../utils/services';
import type { OrgMemberContribution, OrgDepartment, OrgJobGroup } from '../../../../types';
import { INSIGHT_CHART_COLORS, formatMinutesToHours, groupBreakdownTopN } from './insightsUtils';

interface MembersContributionViewProps {
  orgId: string;
  startDate: string;
  endDate: string;
  departments: OrgDepartment[];
  jobGroups: OrgJobGroup[];
  isAdmin: boolean;
  onMemberClick: (memberId: string) => void;
}

export function MembersContributionView({
  orgId,
  startDate,
  endDate,
  departments,
  jobGroups,
  isAdmin,
  onMemberClick,
}: MembersContributionViewProps) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<OrgMemberContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [jobGroupFilter, setJobGroupFilter] = useState('');
  const [sortBy, setSortBy] = useState<string>('work_minutes');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoading(true);
        const data = await organizationService.getInsightMembers(orgId, {
          start_date: startDate,
          end_date: endDate,
          department_id: departmentFilter || undefined,
          job_group_id: jobGroupFilter || undefined,
          sort_by: sortBy,
          sort_dir: 'desc',
        });
        setMembers(data);
      } catch (error) {
        console.warn('Failed to fetch member contributions:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, [orgId, startDate, endDate, departmentFilter, jobGroupFilter, sortBy]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => m.member.name.toLowerCase().includes(q));
  }, [members, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-bridge-obsidian rounded-xl border border-black/5 dark:border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Department filter */}
        <div className="relative">
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="appearance-none bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 pr-7 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            <option value="">{t('organization.insights.members.allDepartments', 'All Departments')}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Job group filter */}
        <div className="relative">
          <select
            value={jobGroupFilter}
            onChange={(e) => setJobGroupFilter(e.target.value)}
            className="appearance-none bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 pr-7 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            <option value="">{t('organization.insights.members.allJobGroups', 'All Job Groups')}</option>
            {jobGroups.map((jg) => (
              <option key={jg.id} value={jg.id}>{jg.name}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="appearance-none bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 pr-7 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            <option value="work_minutes">{t('organization.insights.members.sortByHours', 'By Hours')}</option>
            <option value="completed_tasks">{t('organization.insights.members.sortByTasks', 'By Tasks')}</option>
            <option value="activity_count">{t('organization.insights.members.sortByActivity', 'By Activity')}</option>
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('organization.insights.members.search', 'Search name')}
            className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 w-44"
          />
        </div>
      </div>

      {/* Table */}
      {filteredMembers.length === 0 ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-bridge-accent/10 flex items-center justify-center mx-auto mb-3">
            <Users size={24} className="text-bridge-accent/60" />
          </div>
          <p className="text-sm text-slate-400">
            {t('organization.insights.noData', 'No data for the selected period.')}
          </p>
        </div>
      ) : (
        <div className="bg-bridge-obsidian rounded-2xl border border-black/5 dark:border-white/5 overflow-hidden">
          {/* Desktop Header */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_2fr] gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t('organization.tabs.members', 'Member')}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 text-right">
              {t('organization.insights.members.workHours', 'Hours')}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 text-right">
              {t('organization.insights.members.completedTasks', 'Completed')}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 text-right">
              {t('organization.insights.members.activityCount', 'Activities')}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t('organization.insights.members.primaryBoard', 'Primary Board')}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t('organization.insights.members.distribution', 'Distribution')}
            </span>
          </div>

          {/* Rows */}
          {filteredMembers.map((m, index) => (
            <motion.div
              key={m.member.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => isAdmin && onMemberClick(m.member.id)}
              className={`border-b border-black/5 dark:border-white/5 last:border-b-0 ${
                isAdmin ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : ''
              } transition-colors`}
            >
              {/* Desktop row */}
              <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1.5fr_2fr] gap-3 px-4 py-3">
                {/* Member */}
                <div className="flex items-center gap-3 min-w-0">
                  {m.member.profile_image ? (
                    <img src={m.member.profile_image} alt={m.member.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-bridge-accent">{m.member.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-sm text-slate-900 dark:text-white font-medium block truncate">{m.member.name}</span>
                    {(m.member.department || m.member.job_title) && (
                      <span className="text-xs text-slate-400 block truncate">
                        {[m.member.department, m.member.job_title].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hours */}
                <div className="flex flex-col items-end justify-center">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{formatMinutesToHours(m.total_work_minutes)}</span>
                  {m.change_percentage !== 0 && (
                    <span className={`text-xs font-bold ${
                      m.change_percentage > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {m.change_percentage > 0 ? '+' : ''}{Math.round(m.change_percentage)}% {m.change_percentage > 0 ? '▲' : '▼'}
                    </span>
                  )}
                </div>

                {/* Completed Tasks */}
                <div className="flex items-center justify-end">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{m.completed_tasks}</span>
                </div>

                {/* Activities */}
                <div className="flex items-center justify-end">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{m.activity_count}</span>
                </div>

                {/* Primary Board */}
                <div className="flex items-center min-w-0">
                  {m.primary_board ? (
                    <span className="text-xs text-slate-400 truncate">{m.primary_board.name}</span>
                  ) : (
                    <span className="text-xs text-slate-500">-</span>
                  )}
                </div>

                {/* Distribution Bar (top 3 + others) */}
                <div className="flex items-center gap-2">
                  <div className="flex h-2 flex-1 rounded-full overflow-hidden gap-0.5">
                    {groupBreakdownTopN(m.board_breakdown).map((b, i) => (
                      <div
                        key={b.board_id}
                        title={`${b.board_name}: ${b.percentage.toFixed(0)}%`}
                        style={{ width: `${b.percentage}%`, backgroundColor: b.board_id === '__others__' ? '#64748B' : INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length] }}
                        className="h-full rounded-full first:rounded-l-full last:rounded-r-full"
                      />
                    ))}
                    {m.board_breakdown.length === 0 && (
                      <div className="h-full w-full bg-black/5 dark:bg-white/5 rounded-full" />
                    )}
                  </div>
                </div>
              </div>

              {/* Mobile card */}
              <div className="md:hidden px-4 py-3">
                <div className="flex items-center gap-3 mb-2">
                  {m.member.profile_image ? (
                    <img src={m.member.profile_image} alt={m.member.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-bridge-accent">{m.member.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-slate-900 dark:text-white font-medium block truncate">{m.member.name}</span>
                    {(m.member.department || m.member.job_title) && (
                      <span className="text-xs text-slate-400 block truncate">
                        {[m.member.department, m.member.job_title].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{formatMinutesToHours(m.total_work_minutes)}</span>
                    {m.change_percentage !== 0 && (
                      <span className={`text-xs font-bold block ${
                        m.change_percentage > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {m.change_percentage > 0 ? '+' : ''}{Math.round(m.change_percentage)}% {m.change_percentage > 0 ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>{m.completed_tasks} {t('organization.insights.members.detail.tasks', 'tasks')}</span>
                  <span>{m.activity_count} {t('organization.insights.members.activityCount', 'activities')}</span>
                  {m.primary_board && <span className="truncate">{m.primary_board.name}</span>}
                </div>
                {m.board_breakdown.length > 0 && (
                  <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-0.5 mt-2">
                    {groupBreakdownTopN(m.board_breakdown).map((b, i) => (
                      <div
                        key={b.board_id}
                        style={{ width: `${b.percentage}%`, backgroundColor: b.board_id === '__others__' ? '#64748B' : INSIGHT_CHART_COLORS[i % INSIGHT_CHART_COLORS.length] }}
                        className="h-full rounded-full"
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
