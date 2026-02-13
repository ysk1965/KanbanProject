import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TrendingUp, BarChart3, Cloud, Bot, CreditCard } from 'lucide-react';
import type {
  MonitoringDashboard,
  MonitoringApiMetricSnapshot,
  MonitoringAiUsageMetrics,
  OpenAIBilling,
} from '../../types';

interface MonitoringChartsProps {
  dashboard: MonitoringDashboard;
  history: MonitoringApiMetricSnapshot[];
  aiUsage?: MonitoringAiUsageMetrics | null;
  openAIBilling?: OpenAIBilling | null;
}

const FEATURE_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];
const FEATURE_LABELS: Record<string, string> = {
  MEETING: 'Meeting',
  NOTE: 'Note',
  REPORT_TEAM: 'Team Report',
  REPORT_PERSONAL: 'Personal Report',
  STANDUP: 'Standup',
};

export function MonitoringCharts({ dashboard, history, aiUsage, openAIBilling }: MonitoringChartsProps) {
  const { t } = useTranslation();

  const tooltipStyle = {
    backgroundColor: '#0F1419',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '12px',
  };

  const formatTime = (timeStr: string) => {
    const d = new Date(timeStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* API Response Time Top 10 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-bridge-accent" />
          <h3 className="text-white font-semibold">{t('admin.monitoring.apiResponseTop10')}</h3>
        </div>
        <div className="h-72">
          {dashboard.api.top_slowest_endpoints.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.api.top_slowest_endpoints}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="endpoint"
                  stroke="#64748b"
                  fontSize={12}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tickFormatter={(value) => {
                    if (value.length > 30) {
                      return value.substring(0, 27) + '...';
                    }
                    return value;
                  }}
                />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => `${label}`}
                  formatter={(value: number, name: string) => {
                    if (name === 'avg_response_ms') return [value.toFixed(2) + ' ms', t('admin.monitoring.responseTime')];
                    return [value, name];
                  }}
                />
                <Bar dataKey="avg_response_ms" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              {t('admin.monitoring.noData')}
            </div>
          )}
        </div>
      </div>

      {/* API Trend (Hourly) */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-bridge-secondary" />
          <h3 className="text-white font-semibold">{t('admin.monitoring.apiTrend')}</h3>
        </div>
        <div className="h-72">
          {history.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="snapshot_time"
                  tickFormatter={formatTime}
                  stroke="#64748b"
                  fontSize={12}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#64748b"
                  fontSize={12}
                  label={{ value: 'ms', position: 'insideLeft', style: { fill: '#64748b' } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#64748b"
                  fontSize={12}
                  label={{ value: '%', position: 'insideRight', style: { fill: '#64748b' } }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatTime(label)}
                  formatter={(value: number, name: string) => {
                    if (name === 'avg_response_ms') return [value.toFixed(2) + ' ms', t('admin.monitoring.responseTime')];
                    if (name === 'error_rate') return [value.toFixed(2) + '%', t('admin.monitoring.errorRate')];
                    return [value, name];
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    if (value === 'avg_response_ms') return <span className="text-slate-300 text-sm">{t('admin.monitoring.responseTime')}</span>;
                    if (value === 'error_rate') return <span className="text-slate-300 text-sm">{t('admin.monitoring.errorRate')}</span>;
                    return <span className="text-slate-300 text-sm">{value}</span>;
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avg_response_ms"
                  stroke="#6366F1"
                  strokeWidth={2}
                  dot={{ fill: '#6366F1', r: 3 }}
                  activeDot={{ r: 5, fill: '#6366F1' }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="error_rate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', r: 3 }}
                  activeDot={{ r: 5, fill: '#ef4444' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500">
              {t('admin.monitoring.noData')}
            </div>
          )}
        </div>
      </div>

      {/* OpenAI Billing Charts */}
      {openAIBilling && openAIBilling.connected && (openAIBilling.daily_costs.length > 0 || openAIBilling.model_usage.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Daily Cost Trend */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5 text-emerald-400" />
              <h3 className="text-white font-semibold">{t('admin.monitoring.openAIDailyCost')}</h3>
            </div>
            <div className="h-64">
              {openAIBilling.daily_costs.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={openAIBilling.daily_costs}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="date"
                      stroke="#64748b"
                      fontSize={11}
                      tickFormatter={(v) => v.substring(5)}
                    />
                    <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [`$${value.toFixed(4)}`, t('admin.monitoring.openAICost')]}
                      labelFormatter={(label) => label}
                    />
                    <Bar dataKey="amount_usd" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500">
                  {t('admin.monitoring.noData')}
                </div>
              )}
            </div>
          </div>

          {/* Model Usage Distribution */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5 text-emerald-400" />
              <h3 className="text-white font-semibold">{t('admin.monitoring.openAIModelUsage')}</h3>
            </div>
            <div className="h-64">
              {openAIBilling.model_usage.length > 0 ? (
                <div className="flex items-center h-full">
                  <ResponsiveContainer width="50%" height="100%">
                    <PieChart>
                      <Pie
                        data={openAIBilling.model_usage}
                        dataKey="requests"
                        nameKey="model"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                      >
                        {openAIBilling.model_usage.map((_, index) => (
                          <Cell key={index} fill={FEATURE_COLORS[index % FEATURE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number, name: string) => [
                          `${value.toLocaleString()} requests`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-1/2 space-y-3">
                    {openAIBilling.model_usage.map((m, i) => (
                      <div key={m.model} className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: FEATURE_COLORS[i % FEATURE_COLORS.length] }}
                          />
                          <span className="text-slate-300 truncate">{m.model}</span>
                        </div>
                        <div className="pl-5 text-xs text-slate-500">
                          {m.requests.toLocaleString()} req / {((m.input_tokens + m.output_tokens) / 1000).toFixed(1)}K tokens
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500">
                  {t('admin.monitoring.noData')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CloudWatch Metrics */}
      {dashboard.cloud_watch ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* EC2 CPU */}
          {dashboard.cloud_watch.ec2 && (
            <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Cloud className="h-5 w-5 text-bridge-accent" />
                <h3 className="text-white font-semibold">{t('admin.monitoring.ec2Cpu')}</h3>
              </div>
              <p className="text-3xl font-bold text-white mb-3">
                {dashboard.cloud_watch.ec2.cpu_utilization.toFixed(1)}%
              </p>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-bridge-accent rounded-full transition-all duration-500"
                  style={{ width: `${dashboard.cloud_watch.ec2.cpu_utilization}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                <div>Network In: {(dashboard.cloud_watch.ec2.network_in / 1024 / 1024).toFixed(2)} MB</div>
                <div>Network Out: {(dashboard.cloud_watch.ec2.network_out / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            </div>
          )}

          {/* RDS Metrics */}
          {dashboard.cloud_watch.rds && (
            <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Cloud className="h-5 w-5 text-bridge-secondary" />
                <h3 className="text-white font-semibold">{t('admin.monitoring.rdsCpu')}</h3>
              </div>
              <p className="text-3xl font-bold text-white mb-3">
                {dashboard.cloud_watch.rds.cpu_utilization.toFixed(1)}%
              </p>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-bridge-secondary rounded-full transition-all duration-500"
                  style={{ width: `${dashboard.cloud_watch.rds.cpu_utilization}%` }}
                />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>{t('admin.monitoring.rdsConnections')}</span>
                  <span className="text-white font-medium">{dashboard.cloud_watch.rds.database_connections}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>{t('admin.monitoring.rdsIops')}</span>
                  <span className="text-white font-medium">
                    {t('admin.monitoring.readIops')}: {dashboard.cloud_watch.rds.read_iops.toFixed(0)} / {t('admin.monitoring.writeIops')}: {dashboard.cloud_watch.rds.write_iops.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="h-5 w-5 text-slate-500" />
            <h3 className="text-white font-semibold">{t('admin.monitoring.cloudWatch')}</h3>
          </div>
          <div className="text-center py-8">
            <p className="text-slate-400 mb-2">{t('admin.monitoring.cloudWatchNotConnected')}</p>
            <p className="text-slate-500 text-sm">{t('admin.monitoring.cloudWatchNotConnectedDesc')}</p>
          </div>
        </div>
      )}

      {/* AI Usage Charts */}
      {aiUsage && aiUsage.total_calls > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Board Top Usage */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="h-5 w-5 text-purple-400" />
              <h3 className="text-white font-semibold">{t('admin.monitoring.aiUsageByBoard')}</h3>
            </div>
            <div className="h-64">
              {aiUsage.by_board.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aiUsage.by_board.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" stroke="#64748b" fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="board_name"
                      stroke="#64748b"
                      fontSize={12}
                      width={120}
                      tickFormatter={(v) => v.length > 15 ? v.substring(0, 12) + '...' : v}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => {
                        if (name === 'input_tokens') return [value.toLocaleString(), 'Input Tokens'];
                        if (name === 'output_tokens') return [value.toLocaleString(), 'Output Tokens'];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="input_tokens" fill="#6366F1" stackId="tokens" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="output_tokens" fill="#8B5CF6" stackId="tokens" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500">
                  {t('admin.monitoring.noData')}
                </div>
              )}
            </div>
          </div>

          {/* Feature Type Distribution */}
          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="h-5 w-5 text-purple-400" />
              <h3 className="text-white font-semibold">{t('admin.monitoring.aiUsageByFeature')}</h3>
            </div>
            <div className="h-64">
              {aiUsage.by_feature.length > 0 ? (
                <div className="flex items-center h-full">
                  <ResponsiveContainer width="50%" height="100%">
                    <PieChart>
                      <Pie
                        data={aiUsage.by_feature}
                        dataKey="call_count"
                        nameKey="feature_type"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                      >
                        {aiUsage.by_feature.map((_, index) => (
                          <Cell key={index} fill={FEATURE_COLORS[index % FEATURE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number, name: string) => [
                          `${value} calls`,
                          FEATURE_LABELS[name] || name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-1/2 space-y-2">
                    {aiUsage.by_feature.map((f, i) => (
                      <div key={f.feature_type} className="flex items-center gap-2 text-sm">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: FEATURE_COLORS[i % FEATURE_COLORS.length] }}
                        />
                        <span className="text-slate-300">{FEATURE_LABELS[f.feature_type] || f.feature_type}</span>
                        <span className="ml-auto text-slate-400">{f.call_count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500">
                  {t('admin.monitoring.noData')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
