import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Lock,
  Rocket,
  Hash,
  ChevronDown,
  LinkIcon,
  Unlink,
} from "lucide-react";
import {
  discordAPI,
  DiscordBotConfig,
  DiscordUserLinkStatus,
  DiscordChannelInfo,
} from "../utils/api";

interface DiscordSettingsPanelProps {
  boardId: string;
  canAccessDiscord?: boolean;
  onUpgrade?: () => void;
  onDiscordStatusChange?: (connected: boolean) => void;
}

export function DiscordSettingsPanel({
  boardId,
  canAccessDiscord = true,
  onUpgrade,
  onDiscordStatusChange,
}: DiscordSettingsPanelProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<DiscordBotConfig | null>(null);
  const [userLink, setUserLink] = useState<DiscordUserLinkStatus | null>(null);
  const [channels, setChannels] = useState<DiscordChannelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isChangingChannel, setIsChangingChannel] = useState(false);
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [oauthMessage, setOauthMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("discord")) {
      const result = params.get("discord");
      if (result === "success") {
        setOauthMessage({
          type: "success",
          text: t("discordBot.oauthSuccess"),
        });
      } else if (result === "error") {
        setOauthMessage({
          type: "error",
          text: t("discordBot.oauthError"),
        });
      }
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete("discord");
      window.history.replaceState({}, "", url.toString());
      // Auto-dismiss after 5s
      setTimeout(() => setOauthMessage(null), 5000);
    }
  }, [t]);

  const fetchData = useCallback(async () => {
    try {
      const [configData, linkData] = await Promise.all([
        discordAPI.getConfig(boardId).catch(() => null),
        discordAPI.getMyLink(boardId).catch(() => null),
      ]);
      setConfig(configData);
      setUserLink(linkData);
      onDiscordStatusChange?.(!!configData?.bot_connected && !!linkData?.linked);

      // Fetch channels if bot is connected
      if (configData?.bot_connected) {
        try {
          const channelData = await discordAPI.getChannels(boardId);
          // Filter to text channels only (type 0)
          setChannels(
            channelData.channels.filter((ch) => ch.type === 0),
          );
        } catch {
          setChannels([]);
        }
      }
    } catch {
      setConfig(null);
      setUserLink(null);
      onDiscordStatusChange?.(false);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, onDiscordStatusChange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInstallBot = async () => {
    setErrorMessage(null);
    setIsRedirecting(true);
    try {
      const data = await discordAPI.getOAuthUrl(boardId, "bot_install");
      window.location.href = data.oauth_url;
    } catch {
      setIsRedirecting(false);
      setErrorMessage(t('discordBot.installFailed', 'Failed to start bot installation'));
    }
  };

  const handleLinkAccount = async () => {
    setErrorMessage(null);
    setIsRedirecting(true);
    try {
      const data = await discordAPI.getOAuthUrl(boardId, "user_link");
      window.location.href = data.oauth_url;
    } catch {
      setIsRedirecting(false);
      setErrorMessage(t('discordBot.linkFailed', 'Failed to start account linking'));
    }
  };

  const handleUnlink = async () => {
    setErrorMessage(null);
    setIsUnlinking(true);
    try {
      await discordAPI.unlinkMe(boardId);
      setUserLink({ linked: false, discord_user_id: null, discord_username: null });
      onDiscordStatusChange?.(false);
    } catch {
      setErrorMessage(t('discordBot.unlinkFailed', 'Failed to unlink Discord account'));
    } finally {
      setIsUnlinking(false);
    }
  };

  const handleDisconnectBot = async () => {
    if (!window.confirm(t("discordBot.disconnectConfirm"))) return;
    setErrorMessage(null);
    setIsDisconnecting(true);
    try {
      await discordAPI.deleteConfig(boardId);
      setConfig(null);
      setUserLink(null);
      setChannels([]);
      onDiscordStatusChange?.(false);
    } catch {
      setErrorMessage(t('discordBot.disconnectFailed', 'Failed to disconnect bot'));
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleChannelSelect = async (channel: DiscordChannelInfo) => {
    setErrorMessage(null);
    setIsChangingChannel(true);
    setShowChannelDropdown(false);
    try {
      const updated = await discordAPI.updateChannel(boardId, channel.id);
      setConfig(updated);
    } catch {
      setErrorMessage(t('discordBot.channelUpdateFailed', 'Failed to update channel'));
    } finally {
      setIsChangingChannel(false);
    }
  };

  const handleTest = async () => {
    setErrorMessage(null);
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await discordAPI.testNotification(boardId);
      setTestResult(result);
    } catch {
      setTestResult({
        success: false,
        message: t("discordBot.testFailed"),
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) return null;

  // State 4: Premium Locked
  if (!canAccessDiscord) {
    return (
      <div className="mx-3 mt-3 mb-2 p-3 bg-bridge-accent/5 rounded-xl border border-bridge-accent/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Lock size={12} className="text-bridge-accent" />
            <span className="text-[11px] font-medium text-bridge-accent">
              {t("discordBot.title")}
            </span>
          </div>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-white bg-bridge-accent hover:bg-bridge-accent/90 rounded-md transition-all"
            >
              <Rocket size={11} />
              {t("discordBot.upgradeButton")}
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {t("discordBot.premiumRequired")}
        </p>
      </div>
    );
  }

  // OAuth callback message
  const oauthBanner = oauthMessage && (
    <div
      className={`flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-lg text-[11px] ${
        oauthMessage.type === "success"
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      {oauthMessage.type === "success" ? (
        <Check size={12} />
      ) : (
        <AlertCircle size={12} />
      )}
      {oauthMessage.text}
    </div>
  );

  const errorBanner = errorMessage && (
    <div
      className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-lg text-[11px] bg-red-500/10 text-red-400 cursor-pointer"
      onClick={() => setErrorMessage(null)}
    >
      <AlertCircle size={12} />
      {errorMessage}
    </div>
  );

  // State 1: Bot Not Installed
  if (!config) {
    return (
      <div className="mx-3 mt-3 mb-2 p-3 bg-white/[0.03] rounded-xl border border-foreground/10">
        {oauthBanner}
        {errorBanner}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <DiscordIcon size={14} className="text-slate-400" />
            <span className="text-[11px] font-medium text-foreground">
              {t("discordBot.title")}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed mb-3">
          {t("discordBot.installDesc")}
        </p>
        <button
          onClick={handleInstallBot}
          disabled={isRedirecting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
        >
          {isRedirecting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <LinkIcon size={12} />
          )}
          {t("discordBot.installButton")}
        </button>
      </div>
    );
  }

  // State 2 & 3: Bot Installed
  return (
    <div className="mx-3 mt-3 mb-2 p-3 bg-white/[0.03] rounded-xl border border-foreground/10">
      {oauthBanner}
      {errorBanner}

      {/* Bot connection status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
          <span className="text-[11px] font-medium text-green-400">
            {t("discordBot.guildConnected")}
          </span>
        </div>
        <button
          onClick={handleDisconnectBot}
          disabled={isDisconnecting}
          className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
          title={t("discordBot.disconnectBot")}
        >
          {isDisconnecting ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Trash2 size={13} />
          )}
        </button>
      </div>

      {/* Guild info */}
      <div className="text-[10px] text-slate-400 mb-3">
        {config.guild_name}
      </div>

      {/* Channel selector */}
      <div className="mb-3">
        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1 block">
          {t("discordBot.channelLabel")}
        </label>
        <div className="relative">
          <button
            onClick={() => setShowChannelDropdown(!showChannelDropdown)}
            disabled={isChangingChannel}
            className="w-full flex items-center justify-between bg-foreground/[0.03] border border-foreground/10 rounded-lg py-2 px-3 text-xs text-foreground hover:bg-foreground/5 transition-all"
          >
            <span className="flex items-center gap-1.5">
              <Hash size={12} className="text-slate-500" />
              {isChangingChannel ? (
                <Loader2 size={12} className="animate-spin text-bridge-accent" />
              ) : config.channel_name ? (
                config.channel_name
              ) : (
                <span className="text-slate-500">
                  {t("discordBot.channelSelect")}
                </span>
              )}
            </span>
            <ChevronDown size={12} className="text-slate-500" />
          </button>

          {showChannelDropdown && channels.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-bridge-obsidian border border-foreground/10 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => handleChannelSelect(ch)}
                  className={`w-full flex items-center gap-1.5 px-3 py-2 text-xs text-left hover:bg-foreground/5 transition-colors ${
                    config.channel_id === ch.id
                      ? "text-bridge-accent"
                      : "text-foreground"
                  }`}
                >
                  <Hash size={11} className="text-slate-500 flex-shrink-0" />
                  {ch.name}
                  {config.channel_id === ch.id && (
                    <Check size={11} className="ml-auto text-bridge-accent flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {!config.channel_id && (
          <p className="text-[10px] text-amber-400/70 mt-1">
            {t("discordBot.channelNone")}
          </p>
        )}
      </div>

      {/* User link section */}
      <div className="border-t border-foreground/[0.08] pt-3">
        {userLink?.linked ? (
          // State 3: User linked
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-bridge-accent" />
                <span className="text-[11px] text-foreground">
                  {userLink.discord_username}
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                  {t("discordBot.linked")}
                </span>
              </div>
              <button
                onClick={handleUnlink}
                disabled={isUnlinking}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all disabled:opacity-50"
              >
                {isUnlinking ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Unlink size={10} />
                )}
                {t("discordBot.unlinkButton")}
              </button>
            </div>

            {/* Test + actions */}
            <div className="flex items-center gap-2">
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
                {t("discordBot.testButton")}
              </button>
            </div>

            {testResult && (
              <div
                className={`flex items-center gap-1.5 text-[11px] ${
                  testResult.success ? "text-green-400" : "text-red-400"
                }`}
              >
                {testResult.success ? (
                  <Check size={12} />
                ) : (
                  <AlertCircle size={12} />
                )}
                {testResult.success
                  ? t("discordBot.testSuccess")
                  : testResult.message}
              </div>
            )}
          </div>
        ) : (
          // State 2: User not linked
          <div>
            <p className="text-[10px] text-slate-400 leading-relaxed mb-2">
              {t("discordBot.linkDesc")}
            </p>
            <button
              onClick={handleLinkAccount}
              disabled={isRedirecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
            >
              {isRedirecting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <LinkIcon size={12} />
              )}
              {t("discordBot.linkButton")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline Discord SVG icon component
function DiscordIcon({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path
        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.053a19.905 19.905 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
        fill="currentColor"
      />
    </svg>
  );
}
