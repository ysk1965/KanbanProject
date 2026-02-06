import { useState, useEffect } from 'react';
import { Users, Folder, CreditCard, TrendingUp } from 'lucide-react';
import { adminService } from '../../utils/services';
import { AdminStatistics } from '../../utils/api';

export function AdminDashboardTab() {
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
      setError('통계를 불러오는데 실패했습니다');
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
          다시 시도
        </button>
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  const statCards = [
    {
      label: '전체 사용자',
      value: statistics.total_users,
      subValue: `활성: ${statistics.active_users}`,
      icon: Users,
      color: 'text-bridge-accent',
      bgColor: 'bg-bridge-accent/10',
    },
    {
      label: '전체 보드',
      value: statistics.total_boards,
      subValue: null,
      icon: Folder,
      color: 'text-bridge-secondary',
      bgColor: 'bg-bridge-secondary/10',
    },
    {
      label: '활성 구독',
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
        <h2 className="text-2xl font-bold text-white mb-2">대시보드</h2>
        <p className="text-slate-400">시스템 전체 현황을 확인하세요</p>
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

      {/* Tier Distribution */}
      <div className="bg-bridge-obsidian rounded-xl border border-white/15 p-4 md:p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-5 w-5 text-bridge-accent" />
          <h3 className="text-lg font-bold text-white">보드 티어 분포</h3>
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
