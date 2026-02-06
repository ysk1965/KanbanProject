import { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { adminService } from '../../utils/services';
import type {
  SignupTrend,
  ActiveUserStats,
  ConversionStats,
} from '../../utils/api';

type PeriodOption = 7 | 14 | 30 | 90;

export function AdminAnalyticsTab() {
  const [signupTrend, setSignupTrend] = useState<SignupTrend | null>(null);
  const [activeUserStats, setActiveUserStats] = useState<ActiveUserStats | null>(null);
  const [conversionStats, setConversionStats] = useState<ConversionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signupDays, setSignupDays] = useState<PeriodOption>(30);
  const [dauDays, setDauDays] = useState<PeriodOption>(30);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    loadSignupTrend();
  }, [signupDays]);

  useEffect(() => {
    loadActiveUserStats();
  }, [dauDays]);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [signup, active, conversion] = await Promise.all([
        adminService.getSignupTrend(signupDays),
        adminService.getActiveUserStats(dauDays),
        adminService.getConversionStats(365),
      ]);
      setSignupTrend(signup);
      setActiveUserStats(active);
      setConversionStats(conversion);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('분석 데이터를 불러오는데 실패했습니다');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSignupTrend = async () => {
    try {
      const data = await adminService.getSignupTrend(signupDays);
      setSignupTrend(data);
    } catch (err) {
      console.error('Failed to load signup trend:', err);
    }
  };

  const loadActiveUserStats = async () => {
    try {
      const data = await adminService.getActiveUserStats(dauDays);
      setActiveUserStats(data);
    } catch (err) {
      console.error('Failed to load active user stats:', err);
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
          onClick={loadAllData}
          className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const periodOptions: { value: PeriodOption; label: string }[] = [
    { value: 7, label: '7일' },
    { value: 14, label: '14일' },
    { value: 30, label: '30일' },
    { value: 90, label: '90일' },
  ];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const tooltipStyle = {
    backgroundColor: '#0F1419',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '12px',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">분석 / 리포트</h2>
          <p className="text-slate-400">서비스 지표를 확인하세요</p>
        </div>
        <button
          onClick={loadAllData}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-xl hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          새로고침
        </button>
      </div>

      {/* DAU / WAU / MAU Cards */}
      {activeUserStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="DAU (일간 활성)"
            value={activeUserStats.dau}
            icon={Users}
            color="text-bridge-accent"
            bgColor="bg-bridge-accent/10"
          />
          <MetricCard
            label="WAU (주간 활성)"
            value={activeUserStats.wau}
            icon={TrendingUp}
            color="text-bridge-secondary"
            bgColor="bg-bridge-secondary/10"
          />
          <MetricCard
            label="MAU (월간 활성)"
            value={activeUserStats.mau}
            icon={BarChart3}
            color="text-amber-400"
            bgColor="bg-amber-400/10"
          />
        </div>
      )}

      {/* Signup Trend Chart */}
      {signupTrend && (
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-bridge-accent" />
              <h3 className="text-lg font-bold text-white">가입자 추이</h3>
              <span className="text-sm text-slate-400 ml-2">
                총 {signupTrend.total.toLocaleString()}명
              </span>
            </div>
            <PeriodSelector value={signupDays} onChange={setSignupDays} options={periodOptions} />
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupTrend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => `날짜: ${label}`}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      email_count: '이메일',
                      google_count: 'Google',
                    };
                    return [value, labels[name] || name];
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      email_count: '이메일 가입',
                      google_count: 'Google 가입',
                    };
                    return <span className="text-slate-300 text-sm">{labels[value] || value}</span>;
                  }}
                />
                <Bar dataKey="email_count" stackId="a" fill="#6366F1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="google_count" stackId="a" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* DAU Trend Chart */}
      {activeUserStats && activeUserStats.trend.length > 0 && (
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-bridge-secondary" />
              <h3 className="text-lg font-bold text-white">DAU 추이</h3>
            </div>
            <PeriodSelector value={dauDays} onChange={setDauDays} options={periodOptions} />
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeUserStats.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => `날짜: ${label}`}
                  formatter={(value: number) => [value, '활성 사용자']}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2DD4BF"
                  strokeWidth={2}
                  dot={{ fill: '#2DD4BF', r: 3 }}
                  activeDot={{ r: 5, fill: '#2DD4BF' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Conversion Stats */}
      {conversionStats && (
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-4 md:p-6">
          <div className="flex items-center gap-2 mb-6">
            <ArrowUpRight className="h-5 w-5 text-amber-400" />
            <h3 className="text-lg font-bold text-white">결제 전환율</h3>
          </div>

          {/* Conversion Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <ConversionMetric
              label="전체 Trial"
              value={conversionStats.total_trial_started}
            />
            <ConversionMetric
              label="전환 완료"
              value={conversionStats.total_converted}
              positive
            />
            <ConversionMetric
              label="전환율"
              value={`${conversionStats.conversion_rate}%`}
              highlight
            />
            <ConversionMetric
              label="Trial 진행중"
              value={conversionStats.trial_in_progress}
            />
            <ConversionMetric
              label="만료 미전환"
              value={conversionStats.trial_expired_not_converted}
              negative
            />
          </div>

          {/* Conversion Funnel Visual */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-slate-400">전환 퍼널</span>
            </div>
            <ConversionFunnel
              total={conversionStats.total_trial_started}
              converted={conversionStats.total_converted}
              inProgress={conversionStats.trial_in_progress}
              expired={conversionStats.trial_expired_not_converted}
            />
          </div>

          {/* Monthly Conversion Trend */}
          {conversionStats.trend.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-400 mb-4">월별 전환 추이</h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={conversionStats.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = {
                          trial_started: 'Trial 시작',
                          converted: '전환 완료',
                        };
                        return [value, labels[name] || name];
                      }}
                    />
                    <Legend
                      formatter={(value: string) => {
                        const labels: Record<string, string> = {
                          trial_started: 'Trial 시작',
                          converted: '전환 완료',
                        };
                        return <span className="text-slate-300 text-sm">{labels[value] || value}</span>;
                      }}
                    />
                    <Bar dataKey="trial_started" fill="#6366F1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="converted" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Sub Components ====================

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-bridge-obsidian rounded-xl border border-white/15 p-4 md:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm mb-1">{label}</p>
          <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
        </div>
        <div className={`${bgColor} p-3 rounded-xl`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
      </div>
    </div>
  );
}

function PeriodSelector({
  value,
  onChange,
  options,
}: {
  value: PeriodOption;
  onChange: (v: PeriodOption) => void;
  options: { value: PeriodOption; label: string }[];
}) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            value === opt.value
              ? 'bg-bridge-accent text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ConversionMetric({
  label,
  value,
  positive,
  negative,
  highlight,
}: {
  label: string;
  value: number | string;
  positive?: boolean;
  negative?: boolean;
  highlight?: boolean;
}) {
  let valueColor = 'text-white';
  let Icon = null;
  if (positive) {
    valueColor = 'text-emerald-400';
    Icon = ArrowUpRight;
  }
  if (negative) {
    valueColor = 'text-red-400';
    Icon = ArrowDownRight;
  }
  if (highlight) {
    valueColor = 'text-amber-400';
  }

  return (
    <div className="bg-white/5 rounded-xl p-4">
      <p className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-1">
        <p className={`text-xl font-bold ${valueColor}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {Icon && <Icon className={`h-4 w-4 ${valueColor}`} />}
      </div>
    </div>
  );
}

function ConversionFunnel({
  total,
  converted,
  inProgress,
  expired,
}: {
  total: number;
  converted: number;
  inProgress: number;
  expired: number;
}) {
  if (total === 0) {
    return <p className="text-slate-500 text-sm">데이터가 없습니다</p>;
  }

  const convertedPct = (converted / total) * 100;
  const inProgressPct = (inProgress / total) * 100;
  const expiredPct = (expired / total) * 100;

  return (
    <div className="space-y-2">
      <div className="h-4 bg-white/5 rounded-full overflow-hidden flex">
        {convertedPct > 0 && (
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${convertedPct}%` }}
          />
        )}
        {inProgressPct > 0 && (
          <div
            className="h-full bg-bridge-accent transition-all duration-500"
            style={{ width: `${inProgressPct}%` }}
          />
        )}
        {expiredPct > 0 && (
          <div
            className="h-full bg-red-500/60 transition-all duration-500"
            style={{ width: `${expiredPct}%` }}
          />
        )}
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-slate-400">전환 {convertedPct.toFixed(1)}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-bridge-accent" />
          <span className="text-slate-400">진행중 {inProgressPct.toFixed(1)}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <span className="text-slate-400">만료 {expiredPct.toFixed(1)}%</span>
        </span>
      </div>
    </div>
  );
}
