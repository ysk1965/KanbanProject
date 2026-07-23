import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  CheckCheck,
  Loader2,
  Activity,
  ChevronDown,
  AtSign,
  ClipboardList,
  MessageSquare,
  Settings,
  ChevronRight,
  Link2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { notificationAPI } from "../utils/api";
import { SlackIntegrationPanel } from "./slack/SlackIntegrationPanel";
import { DiscordSettingsPanel } from "./DiscordSettingsPanel";
import { JiraSettingsPanel } from "./JiraSettingsPanel";
import { AutoReportSettingsPanel } from "./AutoReportSettingsPanel";
import { McpConnectModal } from "./McpConnectModal";
import { NotificationPreferencesPanel } from "./NotificationPreferencesPanel";
import { StandupConfigPanel } from "./StandupConfigPanel";
import { NotificationItem, ActivityLog, NotificationType } from "../types";
import { Button } from "./ui/button";
import { getAssigneeClasses } from "../utils/assigneeColor";
import {
  formatDate,
  formatRelativeTime as dateUtilsFormatRelativeTime,
} from "../utils/dateUtils";
import { TFunction } from "i18next";

/** 활동로그 항목 클릭 시 이동할 대상 (부모에서 라우팅) */
export type ActivityNavTarget =
  | { kind: "task"; taskId: string; checklistItemId?: string }
  | { kind: "feature"; featureId: string };

/**
 * 활동로그 항목의 이동 대상을 해석한다.
 * - FEATURE 액션: target_id = feature id → 피처 모달
 * - TASK 액션(AI 체크리스트 생성 포함): target_id = task id → 태스크 모달
 * - CHECKLIST 액션: target_id = 체크리스트 항목 id, metadata.taskId = 부모 태스크 id
 * - 삭제/영구삭제 및 블록 액션은 이동 대상 없음(null)
 */
export function getActivityNavTarget(
  activity: ActivityLog,
): ActivityNavTarget | null {
  const action = activity.action as string;
  const targetId = activity.target_id;
  const targetType = activity.target_type;
  const metadata = (activity.metadata || {}) as Record<string, unknown>;

  if (!targetId) return null;
  // 삭제/영구삭제된 대상은 열 수 없음
  if (action.endsWith("_DELETED")) return null;

  switch (targetType) {
    case "FEATURE":
      return { kind: "feature", featureId: targetId };
    case "TASK":
      return { kind: "task", taskId: targetId };
    case "CHECKLIST": {
      const taskId = metadata.taskId as string | undefined;
      // 구버전 로그(taskId 없음)는 이동 불가
      if (!taskId) return null;
      return { kind: "task", taskId, checklistItemId: targetId };
    }
    default:
      return null; // BLOCK 등은 이동 대상 없음
  }
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "COMMENT_MENTION":
      return <AtSign size={14} className="text-bridge-accent" />;
    case "CHECKLIST_ASSIGNED":
      return <ClipboardList size={14} className="text-bridge-secondary" />;
    case "TASK_COMMENT":
      return <MessageSquare size={14} className="text-amber-400" />;
    default:
      return <Bell size={14} className="text-slate-400" />;
  }
}

function getTimeAgo(dateStr: string, t: TFunction) {
  const date = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return t("notification.justNow");
  if (diffMins < 60) return t("notification.minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("notification.hoursAgo", { count: diffHours });
  if (diffDays < 7) return t("notification.daysAgo", { count: diffDays });

  return formatDate(dateStr, "yyyy-MM-dd");
}

function getActionText(activity: ActivityLog, t: TFunction) {
  const { action, user, metadata } = activity;

  switch (action) {
    case "BLOCK_CREATED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionBlockCreated")}
          </span>
          <span className="font-medium text-purple-400">
            {metadata.blockName as string}
          </span>
        </>
      );
    case "BLOCK_UPDATED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionBlockUpdated")}
          </span>
          <span className="font-medium text-purple-400">
            {metadata.blockName as string}
          </span>
        </>
      );
    case "BLOCK_DELETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionBlockDeleted")}
          </span>
          <span className="font-medium text-purple-400">
            {metadata.blockName as string}
          </span>
        </>
      );
    case "FEATURE_CREATED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionFeatureCreated")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.featureTitle as string}
          </span>
        </>
      );
    case "FEATURE_UPDATED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionFeatureUpdated")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.featureTitle as string}
          </span>
        </>
      );
    case "FEATURE_DELETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionFeatureDeleted")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.featureTitle as string}
          </span>
        </>
      );
    case "FEATURE_COMPLETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionFeatureCompleted")}
          </span>
          <span className="font-medium text-emerald-400">
            {metadata.featureTitle as string}
          </span>
        </>
      );
    case "TASK_CREATED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionTaskCreated")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.taskTitle as string}
          </span>
        </>
      );
    case "TASK_UPDATED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionTaskUpdated")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.taskTitle as string}
          </span>
        </>
      );
    case "TASK_DELETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionTaskDeleted")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.taskTitle as string}
          </span>
        </>
      );
    case "TASK_MOVED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionTaskMoved")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.taskTitle as string}
          </span>
          <span className="text-foreground/80"> </span>
          <span className="font-medium text-green-400">
            {metadata.fromBlock as string}
          </span>
          <span className="text-foreground/80"> → </span>
          <span className="font-medium text-green-400">
            {metadata.toBlock as string}
          </span>
        </>
      );
    case "TASK_COMPLETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionTaskCompleted")}
          </span>
          <span className="font-medium text-emerald-400">
            {metadata.taskTitle as string}
          </span>
        </>
      );
    case "CHECKLIST_CREATED":
      // AI 일괄 생성 경로: checklistTitle 없이 itemsCreated 개수만 존재
      if (!metadata.checklistTitle && metadata.itemsCreated) {
        return (
          <>
            <span className="font-medium text-foreground">{user.name}</span>
            <span className="text-foreground/80">
              {t("notification.activity.actionChecklistCreatedBulk", {
                count: Number(metadata.itemsCreated),
              })}
            </span>
          </>
        );
      }
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionChecklistCreated")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.checklistTitle as string}
          </span>
        </>
      );
    case "CHECKLIST_CHECKED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {metadata.isCompleted
              ? t("notification.activity.actionChecklistCompleted")
              : t("notification.activity.actionChecklistUncompleted")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.checklistTitle as string}
          </span>
        </>
      );
    case "TASK_FEATURE_MOVED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionTaskFeatureMoved")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.taskTitle as string}
          </span>
          <span className="text-foreground/80"> </span>
          <span className="font-medium text-green-400">
            {metadata.fromFeature as string}
          </span>
          <span className="text-foreground/80"> → </span>
          <span className="font-medium text-green-400">
            {metadata.toFeature as string}
          </span>
        </>
      );
    case "FEATURE_RESTORED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionFeatureRestored")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.featureTitle as string}
          </span>
        </>
      );
    case "TASK_RESTORED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionTaskRestored")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.taskTitle as string}
          </span>
        </>
      );
    case "CHECKLIST_MOVED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionChecklistMoved")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.checklistTitle as string}
          </span>
          <span className="text-foreground/80"> </span>
          <span className="font-medium text-green-400">
            {metadata.fromTask as string}
          </span>
          <span className="text-foreground/80"> → </span>
          <span className="font-medium text-green-400">
            {metadata.toTask as string}
          </span>
        </>
      );
    case "CHECKLIST_DELETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionChecklistDeleted")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.checklistTitle as string}
          </span>
        </>
      );
    case "CHECKLIST_RESTORED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionChecklistRestored")}
          </span>
          <span className="font-medium text-indigo-400">
            {metadata.checklistTitle as string}
          </span>
        </>
      );
    case "FEATURE_PERMANENTLY_DELETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionFeaturePermanentlyDeleted")}
          </span>
          <span className="font-medium text-slate-400">
            {metadata.featureTitle as string}
          </span>
        </>
      );
    case "TASK_PERMANENTLY_DELETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionTaskPermanentlyDeleted")}
          </span>
          <span className="font-medium text-slate-400">
            {metadata.taskTitle as string}
          </span>
        </>
      );
    case "CHECKLIST_PERMANENTLY_DELETED":
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionChecklistPermanentlyDeleted")}
          </span>
          <span className="font-medium text-slate-400">
            {metadata.checklistTitle as string}
          </span>
        </>
      );
    default:
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-foreground/80">
            {t("notification.activity.actionDefault")}
          </span>
        </>
      );
  }
}

interface NotificationDropdownProps {
  boardId: string;
  unreadCount: number;
  activities: ActivityLog[];
  hasMoreActivities: boolean;
  onLoadMoreActivities: () => Promise<void>;
  onNotificationClick: (notification: NotificationItem) => void;
  onActivityNavigate?: (target: ActivityNavTarget) => void;
  onUnreadCountChange: (count: number) => void;
  canAccessSlack?: boolean;
  canAccessDiscord?: boolean;
  onSlackUpgrade?: () => void;
  onDiscordUpgrade?: () => void;
  isAdmin?: boolean;
  isTester?: boolean;
}

export function NotificationDropdown({
  boardId,
  unreadCount,
  activities,
  hasMoreActivities,
  onLoadMoreActivities,
  onNotificationClick,
  onActivityNavigate,
  onUnreadCountChange,
  canAccessSlack = true,
  canAccessDiscord = true,
  onSlackUpgrade,
  onDiscordUpgrade,
  isAdmin = false,
  isTester = false,
}: NotificationDropdownProps) {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [slackConnected, setSlackConnected] = useState(false);
  const [discordConnected, setDiscordConnected] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "notifications" | "activity" | "settings"
  >("notifications");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingMoreActivities, setIsLoadingMoreActivities] = useState(false);
  const [settingsSubTab, setSettingsSubTab] = useState<
    "slack" | "discord" | "jira" | "report" | "mcp" | "preferences" | "standup"
  >("slack");
  const [mcpModalOpen, setMcpModalOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await notificationAPI.getNotifications({
        boardId,
        limit: 20,
      });
      setNotifications(response.notifications as unknown as NotificationItem[]);
      setCursor(response.next_cursor);
      setHasMore(response.has_more);
      onUnreadCountChange(response.unread_count);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, onUnreadCountChange]);

  const handleLoadMore = async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await notificationAPI.getNotifications({
        boardId,
        cursor,
        limit: 20,
      });
      setNotifications((prev) => [
        ...prev,
        ...(response.notifications as unknown as NotificationItem[]),
      ]);
      setCursor(response.next_cursor);
      setHasMore(response.has_more);
    } catch (error) {
      console.error("Failed to load more notifications:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead(boardId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onUnreadCountChange(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.read) {
      try {
        await notificationAPI.markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: true } : n,
          ),
        );
        onUnreadCountChange(Math.max(0, unreadCount - 1));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }
    onNotificationClick(notification);
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      fetchNotifications();
    }
  };

  const handleLoadMoreActivities = async () => {
    setIsLoadingMoreActivities(true);
    try {
      await onLoadMoreActivities();
    } catch (error) {
      console.error("Failed to load more activities:", error);
    } finally {
      setIsLoadingMoreActivities(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover rounded-lg transition-all"
          aria-label="알림"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] bg-bridge-obsidian border-bridge-border p-0 shadow-2xl"
        align="end"
        sideOffset={8}
      >
        {/* Tab Header */}
        <div className="flex border-b border-bridge-border">
          <button
            onClick={() => setActiveTab("notifications")}
            className={`flex-1 px-4 py-3 text-xs font-medium transition-colors relative ${
              activeTab === "notifications"
                ? "text-foreground"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            {t("notification.notifications")}
            {unreadCount > 0 && (
              <span className="ml-1.5 min-w-[16px] h-[16px] bg-red-500/20 text-red-400 text-xs font-bold rounded-full inline-flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
            {activeTab === "notifications" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-bridge-accent" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`flex-1 px-4 py-3 text-xs font-medium transition-colors relative ${
              activeTab === "activity"
                ? "text-foreground"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            {t("notification.activityLog")}
            {activeTab === "activity" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-bridge-accent" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex-1 px-4 py-3 text-xs font-medium transition-colors relative flex items-center justify-center gap-1 ${
              activeTab === "settings"
                ? "text-foreground"
                : "text-slate-400 hover:text-slate-300"
            }`}
          >
            <Settings size={12} />
            {t("notification.settings")}
            {activeTab === "settings" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-bridge-accent" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="max-h-[440px] overflow-y-auto custom-scrollbar">
          {activeTab === "notifications" ? (
            <>
              {/* Integration Connection Status */}
              {(canAccessSlack || canAccessDiscord) && (
                <button
                  onClick={() => setActiveTab("settings")}
                  className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-foreground/[0.08] hover:bg-foreground/5 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {canAccessSlack && (
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${slackConnected ? "bg-emerald-400" : "bg-slate-500"}`}
                        />
                        <span
                          className={`text-xs ${slackConnected ? "text-foreground" : "text-slate-500"}`}
                        >
                          Slack
                        </span>
                      </div>
                    )}
                    {canAccessDiscord && (
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${discordConnected ? "bg-emerald-400" : "bg-slate-500"}`}
                        />
                        <span
                          className={`text-xs ${discordConnected ? "text-foreground" : "text-slate-500"}`}
                        >
                          Discord
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={12} className="text-slate-500 shrink-0" />
                </button>
              )}

              {/* Notifications Header with Mark All Read */}
              {notifications.length > 0 && unreadCount > 0 && (
                <div className="flex items-center justify-end px-4 py-2 border-b border-bridge-border">
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors"
                  >
                    <CheckCheck size={12} />
                    {t("notification.markAllRead")}
                  </button>
                </div>
              )}

              {/* Notifications List */}
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Bell className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs">{t("notification.noNotifications")}</p>
                </div>
              ) : (
                <div>
                  {notifications.map((notification) => {
                    const senderName = notification.sender?.name || "?";
                    const color = getAssigneeClasses(senderName);
                    return (
                      <div
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`flex gap-2.5 px-4 py-3 cursor-pointer transition-colors hover:bg-foreground/5 ${
                          !notification.read
                            ? "bg-indigo-500/5 border-l-2 border-indigo-500"
                            : "border-l-2 border-transparent"
                        }`}
                      >
                        {/* Avatar */}
                        <div className="flex-shrink-0 relative">
                          {notification.sender?.profile_image ? (
                            <img
                              src={notification.sender.profile_image}
                              alt={senderName}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div
                              className={`w-8 h-8 rounded-full ${color.bg} flex items-center justify-center text-white text-xs font-medium`}
                            >
                              {senderName[0]?.toUpperCase() || "?"}
                            </div>
                          )}
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-bridge-obsidian flex items-center justify-center">
                            {getNotificationIcon(notification.type)}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground leading-snug">
                            {notification.title}
                          </p>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {notification.message}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {getTimeAgo(notification.created_at, t)}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More Button */}
                  {hasMore && (
                    <div className="px-4 py-2 border-t border-bridge-border">
                      <Button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        variant="ghost"
                        className="w-full text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 h-8"
                      >
                        {isLoadingMore ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <ChevronDown className="h-3 w-3 mr-1" />
                        )}
                        {t("common.loadMore")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : activeTab === "activity" ? (
            /* Activity Log Tab */
            <>
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Activity className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs">{t("notification.noActivity")}</p>
                </div>
              ) : (
                <div>
                  {activities.map((activity) => {
                    const activityUserName = activity.user?.name || "?";
                    const activityColor = getAssigneeClasses(activityUserName);
                    const navTarget = getActivityNavTarget(activity);
                    const clickable = !!navTarget && !!onActivityNavigate;
                    const taskTitle = (
                      activity.metadata as Record<string, unknown>
                    )?.taskTitle as string | undefined;
                    const isChecklist = (activity.action as string).startsWith(
                      "CHECKLIST_",
                    );
                    const handleNavigate = () => {
                      if (!clickable) return;
                      onActivityNavigate!(navTarget!);
                      setIsOpen(false);
                    };
                    return (
                      <div
                        key={activity.id}
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? handleNavigate : undefined}
                        onKeyDown={
                          clickable
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleNavigate();
                                }
                              }
                            : undefined
                        }
                        className={`group flex gap-2.5 px-4 py-3 border-l-2 border-transparent transition-colors ${
                          clickable
                            ? "cursor-pointer hover:bg-foreground/5 focus:outline-none focus-visible:bg-bridge-accent/10 focus-visible:border-l-bridge-accent"
                            : ""
                        }`}
                      >
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {activity.user?.profile_image ? (
                            <img
                              src={activity.user.profile_image}
                              alt={activityUserName}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div
                              className={`w-8 h-8 rounded-full ${activityColor.bg} flex items-center justify-center text-white text-xs font-medium`}
                            >
                              {activityUserName[0]?.toUpperCase() || "?"}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs leading-snug">
                            {getActionText(activity, t)}
                          </div>
                          {/* 체크리스트 항목의 소속 태스크 표시 */}
                          {isChecklist && taskTitle && (
                            <div
                              className={`mt-1.5 inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-lg bg-bridge-surface border transition-colors ${
                                clickable
                                  ? "border-foreground/[0.08] group-hover:border-bridge-accent/40"
                                  : "border-foreground/[0.08]"
                              }`}
                            >
                              <ClipboardList
                                size={11}
                                className="text-slate-400 shrink-0"
                              />
                              <span className="text-xs text-slate-300 font-medium truncate">
                                {taskTitle}
                              </span>
                              {clickable && (
                                <ChevronRight
                                  size={11}
                                  className="text-slate-500 group-hover:text-bridge-accent shrink-0 transition-colors"
                                />
                              )}
                            </div>
                          )}
                          <p className="text-xs text-slate-400 mt-1">
                            {getTimeAgo(activity.created_at, t)}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More Activities Button */}
                  {hasMoreActivities && (
                    <div className="px-4 py-2 border-t border-bridge-border">
                      <Button
                        onClick={handleLoadMoreActivities}
                        disabled={isLoadingMoreActivities}
                        variant="ghost"
                        className="w-full text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 h-8"
                      >
                        {isLoadingMoreActivities ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <ChevronDown className="h-3 w-3 mr-1" />
                        )}
                        {t("common.loadMore")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Settings Tab */
            <>
              {/* Sub-tab navigation */}
              <div className="flex items-center gap-1 px-3 pt-3 pb-2">
                <button
                  onClick={() => setSettingsSubTab("slack")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    settingsSubTab === "slack"
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    Slack
                    {slackConnected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </span>
                </button>
                <button
                  onClick={() => setSettingsSubTab("discord")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    settingsSubTab === "discord"
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    Discord
                    {discordConnected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </span>
                </button>
                <button
                  onClick={() => setSettingsSubTab("jira")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    settingsSubTab === "jira"
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    JIRA
                    {jiraConnected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </span>
                </button>
                <button
                  onClick={() => setSettingsSubTab("report")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    settingsSubTab === "report"
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  보고서
                </button>
                <button
                  onClick={() => setSettingsSubTab("mcp")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    settingsSubTab === "mcp"
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  MCP
                </button>
                <button
                  onClick={() => setSettingsSubTab("preferences")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                    settingsSubTab === "preferences"
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {t("notification.settingsPreferences")}
                </button>
                {isAdmin && !isTester && (
                  <button
                    onClick={() => setSettingsSubTab("standup")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      settingsSubTab === "standup"
                        ? "bg-bridge-accent/15 text-bridge-accent"
                        : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {t("notification.settingsOther")}
                  </button>
                )}
              </div>

              {/* Sub-tab content */}
              <div className="px-3 pb-3">
                {settingsSubTab === "slack" && (
                  <SlackIntegrationPanel
                    boardId={boardId}
                    onSlackStatusChange={setSlackConnected}
                    canAccessSlack={canAccessSlack}
                    onUpgrade={onSlackUpgrade}
                    canManage={isAdmin}
                  />
                )}
                {settingsSubTab === "discord" && (
                  <DiscordSettingsPanel
                    boardId={boardId}
                    onDiscordStatusChange={setDiscordConnected}
                    canAccessDiscord={canAccessDiscord}
                    onUpgrade={onDiscordUpgrade || onSlackUpgrade}
                  />
                )}
                {settingsSubTab === "jira" && (
                  <JiraSettingsPanel
                    boardId={boardId}
                    onJiraStatusChange={setJiraConnected}
                  />
                )}
                {settingsSubTab === "report" && (
                  <AutoReportSettingsPanel
                    boardId={boardId}
                    canManage={isAdmin}
                  />
                )}
                {settingsSubTab === "mcp" && (
                  <div className="py-2">
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      {t(
                        "mcp.panelIntro",
                        "Claude 등 AI 어시스턴트가 만든 문서를 이 보드에 저장·공유하도록 연결합니다.",
                      )}
                    </p>
                    <button
                      onClick={() => setMcpModalOpen(true)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all"
                    >
                      <Link2 className="w-4 h-4" />
                      {t("mcp.openBtn", "MCP 연결하기")}
                    </button>
                  </div>
                )}
                {settingsSubTab === "preferences" && (
                  <NotificationPreferencesPanel
                    boardId={boardId}
                    hasSlack={slackConnected}
                    hasDiscord={discordConnected}
                  />
                )}
                {settingsSubTab === "standup" && (
                  <StandupConfigPanel
                    boardId={boardId}
                    isAdmin={isAdmin}
                    canAccessSlack={canAccessSlack}
                    hasSlack={slackConnected}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
      <McpConnectModal
        open={mcpModalOpen}
        onClose={() => setMcpModalOpen(false)}
        boardId={boardId}
      />
    </Popover>
  );
}
