import { useState, useEffect, useCallback } from 'react';
import { Settings, X, Send, Trash2, Loader2, Check, AlertCircle, Link2 } from 'lucide-react';
import { slackWebhookAPI, SlackWebhookConfig } from '../utils/api';

interface SlackSettingsPanelProps {
  boardId: string;
}

export function SlackSettingsPanel({ boardId }: SlackSettingsPanelProps) {
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

  const fetchConfig = useCallback(async () => {
    try {
      const data = await slackWebhookAPI.getMyConfig(boardId);
      setConfig(data);
    } catch {
      setConfig(null);
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

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
      setError('Webhook URL을 입력해주세요');
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
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      setError(apiErr?.response?.data?.message || '저장에 실패했습니다');
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
      setTestResult({ success: false, message: '테스트에 실패했습니다' });
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
    } catch {
      setError('삭제에 실패했습니다');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return null;

  // Editing mode
  if (isEditing) {
    return (
      <div className="mx-3 mt-3 mb-2 p-3 bg-white/[0.03] rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-foreground">Slack 연동 설정</span>
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
              Channel Name <span className="normal-case tracking-normal text-slate-500">(선택)</span>
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
            <span className="text-xs text-slate-300">활성화</span>
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
              테스트
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            저장
          </button>
          {config && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              연결 해제
            </button>
          )}
        </div>

        <div className="mt-3 p-2 bg-white/[0.02] rounded-lg border border-white/5">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Slack 앱 &gt; Incoming Webhooks &gt; Add to Slack &gt; 채널 선택 &gt; Webhook URL 복사
          </p>
        </div>
      </div>
    );
  }

  // Connected state
  if (config) {
    return (
      <div className="mx-3 mt-3 mb-2 p-3 bg-white/[0.03] rounded-xl border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.enabled ? 'bg-green-400' : 'bg-slate-500'}`} />
            <span className="text-[11px] font-medium text-green-400">
              {config.enabled ? '연동 완료' : 'Slack 비활성'}
            </span>
          </div>
          <button
            onClick={handleStartEdit}
            className="text-slate-400 hover:text-foreground transition-colors flex-shrink-0"
            title="설정 수정"
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
      </div>
    );
  }

  // Not connected state
  return (
    <div className="mx-3 mt-3 mb-2 px-3 py-2 bg-bridge-accent/5 rounded-lg border border-bridge-accent/20 flex items-center justify-between">
      <span className="text-[11px] text-slate-300">
        Slack으로 알림 받기
      </span>
      <button
        onClick={handleStartEdit}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-bridge-accent hover:text-white bg-bridge-accent/10 hover:bg-bridge-accent/20 rounded-md transition-all"
      >
        <Link2 size={11} />
        연결
      </button>
    </div>
  );
}
