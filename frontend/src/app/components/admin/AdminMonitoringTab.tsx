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
  X,
  ChevronRight,
  Loader2,
  Mail,
  Plus,
} from 'lucide-react';
import { monitoringService } from '../../utils/services';
import { MonitoringCharts } from './MonitoringCharts';
import { Toast } from './AdminConfirmModal';
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
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [emailRecipients, setEmailRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');

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
      setEmailRecipients(configData.alert_email_recipients || []);
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
        alert_email_recipients: emailRecipients,
      });
      setAlertConfig(updated);
      setToast({ message: t('admin.monitoring.configSaved'), type: 'success' });
    } catch (err) {
      console.error('Failed to save config:', err);
      setToast({ message: t('admin.monitoring.configSaveFailed', 'Failed to save configuration'), type: 'error' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleTestAlert = async () => {
    try {
      setIsSendingTest(true);
      await monitoringService.sendTestAlert();
      setToast({ message: t('admin.monitoring.testSent'), type: 'success' });
    } catch (err) {
      console.error('Failed to send test alert:', err);
      setToast({ message: t('admin.monitoring.testSendFailed', 'Failed to send test alert'), type: 'error' });
    } finally {
      setIsSendingTest(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-bridge-accent" />
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
          <h2 className="text-2xl font-bold text-foreground mb-2">{t('admin.monitoring.title')}</h2>
          <p className="text-slate-400">{t('admin.monitoring.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-foreground/10 bg-foreground/5 text-bridge-accent focus:ring-bridge-accent"
            />
            {t('admin.monitoring.autoRefresh')}
          </label>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-foreground/5 border border-foreground/10 text-muted-foreground rounded-xl hover:bg-foreground/10 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            {t('admin.monitoring.refresh')}
          </button>
        </div>
      </div>

      {/* Status Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* JVM Heap */}
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="h-4 w-4 text-bridge-accent" />
            <p className="text-slate-400 text-sm">{t('admin.monitoring.jvmHeap')}</p>
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">
            {dashboard.jvm.heap_usage_percent.toFixed(1)}%
          </p>
          <div className="mt-3 h-2 bg-foreground/5 rounded-full overflow-hidden">
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
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-bridge-secondary" />
            <p className="text-slate-400 text-sm">{t('admin.monitoring.hikariConnections')}</p>
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">
            {dashboard.hikari.active_connections} / {dashboard.hikari.max_connections}
          </p>
          <div className="mt-3 h-2 bg-foreground/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-bridge-secondary rounded-full transition-all duration-500"
              style={{ width: `${dashboard.hikari.usage_percent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {t('admin.monitoring.active')}: {dashboard.hikari.active_connections} / {t('admin.monitoring.idle')}: {dashboard.hikari.idle_connections}
          </p>
        </div>

        {/* API Error Rate (Clickable) */}
        <button
          onClick={() => setShowErrorDetail(true)}
          className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6 text-left hover:border-amber-400/30 hover:bg-white/[0.02] transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.apiErrorRate')}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-amber-400 transition-colors" />
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">
            {dashboard.api.error_rate.toFixed(2)}%
          </p>
          <p className="text-xs text-slate-500 mt-3">
            {dashboard.api.total_errors.toLocaleString()} / {dashboard.api.total_requests.toLocaleString()}
          </p>
        </button>

        {/* Total Requests */}
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4 text-emerald-400" />
            <p className="text-slate-400 text-sm">{t('admin.monitoring.totalRequests')}</p>
          </div>
          <p className="text-2xl font-bold text-foreground mt-1">
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
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="h-5 w-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-foreground">{t('admin.monitoring.openAIBilling')}</h3>
          </div>
          {openAIBilling.connected ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-foreground/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  <p className="text-slate-400 text-sm">{t('admin.monitoring.openAITotalCost')}</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {openAIBilling.total_cost_usd != null
                    ? `$${openAIBilling.total_cost_usd.toFixed(2)}`
                    : '-'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{t('admin.monitoring.last30Days')}</p>
              </div>
              <div className="bg-foreground/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <p className="text-slate-400 text-sm">{t('admin.monitoring.openAITotalRequests')}</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {openAIBilling.model_usage.reduce((sum, m) => sum + m.requests, 0).toLocaleString()}
                </p>
                <p className="text-xs text-slate-500 mt-1">{t('admin.monitoring.last30Days')}</p>
              </div>
              <div className="bg-foreground/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <p className="text-slate-400 text-sm">{t('admin.monitoring.openAITotalTokens')}</p>
                </div>
                <p className="text-2xl font-bold text-foreground">
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
          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="h-4 w-4 text-purple-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.aiTotalCalls')}</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
              {aiUsage.total_calls.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-3">
              {t('admin.monitoring.last30Days')}
            </p>
          </div>

          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.aiTotalTokens')}</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
              {((aiUsage.total_input_tokens + aiUsage.total_output_tokens) / 1000).toFixed(1)}K
            </p>
            <p className="text-xs text-slate-500 mt-3">
              In: {(aiUsage.total_input_tokens / 1000).toFixed(1)}K / Out: {(aiUsage.total_output_tokens / 1000).toFixed(1)}K
            </p>
          </div>

          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.aiEstimatedCost')}</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
              ${aiUsage.total_estimated_cost_usd.toFixed(4)}
            </p>
            <p className="text-xs text-slate-500 mt-3">
              {t('admin.monitoring.last30Days')}
            </p>
          </div>

          <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-amber-400" />
              <p className="text-slate-400 text-sm">{t('admin.monitoring.aiAvgTokensPerCall')}</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">
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

      {/* Alert Configuration (Slack + Email) */}
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-6">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="h-5 w-5 text-bridge-accent" />
          <h3 className="text-lg font-bold text-foreground">{t('admin.monitoring.slackAlerts')}</h3>
        </div>

        <div className="space-y-5">
          {/* Slack Webhook */}
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              {t('admin.monitoring.webhookUrl')}
            </label>
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={t('admin.monitoring.webhookUrlPlaceholder')}
              className="w-full bg-foreground/5 border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>

          {/* Email Recipients */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-slate-400" />
              <label className="text-sm text-slate-400">
                {t('admin.monitoring.emailRecipients', 'CRITICAL 에러 이메일 수신자')}
              </label>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newEmail.trim() && newEmail.includes('@')) {
                    e.preventDefault();
                    if (!emailRecipients.includes(newEmail.trim())) {
                      setEmailRecipients([...emailRecipients, newEmail.trim()]);
                    }
                    setNewEmail('');
                  }
                }}
                placeholder="admin@example.com"
                className="flex-1 bg-foreground/5 border border-foreground/10 rounded-xl py-2.5 px-4 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
              <button
                onClick={() => {
                  if (newEmail.trim() && newEmail.includes('@') && !emailRecipients.includes(newEmail.trim())) {
                    setEmailRecipients([...emailRecipients, newEmail.trim()]);
                    setNewEmail('');
                  }
                }}
                disabled={!newEmail.trim() || !newEmail.includes('@')}
                className="px-3 py-2.5 bg-foreground/5 border border-foreground/10 text-slate-400 rounded-xl hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {emailRecipients.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {emailRecipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-bridge-accent/15 text-bridge-accent text-xs font-medium rounded-full"
                  >
                    {email}
                    <button
                      onClick={() => setEmailRecipients(emailRecipients.filter((e) => e !== email))}
                      className="hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {emailRecipients.length === 0 && (
              <p className="text-xs text-slate-600">{t('admin.monitoring.emailRecipientsHint', '500 에러 발생 시 이메일로도 알림을 받을 수 있습니다')}</p>
            )}
          </div>

          {/* Enable + Actions */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={alertEnabled}
                onChange={(e) => setAlertEnabled(e.target.checked)}
                className="rounded border-foreground/10 bg-foreground/5 text-bridge-accent focus:ring-bridge-accent"
              />
              {t('admin.monitoring.alertEnabled')}
            </label>

            <div className="flex gap-2">
              <button
                onClick={handleTestAlert}
                disabled={isSendingTest || !webhookUrl}
                className="flex items-center gap-2 px-4 py-2 bg-foreground/5 border border-foreground/10 text-muted-foreground rounded-xl hover:bg-foreground/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          isVisible={!!toast}
          onClose={() => setToast(null)}
        />
      )}

      {/* Error Detail Modal */}
      {showErrorDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowErrorDetail(false)}>
          <div
            className="bg-bridge-obsidian rounded-2xl border border-foreground/10 shadow-2xl w-full max-w-3xl max-h-[80dvh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-foreground/[0.08]">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="text-lg font-bold text-foreground">{t('admin.monitoring.errorDetail', 'API 에러 상세')}</h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {t('admin.monitoring.errorSummary', '총 {{errors}}건 / {{requests}}건 ({{rate}}%)', {
                      errors: dashboard.api.total_errors.toLocaleString(),
                      requests: dashboard.api.total_requests.toLocaleString(),
                      rate: dashboard.api.error_rate.toFixed(2),
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowErrorDetail(false)}
                className="p-2 text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(80dvh-88px)]">
              {dashboard.api.top_error_endpoints && dashboard.api.top_error_endpoints.length > 0 ? (
                <div className="space-y-3">
                  {dashboard.api.top_error_endpoints.map((ep, idx) => (
                    <div key={idx} className="bg-foreground/5 rounded-xl p-4 hover:bg-white/[0.07] transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                            ep.http_method === 'GET' ? 'bg-emerald-500/20 text-emerald-400' :
                            ep.http_method === 'POST' ? 'bg-blue-500/20 text-blue-400' :
                            ep.http_method === 'PUT' ? 'bg-amber-500/20 text-amber-400' :
                            ep.http_method === 'DELETE' ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {ep.http_method}
                          </span>
                          <span className="text-sm text-foreground font-mono truncate">{ep.endpoint}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-3">
                          <span className="text-sm text-red-400 font-bold">{ep.error_count}</span>
                          <span className="text-xs text-slate-500">/ {ep.request_count}</span>
                          <span className="text-xs text-amber-400 font-medium">({ep.error_rate.toFixed(1)}%)</span>
                        </div>
                      </div>
                      {/* Status Code Badges */}
                      {ep.status_codes && Object.keys(ep.status_codes).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.entries(ep.status_codes)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([code, count]) => (
                              <span
                                key={code}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                                  Number(code) >= 500
                                    ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                                    : Number(code) === 401 || Number(code) === 403
                                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                                    : Number(code) === 404
                                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                                    : 'bg-slate-500/15 text-slate-400 border border-slate-500/20'
                                }`}
                              >
                                <span className="font-bold">{code}</span>
                                <span className="opacity-70">&times;{(count as number).toLocaleString()}</span>
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  {t('admin.monitoring.noErrors', '에러가 없습니다')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
