import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Clock,
  CheckCircle2,
  Target,
  TrendingUp,
  Users,
  Calendar,
  Filter,
  ChevronDown,
  ChevronRight,
  Zap,
  ListTodo,
  PieChart,
  Activity,
  Settings,
  Flag,
  Shield,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  BoardStatistics,
  StatisticsFilter,
  StatisticsViewType,
  Milestone,
  Tag,
  BoardMember,
} from '../types';
import { statisticsService } from '../utils/services';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';
import { WeightLevelSettingsModal } from './WeightLevelSettingsModal';
import { ManagementView } from './ManagementView';
import { formatDate, formatDateShort } from '../utils/dateUtils';

interface StatisticsViewProps {
  boardId: string;
  milestones: Milestone[];
  tags: Tag[];
  members: BoardMember[];
  onTaskClick?: (taskId: string) => void;
  managementRefreshTrigger?: number;
}

// 기본 필터 상태
const DEFAULT_FILTER: StatisticsFilter = {
  start_date: null,
  end_date: null,
  milestone_ids: [],
  feature_ids: [],
  member_ids: [],
  tag_ids: [],
};

// 기간 프리셋
const PERIOD_PRESETS = [
  { labelKey: 'statistics.periodLast7', value: '7d' },
  { labelKey: 'statistics.periodLast30', value: '30d' },
  { labelKey: 'statistics.periodThisMonth', value: 'this_month' },
  { labelKey: 'statistics.periodLastMonth', value: 'last_month' },
  { labelKey: 'statistics.periodAll', value: 'all' },
];

// 차트 색상
const CHART_COLORS = [
  '#6366F1', // bridge-accent
  '#2DD4BF', // bridge-secondary
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#10B981', // emerald
  '#3B82F6', // blue
];

export function StatisticsView({
  boardId,
  milestones,
  tags,
  members,
  onTaskClick,
  managementRefreshTrigger,
}: StatisticsViewProps) {
  const [activeView, setActiveView] = useState<StatisticsViewType>('overview');
  const [filter, setFilter] = useState<StatisticsFilter>(DEFAULT_FILTER);
  const [periodPreset, setPeriodPreset] = useState('30d');
  const [statistics, setStatistics] = useState<BoardStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isWeightSettingsOpen, setIsWeightSettingsOpen] = useState(false);
  const { t } = useTranslation();

  // 기간 프리셋 적용
  useEffect(() => {
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date = now;

    switch (periodPreset) {
      case '7d':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'all':
        startDate = null;
        break;
    }

    setFilter((prev) => ({
      ...prev,
      start_date: startDate ? formatDateShort(startDate) : null,
      end_date: formatDateShort(endDate),
    }));
  }, [periodPreset]);

  // 통계 데이터 로드
  const loadStatistics = async () => {
    setIsLoading(true);
    try {
      const data = await statisticsService.getBoardStatistics(boardId, filter);
      setStatistics(data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatistics();
  }, [boardId, filter]);

  // 시간 포맷팅 헬퍼
  const formatMinutes = (minutes: number): string => {
    if (minutes < 60) return t('statistics.minuteUnit', { value: minutes });
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? t('statistics.hourMinuteUnit', { hours, minutes: mins }) : t('statistics.hourUnit', { hours });
  };

  // 퍼센트 포맷팅
  const formatPercent = (value: number): string => {
    return `${Math.round(value * 100)}%`;
  };

  // 일별 트렌드 데이터 포맷팅
  const trendData = useMemo(() => {
    if (!statistics?.daily_trend) return [];
    return statistics.daily_trend.map((d) => ({
      ...d,
      date: formatDate(d.date, 'M월 d일'),
      hours: Number((d.total_minutes / 60).toFixed(1)),
      completed_hours: Number((d.completed_minutes / 60).toFixed(1)),
    }));
  }, [statistics]);

  // Feature별 시간 분포 데이터
  const featureDistribution = useMemo(() => {
    if (!statistics?.by_feature) return [];
    return statistics.by_feature
      .sort((a, b) => b.total_minutes - a.total_minutes)
      .slice(0, 8)
      .map((f) => ({
        name: f.feature.title,
        value: f.total_minutes,
        color: f.feature.color,
      }));
  }, [statistics]);

  // 멤버별 기여도 데이터
  const memberContribution = useMemo(() => {
    if (!statistics?.by_member) return [];
    return statistics.by_member
      .sort((a, b) => b.total_minutes - a.total_minutes)
      .slice(0, 6)
      .map((m) => ({
        name: m.member.name,
        hours: Number((m.total_minutes / 60).toFixed(1)),
        tasks: m.task_count,
      }));
  }, [statistics]);

  // 뷰 타입 탭
  const VIEW_TABS: { type: StatisticsViewType; labelKey: string; icon: React.ElementType }[] = [
    { type: 'overview', labelKey: 'statistics.tabOverview', icon: BarChart3 },
    { type: 'individual', labelKey: 'statistics.tabIndividual', icon: Users },
    { type: 'team', labelKey: 'statistics.tabTeam', icon: Target },
    { type: 'work', labelKey: 'statistics.tabWork', icon: ListTodo },
    { type: 'impact', labelKey: 'statistics.tabImpact', icon: Zap },
    { type: 'management', labelKey: 'statistics.tabManagement', icon: Shield },
  ];

  if (isLoading && !statistics) {
    return (
      <div className="flex items-center justify-center h-full bg-bridge-dark">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 text-bridge-accent mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">{t('statistics.loadingData')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bridge-dark">
      {/* 상단 네비게이션 & 필터 */}
      <div className="flex-none px-3 sm:px-6 py-3 sm:py-4 border-b border-white/15 bg-bridge-obsidian">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* 뷰 타입 탭 */}
          <div className="flex items-center gap-0.5 sm:gap-1 bg-bridge-dark rounded-xl p-1 border border-white/20 overflow-x-auto scrollbar-hide">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.type}
                onClick={() => setActiveView(tab.type)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                  activeView === tab.type
                    ? 'bg-bridge-accent text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline">{t(tab.labelKey)}</span>
              </button>
            ))}
          </div>

          {/* 기간 & 필터 */}
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide">
            {/* 마일스톤 선택 */}
            <div className="relative flex-shrink-0">
              <select
                value={filter.milestone_ids[0] || ''}
                onChange={(e) => {
                  const milestoneId = e.target.value;
                  setFilter((prev) => ({
                    ...prev,
                    milestone_ids: milestoneId ? [milestoneId] : [],
                  }));
                  // 마일스톤 선택 시 기간 프리셋을 전체로 변경
                  if (milestoneId) {
                    setPeriodPreset('all');
                  }
                }}
                className="appearance-none bg-bridge-dark border border-white/20 rounded-xl py-2 pl-9 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent cursor-pointer hover:border-white/20 transition-all"
              >
                <option value="">{t('statistics.allMilestones')}</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
              <Flag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            {/* 기간 프리셋 */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-bridge-dark rounded-xl p-1 border border-white/20 flex-shrink-0">
              {PERIOD_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => {
                    setPeriodPreset(preset.value);
                    // 기간 프리셋 선택 시 마일스톤 필터 해제 (옵션)
                    // setFilter((prev) => ({ ...prev, milestone_ids: [] }));
                  }}
                  className={`px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap ${
                    periodPreset === preset.value
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {t(preset.labelKey)}
                </button>
              ))}
            </div>

            {/* 상세 필터 버튼 */}
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all flex-shrink-0 ${
                isFilterOpen || filter.member_ids.length > 0 || filter.tag_ids.length > 0
                  ? 'border-bridge-accent text-bridge-accent bg-bridge-accent/10'
                  : 'border-white/20 text-slate-400 hover:text-white hover:border-white/20'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">{t('statistics.filterBtn')}</span>
              {(filter.member_ids.length > 0 || filter.tag_ids.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-bridge-accent" />
              )}
              <ChevronDown className={`h-4 w-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* 상세 필터 패널 */}
        {isFilterOpen && (
          <div className="mt-4 p-4 bg-bridge-dark rounded-xl border border-white/20">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* 멤버 필터 */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                  {t('statistics.memberFilter')}
                </label>
                <select
                  value={filter.member_ids[0] || ''}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      member_ids: e.target.value ? [e.target.value] : [],
                    }))
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg py-2 px-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                >
                  <option value="">{t('statistics.totalLabel')}</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.user.id}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 태그 필터 */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                  {t('statistics.tagFilter')}
                </label>
                <select
                  value={filter.tag_ids[0] || ''}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      tag_ids: e.target.value ? [e.target.value] : [],
                    }))
                  }
                  className="w-full bg-white/5 border border-white/20 rounded-lg py-2 px-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                >
                  <option value="">{t('statistics.totalLabel')}</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 초기화 버튼 */}
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setFilter(DEFAULT_FILTER);
                    setPeriodPreset('30d');
                  }}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  {t('statistics.resetFilter')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        {activeView === 'overview' && statistics && (
          <OverviewDashboard
            statistics={statistics}
            formatMinutes={formatMinutes}
            formatPercent={formatPercent}
            trendData={trendData}
            featureDistribution={featureDistribution}
            memberContribution={memberContribution}
          />
        )}

        {activeView === 'individual' && statistics && (
          <IndividualProductivityView
            statistics={statistics}
            boardId={boardId}
            formatMinutes={formatMinutes}
            formatPercent={formatPercent}
            members={members}
          />
        )}

        {activeView === 'team' && statistics && (
          <TeamProductivityView
            statistics={statistics}
            formatMinutes={formatMinutes}
            formatPercent={formatPercent}
          />
        )}

        {activeView === 'work' && statistics && (
          <WorkAnalysisView
            statistics={statistics}
            formatMinutes={formatMinutes}
            formatPercent={formatPercent}
          />
        )}

        {activeView === 'impact' && statistics && (
          <ImpactAnalysisView
            statistics={statistics}
            boardId={boardId}
            formatMinutes={formatMinutes}
            formatPercent={formatPercent}
            isWeightSettingsOpen={isWeightSettingsOpen}
            setIsWeightSettingsOpen={setIsWeightSettingsOpen}
            loadStatistics={loadStatistics}
          />
        )}

        {activeView === 'management' && (
          <ManagementView
            boardId={boardId}
            milestones={milestones}
            members={members}
            onTaskClick={onTaskClick}
            refreshTrigger={managementRefreshTrigger}
          />
        )}
      </div>
    </div>
  );
}

// ========================================
// Overview Dashboard 컴포넌트
// ========================================

interface OverviewDashboardProps {
  statistics: BoardStatistics;
  formatMinutes: (minutes: number) => string;
  formatPercent: (value: number) => string;
  trendData: Array<{
    date: string;
    hours: number;
    completed_hours: number;
    task_completed_count: number;
  }>;
  featureDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  memberContribution: Array<{
    name: string;
    hours: number;
    tasks: number;
  }>;
}

function OverviewDashboard({
  statistics,
  formatMinutes,
  formatPercent,
  trendData,
  featureDistribution,
  memberContribution,
}: OverviewDashboardProps) {
  const { t } = useTranslation();
  const { summary } = statistics;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 총 작업 시간 */}
        <KPICard
          icon={Clock}
          label={t('statistics.totalWorkTime')}
          value={formatMinutes(summary.total_work_minutes)}
          subValue={t('statistics.completedPrefix', { value: formatMinutes(summary.completed_work_minutes) })}
          trend={summary.focus_rate > 0.7 ? 'up' : summary.focus_rate > 0.5 ? 'neutral' : 'down'}
          accentColor="bridge-accent"
        />

        {/* 완료율 */}
        <KPICard
          icon={CheckCircle2}
          label={t('statistics.taskCompletionRate')}
          value={formatPercent(summary.total_tasks > 0 ? summary.completed_tasks / summary.total_tasks : 0)}
          subValue={`${summary.completed_tasks} / ${summary.total_tasks} Task`}
          trend={summary.completed_tasks / summary.total_tasks > 0.7 ? 'up' : 'neutral'}
          accentColor="bridge-secondary"
        />

        {/* 집중도 */}
        <KPICard
          icon={Target}
          label={t('statistics.focusRate')}
          value={formatPercent(summary.focus_rate)}
          subValue={t('statistics.focusRateDesc')}
          trend={summary.focus_rate > 0.8 ? 'up' : summary.focus_rate > 0.6 ? 'neutral' : 'down'}
          accentColor="amber-500"
        />

        {/* Feature 진행률 */}
        <KPICard
          icon={TrendingUp}
          label={t('statistics.avgFeatureProgress')}
          value={formatPercent(summary.average_feature_progress / 100)}
          subValue={t('statistics.completedCount', { completed: summary.completed_features, total: summary.total_features })}
          trend={summary.average_feature_progress > 70 ? 'up' : 'neutral'}
          accentColor="violet-500"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 일별 작업 시간 트렌드 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-bridge-accent" />
              {t('statistics.dailyWorkTime')}
            </h3>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#374151' }}
                  axisLine={{ stroke: '#374151' }}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#374151' }}
                  axisLine={{ stroke: '#374151' }}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bridge-obsidian)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number, name: string) => [
                    t('statistics.hourSuffix', { value }),
                    name === 'hours' ? t('statistics.totalLabel') : t('statistics.completedLabel'),
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: 20 }}
                  formatter={(value) => <span className="text-slate-400 text-xs">{value}</span>}
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  name={t('statistics.allWork')}
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={{ fill: '#6366F1', r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="completed_hours"
                  name={t('statistics.completedWork')}
                  stroke="#2DD4BF"
                  strokeWidth={2}
                  dot={{ fill: '#2DD4BF', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Feature별 시간 분포 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <PieChart className="h-5 w-5 text-bridge-secondary" />
              {t('statistics.featureTimeDistribution')}
            </h3>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={featureDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {featureDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bridge-obsidian)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number) => [formatMinutes(value), t('statistics.workTime')]}
                />
                <Legend
                  verticalAlign="middle"
                  align="right"
                  layout="vertical"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-slate-400 text-xs ml-1">
                      {value.length > 12 ? `${value.slice(0, 12)}...` : value}
                    </span>
                  )}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 멤버별 기여도 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-amber-500" />
              {t('statistics.memberWorkTime')}
            </h3>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberContribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#374151' }}
                  axisLine={{ stroke: '#374151' }}
                  tickFormatter={(v) => `${v}h`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bridge-obsidian)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number, name: string) => [
                    name === 'hours' ? t('statistics.hourSuffix', { value }) : t('statistics.itemCount', { value }),
                    name === 'hours' ? t('statistics.workTime') : t('statistics.taskCount'),
                  ]}
                />
                <Bar dataKey="hours" name={t('statistics.workTime')} fill="#6366F1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 요약 통계 카드 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-500" />
              {t('statistics.detailedSummary')}
            </h3>
          </div>
          <div className="space-y-4">
            <SummaryItem
              label={t('statistics.analysisPeriod')}
              value={`${statistics.summary.period_start} ~ ${statistics.summary.period_end}`}
            />
            <SummaryItem
              label={t('statistics.totalFeature')}
              value={t('statistics.itemCount', { value: statistics.summary.total_features })}
              subValue={t('statistics.countCompleted', { count: statistics.summary.completed_features })}
            />
            <SummaryItem
              label={t('statistics.totalTask')}
              value={t('statistics.itemCount', { value: statistics.summary.total_tasks })}
              subValue={t('statistics.countCompleted', { count: statistics.summary.completed_tasks })}
            />
            <SummaryItem
              label={t('statistics.incompleteWorkTime')}
              value={formatMinutes(statistics.summary.incomplete_work_minutes)}
              highlight
            />
            <SummaryItem
              label={t('statistics.totalImpactScore')}
              value={statistics.impact?.total_impact_score?.toFixed(1) || '0'}
              subValue={t('statistics.weightApplied')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================================
// KPI Card 컴포넌트
// ========================================

interface KPICardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  accentColor: string;
}

function KPICard({ icon: Icon, label, value, subValue, trend, accentColor }: KPICardProps) {
  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'text-emerald-400';
      case 'down':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getAccentBg = () => {
    switch (accentColor) {
      case 'bridge-accent':
        return 'bg-bridge-accent/20';
      case 'bridge-secondary':
        return 'bg-bridge-secondary/20';
      case 'amber-500':
        return 'bg-amber-500/20';
      case 'violet-500':
        return 'bg-violet-500/20';
      default:
        return 'bg-white/10';
    }
  };

  const getIconColor = () => {
    switch (accentColor) {
      case 'bridge-accent':
        return 'text-bridge-accent';
      case 'bridge-secondary':
        return 'text-bridge-secondary';
      case 'amber-500':
        return 'text-amber-500';
      case 'violet-500':
        return 'text-violet-500';
      default:
        return 'text-foreground';
    }
  };

  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-3 sm:p-5">
      <div className="flex items-start justify-between mb-2 sm:mb-3">
        <div className={`p-2 sm:p-2.5 rounded-xl ${getAccentBg()}`}>
          <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${getIconColor()}`} />
        </div>
        {trend && (
          <TrendingUp
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${getTrendColor()} ${trend === 'down' ? 'rotate-180' : ''}`}
          />
        )}
      </div>
      <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate">{label}</p>
      <p className="text-lg sm:text-2xl font-bold text-foreground truncate">{value}</p>
      {subValue && <p className="text-xs sm:text-sm text-slate-400 mt-1 truncate">{subValue}</p>}
    </div>
  );
}

// ========================================
// Summary Item 컴포넌트
// ========================================

interface SummaryItemProps {
  label: string;
  value: string;
  subValue?: string;
  highlight?: boolean;
}

function SummaryItem({ label, value, subValue, highlight }: SummaryItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/15 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <div className="text-right">
        <span className={`font-semibold ${highlight ? 'text-amber-400' : 'text-foreground'}`}>{value}</span>
        {subValue && <span className="text-slate-400 text-xs ml-2">({subValue})</span>}
      </div>
    </div>
  );
}

// ========================================
// Work Analysis View 컴포넌트
// ========================================

interface WorkAnalysisViewProps {
  statistics: BoardStatistics;
  formatMinutes: (minutes: number) => string;
  formatPercent: (value: number) => string;
}

function WorkAnalysisView({ statistics, formatMinutes, formatPercent }: WorkAnalysisViewProps) {
  const { t } = useTranslation();
  // Feature별 상세 데이터
  const featureDetails = useMemo(() => {
    if (!statistics?.by_feature) return [];
    return statistics.by_feature
      .sort((a, b) => b.total_minutes - a.total_minutes)
      .map((f) => ({
        id: f.feature.id,
        title: f.feature.title,
        color: f.feature.color,
        totalMinutes: f.total_minutes,
        completedMinutes: f.completed_minutes,
        taskCount: f.task_count,
        completedTaskCount: f.completed_task_count,
        progress: f.progress_percentage,
        byMember: f.by_member,
      }));
  }, [statistics]);

  // 태그별 시간 분포
  const tagDistribution = useMemo(() => {
    if (!statistics?.by_tag) return [];
    return statistics.by_tag
      .sort((a, b) => b.total_minutes - a.total_minutes)
      .slice(0, 10)
      .map((tg) => ({
        name: tg.tag.name,
        value: tg.total_minutes,
        color: tg.tag.color,
        taskCount: tg.task_count,
      }));
  }, [statistics]);

  // Task 상태 분포
  const taskStatusData = useMemo(() => {
    const { summary } = statistics;
    return [
      { name: t('statistics.completedStatus'), value: summary.completed_tasks, color: '#2DD4BF' },
      { name: t('statistics.incompleteStatus'), value: summary.incomplete_tasks, color: '#6366F1' },
    ];
  }, [statistics, t]);

  // 시간 상태 분포
  const timeStatusData = useMemo(() => {
    const { summary } = statistics;
    return [
      { name: t('statistics.completedTime'), value: summary.completed_work_minutes, color: '#2DD4BF' },
      { name: t('statistics.incompleteTime'), value: summary.incomplete_work_minutes, color: '#F59E0B' },
    ];
  }, [statistics, t]);

  return (
    <div className="space-y-6">
      {/* 상단 KPI 요약 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          icon={ListTodo}
          label={t('statistics.totalFeatureCount')}
          value={t('statistics.itemCount', { value: statistics.summary.total_features })}
          subValue={t('statistics.countCompleted', { count: statistics.summary.completed_features })}
          accentColor="bridge-accent"
        />
        <KPICard
          icon={CheckCircle2}
          label={t('statistics.totalTaskCount')}
          value={t('statistics.itemCount', { value: statistics.summary.total_tasks })}
          subValue={t('statistics.countCompleted', { count: statistics.summary.completed_tasks })}
          accentColor="bridge-secondary"
        />
        <KPICard
          icon={Clock}
          label={t('statistics.totalInputTime')}
          value={formatMinutes(statistics.summary.total_work_minutes)}
          subValue={t('statistics.completedPrefix', { value: formatMinutes(statistics.summary.completed_work_minutes) })}
          accentColor="amber-500"
        />
        <KPICard
          icon={Target}
          label={t('statistics.avgProgress')}
          value={formatPercent(statistics.summary.average_feature_progress / 100)}
          subValue={t('statistics.featureBasis')}
          accentColor="violet-500"
        />
      </div>

      {/* 차트 Row 1: 상태 분포 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Task 상태 분포 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-5 w-5 text-bridge-secondary" />
            {t('statistics.taskStatusDistribution')}
          </h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={taskStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#475569', strokeWidth: 1 }}
                >
                  {taskStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bridge-obsidian)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number) => [t('statistics.itemCount', { value }), t('statistics.taskCount')]}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 시간 상태 분포 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-amber-500" />
            {t('statistics.timeStatusDistribution')}
          </h3>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={timeStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#475569', strokeWidth: 1 }}
                >
                  {timeStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bridge-obsidian)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number) => [formatMinutes(value), t('statistics.workTime')]}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 차트 Row 2: 태그별 분석 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <PieChart className="h-5 w-5 text-violet-500" />
          {t('statistics.tagWorkTime')}
        </h3>
        {tagDistribution.length > 0 ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tagDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#374151' }}
                  axisLine={{ stroke: '#374151' }}
                  tickFormatter={(v) => formatMinutes(v)}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bridge-obsidian)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number, name: string) => [
                    formatMinutes(value),
                    t('statistics.workTime'),
                  ]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {tagDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-400">
            {t('statistics.noTagData')}
          </div>
        )}
      </div>

      {/* Feature별 상세 테이블 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <ListTodo className="h-5 w-5 text-bridge-accent" />
          {t('statistics.featureDetailAnalysis')}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.featureHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.totalTimeHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.completedTimeHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.taskHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.progressHeader')}</th>
                <th className="py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.statusHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {featureDetails.map((feature) => (
                <tr key={feature.id} className="border-b border-white/15 hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: feature.color }}
                      />
                      <span className="text-foreground text-sm font-medium">
                        {feature.title.length > 30 ? `${feature.title.slice(0, 30)}...` : feature.title}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-300 text-sm">
                    {formatMinutes(feature.totalMinutes)}
                  </td>
                  <td className="py-3 px-4 text-right text-bridge-secondary text-sm">
                    {formatMinutes(feature.completedMinutes)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-300 text-sm">
                    {feature.completedTaskCount} / {feature.taskCount}
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <span className={feature.progress >= 80 ? 'text-bridge-secondary' : feature.progress >= 50 ? 'text-amber-400' : 'text-slate-400'}>
                      {feature.progress}%
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${feature.progress}%`,
                          backgroundColor: feature.progress >= 80 ? '#2DD4BF' : feature.progress >= 50 ? '#F59E0B' : '#6366F1',
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {featureDetails.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              {t('statistics.noFeatureData')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================================
// Team Productivity View 컴포넌트
// ========================================

interface TeamProductivityViewProps {
  statistics: BoardStatistics;
  formatMinutes: (minutes: number) => string;
  formatPercent: (value: number) => string;
}

function TeamProductivityView({ statistics, formatMinutes, formatPercent }: TeamProductivityViewProps) {
  const { t } = useTranslation();
  // 멤버별 상세 데이터
  const memberDetails = useMemo(() => {
    if (!statistics?.by_member) return [];
    return statistics.by_member
      .sort((a, b) => b.total_minutes - a.total_minutes)
      .map((m) => ({
        id: m.member.id,
        name: m.member.name,
        profileImage: m.member.profile_image,
        totalMinutes: m.total_minutes,
        completedMinutes: m.completed_minutes,
        taskCount: m.task_count,
        completedTaskCount: m.completed_task_count,
        impactScore: m.impact_score,
        completionRate: m.task_count > 0 ? (m.completed_task_count / m.task_count) * 100 : 0,
        byFeature: m.by_feature,
      }));
  }, [statistics]);

  // 멤버별 작업 시간 차트 데이터
  const memberTimeData = useMemo(() => {
    return memberDetails.slice(0, 8).map((m) => ({
      name: m.name,
      total: Number((m.totalMinutes / 60).toFixed(1)),
      completed: Number((m.completedMinutes / 60).toFixed(1)),
    }));
  }, [memberDetails]);

  // 멤버별 Task 완료율 데이터
  const memberCompletionData = useMemo(() => {
    return memberDetails.slice(0, 8).map((m) => ({
      name: m.name,
      rate: Number(m.completionRate.toFixed(1)),
      total: m.taskCount,
      completed: m.completedTaskCount,
    }));
  }, [memberDetails]);

  // 팀 전체 통계
  const teamStats = useMemo(() => {
    const totalMembers = memberDetails.length;
    const totalMinutes = memberDetails.reduce((sum, m) => sum + m.totalMinutes, 0);
    const totalTasks = memberDetails.reduce((sum, m) => sum + m.taskCount, 0);
    const completedTasks = memberDetails.reduce((sum, m) => sum + m.completedTaskCount, 0);
    const avgMinutesPerMember = totalMembers > 0 ? totalMinutes / totalMembers : 0;
    const avgTasksPerMember = totalMembers > 0 ? totalTasks / totalMembers : 0;

    return {
      totalMembers,
      totalMinutes,
      totalTasks,
      completedTasks,
      avgMinutesPerMember,
      avgTasksPerMember,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
    };
  }, [memberDetails]);

  // Feature 참여 매트릭스 데이터
  const featureParticipation = useMemo(() => {
    const participationMap = new Map<string, { feature: string; color: string; members: { name: string; minutes: number }[] }>();

    memberDetails.forEach((member) => {
      member.byFeature.forEach((f) => {
        if (!participationMap.has(f.feature_id)) {
          participationMap.set(f.feature_id, {
            feature: f.feature_title,
            color: f.feature_color,
            members: [],
          });
        }
        participationMap.get(f.feature_id)!.members.push({
          name: member.name,
          minutes: f.minutes,
        });
      });
    });

    return Array.from(participationMap.values())
      .sort((a, b) => {
        const totalA = a.members.reduce((sum, m) => sum + m.minutes, 0);
        const totalB = b.members.reduce((sum, m) => sum + m.minutes, 0);
        return totalB - totalA;
      })
      .slice(0, 6);
  }, [memberDetails]);

  return (
    <div className="space-y-6">
      {/* 팀 전체 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          icon={Users}
          label={t('statistics.teamSize')}
          value={t('statistics.countPeople', { count: teamStats.totalMembers })}
          subValue={t('statistics.activeMembers')}
          accentColor="bridge-accent"
        />
        <KPICard
          icon={Clock}
          label={t('statistics.teamTotalWorkTime')}
          value={formatMinutes(teamStats.totalMinutes)}
          subValue={t('statistics.avgPerMember', { value: formatMinutes(Math.round(teamStats.avgMinutesPerMember)) })}
          accentColor="bridge-secondary"
        />
        <KPICard
          icon={CheckCircle2}
          label={t('statistics.teamTaskCompletionRate')}
          value={formatPercent(teamStats.completionRate / 100)}
          subValue={`${teamStats.completedTasks} / ${teamStats.totalTasks} Task`}
          trend={teamStats.completionRate > 70 ? 'up' : teamStats.completionRate > 50 ? 'neutral' : 'down'}
          accentColor="amber-500"
        />
        <KPICard
          icon={Target}
          label={t('statistics.avgTaskPerMember')}
          value={t('statistics.countTasks', { count: teamStats.avgTasksPerMember.toFixed(1) })}
          subValue={t('statistics.perMemberAllocation')}
          accentColor="violet-500"
        />
      </div>

      {/* 차트 Row 1: 멤버별 비교 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 멤버별 작업 시간 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-bridge-accent" />
            {t('statistics.memberWorkTimeChart')}
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberTimeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#374151' }}
                  axisLine={{ stroke: '#374151' }}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#374151' }}
                  axisLine={{ stroke: '#374151' }}
                  tickFormatter={(v) => `${v}h`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bridge-obsidian)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number, name: string) => [
                    t('statistics.hourSuffix', { value }),
                    name === 'total' ? t('statistics.totalTime') : t('statistics.completedTime2'),
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: 20 }}
                  formatter={(value) => (
                    <span className="text-slate-400 text-xs">
                      {value === 'total' ? t('statistics.totalLabel') : t('statistics.completedLabel')}
                    </span>
                  )}
                />
                <Bar dataKey="total" name="total" fill="#6366F1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="completed" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 멤버별 Task 완료율 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-5 w-5 text-bridge-secondary" />
            {t('statistics.memberTaskCompletionRate')}
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberCompletionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={{ stroke: '#374151' }}
                  axisLine={{ stroke: '#374151' }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bridge-obsidian)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number, name: string, props: any) => [
                    `${value}% (${props.payload.completed}/${props.payload.total})`,
                    t('statistics.completionRate'),
                  ]}
                />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                  {memberCompletionData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.rate >= 80 ? '#2DD4BF' : entry.rate >= 50 ? '#F59E0B' : '#6366F1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Feature 참여 현황 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-violet-500" />
          {t('statistics.featureParticipation')}
        </h3>
        {featureParticipation.length > 0 ? (
          <div className="space-y-4">
            {featureParticipation.map((fp, index) => (
              <div key={index} className="p-4 bg-bridge-dark rounded-xl border border-white/15">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: fp.color }}
                  />
                  <span className="text-foreground font-medium">{fp.feature}</span>
                  <span className="text-slate-400 text-sm">
                    {t('statistics.participantCount', { count: fp.members.length })}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {fp.members
                    .sort((a, b) => b.minutes - a.minutes)
                    .map((member, mIndex) => (
                      <div
                        key={mIndex}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg"
                      >
                        <div className="w-6 h-6 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                          <span className="text-xs text-bridge-accent font-medium">
                            {getInitials(member.name)}
                          </span>
                        </div>
                        <span className="text-slate-300 text-sm">{member.name}</span>
                        <span className="text-slate-400 text-xs">
                          {formatMinutes(member.minutes)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400">
            {t('statistics.noParticipationData')}
          </div>
        )}
      </div>

      {/* 멤버별 상세 테이블 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-bridge-accent" />
          {t('statistics.memberDetailAnalysis')}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.memberHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.totalTimeHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.completedTimeHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.taskCountHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.completionRate')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.impactScoreHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {memberDetails.map((member) => (
                <tr key={member.id} className="border-b border-white/15 hover:bg-white/5 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                        {member.profileImage ? (
                          <img
                            src={member.profileImage}
                            alt={member.name}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <span className="text-sm text-bridge-accent font-medium">
                            {getInitials(member.name)}
                          </span>
                        )}
                      </div>
                      <span className="text-foreground text-sm font-medium">{member.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-300 text-sm">
                    {formatMinutes(member.totalMinutes)}
                  </td>
                  <td className="py-3 px-4 text-right text-bridge-secondary text-sm">
                    {formatMinutes(member.completedMinutes)}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-300 text-sm">
                    {member.completedTaskCount} / {member.taskCount}
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <span className={member.completionRate >= 80 ? 'text-bridge-secondary' : member.completionRate >= 50 ? 'text-amber-400' : 'text-slate-400'}>
                      {member.completionRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-sm">
                    <span className="text-bridge-accent font-medium">{member.impactScore.toFixed(1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {memberDetails.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              {t('statistics.noMemberData')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================================
// Individual Productivity View 컴포넌트
// ========================================

interface IndividualProductivityViewProps {
  statistics: BoardStatistics;
  boardId: string;
  formatMinutes: (minutes: number) => string;
  formatPercent: (value: number) => string;
  members: BoardMember[];
}

function IndividualProductivityView({
  statistics,
  boardId,
  formatMinutes,
  formatPercent,
  members,
}: IndividualProductivityViewProps) {
  const { t } = useTranslation();
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());

  // Feature 펼치기/접기 토글
  const toggleFeature = (featureId: string) => {
    setExpandedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) {
        next.delete(featureId);
      } else {
        next.add(featureId);
      }
      return next;
    });
  };

  // 선택된 멤버의 통계
  const selectedMemberStats = useMemo(() => {
    if (!selectedMemberId || !statistics?.by_member) return null;
    return statistics.by_member.find((m) => m.member.id === selectedMemberId);
  }, [selectedMemberId, statistics]);

  // 멤버가 참여한 Feature별 시간
  const memberFeatureData = useMemo(() => {
    if (!selectedMemberStats?.by_feature) return [];
    return selectedMemberStats.by_feature
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 8)
      .map((f) => ({
        name: f.feature_title.length > 15 ? `${f.feature_title.slice(0, 15)}...` : f.feature_title,
        value: f.minutes,
        color: f.feature_color,
      }));
  }, [selectedMemberStats]);

  // 멤버 일별 트렌드 (전체 데이터에서 추정)
  const memberDailyTrend = useMemo(() => {
    if (!statistics?.daily_trend || !selectedMemberStats) return [];
    // 비율 기반 추정 (실제로는 서버에서 개인별 트렌드를 받아야 함)
    const memberRatio = statistics.summary.total_work_minutes > 0
      ? selectedMemberStats.total_minutes / statistics.summary.total_work_minutes
      : 0;

    return statistics.daily_trend.slice(-14).map((d) => ({
      date: formatDate(d.date, 'M월 d일'),
      hours: Number(((d.total_minutes * memberRatio) / 60).toFixed(1)),
    }));
  }, [statistics, selectedMemberStats]);

  return (
    <div className="space-y-6">
      {/* 멤버 선택 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-bridge-accent" />
          {t('statistics.selectMember')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {statistics.by_member.map((m) => {
            const boardMember = members.find((bm) => bm.user.id === m.member.id || bm.id === m.member.id);
            const colorHex = getAssigneeHex(m.member.name, boardMember?.assignee_color);
            const isSelected = selectedMemberId === m.member.id;
            return (
              <button
                key={m.member.id}
                onClick={() => setSelectedMemberId(m.member.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                  isSelected
                    ? 'text-white'
                    : 'border-white/20 text-slate-400 hover:border-white/20 hover:text-white'
                }`}
                style={isSelected ? { borderColor: `${colorHex}80`, backgroundColor: `${colorHex}1A` } : undefined}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${colorHex}33` }}
                >
                  {m.member.profile_image ? (
                    <img
                      src={m.member.profile_image}
                      alt={m.member.name}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <span className="text-xs font-medium" style={{ color: colorHex }}>
                      {getInitials(m.member.name)}
                    </span>
                  )}
                </div>
                <span className="text-sm">{m.member.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedMemberStats ? (
        <>
          {/* 개인 KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KPICard
              icon={Clock}
              label={t('statistics.personalTotalWorkTime')}
              value={formatMinutes(selectedMemberStats.total_minutes)}
              subValue={t('statistics.completedPrefix', { value: formatMinutes(selectedMemberStats.completed_minutes) })}
              accentColor="bridge-accent"
            />
            <KPICard
              icon={CheckCircle2}
              label={t('statistics.personalTaskCompletionRate')}
              value={formatPercent(selectedMemberStats.task_count > 0 ? selectedMemberStats.completed_task_count / selectedMemberStats.task_count : 0)}
              subValue={`${selectedMemberStats.completed_task_count} / ${selectedMemberStats.task_count} Task`}
              trend={selectedMemberStats.completed_task_count / selectedMemberStats.task_count > 0.7 ? 'up' : 'neutral'}
              accentColor="bridge-secondary"
            />
            <KPICard
              icon={Target}
              label={t('statistics.participatingFeatures')}
              value={t('statistics.itemCount', { value: selectedMemberStats.by_feature.length })}
              subValue={t('statistics.inProgressLabel')}
              accentColor="amber-500"
            />
            <KPICard
              icon={Zap}
              label={t('statistics.impactScore')}
              value={selectedMemberStats.impact_score.toFixed(1)}
              subValue={t('statistics.weightReflected')}
              accentColor="violet-500"
            />
          </div>

          {/* 차트 Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Feature별 작업 시간 */}
            <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
              <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
                <PieChart className="h-5 w-5 text-bridge-accent" />
                {t('statistics.featureWorkTime')}
              </h3>
              {memberFeatureData.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={memberFeatureData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {memberFeatureData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bridge-obsidian)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          padding: '12px',
                        }}
                        labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                        itemStyle={{ color: '#94a3b8' }}
                        formatter={(value: number) => [formatMinutes(value), t('statistics.workTime')]}
                      />
                      <Legend
                        verticalAlign="middle"
                        align="right"
                        layout="vertical"
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                          <span className="text-slate-400 text-xs ml-1">{value}</span>
                        )}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-slate-400">
                  {t('statistics.noData')}
                </div>
              )}
            </div>

            {/* 일별 작업 트렌드 */}
            <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
              <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
                <Activity className="h-5 w-5 text-bridge-secondary" />
                {t('statistics.dailyWorkTrend')}
              </h3>
              {memberDailyTrend.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={memberDailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickLine={{ stroke: '#374151' }}
                        axisLine={{ stroke: '#374151' }}
                      />
                      <YAxis
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickLine={{ stroke: '#374151' }}
                        axisLine={{ stroke: '#374151' }}
                        tickFormatter={(v) => `${v}h`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--bridge-obsidian)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          padding: '12px',
                        }}
                        labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                        itemStyle={{ color: '#94a3b8' }}
                        formatter={(value: number) => [t('statistics.hourSuffix', { value }), t('statistics.workTime')]}
                      />
                      <Line
                        type="monotone"
                        dataKey="hours"
                        stroke="#6366F1"
                        strokeWidth={2}
                        dot={{ fill: '#6366F1', r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-slate-400">
                  {t('statistics.noData')}
                </div>
              )}
            </div>
          </div>

          {/* Feature 상세 테이블 */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
            <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
              <ListTodo className="h-5 w-5 text-violet-500" />
              {t('statistics.participatingFeatureDetail')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.featureHeader')}</th>
                    <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.workTimeHeader')}</th>
                    <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.proportionHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMemberStats.by_feature.map((f) => {
                    const percentage = selectedMemberStats.total_minutes > 0
                      ? (f.minutes / selectedMemberStats.total_minutes) * 100
                      : 0;
                    const isExpanded = expandedFeatures.has(f.feature_id);
                    const hasTasks = f.tasks && f.tasks.length > 0;
                    return (
                      <React.Fragment key={f.feature_id}>
                        <tr
                          onClick={() => hasTasks && toggleFeature(f.feature_id)}
                          className={`border-b border-white/15 transition-colors ${hasTasks ? 'hover:bg-white/5 cursor-pointer' : ''}`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {hasTasks ? (
                                isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                )
                              ) : (
                                <div className="w-4" />
                              )}
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: f.feature_color }}
                              />
                              <span className="text-foreground text-sm">{f.feature_title}</span>
                              {hasTasks && (
                                <span className="text-slate-400 text-xs">{t('statistics.taskCountSuffix', { count: f.tasks?.length })}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300 text-sm">
                            {formatMinutes(f.minutes)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-24 bg-white/10 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full bg-bridge-accent"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <span className="text-slate-400 text-xs w-12 text-right">
                                {percentage.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                        {/* 펼쳐진 Task 목록 */}
                        {isExpanded && f.tasks && f.tasks.map((task) => (
                          <tr key={task.task_id} className="bg-white/[0.02]">
                            <td className="py-2 px-4 pl-14">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                <span className="text-slate-400 text-sm">{task.task_title}</span>
                              </div>
                            </td>
                            <td className="py-2 px-4 text-right text-slate-400 text-sm">
                              {formatMinutes(task.minutes)}
                            </td>
                            <td className="py-2 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-24 bg-white/5 rounded-full h-1.5">
                                  <div
                                    className="h-1.5 rounded-full bg-slate-500"
                                    style={{ width: `${task.percentage}%` }}
                                  />
                                </div>
                                <span className="text-slate-400 text-xs w-12 text-right">
                                  {task.percentage.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <div className="text-center">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('statistics.selectMemberGuide')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// Impact Analysis View 컴포넌트
// ========================================

interface ImpactAnalysisViewProps {
  statistics: BoardStatistics;
  boardId: string;
  formatMinutes: (minutes: number) => string;
  formatPercent: (value: number) => string;
  isWeightSettingsOpen: boolean;
  setIsWeightSettingsOpen: (open: boolean) => void;
  loadStatistics: () => void;
}

function ImpactAnalysisView({
  statistics,
  boardId,
  formatMinutes,
  formatPercent,
  isWeightSettingsOpen,
  setIsWeightSettingsOpen,
  loadStatistics,
}: ImpactAnalysisViewProps) {
  const { t } = useTranslation();
  const { impact } = statistics;

  // 멤버별 임팩트 점수 데이터
  const memberImpactData = useMemo(() => {
    if (!impact?.by_member) return [];
    return impact.by_member
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, 10)
      .map((m) => ({
        name: m.member_name,
        score: Number(m.impact_score.toFixed(1)),
        weightedMinutes: m.weighted_minutes,
      }));
  }, [impact]);

  // 가중치 레벨별 분포
  const weightLevelData = useMemo(() => {
    if (!impact?.by_weight_level) return [];
    return impact.by_weight_level.map((l) => ({
      name: l.level.name,
      value: l.total_minutes,
      taskCount: l.task_count,
      color: l.level.color,
      weight: l.level.weight,
    }));
  }, [impact]);

  // 가중치 레벨 색상 매핑
  const getWeightLevelColor = (weight: number) => {
    if (weight >= 2.0) return '#EF4444'; // Critical - red
    if (weight >= 1.5) return '#F59E0B'; // High - amber
    if (weight >= 1.0) return '#6366F1'; // Medium - indigo
    return '#94A3B8'; // Low - slate
  };

  return (
    <div className="space-y-6">
      {/* Impact KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          icon={Zap}
          label={t('statistics.totalImpact')}
          value={(impact?.total_impact_score || 0).toFixed(1)}
          subValue={t('statistics.weightTimesTime')}
          accentColor="bridge-accent"
        />
        <KPICard
          icon={Users}
          label={t('statistics.contributingMembers')}
          value={t('statistics.countPeople', { count: impact?.by_member?.length || 0 })}
          subValue={t('statistics.activeParticipation')}
          accentColor="bridge-secondary"
        />
        <KPICard
          icon={Target}
          label={t('statistics.weightLevelCount')}
          value={t('statistics.itemCount', { value: impact?.by_weight_level?.length || 0 })}
          subValue={t('statistics.configured')}
          accentColor="amber-500"
        />
        <KPICard
          icon={TrendingUp}
          label={t('statistics.avgWeight')}
          value={
            impact?.by_weight_level && impact.by_weight_level.length > 0
              ? (
                  impact.by_weight_level.reduce((sum, l) => sum + l.level.weight * l.total_minutes, 0) /
                  impact.by_weight_level.reduce((sum, l) => sum + l.total_minutes, 0)
                ).toFixed(2)
              : '0'
          }
          subValue={t('statistics.timeWeightedAvg')}
          accentColor="violet-500"
        />
      </div>

      {/* 차트 Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 멤버별 임팩트 점수 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-bridge-accent" />
            {t('statistics.memberImpactScore')}
          </h3>
          {memberImpactData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberImpactData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={{ stroke: '#374151' }}
                    axisLine={{ stroke: '#374151' }}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bridge-obsidian)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '12px',
                    }}
                    labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                    itemStyle={{ color: '#94a3b8' }}
                    formatter={(value: number, name: string) => [
                      value.toFixed(1),
                      t('statistics.impactScoreLabel'),
                    ]}
                  />
                  <Bar dataKey="score" fill="#6366F1" radius={[0, 4, 4, 0]}>
                    {memberImpactData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? '#2DD4BF' : index < 3 ? '#6366F1' : '#475569'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              {t('statistics.noData')}
            </div>
          )}
        </div>

        {/* 가중치 레벨별 분포 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <Target className="h-5 w-5 text-amber-500" />
            {t('statistics.weightLevelTimeDistribution')}
          </h3>
          {weightLevelData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={weightLevelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#475569', strokeWidth: 1 }}
                  >
                    {weightLevelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || getWeightLevelColor(entry.weight)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bridge-obsidian)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '12px',
                    }}
                    labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                    itemStyle={{ color: '#94a3b8' }}
                    formatter={(value: number, name: string, props: any) => [
                      `${formatMinutes(value)} (${props.payload.taskCount} Task)`,
                      props.payload.name,
                    ]}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              {t('statistics.noData')}
            </div>
          )}
        </div>
      </div>

      {/* 가중치 레벨 설명 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-500" />
            {t('statistics.weightLevelDetail')}
          </h3>
          <button
            onClick={() => setIsWeightSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/20 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <Settings className="h-4 w-4" />
            {t('statistics.settingsBtn')}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {impact?.by_weight_level?.map((level, index) => (
            <div
              key={index}
              className="p-4 bg-bridge-dark rounded-xl border border-white/15"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: level.level.color || getWeightLevelColor(level.level.weight) }}
                />
                <span className="text-foreground font-medium">{level.level.name}</span>
                <span className="text-slate-400 text-xs ml-auto">×{level.level.weight}</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t('statistics.workTime')}</span>
                  <span className="text-foreground">{formatMinutes(level.total_minutes)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t('statistics.taskCountLabel')}</span>
                  <span className="text-foreground">{t('statistics.itemCount', { value: level.task_count })}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t('statistics.impactContribution')}</span>
                  <span className="text-bridge-accent font-medium">
                    {(level.total_minutes * level.level.weight / 60).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          )) || (
            <div className="col-span-2 lg:col-span-4 py-8 text-center text-slate-400">
              {t('statistics.noWeightLevels')}
            </div>
          )}
        </div>
      </div>

      {/* 멤버별 상세 테이블 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-4 sm:p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-bridge-accent" />
          {t('statistics.memberImpactDetail')}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.rankHeader')}</th>
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.memberHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.impactScoreHeader')}</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.weightedTimeHeader')}</th>
                <th className="py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{t('statistics.proportionHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {impact?.by_member?.map((member, index) => {
                const percentage = impact.total_impact_score > 0
                  ? (member.impact_score / impact.total_impact_score) * 100
                  : 0;
                return (
                  <tr key={member.member_id} className="border-b border-white/15 hover:bg-white/5 transition-colors">
                    <td className="py-3 px-4">
                      <span className={`
                        inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                        ${index === 0 ? 'bg-amber-500/20 text-amber-400' :
                          index === 1 ? 'bg-slate-400/20 text-slate-300' :
                          index === 2 ? 'bg-amber-700/20 text-amber-600' :
                          'bg-white/5 text-slate-400'}
                      `}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                          {member.profile_image ? (
                            <img
                              src={member.profile_image}
                              alt={member.member_name}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <span className="text-sm text-bridge-accent font-medium">
                              {getInitials(member.member_name)}
                            </span>
                          )}
                        </div>
                        <span className="text-foreground text-sm font-medium">{member.member_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-bridge-accent font-bold text-lg">
                        {member.impact_score.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-300 text-sm">
                      {formatMinutes(member.weighted_minutes)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-white/10 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-bridge-accent"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-slate-400 text-xs w-12 text-right">
                          {percentage.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              }) || (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    {t('statistics.noMemberImpactData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 임팩트 점수 계산 설명 */}
      <div className="bg-bridge-dark rounded-xl border border-white/20 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-bridge-accent/20 rounded-lg">
            <Zap className="h-4 w-4 text-bridge-accent" />
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">{t('statistics.impactCalcTitle')}</p>
            <p className="text-slate-400 text-sm">
              {t('statistics.impactCalcFormula')}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              {t('statistics.impactCalcDesc')}
            </p>
          </div>
        </div>
      </div>

      {/* 가중치 레벨 설정 모달 */}
      <WeightLevelSettingsModal
        open={isWeightSettingsOpen}
        onClose={() => setIsWeightSettingsOpen(false)}
        boardId={boardId}
        onSave={() => {
          // 설정 저장 후 통계 다시 로드
          loadStatistics();
        }}
      />
    </div>
  );
}
