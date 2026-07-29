import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { notificationAPI } from "../../utils/api";
import { formatRelativeTime } from "../../utils/dateUtils";
import { getAssigneeHex, getInitials } from "../../utils/assigneeColor";
import { DashboardCard, DashboardEmpty } from "./DashboardCard";

const MAX_ITEMS = 4;

interface MentionItem {
  id: string;
  title: string;
  message: string;
  senderName: string;
  createdAt: string;
  read: boolean;
  taskId: string | null;
}

interface MentionsWidgetProps {
  boardId: string;
  /** 알림의 태스크로 이동 */
  onOpenTask?: (taskId: string) => void;
}

/** 나를 부른 것들 — 이 보드의 멘션·배정·댓글 알림. */
export function MentionsWidget({ boardId, onOpenTask }: MentionsWidgetProps) {
  const { t } = useTranslation();

  const [items, setItems] = useState<MentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(() => {
    if (!boardId) {
      setIsLoading(false);
      return () => {};
    }
    let cancelled = false;
    setIsLoading(true);
    notificationAPI
      .getNotifications({ boardId, limit: 10 })
      .then((res) => {
        if (cancelled) return;
        setUnreadCount(res.unread_count ?? 0);
        setItems(
          (res.notifications ?? []).slice(0, MAX_ITEMS).map((n) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            senderName: n.sender?.name ?? "?",
            createdAt: n.created_at,
            read: n.read,
            taskId: n.task_id,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  useEffect(() => load(), [load]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await notificationAPI.markAllAsRead(boardId);
      setUnreadCount(0);
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    } catch {
      // 실패해도 목록은 그대로 둔다 — 다음 로드에서 정정된다
    }
  }, [boardId]);

  return (
    <DashboardCard
      title={t("boardDashboard.mentionsTitle", "나를 부른 것들")}
      subtitle={unreadCount > 0 ? String(unreadCount) : undefined}
      isLoading={isLoading}
      headerExtra={
        unreadCount > 0 ? (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-slate-400 hover:text-foreground transition-colors"
          >
            {t("boardDashboard.markAllRead", "모두 읽음")}
          </button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <DashboardEmpty
          message={t("boardDashboard.mentionsEmpty", "새로운 알림이 없습니다.")}
        />
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const clickable = !!item.taskId && !!onOpenTask;
            const Wrapper = clickable ? "button" : "div";
            return (
              <li
                key={item.id}
                className="border-t border-foreground/[0.08] first:border-t-0"
              >
                <Wrapper
                  {...(clickable
                    ? {
                        type: "button" as const,
                        onClick: () => onOpenTask?.(item.taskId as string),
                      }
                    : {})}
                  className={`flex items-start gap-2.5 w-full text-left py-2.5 ${
                    clickable ? "group" : ""
                  }`}
                >
                  <span
                    className="flex-none w-5 h-5 rounded-full grid place-items-center text-xs font-bold text-white"
                    style={{ backgroundColor: getAssigneeHex(item.senderName) }}
                  >
                    {getInitials(item.senderName)}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block text-xs leading-snug line-clamp-2 ${
                        item.read
                          ? "text-slate-400"
                          : "text-foreground font-medium"
                      } ${clickable ? "group-hover:underline" : ""}`}
                    >
                      {item.message || item.title}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </span>
                  {!item.read && (
                    <span className="ml-auto mt-1 flex-none w-1.5 h-1.5 rounded-full bg-bridge-accent" />
                  )}
                </Wrapper>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
