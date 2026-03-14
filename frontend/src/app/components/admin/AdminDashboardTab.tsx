import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Folder, CreditCard, TrendingUp, User, BookOpen, Building2, Loader2 } from 'lucide-react';
import { adminService } from '../../utils/services';
import { AdminStatistics, AdminOrgStatistics } from '../../utils/api';

export function AdminDashboardTab() {
  const { t } = useTranslation();
  const [statistics, setStatistics] = useState<AdminStatistics | null>(null);
  const [orgStats, setOrgStats] = useState<AdminOrgStatistics | null>(null);
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
      try {
        const orgData = await adminService.getOrgStatistics();
        setOrgStats(orgData);
      } catch (orgErr) {
        console.warn('Failed to load org statistics:', orgErr);
      }
    } catch (err) {
      console.error('Failed to load statistics:', err);
      setError(t('admin.dashboard.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="로딩 중">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
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
        <h2 className="text-2xl font-bold text-foreground mb-2">{t('admin.dashboard.title')}</h2>
        <p className="text-slate-400">{t('admin.dashboard.subtitle')}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 md:p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1">{card.label}</p>
                <p className="text-3xl font-bold text-foreground">{card.value.toLocaleString()}</p>
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
      <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-4 md:p-6">
        <div className="flex items-center gap-2 mb-6">
          <User className="h-5 w-5 text-purple-400" />
          <h3 className="text-lg font-bold text-foreground">{t('admin.dashboard.personalBoardMetrics', 'Personal Board')}</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-foreground/5 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{t('admin.dashboard.personalBoards', 'Personal Boards')}</p>
            <p className="text-2xl font-bold text-foreground">{(statistics.personal_boards ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-foreground/5 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{t('admin.dashboard.adoptionRate', 'Adoption Rate')}</p>
            <p className="text-2xl font-bold text-purple-400">{statistics.personal_board_adoption ?? 0}%</p>
          </div>
          <div className="bg-foreground/5 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{t('admin.dashboard.activePersonalBoards', 'Active (30d)')}</p>
            <p className="text-2xl font-bold text-foreground">{(statistics.active_personal_boards ?? 0).toLocaleString()}</p>
          </div>
          <div className="bg-foreground/5 rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1">{t('admin.dashboard.totalDiaryEntries', 'Diary Entries')}</p>
            <p className="text-2xl font-bold text-foreground">{(statistics.total_diary_entries ?? 0).toLocaleString()}</p>
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
              <div className="h-3 bg-foreground/5 rounded-full overflow-hidden flex">
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

      {/* Organization Metrics */}
      {orgStats && (
        <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-4 md:p-6">
          <div className="flex items-center gap-2 mb-6">
            <Building2 className="h-5 w-5 text-bridge-accent" />
            <h3 className="text-lg font-bold text-foreground">{t('admin.organizations.stats.title')}</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-foreground/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">{t('admin.organizations.stats.total')}</p>
              <p className="text-2xl font-bold text-foreground">{orgStats.total_organizations.toLocaleString()}</p>
            </div>
            <div className="bg-foreground/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">{t('admin.organizations.stats.active')}</p>
              <p className="text-2xl font-bold text-foreground">{orgStats.active_organizations.toLocaleString()}</p>
            </div>
            <div className="bg-foreground/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">{t('admin.organizations.stats.team')}</p>
              <p className="text-2xl font-bold text-bridge-accent">{orgStats.team_orgs.toLocaleString()}</p>
            </div>
            <div className="bg-foreground/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">{t('admin.organizations.stats.trial')}</p>
              <p className="text-2xl font-bold text-amber-400">{orgStats.trial_orgs.toLocaleString()}</p>
            </div>
            <div className="bg-foreground/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">{t('admin.organizations.stats.free')}</p>
              <p className="text-2xl font-bold text-foreground">{orgStats.free_orgs.toLocaleString()}</p>
            </div>
            <div className="bg-foreground/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">{t('admin.organizations.stats.activeSubs')}</p>
              <p className="text-2xl font-bold text-emerald-400">{orgStats.active_org_subscriptions.toLocaleString()}</p>
            </div>
            <div className="bg-foreground/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">{t('admin.organizations.stats.totalMembers')}</p>
              <p className="text-2xl font-bold text-foreground">{orgStats.total_org_members.toLocaleString()}</p>
            </div>
          </div>

          {/* Org Plan Distribution */}
          {orgStats.total_organizations > 0 && (() => {
            const freePct = (orgStats.free_orgs / orgStats.total_organizations) * 100;
            const teamPct = (orgStats.team_orgs / orgStats.total_organizations) * 100;
            const trialPct = (orgStats.trial_orgs / orgStats.total_organizations) * 100;
            return (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">Plan Distribution</span>
                </div>
                <div className="h-3 bg-foreground/5 rounded-full overflow-hidden flex">
                  <div className="h-full bg-slate-500 transition-all duration-500" style={{ width: `${freePct}%` }} title={`Free: ${orgStats.free_orgs}`} />
                  <div className="h-full bg-bridge-accent transition-all duration-500" style={{ width: `${teamPct}%` }} title={`Team: ${orgStats.team_orgs}`} />
                  <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${trialPct}%` }} title={`Trial: ${orgStats.trial_orgs}`} />
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1 text-slate-400"><span className="w-2 h-2 rounded-full bg-slate-500" />Free {orgStats.free_orgs}</span>
                  <span className="flex items-center gap-1 text-bridge-accent"><span className="w-2 h-2 rounded-full bg-bridge-accent" />Team {orgStats.team_orgs}</span>
                  <span className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500" />Trial {orgStats.trial_orgs}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Tier Distribution */}
      <div className="bg-bridge-obsidian rounded-xl border border-foreground/[0.08] p-4 md:p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-5 w-5 text-bridge-accent" />
          <h3 className="text-lg font-bold text-foreground">{t('admin.dashboard.tierDistribution')}</h3>
        </div>

        <div className="space-y-4">
          {tierData.map((tier) => {
            const percentage = totalBoards > 0 ? (tier.value / totalBoards) * 100 : 0;
            return (
              <div key={tier.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">{tier.label}</span>
                  <span className="text-foreground font-medium">
                    {tier.value} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 bg-foreground/5 rounded-full overflow-hidden">
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
