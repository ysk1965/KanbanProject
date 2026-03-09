import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Settings,
  X,
  Send,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Link2,
  HelpCircle,
  Lock,
  Rocket,
} from "lucide-react";
import { discordWebhookAPI, DiscordWebhookConfig } from "../utils/api";
import { DiscordGuideModal } from "./DiscordGuideModal";

interface DiscordSettingsPanelProps {
  boardId: string;
  onDiscordStatusChange?: (connected: boolean) => void;
  canAccessDiscord?: boolean;
  onUpgrade?: () => void;
}

export function DiscordSettingsPanel({
  boardId,
  onDiscordStatusChange,
  canAccessDiscord = true,
  onUpgrade,
}: DiscordSettingsPanelProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<DiscordWebhookConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channelName, setChannelName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await discordWebhookAPI.getMyConfig(boardId);
      setConfig(data);
      onDiscordStatusChange?.(!!data?.enabled);
    } catch {
      setConfig(null);
      onDiscordStatusChange?.(false);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, onDiscordStatusChange]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleStartEdit = () => {
    setWebhookUrl("");
    setChannelName(config?.channel_name || "");
    setEnabled(config?.enabled ?? true);
    setIsEditing(true);
    setTestResult(null);
    setError(null);
  };

  const isExistingConfig = !!config;

  const handleCancel = () => {
    setIsEditing(false);
    setTestResult(null);
    setError(null);
  };

  const handleSave = async () => {
    // 새 설정일 때만 webhook URL 필수
    if (!isExistingConfig && !webhookUrl.trim()) {
      setError(t("discordSettings.webhookUrlRequired"));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const data = await discordWebhookAPI.upsertMyConfig(boardId, {
        webhookUrl: webhookUrl.trim() || undefined,
        channelName: channelName.trim() || undefined,
        enabled,
      });
      setConfig(data);
      setIsEditing(false);
      setTestResult(null);
      onDiscordStatusChange?.(!!data?.enabled);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      setError(
        apiErr?.response?.data?.message || t("discordSettings.saveFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await discordWebhookAPI.testMyWebhook(boardId);
      setTestResult(result);
    } catch {
      setTestResult({
        success: false,
        message: t("discordSettings.testFailed"),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await discordWebhookAPI.deleteMyConfig(boardId);
      setConfig(null);
      setIsEditing(false);
      setTestResult(null);
      onDiscordStatusChange?.(false);
    } catch {
      setError(t("discordSettings.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return null;

  // Premium 전용 기능 - 접근 불가 시 업그레이드 유도
  if (!canAccessDiscord) {
    return (
      <div className="mx-3 mt-3 mb-2 p-3 bg-bridge-accent/5 rounded-xl border border-bridge-accent/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Lock size={12} className="text-bridge-accent" />
            <span className="text-[11px] font-medium text-bridge-accent">
              {t("discordSettings.premiumLabel")}
            </span>
          </div>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-white bg-bridge-accent hover:bg-bridge-accent/90 rounded-md transition-all"
            >
              <Rocket size={11} />
              {t("discordSettings.upgradeButton")}
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {t("discordSettings.premiumDesc")}
        </p>
      </div>
    );
  }

  // Editing mode
  if (isEditing) {
    return (
      <div className="mx-3 mt-3 mb-2 p-3 bg-white/[0.03] rounded-xl border border-foreground/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-foreground">
            {t("discordSettings.settingsTitle")}
          </span>
          <button
            onClick={handleCancel}
            className="text-slate-400 hover:text-foreground transition-colors"
          >
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
              placeholder={
                isExistingConfig
                  ? config?.webhook_url_masked ||
                    "https://discord.com/api/webhooks/..."
                  : "https://discord.com/api/webhooks/..."
              }
              className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
            {isExistingConfig && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {t(
                  "discordSettings.webhookUrlKeepHint",
                  "변경하지 않으려면 비워두세요",
                )}
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1 block">
              Channel Name{" "}
              <span className="normal-case tracking-normal text-slate-500">
                ({t("discordSettings.channelNameLabel")})
              </span>
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="#my-alerts"
              className="w-full bg-foreground/5 border border-foreground/10 rounded-lg py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-bridge-border bg-foreground/5 text-bridge-accent focus:ring-bridge-accent/50"
            />
            <span className="text-xs text-muted-foreground">
              {t("discordSettings.enabledLabel")}
            </span>
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-1.5 mt-2 text-red-400 text-[11px]">
            <AlertCircle size={12} />
            {error}
          </div>
        )}

        {testResult && (
          <div
            className={`flex items-center gap-1.5 mt-2 text-[11px] ${testResult.success ? "text-green-400" : "text-red-400"}`}
          >
            {testResult.success ? (
              <Check size={12} />
            ) : (
              <AlertCircle size={12} />
            )}
            {testResult.message}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          {config && (
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
            >
              {isTesting ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Send size={11} />
              )}
              {t("discordSettings.testButton")}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Check size={11} />
            )}
            {t("common.save")}
          </button>
          {config && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Trash2 size={11} />
              )}
              {t("discordSettings.disconnectButton")}
            </button>
          )}
        </div>

        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1 mt-3 text-[10px] text-slate-500 hover:text-bridge-accent transition-colors"
        >
          <HelpCircle size={11} />
          {t("discordSettings.webhookGuideLink")}
        </button>

        <DiscordGuideModal open={showGuide} onOpenChange={setShowGuide} />
      </div>
    );
  }

  // Connected state
  if (config) {
    return (
      <div
        className={`mx-3 mt-3 mb-2 p-3 rounded-xl border ${
          config.enabled
            ? "bg-white/[0.03] border-foreground/10"
            : "bg-amber-500/5 border-amber-500/20"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.enabled ? "bg-green-400" : "bg-amber-400"}`}
            />
            <span
              className={`text-[11px] font-medium ${config.enabled ? "text-green-400" : "text-amber-400"}`}
            >
              {config.enabled
                ? t("discordSettings.connectedStatus")
                : t("discordSettings.disabledStatus")}
            </span>
          </div>
          <button
            onClick={handleStartEdit}
            className="text-slate-400 hover:text-foreground transition-colors flex-shrink-0"
            title={t("discordSettings.editSettings")}
          >
            <Settings size={13} />
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Link2 size={10} className="text-slate-500 flex-shrink-0" />
            <span
              className="text-[10px] text-slate-400 truncate"
              title={config.webhook_url_masked}
            >
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
            {t("discordSettings.discordDisabledWarning")}
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
          <span className="text-[11px] font-medium text-red-400">
            {t("discordSettings.needConnection")}
          </span>
        </div>
        <button
          onClick={handleStartEdit}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-bridge-accent hover:text-foreground bg-bridge-accent/10 hover:bg-bridge-accent/20 rounded-md transition-all"
        >
          <Link2 size={11} />
          {t("discordSettings.connectButton")}
        </button>
      </div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Link2 size={10} className="text-red-400/50 flex-shrink-0" />
        <span className="text-[10px] text-red-400/60">
          {t("discordSettings.webhookUrlNeeded")}
        </span>
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        {t("discordSettings.connectionDesc")}
      </p>
      <button
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1 mt-2 text-[10px] text-slate-500 hover:text-bridge-accent transition-colors"
      >
        <HelpCircle size={11} />
        {t("discordSettings.guideLink")}
      </button>
      <DiscordGuideModal open={showGuide} onOpenChange={setShowGuide} />
    </div>
  );
}
