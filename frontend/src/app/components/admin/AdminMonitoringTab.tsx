import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Database,
  Cpu,
  AlertTriangle,
  RefreshCw,
  Server,
  Bell,
  Send,
  Bot,
  DollarSign,
  CreditCard,
  Zap,
  Key,
} from 'lucide-react';
import { monitoringService } from '../../utils/services';
import { MonitoringCharts } from './MonitoringCharts';
import type {
  MonitoringDashboard,
  MonitoringAlertConfig,
  MonitoringApiMetricSnapshot,
  MonitoringAiUsageMetrics,
  OpenAIBilling,
} from '../../types';

export function AdminMonitoringTab() {
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [history, setHistory] = useState<MonitoringApiMetricSnapshot[]>([]);
  const [alertConfig, setAlertConfig] = useState<MonitoringAlertConfig | null>(null);
  const [aiUsage, setAiUsage] = useState<MonitoringAiUsageMetrics | null>(null);
  const [openAIBilling, setOpenAIBilling] = useState<OpenAIBilling | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [dashboardData, historyData, configData, aiUsageData, billingData] = await Promise.all([
        monitoringService.getDashboard(),
        monitoringService.getApiMetricHistory(24),
        monitoringService.getAlertConfig(),
        monitoringService.getAiUsage(30),
        monitoringService.getOpenAIBilling(30),
      ]);
      setDashboard(dashboardData);
      setHistory(historyData);
      setAlertConfig(configData);
      setAiUsage(aiUsageData);
      setOpenAIBilling(billingData);
      setWebhookUrl(configData.slack_webhook_url || '');
      setAlertEnabled(configData.enabled);
    } catch (err) {
      console.error('Failed to load monitoring data:', err);
      setError(t('admin.monitoring.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      monitoringService.getDashboard().then(setDashboard).catch(console.error);
      monitoringService.getApiMetricHistory(24).then(setHistory).catch(console.error);
    }, 60000); // 1분마다 자동 갱신

    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleSaveConfig = async () => {
    try {
      setIsSavingConfig(true);
      const updated = await monitoringService.updateAlertConfig({
        slack_webhook_url: webhookUrl,
        enabled: alertEnabled,
      });
      setAlertConfig(updated);
      alert(t('admin.monitoring.configSaved'));
    } catch (err) {
      console.error('Failed to save config:', err);
      alert('Failed to save configuration');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestAlert = async () => {
    try {
      setIsSendingTest(true);
      await monitoringService.sendTestAlert();
      alert(t('admin.monitoring.testSent'));
    } catch (err) {
      console.error('Failed to send test alert:', err);
      alert('Failed to send test alert');
    } finally {
      setIsSendingTest(false);
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
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">{t('admin.monitoring.title')}</h2>
          <p className="text-slate-400">{t('admin.monitoring.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-white/10 bg-white/5 text-bridge-accent focus:ring-bridge-accent"
            />
            {t('admin.monitoring.autoRefresh')}
          </label>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-xl hover:bg-white/10 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            {t('admin.monitoring.refresh')}
          </button>
        </div>
      </div>

      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* JVM Heap */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="h-4 w-4 text-bridge-accent" />
            <p className="text-slate-400 text-sm">{t('admin.monitoring.jvmHeap')}</p>
          </div>
          <p className="text-2xl font-bold text-white mt-1">
            {dashboard.jvm.heap_usage_percent.toFixed(1)}%
          </p>
          <div className="mt-3 h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-bridge-accent rounded-full transition-all duration-500"
              style={{ width: `${dashboard.jvm.heap_usage_percent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {Math.round(dashboard.jvm.heap_used / 1024 / 1024)} MB / {Math.round(dashboard.jvm.heap_max / 1024 / 1024)} MB
          </p>
        </div>

        {/* HikariCP Connections */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-bridge-secondary" />
            <p className="text-slate-400 text-sm">{t('admin.monitoring.hikariConnections')}</p>
          </div>
          <p className="text-2xl font-bold text-white mt-1">
            {dashboard.hikari.active_connections} / {dashboard.hikari.max_connections}
          </p>
          <div className="mt-3 h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-bridge-secondary rounded-full transition-all duration-500"
              style={{ width: `${dashboard.hikari.usage_percent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {t('admin.monitoring.active')}: {dashboard.hikari.active_connections} / {t('admin.monitoring.idle')}: {dashboard.hikari.idle_connections}
          </p>
        </div>

        {/* API Error Rate */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <p className="text-slate-400 text-sm">{t('admin.monitoring.apiErrorRate')}</p>
          </div>
          <p className="text-2xl font-bold text-white mt-1">
            {dashboard.api.error_rate.toFixed(2)}%
          </p>
          <p className="text-xs text-slate-500 mt-3">
            {dashboard.api.total_errors.toLocaleString()} / {dashboard.api.total_requests.toLocaleString()}
          </p>
        </div>

        {/* Total Requests */}
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-emerald-400" />
            <p className="text-slate-400 text-sm">{t('admin.monitoring.totalRequests')}</p>
          </div>
          <p className="text-2xl font-bold text-white mt-1">
            {dashboard.api.total_requests.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-3">
            {t('admin.monitoring.responseTime')}: {dashboard.api.avg_response_ms.toFixed(1)} ms
          </p>
        </div>
      </div>

      {/* Charts */}
      <MonitoringCharts dashboard={dashboard} history={history} aiUsage={aiUsage} openAIBilling={openAIBilling} />

      {/* OpenAI Account Billing */}
      {openAIBilling && (
        <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-5 w-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-white">{t('admin.monitoring.openAIBilling')}</h3>
          </div>
          {openAIBilling.connected ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <p className="text-slate-400 text-sm">{t('admin.monitoring.openAITotalCost')}</p>
                </div>
                <p className="text-2xl font-bold text-white">
                  {openAIBilling.total_cost_usd != null
                    ? `$${openAIBilling.total_cost_usd.toFixed(2)}`
                    : '-'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{t('admin.monitoring.last30Days')}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <p className="text-slate-400 text-sm">{t('admin.monitoring.openAITotalRequests')}</p>
                </div>
                <p className="text-2xl font-bold text-white">
                  {openAIBilling.model_usage.reduce((sum, m) => sum + m.requests, 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1">{t('admin.monitoring.last30Days')}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <p className="text-slate-400 text-sm">{t('admin.monitoring.openAITotalTokens')}</p>
                </div>
                <p className="text-2xl font-bold text-white">
                  {((openAIBilling.model_usage.reduce((sum, m) => sum + m.input_tokens + m.output_tokens, 0)) / 1000).toFixed(1)}K
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {openAIBilling.model_usage.map(m => m.model).join(', ') || '-'}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Key className="h-8 w-8 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400 mb-1">{t('admin.monitoring.openAINotConnected')}</p>
              <p className="text-slate-500 text-sm">{t('admin.monitoring.openAINotConnectedDesc')}</p>
            </div>
          )}
        </div>
      )}

      {/* AI Usage Cards */}
      {aiUsage && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-4 w-4 text-purple-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.aiTotalCalls')}</p>
            </div>
            <p className="text-2xl font-bold text-white mt-1">
              {aiUsage.total_calls.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-3">
              {t('admin.monitoring.last30Days')}
            </p>
          </div>

          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.aiTotalTokens')}</p>
            </div>
            <p className="text-2xl font-bold text-white mt-1">
              {((aiUsage.total_input_tokens + aiUsage.total_output_tokens) / 1000).toFixed(1)}K
            </p>
            <p className="text-xs text-slate-500 mt-3">
              In: {(aiUsage.total_input_tokens / 1000).toFixed(1)}K / Out: {(aiUsage.total_output_tokens / 1000).toFixed(1)}K
            </p>
          </div>

          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.aiEstimatedCost')}</p>
            </div>
            <p className="text-2xl font-bold text-white mt-1">
              ${aiUsage.total_estimated_cost_usd.toFixed(4)}
            </p>
            <p className="text-xs text-slate-500 mt-3">
              {t('admin.monitoring.last30Days')}
            </p>
          </div>

          <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-amber-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.aiAvgTokensPerCall')}</p>
            </div>
            <p className="text-2xl font-bold text-white mt-1">
              {aiUsage.total_calls > 0
                ? Math.round((aiUsage.total_input_tokens + aiUsage.total_output_tokens) / aiUsage.total_calls).toLocaleString()
                : 0}
            </p>
            <p className="text-xs text-slate-500 mt-3">
              {t('admin.monitoring.tokensPerCall')}
            </p>
          </div>
        </div>
      )}

      {/* Slack Alert Configuration */}
      <div className="bg-bridge-obsidian rounded-2xl border border-white/5 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="h-5 w-5 text-bridge-accent" />
          <h3 className="text-lg font-bold text-white">{t('admin.monitoring.slackAlerts')}</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              {t('admin.monitoring.webhookUrl')}
            </label>
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={t('admin.monitoring.webhookUrlPlaceholder')}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={alertEnabled}
                onChange={(e) => setAlertEnabled(e.target.checked)}
                className="rounded border-white/10 bg-white/5 text-bridge-accent focus:ring-bridge-accent"
              />
              {t('admin.monitoring.alertEnabled')}
            </label>

            <div className="flex gap-2">
              <button
                onClick={handleTestAlert}
                disabled={isSendingTest || !webhookUrl}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
                {t('admin.monitoring.testAlert')}
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="px-6 py-2 bg-bridge-accent text-white rounded-xl font-medium hover:bg-bridge-accent/90 transition-colors disabled:opacity-50"
              >
                {isSavingConfig ? t('common.saving') : t('admin.monitoring.saveConfig')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Server Time */}
      <div className="text-center text-slate-500 text-sm">
        {t('admin.monitoring.serverTime')}: {dashboard.server_time}
      </div>
    </div>
  );
}
