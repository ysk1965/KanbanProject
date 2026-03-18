import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
  Loader2,
  Check,
  AlertCircle,
  Lock,
  Rocket,
  ExternalLink,
  Link2,
  UserCheck,
} from "lucide-react";
import {
  discordAPI,
  DiscordBotConfig,
  DiscordUserLinkStatus,
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
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
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
      onDiscordStatusChange?.(
        !!configData?.bot_connected && !!linkData?.linked,
      );
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
      setErrorMessage(
        t("discordBot.installFailed", "Failed to start bot installation"),
      );
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
      setErrorMessage(
        t("discordBot.linkFailed", "Failed to start account linking"),
      );
    }
  };

  const handleUnlink = async () => {
    setErrorMessage(null);
    setIsUnlinking(true);
    try {
      await discordAPI.unlinkMe(boardId);
      setUserLink({
        linked: false,
        discord_user_id: null,
        discord_username: null,
      });
      onDiscordStatusChange?.(false);
    } catch {
      setErrorMessage(
        t("discordBot.unlinkFailed", "Failed to unlink Discord account"),
      );
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
      onDiscordStatusChange?.(false);
    } catch {
      setErrorMessage(
        t("discordBot.disconnectFailed", "Failed to disconnect bot"),
      );
    } finally {
      setIsDisconnecting(false);
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
      <div className="p-3 bg-bridge-accent/5 rounded-xl border border-bridge-accent/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Lock size={12} className="text-bridge-accent" />
            <span className="text-xs font-medium text-bridge-accent">
              {t("discordBot.title")}
            </span>
          </div>
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              className="flex items-center gap-1 px-2 py-1 text-xs text-white bg-bridge-accent hover:bg-bridge-accent/90 rounded-md transition-all"
            >
              <Rocket size={11} />
              {t("discordBot.upgradeButton")}
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          {t("discordBot.premiumRequired")}
        </p>
      </div>
    );
  }

  // OAuth callback message
  const oauthBanner = oauthMessage && (
    <div
      className={`flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-lg text-xs ${
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
      className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 cursor-pointer"
      onClick={() => setErrorMessage(null)}
    >
      <AlertCircle size={12} />
      {errorMessage}
    </div>
  );

  // State 1: Bot Not Installed (or not connected)
  if (!config || !config.bot_connected) {
    return (
      <div className="p-3 bg-white/[0.03] rounded-xl border border-foreground/10">
        {oauthBanner}
        {errorBanner}
        <div className="text-center py-2">
          <p className="text-xs text-slate-400 mb-3">
            {t("discordBot.installDesc")}
          </p>
          <button
            onClick={handleInstallBot}
            disabled={isRedirecting}
            className="flex items-center gap-2 mx-auto px-4 py-2 text-xs font-bold text-white bg-bridge-accent rounded-xl hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
          >
            {isRedirecting ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <ExternalLink size={13} />
            )}
            {t("discordBot.installButton")}
          </button>
        </div>
      </div>
    );
  }

  // State 2 & 3: Bot Installed
  return (
    <div className="p-3 bg-white/[0.03] rounded-xl border border-foreground/10">
      {oauthBanner}
      {errorBanner}

      {/* Bot connection status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-xs font-medium text-green-400">
            {t("discordBot.guildConnected")}
          </span>
        </div>
        <button
          onClick={handleDisconnectBot}
          disabled={isDisconnecting}
          className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
        >
          {isDisconnecting ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            t("discordBot.disconnectButton", "Disconnect")
          )}
        </button>
      </div>

      {/* Guild info */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">
            {t("discordBot.serverLabel", "Server")}:
          </span>
          <span className="text-xs text-foreground font-medium">
            {config.guild_name}
          </span>
        </div>
      </div>

      {/* User link section */}
      <div className="border-t border-foreground/[0.08] pt-3 mt-3">
        <label className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-1.5 block">
          {t("discordBot.personalLink", "My Discord Account")}
        </label>
        {userLink?.linked ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <UserCheck size={12} className="text-green-400" />
                <span className="text-xs text-foreground">
                  {userLink.discord_username}
                </span>
                <span className="text-xs text-slate-500">
                  ({t("discordBot.dmEnabled", "DM enabled")})
                </span>
              </div>
              <button
                onClick={handleUnlink}
                disabled={isUnlinking}
                className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                {isUnlinking ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  t("discordBot.unlinkButton")
                )}
              </button>
            </div>

            {/* Test notification */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleTest}
                disabled={isTesting}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
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
                className={`flex items-center gap-1.5 text-xs ${
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
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {t("discordBot.linkDesc")}
            </span>
            <button
              onClick={handleLinkAccount}
              disabled={isRedirecting}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-bridge-accent bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/20 transition-all disabled:opacity-50"
            >
              {isRedirecting ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Link2 size={10} />
              )}
              {t("discordBot.linkButton")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
