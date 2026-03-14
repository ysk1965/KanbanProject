import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Users,
  ArrowLeft,
  LayoutGrid,
  Calendar,
  Flag,
  Pencil,
  Lock,
  BarChart3,
  MessageSquare,
  FileText,
  Building2,
  Keyboard,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import {
  Board,
  Milestone,
  BoardTierInfo,
  Subscription,
  AiCredits,
} from "../types";
import { BoardMember as ShareBoardMember, MemberRole } from "./ShareBoardModal";
import { UpgradeTrigger } from "./UpgradeModal";
import { TrialBanner } from "./TrialBanner";
import { NotificationDropdown } from "./NotificationDropdown";
import { UserMenu } from "./UserMenu";
import { AnnouncementDisplay } from "./AnnouncementDisplay";
import { boardService } from "../utils/services";

type ViewMode =
  | "kanban"
  | "gantt"
  | "schedule"
  | "calendar"
  | "milestone"
  | "meeting"
  | "notes"
  | "statistics"
  | "ai_report"
  | "list";

// 보드 서브뷰 그룹 (보드 탭에 속하는 ViewMode 집합)
const BOARD_SUB_MODES: ViewMode[] = [
  "kanban",
  "gantt",
  "calendar",
  "list",
  "milestone",
];

interface KanbanBoardHeaderProps {
  board: Board | null;
  boardId: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  // Milestone
  milestones: Milestone[];
  allFeatures: { id: string }[];
  kanbanSelectedMilestoneId: string;
  onMilestoneSelect: (id: string) => void;
  onOpenMilestoneWithCheck: (milestone?: Milestone) => void;
  onOpenMilestoneOnboarding: () => void;
  // Members
  boardMembersData: ShareBoardMember[];
  memberColorMap: Record<string, string | null>;
  onlineUsers: string[];
  // Notifications
  unreadNotificationCount: number;
  onUnreadCountChange: (count: number) => void;
  unreadInquiryCount: number;
  activities: any[];
  hasMoreActivities: boolean;
  onLoadMoreActivities: () => void;
  onNotificationClick: (notification: any) => void;
  // Permissions
  canEdit: boolean;
  canAccessSchedule: boolean;
  canAccessMilestone: boolean;
  canAccessStatistics: boolean;
  canAccessSlack: boolean;
  canViewStatistics: boolean;
  isAdminOrOwner: boolean;
  isViewer: boolean;
  hideBilling: boolean;
  hideBillingForUser: boolean;
  // Subscription
  subscription: Subscription | null;
  tierInfo: BoardTierInfo | null;
  // Actions
  onSaveBoardName: (name: string) => void;
  onOpenShareBoard: () => void;
  onOpenSubscription: () => void;
  onOpenInquiry: () => void;
  onOpenPremiumBenefits: () => void;
  onOpenUpgradeModal: (trigger: UpgradeTrigger) => void;
  onUpdatePayment?: () => void;
  onOpenShortcutsHelp?: () => void;
  // User
  currentUser: {
    id: string;
    name: string;
    email: string;
    role?: string;
  } | null;
  onLogout: () => void;
  isTester: boolean;
  // Sub mode helpers
  getBoardSubMode: () => "kanban" | "gantt" | "calendar" | "list" | "milestone";
  getScheduleSubMode: () => "schedule";
  getAISubMode: () => "statistics" | "ai_report";
}

export function KanbanBoardHeader({
  board,
  boardId,
  viewMode,
  onViewModeChange,
  milestones,
  allFeatures,
  kanbanSelectedMilestoneId,
  onMilestoneSelect,
  onOpenMilestoneWithCheck,
  onOpenMilestoneOnboarding,
  boardMembersData,
  memberColorMap,
  onlineUsers,
  unreadNotificationCount,
  onUnreadCountChange,
  unreadInquiryCount,
  activities,
  hasMoreActivities,
  onLoadMoreActivities,
  onNotificationClick,
  canEdit,
  canAccessSchedule,
  canAccessMilestone,
  canAccessStatistics,
  canAccessSlack,
  canViewStatistics,
  isAdminOrOwner,
  isViewer,
  hideBilling,
  hideBillingForUser,
  subscription,
  tierInfo,
  onSaveBoardName,
  onOpenShareBoard,
  onOpenSubscription,
  onOpenInquiry,
  onOpenPremiumBenefits,
  onOpenUpgradeModal,
  onUpdatePayment,
  onOpenShortcutsHelp,
  currentUser,
  onLogout,
  isTester,
  getBoardSubMode,
  getScheduleSubMode,
  getAISubMode,
}: KanbanBoardHeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isRestricted } = useAuth();
  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState("");
  const boardNameInputRef = useRef<HTMLInputElement>(null);

  // TAB 키로 최상위 탭 순환 이동
  const getAvailableTabs = useCallback(() => {
    const tabs: { key: string; action: () => void }[] = [
      { key: "board", action: () => onViewModeChange(getBoardSubMode()) },
      { key: "schedule", action: () => onViewModeChange("schedule") },
      { key: "meeting", action: () => onViewModeChange("meeting") },
    ];
    if (!isRestricted) {
      tabs.push({ key: "notes", action: () => onViewModeChange("notes") });
    }
    if (!isRestricted && (isAdminOrOwner || (!isViewer && !isTester))) {
      tabs.push({
        key: "ai",
        action: () => {
          if (!canAccessStatistics) return;
          const subMode = getAISubMode();
          if (subMode === "statistics" && !isAdminOrOwner) {
            onViewModeChange("ai_report");
          } else if (subMode === "ai_report" && (isViewer || isTester)) {
            onViewModeChange("statistics");
          } else {
            onViewModeChange(subMode);
          }
        },
      });
    }
    return tabs;
  }, [
    onViewModeChange,
    getBoardSubMode,
    getAISubMode,
    isAdminOrOwner,
    isViewer,
    isTester,
    canAccessStatistics,
  ]);

  const getCurrentTabIndex = useCallback(() => {
    if (BOARD_SUB_MODES.includes(viewMode)) return 0;
    if (viewMode === "schedule") return 1;
    if (viewMode === "meeting") return 2;
    if (viewMode === "notes") return 3;
    if (viewMode === "statistics" || viewMode === "ai_report") {
      const tabs = getAvailableTabs();
      return tabs.findIndex((t) => t.key === "ai");
    }
    return 0;
  }, [viewMode, getAvailableTabs]);

  useEffect(() => {
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      // 입력 필드에 포커스 중이면 기본 동작 유지
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // 모달/드롭다운이 열려있으면 무시
      if (
        document.querySelector("[role='dialog']") ||
        document.querySelector("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }

      e.preventDefault();
      const tabs = getAvailableTabs();
      if (tabs.length === 0) return;

      const currentIdx = getCurrentTabIndex();
      let nextIdx: number;

      if (e.shiftKey) {
        nextIdx = currentIdx <= 0 ? tabs.length - 1 : currentIdx - 1;
      } else {
        nextIdx = currentIdx >= tabs.length - 1 ? 0 : currentIdx + 1;
      }

      tabs[nextIdx].action();
    };

    window.addEventListener("keydown", handleTabKey);
    return () => window.removeEventListener("keydown", handleTabKey);
  }, [getAvailableTabs, getCurrentTabIndex]);

  const handleStartEditBoardName = () => {
    if (!canEdit || !board) return;
    setEditingBoardName(board.name);
    setIsEditingBoardName(true);
    setTimeout(() => boardNameInputRef.current?.select(), 0);
  };

  const handleSaveBoardName = async () => {
    const trimmed = editingBoardName.trim();
    if (!trimmed || !board || !boardId || trimmed === board.name) {
      setIsEditingBoardName(false);
      return;
    }
    onSaveBoardName(trimmed);
    setIsEditingBoardName(false);
  };

  return (
    <>
      <AnnouncementDisplay />
      <TrialBanner
        status={subscription?.status || "ACTIVE"}
        tier={tierInfo?.tier}
        trialEndsAt={tierInfo?.trial_ends_at || subscription?.trial_ends_at}
        onOpenSubscription={onOpenSubscription}
        onOpenPremiumBenefits={onOpenPremiumBenefits}
        onTrialEnding={() => onOpenUpgradeModal("trial_ending")}
        onUpdatePayment={onUpdatePayment}
        daysPastDue={subscription?.days_past_due}
        daysUntilSuspension={subscription?.days_until_suspension}
        hideBilling={hideBillingForUser}
      />

      {/* Org 보드 상단 accent line */}
      {board?.organization_id && (
        <div className="h-[2px] bg-gradient-to-r from-bridge-secondary/60 via-bridge-accent/40 to-transparent shrink-0" />
      )}

      <header className="min-h-[3.5rem] md:h-16 border-b border-bridge-border flex items-center px-3 md:px-6 bg-bridge-obsidian/80 backdrop-blur-xl shrink-0 z-30 gap-2 safe-top relative">
        {/* 좌측 영역 */}
        <div className="flex items-center gap-2 md:gap-6 min-w-0 shrink-0">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-bridge-surface-hover rounded-lg transition-colors text-zinc-400 hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {isEditingBoardName ? (
              <input
                ref={boardNameInputRef}
                value={editingBoardName}
                onChange={(e) => setEditingBoardName(e.target.value)}
                onBlur={handleSaveBoardName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveBoardName();
                  if (e.key === "Escape") setIsEditingBoardName(false);
                }}
                className="text-sm md:text-lg font-bold tracking-tight text-foreground bg-foreground/5 border border-foreground/10 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent max-w-[160px] sm:max-w-[200px] md:max-w-[300px]"
                autoFocus
              />
            ) : (
              <h1
                className={`text-sm md:text-lg font-bold tracking-tight text-foreground truncate max-w-[100px] sm:max-w-[160px] md:max-w-none ${canEdit ? "cursor-pointer hover:text-bridge-accent transition-colors" : ""}`}
                onClick={canEdit ? handleStartEditBoardName : undefined}
                title={canEdit ? t("common.edit") : undefined}
              >
                {board?.name || t("kanban.defaultBoardName")}
              </h1>
            )}

            {/* Org 보드 뱃지 */}
            {board?.organization_id && board.organization_name && (
              <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary text-xs font-bold shrink-0">
                <Building2 size={10} />
                {board.organization_name}
              </span>
            )}
          </div>
        </div>

        {/* 중앙 탭 영역 - 절대 중앙 정렬 */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <nav className="flex items-center gap-1 bg-bridge-surface p-1 rounded-xl border border-bridge-border overflow-x-auto shrink-0">
            <button
              onClick={() => {
                const subMode = getBoardSubMode();
                onViewModeChange(subMode);
              }}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                BOARD_SUB_MODES.includes(viewMode)
                  ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                  : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
              }`}
            >
              <LayoutGrid size={14} />
              <span className="hidden md:inline">
                {t("kanban.viewBoard", "보드")}
              </span>
            </button>

            <button
              onClick={() => {
                onViewModeChange("schedule");
              }}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                viewMode === "schedule"
                  ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                  : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
              }`}
            >
              <Calendar size={14} />
              <span className="hidden md:inline">
                {t("kanban.viewScheduleTab", "일정")}
              </span>
            </button>

            <button
              onClick={() => onViewModeChange("meeting")}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                viewMode === "meeting"
                  ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                  : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
              }`}
            >
              <Users size={14} />
              <span className="hidden md:inline">
                {t("kanban.viewMeeting", "회의")}
              </span>
            </button>

            {!isRestricted && (
              <button
                onClick={() => onViewModeChange("notes")}
                className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  viewMode === "notes"
                    ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                    : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
                }`}
              >
                <FileText size={14} />
                <span className="hidden md:inline">
                  {t("kanban.viewNotes", "노트")}
                </span>
              </button>
            )}

            {!isRestricted && (isAdminOrOwner || (!isViewer && !isTester)) && (
              <button
                onClick={() => {
                  if (!canAccessStatistics) {
                    onOpenUpgradeModal("statistics");
                    return;
                  }
                  const subMode = getAISubMode();
                  if (subMode === "statistics" && !isAdminOrOwner) {
                    onViewModeChange("ai_report");
                  } else if (
                    subMode === "ai_report" &&
                    (isViewer || isTester)
                  ) {
                    onViewModeChange("statistics");
                  } else {
                    onViewModeChange(subMode);
                  }
                }}
                className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-medium transition-all relative whitespace-nowrap ${
                  viewMode === "statistics" || viewMode === "ai_report"
                    ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                    : !canAccessStatistics
                      ? "text-zinc-600 cursor-not-allowed opacity-50"
                      : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
                }`}
              >
                <BarChart3 size={14} />
                <span className="hidden md:inline">
                  {t("kanban.viewAIAnalysisTab", "AI분석")}
                </span>
                {!canAccessStatistics && (
                  <Lock size={10} className="ml-0.5 text-zinc-500" />
                )}
              </button>
            )}
          </nav>
        </div>

        {/* 우측 액션 영역 */}
        <div className="flex items-center gap-1 md:gap-2 shrink-0 ml-auto">
          <div className="flex items-center gap-0.5 md:gap-1 border-r border-bridge-border pr-2 md:pr-3 mr-0.5 md:mr-1">
            {onOpenShortcutsHelp && (
              <button
                onClick={onOpenShortcutsHelp}
                className="hidden md:flex items-center p-2 text-slate-500 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                title={t("keyboardShortcuts.title", "키보드 단축키")}
                aria-label={t("keyboardShortcuts.title", "키보드 단축키")}
              >
                <Keyboard size={16} />
              </button>
            )}
            <NotificationDropdown
              boardId={boardId}
              unreadCount={unreadNotificationCount}
              activities={activities}
              hasMoreActivities={hasMoreActivities}
              onLoadMoreActivities={onLoadMoreActivities}
              onNotificationClick={onNotificationClick}
              onUnreadCountChange={onUnreadCountChange}
              canAccessSlack={canAccessSlack}
              canAccessDiscord={canAccessSlack}
              onSlackUpgrade={() => onOpenUpgradeModal("slack")}
              onDiscordUpgrade={() => onOpenUpgradeModal("slack")}
              isAdmin={isAdminOrOwner}
              isTester={isTester}
            />
            {!isTester && (
              <button
                onClick={onOpenInquiry}
                className="relative flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover rounded-lg transition-all"
                title={t("kanban.inquiry")}
                aria-label={t("kanban.inquiry")}
              >
                <MessageSquare size={18} />
                {unreadInquiryCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                    {unreadInquiryCount > 99 ? "99+" : unreadInquiryCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={onOpenShareBoard}
              className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover rounded-lg transition-all"
            >
              <Users size={18} />
              <span className="hidden md:inline text-xs font-medium">
                {t("kanban.team")}
              </span>
            </button>
          </div>

          {currentUser && (
            <UserMenu
              user={{
                ...currentUser,
                avatar: currentUser.profile_image || undefined,
              }}
              assigneeColor={memberColorMap[currentUser.id]}
              onOpenSubscription={onOpenSubscription}
              onLogout={onLogout}
              hideBilling={hideBillingForUser}
            />
          )}
        </div>
      </header>
    </>
  );
}
