import React, { useState, useEffect, useMemo } from 'react';
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
import { getInitials } from '../utils/assigneeColor';
import { WeightLevelSettingsModal } from './WeightLevelSettingsModal';

interface StatisticsViewProps {
  boardId: string;
  milestones: Milestone[];
  tags: Tag[];
  members: BoardMember[];
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
  { label: '최근 7일', value: '7d' },
  { label: '최근 30일', value: '30d' },
  { label: '이번 달', value: 'this_month' },
  { label: '지난 달', value: 'last_month' },
  { label: '전체', value: 'all' },
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
}: StatisticsViewProps) {
  const [activeView, setActiveView] = useState<StatisticsViewType>('overview');
  const [filter, setFilter] = useState<StatisticsFilter>(DEFAULT_FILTER);
  const [periodPreset, setPeriodPreset] = useState('30d');
  const [statistics, setStatistics] = useState<BoardStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isWeightSettingsOpen, setIsWeightSettingsOpen] = useState(false);

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
      start_date: startDate ? startDate.toISOString().split('T')[0] : null,
      end_date: endDate.toISOString().split('T')[0],
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
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
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
      date: new Date(d.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
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
  const VIEW_TABS: { type: StatisticsViewType; label: string; icon: React.ElementType }[] = [
    { type: 'overview', label: '요약', icon: BarChart3 },
    { type: 'individual', label: '개인', icon: Users },
    { type: 'team', label: '팀', icon: Target },
    { type: 'work', label: '작업', icon: ListTodo },
    { type: 'impact', label: '임팩트', icon: Zap },
  ];

  if (isLoading && !statistics) {
    return (
      <div className="flex items-center justify-center h-full bg-bridge-dark">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 text-bridge-accent mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">통계 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bridge-dark">
      {/* 상단 네비게이션 & 필터 */}
      <div className="flex-none px-6 py-4 border-b border-white/15 bg-bridge-obsidian">
        <div className="flex items-center justify-between">
          {/* 뷰 타입 탭 */}
          <div className="flex items-center gap-1 bg-bridge-dark rounded-xl p-1 border border-white/20">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.type}
                onClick={() => setActiveView(tab.type)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeView === tab.type
                    ? 'bg-bridge-accent text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* 기간 & 필터 */}
          <div className="flex items-center gap-3">
            {/* 마일스톤 선택 */}
            <div className="relative">
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
                <option value="">전체 마일스톤</option>
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
            <div className="flex items-center gap-1 bg-bridge-dark rounded-xl p-1 border border-white/20">
              {PERIOD_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => {
                    setPeriodPreset(preset.value);
                    // 기간 프리셋 선택 시 마일스톤 필터 해제 (옵션)
                    // setFilter((prev) => ({ ...prev, milestone_ids: [] }));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    periodPreset === preset.value
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* 상세 필터 버튼 */}
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                isFilterOpen || filter.member_ids.length > 0 || filter.tag_ids.length > 0
                  ? 'border-bridge-accent text-bridge-accent bg-bridge-accent/10'
                  : 'border-white/20 text-slate-400 hover:text-white hover:border-white/20'
              }`}
            >
              <Filter className="h-4 w-4" />
              필터
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
            <div className="grid grid-cols-3 gap-4">
              {/* 멤버 필터 */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">
                  멤버
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
                  <option value="">전체</option>
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
                  태그
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
                  <option value="">전체</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
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
                  필터 초기화
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 overflow-y-auto p-6">
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
  const { summary } = statistics;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* 총 작업 시간 */}
        <KPICard
          icon={Clock}
          label="총 작업 시간"
          value={formatMinutes(summary.total_work_minutes)}
          subValue={`완료: ${formatMinutes(summary.completed_work_minutes)}`}
          trend={summary.focus_rate > 0.7 ? 'up' : summary.focus_rate > 0.5 ? 'neutral' : 'down'}
          accentColor="bridge-accent"
        />

        {/* 완료율 */}
        <KPICard
          icon={CheckCircle2}
          label="Task 완료율"
          value={formatPercent(summary.total_tasks > 0 ? summary.completed_tasks / summary.total_tasks : 0)}
          subValue={`${summary.completed_tasks} / ${summary.total_tasks} Task`}
          trend={summary.completed_tasks / summary.total_tasks > 0.7 ? 'up' : 'neutral'}
          accentColor="bridge-secondary"
        />

        {/* 집중도 */}
        <KPICard
          icon={Target}
          label="집중도"
          value={formatPercent(summary.focus_rate)}
          subValue="완료 시간 / 전체 시간"
          trend={summary.focus_rate > 0.8 ? 'up' : summary.focus_rate > 0.6 ? 'neutral' : 'down'}
          accentColor="amber-500"
        />

        {/* Feature 진행률 */}
        <KPICard
          icon={TrendingUp}
          label="평균 Feature 진행률"
          value={formatPercent(summary.average_feature_progress / 100)}
          subValue={`${summary.completed_features} / ${summary.total_features} 완료`}
          trend={summary.average_feature_progress > 70 ? 'up' : 'neutral'}
          accentColor="violet-500"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 일별 작업 시간 트렌드 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-bridge-accent" />
              일별 작업 시간
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
                    backgroundColor: '#0F1419',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#94a3b8' }}
                  formatter={(value: number, name: string) => [
                    `${value}시간`,
                    name === 'hours' ? '전체' : '완료',
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
                  name="전체 작업"
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={{ fill: '#6366F1', r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="completed_hours"
                  name="완료된 작업"
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
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <PieChart className="h-5 w-5 text-bridge-secondary" />
              Feature별 시간 분포
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
                    backgroundColor: '#0F1419',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  formatter={(value: number) => [formatMinutes(value), '작업 시간']}
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
      <div className="grid grid-cols-2 gap-6">
        {/* 멤버별 기여도 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-amber-500" />
              멤버별 작업 시간
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
                    backgroundColor: '#0F1419',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  formatter={(value: number, name: string) => [
                    name === 'hours' ? `${value}시간` : `${value}개`,
                    name === 'hours' ? '작업 시간' : 'Task 수',
                  ]}
                />
                <Bar dataKey="hours" name="작업 시간" fill="#6366F1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 요약 통계 카드 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-500" />
              상세 요약
            </h3>
          </div>
          <div className="space-y-4">
            <SummaryItem
              label="분석 기간"
              value={`${statistics.summary.period_start} ~ ${statistics.summary.period_end}`}
            />
            <SummaryItem
              label="전체 Feature"
              value={`${statistics.summary.total_features}개`}
              subValue={`${statistics.summary.completed_features}개 완료`}
            />
            <SummaryItem
              label="전체 Task"
              value={`${statistics.summary.total_tasks}개`}
              subValue={`${statistics.summary.completed_tasks}개 완료`}
            />
            <SummaryItem
              label="미완료 작업 시간"
              value={formatMinutes(statistics.summary.incomplete_work_minutes)}
              highlight
            />
            <SummaryItem
              label="총 임팩트 점수"
              value={statistics.impact?.total_impact_score?.toFixed(1) || '0'}
              subValue="가중치 적용됨"
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
    <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${getAccentBg()}`}>
          <Icon className={`h-5 w-5 ${getIconColor()}`} />
        </div>
        {trend && (
          <TrendingUp
            className={`h-4 w-4 ${getTrendColor()} ${trend === 'down' ? 'rotate-180' : ''}`}
          />
        )}
      </div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {subValue && <p className="text-sm text-slate-400 mt-1">{subValue}</p>}
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
      .map((t) => ({
        name: t.tag.name,
        value: t.total_minutes,
        color: t.tag.color,
        taskCount: t.task_count,
      }));
  }, [statistics]);

  // Task 상태 분포
  const taskStatusData = useMemo(() => {
    const { summary } = statistics;
    return [
      { name: '완료', value: summary.completed_tasks, color: '#2DD4BF' },
      { name: '미완료', value: summary.incomplete_tasks, color: '#6366F1' },
    ];
  }, [statistics]);

  // 시간 상태 분포
  const timeStatusData = useMemo(() => {
    const { summary } = statistics;
    return [
      { name: '완료된 시간', value: summary.completed_work_minutes, color: '#2DD4BF' },
      { name: '미완료 시간', value: summary.incomplete_work_minutes, color: '#F59E0B' },
    ];
  }, [statistics]);

  return (
    <div className="space-y-6">
      {/* 상단 KPI 요약 */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          icon={ListTodo}
          label="전체 Feature"
          value={`${statistics.summary.total_features}개`}
          subValue={`${statistics.summary.completed_features}개 완료`}
          accentColor="bridge-accent"
        />
        <KPICard
          icon={CheckCircle2}
          label="전체 Task"
          value={`${statistics.summary.total_tasks}개`}
          subValue={`${statistics.summary.completed_tasks}개 완료`}
          accentColor="bridge-secondary"
        />
        <KPICard
          icon={Clock}
          label="총 투입 시간"
          value={formatMinutes(statistics.summary.total_work_minutes)}
          subValue={`완료: ${formatMinutes(statistics.summary.completed_work_minutes)}`}
          accentColor="amber-500"
        />
        <KPICard
          icon={Target}
          label="평균 진행률"
          value={formatPercent(statistics.summary.average_feature_progress / 100)}
          subValue="Feature 기준"
          accentColor="violet-500"
        />
      </div>

      {/* 차트 Row 1: 상태 분포 */}
      <div className="grid grid-cols-2 gap-6">
        {/* Task 상태 분포 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-5 w-5 text-bridge-secondary" />
            Task 상태 분포
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
                    backgroundColor: '#0F1419',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  formatter={(value: number) => [`${value}개`, 'Task 수']}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 시간 상태 분포 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-amber-500" />
            시간 상태 분포
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
                    backgroundColor: '#0F1419',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  formatter={(value: number) => [formatMinutes(value), '작업 시간']}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 차트 Row 2: 태그별 분석 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <PieChart className="h-5 w-5 text-violet-500" />
          태그별 작업 시간
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
                    backgroundColor: '#0F1419',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  formatter={(value: number, name: string) => [
                    formatMinutes(value),
                    '작업 시간',
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
            태그 데이터가 없습니다
          </div>
        )}
      </div>

      {/* Feature별 상세 테이블 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <ListTodo className="h-5 w-5 text-bridge-accent" />
          Feature별 상세 분석
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Feature</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">총 시간</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">완료 시간</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Task</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">진행률</th>
                <th className="py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">상태</th>
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
              Feature 데이터가 없습니다
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
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          icon={Users}
          label="팀 규모"
          value={`${teamStats.totalMembers}명`}
          subValue="활성 멤버"
          accentColor="bridge-accent"
        />
        <KPICard
          icon={Clock}
          label="팀 총 작업 시간"
          value={formatMinutes(teamStats.totalMinutes)}
          subValue={`평균 ${formatMinutes(Math.round(teamStats.avgMinutesPerMember))}/인`}
          accentColor="bridge-secondary"
        />
        <KPICard
          icon={CheckCircle2}
          label="팀 Task 완료율"
          value={formatPercent(teamStats.completionRate / 100)}
          subValue={`${teamStats.completedTasks} / ${teamStats.totalTasks} Task`}
          trend={teamStats.completionRate > 70 ? 'up' : teamStats.completionRate > 50 ? 'neutral' : 'down'}
          accentColor="amber-500"
        />
        <KPICard
          icon={Target}
          label="인당 평균 Task"
          value={`${teamStats.avgTasksPerMember.toFixed(1)}개`}
          subValue="팀원당 할당"
          accentColor="violet-500"
        />
      </div>

      {/* 차트 Row 1: 멤버별 비교 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 멤버별 작업 시간 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-bridge-accent" />
            멤버별 작업 시간
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
                    backgroundColor: '#0F1419',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  formatter={(value: number, name: string) => [
                    `${value}시간`,
                    name === 'total' ? '전체 시간' : '완료 시간',
                  ]}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: 20 }}
                  formatter={(value) => (
                    <span className="text-slate-400 text-xs">
                      {value === 'total' ? '전체' : '완료'}
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
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-5 w-5 text-bridge-secondary" />
            멤버별 Task 완료율
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
                    backgroundColor: '#0F1419',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                  formatter={(value: number, name: string, props: any) => [
                    `${value}% (${props.payload.completed}/${props.payload.total})`,
                    '완료율',
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
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <Target className="h-5 w-5 text-violet-500" />
          Feature별 팀원 참여 현황
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
                    ({fp.members.length}명 참여)
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
            참여 데이터가 없습니다
          </div>
        )}
      </div>

      {/* 멤버별 상세 테이블 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-bridge-accent" />
          팀원별 상세 분석
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">멤버</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">총 시간</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">완료 시간</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Task 수</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">완료율</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">임팩트 점수</th>
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
              멤버 데이터가 없습니다
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
      date: new Date(d.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      hours: Number(((d.total_minutes * memberRatio) / 60).toFixed(1)),
    }));
  }, [statistics, selectedMemberStats]);

  return (
    <div className="space-y-6">
      {/* 멤버 선택 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-bridge-accent" />
          멤버 선택
        </h3>
        <div className="flex flex-wrap gap-2">
          {statistics.by_member.map((m) => (
            <button
              key={m.member.id}
              onClick={() => setSelectedMemberId(m.member.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                selectedMemberId === m.member.id
                  ? 'border-bridge-accent bg-bridge-accent/10 text-white'
                  : 'border-white/20 text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                {m.member.profile_image ? (
                  <img
                    src={m.member.profile_image}
                    alt={m.member.name}
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <span className="text-xs text-bridge-accent font-medium">
                    {getInitials(m.member.name)}
                  </span>
                )}
              </div>
              <span className="text-sm">{m.member.name}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedMemberStats ? (
        <>
          {/* 개인 KPI */}
          <div className="grid grid-cols-4 gap-4">
            <KPICard
              icon={Clock}
              label="총 작업 시간"
              value={formatMinutes(selectedMemberStats.total_minutes)}
              subValue={`완료: ${formatMinutes(selectedMemberStats.completed_minutes)}`}
              accentColor="bridge-accent"
            />
            <KPICard
              icon={CheckCircle2}
              label="Task 완료율"
              value={formatPercent(selectedMemberStats.task_count > 0 ? selectedMemberStats.completed_task_count / selectedMemberStats.task_count : 0)}
              subValue={`${selectedMemberStats.completed_task_count} / ${selectedMemberStats.task_count} Task`}
              trend={selectedMemberStats.completed_task_count / selectedMemberStats.task_count > 0.7 ? 'up' : 'neutral'}
              accentColor="bridge-secondary"
            />
            <KPICard
              icon={Target}
              label="참여 Feature"
              value={`${selectedMemberStats.by_feature.length}개`}
              subValue="진행 중"
              accentColor="amber-500"
            />
            <KPICard
              icon={Zap}
              label="임팩트 점수"
              value={selectedMemberStats.impact_score.toFixed(1)}
              subValue="가중치 반영"
              accentColor="violet-500"
            />
          </div>

          {/* 차트 Row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Feature별 작업 시간 */}
            <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
              <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
                <PieChart className="h-5 w-5 text-bridge-accent" />
                Feature별 작업 시간
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
                          backgroundColor: '#0F1419',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          padding: '12px',
                        }}
                        formatter={(value: number) => [formatMinutes(value), '작업 시간']}
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
                  데이터가 없습니다
                </div>
              )}
            </div>

            {/* 일별 작업 트렌드 */}
            <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
              <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
                <Activity className="h-5 w-5 text-bridge-secondary" />
                일별 작업 추이
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
                          backgroundColor: '#0F1419',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          padding: '12px',
                        }}
                        formatter={(value: number) => [`${value}시간`, '작업 시간']}
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
                  데이터가 없습니다
                </div>
              )}
            </div>
          </div>

          {/* Feature 상세 테이블 */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
            <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
              <ListTodo className="h-5 w-5 text-violet-500" />
              참여 Feature 상세
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Feature</th>
                    <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">작업 시간</th>
                    <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">비중</th>
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
                                <span className="text-slate-400 text-xs">({f.tasks?.length}개 Task)</span>
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
            <p>멤버를 선택하면 개인 통계를 확인할 수 있습니다</p>
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
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          icon={Zap}
          label="총 임팩트 점수"
          value={(impact?.total_impact_score || 0).toFixed(1)}
          subValue="가중치 × 시간"
          accentColor="bridge-accent"
        />
        <KPICard
          icon={Users}
          label="기여 멤버 수"
          value={`${impact?.by_member?.length || 0}명`}
          subValue="활성 참여"
          accentColor="bridge-secondary"
        />
        <KPICard
          icon={Target}
          label="가중치 레벨 수"
          value={`${impact?.by_weight_level?.length || 0}개`}
          subValue="설정됨"
          accentColor="amber-500"
        />
        <KPICard
          icon={TrendingUp}
          label="평균 가중치"
          value={
            impact?.by_weight_level && impact.by_weight_level.length > 0
              ? (
                  impact.by_weight_level.reduce((sum, l) => sum + l.level.weight * l.total_minutes, 0) /
                  impact.by_weight_level.reduce((sum, l) => sum + l.total_minutes, 0)
                ).toFixed(2)
              : '0'
          }
          subValue="시간 가중 평균"
          accentColor="violet-500"
        />
      </div>

      {/* 차트 Row 1 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 멤버별 임팩트 점수 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <Zap className="h-5 w-5 text-bridge-accent" />
            멤버별 임팩트 점수
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
                      backgroundColor: '#0F1419',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '12px',
                    }}
                    formatter={(value: number, name: string) => [
                      value.toFixed(1),
                      '임팩트 점수',
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
              데이터가 없습니다
            </div>
          )}
        </div>

        {/* 가중치 레벨별 분포 */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
          <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
            <Target className="h-5 w-5 text-amber-500" />
            가중치 레벨별 시간 분포
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
                      backgroundColor: '#0F1419',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      padding: '12px',
                    }}
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
              데이터가 없습니다
            </div>
          )}
        </div>
      </div>

      {/* 가중치 레벨 설명 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-500" />
            가중치 레벨 상세
          </h3>
          <button
            onClick={() => setIsWeightSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/20 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-all"
          >
            <Settings className="h-4 w-4" />
            설정
          </button>
        </div>
        <div className="grid grid-cols-4 gap-4">
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
                  <span className="text-slate-400">작업 시간</span>
                  <span className="text-foreground">{formatMinutes(level.total_minutes)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Task 수</span>
                  <span className="text-foreground">{level.task_count}개</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">임팩트 기여</span>
                  <span className="text-bridge-accent font-medium">
                    {(level.total_minutes * level.level.weight / 60).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          )) || (
            <div className="col-span-4 py-8 text-center text-slate-400">
              가중치 레벨이 설정되지 않았습니다
            </div>
          )}
        </div>
      </div>

      {/* 멤버별 상세 테이블 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/15 p-6">
        <h3 className="text-foreground font-semibold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-bridge-accent" />
          멤버별 임팩트 상세
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/20">
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">순위</th>
                <th className="text-left py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">멤버</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">임팩트 점수</th>
                <th className="text-right py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">가중 시간</th>
                <th className="py-3 px-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">비중</th>
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
                    멤버 데이터가 없습니다
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
            <p className="text-foreground font-medium mb-1">임팩트 점수 계산 방식</p>
            <p className="text-slate-400 text-sm">
              Impact Score = Σ (Task 작업 시간 × Task 가중치)
            </p>
            <p className="text-slate-400 text-xs mt-1">
              각 Task에 설정된 가중치(Critical, High, Medium, Low)와 투입 시간을 곱하여 산출합니다.
              높은 우선순위 작업에 더 많은 시간을 투입할수록 임팩트 점수가 높아집니다.
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
