import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cake,
  PartyPopper,
  Pin,
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
  Rss,
  MessageCircle,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  anniversaryService,
  orgAnnouncementService,
} from "../../utils/services";
import { resolveFileUrl } from "../../utils/api";
import { formatRelativeTime } from "../../utils/dateUtils";
import { useAuth } from "../../contexts/AuthContext";
import type {
  AnniversaryItem,
  AnniversaryType,
  CelebrationMessage,
  OrgAnnouncement,
  OrgAnnouncementComment,
  OrgRole,
} from "../../types";

/* ── Feed item union ── */
type FeedItem =
  | {
      id: string;
      kind: "anniversary";
      data: AnniversaryItem;
      isToday: boolean;
    }
  | { id: string; kind: "announcement"; data: OrgAnnouncement };

type FeedFilter = "all" | "anniversary" | "announcement";

interface Props {
  orgId: string;
  role: OrgRole;
  onOpenCelebration: (
    memberId: string,
    memberName: string,
    type: AnniversaryType,
    date: string,
  ) => void;
  onCreateAnnouncement: () => void;
  onEditAnnouncement: (a: OrgAnnouncement) => void;
  onViewAllAnnouncements: () => void;
  refreshKey?: number;
}

/* ── D-day helper ── */
function getDday(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [, m, d] = dateStr.split("-").map(Number);
  const target = new Date(today.getFullYear(), m - 1, d);
  if (target < today) target.setFullYear(target.getFullYear() + 1);
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

/* ══════════════════════════════════════════════════════════════
   OrgFeedSection — Scrollable feed with content + comments
   ══════════════════════════════════════════════════════════════ */
export function OrgFeedSection({
  orgId,
  role,
  onOpenCelebration,
  onCreateAnnouncement,
  onEditAnnouncement,
  onViewAllAnnouncements,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [hasMoreAnnouncements, setHasMoreAnnouncements] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isAdmin = role === "OWNER" || role === "ADMIN";

  /* ── Fetch data ── */
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [annivData, announcementData] = await Promise.all([
          anniversaryService.getUpcoming(orgId, "THIS_MONTH"),
          orgAnnouncementService.list(orgId, { limit: 10 }),
        ]);

        const items: FeedItem[] = [];

        (annivData.today || []).forEach((a) =>
          items.push({
            id: `anniv-${a.member_id}-${a.type}-today`,
            kind: "anniversary",
            data: a,
            isToday: true,
          }),
        );
        (annivData.this_week || []).forEach((a) =>
          items.push({
            id: `anniv-${a.member_id}-${a.type}-week`,
            kind: "anniversary",
            data: a,
            isToday: false,
          }),
        );
        (annivData.this_month || []).forEach((a) =>
          items.push({
            id: `anniv-${a.member_id}-${a.type}-month`,
            kind: "anniversary",
            data: a,
            isToday: false,
          }),
        );

        (announcementData.announcements || []).forEach((a) =>
          items.push({
            id: `announce-${a.id}`,
            kind: "announcement",
            data: a,
          }),
        );

        items.sort((a, b) => {
          const scoreA =
            a.kind === "announcement" && a.data.is_pinned
              ? 3
              : a.kind === "anniversary" && a.isToday
                ? 2
                : 0;
          const scoreB =
            b.kind === "announcement" && b.data.is_pinned
              ? 3
              : b.kind === "anniversary" && b.isToday
                ? 2
                : 0;
          return scoreB - scoreA;
        });

        setFeedItems(items);
        setHasMoreAnnouncements(announcementData.has_more);
        setNextCursor(announcementData.next_cursor);
      } catch {
        // optional
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [orgId, refreshKey]);

  /* ── Load more announcements (infinite scroll) ── */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMoreAnnouncements || !nextCursor) return;
    try {
      setLoadingMore(true);
      const data = await orgAnnouncementService.list(orgId, {
        cursor: nextCursor,
        limit: 10,
      });
      const newItems: FeedItem[] = (data.announcements || []).map((a) => ({
        id: `announce-${a.id}`,
        kind: "announcement" as const,
        data: a,
      }));
      setFeedItems((prev) => [...prev, ...newItems]);
      setHasMoreAnnouncements(data.has_more);
      setNextCursor(data.next_cursor);
    } catch {
      // silently fail, user can scroll again to retry
    } finally {
      setLoadingMore(false);
    }
  }, [orgId, nextCursor, hasMoreAnnouncements, loadingMore]);

  /* ── IntersectionObserver for sentinel ── */
  useEffect(() => {
    if (!hasMoreAnnouncements || filter === "anniversary") return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreAnnouncements, filter, loadMore]);

  const filtered = feedItems.filter((item) => {
    if (filter === "all") return true;
    return item.kind === filter;
  });

  /* ── Announcement actions ── */
  const handleDeleteAnnouncement = async (id: string) => {
    if (
      !confirm(
        t(
          "organization.announcement.deleteConfirm",
          "Delete this announcement?",
        ),
      )
    )
      return;
    try {
      await orgAnnouncementService.delete(orgId, id);
      setFeedItems((prev) =>
        prev.filter(
          (item) =>
            !(item.kind === "announcement" && item.data.id === id),
        ),
      );
    } catch {
      toast.error(
        t(
          "organization.announcement.deleteError",
          "Failed to delete announcement",
        ),
      );
    }
  };

  const handleTogglePin = async (id: string) => {
    try {
      const updated = await orgAnnouncementService.togglePin(orgId, id);
      setFeedItems((prev) =>
        prev.map((item) =>
          item.kind === "announcement" && item.data.id === id
            ? { ...item, data: updated }
            : item,
        ),
      );
    } catch {
      /* */
    }
  };

  const handleCommentCountChange = (announcementId: string, delta: number) => {
    setFeedItems((prev) =>
      prev.map((item) =>
        item.kind === "announcement" && item.data.id === announcementId
          ? {
              ...item,
              data: {
                ...item.data,
                comment_count: Math.max(
                  0,
                  (item.data.comment_count || 0) + delta,
                ),
              },
            }
          : item,
      ),
    );
  };

  const anniversaryCount = feedItems.filter(
    (i) => i.kind === "anniversary",
  ).length;
  const announcementCount = feedItems.filter(
    (i) => i.kind === "announcement",
  ).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-12 text-center">
        <div className="w-14 h-14 rounded-xl bg-bridge-accent/15 flex items-center justify-center mx-auto mb-4">
          <Rss size={28} className="text-bridge-accent/60" />
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          {t("organization.feed.empty", "No updates yet")}
        </p>
        {isAdmin && (
          <button
            onClick={onCreateAnnouncement}
            className="mt-3 flex items-center gap-1.5 text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 px-3 py-1.5 rounded-lg transition-colors mx-auto"
          >
            <Plus size={13} />
            {t("organization.dashboard.newAnnouncement", "New")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Rss size={14} className="text-bridge-accent" />
          <h3 className="text-sm font-bold text-foreground">
            {t("organization.feed.title", "Feed")}
          </h3>
          <span className="text-xs font-bold text-bridge-accent bg-bridge-accent/15 px-1.5 py-0.5 rounded-full">
            {filtered.length}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={onCreateAnnouncement}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} />
            {t("organization.dashboard.newAnnouncement", "새 공지")}
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-3">
        {(
          [
            { key: "all" as FeedFilter, label: t("organization.feed.all", "전체"), count: feedItems.length },
            { key: "anniversary" as FeedFilter, label: t("organization.feed.anniversaries", "기념일"), count: anniversaryCount },
            { key: "announcement" as FeedFilter, label: t("organization.feed.announcements", "공지"), count: announcementCount },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-all ${
              filter === tab.key
                ? "bg-bridge-accent/15 text-bridge-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-xs opacity-60">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Feed list */}
      {filtered.length === 0 ? (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("organization.feed.noItems", "이 카테고리에 항목이 없습니다")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 10) * 0.04 }}
            >
              {item.kind === "anniversary" && (
                <AnniversaryCard
                  orgId={orgId}
                  item={item.data}
                  isToday={item.isToday}
                  onCelebrate={onOpenCelebration}
                />
              )}
              {item.kind === "announcement" && (
                <AnnouncementCard
                  orgId={orgId}
                  item={item.data}
                  isAdmin={isAdmin}
                  onEdit={onEditAnnouncement}
                  onDelete={handleDeleteAnnouncement}
                  onTogglePin={handleTogglePin}
                  onViewAll={onViewAllAnnouncements}
                  onCommentCountChange={handleCommentCountChange}
                />
              )}
            </motion.div>
          ))}
          {/* Sentinel for infinite scroll */}
          {hasMoreAnnouncements && filter !== "anniversary" && (
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && (
                <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Anniversary Card — Rich card with inline celebration messages
   ══════════════════════════════════════════════════════════════ */
function AnniversaryCard({
  orgId,
  item,
  isToday,
  onCelebrate,
}: {
  orgId: string;
  item: AnniversaryItem;
  isToday: boolean;
  onCelebrate: (
    memberId: string,
    memberName: string,
    type: AnniversaryType,
    date: string,
  ) => void;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const isBirthday = item.type === "BIRTHDAY";
  const Icon = isBirthday ? Cake : PartyPopper;
  const typeLabel = isBirthday
    ? t("organization.anniversary.birthday", "Birthday")
    : item.years
      ? t("organization.anniversary.hireAnniversary", "{{years}} Year Work Anniversary", { years: String(item.years) })
      : t("organization.anniversary.hireAnniversaryNoYears", "Work Anniversary");

  const celebTitle = isBirthday
    ? t("organization.anniversary.celebrationTitle_BIRTHDAY", "{{name}}님의 생일을 축하합니다!", { name: item.member_name })
    : item.years
      ? t("organization.anniversary.celebrationTitle_HIRE_ANNIVERSARY", "{{name}}님의 입사 {{years}}주년을 축하합니다!", { name: item.member_name, years: String(item.years) })
      : t("organization.anniversary.celebrationTitle_HIRE_ANNIVERSARY_NO_YEARS", "{{name}}님의 입사 기념일을 축하합니다!", { name: item.member_name });

  const dateStr = (() => {
    const [, m, d] = item.date.split("-");
    return `${parseInt(m)}/${parseInt(d)}`;
  })();

  const dday = getDday(item.date);
  const ddayLabel = dday === 0 ? "D-Day" : `D-${dday}`;

  // States for inline messages
  const [showMessages, setShowMessages] = useState(false);
  const [messages, setMessages] = useState<CelebrationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [localMessageCount, setLocalMessageCount] = useState(item.message_count || 0);

  const loadMessages = async () => {
    try {
      setLoadingMessages(true);
      const data = await anniversaryService.getMessages(orgId, item.member_id, {
        type: item.type,
        date: item.date,
      });
      setMessages(data.messages || []);
      setLocalMessageCount(data.messages?.length || 0);
    } catch {
      // optional
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleToggleMessages = () => {
    if (!showMessages) loadMessages();
    setShowMessages(!showMessages);
  };

  const handleSubmitMessage = async () => {
    const text = messageText.trim();
    if (!text || submitting) return;
    try {
      setSubmitting(true);
      setSendError(null);
      await anniversaryService.createMessage(orgId, item.member_id, {
        type: item.type,
        date: item.date,
        message: text,
      });
      setMessageText("");
      setLocalMessageCount((c) => c + 1);
      await loadMessages();
    } catch (err: any) {
      if (err?.code === "CB001") {
        setSendError(t("organization.anniversary.duplicateMessage", "이미 축하 메시지를 보냈습니다"));
      } else {
        setSendError(t("common.error", "An error occurred"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Theme colors
  const ringColor = isBirthday ? "ring-pink-400/40" : "ring-amber-400/40";
  const iconBg = isBirthday ? "bg-pink-500/15" : "bg-amber-500/15";
  const iconColor = isBirthday ? "text-pink-500" : "text-amber-500";
  const ddayBg = isToday
    ? "bg-bridge-accent text-white"
    : isBirthday
      ? "bg-pink-500/15 text-pink-600 dark:text-pink-400"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  const accentGradient = isBirthday
    ? "from-pink-500/60 via-rose-400/40 to-transparent"
    : "from-amber-500/60 via-orange-400/40 to-transparent";
  const bgGradient = isBirthday
    ? "from-pink-500/8 via-rose-500/4 to-transparent"
    : "from-amber-500/8 via-orange-500/4 to-transparent";

  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] hover:border-foreground/[0.12] overflow-hidden transition-colors">
      {/* Top accent line */}
      <div className={`h-[2px] bg-gradient-to-r ${accentGradient}`} />

      {/* Main content area */}
      <div className={`relative bg-gradient-to-br ${bgGradient}`}>
        {/* Decorative dots */}
        <div className={`absolute top-3 right-4 w-1.5 h-1.5 rounded-full ${iconBg} opacity-40`} />
        <div className={`absolute top-6 right-7 w-1 h-1 rounded-full ${iconBg} opacity-30`} />
        <div className={`absolute bottom-4 right-12 w-1 h-1 rounded-full ${iconBg} opacity-20`} />

        {/* Header: Avatar + info */}
        <div className="flex items-start gap-4 px-5 pt-4 pb-3 border-b border-foreground/[0.06]">
          {/* Avatar with themed ring */}
          <div className="relative shrink-0">
            {item.profile_image_url ? (
              <img
                src={resolveFileUrl(item.profile_image_url)}
                alt={item.member_name}
                className={`w-14 h-14 rounded-full object-cover ring-2 ${ringColor}`}
              />
            ) : (
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ring-2 ${ringColor} ${
                  isBirthday
                    ? "bg-pink-500/15 text-pink-500"
                    : "bg-amber-500/15 text-amber-500"
                }`}
              >
                {item.member_name.charAt(0)}
              </div>
            )}
            <div
              className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full ${iconBg} flex items-center justify-center border-2 border-bridge-obsidian`}
            >
              <Icon size={11} className={iconColor} />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-bold text-foreground truncate">
                {item.member_name}
              </h4>
              <span
                className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${ddayBg}`}
              >
                {ddayLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-medium ${
                  isBirthday
                    ? "text-pink-600 dark:text-pink-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {typeLabel}
              </span>
              {item.department_name && (
                <>
                  <span className="text-foreground/20">·</span>
                  <span className="text-xs text-slate-500 truncate">
                    {item.department_name}
                  </span>
                </>
              )}
              <span className="text-foreground/20">·</span>
              <span className="text-xs text-slate-500">{dateStr}</span>
            </div>
          </div>
        </div>

        {/* Celebration title text */}
        <div className="px-5 pt-3 pb-4">
          <p className="text-sm text-foreground/80 leading-relaxed">
            {isBirthday ? "🎂" : "🎉"} {celebTitle}
          </p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-t border-foreground/[0.06]">
        <button
          onClick={handleToggleMessages}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group/comment"
        >
          <MessageCircle size={14} className={`group-hover/comment:${isBirthday ? 'text-pink-500' : 'text-amber-500'} transition-colors`} />
          <span>
            {localMessageCount > 0
              ? t("organization.feed.commentCount", "{{count}}개의 댓글", {
                  count: String(localMessageCount),
                })
              : t("organization.feed.addComment", "댓글 작성")}
          </span>
        </button>
        {isToday && (
          <button
            onClick={() =>
              onCelebrate(
                item.member_id,
                item.member_name,
                item.type,
                item.date,
              )
            }
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              isBirthday
                ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:shadow-[0_0_20px_rgba(236,72,153,0.3)]"
                : "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
            }`}
          >
            {t("organization.anniversary.sendMessage", "축하 메시지 보내기")}
            <ChevronRight size={12} />
          </button>
        )}
      </div>

      {/* Inline celebration messages */}
      <AnimatePresence>
        {showMessages && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-foreground/[0.06] bg-foreground/[0.02]">
              {/* Messages list */}
              <div className="px-5 py-3 space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-3">
                    {t("organization.feed.noComments", "첫 댓글을 남겨보세요")}
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex gap-2.5">
                      {msg.author_profile_image_url ? (
                        <img
                          src={resolveFileUrl(msg.author_profile_image_url)}
                          alt={msg.author_name}
                          className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-bridge-accent">
                            {msg.author_name?.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground">
                            {msg.author_name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatRelativeTime(msg.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                          {msg.message}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Message input */}
              <div className="px-5 py-3 border-t border-foreground/[0.06]">
                <div className="flex items-center gap-2">
                  {currentUser?.profile_image ? (
                    <img
                      src={resolveFileUrl(currentUser.profile_image)}
                      alt={currentUser.name}
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-bridge-accent">
                        {currentUser?.name?.charAt(0)}
                      </span>
                    </div>
                  )}
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value.slice(0, 500));
                      setSendError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmitMessage();
                      }
                    }}
                    placeholder={t(
                      "organization.anniversary.messagePlaceholder",
                      "축하 메시지를 남겨보세요...",
                    )}
                    className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    disabled={submitting}
                  />
                  <button
                    onClick={handleSubmitMessage}
                    disabled={!messageText.trim() || submitting}
                    className="p-2 rounded-xl bg-bridge-accent text-white disabled:opacity-30 hover:bg-bridge-accent/90 transition-all shrink-0"
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>
                {sendError && (
                  <p className="text-xs text-red-500 mt-1.5 ml-9">
                    {sendError}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Announcement Card — Full content with comments
   ══════════════════════════════════════════════════════════════ */
function AnnouncementCard({
  orgId,
  item,
  isAdmin,
  onEdit,
  onDelete,
  onTogglePin,
  onViewAll,
  onCommentCountChange,
}: {
  orgId: string;
  item: OrgAnnouncement;
  isAdmin: boolean;
  onEdit: (a: OrgAnnouncement) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onViewAll: () => void;
  onCommentCountChange: (announcementId: string, delta: number) => void;
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const commentCount = item.comment_count || 0;
  const [showComments, setShowComments] = useState(commentCount > 0);
  const [comments, setComments] = useState<OrgAnnouncementComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadComments = async () => {
    try {
      setLoadingComments(true);
      const data = await orgAnnouncementService.getComments(orgId, item.id);
      setComments(data.comments);
    } catch {
      // optional
    } finally {
      setLoadingComments(false);
    }
  };

  // Auto-load comments on mount when they exist
  useEffect(() => {
    if (commentCount > 0) loadComments();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleComments = () => {
    if (!showComments) loadComments();
    setShowComments(!showComments);
  };

  const handleSubmitComment = async () => {
    const text = commentText.trim();
    if (!text || submitting) return;
    try {
      setSubmitting(true);
      const newComment = await orgAnnouncementService.addComment(
        orgId,
        item.id,
        { content: text },
      );
      setComments((prev) => [...prev, newComment]);
      setCommentText("");
      onCommentCountChange(item.id, 1);
    } catch {
      toast.error(t("common.error", "An error occurred"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (
      !confirm(t("organization.feed.deleteComment", "Delete this comment?"))
    )
      return;
    try {
      await orgAnnouncementService.deleteComment(orgId, item.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentCountChange(item.id, -1);
    } catch {
      toast.error(t("common.error", "An error occurred"));
    }
  };

  const accentGradient = item.is_pinned
    ? "from-bridge-accent/80 via-bridge-secondary/40 to-transparent"
    : "from-bridge-accent/40 via-bridge-accent/15 to-transparent";

  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors overflow-hidden group/card">
      {/* Top accent line */}
      <div className={`h-[2px] bg-gradient-to-r ${accentGradient}`} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-foreground/[0.06]">
        <div className="flex items-center gap-3">
          {item.author_profile_image ? (
            <div className="relative shrink-0">
              <img
                src={resolveFileUrl(item.author_profile_image)}
                alt={item.author_name}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-bridge-accent/20"
              />
              {item.is_pinned && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-bridge-accent flex items-center justify-center border-2 border-bridge-obsidian">
                  <Pin size={9} className="text-white" />
                </div>
              )}
            </div>
          ) : (
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-bridge-accent/15 flex items-center justify-center ring-2 ring-bridge-accent/20">
                <span className="text-sm font-bold text-bridge-accent">
                  {item.author_name?.charAt(0)}
                </span>
              </div>
              {item.is_pinned && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-bridge-accent flex items-center justify-center border-2 border-bridge-obsidian">
                  <Pin size={9} className="text-white" />
                </div>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-foreground">
                {item.author_name}
              </span>
              {item.is_pinned && (
                <span className="text-xs font-bold text-bridge-accent bg-bridge-accent/15 px-1.5 py-0.5 rounded-full">
                  PIN
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500">
              {formatRelativeTime(item.created_at)}
            </span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
            <button
              onClick={() => onTogglePin(item.id)}
              className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
              title={item.is_pinned ? "Unpin" : "Pin"}
            >
              <Pin
                size={13}
                className={
                  item.is_pinned ? "text-bridge-accent" : "text-slate-500"
                }
              />
            </button>
            <button
              onClick={() => onEdit(item)}
              className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
              title="Edit"
            >
              <Pencil size={13} className="text-slate-500" />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
              title="Delete"
            >
              <Trash2
                size={13}
                className="text-slate-500 hover:text-rose-500"
              />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-5 pt-4 pb-4">
        <h4 className="text-[15px] font-bold text-foreground mb-2 leading-snug">
          {item.title}
        </h4>
        {item.content && (
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap space-y-1">
            {item.content}
          </div>
        )}
      </div>

      {/* Attached images */}
      {item.attachments && item.attachments.length > 0 && (
        <div className={`px-5 pb-3 ${item.attachments.length === 1 ? '' : 'grid grid-cols-2 gap-1.5'}`}>
          {item.attachments.map(att => (
            <a key={att.id} href={resolveFileUrl(att.url)} target="_blank" rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden border border-foreground/[0.08]">
              <img
                src={resolveFileUrl(att.thumbnail_url || att.url)}
                alt={att.file_name}
                className={`w-full object-cover ${item.attachments!.length === 1 ? 'max-h-[320px]' : 'aspect-square'}`}
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-t border-foreground/[0.06]">
        <button
          onClick={handleToggleComments}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group/comment"
        >
          <MessageCircle size={14} className="group-hover/comment:text-bridge-accent transition-colors" />
          <span>
            {commentCount > 0
              ? t("organization.feed.commentCount", "{{count}}개의 댓글", {
                  count: String(commentCount),
                })
              : t("organization.feed.addComment", "댓글 작성")}
          </span>
        </button>
        <button
          onClick={onViewAll}
          className="text-xs text-slate-500 hover:text-bridge-accent flex items-center gap-0.5 transition-colors"
        >
          {t("organization.dashboard.viewAll", "전체 보기")}
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Comments section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-foreground/[0.06] bg-foreground/[0.02]">
              <div className="px-5 py-3 space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                {loadingComments ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
                  </div>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-3">
                    {t(
                      "organization.feed.noComments",
                      "첫 댓글을 남겨보세요",
                    )}
                  </p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex gap-2.5 group">
                      {comment.author_profile_image ? (
                        <img
                          src={resolveFileUrl(comment.author_profile_image)}
                          alt={comment.author_name}
                          className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-bridge-accent">
                            {comment.author_name?.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground">
                            {comment.author_name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatRelativeTime(comment.created_at)}
                          </span>
                          {(currentUser?.name === comment.author_name ||
                            isAdmin) && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 transition-all ml-auto"
                            >
                              <Trash2
                                size={11}
                                className="text-slate-500 hover:text-rose-500"
                              />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="px-5 py-3 border-t border-foreground/[0.06]">
                <div className="flex items-center gap-2">
                  {currentUser?.profile_image ? (
                    <img
                      src={resolveFileUrl(currentUser.profile_image)}
                      alt={currentUser.name}
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-bridge-accent">
                        {currentUser?.name?.charAt(0)}
                      </span>
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmitComment();
                      }
                    }}
                    placeholder={t(
                      "organization.feed.commentPlaceholder",
                      "댓글을 입력하세요...",
                    )}
                    className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    disabled={submitting}
                  />
                  <button
                    onClick={handleSubmitComment}
                    disabled={!commentText.trim() || submitting}
                    className="p-2 rounded-xl bg-bridge-accent text-white disabled:opacity-30 hover:bg-bridge-accent/90 transition-all shrink-0"
                  >
                    {submitting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
