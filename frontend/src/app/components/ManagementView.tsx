import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Target,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  Settings,
  RefreshCw,
  AlertCircle,
  Calendar,
  BarChart3,
  Activity,
  User,
  Loader2,
  Edit3,
  Save,
  X,
  ListTodo,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import { managementService, ManagementFilter, milestoneService } from '../utils/services';
import type {
  ManagementStatistics,
  MilestoneHealth,
  MilestoneTask,
  MemberProductivity,
  DelayedItems,
  Milestone,
  BoardMember,
  MilestoneAllocation,
} from '../types';
import { taskService } from '../utils/services';

interface ManagementViewProps {
  boardId: string;
  milestones: Milestone[];
  members: BoardMember[];
  onTaskClick?: (taskId: string) => void;
  refreshTrigger?: number; // 이 값이 변경되면 데이터 새로고침
}

// 상태별 색상 및 라벨
const STATUS_CONFIG = {
  ON_TRACK: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', labelKey: 'management.statusOnTrack' },
  SLOW: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', labelKey: 'management.statusSlow' },
  AT_RISK: { color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30', labelKey: 'management.statusAtRisk' },
  OVERDUE: { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30', labelKey: 'management.statusOverdue' },
  // 팀원 업무 과열 상태
  NORMAL: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', labelKey: 'management.statusNormal' },
  OVERWORKED: { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30', labelKey: 'management.statusOverworked' },
  RELAXED: { color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30', labelKey: 'management.statusRelaxed' },
  // 이전 호환성
  NEEDS_ATTENTION: { color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30', labelKey: 'management.statusNeedsAttention' },
  COMPLETED: { color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30', labelKey: 'management.statusCompleted' },
};

// 시간 포맷팅 헬퍼 함수
const formatMinutes = (minutes: number | null | undefined, t: (key: string, options?: Record<string, unknown>) => string): string => {
  if (minutes == null || minutes === 0) return '-';
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return t('management.minuteUnit', { value: mins });
  if (mins === 0) return t('management.hourUnit', { value: hours });
  return t('management.hourMinuteUnit', { hours, minutes: mins });
};

const formatMinutesShort = (minutes: number | null | undefined): string => {
  if (minutes == null || minutes === 0) return '-';
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const formatMinutesPerDay = (minutes: number | null | undefined, t: (key: string, options?: Record<string, unknown>) => string): string => {
  if (minutes == null || minutes === 0) return t('management.minutePerDay', { value: 0 });
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return t('management.minutePerDay', { value: mins });
  return t('management.hourMinutePerDay', { hours, minutes: mins });
};

export function ManagementView({ boardId, milestones, members, onTaskClick, refreshTrigger }: ManagementViewProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<ManagementStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(
    milestones.length > 0 ? milestones[0].id : null
  );
  const [settings, setSettings] = useState({
    stagnant_task_days: 3,
    stuck_checklist_days: 2,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [showTaskList, setShowTaskList] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'health' | 'productivity' | 'delayed'>('health');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 데이터 로드
  const loadData = async (isRefresh = false) => {
    // 초기 로드가 아닌 새로고침이면 isRefreshing 사용 (UI 상태 유지)
    if (isRefresh || data) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const filter: ManagementFilter = {
        milestone_id: selectedMilestoneId || undefined,
        stagnant_task_days: settings.stagnant_task_days,
        stuck_checklist_days: settings.stuck_checklist_days,
      };
      const result = await managementService.getManagementStatistics(boardId, filter);
      setData(result);
    } catch (err) {
      setError(t('management.loadFailed'));
      console.error('Failed to load management statistics:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [boardId, selectedMilestoneId, settings, refreshTrigger]);

  // 건강 점수 색상
  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-bridge-dark">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>{t('management.loadingData')}</span>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-bridge-dark gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-slate-400">{error || t('management.noData')}</p>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-bridge-accent text-white rounded-lg hover:bg-bridge-accent/90 transition-colors"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-bridge-dark">
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-bridge-accent" />
              <h1 className="text-lg sm:text-xl font-bold text-foreground whitespace-nowrap">{t('management.dashboard')}</h1>
            </div>

            {/* 마일스톤 필터 */}
            <select
              value={selectedMilestoneId || ''}
              onChange={(e) => setSelectedMilestoneId(e.target.value)}
              className="px-2 sm:px-3 py-1.5 bg-foreground/5 border border-bridge-border rounded-lg text-sm text-foreground min-w-0
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
            >
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              title={t('management.settingsTooltip')}
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={loadData}
              className="p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              title={t('management.refreshTooltip')}
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 설정 패널 */}
        {showSettings && (
          <div className="p-3 sm:p-4 bg-bridge-obsidian rounded-xl border border-bridge-border">
            <h3 className="text-sm font-medium text-foreground mb-3">{t('management.delayCriteria')}</h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm text-slate-400">{t('management.stagnantTask')}</label>
                <select
                  value={settings.stagnant_task_days}
                  onChange={(e) => setSettings({ ...settings, stagnant_task_days: Number(e.target.value) })}
                  className="px-2 py-1 bg-foreground/5 border border-bridge-border rounded text-sm text-foreground"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>{t('management.daysUnit', { count: d })}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">{t('management.sameBlockDays')}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm text-slate-400">{t('management.stuckChecklist')}</label>
                <select
                  value={settings.stuck_checklist_days}
                  onChange={(e) => setSettings({ ...settings, stuck_checklist_days: Number(e.target.value) })}
                  className="px-2 py-1 bg-foreground/5 border border-bridge-border rounded text-sm text-foreground"
                >
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>{t('management.daysUnit', { count: d })}</option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">{t('management.incompleteDays')}</span>
              </div>
            </div>
          </div>
        )}

        {/* 요약 카드들 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* 전체 건강 점수 */}
          <div className="p-3 sm:p-4 bg-bridge-obsidian rounded-xl border border-bridge-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-xs font-medium text-slate-400 uppercase tracking-wider">{t('management.healthScore')}</span>
              <Activity className="w-4 h-4 text-slate-400" />
            </div>
            <div className={`text-2xl sm:text-3xl font-bold ${getHealthScoreColor(data.summary.overall_health_score)}`}>
              {data.summary.overall_health_score}
              <span className="text-base sm:text-lg text-slate-400">/100</span>
            </div>
          </div>

          {/* 마일스톤 진행 */}
          <div className="p-3 sm:p-4 bg-bridge-obsidian rounded-xl border border-bridge-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-xs font-medium text-slate-400 uppercase tracking-wider">
                {t('management.milestoneProgress')}
              </span>
              <Target className="w-4 h-4 text-slate-400" />
            </div>
            {data.milestone_health.length > 0 ? (
              <>
                <div className="text-2xl sm:text-3xl font-bold text-foreground">
                  {data.milestone_health[0].progress_percentage.toFixed(0)}%
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {data.milestone_health[0].velocity.tasks_completed}/{data.milestone_health[0].velocity.tasks_total} Task
                </div>
              </>
            ) : (
              <div className="text-2xl sm:text-3xl font-bold text-slate-400">-</div>
            )}
          </div>

          {/* 팀원 현황 */}
          <div className="p-3 sm:p-4 bg-bridge-obsidian rounded-xl border border-bridge-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-xs font-medium text-slate-400 uppercase tracking-wider">{t('management.teamMembers')}</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-foreground">{data.summary.members_on_track}</span>
              <span className="text-slate-400">/ {data.summary.total_members}</span>
            </div>
            {data.summary.members_needing_attention > 0 && (
              <div className="mt-1 text-xs text-orange-400">
                {t('management.membersNeedAttention', { count: data.summary.members_needing_attention })}
              </div>
            )}
          </div>

          {/* 지연 항목 */}
          <div className="p-3 sm:p-4 bg-bridge-obsidian rounded-xl border border-bridge-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-xs font-medium text-slate-400 uppercase tracking-wider">{t('management.delayedItems')}</span>
              <AlertTriangle className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-foreground">
              {data.summary.total_delayed_items}
              <span className="text-base sm:text-lg text-slate-400"></span>
            </div>
            {data.summary.total_delayed_items > 0 && (
              <div className="mt-1 text-xs text-red-400">
                {t('management.actionRequired')}
              </div>
            )}
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex items-center gap-1 p-1 bg-bridge-obsidian rounded-xl border border-bridge-border w-full sm:w-fit overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveTab('health')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'health'
                ? 'bg-bridge-accent text-white'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" />
              {data.milestone_health.length > 0
                ? data.milestone_health[0].milestone.title
                : t('management.milestoneDefault')}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('productivity')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'productivity'
                ? 'bg-bridge-accent text-white'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t('management.teamProductivity')}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('delayed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'delayed'
                ? 'bg-bridge-accent text-white'
                : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {t('management.delayedItems')}
              {data.summary.total_delayed_items > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">
                  {data.summary.total_delayed_items}
                </span>
              )}
            </div>
          </button>
        </div>

        {/* 탭 콘텐츠 */}
        {activeTab === 'health' && (
          <MilestoneHealthSection
            milestoneHealth={data.milestone_health}
            showTaskList={showTaskList}
            setShowTaskList={setShowTaskList}
            boardId={boardId}
            onRefresh={() => loadData(true)}
            onTaskClick={onTaskClick}
            isRefreshing={isRefreshing}
            members={members}
          />
        )}
        {activeTab === 'productivity' && (
          <TeamProductivitySection
            teamProductivity={data.team_productivity}
            expandedMembers={expandedMembers}
            setExpandedMembers={setExpandedMembers}
          />
        )}
        {activeTab === 'delayed' && (
          <DelayedItemsSection delayedItems={data.delayed_items} />
        )}
      </div>
    </div>
  );
}

// ==================== 마일스톤 헬스 섹션 ====================

function MilestoneHealthSection({
  milestoneHealth,
  showTaskList,
  setShowTaskList,
  boardId,
  onRefresh,
  onTaskClick,
  isRefreshing,
  members,
}: {
  milestoneHealth: MilestoneHealth[];
  showTaskList: Set<string>;
  setShowTaskList: React.Dispatch<React.SetStateAction<Set<string>>>;
  boardId: string;
  onRefresh: () => void;
  onTaskClick?: (taskId: string) => void;
  isRefreshing?: boolean;
  members: BoardMember[];
}) {
  const { t } = useTranslation();
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editingMinutes, setEditingMinutes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showAllocationSection, setShowAllocationSection] = useState<Set<string>>(new Set());

  const toggleTaskList = (milestoneId: string) => {
    setShowTaskList((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  };

  const toggleAllocationSection = (milestoneId: string) => {
    setShowAllocationSection((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  };

  const startEditing = (taskId: string, currentMinutes: number | null) => {
    setEditingTask(taskId);
    setEditingMinutes(currentMinutes ? String(currentMinutes) : '');
  };

  const cancelEditing = () => {
    setEditingTask(null);
    setEditingMinutes('');
  };

  const saveEstimatedMinutes = async (taskId: string) => {
    setIsSaving(true);
    try {
      const minutes = editingMinutes ? parseInt(editingMinutes, 10) : null;
      await taskService.updateTask(boardId, taskId, {
        estimated_minutes: minutes,
      });
      setEditingTask(null);
      setEditingMinutes('');
      onRefresh();
    } catch (error) {
      console.error('Failed to update estimated minutes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (milestoneHealth.length === 0) {
    return (
      <div className="p-8 bg-bridge-obsidian rounded-xl border border-bridge-border text-center">
        <Target className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <p className="text-slate-400">{t('management.noMilestone')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 relative">
      {/* 새로고침 중 오버레이 */}
      {isRefreshing && (
        <div className="absolute inset-0 bg-bridge-dark/50 backdrop-blur-[1px] z-10 flex items-start justify-center pt-20">
          <div className="flex items-center gap-2 text-slate-400 bg-bridge-obsidian px-4 py-2 rounded-lg border border-bridge-border">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{t('management.updating')}</span>
          </div>
        </div>
      )}
      {milestoneHealth.map((health) => {
        const statusConfig = STATUS_CONFIG[health.status];

        return (
          <div
            key={health.milestone.id}
            className="bg-bridge-obsidian rounded-xl border border-bridge-border overflow-hidden"
          >
            {/* 헤더 */}
            <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="min-w-0">
                  <h3 className="font-medium text-foreground truncate">{health.milestone.title}</h3>
                  <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-slate-400">
                    <span className="truncate">{health.milestone.start_date} ~ {health.milestone.end_date}</span>
                    <span className="flex-shrink-0">D{health.days_remaining >= 0 ? `-${health.days_remaining}` : `+${health.days_overdue}`}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 sm:gap-6 self-end sm:self-auto">
                {/* 진행률 */}
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-bold text-foreground">
                    {health.progress_percentage.toFixed(0)}%
                  </div>
                  <div className="text-xs sm:text-xs text-slate-400">
                    {health.velocity.tasks_completed}/{health.velocity.tasks_total} Task
                    {health.velocity.estimated_total_minutes ? (
                      <span className="ml-1 hidden sm:inline">
                        ({formatMinutesShort(health.velocity.actual_total_minutes || 0)}/{formatMinutesShort(health.velocity.estimated_total_minutes)})
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* 상태 뱃지 */}
                <div className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-xs font-medium ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border} border whitespace-nowrap`}>
                  {t(statusConfig.labelKey)}
                </div>
              </div>
            </div>

            {/* 상세 콘텐츠 */}
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-bridge-border">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-3 sm:pt-4">
                  {/* 속도 & 추정 정확도 통합 */}
                  <div className="space-y-4">
                    {health.velocity.estimated_total_minutes ? (
                      (() => {
                        const estimated = health.velocity.estimated_total_minutes || 0;
                        const actual = health.velocity.actual_total_minutes || 0;
                        const efficiency = actual > 0 ? (estimated / actual) * 100 : 0;
                        const overflowRate = estimated > 0 ? ((actual - estimated) / estimated) * 100 : 0;
                        const isOverBudget = actual > estimated;

                        // 시간 기반 속도 계산
                        const startDate = new Date(health.milestone.start_date);
                        const today = new Date();
                        const elapsedDays = Math.max(1, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
                        const currentSpeedPerDay = actual / elapsedDays;
                        const requiredSpeed = health.velocity.required_minutes_per_day || 0;

                        // 효율 색상
                        const getEfficiencyColor = (eff: number) => {
                          if (eff >= 80 && eff <= 120) return 'text-emerald-400';
                          if ((eff >= 50 && eff < 80) || (eff > 120 && eff <= 150)) return 'text-yellow-400';
                          return 'text-red-400';
                        };
                        const getEfficiencyBg = (eff: number) => {
                          if (eff >= 80 && eff <= 120) return 'bg-emerald-500/20 border-emerald-500/30';
                          if ((eff >= 50 && eff < 80) || (eff > 120 && eff <= 150)) return 'bg-yellow-500/20 border-yellow-500/30';
                          return 'bg-red-500/20 border-red-500/30';
                        };

                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-[auto_1fr_1fr] gap-3 sm:gap-4 items-start">
                            {/* 추정 정확도 박스 */}
                            <div className={`w-full sm:w-24 p-2 sm:p-3 rounded-lg border ${getEfficiencyBg(efficiency)} text-center self-center col-span-2 sm:col-span-1`}>
                              <div className={`text-2xl font-bold ${getEfficiencyColor(efficiency)}`}>
                                {efficiency > 0 ? `${efficiency.toFixed(0)}%` : '-'}
                              </div>
                              <div className="text-xs text-slate-400 mt-1">{t('management.estimationAccuracy')}</div>
                            </div>

                            {/* 시간 정보 */}
                            <div className="space-y-2">
                              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{t('management.timeLabel')}</h4>
                              <div className="flex justify-between text-sm gap-4">
                                <span className="text-slate-400">{t('management.estimated')}</span>
                                <span className="text-foreground">{formatMinutes(estimated, t)}</span>
                              </div>
                              <div className="flex justify-between text-sm items-center gap-4">
                                <span className="text-slate-400">{t('management.actual')}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className={isOverBudget ? 'text-red-400' : 'text-emerald-400'}>
                                    {formatMinutes(actual, t)}
                                  </span>
                                  {isOverBudget && overflowRate > 0 && (
                                    <span className="text-xs px-1 py-0.5 bg-red-500/20 text-red-400 rounded">
                                      +{overflowRate.toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* 속도 정보 */}
                            <div className="space-y-2">
                              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">{t('management.speedLabel')}</h4>
                              <div className="flex justify-between text-sm gap-4">
                                <span className="text-slate-400">{t('management.current')}</span>
                                <span className="text-foreground">
                                  {currentSpeedPerDay > 0 ? formatMinutesPerDay(currentSpeedPerDay, t) : t('management.minutePerDay', { value: 0 })}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm gap-4">
                                <span className="text-slate-400">{t('management.required')}</span>
                                <span className={requiredSpeed > currentSpeedPerDay ? 'text-orange-400' : 'text-emerald-400'}>
                                  {requiredSpeed > 0 ? formatMinutesPerDay(requiredSpeed, t) : '-'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      /* Feature 기반 표시 (시간 데이터 없을 때) */
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">Feature</h4>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">{t('management.totalFeature')}</span>
                          <span className="text-foreground">{t('management.countUnit', { count: health.feature_summary.total_features })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">{t('management.completedFeature')}</span>
                          <span className="text-emerald-400">{t('management.countUnit', { count: health.feature_summary.completed_features })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">{t('management.atRiskFeature')}</span>
                          <span className={health.feature_summary.at_risk_features > 0 ? 'text-red-400' : 'text-slate-400'}>
                            {t('management.countUnit', { count: health.feature_summary.at_risk_features })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 번다운 차트 */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('management.burndownChart')}</h4>
                    {health.burndown.length > 0 && health.burndown[0].ideal_remaining_minutes ? (
                      <div className="h-36">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={health.burndown}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10, fill: '#9CA3AF' }}
                              tickFormatter={(v) => v.slice(5)}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: '#9CA3AF' }}
                              tickFormatter={(v) => `${Math.round(v / 60)}h`}
                              domain={[0, 'auto']}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#1F2937',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                              }}
                              formatter={(value: number, name: string) => {
                                const label = name === 'ideal_remaining_minutes' ? t('management.idealLine') : t('management.actualLine');
                                return [formatMinutes(value, t), label];
                              }}
                              labelFormatter={(label) => label}
                            />
                            <Legend
                              formatter={(value) => value === 'ideal_remaining_minutes' ? t('management.idealLine') : t('management.actualLine')}
                              wrapperStyle={{ fontSize: '11px' }}
                            />
                            {/* 이상적 라인 (직선, 점선) */}
                            <Line
                              type="linear"
                              dataKey="ideal_remaining_minutes"
                              stroke="#6366F1"
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              dot={false}
                              name="ideal_remaining_minutes"
                            />
                            {/* 실제 남은 작업 라인 */}
                            <Line
                              type="monotone"
                              dataKey="actual_remaining_minutes"
                              stroke="#10B981"
                              strokeWidth={2}
                              dot={false}
                              name="actual_remaining_minutes"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-36 flex items-center justify-center text-slate-400 text-sm">
                        {health.burndown.length > 0 ? t('management.noEstimatedData') : t('management.noDataAvailable')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Task 목록 토글 버튼 */}
                <div className="mt-4 pt-4 border-t border-bridge-border">
                  <button
                    onClick={() => toggleTaskList(health.milestone.id)}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-foreground transition-colors"
                  >
                    <ListTodo className="w-4 h-4" />
                    <span>{t('management.taskList', { count: health.tasks?.length || 0 })}</span>
                    {showTaskList.has(health.milestone.id) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {/* Task 목록 */}
                  {showTaskList.has(health.milestone.id) && health.tasks && (
                    <div className="mt-3 space-y-2">
                      {/* 미설정 Task 경고 */}
                      {health.tasks.filter(tk => !tk.estimated_minutes).length > 0 && (
                        <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          <span>
                            {t('management.unestimatedTasks', { count: health.tasks.filter(tk => !tk.estimated_minutes).length })}
                          </span>
                        </div>
                      )}

                      {/* Task 테이블 */}
                      <div className="bg-white/[0.02] rounded-lg overflow-x-auto">
                        <div className="min-w-[600px]">
                        <div className="grid grid-cols-[1.5fr_1fr_0.8fr_140px_90px] gap-2 px-3 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider border-b border-bridge-border">
                          <div>{t('management.taskHeader')}</div>
                          <div>{t('management.featureHeader')}</div>
                          <div>{t('management.assigneeHeader')}</div>
                          <div className="text-center">{t('management.timeHeader')}</div>
                          <div className="text-center">{t('management.blockHeader')}</div>
                        </div>
                        <div className="max-h-64 overflow-auto">
                          {[...health.tasks]
                            .sort((a, b) => {
                              // 1. Done이 아닌 것 먼저
                              if (a.current_block === 'Done' && b.current_block !== 'Done') return 1;
                              if (a.current_block !== 'Done' && b.current_block === 'Done') return -1;
                              // 2. 같은 상태면 Task ID로 정렬 (안정적 순서 유지)
                              return a.task_id.localeCompare(b.task_id);
                            })
                            .map((task) => (
                            <div
                              key={task.task_id}
                              className="grid grid-cols-[1.5fr_1fr_0.8fr_140px_90px] gap-2 px-3 py-2 items-center text-sm border-b border-bridge-border last:border-0"
                            >
                              {/* Task 정보 (클릭 시 모달 열기) */}
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  onClick={() => onTaskClick?.(task.task_id)}
                                  className="text-foreground truncate hover:text-bridge-accent transition-colors text-left"
                                >
                                  {task.task_title}
                                </button>
                              </div>

                              {/* Feature */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: task.feature_color }}
                                />
                                <span className="text-slate-400 text-xs truncate">{task.feature_title}</span>
                              </div>

                              {/* 담당자 (최대 3명 + 추가 인원 수) */}
                              <div className="flex items-center gap-1 min-w-0">
                                {task.assignees && task.assignees.length > 0 ? (
                                  <div className="flex items-center">
                                    {/* 프로필 이미지들 (겹치게) */}
                                    <div className="flex -space-x-1.5">
                                      {task.assignees.slice(0, 3).map((assignee, idx) => (
                                        assignee.profile_image ? (
                                          <img
                                            key={assignee.id}
                                            src={assignee.profile_image}
                                            alt={assignee.name}
                                            title={assignee.name}
                                            className="w-5 h-5 rounded-full border border-bridge-obsidian flex-shrink-0"
                                            style={{ zIndex: 3 - idx }}
                                          />
                                        ) : (
                                          <div
                                            key={assignee.id}
                                            title={assignee.name}
                                            className="w-5 h-5 rounded-full bg-bridge-accent/20 flex items-center justify-center flex-shrink-0 border border-bridge-obsidian"
                                            style={{ zIndex: 3 - idx }}
                                          >
                                            <User className="w-3 h-3 text-bridge-accent" />
                                          </div>
                                        )
                                      ))}
                                      {/* +N 표시 */}
                                      {task.assignees.length > 3 && (
                                        <div
                                          className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs text-muted-foreground border border-bridge-obsidian flex-shrink-0"
                                          title={task.assignees.slice(3).map(a => a.name).join(', ')}
                                        >
                                          +{task.assignees.length - 3}
                                        </div>
                                      )}
                                    </div>
                                    {/* 이름 (1명일 때만 표시) */}
                                    {task.assignees.length === 1 && (
                                      <span className="text-slate-400 text-xs truncate ml-1.5">
                                        {task.assignees[0].name}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-xs">-</span>
                                )}
                              </div>

                              {/* 시간 (진행시간/예상시간, 편집 가능) */}
                              <div className="text-center">
                                {editingTask === task.task_id ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <input
                                      type="number"
                                      value={editingMinutes}
                                      onChange={(e) => setEditingMinutes(e.target.value)}
                                      className="w-16 px-1 py-0.5 bg-foreground/10 border border-bridge-border rounded text-xs text-foreground text-center"
                                      placeholder={t('management.minutePlaceholder')}
                                      min="0"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => saveEstimatedMinutes(task.task_id)}
                                      disabled={isSaving}
                                      className="p-0.5 text-emerald-400 hover:bg-emerald-500/20 rounded"
                                      aria-label="저장"
                                    >
                                      <Save className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={cancelEditing}
                                      className="p-0.5 text-slate-400 hover:bg-foreground/10 rounded"
                                      aria-label="닫기"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  // 모든 Task: 진행시간 / 예상시간 표시 (클릭하여 예상 시간 수정 가능)
                                  <button
                                    onClick={() => startEditing(task.task_id, task.estimated_minutes)}
                                    className="flex items-center justify-center gap-1 text-xs group w-full"
                                  >
                                    <span className={task.current_block === 'Done' ? 'text-emerald-400 font-medium' : task.actual_minutes ? 'text-muted-foreground' : 'text-slate-400'}>
                                      {task.actual_minutes ? formatMinutesShort(task.actual_minutes) : '-'}
                                    </span>
                                    <span className="text-slate-400">/</span>
                                    <span className={task.estimated_minutes ? 'text-muted-foreground' : 'text-slate-400'}>
                                      {task.estimated_minutes ? formatMinutesShort(task.estimated_minutes) : '-'}
                                    </span>
                                    <Edit3 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                  </button>
                                )}
                              </div>

                              {/* 블록 (Done 강조) */}
                              <div className="text-center">
                                {task.current_block === 'Done' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full border border-emerald-500/30">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Done
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400 truncate">
                                    {task.current_block}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 팀원 할당 현황 토글 버튼 */}
                <div className="mt-4 pt-4 border-t border-bridge-border">
                  <button
                    onClick={() => toggleAllocationSection(health.milestone.id)}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-foreground transition-colors"
                  >
                    <Users className="w-4 h-4" />
                    <span>{t('management.teamAllocation')}</span>
                    {showAllocationSection.has(health.milestone.id) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>

                  {/* 팀원 할당 현황 섹션 */}
                  {showAllocationSection.has(health.milestone.id) && (
                    <TeamAllocationSubSection
                      boardId={boardId}
                      milestoneId={health.milestone.id}
                      members={members}
                      velocity={health.velocity}
                      onRefresh={onRefresh}
                    />
                  )}
                </div>
              </div>
            </div>
        );
      })}
    </div>
  );
}

// ==================== 팀원 할당 현황 서브 섹션 ====================

function TeamAllocationSubSection({
  boardId,
  milestoneId,
  members,
  velocity,
  onRefresh,
}: {
  boardId: string;
  milestoneId: string;
  members: BoardMember[];
  velocity: {
    average_tasks_per_day: number;
    tasks_remaining: number;
    tasks_completed: number;
    tasks_total: number;
    required_velocity: number;
    estimated_total_minutes: number | null;
    actual_total_minutes: number | null;
  };
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [allocations, setAllocations] = useState<MilestoneAllocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [workingDays, setWorkingDays] = useState('');
  const [allocatedHours, setAllocatedHours] = useState('');
  const DEFAULT_HOURS_PER_DAY = 6;

  // Load allocations
  useEffect(() => {
    const loadAllocations = async () => {
      setIsLoading(true);
      try {
        const data = await milestoneService.getAllocations(boardId, milestoneId);
        setAllocations(data);
      } catch (error) {
        console.error('Failed to load allocations:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadAllocations();
  }, [boardId, milestoneId]);

  // Auto-calculate allocated hours when working days change
  useEffect(() => {
    if (workingDays && !editingAllocation) {
      const days = parseInt(workingDays, 10);
      if (!isNaN(days)) {
        setAllocatedHours(String(days * DEFAULT_HOURS_PER_DAY));
      }
    }
  }, [workingDays, editingAllocation]);

  const handleAddAllocation = async () => {
    if (!selectedMemberId || !workingDays || !allocatedHours) return;

    setIsSaving(true);
    try {
      const newAllocation = await milestoneService.createAllocation(boardId, milestoneId, {
        member_id: selectedMemberId,
        working_days: parseInt(workingDays, 10),
        total_allocated_hours: parseInt(allocatedHours, 10),
      });
      setAllocations([...allocations, newAllocation]);
      resetForm();
      onRefresh();
    } catch (error) {
      console.error('Failed to create allocation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateAllocation = async (allocationId: string) => {
    if (!workingDays || !allocatedHours) return;

    setIsSaving(true);
    try {
      const updated = await milestoneService.updateAllocation(boardId, milestoneId, allocationId, {
        working_days: parseInt(workingDays, 10),
        total_allocated_hours: parseInt(allocatedHours, 10),
      });
      setAllocations(allocations.map(a => a.id === allocationId ? updated : a));
      setEditingAllocation(null);
      resetForm();
      onRefresh();
    } catch (error) {
      console.error('Failed to update allocation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAllocation = async (allocationId: string) => {
    if (!confirm(t('management.deleteAllocationConfirm'))) return;

    try {
      await milestoneService.deleteAllocation(boardId, milestoneId, allocationId);
      setAllocations(allocations.filter(a => a.id !== allocationId));
      onRefresh();
    } catch (error) {
      console.error('Failed to delete allocation:', error);
    }
  };

  const startEdit = (allocation: MilestoneAllocation) => {
    setEditingAllocation(allocation.id);
    setWorkingDays(String(allocation.working_days));
    setAllocatedHours(String(allocation.total_allocated_hours));
  };

  const resetForm = () => {
    setSelectedMemberId('');
    setWorkingDays('');
    setAllocatedHours('');
    setShowAddForm(false);
    setEditingAllocation(null);
  };

  // Calculate totals
  const totalAllocatedHours = allocations.reduce((sum, a) => sum + a.total_allocated_hours, 0);
  const totalActualHours = allocations.reduce((sum, a) => sum + (a.actual_worked_hours || 0), 0);
  const totalDifference = totalActualHours - totalAllocatedHours;

  // Calculate task allocation comparison
  const taskAllocatedMinutes = velocity.estimated_total_minutes || 0;
  const taskAllocatedHours = Math.round(taskAllocatedMinutes / 60);
  const availableHours = totalAllocatedHours;
  const overcommitHours = taskAllocatedHours - availableHours;
  const overcommitPercentage = availableHours > 0 ? (overcommitHours / availableHours) * 100 : 0;
  const isOvercommitted = overcommitHours > 0;

  // Filter members not already allocated
  const availableMembers = members.filter(
    m => !allocations.some(a => a.member.id === m.user.id)
  );

  if (isLoading) {
    return (
      <div className="mt-3 p-4 bg-white/[0.02] rounded-lg flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('management.teamAllocation')}</h4>
        {!showAddForm && availableMembers.length > 0 && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-bridge-accent hover:bg-bridge-accent/10 rounded-lg transition-colors"
          >
            <UserPlus className="w-3 h-3" />
            <span>{t('management.addMember')}</span>
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="p-3 bg-bridge-accent/5 border border-bridge-accent/20 rounded-lg space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">{t('management.memberLabel')}</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full px-2 py-1.5 bg-foreground/5 border border-bridge-border rounded text-sm text-foreground"
              >
                <option value="">{t('management.selectMember')}</option>
                {availableMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">{t('management.workingDays')}</label>
              <input
                type="number"
                value={workingDays}
                onChange={(e) => setWorkingDays(e.target.value)}
                placeholder={t('management.dayPlaceholder')}
                min="1"
                className="w-full px-2 py-1.5 bg-foreground/5 border border-bridge-border rounded text-sm text-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">{t('management.allocatedHours')}</label>
              <input
                type="number"
                value={allocatedHours}
                onChange={(e) => setAllocatedHours(e.target.value)}
                placeholder={t('management.hourPlaceholder')}
                min="1"
                className="w-full px-2 py-1.5 bg-foreground/5 border border-bridge-border rounded text-sm text-foreground"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={resetForm}
              className="px-3 py-1 text-xs text-slate-400 hover:text-foreground transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleAddAllocation}
              disabled={isSaving || !selectedMemberId || !workingDays || !allocatedHours}
              className="px-3 py-1 text-xs bg-bridge-accent text-white rounded hover:bg-bridge-accent/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? t('management.saving') : t('common.add')}
            </button>
          </div>
        </div>
      )}

      {/* Allocation table */}
      {allocations.length > 0 ? (
        <div className="bg-white/[0.02] rounded-lg overflow-x-auto">
          <div className="min-w-[600px]">
          <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr_60px] gap-2 px-3 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider border-b border-bridge-border">
            <div>{t('management.memberLabel')}</div>
            <div className="text-center">{t('management.workingDays')}</div>
            <div className="text-center">{t('management.allocatedHours')}</div>
            <div className="text-center">{t('management.actualHours')}</div>
            <div className="text-center">{t('management.difference')}</div>
            <div className="text-center">{t('management.statusLabel')}</div>
            <div></div>
          </div>
          <div className="divide-y divide-white/5">
            {allocations.map((allocation) => (
              <div key={allocation.id} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr_60px] gap-2 px-3 py-2 items-center text-sm">
                {/* Member */}
                <div className="flex items-center gap-2">
                  {allocation.member.profile_image ? (
                    <img
                      src={allocation.member.profile_image}
                      alt={allocation.member.name}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                      <User className="w-3 h-3 text-bridge-accent" />
                    </div>
                  )}
                  <span className="text-foreground">{allocation.member.name}</span>
                </div>

                {/* Working days */}
                <div className="text-center">
                  {editingAllocation === allocation.id ? (
                    <input
                      type="number"
                      value={workingDays}
                      onChange={(e) => setWorkingDays(e.target.value)}
                      className="w-14 px-1 py-0.5 bg-foreground/10 border border-bridge-border rounded text-xs text-foreground text-center"
                      min="1"
                    />
                  ) : (
                    <span className="text-muted-foreground">{t('management.daysUnit', { count: allocation.working_days })}</span>
                  )}
                </div>

                {/* Allocated hours */}
                <div className="text-center">
                  {editingAllocation === allocation.id ? (
                    <input
                      type="number"
                      value={allocatedHours}
                      onChange={(e) => setAllocatedHours(e.target.value)}
                      className="w-14 px-1 py-0.5 bg-foreground/10 border border-bridge-border rounded text-xs text-foreground text-center"
                      min="1"
                    />
                  ) : (
                    <span className="text-muted-foreground">{allocation.total_allocated_hours}h</span>
                  )}
                </div>

                {/* Actual hours */}
                <div className="text-center">
                  <span className="text-slate-400">
                    {allocation.actual_worked_hours != null ? `${Number(allocation.actual_worked_hours).toFixed(1)}h` : '-'}
                  </span>
                </div>

                {/* Difference */}
                <div className="text-center">
                  {allocation.difference != null ? (
                    <span className={allocation.difference > 0 ? 'text-red-400' : allocation.difference < 0 ? 'text-emerald-400' : 'text-slate-400'}>
                      {allocation.difference > 0 ? '+' : ''}{Number(allocation.difference).toFixed(1)}h
                    </span>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </div>

                {/* Status */}
                <div className="text-center">
                  {allocation.status === 'OVER' && (
                    <span className="text-red-400 text-xs">{t('management.statusOver')}</span>
                  )}
                  {allocation.status === 'UNDER' && (
                    <span className="text-emerald-400 text-xs">{t('management.statusUnder')}</span>
                  )}
                  {allocation.status === 'NORMAL' && (
                    <span className="text-slate-400 text-xs">{t('management.statusNormalShort')}</span>
                  )}
                  {!allocation.status && (
                    <span className="text-slate-400 text-xs">-</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1">
                  {editingAllocation === allocation.id ? (
                    <>
                      <button
                        onClick={() => handleUpdateAllocation(allocation.id)}
                        disabled={isSaving}
                        className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"
                      >
                        <Save className="w-3 h-3" />
                      </button>
                      <button
                        onClick={resetForm}
                        className="p-1 text-slate-400 hover:bg-foreground/10 rounded"
                        aria-label="닫기"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(allocation)}
                        className="p-1 text-slate-400 hover:text-foreground hover:bg-foreground/10 rounded"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleDeleteAllocation(allocation.id)}
                        className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Totals row */}
            <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr_60px] gap-2 px-3 py-2 items-center text-sm bg-white/[0.02] font-medium">
              <div className="text-slate-400">{t('management.total')}</div>
              <div className="text-center text-slate-400">-</div>
              <div className="text-center text-foreground">{totalAllocatedHours}h</div>
              <div className="text-center text-foreground">{totalActualHours.toFixed(1)}h</div>
              <div className="text-center">
                <span className={totalDifference > 0 ? 'text-red-400' : totalDifference < 0 ? 'text-emerald-400' : 'text-foreground'}>
                  {totalDifference > 0 ? '+' : ''}{totalDifference.toFixed(1)}h
                </span>
              </div>
              <div className="text-center">
                {totalDifference > 0 && <span className="text-red-400 text-xs">{t('management.statusOver')}</span>}
                {totalDifference < 0 && <span className="text-emerald-400 text-xs">{t('management.statusUnder')}</span>}
                {totalDifference === 0 && <span className="text-slate-400 text-xs">{t('management.statusNormalShort')}</span>}
              </div>
              <div></div>
            </div>
          </div>
        </div>
        </div>
      ) : (
        <div className="p-4 bg-white/[0.02] rounded-lg text-center text-slate-400 text-sm">
          {t('management.noAllocation')}
        </div>
      )}

      {/* Overcommit summary */}
      {allocations.length > 0 && taskAllocatedHours > 0 && (
        <div className={`p-3 rounded-lg border ${isOvercommitted ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-sm">
            <div>
              <span className="text-slate-400">{t('management.allocatedWork')}</span>
              <span className="text-foreground font-medium">{taskAllocatedHours}h</span>
            </div>
            <div>
              <span className="text-slate-400">{t('management.totalAvailable')}</span>
              <span className="text-foreground font-medium">{availableHours}h</span>
            </div>
            <div className={isOvercommitted ? 'text-red-400' : 'text-emerald-400'}>
              {isOvercommitted ? (
                <>
                  <span>{t('management.marginShortage', { hours: Math.round(overcommitHours) })}</span>
                  <span className="ml-2 text-xs">{t('management.marginExcess', { percent: overcommitPercentage.toFixed(0) })}</span>
                </>
              ) : (
                <>
                  <span>{t('management.marginAvailable', { hours: Math.round(Math.abs(overcommitHours)) })}</span>
                  <span className="ml-2 text-xs">{t('management.marginRemaining', { percent: Math.abs(overcommitPercentage).toFixed(0) })}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== 팀원 생산성 섹션 ====================

function TeamProductivitySection({
  teamProductivity,
  expandedMembers,
  setExpandedMembers,
}: {
  teamProductivity: MemberProductivity[];
  expandedMembers: Set<string>;
  setExpandedMembers: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const { t } = useTranslation();
  const toggleExpand = (id: string) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (teamProductivity.length === 0) {
    return (
      <div className="p-8 bg-bridge-obsidian rounded-xl border border-bridge-border text-center">
        <Users className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <p className="text-slate-400">{t('management.noTeamData')}</p>
      </div>
    );
  }

  return (
    <div className="bg-bridge-obsidian rounded-xl border border-bridge-border overflow-x-auto">
      <div className="min-w-[640px]">
      {/* 테이블 헤더 */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-3 sm:gap-4 px-3 sm:px-4 py-3 border-b border-bridge-border text-xs font-medium text-slate-400 uppercase tracking-wider">
        <div>{t('management.teamMemberHeader')}</div>
        <div className="text-center">{t('management.assignedHeader')}</div>
        <div className="text-center">{t('management.completedHeader')}</div>
        <div className="text-center">{t('management.completionRateHeader')}</div>
        <div className="text-center">{t('management.workTimeHeader')}</div>
        <div className="text-center">{t('management.statusLabel')}</div>
      </div>

      {/* 테이블 바디 */}
      {teamProductivity.map((member) => {
        const isExpanded = expandedMembers.has(member.member.id);
        const statusConfig = STATUS_CONFIG[member.status];

        return (
          <div key={member.member.id} className="border-b border-bridge-border last:border-0">
            {/* 행 */}
            <div
              onClick={() => toggleExpand(member.member.id)}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_100px] gap-3 sm:gap-4 px-3 sm:px-4 py-3 items-center cursor-pointer hover:bg-foreground/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <button className="text-slate-400">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {member.member.profile_image ? (
                  <img
                    src={member.member.profile_image}
                    alt={member.member.name}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bridge-accent/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-bridge-accent" />
                  </div>
                )}
                <div>
                  <div className="font-medium text-foreground">{member.member.name}</div>
                  {member.member.role && (
                    <div className="text-xs text-slate-400">{member.member.role}</div>
                  )}
                </div>
              </div>

              <div className="text-center text-foreground">{member.assigned_tasks}</div>
              <div className="text-center text-emerald-400">{member.completed_tasks}</div>
              <div className="text-center">
                <span className={member.completion_rate >= 70 ? 'text-emerald-400' : member.completion_rate >= 40 ? 'text-yellow-400' : 'text-red-400'}>
                  {member.completion_rate.toFixed(0)}%
                </span>
              </div>
              <div className="text-center text-slate-400 text-xs">
                <div>
                  <div className="text-foreground">{formatMinutesShort(member.total_actual_minutes || 0)}</div>
                  <div className="text-slate-400">/ {member.total_estimated_minutes ? formatMinutesShort(member.total_estimated_minutes) : '-'}</div>
                </div>
              </div>
              <div className="text-center">
                <span className={`px-2 py-1 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                  {t(statusConfig.labelKey)}
                </span>
              </div>
            </div>

            {/* 확장 상세 */}
            {isExpanded && (
              <div className="px-3 sm:px-4 pb-3 sm:pb-4 bg-white/[0.02]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 pt-3 sm:pt-4">
                  {/* 담당 Task (ChecklistItem 담당자 기준) */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                      {t('management.assignedTasks', { count: member.assigned_task_details?.length || 0 })}
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-auto">
                      {member.assigned_task_details && member.assigned_task_details.length > 0 ? (
                        member.assigned_task_details.map((task) => (
                          <div
                            key={task.task_id}
                            className={`p-2 rounded-lg text-sm ${task.current_block === 'Done' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-foreground/5'}`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: task.feature_color }}
                              />
                              <span className="text-foreground truncate">{task.task_title}</span>
                              {task.current_block === 'Done' && (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                              <span>{task.current_block}</span>
                              <span>{t('management.checkLabel', { completed: task.checklist_completed, total: task.checklist_total })}</span>
                              {task.estimated_minutes && (
                                <span className={task.time_efficiency && task.time_efficiency > 100 ? 'text-orange-400' : 'text-slate-400'}>
                                  {formatMinutesShort(task.actual_minutes || 0)}/{formatMinutesShort(task.estimated_minutes)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-400 text-sm">{t('management.noItems')}</p>
                      )}
                    </div>
                  </div>

                  {/* 전체 체크리스트 */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                      {t('management.allChecklist', { count: member.all_checklist_details?.length || 0 })}
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-auto">
                      {member.all_checklist_details && member.all_checklist_details.length > 0 ? (
                        member.all_checklist_details.map((item) => (
                          <div
                            key={item.checklist_id}
                            className={`p-2 rounded-lg text-sm ${item.is_completed ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-foreground/5'}`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: item.feature_color }}
                              />
                              <span className="text-foreground truncate">{item.checklist_title}</span>
                              {item.is_completed && (
                                <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                              <span className="truncate">{item.task_title}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-400 text-sm">{t('management.noItems')}</p>
                      )}
                    </div>
                  </div>

                  {/* 진행 중 체크리스트 */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                      {t('management.inProgressChecklist', { count: member.in_progress_checklist_details?.length || 0 })}
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-auto">
                      {member.in_progress_checklist_details && member.in_progress_checklist_details.length > 0 ? (
                        member.in_progress_checklist_details.map((item) => (
                          <div
                            key={item.checklist_id}
                            className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: item.feature_color }}
                              />
                              <span className="text-foreground truncate">{item.checklist_title}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-yellow-400">
                              <Clock className="w-3 h-3" />
                              <span className="truncate">{item.task_title}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-400 text-sm">{t('management.noItems')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ==================== 지연 항목 섹션 ====================

function DelayedItemsSection({ delayedItems }: { delayedItems: DelayedItems }) {
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<'features' | 'tasks' | 'checklists'>('features');

  const totalItems =
    delayedItems.overdue_features.length +
    delayedItems.stagnant_tasks.length +
    delayedItems.stuck_checklists.length;

  if (totalItems === 0) {
    return (
      <div className="p-8 bg-bridge-obsidian rounded-xl border border-bridge-border text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
        <p className="text-foreground font-medium">{t('management.allNormal')}</p>
        <p className="text-slate-400 text-sm mt-1">{t('management.noDelayedItems')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 병목 요약 */}
      {(delayedItems.bottleneck_summary.most_delayed_member ||
        delayedItems.bottleneck_summary.most_problematic_block) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {delayedItems.bottleneck_summary.most_delayed_member && (
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
              <div className="flex items-center gap-2 text-orange-400 text-xs font-medium uppercase tracking-wider mb-2">
                <User className="w-4 h-4" />
                {t('management.mostDelayedMember')}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <div className="text-foreground font-medium">
                    {delayedItems.bottleneck_summary.most_delayed_member.member.name}
                  </div>
                  <div className="text-sm text-orange-400">
                    {t('management.delayedCount', { count: delayedItems.bottleneck_summary.most_delayed_member.delayed_item_count })}
                  </div>
                </div>
              </div>
            </div>
          )}
          {delayedItems.bottleneck_summary.most_problematic_block && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="flex items-center gap-2 text-red-400 text-xs font-medium uppercase tracking-wider mb-2">
                <AlertTriangle className="w-4 h-4" />
                {t('management.bottleneckBlock')}
              </div>
              <div>
                <div className="text-foreground font-medium">
                  {delayedItems.bottleneck_summary.most_problematic_block.block_name}
                </div>
                <div className="text-sm text-red-400">
                  {t('management.stuckTaskCount', { count: delayedItems.bottleneck_summary.most_problematic_block.stuck_task_count })}
                  {' '}{t('management.avgDaysStuck', { days: delayedItems.bottleneck_summary.most_problematic_block.average_days_stuck.toFixed(1) })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 서브 탭 */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button
          onClick={() => setActiveSubTab('features')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeSubTab === 'features'
              ? 'bg-red-500/20 text-red-400'
              : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
          }`}
        >
          {t('management.overdueFeatures', { count: delayedItems.overdue_features.length })}
        </button>
        <button
          onClick={() => setActiveSubTab('tasks')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeSubTab === 'tasks'
              ? 'bg-orange-500/20 text-orange-400'
              : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
          }`}
        >
          {t('management.stagnantTasks', { count: delayedItems.stagnant_tasks.length })}
        </button>
        <button
          onClick={() => setActiveSubTab('checklists')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            activeSubTab === 'checklists'
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'text-slate-400 hover:text-foreground hover:bg-foreground/5'
          }`}
        >
          {t('management.stuckChecklists', { count: delayedItems.stuck_checklists.length })}
        </button>
      </div>

      {/* 콘텐츠 */}
      <div className="bg-bridge-obsidian rounded-xl border border-bridge-border overflow-hidden">
        {activeSubTab === 'features' && (
          <div className="divide-y divide-white/5">
            {delayedItems.overdue_features.length > 0 ? (
              delayedItems.overdue_features.map((feature) => (
                <div key={feature.feature_id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: feature.feature_color }}
                    />
                    <div>
                      <div className="text-foreground font-medium">{feature.feature_title}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>{t('management.deadline', { date: feature.due_date })}</span>
                        <span className="text-red-400">{t('management.daysOverdue', { count: feature.days_overdue })}</span>
                        {feature.assignee && <span>{t('management.assignedTo', { name: feature.assignee.name })}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-foreground font-medium">{feature.progress_percentage.toFixed(0)}%</div>
                    <div className="text-xs text-slate-400">{t('management.remaining', { count: feature.tasks_remaining })}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">{t('management.noOverdueFeatures')}</div>
            )}
          </div>
        )}

        {activeSubTab === 'tasks' && (
          <div className="divide-y divide-white/5">
            {delayedItems.stagnant_tasks.length > 0 ? (
              delayedItems.stagnant_tasks.map((task) => (
                <div key={task.task_id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: task.feature_color }}
                    />
                    <div>
                      <div className="text-foreground font-medium">{task.task_title}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>{task.feature_title}</span>
                        <span className="text-orange-400">{t('management.blockStagnation', { block: task.block_name, days: task.days_in_block })}</span>
                        {task.assignee && <span>{t('management.assignedTo', { name: task.assignee.name })}</span>}
                      </div>
                    </div>
                  </div>
                  {task.is_overdue && (
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                      {t('management.overdueLabel')}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">{t('management.noStagnantTasks')}</div>
            )}
          </div>
        )}

        {activeSubTab === 'checklists' && (
          <div className="divide-y divide-white/5">
            {delayedItems.stuck_checklists.length > 0 ? (
              delayedItems.stuck_checklists.map((item) => (
                <div key={item.checklist_id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.feature_color }}
                    />
                    <div>
                      <div className="text-foreground font-medium">{item.checklist_title}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>{item.task_title}</span>
                        <span className="text-yellow-400">{t('management.daysIncomplete', { count: item.days_stuck })}</span>
                        {item.assignee && <span>{t('management.assignedTo', { name: item.assignee.name })}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400">{t('management.noStuckChecklists')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
