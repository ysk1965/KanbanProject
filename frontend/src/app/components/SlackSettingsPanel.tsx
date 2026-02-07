import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, X, Send, Trash2, Loader2, Check, AlertCircle, Link2, HelpCircle, Lock, Rocket } from 'lucide-react';
import { slackWebhookAPI, SlackWebhookConfig } from '../utils/api';
import { SlackGuideModal } from './SlackGuideModal';

interface SlackSettingsPanelProps {
  boardId: string;
  onSlackStatusChange?: (connected: boolean) => void;
  canAccessSlack?: boolean;
  onUpgrade?: () => void;
}

export function SlackSettingsPanel({ boardId, onSlackStatusChange, canAccessSlack = true, onUpgrade }: SlackSettingsPanelProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SlackWebhookConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await slackWebhookAPI.getMyConfig(boardId);
      setConfig(data);
      onSlackStatusChange?.(!!data?.enabled);
    } catch {
      setConfig(null);
      onSlackStatusChange?.(false);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, onSlackStatusChange]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleStartEdit = () => {
    setWebhookUrl('');
    setChannelName(config?.channel_name || '');
    setEnabled(config?.enabled ?? true);
    setIsEditing(true);
    setTestResult(null);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTestResult(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!webhookUrl.trim()) {
      setError(t('slackSettings.webhookUrlRequired'));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const data = await slackWebhookAPI.upsertMyConfig(boardId, {
        webhookUrl: webhookUrl.trim(),
        channelName: channelName.trim() || undefined,
        enabled,
      });
      setConfig(data);
      setIsEditing(false);
      setTestResult(null);
      onSlackStatusChange?.(!!data?.enabled);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      setError(apiErr?.response?.data?.message || t('slackSettings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await slackWebhookAPI.testMyWebhook(boardId);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: t('slackSettings.testFailed') });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await slackWebhookAPI.deleteMyConfig(boardId);
      setConfig(null);
      setIsEditing(false);
      setTestResult(null);
      onSlackStatusChange?.(false);
    } catch {
      setError(t('slackSettings.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return null;

  // Premium 전용 기능 - 접근 불가 시 업그레이드 유도
  if (!canAccessSlack) {
    return (
      <div className="mx-3 mt-3 mb-2 p-3 bg-bridge-accent/5 rounded-xl border border-bridge-accent/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Lock size={12} className="text-bridge-accent" />
            <span className="text-[11px] font-medium text-bridge-accent">{t('slackSettings.premiumLabel')}</span>
          </div>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-white bg-bridge-accent hover:bg-bridge-accent/90 rounded-md transition-all"
            >
              <Rocket size={11} />
              {t('slackSettings.upgradeButton')}
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {t('slackSettings.premiumDesc')}
        </p>
      </div>
    );
  }

  // Editing mode
  if (isEditing) {
    return (
      <div className="mx-3 mt-3 mb-2 p-3 bg-white/[0.03] rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-foreground">{t('slackSettings.settingsTitle')}</span>
          <button onClick={handleCancel} className="text-slate-400 hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1 block">
              Webhook URL
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1 block">
              Channel Name <span className="normal-case tracking-normal text-slate-500">({t('slackSettings.channelNameLabel')})</span>
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="#my-alerts"
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-bridge-accent focus:ring-bridge-accent/50"
            />
            <span className="text-xs text-slate-300">{t('slackSettings.enabledLabel')}</span>
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 mt-2 text-red-400 text-[11px]">
            <AlertCircle size={12} />
            {error}
          </div>
        )}

        {testResult && (
          <div className={`flex items-center gap-1.5 mt-2 text-[11px] ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {testResult.success ? <Check size={12} /> : <AlertCircle size={12} />}
            {testResult.message}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          {config && (
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-slate-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-all disabled:opacity-50"
            >
              {isTesting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              {t('slackSettings.testButton')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            {t('common.save')}
          </button>
          {config && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              {t('slackSettings.disconnectButton')}
            </button>
          )}
        </div>

        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1 mt-3 text-[10px] text-slate-500 hover:text-bridge-accent transition-colors"
        >
          <HelpCircle size={11} />
          {t('slackSettings.webhookGuideLink')}
        </button>

        <SlackGuideModal open={showGuide} onOpenChange={setShowGuide} />
      </div>
    );
  }

  // Connected state
  if (config) {
    return (
      <div className={`mx-3 mt-3 mb-2 p-3 rounded-xl border ${
        config.enabled
          ? 'bg-white/[0.03] border-white/10'
          : 'bg-amber-500/5 border-amber-500/20'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.enabled ? 'bg-green-400' : 'bg-amber-400'}`} />
            <span className={`text-[11px] font-medium ${config.enabled ? 'text-green-400' : 'text-amber-400'}`}>
              {config.enabled ? t('slackSettings.connectedStatus') : t('slackSettings.disabledStatus')}
            </span>
          </div>
          <button
            onClick={handleStartEdit}
            className="text-slate-400 hover:text-foreground transition-colors flex-shrink-0"
            title={t('slackSettings.editSettings')}
          >
            <Settings size={13} />
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Link2 size={10} className="text-slate-500 flex-shrink-0" />
            <span className="text-[10px] text-slate-400 truncate" title={config.webhook_url_masked}>
              {config.webhook_url_masked}
            </span>
          </div>
          {config.channel_name && (
            <div className="text-[10px] text-slate-500 pl-[16px]">
              {config.channel_name}
            </div>
          )}
        </div>
        {!config.enabled && (
          <p className="text-[10px] text-amber-400/70 mt-2">
            {t('slackSettings.slackDisabledWarning')}
          </p>
        )}
      </div>
    );
  }

  // Not connected state
  return (
    <div className="mx-3 mt-3 mb-2 p-3 bg-red-500/5 rounded-xl border border-red-500/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-400" />
          <span className="text-[11px] font-medium text-red-400">{t('slackSettings.needConnection')}</span>
        </div>
        <button
          onClick={handleStartEdit}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-bridge-accent hover:text-white bg-bridge-accent/10 hover:bg-bridge-accent/20 rounded-md transition-all"
        >
          <Link2 size={11} />
          {t('slackSettings.connectButton')}
        </button>
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Link2 size={10} className="text-red-400/50 flex-shrink-0" />
        <span className="text-[10px] text-red-400/60">{t('slackSettings.webhookUrlNeeded')}</span>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        {t('slackSettings.connectionDesc')}
      </p>
      <button
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1 mt-2 text-[10px] text-slate-500 hover:text-bridge-accent transition-colors"
      >
        <HelpCircle size={11} />
        {t('slackSettings.guideLink')}
      </button>
      <SlackGuideModal open={showGuide} onOpenChange={setShowGuide} />
    </div>
  );
}
