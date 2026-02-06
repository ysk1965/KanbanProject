import { useState, useCallback } from 'react';
import { Bell, CheckCheck, Loader2, Activity, ChevronDown, AtSign, ClipboardList, MessageSquare } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { notificationAPI } from '../utils/api';
import { SlackSettingsPanel } from './SlackSettingsPanel';
import { NotificationPreferencesPanel } from './NotificationPreferencesPanel';
import { NotificationItem, ActivityLog, NotificationType } from '../types';
import { Button } from './ui/button';
import { getAssigneeClasses } from '../utils/assigneeColor';
import { formatDate, formatRelativeTime as dateUtilsFormatRelativeTime } from '../utils/dateUtils';

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'COMMENT_MENTION':
      return <AtSign size={14} className="text-bridge-accent" />;
    case 'CHECKLIST_ASSIGNED':
      return <ClipboardList size={14} className="text-bridge-secondary" />;
    case 'TASK_COMMENT':
      return <MessageSquare size={14} className="text-amber-400" />;
    default:
      return <Bell size={14} className="text-slate-400" />;
  }
}

function getTimeAgo(dateStr: string) {
  const date = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return '방금 전';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  return formatDate(dateStr, 'yyyy-MM-dd');
}

function getActionText(activity: ActivityLog) {
  const { action, user, metadata } = activity;

  switch (action) {
    case 'BLOCK_CREATED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 블록 </span>
          <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
          <span className="text-zinc-300">을 생성했습니다</span>
        </>
      );
    case 'BLOCK_UPDATED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 블록 </span>
          <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
          <span className="text-zinc-300">을 수정했습니다</span>
        </>
      );
    case 'BLOCK_DELETED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 블록 </span>
          <span className="font-medium text-purple-400">{metadata.blockName as string}</span>
          <span className="text-zinc-300">을 삭제했습니다</span>
        </>
      );
    case 'FEATURE_CREATED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 Feature </span>
          <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
          <span className="text-zinc-300">를 생성했습니다</span>
        </>
      );
    case 'FEATURE_UPDATED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 Feature </span>
          <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
          <span className="text-zinc-300">를 수정했습니다</span>
        </>
      );
    case 'FEATURE_DELETED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 Feature </span>
          <span className="font-medium text-indigo-400">{metadata.featureTitle as string}</span>
          <span className="text-zinc-300">를 삭제했습니다</span>
        </>
      );
    case 'FEATURE_COMPLETED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 Feature </span>
          <span className="font-medium text-emerald-400">{metadata.featureTitle as string}</span>
          <span className="text-zinc-300">를 완료했습니다</span>
        </>
      );
    case 'TASK_CREATED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 Task </span>
          <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
          <span className="text-zinc-300">를 생성했습니다</span>
        </>
      );
    case 'TASK_UPDATED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 Task </span>
          <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
          <span className="text-zinc-300">를 수정했습니다</span>
        </>
      );
    case 'TASK_DELETED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 Task </span>
          <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
          <span className="text-zinc-300">를 삭제했습니다</span>
        </>
      );
    case 'TASK_MOVED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 </span>
          <span className="font-medium text-indigo-400">{metadata.taskTitle as string}</span>
          <span className="text-zinc-300">를 </span>
          <span className="font-medium text-green-400">{metadata.fromBlock as string}</span>
          <span className="text-zinc-300">에서 </span>
          <span className="font-medium text-green-400">{metadata.toBlock as string}</span>
          <span className="text-zinc-300">로 이동했습니다</span>
        </>
      );
    case 'TASK_COMPLETED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 Task </span>
          <span className="font-medium text-emerald-400">{metadata.taskTitle as string}</span>
          <span className="text-zinc-300">를 완료했습니다</span>
        </>
      );
    case 'CHECKLIST_CREATED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 체크리스트 </span>
          <span className="font-medium text-indigo-400">{metadata.checklistTitle as string}</span>
          <span className="text-zinc-300">를 생성했습니다</span>
        </>
      );
    case 'CHECKLIST_CHECKED':
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 체크리스트 </span>
          <span className="font-medium text-indigo-400">{metadata.checklistTitle as string}</span>
          <span className="text-zinc-300">를 {metadata.isCompleted ? '완료' : '미완료'}했습니다</span>
        </>
      );
    default:
      return (
        <>
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="text-zinc-300">님이 작업을 수행했습니다</span>
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
  onUnreadCountChange: (count: number) => void;
}

export function NotificationDropdown({
  boardId,
  unreadCount,
  activities,
  hasMoreActivities,
  onLoadMoreActivities,
  onNotificationClick,
  onUnreadCountChange,
}: NotificationDropdownProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'activity'>('notifications');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingMoreActivities, setIsLoadingMoreActivities] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await notificationAPI.getNotifications({ limit: 20 });
      setNotifications(response.notifications as unknown as NotificationItem[]);
      setCursor(response.next_cursor);
      setHasMore(response.has_more);
      onUnreadCountChange(response.unread_count);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [onUnreadCountChange]);

  const handleLoadMore = async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await notificationAPI.getNotifications({ cursor, limit: 20 });
      setNotifications(prev => [...prev, ...(response.notifications as unknown as NotificationItem[])]);
      setCursor(response.next_cursor);
      setHasMore(response.has_more);
    } catch (error) {
      console.error('Failed to load more notifications:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      onUnreadCountChange(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    if (!notification.read) {
      try {
        await notificationAPI.markAsRead(notification.id);
        setNotifications(prev =>
          prev.map(n => (n.id === notification.id ? { ...n, read: true } : n))
        );
        onUnreadCountChange(Math.max(0, unreadCount - 1));
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
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
      console.error('Failed to load more activities:', error);
    } finally {
      setIsLoadingMoreActivities(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-kanban-surface rounded-lg transition-all"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] bg-bridge-obsidian border-white/20 p-0 shadow-2xl"
        align="end"
        sideOffset={8}
      >
        {/* Tab Header */}
        <div className="flex border-b border-white/15">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex-1 px-4 py-3 text-xs font-medium transition-colors relative ${
              activeTab === 'notifications'
                ? 'text-foreground'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            알림
            {unreadCount > 0 && (
              <span className="ml-1.5 min-w-[16px] h-[16px] bg-red-500/20 text-red-400 text-[10px] font-bold rounded-full inline-flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
            {activeTab === 'notifications' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-bridge-accent" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex-1 px-4 py-3 text-xs font-medium transition-colors relative ${
              activeTab === 'activity'
                ? 'text-foreground'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            활동로그
            {activeTab === 'activity' && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-bridge-accent" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="max-h-[440px] overflow-y-auto">
          {activeTab === 'notifications' ? (
            <>
              {/* Slack Integration Banner */}
              <SlackSettingsPanel boardId={boardId} />

              {/* Notification Preferences */}
              <NotificationPreferencesPanel boardId={boardId} />

              {/* Notifications Header with Mark All Read */}
              {notifications.length > 0 && unreadCount > 0 && (
                <div className="flex items-center justify-end px-4 py-2 border-b border-white/20">
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors"
                  >
                    <CheckCheck size={12} />
                    모두 읽음
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
                  <p className="text-xs">새로운 알림이 없습니다</p>
                </div>
              ) : (
                <div>
                  {notifications.map((notification) => {
                    const senderName = notification.sender?.name || '?';
                    const color = getAssigneeClasses(senderName);
                    return (
                      <div
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`flex gap-2.5 px-4 py-3 cursor-pointer transition-colors hover:bg-white/5 ${
                          !notification.read
                            ? 'bg-indigo-500/5 border-l-2 border-indigo-500'
                            : 'border-l-2 border-transparent'
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
                              {senderName[0]?.toUpperCase() || '?'}
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
                          <p className="text-[10px] text-slate-400 mt-1">
                            {getTimeAgo(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More Button */}
                  {hasMore && (
                    <div className="px-4 py-2 border-t border-white/20">
                      <Button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        variant="ghost"
                        className="w-full text-xs text-slate-400 hover:text-foreground hover:bg-white/5 h-8"
                      >
                        {isLoadingMore ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <ChevronDown className="h-3 w-3 mr-1" />
                        )}
                        더 보기
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Activity Log Tab */
            <>
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Activity className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs">아직 활동 기록이 없습니다</p>
                </div>
              ) : (
                <div>
                  {activities.map((activity) => {
                    const activityUserName = activity.user?.name || '?';
                    const activityColor = getAssigneeClasses(activityUserName);
                    return (
                      <div
                        key={activity.id}
                        className="flex gap-2.5 px-4 py-3 border-l-2 border-transparent hover:bg-white/5 transition-colors"
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
                              {activityUserName[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs leading-snug">
                            {getActionText(activity)}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {getTimeAgo(activity.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More Activities Button */}
                  {hasMoreActivities && (
                    <div className="px-4 py-2 border-t border-white/20">
                      <Button
                        onClick={handleLoadMoreActivities}
                        disabled={isLoadingMoreActivities}
                        variant="ghost"
                        className="w-full text-xs text-slate-400 hover:text-foreground hover:bg-white/5 h-8"
                      >
                        {isLoadingMoreActivities ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <ChevronDown className="h-3 w-3 mr-1" />
                        )}
                        더 보기
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
