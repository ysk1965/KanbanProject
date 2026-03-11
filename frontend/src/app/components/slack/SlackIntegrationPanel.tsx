import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Zap,
  Link2,
  ExternalLink,
  Hash,
  Trash2,
  Check,
  AlertCircle,
  ChevronDown,
  UserCheck,
  UserX,
  Lock,
  Rocket,
  Send,
} from "lucide-react";
import {
  slackAppAPI,
  SlackAppInstallation,
  SlackChannel,
  SlackChannelList,
  SlackUserLinkStatus,
} from "../../utils/api";
import { SlackSettingsPanel } from "../SlackSettingsPanel";

interface SlackIntegrationPanelProps {
  boardId: string;
  onSlackStatusChange?: (connected: boolean) => void;
  canAccessSlack?: boolean;
  onUpgrade?: () => void;
}

export function SlackIntegrationPanel({
  boardId,
  onSlackStatusChange,
  canAccessSlack = true,
  onUpgrade,
}: SlackIntegrationPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"app" | "webhook">("app");
  const [installation, setInstallation] = useState<SlackAppInstallation | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [showChannelPicker, setShowChannelPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLinkStatus, setUserLinkStatus] =
    useState<SlackUserLinkStatus | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const fetchInstallation = useCallback(async () => {
    try {
      const data = await slackAppAPI.getStatus(boardId);
      setInstallation(data);
      if (data?.active) {
        onSlackStatusChange?.(true);
        // If app is installed, default to app tab
        setActiveTab("app");
      }
    } catch {
      setInstallation(null);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, onSlackStatusChange]);

  const fetchUserLinkStatus = useCallback(async () => {
    try {
      const data = await slackAppAPI.getUserLinkStatus();
      setUserLinkStatus(data);
    } catch {
      setUserLinkStatus(null);
    }
  }, []);

  useEffect(() => {
    fetchInstallation();
    fetchUserLinkStatus();
    // Check for successful connection via URL params
    const params = new URLSearchParams(window.location.search);
    if (params.get("slack") === "connected") {
      // Clean up URL
      const url = new URL(window.location.href);
      url.searchParams.delete("slack");
      window.history.replaceState({}, "", url.toString());
    }
    if (params.get("status") === "user_linked") {
      fetchUserLinkStatus();
      const url = new URL(window.location.href);
      url.searchParams.delete("status");
      url.searchParams.delete("tab");
      window.history.replaceState({}, "", url.toString());
    }
  }, [fetchInstallation, fetchUserLinkStatus]);

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      const { url } = await slackAppAPI.getInstallUrl("BOARD", boardId);
      window.location.href = url;
    } catch {
      setError(t("slackApp.connectFailed", "Failed to get install URL"));
      setIsInstalling(false);
    }
  };

  const handleDisconnect = async () => {
    if (!installation) return;
    setIsDisconnecting(true);
    try {
      await slackAppAPI.uninstall(installation.id);
      setInstallation(null);
      onSlackStatusChange?.(false);
    } catch {
      setError(t("slackApp.disconnectFailed", "Failed to disconnect"));
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleLoadChannels = async () => {
    if (!installation) return;
    if (showChannelPicker) {
      setShowChannelPicker(false);
      return;
    }
    setIsLoadingChannels(true);
    try {
      const data = await slackAppAPI.listChannels(boardId);
      setChannels(data.channels);
      setShowChannelPicker(true);
    } catch {
      setError("Failed to load channels");
    } finally {
      setIsLoadingChannels(false);
    }
  };

  const handleSelectChannel = async (channel: SlackChannel) => {
    if (!installation) return;
    try {
      await slackAppAPI.setDefaultChannel(
        installation.id,
        channel.id,
        channel.name,
      );
      setInstallation((prev) =>
        prev
          ? {
              ...prev,
              default_channel_id: channel.id,
              default_channel_name: channel.name,
            }
          : null,
      );
      setShowChannelPicker(false);
    } catch {
      setError("Failed to set channel");
    }
  };

  const handleLinkUser = async () => {
    setIsLinking(true);
    setError(null);
    try {
      const { url } = await slackAppAPI.getUserLinkUrl(boardId);
      window.location.href = url;
    } catch {
      setError(t("slackApp.linkFailed", "Failed to get link URL"));
      setIsLinking(false);
    }
  };

  const handleUnlinkUser = async () => {
    setIsUnlinking(true);
    try {
      await slackAppAPI.unlinkUser();
      setUserLinkStatus({
        linked: false,
        slack_user_id: null,
        slack_username: null,
        slack_team_id: null,
      });
    } catch {
      setError(t("slackApp.unlinkFailed", "Failed to unlink"));
    } finally {
      setIsUnlinking(false);
    }
  };

  const handleTestNotification = async () => {
    setError(null);
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await slackAppAPI.testNotification(boardId);
      setTestResult(result);
    } catch {
      setTestResult({
        success: false,
        message: t("slackApp.testFailed", "Failed to send test message"),
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) return null;

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setActiveTab("app")}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
            activeTab === "app"
              ? "bg-bridge-accent/15 text-bridge-accent"
              : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          <span className="flex items-center gap-1">
            <Zap size={11} />
            Slack App
            {installation?.active && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            )}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("webhook")}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
            activeTab === "webhook"
              ? "bg-bridge-accent/15 text-bridge-accent"
              : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          <span className="flex items-center gap-1">
            <Link2 size={11} />
            Webhook
            <span className="text-[9px] text-slate-500">(Legacy)</span>
          </span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "app" ? (
        <div className="p-3 bg-white/[0.03] rounded-xl border border-foreground/10">
          {!canAccessSlack ? (
            // Premium required — unified style with Discord
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Lock size={12} className="text-bridge-accent" />
                  <span className="text-[11px] font-medium text-bridge-accent">
                    Slack
                  </span>
                </div>
                {onUpgrade && (
                  <button
                    onClick={onUpgrade}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-white bg-bridge-accent hover:bg-bridge-accent/90 rounded-md transition-all"
                  >
                    <Rocket size={11} />
                    {t("slackSettings.upgradeButton", "Upgrade")}
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                {t("slackSettings.premiumDesc", "Premium feature")}
              </p>
            </div>
          ) : installation?.active ? (
            // Connected state
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-[11px] font-medium text-green-400">
                    {t("slackApp.installedStatus", "Connected")}
                  </span>
                </div>
                <button
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {isDisconnecting ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    t("slackApp.disconnectButton", "Disconnect")
                  )}
                </button>
              </div>

              {/* Workspace info */}
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">
                    {t("slackApp.workspace", "Workspace")}:
                  </span>
                  <span className="text-[11px] text-foreground font-medium">
                    {installation.slack_team_name}
                  </span>
                </div>
                {installation.installed_by_name && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">
                      {t("slackApp.installedBy", "Installed by")}:
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {installation.installed_by_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Channel selection */}
              <div className="border-t border-foreground/[0.08] pt-3">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5 block">
                  {t("slackApp.channelSelection", "Notification Channel")}
                </label>
                {installation.default_channel_name ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Hash size={12} className="text-slate-500" />
                      <span className="text-[11px] text-foreground">
                        {installation.default_channel_name}
                      </span>
                    </div>
                    <button
                      onClick={handleLoadChannels}
                      disabled={isLoadingChannels}
                      className="text-[10px] text-bridge-accent hover:text-bridge-accent/80 transition-colors"
                    >
                      {isLoadingChannels ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        t("common.change", "Change")
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleLoadChannels}
                    disabled={isLoadingChannels}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-bridge-accent bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/20 transition-all"
                  >
                    {isLoadingChannels ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Hash size={11} />
                    )}
                    {t("slackApp.selectChannel", "Select Channel")}
                  </button>
                )}
              </div>

              {/* Channel picker */}
              {showChannelPicker && channels.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto custom-scrollbar bg-bridge-dark rounded-lg border border-foreground/10">
                  {channels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => handleSelectChannel(ch)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <Hash
                        size={11}
                        className="text-slate-500 flex-shrink-0"
                      />
                      <span className="truncate">{ch.name}</span>
                      {ch.is_private && (
                        <span className="text-[9px] text-slate-500">
                          &#x1f512;
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Personal Slack Account Link (for DM notifications) */}
              <div className="border-t border-foreground/[0.08] pt-3 mt-3">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5 block">
                  {t("slackApp.personalLink", "My Slack Account")}
                </label>
                {userLinkStatus?.linked ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <UserCheck size={12} className="text-green-400" />
                        <span className="text-[11px] text-foreground">
                          {userLinkStatus.slack_username ||
                            userLinkStatus.slack_user_id}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          ({t("slackApp.dmEnabled", "DM enabled")})
                        </span>
                      </div>
                      <button
                        onClick={handleUnlinkUser}
                        disabled={isUnlinking}
                        className="text-[10px] text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        {isUnlinking ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          t("slackApp.unlinkButton", "Unlink")
                        )}
                      </button>
                    </div>

                    {/* Test notification */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTestNotification}
                        disabled={isTesting}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-muted-foreground bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
                      >
                        {isTesting ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Send size={11} />
                        )}
                        {t("slackApp.testButton", "Send Test")}
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
                          ? t("slackApp.testSuccess", "Test message sent!")
                          : testResult.message}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      {t(
                        "slackApp.linkDesc",
                        "Link to receive DM notifications",
                      )}
                    </span>
                    <button
                      onClick={handleLinkUser}
                      disabled={isLinking}
                      className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-bridge-accent bg-bridge-accent/10 rounded-lg hover:bg-bridge-accent/20 transition-all disabled:opacity-50"
                    >
                      {isLinking ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Link2 size={10} />
                      )}
                      {t("slackApp.connectSlack", "Connect Slack")}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            // Not connected state
            <>
              <div className="text-center py-2">
                <p className="text-[11px] text-slate-400 mb-3">
                  {t(
                    "slackApp.installDesc",
                    "Connect BRIDGE directly to your Slack workspace with one click.",
                  )}
                </p>
                <button
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex items-center gap-2 mx-auto px-4 py-2 text-[11px] font-bold text-white bg-bridge-accent rounded-xl hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-50"
                >
                  {isInstalling ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ExternalLink size={13} />
                  )}
                  {t("slackApp.installButton", "Install to Slack")}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-1.5 mt-2 text-red-400 text-[11px]">
              <AlertCircle size={12} />
              {error}
            </div>
          )}
        </div>
      ) : (
        // Webhook tab - existing SlackSettingsPanel
        <SlackSettingsPanel
          boardId={boardId}
          onSlackStatusChange={onSlackStatusChange}
          canAccessSlack={canAccessSlack}
          onUpgrade={onUpgrade}
        />
      )}
    </div>
  );
}
