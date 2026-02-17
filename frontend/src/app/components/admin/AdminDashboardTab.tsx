import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Folder, CreditCard, TrendingUp, User, BookOpen } from 'lucide-react';
import { adminService } from '../../utils/services';
import { AdminStatistics } from '../../utils/api';

export function AdminDashboardTab() {
  const { t } = useTranslation();
  const [statistics, setStatistics] = useState<AdminStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminService.getStatistics();
      setStatistics(data);
    } catch (err) {
      console.error('Failed to load statistics:', err);
      setError(t('admin.dashboard.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-bridge-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-red-400">{error}</p>
        <button
          onClick={loadStatistics}
          className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  const statCards = [
    {
      label: t('admin.dashboard.totalUsers'),
      value: statistics.total_users,
      subValue: t('admin.dashboard.active', { count: statistics.active_users }),
      icon: Users,
      color: 'text-bridge-accent',
      bgColor: 'bg-bridge-accent/10',
    },
    {
      label: t('admin.dashboard.totalBoards'),
      value: statistics.total_boards,
      subValue: null,
      icon: Folder,
      color: 'text-bridge-secondary',
      bgColor: 'bg-bridge-secondary/10',
    },
    {
      label: t('admin.dashboard.activeSubscriptions'),
      value: statistics.active_subscriptions,
      subValue: null,
      icon: CreditCard,
      color: 'text-amber-400',
      bgColor: 'bg-amber-400/10',
    },
  ];

  const tierData = [
    { label: 'TRIAL', value: statistics.trial_boards, color: 'bg-slate-500' },
    { label: 'STANDARD', value: statistics.standard_boards, color: 'bg-blue-500' },
    { label: 'PREMIUM', value: statistics.premium_boards, color: 'bg-purple-500' },
  ];

  const totalBoards = statistics.trial_boards + statistics.standard_boards + statistics.premium_boards;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">{t('admin.dashboard.title')}</h2>
        <p className="text-slate-400">{t('admin.dashboard.subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-bridge-obsidian rounded-xl border border-white/15 p-4 md:p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1">{card.label}</p>
                <p className="text-3xl font-bold text-white">{card.value.toLocaleString()}</p>
                {card.subValue && (
                  <p className="text-sm text-slate-400 mt-1">{card.subValue}</p>
                )}
              </div>
              <div className={`${card.bgColor} p-3 rounded-xl`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Personal Board Metrics */}
      <div className="bg-bridge-obsidian rounded-xl border border-white/15 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-6">
          <User className="h-5 w-5 text-purple-400" />
          <h3 className="text-lg font-bold text-white">{t('admin.dashboard.personalBoardMetrics', 'Personal Board')}</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{t('admin.dashboard.personalBoards', 'Personal Boards')}</p>
            <p className="text-2xl font-bold text-white">{(statistics.personal_boards ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{t('admin.dashboard.adoptionRate', 'Adoption Rate')}</p>
            <p className="text-2xl font-bold text-purple-400">{statistics.personal_board_adoption ?? 0}%</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{t('admin.dashboard.activePersonalBoards', 'Active (30d)')}</p>
            <p className="text-2xl font-bold text-white">{(statistics.active_personal_boards ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{t('admin.dashboard.totalDiaryEntries', 'Diary Entries')}</p>
            <p className="text-2xl font-bold text-white">{(statistics.total_diary_entries ?? 0).toLocaleString()}</p>
          </div>
        </div>

        {/* Board Type Distribution */}
        {statistics.total_boards > 0 && (() => {
          const teamBoards = statistics.total_boards - (statistics.personal_boards ?? 0);
          const personalPct = ((statistics.personal_boards ?? 0) / statistics.total_boards) * 100;
          return (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">{t('admin.dashboard.boardTypeDistribution', 'Board Type Distribution')}</span>
              </div>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-slate-500 transition-all duration-500"
                  style={{ width: `${100 - personalPct}%` }}
                  title={`Team: ${teamBoards}`}
                />
                <div
                  className="h-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${personalPct}%` }}
                  title={`Personal: ${statistics.personal_boards ?? 0}`}
                />
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                  Team {teamBoards}
                </span>
                <span className="flex items-center gap-1 text-purple-400">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Personal {statistics.personal_boards ?? 0}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Tier Distribution */}
      <div className="bg-bridge-obsidian rounded-xl border border-white/15 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-5 w-5 text-bridge-accent" />
          <h3 className="text-lg font-bold text-white">{t('admin.dashboard.tierDistribution')}</h3>
        </div>

        <div className="space-y-4">
          {tierData.map((tier) => {
            const percentage = totalBoards > 0 ? (tier.value / totalBoards) * 100 : 0;
            return (
              <div key={tier.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">{tier.label}</span>
                  <span className="text-white font-medium">
                    {tier.value} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${tier.color} rounded-full transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
