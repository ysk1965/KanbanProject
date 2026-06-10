import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  Suspense,
} from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus,
  GripVertical,
  Flag,
  Pencil,
  Eye,
  Clock,
  Calendar,
  Users,
  LayoutGrid,
  FileText,
  BarChart3,
  Lock,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

// 뷰 모드 타입
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
import { DragProvider } from "../contexts/DragContext";
import { useAuth } from "../contexts/AuthContext";
import {
  Block,
  Feature,
  Task,
  Tag,
  Board,
  InviteLink,
  Subscription,
  ActivityLog,
  Milestone,
  BoardTierInfo,
  BoardLimits,
  ChecklistItem,
  NotificationItem,
  BoardWebSocketEvent,
  TaskComment,
  AiCredits,
  TaskDependency,
  StatisticsViewType,
  JobRole,
  BoardContractor,
} from "../types";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { KanbanBlock } from "../components/KanbanBlock";
import { FeatureCard } from "../components/FeatureCard";
import { FeatureChipSelector } from "../components/FeatureChipSelector";
import { TrialBanner } from "../components/TrialBanner";
import { FilterOptions } from "../components/FilterModal";
import {
  BoardMember as ShareBoardMember,
  MemberRole,
} from "../components/ShareBoardModal";
import { NotificationDropdown } from "../components/NotificationDropdown";
import { UpgradeTrigger } from "../components/UpgradeModal";
import { DailyScheduleView } from "../components/DailyScheduleView";
import { MeetingCalendarView } from "../components/MeetingCalendarView";
import { WeeklyScheduleView } from "../components/WeeklyScheduleView";
import { CalendarView } from "../components/CalendarView";
import { ContractorManageModal } from "../components/ContractorManageModal";
import { lazyWithRetry } from "../utils/lazyWithRetry";
const StatisticsView = lazyWithRetry(
  () =>
    import("../components/StatisticsView").then((m) => ({
      default: m.StatisticsView,
    })),
  "StatisticsView",
);
const AIReportPanel = lazyWithRetry(
  () =>
    import("../components/AIReportPanel").then((m) => ({
      default: m.AIReportPanel,
    })),
  "AIReportPanel",
);
const NotesView = lazyWithRetry(
  () =>
    import("../components/notes/NotesView").then((m) => ({
      default: m.NotesView,
    })),
  "NotesView",
);
const MilestoneView = lazyWithRetry(
  () =>
    import("../components/MilestoneView").then((m) => ({
      default: m.MilestoneView,
    })),
  "MilestoneView",
);
const ScheduleCalendarView = lazyWithRetry(
  () =>
    import("../components/schedule/ScheduleCalendarView").then((m) => ({
      default: m.ScheduleCalendarView,
    })),
  "ScheduleCalendarView",
);
const ScheduleResourceView = lazyWithRetry(
  () =>
    import("../components/schedule/ScheduleResourceView").then((m) => ({
      default: m.ScheduleResourceView,
    })),
  "ScheduleResourceView",
);
const ChecklistItemPanel = lazyWithRetry(
  () =>
    import("../components/schedule/ChecklistItemPanel").then((m) => ({
      default: m.ChecklistItemPanel,
    })),
  "ChecklistItemPanel",
);
import type { PanelDragState } from "../components/schedule/ChecklistItemPanel";
import { EmptyBoardGuide } from "../components/EmptyBoardGuide";
import { QuickAddTaskModal } from "../components/QuickAddTaskModal";
import { BoardTrashView } from "../components/trash/BoardTrashView";
import {
  boardService,
  featureService,
  taskService,
  blockService,
  tagService,
  memberService,
  inviteLinkService,
  subscriptionService,
  orgSubscriptionService,
  activityService,
  milestoneService,
  checklistService,
  aiCreditService,
  taskDependencyService,
  jobRoleService,
  contractorService,
} from "../utils/services";
import {
  notificationAPI,
  checklistAPI,
  scheduleAPI,
  boardJoinRequestAPI,
  milestoneBlockAPI,
  trashAPI,
} from "../utils/api";
import { toast } from "sonner";

import { useTranslation } from "react-i18next";
import { getRandomFeatureColor } from "../constants";
import { useBoardWebSocket } from "../hooks/useBoardWebSocket";

// 추출된 Hook 및 컴포넌트
import { useBoardDataLoader } from "../hooks/useBoardDataLoader";
import { useBoardFilters } from "../hooks/useBoardFilters";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { KeyboardShortcutsModal } from "../components/KeyboardShortcutsModal";
import { useBoardPermissions } from "../hooks/useBoardPermissions";
import { useNotificationManager } from "../hooks/useNotificationManager";
import { KanbanBoardHeader } from "../components/KanbanBoardHeader";
import { KanbanFilterToolbar } from "../components/KanbanFilterToolbar";
import { BoardModalManager } from "../components/BoardModalManager";
import { FloatingViewSwitcher } from "../components/FloatingViewSwitcher";
import { BoardSubTabs } from "../components/BoardSubTabs";
// BoardResourceBar removed — integrated into KanbanFilterToolbar
import { BoardListView } from "../components/BoardListView";
import JoinRequestBanner from "../components/JoinRequestBanner";

declare const __FE_COMMIT_HASH__: string;

// memo된 자식에 빈 배열을 안정 참조로 전달 (매 렌더 새 [] 생성 방지)
const EMPTY_FEATURE_IDS: string[] = [];

export function KanbanBoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const {
    currentUser,
    logout,
    hideBilling,
    isTester,
    isAdmin: isSystemAdmin,
    isRestricted,
  } = useAuth();

  // URL 쿼리 파라미터에서 뷰/탭/태스크 정보 읽기 (Slack/Discord 등 외부 링크용)
  const urlView = searchParams.get("view") as ViewMode | null;
  const urlTab = searchParams.get("tab");
  const urlTaskId = searchParams.get("task");
  const pendingDeepLinkTaskId = useRef<string | null>(urlTaskId);
  const milestoneIdRef = useRef<string>("");
  // WebSocket 핸들러(useCallback [])에서 최신 tasks 접근용 (stale closure 방지)
  const tasksRef = useRef<Task[]>([]);

  // 버전 정보
  const [beCommit, setBeCommit] = useState<string>("");
  useEffect(() => {
    const apiBase =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";
    const origin = (() => {
      try {
        return new URL(apiBase).origin;
      } catch {
        return "http://localhost:8080";
      }
    })();
    fetch(`${origin}/health`)
      .then((r) => r.json())
      .then((d) => setBeCommit(d.commit || ""))
      .catch(() => {});
  }, []);

  // localStorage 마이그레이션 (기존 사용자 호환: weekly→gantt, scheduleSubMode→boardSubMode)
  useEffect(() => {
    if (!boardId) return;
    // viewMode_${boardId}: weekly → gantt
    const savedViewMode = localStorage.getItem(`viewMode_${boardId}`);
    if (savedViewMode === "weekly") {
      localStorage.setItem(`viewMode_${boardId}`, "gantt");
    }
    // scheduleSubMode → boardSubMode 마이그레이션
    const oldScheduleSub = localStorage.getItem(`scheduleSubMode_${boardId}`);
    if (oldScheduleSub) {
      const newBoardSub = localStorage.getItem(`boardSubMode_${boardId}`);
      if (!newBoardSub) {
        // weekly→gantt, calendar/milestone 그대로, schedule은 보드 서브뷰가 아니므로 무시
        if (oldScheduleSub === "weekly") {
          localStorage.setItem(`boardSubMode_${boardId}`, "gantt");
        } else if (
          oldScheduleSub === "calendar" ||
          oldScheduleSub === "milestone"
        ) {
          localStorage.setItem(`boardSubMode_${boardId}`, oldScheduleSub);
        }
      }
    }
  }, [boardId]);

  // 뷰 모드 상태 (URL 파라미터 우선, 없으면 localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (urlView) {
      // URL ?view=weekly → gantt 하위호환 매핑
      const mappedView = urlView === "weekly" ? "gantt" : urlView;
      if (
        [
          "kanban",
          "gantt",
          "schedule",
          "calendar",
          "milestone",
          "meeting",
          "notes",
          "statistics",
          "ai_report",
          "list",
        ].includes(mappedView)
      ) {
        return mappedView as ViewMode;
      }
    }
    const saved = localStorage.getItem(`viewMode_${boardId}`);
    // 기존 weekly 값도 gantt로 변환
    if (saved === "weekly") return "gantt";
    return (saved as ViewMode) || "kanban";
  });

  // 보드 서브뷰 모드 기억 헬퍼 (칸반/간트/캘린더/리스트/마일스톤)
  const getBoardSubMode = ():
    | "kanban"
    | "gantt"
    | "calendar"
    | "list"
    | "milestone" => {
    const saved = localStorage.getItem(`boardSubMode_${boardId}`);
    if (saved === "gantt") return "gantt";
    if (saved === "calendar") return "calendar";
    if (saved === "list") return "list";
    if (saved === "milestone") return "milestone";
    return "kanban";
  };
  // 일정 탭 서브모드 (타임블록 / 캘린더 / 리소스)
  type ScheduleSubTab = "timeblock" | "calendar" | "resource";
  const getScheduleSubTab = (): ScheduleSubTab => {
    const saved = localStorage.getItem(`scheduleSubTab_${boardId}`);
    if (saved === "calendar" || saved === "resource") return saved;
    return "timeblock";
  };

  // 일정 탭 서브탭 상태 (localStorage 영속화)
  const [scheduleSubTab, setScheduleSubTab] = useState<ScheduleSubTab>(() =>
    getScheduleSubTab(),
  );

  const handleScheduleSubTabChange = useCallback(
    (tab: ScheduleSubTab) => {
      setScheduleSubTab(tab);
      if (boardId) {
        localStorage.setItem(`scheduleSubTab_${boardId}`, tab);
      }
    },
    [boardId],
  );

  // 일정 서브탭 키보드 단축키 (1=타임블록, 2=워크로드, 3=캘린더)
  useEffect(() => {
    if (viewMode !== "schedule") return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      if (e.key === "1") handleScheduleSubTabChange("timeblock");
      else if (e.key === "2") handleScheduleSubTabChange("resource");
      else if (e.key === "3") handleScheduleSubTabChange("calendar");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewMode, handleScheduleSubTabChange]);

  // ChecklistItemPanel drag state (calendar/resource DnD integration)
  const [panelDragState, setPanelDragState] = useState<PanelDragState | null>(
    null,
  );
  const [scheduleRefreshPanel, setScheduleRefreshPanel] = useState(0);

  // 일정 뷰 갱신 신호 게이팅: 소비자(refreshTrigger/key)는 schedule 뷰에서만 마운트되므로
  // 다른 뷰에서는 카운터를 올리지 않는다 (WS 이벤트마다 페이지 전체 재렌더 방지).
  // schedule 뷰 진입 시 컴포넌트가 새로 마운트되며 최신 데이터를 로드하므로 pending 처리 불필요.
  const viewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  const notifyScheduleRefresh = useCallback(() => {
    if (viewModeRef.current === "schedule") {
      setScheduleRefreshPanel((prev) => prev + 1);
    }
  }, []);
  const [scrollToItem, setScrollToItem] = useState<{
    id: string;
    ts: number;
  } | null>(null);

  const getAISubMode = (): "statistics" | "ai_report" => {
    const saved = localStorage.getItem(`aiSubMode_${boardId}`);
    return saved === "ai_report" ? "ai_report" : "statistics";
  };

  // URL 쿼리 파라미터 소비 후 제거 (뒤로가기 시 다시 트리거 방지)
  useEffect(() => {
    if (urlView || urlTab || urlTaskId) {
      searchParams.delete("view");
      searchParams.delete("tab");
      searchParams.delete("task");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // ======== 커스텀 Hook: 데이터 로딩 ========
  const {
    board,
    setBoard,
    blocks,
    setBlocks,
    hiddenBlocks,
    setHiddenBlocks,
    features,
    setFeatures,
    allFeatures,
    setAllFeatures,
    tasks,
    setTasks,
    tags,
    setTags,
    inviteLinks,
    setInviteLinks,
    subscription,
    setSubscription,
    activities,
    setActivities,
    activityCursor,
    setActivityCursor,
    hasMoreActivity,
    setHasMoreActivity,
    milestones,
    setMilestones,
    isLoading,
    checklistDataMap,
    setChecklistDataMap,
    scheduledTaskIds,
    setScheduledTaskIds,
    tierInfo,
    setTierInfo,
    boardLimits,
    setBoardLimits,
    boardMembersData,
    setBoardMembersData,
    aiCredits,
    setAiCredits,
    kanbanSelectedMilestoneId,
    setKanbanSelectedMilestoneId,
    reloadFeaturesAndTasks,
    refreshMembers,
  } = useBoardDataLoader(boardId);

  // 워크로드 임시 업무 배치용 태스크 목록 (feature 정보 포함, 추가 fetch 없음)
  const taskPickerList = useMemo(() => {
    const featureMap = new Map<string, { title: string; color: string }>();
    (allFeatures.length ? allFeatures : features).forEach((f) =>
      featureMap.set(f.id, { title: f.title, color: f.color }),
    );
    return tasks.map((task) => {
      const f = featureMap.get(task.feature_id);
      return {
        taskId: task.id,
        taskTitle: task.title,
        featureId: task.feature_id,
        featureTitle: f?.title || "",
        featureColor: f?.color || "#6366F1",
      };
    });
  }, [tasks, allFeatures, features]);

  // milestoneIdRef를 최신 값으로 동기화 (WebSocket 핸들러에서 stale closure 방지)
  useEffect(() => {
    milestoneIdRef.current = kanbanSelectedMilestoneId;
  }, [kanbanSelectedMilestoneId]);

  // tasksRef를 최신 값으로 동기화 (WebSocket 핸들러에서 stale closure 방지)
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // URL ?task= 딥링크: 데이터 로딩 완료 후 TaskDetailModal 자동 오픈
  useEffect(() => {
    if (isLoading || !pendingDeepLinkTaskId.current || !boardId) return;
    const deepLinkTaskId = pendingDeepLinkTaskId.current;
    pendingDeepLinkTaskId.current = null;

    const task = tasks.find((t) => t.id === deepLinkTaskId);
    if (task) {
      setSelectedTask(task);
      setIsTaskModalOpen(true);
      return;
    }
    // 마일스톤 필터로 안 보이는 경우 API 직접 조회
    taskService
      .getTask(boardId, deepLinkTaskId)
      .then((t) => {
        setSelectedTask(t);
        setIsTaskModalOpen(true);
      })
      .catch(() => {});
  }, [isLoading, boardId]);

  // ======== 커스텀 Hook: 권한 ========
  const {
    canAccessSchedule,
    canAccessMilestone,
    canAccessSlack,
    canAccessStatistics,
    canViewStatistics,
    isAdminOrOwner,
    currentUserRole,
    isViewer,
    isOwner,
    canEdit,
    hideBillingForUser,
    isOrgMemberViewer,
  } = useBoardPermissions(
    tierInfo,
    boardMembersData,
    currentUser,
    board,
    hideBilling,
    isSystemAdmin,
    isTester,
  );

  // 참가 요청 (Admin/Owner만)
  const [pendingJoinRequestCount, setPendingJoinRequestCount] = useState(0);

  useEffect(() => {
    if (isAdminOrOwner && board?.organization_id && boardId) {
      boardJoinRequestAPI
        .list(boardId)
        .then((data) => setPendingJoinRequestCount(data.requests.length))
        .catch(() => {});
    }
  }, [isAdminOrOwner, board?.organization_id, boardId]);

  const handleJoinRequestHandled = useCallback(() => {
    if (boardId) {
      boardJoinRequestAPI
        .list(boardId)
        .then((data) => setPendingJoinRequestCount(data.requests.length))
        .catch(() => {});
      // Refresh member list
      memberService
        .getMembers(boardId)
        .then((membersResponse) => {
          setBoardMembersData(
            membersResponse.members.map((m: any) => ({
              id: m.id,
              userId: m.user.id,
              name: m.user.name,
              email: m.user.email,
              role: m.role.toLowerCase(),
              assigneeColor: m.assignee_color || null,
            })),
          );
        })
        .catch(() => {});
    }
  }, [boardId]);

  // 모달 상태
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [highlightChecklistItemId, setHighlightChecklistItemId] = useState<
    string | null
  >(null);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const [meetingRefreshKey, setMeetingRefreshKey] = useState(0);
  const [meetingNavigateDate, setMeetingNavigateDate] = useState<Date | null>(
    null,
  );
  const [managementRefreshKey, setManagementRefreshKey] = useState(0);
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] = useState(false);
  const [isShareBoardModalOpen, setIsShareBoardModalOpen] = useState(false);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [isContractorManagerOpen, setIsContractorManagerOpen] = useState(false);
  const [headerContractors, setHeaderContractors] = useState<BoardContractor[]>(
    [],
  );
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isPremiumBenefitsModalOpen, setIsPremiumBenefitsModalOpen] =
    useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [isActivityLogModalOpen, setIsActivityLogModalOpen] = useState(false);
  const [wsCommentEvent, setWsCommentEvent] =
    useState<BoardWebSocketEvent | null>(null);
  const [wsChecklistEvent, setWsChecklistEvent] =
    useState<BoardWebSocketEvent | null>(null);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(
    null,
  );
  const [isMilestoneOnboardingOpen, setIsMilestoneOnboardingOpen] =
    useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    keyword: "",
    members: [],
    features: [],
    tags: [],
    cardStatus: [],
    dueDate: [],
  });

  // 태스크 의존성 상태
  const [taskDependencies, setTaskDependencies] = useState<TaskDependency[]>(
    [],
  );

  // Feature 칩 선택 상태 (null = 전체, [] = 없음, [ids] = 개별 선택)
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[] | null>(
    null,
  );

  // Tier & Limits 모달 상태
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTrigger, setUpgradeTrigger] =
    useState<UpgradeTrigger>("task_limit");
  const [seatPurchaseModal, setSeatPurchaseModal] = useState<{
    open: boolean;
    seatCount: number;
    billableMemberCount: number;
    pendingEmail: string;
    pendingRole: MemberRole;
    pendingMemberId?: string;
  } | null>(null);
  const [orgSeatLimitModal, setOrgSeatLimitModal] = useState<{
    open: boolean;
    orgId: string;
    seatCount: number;
    activeMemberCount: number;
    monthlyPricePerSeat: number;
    yearlyPricePerSeat: number;
    isOrgAdmin: boolean;
    pendingEmail: string;
    pendingRole: MemberRole;
    pendingMemberId?: string;
  } | null>(null);

  // AI Credits 상태
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditModalMode, setCreditModalMode] = useState<
    "purchase" | "exhausted"
  >("purchase");

  // Quick Add Task 모달 상태
  const [quickAddBlockId, setQuickAddBlockId] = useState<string | null>(null);
  const [isQuickAddSubmitting, setIsQuickAddSubmitting] = useState(false);

  // 캐스케이드 펄스: 체크리스트 → Feature 칩
  const [cascadeFeatureId, setCascadeFeatureId] = useState<string | null>(null);

  // 체크리스트 펼침 상태
  const [expandedChecklistTaskIds, setExpandedChecklistTaskIds] = useState<
    Set<string>
  >(new Set());
  // 방금 Done으로 이동된 태스크 ID (완료 애니메이션용)
  const [recentlyCompletedTaskIds, setRecentlyCompletedTaskIds] = useState<
    Set<string>
  >(new Set());

  // 데이터 로드 완료 시 localStorage에서 펼치기 상태 복원 (기본: 접힘)
  const initialExpandDone = useRef(false);
  useEffect(() => {
    if (!isLoading && tasks.length > 0 && !initialExpandDone.current) {
      initialExpandDone.current = true;
      try {
        const savedChecklist = localStorage.getItem(
          `expandedChecklist_${boardId}`,
        );
        if (savedChecklist) {
          const ids = JSON.parse(savedChecklist) as string[];
          setExpandedChecklistTaskIds(
            new Set(ids.filter((id) => tasks.some((t) => t.id === id))),
          );
        }
      } catch {
        // localStorage 파싱 실패 시 기본값(접힘) 유지
      }
    }
  }, [isLoading, tasks, boardId]);

  // 펼침 상태 변경 시 localStorage 저장 (복원 완료 전에는 저장하지 않음)
  // setState updater 안의 동기 localStorage 쓰기(메인스레드 블로킹 + StrictMode 이중 실행)를 effect로 분리
  useEffect(() => {
    if (!initialExpandDone.current || !boardId) return;
    localStorage.setItem(
      `expandedChecklist_${boardId}`,
      JSON.stringify([...expandedChecklistTaskIds]),
    );
  }, [expandedChecklistTaskIds, boardId]);

  // 키보드 단축키 도움말 모달
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // AI분석 > 마일스톤 서브탭 (statistics 내부 6개 탭)
  const [statisticsActiveView, setStatisticsActiveView] =
    useState<StatisticsViewType>("overview");

  // Alert Modal 상태
  const [alertModal, setAlertModal] = useState<{
    open: boolean;
    type: "premium" | "permission";
  }>({ open: false, type: "premium" });

  const showAlertModal = (type: "premium" | "permission") => {
    setAlertModal({ open: true, type });
  };

  // 멤버 데이터 파생
  const currentUserId = currentUser?.id || "";

  const memberColorMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    boardMembersData.forEach((m) => {
      map[m.userId] = m.assigneeColor || null;
    });
    return map;
  }, [boardMembersData]);

  // 직군(JobRole) 데이터: userId → JobRoleInfo
  const memberJobRoleMap = useMemo(() => {
    const map: Record<string, import("../types").JobRoleInfo | null> = {};
    boardMembersData.forEach((m) => {
      map[m.userId] = m.jobRole || null;
    });
    return map;
  }, [boardMembersData]);

  // ======== 커스텀 Hook: 알림 ========
  const isRealtimeEnabled = tierInfo?.tier !== "STANDARD";
  const {
    unreadNotificationCount,
    setUnreadNotificationCount,
    unreadInquiryCount,
    setUnreadInquiryCount,
  } = useNotificationManager(
    boardId,
    currentUser,
    isRealtimeEnabled,
    isInquiryModalOpen,
  );

  // ======== 커스텀 Hook: 필터 ========
  const { filteredFeatures, filteredTasks, sortedBlocks } = useBoardFilters(
    features,
    tasks,
    blocks,
    filterOptions,
    checklistDataMap,
  );

  // SortableContext 대상 블록 (FEATURE/TASK 고정 블록 제외) — 렌더/드래그에서 공용
  const sortableBlocks = useMemo(
    () =>
      sortedBlocks.filter(
        (b) => b.fixed_type !== "FEATURE" && b.fixed_type !== "TASK",
      ),
    [sortedBlocks],
  );

  // ======== 키보드 단축키 ========
  const isAnyModalOpen =
    isFeatureModalOpen ||
    isTaskModalOpen ||
    isAddBlockModalOpen ||
    isAddFeatureModalOpen ||
    isShareBoardModalOpen ||
    isSubscriptionModalOpen ||
    isPremiumBenefitsModalOpen ||
    isInquiryModalOpen ||
    isActivityLogModalOpen ||
    isMilestoneModalOpen ||
    isUpgradeModalOpen ||
    isMilestoneOnboardingOpen ||
    showCreditModal ||
    !!quickAddBlockId ||
    !!seatPurchaseModal ||
    !!orgSeatLimitModal ||
    alertModal.open ||
    isShortcutsHelpOpen;

  const handleToggleExpandCollapse = useCallback(() => {
    if (viewMode === "kanban") {
      setExpandedChecklistTaskIds((prev) =>
        prev.size > 0 ? new Set() : new Set(tasks.map((t) => t.id)),
      );
    } else {
      window.dispatchEvent(new CustomEvent("bridge:toggleExpandCollapse"));
    }
  }, [tasks, viewMode]);

  const handleResetFilters = useCallback(() => {
    setFilterOptions({
      keyword: "",
      members: [],
      features: [],
      tags: [],
      cardStatus: [],
      dueDate: [],
    });
  }, []);

  const handleToggleMyFilter = useCallback(() => {
    if (!currentUser) return;
    setFilterOptions((prev) => {
      const isMyOnly =
        prev.members.length === 1 && prev.members[0] === currentUser.name;
      return { ...prev, members: isMyOnly ? [] : [currentUser.name] };
    });
  }, [currentUser]);

  // ======== 태스크 의존성 로드 ========
  useEffect(() => {
    if (boardId && viewMode === "gantt") {
      taskDependencyService
        .getByBoard(boardId)
        .then(setTaskDependencies)
        .catch(() => setTaskDependencies([]));
    }
  }, [boardId, viewMode]);

  // ======== WebSocket 실시간 동기화 ========
  const handleWebSocketEvent = useCallback((event: BoardWebSocketEvent) => {
    const { type, data } = event;

    switch (type) {
      // Feature events
      case "FEATURE_CREATED": {
        const feature = data as Feature;
        setFeatures((prev) =>
          prev.some((f) => f.id === feature.id) ? prev : [...prev, feature],
        );
        setAllFeatures((prev) =>
          prev.some((f) => f.id === feature.id) ? prev : [...prev, feature],
        );
        notifyScheduleRefresh();
        break;
      }
      case "FEATURE_UPDATED": {
        const feature = data as Feature;
        setFeatures((prev) =>
          prev.map((f) => (f.id === feature.id ? feature : f)),
        );
        setAllFeatures((prev) =>
          prev.map((f) => (f.id === feature.id ? feature : f)),
        );
        notifyScheduleRefresh();
        break;
      }
      case "FEATURE_DELETED": {
        const { id, migrated_tasks } = data as {
          id: string;
          migrated_tasks?: Array<{
            task_id: string;
            target_feature_id: string;
          }>;
        };
        setFeatures((prev) => prev.filter((f) => f.id !== id));
        setAllFeatures((prev) => prev.filter((f) => f.id !== id));
        if (migrated_tasks && migrated_tasks.length > 0) {
          const migrationMap = new Map(
            migrated_tasks.map((m) => [m.task_id, m.target_feature_id]),
          );
          setTasks(
            (prev) =>
              prev
                .map((t) => {
                  const targetFeatureId = migrationMap.get(t.id);
                  if (targetFeatureId) {
                    return { ...t, feature_id: targetFeatureId };
                  }
                  return t.feature_id === id ? null : t;
                })
                .filter(Boolean) as Task[],
          );
        } else {
          setTasks((prev) => prev.filter((t) => t.feature_id !== id));
        }
        notifyScheduleRefresh();
        break;
      }
      case "FEATURES_REORDERED": {
        const { features } = data as { features: Feature[] };
        if (Array.isArray(features)) {
          setFeatures(features);
          setAllFeatures(features);
        }
        break;
      }

      // Task events
      case "TASK_CREATED": {
        const { task, feature } = data as {
          task: Task;
          feature: {
            id: string;
            total_tasks: number;
            completed_tasks: number;
            progress_percentage: number;
          };
        };
        setTasks((prev) =>
          prev.some((t) => t.id === task.id) ? prev : [...prev, task],
        );
        setFeatures((prev) =>
          prev.map((f) => (f.id === feature.id ? { ...f, ...feature } : f)),
        );
        notifyScheduleRefresh();
        break;
      }
      case "TASK_UPDATED": {
        const task = data as Task;
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
        );
        notifyScheduleRefresh();
        break;
      }
      case "TASK_DELETED": {
        const { id, feature } = data as {
          id: string;
          feature: {
            id: string;
            total_tasks: number;
            completed_tasks: number;
            progress_percentage: number;
          };
        };
        setTasks((prev) => prev.filter((t) => t.id !== id));
        setFeatures((prev) =>
          prev.map((f) => (f.id === feature.id ? { ...f, ...feature } : f)),
        );
        notifyScheduleRefresh();
        break;
      }
      case "TASK_MOVED": {
        const { task, feature } = data as {
          task: Task;
          feature: {
            id: string;
            total_tasks: number;
            completed_tasks: number;
            progress_percentage: number;
          };
        };
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)),
        );
        setFeatures((prev) =>
          prev.map((f) => (f.id === feature.id ? { ...f, ...feature } : f)),
        );
        notifyScheduleRefresh();
        break;
      }

      // Block events
      case "BLOCK_CREATED": {
        const block = data as Block;
        setBlocks((prev) => {
          if (prev.some((b) => b.id === block.id)) return prev;
          // Done 블록 position을 새 블록 뒤로 밀어서 순서 보장
          return [
            ...prev.map((b) =>
              b.fixed_type === "DONE" && b.position <= block.position
                ? { ...b, position: block.position + 1 }
                : b,
            ),
            block,
          ];
        });
        break;
      }
      case "BLOCK_UPDATED": {
        const block = data as Block;
        setBlocks((prev) => prev.map((b) => (b.id === block.id ? block : b)));
        break;
      }
      case "BLOCK_DELETED": {
        const { id } = data as { id: string };
        setBlocks((prev) => prev.filter((b) => b.id !== id));
        break;
      }
      case "BLOCKS_REORDERED": {
        const currentMilestone = milestoneIdRef.current;
        if (
          currentMilestone &&
          currentMilestone !== "all" &&
          currentMilestone !== "none"
        ) {
          reloadBlocksForMilestone(currentMilestone);
        } else {
          const { blocks: reorderedBlocks } = data as { blocks: Block[] };
          if (Array.isArray(reorderedBlocks)) {
            setBlocks(reorderedBlocks);
          }
        }
        break;
      }

      case "BLOCK_VISIBILITY_CHANGED": {
        // 다른 사용자가 블록 숨김/표시를 변경한 경우 블록 재로드
        reloadBlocksForMilestone(milestoneIdRef.current);
        break;
      }

      // Checklist events
      case "CHECKLIST_CREATED": {
        const { item: createdItem, task_id: createTaskId } = data as {
          item: ChecklistItem;
          task_id: string;
        };
        setChecklistDataMap((prev) => ({
          ...prev,
          [createTaskId]: [...(prev[createTaskId] || []), createdItem],
        }));
        setTasks((prev) =>
          prev.map((t) =>
            t.id === createTaskId
              ? {
                  ...t,
                  checklist_total: (t.checklist_total || 0) + 1,
                }
              : t,
          ),
        );
        setWsChecklistEvent(event);
        notifyScheduleRefresh();
        break;
      }
      case "CHECKLIST_UPDATED": {
        const { item: updatedItem, task_id: updateTaskId } = data as {
          item: ChecklistItem;
          task_id: string;
        };
        setChecklistDataMap((prev) => ({
          ...prev,
          [updateTaskId]: (prev[updateTaskId] || []).map((ci) =>
            ci.id === updatedItem.id ? updatedItem : ci,
          ),
        }));
        setWsChecklistEvent(event);
        notifyScheduleRefresh();
        break;
      }
      case "CHECKLIST_DELETED": {
        const { id: deletedId, task_id: deleteTaskId } = data as {
          id: string;
          task_id: string;
        };
        setChecklistDataMap((prev) => {
          const items = (prev[deleteTaskId] || []).filter(
            (ci) => ci.id !== deletedId,
          );
          return { ...prev, [deleteTaskId]: items };
        });
        setTasks((prev) =>
          prev.map((t) =>
            t.id === deleteTaskId
              ? {
                  ...t,
                  checklist_total: Math.max(0, (t.checklist_total || 0) - 1),
                }
              : t,
          ),
        );
        setWsChecklistEvent(event);
        notifyScheduleRefresh();
        break;
      }
      case "CHECKLIST_TOGGLED": {
        const { item: toggledItem, task_id: toggleTaskId } = data as {
          item: ChecklistItem;
          task_id: string;
        };
        setChecklistDataMap((prev) => ({
          ...prev,
          [toggleTaskId]: (prev[toggleTaskId] || []).map((ci) =>
            ci.id === toggledItem.id ? toggledItem : ci,
          ),
        }));
        const delta = toggledItem.completed ? 1 : -1;
        setTasks((prev) =>
          prev.map((t) =>
            t.id === toggleTaskId
              ? {
                  ...t,
                  checklist_completed: Math.max(
                    0,
                    (t.checklist_completed || 0) + delta,
                  ),
                }
              : t,
          ),
        );
        // 캐스케이드 펄스: Task의 Feature 칩에 시각적 연결 표시
        const cascadeTask = tasksRef.current.find(
          (t) => t.id === toggleTaskId,
        );
        if (cascadeTask?.feature_id) {
          setCascadeFeatureId(cascadeTask.feature_id);
          setTimeout(() => setCascadeFeatureId(null), 1000);
        }

        setWsChecklistEvent(event);
        notifyScheduleRefresh();
        break;
      }

      // Comment events
      case "COMMENT_CREATED":
      case "COMMENT_UPDATED":
      case "COMMENT_DELETED":
      case "COMMENT_REACTION_TOGGLED":
        setWsCommentEvent(event);
        break;

      // Schedule events
      case "SCHEDULE_CREATED":
      case "SCHEDULE_UPDATED":
      case "SCHEDULE_DELETED":
        setScheduleRefreshKey((prev) => prev + 1);
        break;

      // Meeting events
      case "MEETING_CREATED":
      case "MEETING_UPDATED":
      case "MEETING_DELETED":
        setMeetingRefreshKey((prev) => prev + 1);
        break;

      // Member events
      case "MEMBER_UPDATED": {
        const memberData = data as {
          id?: string;
          user?: { id?: string };
          assignee_color?: string | null;
          role?: string;
          job_role?: {
            id: string;
            name: string;
            color?: string | null;
            icon?: string | null;
          } | null;
        };
        if (memberData?.id) {
          setBoardMembersData((prev) =>
            prev.map((m) =>
              m.id === memberData.id
                ? {
                    ...m,
                    assigneeColor: memberData.assignee_color ?? null,
                    role:
                      (memberData.role?.toLowerCase() as MemberRole) || m.role,
                    jobRole:
                      memberData.job_role !== undefined
                        ? memberData.job_role
                        : m.jobRole,
                  }
                : m,
            ),
          );
        }
        break;
      }

      // Job Role events — 직군 정의 변경 시 목록 + 멤버 매핑 새로고침
      case "JOB_ROLE_UPDATED": {
        if (boardId) {
          jobRoleService
            .list(boardId)
            .then((roles) => setJobRoles(roles))
            .catch(() => {});
          memberService
            .getMembers(boardId)
            .then((res) => {
              setBoardMembersData(
                res.members.map((m: any) => ({
                  id: m.id,
                  userId: m.user.id,
                  name: m.user.name,
                  email: m.user.email,
                  role: m.role.toLowerCase() as MemberRole,
                  assigneeColor: m.assignee_color || null,
                  jobRole: m.job_role || null,
                })),
              );
            })
            .catch(() => {});
        }
        break;
      }

      // Notification events
      case "NOTIFICATION_CREATED":
        setUnreadNotificationCount((prev) => prev + 1);
        break;

      // Trash restore events — refetch features/tasks/checklists from server
      case "FEATURE_RESTORED":
      case "TASK_RESTORED":
      case "CHECKLIST_RESTORED": {
        const mid =
          milestoneIdRef.current && milestoneIdRef.current !== "all"
            ? milestoneIdRef.current
            : undefined;
        reloadFeaturesAndTasks(mid).catch(() => {});
        break;
      }

      default:
        break;
    }
  }, []);

  const { connectionStatus, onlineUsers } = useBoardWebSocket({
    boardId: boardId || null,
    onEvent: handleWebSocketEvent,
    enabled: isRealtimeEnabled,
  });

  // 재연결 시 누락된 이벤트 복구
  const hasConnectedBefore = useRef(false);
  useEffect(() => {
    if (connectionStatus === "connected") {
      if (hasConnectedBefore.current && boardId) {
        const milestoneId =
          kanbanSelectedMilestoneId !== "all"
            ? kanbanSelectedMilestoneId
            : undefined;
        reloadFeaturesAndTasks(milestoneId);
        blockService
          .getBlocks(boardId)
          .then(setBlocks)
          .catch(() => {});
        notificationAPI
          .getUnreadCount(boardId)
          .then((res) => setUnreadNotificationCount(res.unread_count))
          .catch(() => {});
      }
      hasConnectedBefore.current = true;
    }
  }, [connectionStatus, boardId]);

  // 402 이벤트 리스너 (크레딧 소진 시)
  useEffect(() => {
    const handler = () => {
      setCreditModalMode("exhausted");
      setShowCreditModal(true);
    };
    window.addEventListener("ai-credits-exhausted", handler);
    return () => window.removeEventListener("ai-credits-exhausted", handler);
  }, []);

  // AI 크레딧 구매 완료 콜백
  const handleCreditPurchaseComplete = (updatedCredits: AiCredits) => {
    setAiCredits(updatedCredits);
    setShowCreditModal(false);
  };

  // 결제 완료 후 pending action 처리
  useEffect(() => {
    const pendingSeatAction = localStorage.getItem("pending_payment_action");
    if (pendingSeatAction && boardId && !isLoading) {
      localStorage.removeItem("pending_payment_action");
      try {
        const action = JSON.parse(pendingSeatAction);
        if (action.type === "roleChange" && action.pendingMemberId) {
          handleUpdateMemberRole(action.pendingMemberId, action.pendingRole);
        } else if (action.type === "invite" && action.pendingEmail) {
          handleAddMember(action.pendingEmail, action.pendingRole);
        }
      } catch (e) {
        console.error("Failed to process pending seat action:", e);
      }
    }
  }, [boardId, isLoading]);

  // 직군(JobRole) 목록 로드
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    jobRoleService
      .list(boardId)
      .then((roles) => {
        if (!cancelled) setJobRoles(roles);
      })
      .catch(() => {
        if (!cancelled) setJobRoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    contractorService
      .list(boardId)
      .then((list) => {
        if (!cancelled) setHeaderContractors(list as BoardContractor[]);
      })
      .catch(() => {
        if (!cancelled) setHeaderContractors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  const refreshJobRoles = useCallback(async () => {
    if (!boardId) return;
    try {
      const roles = await jobRoleService.list(boardId);
      setJobRoles(roles);
    } catch (err) {
      console.error("Failed to refresh job roles:", err);
    }
  }, [boardId]);

  const handleUpdateMemberJobRole = useCallback(
    async (memberId: string, jobRoleId: string | null) => {
      if (!boardId) return;
      const prev = boardMembersData;
      const targetRole = jobRoleId
        ? jobRoles.find((r) => r.id === jobRoleId) || null
        : null;
      setBoardMembersData(
        prev.map((m) =>
          m.id === memberId
            ? {
                ...m,
                jobRole: targetRole
                  ? {
                      id: targetRole.id,
                      name: targetRole.name,
                      color: targetRole.color,
                      icon: targetRole.icon,
                    }
                  : null,
              }
            : m,
        ),
      );
      try {
        await memberService.updateMemberJobRole(boardId, memberId, jobRoleId);
        await refreshJobRoles();
      } catch (err) {
        console.error("Failed to update member jobRole:", err);
        setBoardMembersData(prev);
      }
    },
    [boardId, boardMembersData, jobRoles, refreshJobRoles, setBoardMembersData],
  );

  // ShareBoardModal 열릴 때 멤버 목록 새로고침
  useEffect(() => {
    if (!isShareBoardModalOpen || !boardId) return;
    refreshMembers();
  }, [isShareBoardModalOpen, boardId, refreshMembers]);

  // STANDARD 전환 후 첫 방문 시 Premium 혜택 모달 자동 표시
  useEffect(() => {
    if (!boardId || !tierInfo || hideBilling || isLoading) return;
    if (tierInfo.tier === "STANDARD") {
      const storageKey = `bridge_premium_benefits_shown_${boardId}`;
      if (!localStorage.getItem(storageKey)) {
        setIsPremiumBenefitsModalOpen(true);
        localStorage.setItem(storageKey, "true");
      }
    }
  }, [boardId, tierInfo, hideBilling, isLoading]);

  // Feature별 마일스톤 연결 수 맵 (MilestoneModal 정렬용)
  const featureMilestoneCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ms of milestones) {
      if (ms.features) {
        for (const f of ms.features) {
          map[f.id] = (map[f.id] || 0) + 1;
        }
      }
    }
    return map;
  }, [milestones]);

  // Upgrade Modal 열기 헬퍼
  const openUpgradeModal = (trigger: UpgradeTrigger) => {
    if (hideBilling) return;
    setUpgradeTrigger(trigger);
    setIsUpgradeModalOpen(true);
  };

  // 뷰 모드 변경 핸들러 (Premium 기능 체크)
  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === "gantt" && !canAccessSchedule) {
      openUpgradeModal("weekly_schedule");
      return;
    }
    if (mode === "statistics") {
      if (!canAccessStatistics) {
        openUpgradeModal("statistics");
        return;
      }
      if (!isAdminOrOwner) {
        return;
      }
    }
    if (mode === "ai_report" && !canAccessStatistics) {
      openUpgradeModal("statistics");
      return;
    }
    // 캘린더 진입 시 기본 담당자 필터 (현재 사용자)
    if (
      mode === "calendar" &&
      currentUser &&
      filterOptions.members.length === 0
    ) {
      setFilterOptions((prev) => ({ ...prev, members: [currentUser.name] }));
    }
    // 캘린더에서 벗어날 때 자동 적용된 필터만 정리
    if (mode !== "calendar" && viewMode === "calendar") {
      const isOnlyMyFilter =
        filterOptions.members.length === 1 &&
        currentUser &&
        filterOptions.members[0] === currentUser.name &&
        !filterOptions.keyword &&
        filterOptions.features.length === 0 &&
        filterOptions.tags.length === 0 &&
        filterOptions.cardStatus.length === 0;
      if (isOnlyMyFilter) {
        setFilterOptions((prev) => ({ ...prev, members: [] }));
      }
    }
    // 마일스톤 뷰 Premium 권한 체크
    if (mode === "milestone" && !canAccessMilestone) {
      openUpgradeModal("milestone");
      return;
    }
    // 보드 서브뷰 서브모드 기억 (kanban/gantt/calendar/list/milestone)
    if (BOARD_SUB_MODES.includes(mode)) {
      localStorage.setItem(`boardSubMode_${boardId}`, mode);
    }
    // 일정 탭 서브모드 기억 (현재 schedule만)
    if (mode === "schedule") {
      localStorage.setItem(`scheduleSubMode_${boardId}`, mode);
    }
    if (mode === "statistics" || mode === "ai_report") {
      localStorage.setItem(`aiSubMode_${boardId}`, mode);
    }
    setViewMode(mode);
    localStorage.setItem(`viewMode_${boardId}`, mode);
  };

  // ======== 키보드 단축키 훅 ========
  useKeyboardShortcuts({
    viewMode,
    onViewModeChange: handleViewModeChange,
    onScheduleSubTabChange: handleScheduleSubTabChange as (tab: string) => void,
    onStatisticsSubTabChange: (tab: string) =>
      setStatisticsActiveView(tab as StatisticsViewType),
    onFocusSearch: () => searchInputRef.current?.focus(),
    onOpenAddFeature: () => setIsAddFeatureModalOpen(true),
    onOpenAddBlock: () => setIsAddBlockModalOpen(true),
    onOpenShortcutsHelp: () => setIsShortcutsHelpOpen(true),
    onResetFilters: handleResetFilters,
    onToggleMyFilter: handleToggleMyFilter,
    filteredFeatures,
    selectedFeatureIds,
    onSelectFeatureIds: setSelectedFeatureIds,
    onToggleExpandCollapse: handleToggleExpandCollapse,
    canEdit,
    isAdminOrOwner,
    isAnyModalOpen,
  });

  // 마일스톤 열기 핸들러 (Premium 기능 체크)
  const handleOpenMilestoneWithCheck = async (milestone?: Milestone) => {
    if (!canAccessMilestone) {
      openUpgradeModal("milestone");
      return;
    }
    if (milestone && boardId) {
      try {
        const detailed = await milestoneService.getMilestone(
          boardId,
          milestone.id,
        );
        setSelectedMilestone(detailed);
      } catch {
        setSelectedMilestone(milestone);
      }
    } else {
      setSelectedMilestone(null);
    }
    setIsMilestoneModalOpen(true);
  };

  // Seat 기반 업그레이드 핸들러 (Polar Checkout 리다이렉트)
  const handleSeatUpgrade = async (
    billingCycle: "MONTHLY" | "YEARLY",
    seatCount: number,
  ) => {
    if (!boardId) return;
    try {
      await subscriptionService.startSeatSubscription(boardId, {
        billing_cycle: billingCycle,
        seat_count: seatCount,
      });
      // Polar checkout 리다이렉트가 발생하므로 여기까지 도달하지 않음
    } catch (error: any) {
      console.error("Failed to upgrade:", error);
      throw error;
    }
  };

  // 시트 구매 후 자동 재초대/역할변경 핸들러
  const handlePurchaseSeatsAndRetry = async (additionalSeats: number) => {
    if (!boardId || !seatPurchaseModal) return;

    const { pendingEmail, pendingRole, pendingMemberId } = seatPurchaseModal;
    const pendingAction = JSON.stringify({
      type: pendingMemberId ? "roleChange" : "invite",
      pendingEmail,
      pendingRole,
      pendingMemberId,
    });
    localStorage.setItem("pending_checkout_board_id", boardId);
    localStorage.setItem("pending_payment_action", pendingAction);
    setSeatPurchaseModal(null);

    try {
      await subscriptionService.purchaseSeats(boardId, additionalSeats);
      // Polar checkout 리다이렉트가 발생하므로 여기까지 도달하지 않음
    } catch (error: any) {
      localStorage.removeItem("pending_checkout_board_id");
      localStorage.removeItem("pending_payment_action");
      throw error;
    }
  };

  // 조직 시트 구매 후 자동 재초대/역할변경 핸들러
  const handleOrgPurchaseSeatsAndRetry = async (additionalSeats: number) => {
    if (!orgSeatLimitModal) return;

    const { orgId, pendingEmail, pendingRole, pendingMemberId } =
      orgSeatLimitModal;

    try {
      await orgSubscriptionService.purchaseSeats(orgId, additionalSeats);
      setOrgSeatLimitModal(null);

      // 시트 구매 성공 후 재시도
      if (pendingMemberId) {
        await handleUpdateMemberRole(pendingMemberId, pendingRole);
      } else if (pendingEmail) {
        await handleAddMember(pendingEmail, pendingRole);
      }
    } catch (error: any) {
      console.error("Failed to purchase org seats:", error);
      alert(error?.message || t("orgSeatLimit.purchaseFailed"));
    }
  };

  // 칸반 뷰 마일스톤 선택 핸들러
  const handleKanbanMilestoneSelect = async (milestoneId: string) => {
    setKanbanSelectedMilestoneId(milestoneId);
    if (boardId) {
      try {
        const saveMilestoneId =
          milestoneId === "all" || milestoneId === "none" ? null : milestoneId;
        await boardService.updateSelectedMilestone(boardId, saveMilestoneId);
        setBoard((prev) =>
          prev ? { ...prev, selected_milestone_id: saveMilestoneId } : prev,
        );
        const reloadMilestoneId =
          milestoneId === "all" ? undefined : milestoneId;
        await reloadFeaturesAndTasks(reloadMilestoneId);
      } catch (error) {
        console.error("Failed to save selected milestone:", error);
      }
    }
  };

  // 보드 멤버 관리 함수
  const handleAddMember = async (email: string, role: MemberRole) => {
    if (!boardId) return;

    if (!email.includes("@")) {
      alert(t("kanban.invalidEmail"));
      return;
    }

    if (boardMembersData.some((m) => m.email === email)) {
      alert(t("kanban.memberAlreadyAdded"));
      return;
    }

    const backendRole = role.toUpperCase();

    try {
      const result = await memberService.inviteMember(
        boardId,
        email,
        backendRole as any,
      );

      if (result.type === "DIRECT_ADD" && result.member) {
        setBoardMembersData([
          ...boardMembersData,
          {
            id: result.member.id,
            userId: result.member.user.id,
            name: result.member.user.name,
            email: result.member.user.email,
            role: result.member.role.toLowerCase() as MemberRole,
          },
        ]);
        alert(t("kanban.memberAdded", { name: result.member.user.name }));
      } else if (result.type === "EMAIL_SENT") {
        alert(t("kanban.inviteEmailSent", { email: result.email }));
      }
    } catch (error: any) {
      console.error("Failed to invite member:", error);
      if (error?.code === "OS003" && error?.errors) {
        setOrgSeatLimitModal({
          open: true,
          orgId: error.errors.org_id,
          seatCount: parseInt(error.errors.seat_count),
          activeMemberCount: parseInt(error.errors.active_member_count),
          monthlyPricePerSeat: parseInt(error.errors.monthly_price_per_seat),
          yearlyPricePerSeat: parseInt(error.errors.yearly_price_per_seat),
          isOrgAdmin: error.errors.is_org_admin === "true",
          pendingEmail: email,
          pendingRole: role,
        });
        return;
      }
      if (error?.code === "S005" && error?.errors) {
        setSeatPurchaseModal({
          open: true,
          seatCount: parseInt(error.errors.seat_count),
          billableMemberCount: parseInt(error.errors.billable_member_count),
          pendingEmail: email,
          pendingRole: role,
        });
        return;
      }
      alert(error?.message || t("kanban.inviteFailed"));
    }
  };

  const handleUpdateMemberRole = async (memberId: string, role: MemberRole) => {
    if (!boardId) return;

    const prevMembers = [...boardMembersData];
    setBoardMembersData(
      boardMembersData.map((m) => (m.id === memberId ? { ...m, role } : m)),
    );

    const backendRole = role.toUpperCase();

    try {
      await memberService.updateMemberRole(
        boardId,
        memberId,
        backendRole as any,
      );
    } catch (error: any) {
      console.error("Failed to update member role:", error);
      setBoardMembersData(prevMembers);
      if (error?.code === "OS003" && error?.errors) {
        setOrgSeatLimitModal({
          open: true,
          orgId: error.errors.org_id,
          seatCount: parseInt(error.errors.seat_count),
          activeMemberCount: parseInt(error.errors.active_member_count),
          monthlyPricePerSeat: parseInt(error.errors.monthly_price_per_seat),
          yearlyPricePerSeat: parseInt(error.errors.yearly_price_per_seat),
          isOrgAdmin: error.errors.is_org_admin === "true",
          pendingEmail: "",
          pendingRole: role,
          pendingMemberId: memberId,
        });
        return;
      }
      if (error?.code === "S005" && error?.errors) {
        setSeatPurchaseModal({
          open: true,
          seatCount: parseInt(error.errors.seat_count),
          billableMemberCount: parseInt(error.errors.billable_member_count),
          pendingEmail: "",
          pendingRole: role,
          pendingMemberId: memberId,
        });
        return;
      }
      alert(error?.message || t("kanban.roleChangeFailed"));
    }
  };

  const handleUpdateMemberColor = async (
    memberId: string,
    color: string | null,
  ) => {
    if (!boardId) return;
    const prevMembers = [...boardMembersData];
    setBoardMembersData(
      boardMembersData.map((m) =>
        m.id === memberId ? { ...m, assigneeColor: color } : m,
      ),
    );
    try {
      await memberService.updateMemberColor(boardId, memberId, color);
    } catch (error: any) {
      console.error("Failed to update member color:", error);
      setBoardMembersData(prevMembers);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!boardId) return;

    const targetMember = boardMembersData.find((m) => m.id === memberId);
    if (targetMember?.userId === currentUserId) {
      alert(t("kanban.cannotRemoveSelf"));
      return;
    }

    const prevMembers = [...boardMembersData];
    setBoardMembersData(boardMembersData.filter((m) => m.id !== memberId));

    try {
      await memberService.removeMember(boardId, memberId);
    } catch (error: any) {
      console.error("Failed to remove member:", error);
      setBoardMembersData(prevMembers);
      alert(error?.message || t("kanban.removeMemberFailed"));
    }
  };

  const handleTransferOwnership = async (newOwnerUserId: string) => {
    if (!boardId) return;
    await memberService.transferOwnership(boardId, newOwnerUserId);
    await refreshMembers();
  };

  const handleReorderMembers = async (memberIds: string[]) => {
    if (!boardId) return;

    const prevMembers = [...boardMembersData];
    const memberMap = new Map(boardMembersData.map((m) => [m.id, m]));
    setBoardMembersData(
      memberIds.map((id) => memberMap.get(id)!).filter(Boolean),
    );

    try {
      await memberService.reorderMembers(boardId, memberIds);
    } catch (error: any) {
      console.error("Failed to reorder members:", error);
      setBoardMembersData(prevMembers);
    }
  };

  // 초대 링크 핸들러
  const handleCreateInviteLink = async (
    role: string,
    maxUses: number,
    expiresIn: string,
  ) => {
    if (!boardId) return {} as InviteLink;

    let expiresInHours: number | null = null;
    if (expiresIn) {
      const match = expiresIn.match(/^(\d+)([dhm])$/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        if (unit === "d") expiresInHours = value * 24;
        else if (unit === "h") expiresInHours = value;
        else if (unit === "m") expiresInHours = Math.ceil(value / 60);
      }
    }

    const link = await inviteLinkService.createInviteLink(boardId, {
      role: role as "ADMIN" | "MEMBER" | "VIEWER",
      max_uses: maxUses || null,
      expires_in_hours: expiresInHours,
    });
    setInviteLinks([...inviteLinks, link]);
    return link;
  };

  const handleDeleteInviteLink = async (linkId: string) => {
    if (!boardId) return;
    await inviteLinkService.deleteInviteLink(boardId, linkId);
    setInviteLinks(inviteLinks.filter((l) => l.id !== linkId));
  };

  // 구독 핸들러
  const handleChangeBillingCycle = async (
    billingCycle: "MONTHLY" | "YEARLY",
  ) => {
    if (!boardId) return;
    const newSubscription = await subscriptionService.changePlan(
      boardId,
      billingCycle,
    );
    setSubscription(newSubscription);
  };

  const handleSubscriptionPurchaseSeats = async (additionalSeats: number) => {
    if (!boardId) return;
    localStorage.setItem("pending_checkout_board_id", boardId);
    try {
      await subscriptionService.purchaseSeats(boardId, additionalSeats);
      // Polar checkout 리다이렉트가 발생하므로 여기까지 도달하지 않음
    } catch (error: any) {
      localStorage.removeItem("pending_checkout_board_id");
      throw error;
    }
  };

  const handleCancelSubscription = async () => {
    if (!boardId) return;
    await subscriptionService.cancelSubscription(boardId);
    const subscriptionData = await subscriptionService.getSubscription(boardId);
    setSubscription(subscriptionData);
  };

  const handleUndoCancellation = async () => {
    if (!boardId) return;
    await subscriptionService.undoCancellation(boardId);
    const subscriptionData = await subscriptionService.getSubscription(boardId);
    setSubscription(subscriptionData);
  };

  // 활동 로그 핸들러
  const handleLoadMoreActivity = async () => {
    if (!hasMoreActivity || !activityCursor || !boardId) return;
    const response = await activityService.getActivities(boardId, {
      cursor: activityCursor,
      limit: 20,
    });
    setActivities([...activities, ...response.activities]);
    setActivityCursor(response.next_cursor || undefined);
    setHasMoreActivity(response.has_more);
  };

  // 블록 관리
  const handleAddBlock = async (name: string, color: string) => {
    if (!boardId) return;

    try {
      const milestoneId =
        kanbanSelectedMilestoneId &&
        kanbanSelectedMilestoneId !== "all" &&
        kanbanSelectedMilestoneId !== "none"
          ? kanbanSelectedMilestoneId
          : undefined;
      await blockService.createBlock(boardId, {
        name,
        color,
        milestone_id: milestoneId,
      });
      await reloadBlocksForMilestone();
    } catch (error) {
      console.error("Failed to create block:", error);
    }
  };

  const handleEditBlock = async (
    blockId: string,
    name: string,
    color: string,
  ) => {
    if (!boardId) return;
    const previousBlocks = blocks;
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, name, color } : b)),
    );
    try {
      await blockService.updateBlock(boardId, blockId, { name, color });
    } catch (error) {
      console.error("Failed to update block:", error);
      setBlocks(previousBlocks);
    }
  };

  const handleDeleteBlock = useCallback(
    async (blockId: string) => {
    const blockToDelete = blocks.find((b) => b.id === blockId);
    if (!blockToDelete || blockToDelete.type === "FIXED") return;

    const previousBlocks = blocks;
    const previousTasks = tasks;

    const updatedTasks = tasks.map((task) =>
      task.block_id === blockId ? { ...task, block_id: "task" } : task,
    );

    const updatedBlocks = blocks
      .filter((b) => b.id !== blockId)
      .map((block) => {
        if (block.position > blockToDelete.position) {
          return { ...block, position: block.position - 1 };
        }
        return block;
      });

    setTasks(updatedTasks);
    setBlocks(updatedBlocks);

    if (boardId) {
      try {
        await blockService.deleteBlock(boardId, blockId);
      } catch (error) {
        console.error("Failed to delete block:", error);
        setBlocks(previousBlocks);
        setTasks(previousTasks);
      }
    }
    },
    [blocks, tasks, boardId],
  );

  const reloadBlocksForMilestone = useCallback(
    async (overrideMilestoneId?: string) => {
      if (!boardId) return;
      const effectiveMilestoneId =
        overrideMilestoneId ?? kanbanSelectedMilestoneId;
      const reloadMilestoneId =
        effectiveMilestoneId &&
        effectiveMilestoneId !== "all" &&
        effectiveMilestoneId !== "none"
          ? effectiveMilestoneId
          : undefined;
      const blockResult = await blockService.getBlocksWithHidden(
        boardId,
        reloadMilestoneId,
      );
      setBlocks(blockResult.blocks);
      setHiddenBlocks(blockResult.hiddenBlocks);
    },
    [boardId, kanbanSelectedMilestoneId],
  );

  const handleHideBlock = useCallback(
    async (blockId: string) => {
      if (
        !boardId ||
        !kanbanSelectedMilestoneId ||
        kanbanSelectedMilestoneId === "all" ||
        kanbanSelectedMilestoneId === "none"
      )
        return;

      try {
        await milestoneBlockAPI.toggleVisibility(
          boardId,
          kanbanSelectedMilestoneId,
          blockId,
          true,
        );
        await reloadBlocksForMilestone();
      } catch (error) {
        console.error("Failed to hide block:", error);
      }
    },
    [boardId, kanbanSelectedMilestoneId, reloadBlocksForMilestone],
  );

  const handleShowBlock = async (blockId: string) => {
    if (
      !boardId ||
      !kanbanSelectedMilestoneId ||
      kanbanSelectedMilestoneId === "all" ||
      kanbanSelectedMilestoneId === "none"
    )
      return;

    try {
      await milestoneBlockAPI.toggleVisibility(
        boardId,
        kanbanSelectedMilestoneId,
        blockId,
        false,
      );
      await reloadBlocksForMilestone();
    } catch (error) {
      console.error("Failed to show block:", error);
    }
  };

  // 숨긴 블록의 원래 상대 위치를 유지하면서 보이는 블록의 새 순서를 백엔드에 저장
  const persistBlockReorder = (newVisibleOrder: Block[]) => {
    if (!boardId) return;
    const visibleOrder = newVisibleOrder.map((b) => b.id);
    const visibleSet = new Set(visibleOrder);

    blockService
      .getBlocks(boardId)
      .then((allBlocks) => {
        const reorderIds: string[] = [];
        let visibleIdx = 0;
        for (const block of allBlocks) {
          if (visibleSet.has(block.id)) {
            reorderIds.push(visibleOrder[visibleIdx++]);
          } else {
            reorderIds.push(block.id);
          }
        }
        blockService.reorderBlocks(boardId, reorderIds).catch((error) => {
          console.error("Failed to reorder blocks:", error);
        });
      })
      .catch((error) => {
        console.error("Failed to load all blocks for reorder:", error);
      });
  };

  // @dnd-kit 블록 드래그 상태
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const blockSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleBlockDragStart = (event: DragStartEvent) => {
    setActiveBlockId(event.active.id as string);
  };

  const handleBlockDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBlockId(null);

    if (!over || active.id === over.id) return;

    // SortableContext에 포함된 블록만 (FEATURE, TASK 제외)
    const oldIndex = sortableBlocks.findIndex((b) => b.id === active.id);
    const newIndex = sortableBlocks.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(sortableBlocks, oldIndex, newIndex);
    // FEATURE + TASK 블록을 앞에 유지
    const fixedBlocks = sortedBlocks.filter(
      (b) => b.fixed_type === "FEATURE" || b.fixed_type === "TASK",
    );
    const fullOrder = [...fixedBlocks, ...newOrder];

    const updatedBlocks = blocks.map((b) => {
      const newPos = fullOrder.findIndex((nb) => nb.id === b.id);
      return { ...b, position: newPos };
    });

    setBlocks(updatedBlocks);

    persistBlockReorder(fullOrder);
  };

  const activeBlock = activeBlockId
    ? sortedBlocks.find((b) => b.id === activeBlockId)
    : null;

  // Feature 관리
  const handleAddFeature = async (data: {
    title: string;
    description?: string;
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
  }) => {
    if (!boardId) return;

    try {
      const newFeature = await featureService.createFeature(boardId, {
        title: data.title,
        description: data.description,
        color: getRandomFeatureColor(),
        start_date: data.startDate,
        due_date: data.dueDate,
      });

      if (data.milestoneId) {
        try {
          const updatedMilestone = await milestoneService.addFeatures(
            boardId,
            data.milestoneId,
            [newFeature.id],
          );
          setMilestones((prev) =>
            prev.map((m) =>
              m.id === updatedMilestone.id ? updatedMilestone : m,
            ),
          );
        } catch (error) {
          console.error("Failed to link feature to milestone:", error);
        }
      }

      setFeatures([...features, newFeature]);
      setAllFeatures([...allFeatures, newFeature]);
      setSelectedFeature(newFeature);
      setIsFeatureModalOpen(true);
      notifyScheduleRefresh();
    } catch (error) {
      console.error("Failed to create feature:", error);
    }
  };

  const handleFeatureClick = useCallback((feature: Feature) => {
    setSelectedFeature(feature);
    setIsFeatureModalOpen(true);
  }, []);

  // Feature 칩 토글
  const handleToggleFeatureChip = useCallback(
    (featureId: string) => {
      setSelectedFeatureIds((prev) => {
        if (prev === null) {
          return features.map((f) => f.id).filter((id) => id !== featureId);
        }
        if (prev.includes(featureId)) {
          const next = prev.filter((id) => id !== featureId);
          return next;
        }
        const next = [...prev, featureId];
        return next.length === features.length ? null : next;
      });
    },
    [features],
  );

  const handleSelectAllFeatureChips = useCallback(() => {
    setSelectedFeatureIds((prev) => (prev === null ? [] : null));
  }, []);

  const handleOpenAddFeatureModal = useCallback(() => {
    setIsAddFeatureModalOpen(true);
  }, []);

  const handleUpdateFeature = async (updates: Partial<Feature>) => {
    if (!boardId || !updates.id) return;

    const featureId = updates.id;

    try {
      const updatedFeature = await featureService.updateFeature(
        boardId,
        featureId,
        {
          title: updates.title,
          description: updates.description,
          color: updates.color,
          assignee_id: updates.assignee?.id,
          start_date: updates.start_date,
          due_date: updates.due_date,
        },
      );
      setFeatures(
        features.map((f) => (f.id === featureId ? updatedFeature : f)),
      );
      setAllFeatures(
        allFeatures.map((f) => (f.id === featureId ? updatedFeature : f)),
      );
    } catch (error) {
      console.error("Failed to update feature:", error);
      setFeatures(
        features.map((f) => (f.id === featureId ? { ...f, ...updates } : f)),
      );
      setAllFeatures(
        allFeatures.map((f) => (f.id === featureId ? { ...f, ...updates } : f)),
      );
    }
  };

  const handleDeleteFeature = async (
    featureId: string,
    taskMigrations?: Array<{ task_id: string; target_feature_id: string }>,
  ) => {
    if (!boardId) return;

    // Optimistic UI: 피처 제거
    setFeatures(features.filter((f) => f.id !== featureId));
    setAllFeatures(allFeatures.filter((f) => f.id !== featureId));

    if (taskMigrations && taskMigrations.length > 0) {
      // 이관된 태스크: feature_id 업데이트
      const migrationMap = new Map(
        taskMigrations.map((m) => [m.task_id, m.target_feature_id]),
      );
      setTasks(
        (prev) =>
          prev
            .map((t) => {
              const targetFeatureId = migrationMap.get(t.id);
              if (targetFeatureId) {
                const targetFeature = features.find(
                  (f) => f.id === targetFeatureId,
                );
                return {
                  ...t,
                  feature_id: targetFeatureId,
                  feature_title: targetFeature?.title || t.feature_title,
                  feature_color: targetFeature?.color || t.feature_color,
                };
              }
              // 이관 안 된 태스크는 삭제 대상
              return t.feature_id === featureId ? null : t;
            })
            .filter(Boolean) as typeof tasks,
      );
    } else {
      // 전체 삭제
      setTasks(tasks.filter((t) => t.feature_id !== featureId));
    }

    setIsFeatureModalOpen(false);
    setSelectedFeature(null);

    const deletedFeature = features.find((f) => f.id === featureId);
    const deletedTitle =
      deletedFeature?.title ?? t("trash.toast.untitledFeature", "삭제된 피처");

    try {
      await featureService.deleteFeature(boardId, featureId, taskMigrations);
      toast(
        t("trash.toast.featureDeleted", '"{{title}}" 피처를 삭제했습니다', {
          title: deletedTitle,
        }),
        {
          duration: 8000,
          action: {
            label: t("trash.toast.undo", "되돌리기"),
            onClick: async () => {
              try {
                await trashAPI.restoreFeature(boardId, featureId);
                const mid =
                  milestoneIdRef.current && milestoneIdRef.current !== "all"
                    ? milestoneIdRef.current
                    : undefined;
                await reloadFeaturesAndTasks(mid);
                toast.success(t("trash.toast.restored", "복구되었습니다"));
              } catch (e) {
                console.error("Failed to restore feature:", e);
                toast.error(
                  t("trash.toast.restoreFailed", "복구에 실패했습니다"),
                );
              }
            },
          },
        },
      );
    } catch (error) {
      console.error("Failed to delete feature:", error);
    }
  };

  // Task 관리
  const handleAddSubtask = async (featureId: string, taskTitle: string) => {
    if (!boardId) return;

    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;

    try {
      const newTask = await taskService.createTask(boardId, featureId, {
        title: taskTitle,
      });
      setTasks([...tasks, newTask]);
      setFeatures(
        features.map((f) =>
          f.id === featureId ? { ...f, total_tasks: f.total_tasks + 1 } : f,
        ),
      );
      notifyScheduleRefresh();
    } catch (error: any) {
      console.error("Failed to create task:", error);
    }
  };

  // Quick Add: 블록 하단 "Add a card" 버튼으로 태스크 빠른 생성
  const handleQuickAddTask = async (data: {
    featureId?: string;
    newFeatureTitle?: string;
    taskTitle: string;
  }) => {
    if (!boardId || !quickAddBlockId) return;
    setIsQuickAddSubmitting(true);

    try {
      let featureId = data.featureId;

      // 새 Feature 생성이 필요한 경우
      if (!featureId && data.newFeatureTitle) {
        const newFeature = await featureService.createFeature(boardId, {
          title: data.newFeatureTitle,
          color: getRandomFeatureColor(),
        });
        setFeatures((prev) => [...prev, newFeature]);
        setAllFeatures((prev) => [...prev, newFeature]);
        featureId = newFeature.id;
      }

      if (!featureId) return;

      // Task 생성
      const newTask = await taskService.createTask(boardId, featureId, {
        title: data.taskTitle,
      });

      // TASK 블록이 아닌 다른 블록에서 추가한 경우 → 해당 블록으로 이동
      const taskBlock = blocks.find((b) => b.fixed_type === "TASK");
      if (taskBlock && quickAddBlockId !== taskBlock.id) {
        const targetBlockTasks = tasks.filter(
          (t) => t.block_id === quickAddBlockId,
        );
        await taskService.moveTask(
          boardId,
          newTask.id,
          quickAddBlockId,
          targetBlockTasks.length,
        );
        const targetBlock = blocks.find((b) => b.id === quickAddBlockId);
        const doneBlock = blocks.find((b) => b.fixed_type === "DONE");
        newTask.block_id = quickAddBlockId;
        newTask.block_name = targetBlock?.name;
        newTask.completed = quickAddBlockId === doneBlock?.id;
      }

      setTasks((prev) => [...prev, newTask]);
      setFeatures((prev) =>
        prev.map((f) =>
          f.id === featureId ? { ...f, total_tasks: f.total_tasks + 1 } : f,
        ),
      );
      notifyScheduleRefresh();

      setQuickAddBlockId(null);
    } catch (error) {
      console.error("Failed to quick add task:", error);
    } finally {
      setIsQuickAddSubmitting(false);
    }
  };

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  }, []);

  const handleChecklistItemDetailClick = useCallback(
    async (item: { task: { id: string } | null }) => {
      if (!item.task || !boardId) return;
      const task = tasks.find((t) => t.id === item.task!.id);
      if (task) {
        handleTaskClick(task);
      } else {
        try {
          const fetched = await taskService.getTask(boardId, item.task.id);
          handleTaskClick(fetched);
        } catch (err) {
          console.warn("Failed to fetch task for checklist detail", err);
        }
      }
    },
    [tasks, boardId, handleTaskClick],
  );

  const handleNotificationClick = (notification: NotificationItem) => {
    if (notification.task_id) {
      const task = tasks.find((t) => t.id === notification.task_id);
      if (task) {
        handleTaskClick(task);
      }
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!boardId) return;

    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));

    const isOnlyChecklistUpdate = Object.keys(updates).every(
      (key) =>
        key === "checklist_total" ||
        key === "checklist_completed" ||
        key === "checklist_version",
    );

    if (isOnlyChecklistUpdate) {
      setScheduleRefreshKey((prev) => prev + 1);
      return;
    }

    try {
      const updatedTask = await taskService.updateTask(boardId, taskId, {
        title: updates.title,
        description: updates.description,
        assignee_id: updates.assignee?.id ?? null,
        start_date: updates.start_date ?? null,
        due_date: updates.due_date ?? null,
        estimated_minutes: updates.estimated_minutes ?? null,
      });
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId
            ? {
                ...updatedTask,
                checklist_total: t.checklist_total,
                checklist_completed: t.checklist_completed,
              }
            : t,
        ),
      );
      notifyScheduleRefresh();
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !boardId) return;

    const feature = features.find((f) => f.id === task.feature_id);
    if (feature) {
      const newTotalTasks = feature.total_tasks - 1;
      const newCompletedTasks = task.completed
        ? feature.completed_tasks - 1
        : feature.completed_tasks;
      setFeatures(
        features.map((f) =>
          f.id === feature.id
            ? {
                ...f,
                total_tasks: newTotalTasks,
                completed_tasks: newCompletedTasks,
                progress_percentage:
                  newTotalTasks > 0
                    ? Math.round((newCompletedTasks / newTotalTasks) * 100)
                    : 0,
              }
            : f,
        ),
      );
    }

    setTasks(tasks.filter((t) => t.id !== taskId));
    setIsTaskModalOpen(false);
    setSelectedTask(null);

    const deletedTitle = task.title;

    try {
      await taskService.deleteTask(boardId, taskId);
      toast(
        t("trash.toast.taskDeleted", '"{{title}}" 태스크를 삭제했습니다', {
          title: deletedTitle,
        }),
        {
          duration: 8000,
          action: {
            label: t("trash.toast.undo", "되돌리기"),
            onClick: async () => {
              try {
                await trashAPI.restoreTask(boardId, taskId);
                const mid =
                  milestoneIdRef.current && milestoneIdRef.current !== "all"
                    ? milestoneIdRef.current
                    : undefined;
                await reloadFeaturesAndTasks(mid);
                toast.success(t("trash.toast.restored", "복구되었습니다"));
              } catch (e) {
                console.error("Failed to restore task:", e);
                toast.error(
                  t("trash.toast.restoreFailed", "복구에 실패했습니다"),
                );
              }
            },
          },
        },
      );
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  // Milestone 핸들러
  const handleSaveMilestone = async (data: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    feature_ids?: string[];
  }) => {
    if (!boardId) return;

    try {
      if (selectedMilestone) {
        const updated = await milestoneService.updateMilestone(
          boardId,
          selectedMilestone.id,
          {
            title: data.title,
            description: data.description,
            start_date: data.start_date,
            end_date: data.end_date,
          },
        );

        const currentFeatureIds = new Set(
          selectedMilestone.features?.map((f) => f.id) || [],
        );
        const newFeatureIds = new Set(data.feature_ids || []);

        const featuresToRemove = [...currentFeatureIds].filter(
          (id) => !newFeatureIds.has(id),
        );
        const featuresToAdd = [...newFeatureIds].filter(
          (id) => !currentFeatureIds.has(id),
        );

        for (const featureId of featuresToRemove) {
          await milestoneService.removeFeature(
            boardId,
            selectedMilestone.id,
            featureId,
          );
        }

        if (featuresToAdd.length > 0) {
          await milestoneService.addFeatures(
            boardId,
            selectedMilestone.id,
            featuresToAdd,
          );
        }

        const refreshedMilestone = await milestoneService.getMilestone(
          boardId,
          selectedMilestone.id,
        );
        setMilestones((prev) =>
          prev.map((m) =>
            m.id === refreshedMilestone.id ? refreshedMilestone : m,
          ),
        );
        setSelectedMilestone(refreshedMilestone);

        if (kanbanSelectedMilestoneId === selectedMilestone.id) {
          await reloadFeaturesAndTasks(selectedMilestone.id);
        }
      } else {
        const created = await milestoneService.createMilestone(boardId, data);
        setMilestones((prev) => [...prev, created]);
        setSelectedMilestone(created);

        await boardService.updateSelectedMilestone(boardId, created.id);
        setBoard((prev) =>
          prev ? { ...prev, selected_milestone_id: created.id } : prev,
        );
        setKanbanSelectedMilestoneId(created.id);

        await reloadFeaturesAndTasks(created.id);
      }
    } catch (error) {
      console.error("Failed to save milestone:", error);
      throw error;
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (!boardId) return;

    try {
      await milestoneService.deleteMilestone(boardId, milestoneId);
      setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));

      if (kanbanSelectedMilestoneId === milestoneId) {
        setKanbanSelectedMilestoneId("all");
        await boardService.updateSelectedMilestone(boardId, null);
        setBoard((prev) =>
          prev ? { ...prev, selected_milestone_id: null } : prev,
        );
        await reloadFeaturesAndTasks(undefined);
      }
    } catch (error) {
      console.error("Failed to delete milestone:", error);
      throw error;
    }
  };

  const handleMoveTask = useCallback(
    async (taskId: string, targetBlockId: string, newPosition: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !boardId) return;

    const doneBlock = blocks.find((b) => b.fixed_type === "DONE");
    const targetBlock = blocks.find((b) => b.id === targetBlockId);
    const wasInDone = doneBlock?.id === task.block_id;
    const isMovingToDone = doneBlock?.id === targetBlockId;
    const isNowCompleted = isMovingToDone;

    // 완료 애니메이션 트리거
    if (!wasInDone && isMovingToDone) {
      setRecentlyCompletedTaskIds((prev) => new Set(prev).add(taskId));
      setTimeout(() => {
        setRecentlyCompletedTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }, 1800);
    }

    setTasks((prevTasks) =>
      prevTasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              block_id: targetBlockId,
              block_name: targetBlock?.name,
              completed: isNowCompleted,
              position: newPosition,
            }
          : t,
      ),
    );

    if (wasInDone !== isMovingToDone) {
      const feature = features.find((f) => f.id === task.feature_id);
      if (feature) {
        const newCompletedTasks = isMovingToDone
          ? Math.min(feature.completed_tasks + 1, feature.total_tasks)
          : Math.max(feature.completed_tasks - 1, 0);

        setFeatures(
          features.map((f) =>
            f.id === feature.id
              ? {
                  ...f,
                  completed_tasks: newCompletedTasks,
                  progress_percentage:
                    f.total_tasks > 0
                      ? Math.round((newCompletedTasks / f.total_tasks) * 100)
                      : 0,
                }
              : f,
          ),
        );
      }
    }

    try {
      const movedTask = await taskService.moveTask(
        boardId,
        taskId,
        targetBlockId,
        newPosition,
      );
      setTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === taskId ? { ...t, ...movedTask } : t)),
      );
    } catch (error) {
      console.error("Failed to move task:", error);
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                block_id: task.block_id,
                completed: task.completed,
                position: task.position,
              }
            : t,
        ),
      );
    }
    },
    [tasks, blocks, features, boardId],
  );

  const handleMoveTaskToFeature = async (
    taskId: string,
    targetFeatureId: string,
  ) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !boardId) return;

    const oldFeature = features.find((f) => f.id === task.feature_id);
    const newFeature = features.find((f) => f.id === targetFeatureId);
    if (!oldFeature || !newFeature) return;

    setTasks((prevTasks) =>
      prevTasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              feature_id: targetFeatureId,
              feature_title: newFeature.title,
              feature_color: newFeature.color,
            }
          : t,
      ),
    );

    const oldNewTotal = oldFeature.total_tasks - 1;
    const oldNewCompleted = task.completed
      ? oldFeature.completed_tasks - 1
      : oldFeature.completed_tasks;
    const newNewTotal = newFeature.total_tasks + 1;
    const newNewCompleted = task.completed
      ? newFeature.completed_tasks + 1
      : newFeature.completed_tasks;

    setFeatures((prevFeatures) =>
      prevFeatures.map((f) => {
        if (f.id === oldFeature.id) {
          return {
            ...f,
            total_tasks: oldNewTotal,
            completed_tasks: oldNewCompleted,
            progress_percentage:
              oldNewTotal > 0
                ? Math.round((oldNewCompleted / oldNewTotal) * 100)
                : 0,
          };
        }
        if (f.id === newFeature.id) {
          return {
            ...f,
            total_tasks: newNewTotal,
            completed_tasks: newNewCompleted,
            progress_percentage:
              newNewTotal > 0
                ? Math.round((newNewCompleted / newNewTotal) * 100)
                : 0,
          };
        }
        return f;
      }),
    );

    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) =>
        prev
          ? {
              ...prev,
              feature_id: targetFeatureId,
              feature_title: newFeature.title,
              feature_color: newFeature.color,
            }
          : prev,
      );
    }

    try {
      await taskService.moveTaskToFeature(boardId, taskId, targetFeatureId);
      setManagementRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to move task to feature:", error);
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                feature_id: task.feature_id,
                feature_title: task.feature_title,
                feature_color: task.feature_color,
              }
            : t,
        ),
      );
      setFeatures((prevFeatures) =>
        prevFeatures.map((f) => {
          if (f.id === oldFeature.id) return oldFeature;
          if (f.id === newFeature.id) return newFeature;
          return f;
        }),
      );
    }
  };

  const handleMoveChecklistToTask = async (
    checklistItemId: string,
    sourceTaskId: string,
    targetTaskId: string,
  ) => {
    if (!boardId) return;

    try {
      await checklistAPI.moveToTask(boardId, sourceTaskId, checklistItemId, {
        target_task_id: targetTaskId,
      });

      const movedItem = tasks.find((t) => t.id === sourceTaskId);
      if (movedItem) {
        setTasks((prevTasks) =>
          prevTasks.map((t) => {
            if (t.id === targetTaskId) {
              const newTotal = (t.checklist_total || 0) + 1;
              return {
                ...t,
                checklist_total: newTotal,
                checklist_version: (t.checklist_version || 0) + 1,
              };
            }
            return t;
          }),
        );
      }

      setManagementRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to move checklist item:", error);
    }
  };

  const handleReorderTask = useCallback(
    async (taskId: string, blockId: string, newPosition: number) => {
    if (!boardId) return;

    const task = tasks.find((t) => t.id === taskId);
    const originalPosition = task?.position ?? newPosition;

    setTasks((prevTasks) =>
      prevTasks.map((t) =>
        t.id === taskId ? { ...t, position: newPosition } : t,
      ),
    );

    try {
      const movedTask = await taskService.moveTask(
        boardId,
        taskId,
        blockId,
        newPosition,
      );
      setTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === taskId ? { ...t, ...movedTask } : t)),
      );
    } catch (error) {
      console.error("Failed to reorder task:", error);
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId ? { ...t, position: originalPosition } : t,
        ),
      );
    }
    },
    [tasks, boardId],
  );

  const handleToggleChecklistExpand = useCallback((taskId: string) => {
    setExpandedChecklistTaskIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) newSet.delete(taskId);
      else newSet.add(taskId);
      return newSet;
    });
  }, []);

  // Feature 칩 선택에 따른 태스크 필터링 여부
  const showFeatureLabel =
    selectedFeatureIds === null || selectedFeatureIds.length !== 1;

  // 블록별 태스크 맵 캐시 (KanbanBlock 메모이제이션용)
  const blockTasksMap = useMemo(() => {
    const map: Record<string, Task[]> = {};
    sortedBlocks.forEach((block) => {
      if (block.fixed_type === "FEATURE") return;
      let blockTasks = filteredTasks.filter(
        (task) => task.block_id === block.id,
      );
      if (selectedFeatureIds !== null) {
        blockTasks = blockTasks.filter((task) =>
          selectedFeatureIds.includes(task.feature_id),
        );
      }
      if (block.fixed_type === "TASK" && scheduledTaskIds.size > 0) {
        blockTasks = [...blockTasks].sort((a, b) => {
          const aScheduled = scheduledTaskIds.has(a.id) ? 0 : 1;
          const bScheduled = scheduledTaskIds.has(b.id) ? 0 : 1;
          if (aScheduled !== bScheduled) return aScheduled - bScheduled;
          return a.position - b.position;
        });
      } else {
        blockTasks = [...blockTasks].sort((a, b) => a.position - b.position);
      }
      map[block.id] = blockTasks;
    });
    return map;
  }, [filteredTasks, sortedBlocks, selectedFeatureIds, scheduledTaskIds]);

  const handleCreateTag = async (name: string, color: string) => {
    if (!boardId) return;

    const tempId = `tag_temp_${Date.now()}`;
    const newTag: Tag = { id: tempId, name, color };
    setTags([...tags, newTag]);

    try {
      const createdTag = await tagService.createTag(boardId, { name, color });
      setTags((prevTags) =>
        prevTags.map((t) => (t.id === tempId ? createdTag : t)),
      );
      return createdTag.id;
    } catch (error) {
      console.error("Failed to create tag:", error);
      setTags((prevTags) => prevTags.filter((t) => t.id !== tempId));
    }
  };

  const handleUpdateTag = async (
    tagId: string,
    data: { name?: string; color?: string },
  ) => {
    if (!boardId) return;
    const prevTags = [...tags];
    setTags(tags.map((t) => (t.id === tagId ? { ...t, ...data } : t)));
    try {
      await tagService.updateTag(boardId, tagId, data);
    } catch (error) {
      console.error("Failed to update tag:", error);
      setTags(prevTags);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!boardId) return;
    const prevTags = [...tags];
    setTags(tags.filter((t) => t.id !== tagId));
    setTasks((prev) =>
      prev.map((t) => ({
        ...t,
        tags: (t.tags || []).filter((id) => id !== tagId),
      })),
    );
    setFeatures((prev) =>
      prev.map((f) => ({
        ...f,
        tags: (f.tags || []).filter((tag) =>
          typeof tag === "string" ? tag !== tagId : (tag as Tag).id !== tagId,
        ),
      })),
    );
    try {
      await tagService.deleteTag(boardId, tagId);
    } catch (error) {
      console.error("Failed to delete tag:", error);
      setTags(prevTags);
    }
  };

  // Feature가 속한 마일스톤 찾기
  const getFeatureMilestone = (featureId: string): Milestone | undefined => {
    return milestones.find((m) => m.features?.some((f) => f.id === featureId));
  };

  // 현재 과금 멤버 수
  const currentBillableMembers =
    subscription?.billable_member_count ||
    boardMembersData.filter((m) => m.role !== "viewer").length ||
    0;

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-bridge-dark flex items-center justify-center">
        <div className="text-foreground text-lg font-normal">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  return (
    <DragProvider>
      <div className="h-dvh bg-bridge-dark flex flex-col overflow-hidden">
        <KanbanBoardHeader
          boardId={boardId || ""}
          board={board}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          canEdit={canEdit}
          canAccessSchedule={canAccessSchedule}
          canAccessMilestone={canAccessMilestone}
          canAccessStatistics={canAccessStatistics}
          isAdminOrOwner={isAdminOrOwner}
          isViewer={isViewer}
          isTester={isTester}
          hideBilling={hideBilling}
          hideBillingForUser={hideBillingForUser}
          milestones={milestones}
          allFeatures={allFeatures}
          kanbanSelectedMilestoneId={kanbanSelectedMilestoneId}
          onMilestoneSelect={handleKanbanMilestoneSelect}
          onOpenMilestoneWithCheck={handleOpenMilestoneWithCheck}
          onSetMilestoneOnboardingOpen={() =>
            setIsMilestoneOnboardingOpen(true)
          }
          subscription={subscription}
          tierInfo={tierInfo}
          unreadNotificationCount={unreadNotificationCount}
          activities={activities}
          hasMoreActivity={hasMoreActivity}
          onLoadMoreActivity={handleLoadMoreActivity}
          onNotificationClick={handleNotificationClick}
          onUnreadCountChange={setUnreadNotificationCount}
          canAccessSlack={canAccessSlack}
          onSlackUpgrade={() => openUpgradeModal("slack")}
          unreadInquiryCount={unreadInquiryCount}
          onOpenInquiry={() => setIsInquiryModalOpen(true)}
          onOpenShareBoard={() => setIsShareBoardModalOpen(true)}
          onOpenTrash={() => setIsTrashOpen(true)}
          onOpenSubscription={() => {
            if (!hideBilling) setIsSubscriptionModalOpen(true);
          }}
          onOpenPremiumBenefits={() => {
            if (!hideBilling) setIsPremiumBenefitsModalOpen(true);
          }}
          onUpdatePayment={async () => {
            if (!boardId) return;
            try {
              const url =
                await subscriptionService.getBillingPortalUrl(boardId);
              window.open(url, "_blank");
            } catch (e) {
              console.error("Failed to get billing portal URL", e);
            }
          }}
          onOpenShortcutsHelp={() => setIsShortcutsHelpOpen(true)}
          currentUser={currentUser}
          memberColorMap={memberColorMap}
          onLogout={logout}
          contractors={headerContractors}
          onOpenContractorManager={() => setIsContractorManagerOpen(true)}
          getBoardSubMode={getBoardSubMode}
          getScheduleSubMode={() => "schedule" as const}
          getAISubMode={getAISubMode}
          onOpenUpgradeModal={openUpgradeModal}
          onSaveBoardName={async (name: string) => {
            if (!board || !boardId || name === board.name) return;
            try {
              await boardService.updateBoard(boardId, name, board.description);
              setBoard((prev) => (prev ? { ...prev, name } : prev));
            } catch (e) {
              console.error("Failed to update board name", e);
            }
          }}
        />

        {/* 조직 멤버 뷰어 배너 */}
        {isOrgMemberViewer && boardId && (
          <JoinRequestBanner
            boardId={boardId}
            hasPendingRequest={board?.has_pending_join_request ?? false}
            onRequestSent={() =>
              setBoard((prev) =>
                prev ? { ...prev, has_pending_join_request: true } : prev,
              )
            }
          />
        )}

        {/* 보드 상단 서브탭 바 (칸반 / 마일스톤) */}
        {BOARD_SUB_MODES.includes(viewMode) && (
          <BoardSubTabs
            viewMode={viewMode}
            onViewModeChange={(mode) => handleViewModeChange(mode)}
            canAccessMilestone={canAccessMilestone}
          />
        )}

        {/* 서브뷰 ↔ 마일스톤 구분선 */}
        {BOARD_SUB_MODES.includes(viewMode) &&
          viewMode !== "milestone" &&
          milestones.length > 0 && (
            <div className="border-b border-foreground/[0.08]" />
          )}

        {/* 마일스톤 탭 바 (보드 서브뷰에서 표시, milestone 뷰 제외) */}
        {BOARD_SUB_MODES.includes(viewMode) &&
          viewMode !== "milestone" &&
          milestones.length > 0 &&
          (() => {
            const allMilestoneFeatureIds = new Set(
              milestones.flatMap((m) => m.features?.map((f) => f.id) || []),
            );
            const hasUnassignedFeatures = allFeatures.some(
              (f) => !allMilestoneFeatureIds.has(f.id),
            );
            return (
              <div className="flex items-center px-3 md:px-6 py-1.5 bg-bridge-dark border-b border-bridge-border gap-2 overflow-x-auto shrink-0">
                <Flag size={13} className="text-bridge-secondary shrink-0" />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleKanbanMilestoneSelect("all")}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      kanbanSelectedMilestoneId === "all"
                        ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                        : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
                    }`}
                  >
                    {t("common.all")}
                  </button>
                  {hasUnassignedFeatures && (
                    <button
                      onClick={() => handleKanbanMilestoneSelect("none")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        kanbanSelectedMilestoneId === "none"
                          ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                          : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
                      }`}
                    >
                      {t("kanban.unassigned", "미지정")}
                    </button>
                  )}
                  {milestones.map((milestone) => {
                    const startDate = format(
                      parseISO(milestone.start_date),
                      "M/d",
                    );
                    const endDate = format(parseISO(milestone.end_date), "M/d");
                    return (
                      <button
                        key={milestone.id}
                        onClick={() =>
                          handleKanbanMilestoneSelect(milestone.id)
                        }
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                          kanbanSelectedMilestoneId === milestone.id
                            ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                            : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
                        }`}
                      >
                        <span>{milestone.title}</span>
                        <span
                          className={`text-xs font-normal ${kanbanSelectedMilestoneId === milestone.id ? "text-white/70" : "text-zinc-500"}`}
                        >
                          {startDate} ~ {endDate}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {kanbanSelectedMilestoneId !== "all" &&
                  kanbanSelectedMilestoneId !== "none" && (
                    <button
                      onClick={() => {
                        const milestone = milestones.find(
                          (m) => m.id === kanbanSelectedMilestoneId,
                        );
                        if (milestone) handleOpenMilestoneWithCheck(milestone);
                      }}
                      className="p-1 text-zinc-400 hover:text-foreground transition-colors shrink-0"
                      title={t("kanban.editMilestone")}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                <button
                  onClick={() => handleOpenMilestoneWithCheck()}
                  className={`p-1 transition-colors shrink-0 ${
                    !canAccessMilestone
                      ? "text-zinc-600 hover:text-zinc-500"
                      : "text-zinc-400 hover:text-foreground"
                  }`}
                >
                  <Plus size={16} />
                </button>
              </div>
            );
          })()}

        {/* 일정 탭 서브탭 바 (타임블록 / 캘린더 / 리소스) */}
        {viewMode === "schedule" && (
          <div className="flex items-center justify-center py-1.5 bg-kanban-header/50 border-b border-foreground/5">
            <div className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5">
              <button
                onClick={() => handleScheduleSubTabChange("timeblock")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
                  scheduleSubTab === "timeblock"
                    ? "font-medium bg-foreground/10 text-foreground"
                    : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                }`}
                aria-label={t("schedule.subTab.timeblock", "Time Block")}
              >
                <Clock size={14} />
                <span className="hidden md:inline">
                  {t("schedule.subTab.timeblock", "Time Block")}
                </span>
              </button>
              <button
                onClick={() => handleScheduleSubTabChange("resource")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
                  scheduleSubTab === "resource"
                    ? "font-medium bg-foreground/10 text-foreground"
                    : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                }`}
                aria-label={t("schedule.subTab.resource", "Resource")}
              >
                <Users size={14} />
                <span className="hidden md:inline">
                  {t("schedule.subTab.resource", "Resource")}
                </span>
              </button>
              <button
                onClick={() => handleScheduleSubTabChange("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all ${
                  scheduleSubTab === "calendar"
                    ? "font-medium bg-foreground/10 text-foreground"
                    : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                }`}
                aria-label={t("schedule.subTab.calendar", "Calendar")}
              >
                <Calendar size={14} />
                <span className="hidden md:inline">
                  {t("schedule.subTab.calendar", "Calendar")}
                </span>
              </button>
            </div>
          </div>
        )}
        {(viewMode === "statistics" || viewMode === "ai_report") &&
          isAdminOrOwner &&
          !isViewer &&
          !isTester && (
            <div className="flex items-center justify-center py-1.5 bg-kanban-header/50 border-b border-foreground/5">
              <div className="flex items-center gap-1 bg-foreground/5 rounded-lg p-0.5">
                <button
                  onClick={() => handleViewModeChange("statistics")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === "statistics"
                      ? "bg-foreground/10 text-foreground"
                      : "text-zinc-400 hover:text-foreground"
                  }`}
                >
                  {t("kanban.viewStatistics")}
                </button>
                <button
                  onClick={() => handleViewModeChange("ai_report")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === "ai_report"
                      ? "bg-foreground/10 text-foreground"
                      : "text-zinc-400 hover:text-foreground"
                  }`}
                >
                  {t("kanban.viewAIReport")}
                </button>
              </div>
            </div>
          )}

        {/* 뷰 모드에 따른 컨텐츠 렌더링 */}
        {viewMode === "gantt" ? (
          <main className="flex-1 flex flex-col overflow-hidden">
            <KanbanFilterToolbar
              ref={searchInputRef}
              filterOptions={filterOptions}
              onFilterChange={setFilterOptions}
              features={features}
              tags={tags}
              boardMembersData={boardMembersData}
              tasks={tasks}
              boardId={boardId || ""}
              canEdit={canEdit}
            />
            <WeeklyScheduleView
              boardId={boardId || ""}
              features={filteredFeatures}
              tasks={filteredTasks}
              milestones={milestones}
              onViewFeature={(featureId) => {
                const feature = features.find((f) => f.id === featureId);
                if (feature) handleFeatureClick(feature);
              }}
              onViewTask={(taskId) => {
                const task = tasks.find((t) => t.id === taskId);
                if (task) handleTaskClick(task);
              }}
              onUpdateTaskDates={async (taskId, startDate, endDate) => {
                try {
                  const updatedTask = await taskService.updateTaskDates(
                    boardId || "",
                    taskId,
                    {
                      start_date: startDate,
                      end_date: endDate,
                    },
                  );
                  setTasks((prev) =>
                    prev.map((t) =>
                      t.id === taskId
                        ? {
                            ...t,
                            start_date: updatedTask.start_date,
                            due_date: updatedTask.due_date,
                          }
                        : t,
                    ),
                  );
                } catch (error) {
                  console.error("Failed to update task dates:", error);
                }
              }}
              selectedMilestoneId={kanbanSelectedMilestoneId}
              onSaveBaseline={async () => {
                try {
                  await taskService.saveBaseline(boardId || "");
                  const updatedTasks = await taskService.getTasks(
                    boardId || "",
                  );
                  setTasks(updatedTasks);
                } catch (error) {
                  console.error("Failed to save baseline:", error);
                }
              }}
              dependencies={taskDependencies}
              onCreateDependency={async (predecessorId, successorId) => {
                try {
                  const newDep = await taskDependencyService.create(
                    boardId || "",
                    predecessorId,
                    successorId,
                  );
                  setTaskDependencies((prev) => [...prev, newDep]);
                } catch (error) {
                  console.error("Failed to create dependency:", error);
                }
              }}
              onDeleteDependency={async (dependencyId) => {
                try {
                  await taskDependencyService.delete(
                    boardId || "",
                    dependencyId,
                  );
                  setTaskDependencies((prev) =>
                    prev.filter((d) => d.id !== dependencyId),
                  );
                } catch (error) {
                  console.error("Failed to delete dependency:", error);
                }
              }}
            />
          </main>
        ) : viewMode === "kanban" ? (
          <main className="flex-1 flex flex-col overflow-hidden bg-bridge-dark">
            {features.length === 0 ? (
              isOrgMemberViewer ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5 }}
                      className="flex flex-col items-center max-w-md text-center"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-bridge-accent/10 border border-bridge-accent/20 flex items-center justify-center mb-6">
                        <Eye className="h-7 w-7 text-bridge-accent" />
                      </div>
                      <h2 className="font-jakarta text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">
                        {t(
                          "board.joinRequest.emptyBoardTitle",
                          "아직 콘텐츠가 없는 보드입니다",
                        )}
                      </h2>
                      <p className="text-slate-400 font-normal text-sm md:text-base leading-relaxed mb-8">
                        {t(
                          "board.joinRequest.emptyBoardDesc",
                          "이 보드에 참가하면 Feature를 만들고 편집할 수 있습니다. 상단 배너에서 참가 신청을 해보세요.",
                        )}
                      </p>
                      {boardId && (
                        <JoinRequestBanner
                          boardId={boardId}
                          hasPendingRequest={
                            board?.has_pending_join_request ?? false
                          }
                          onRequestSent={() =>
                            setBoard((prev) =>
                              prev
                                ? { ...prev, has_pending_join_request: true }
                                : prev,
                            )
                          }
                        />
                      )}
                    </motion.div>
                  </div>
                </div>
              ) : (
                <EmptyBoardGuide
                  onCreateFeature={() => setIsAddFeatureModalOpen(true)}
                />
              )
            ) : (
              <>
                {/* 검색 + 필터 툴바 */}
                <KanbanFilterToolbar
                  ref={searchInputRef}
                  filterOptions={filterOptions}
                  onFilterChange={setFilterOptions}
                  features={features}
                  tags={tags}
                  boardMembersData={boardMembersData}
                  tasks={tasks}
                  boardId={boardId || ""}
                  canEdit={canEdit}
                />
                {/* Feature 칩 선택 영역 */}
                <FeatureChipSelector
                  features={filteredFeatures}
                  selectedFeatureIds={selectedFeatureIds ?? EMPTY_FEATURE_IDS}
                  isAllSelected={selectedFeatureIds === null}
                  onToggleFeature={handleToggleFeatureChip}
                  onSelectAll={handleSelectAllFeatureChips}
                  onFeatureInfoClick={handleFeatureClick}
                  onAddFeature={handleOpenAddFeatureModal}
                  cascadeFeatureId={cascadeFeatureId}
                />

                {/* 칸반 보드 */}
                <div className="flex-1 p-3 md:p-6 overflow-x-auto overflow-y-hidden min-h-0 custom-scrollbar">
                  <DndContext
                    sensors={blockSensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToHorizontalAxis]}
                    onDragStart={handleBlockDragStart}
                    onDragEnd={handleBlockDragEnd}
                  >
                    <div className="flex gap-3 md:gap-4 min-w-max h-full">
                      {/* TASK 블록 (고정, SortableContext 밖) */}
                      {(() => {
                        const taskBlock = sortedBlocks.find(
                          (b) => b.fixed_type === "TASK",
                        );
                        if (!taskBlock) return null;
                        return (
                          <div className="flex items-stretch gap-4">
                            <KanbanBlock
                              block={taskBlock}
                              tasks={blockTasksMap[taskBlock.id] || []}
                              onTaskClick={handleTaskClick}
                              features={features}
                              onMoveTask={handleMoveTask}
                              onReorderTask={handleReorderTask}
                              boardId={boardId || ""}
                              expandedChecklistTaskIds={
                                expandedChecklistTaskIds
                              }
                              onToggleChecklistExpand={
                                handleToggleChecklistExpand
                              }
                              checklistDataMap={checklistDataMap}
                              memberColorMap={memberColorMap}
                              showFeatureLabel={showFeatureLabel}
                              scheduledTaskIds={scheduledTaskIds}
                              onQuickAddTask={
                                canEdit ? setQuickAddBlockId : undefined
                              }
                              recentlyCompletedTaskIds={
                                recentlyCompletedTaskIds
                              }
                            />
                            <div className="flex flex-col gap-2 mt-4 self-start">
                              <button
                                onClick={() => setIsAddBlockModalOpen(true)}
                                className="h-10 w-10 flex items-center justify-center rounded-xl border border-dashed border-bridge-border text-zinc-500 hover:text-foreground hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all"
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                              {hiddenBlocks.length > 0 && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="h-10 w-10 flex items-center justify-center rounded-xl border border-dashed border-bridge-border text-slate-400 hover:text-foreground hover:border-bridge-secondary/50 hover:bg-bridge-secondary/10 transition-all relative">
                                      <Eye className="h-4 w-4" />
                                      <span className="absolute -top-1 -right-1 text-xs font-bold bg-bridge-secondary text-white rounded-full w-4 h-4 flex items-center justify-center">
                                        {hiddenBlocks.length}
                                      </span>
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="start"
                                    className="bg-bridge-surface border-bridge-border"
                                  >
                                    {hiddenBlocks.map((hb) => (
                                      <DropdownMenuItem
                                        key={hb.id}
                                        onClick={() => handleShowBlock(hb.id)}
                                        className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs"
                                      >
                                        <Eye className="h-3 w-3 mr-2" />
                                        {hb.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* 커스텀 블록 + Done (SortableContext 내부) */}
                      <SortableContext
                        items={sortableBlocks.map((b) => b.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {sortableBlocks.map((block) => (
                            <KanbanBlock
                              key={block.id}
                              block={block}
                              tasks={blockTasksMap[block.id] || []}
                              onTaskClick={handleTaskClick}
                              features={features}
                              onMoveTask={handleMoveTask}
                              onReorderTask={handleReorderTask}
                              onEditBlock={setEditingBlock}
                              onDeleteBlock={handleDeleteBlock}
                              onHideBlock={handleHideBlock}
                              selectedMilestoneId={
                                kanbanSelectedMilestoneId !== "all" &&
                                kanbanSelectedMilestoneId !== "none"
                                  ? kanbanSelectedMilestoneId
                                  : undefined
                              }
                              boardId={boardId || ""}
                              expandedChecklistTaskIds={
                                expandedChecklistTaskIds
                              }
                              onToggleChecklistExpand={
                                handleToggleChecklistExpand
                              }
                              checklistDataMap={checklistDataMap}
                              memberColorMap={memberColorMap}
                              showFeatureLabel={showFeatureLabel}
                              scheduledTaskIds={scheduledTaskIds}
                              onQuickAddTask={
                                canEdit ? setQuickAddBlockId : undefined
                              }
                              recentlyCompletedTaskIds={
                                recentlyCompletedTaskIds
                              }
                            />
                          ))}
                      </SortableContext>
                    </div>
                    <DragOverlay>
                      {activeBlock && (
                        <div className="bg-bridge-surface rounded-2xl border border-bridge-accent/50 shadow-2xl shadow-bridge-accent/20 min-w-[260px] max-w-[280px] px-4 py-3 opacity-90">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-bridge-accent" />
                            {activeBlock.color && (
                              <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: activeBlock.color }}
                              />
                            )}
                            <h3 className="font-bold text-sm text-foreground">
                              {activeBlock.name}
                            </h3>
                            <span className="text-xs font-medium text-zinc-400 bg-bridge-surface-hover px-2 py-0.5 rounded-md">
                              {(blockTasksMap[activeBlock.id] || []).length}
                            </span>
                          </div>
                        </div>
                      )}
                    </DragOverlay>
                  </DndContext>
                </div>
              </>
            )}
          </main>
        ) : viewMode === "schedule" ? (
          <main className="flex-1 flex flex-col overflow-hidden">
            {scheduleSubTab === "timeblock" ? (
              <DailyScheduleView
                boardId={boardId || ""}
                boardMembers={boardMembersData}
                organizationId={board?.organization_id}
                memberColorMap={memberColorMap}
                onViewFeature={(featureId) => {
                  const feature = features.find((f) => f.id === featureId);
                  if (feature) handleFeatureClick(feature);
                }}
                onViewMeeting={(_meetingId, date) => {
                  if (date) {
                    setMeetingNavigateDate(date);
                  }
                  handleViewModeChange("meeting");
                }}
                onViewTask={async (taskId, checklistItemId) => {
                  setHighlightChecklistItemId(checklistItemId || null);
                  const task = tasks.find((t) => t.id === taskId);
                  if (task) {
                    handleTaskClick(task);
                  } else if (boardId) {
                    try {
                      const fetched = await taskService.getTask(
                        boardId,
                        taskId,
                      );
                      handleTaskClick(fetched);
                    } catch (err) {
                      console.warn(
                        "Failed to fetch task for timeblock view",
                        err,
                      );
                    }
                  }
                }}
                refreshTrigger={scheduleRefreshKey}
                wsChecklistEvent={wsChecklistEvent}
                currentUserRole={currentUserRole}
                initialSubTab={urlTab as "timeblock" | "meeting" | undefined}
              />
            ) : scheduleSubTab === "calendar" ? (
              <div className="flex flex-1 h-full overflow-hidden">
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center h-64">
                      <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  <ScheduleCalendarView
                    boardId={boardId || ""}
                    boardMembers={boardMembersData}
                    memberColorMap={memberColorMap}
                    jobRoles={jobRoles}
                    onViewTask={async (taskId) => {
                      const task = tasks.find((t) => t.id === taskId);
                      if (task) {
                        handleTaskClick(task);
                      } else if (boardId) {
                        try {
                          const fetched = await taskService.getTask(
                            boardId,
                            taskId,
                          );
                          handleTaskClick(fetched);
                        } catch (err) {
                          console.warn(
                            "Failed to fetch task for calendar view",
                            err,
                          );
                        }
                      }
                    }}
                    onDropChecklist={async (item, targetDate) => {
                      if (item.task?.id) {
                        try {
                          await checklistAPI.updateItem(
                            boardId!,
                            item.task.id,
                            item.id,
                            {
                              start_date: targetDate,
                              due_date: targetDate,
                            },
                          );
                        } catch (err) {
                          console.warn(
                            "Failed to drop checklist item on calendar",
                            err,
                          );
                        }
                      }
                      notifyScheduleRefresh();
                    }}
                    externalDragItem={
                      panelDragState?.isActive ? panelDragState.item : null
                    }
                    refreshTrigger={scheduleRefreshPanel}
                  />
                </Suspense>
                <Suspense fallback={null}>
                  <ChecklistItemPanel
                    key={scheduleRefreshPanel}
                    boardId={boardId || ""}
                    onDragStateChange={setPanelDragState}
                    onItemDetailClick={handleChecklistItemDetailClick}
                    boardMembers={boardMembersData}
                    onItemAdded={() => notifyScheduleRefresh()}
                    milestones={milestones}
                    jobRoles={jobRoles}
                    memberJobRoleMap={memberJobRoleMap}
                  />
                </Suspense>
              </div>
            ) : scheduleSubTab === "resource" ? (
              <div className="flex flex-1 overflow-hidden">
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center h-64">
                      <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  <ScheduleResourceView
                    boardId={boardId || ""}
                    boardMembers={boardMembersData}
                    milestones={milestones}
                    memberColorMap={memberColorMap}
                    jobRoles={jobRoles}
                    onOpenContractorManager={() =>
                      setIsContractorManagerOpen(true)
                    }
                    onViewTask={async (taskId) => {
                      const task = tasks.find((t) => t.id === taskId);
                      if (task) {
                        handleTaskClick(task);
                      } else if (boardId) {
                        try {
                          const fetched = await taskService.getTask(
                            boardId,
                            taskId,
                          );
                          handleTaskClick(fetched);
                        } catch (err) {
                          console.warn(
                            "Failed to fetch task for resource view",
                            err,
                          );
                        }
                      }
                    }}
                    onDropChecklist={async (
                      item,
                      targetDate,
                      targetAssigneeId,
                    ) => {
                      if (item.task_id) {
                        try {
                          // targetAssigneeId 가 "contractor:<id>" 라면 외주 행, 아니면 user 행
                          const isContractorRow =
                            typeof targetAssigneeId === "string" &&
                            targetAssigneeId.startsWith("contractor:");
                          const payload = isContractorRow
                            ? {
                                start_date: targetDate,
                                due_date: targetDate,
                                assignee_id: null,
                                contractor_id: targetAssigneeId!.substring(
                                  "contractor:".length,
                                ),
                              }
                            : {
                                start_date: targetDate,
                                due_date: targetDate,
                                assignee_id:
                                  targetAssigneeId === "__unassigned__"
                                    ? null
                                    : targetAssigneeId,
                                contractor_id: null,
                              };
                          await checklistAPI.updateItem(
                            boardId!,
                            item.task_id,
                            item.id,
                            payload,
                          );
                        } catch (err) {
                          console.warn(
                            "Failed to drop checklist item on resource",
                            err,
                          );
                        }
                      }
                      notifyScheduleRefresh();
                    }}
                    externalDragItem={
                      panelDragState?.isActive ? panelDragState.item : null
                    }
                    refreshTrigger={scheduleRefreshPanel}
                    onMilestoneClick={handleOpenMilestoneWithCheck}
                    scrollToItem={scrollToItem}
                    tasks={taskPickerList}
                  />
                </Suspense>
                <Suspense fallback={null}>
                  <ChecklistItemPanel
                    key={scheduleRefreshPanel}
                    boardId={boardId || ""}
                    onDragStateChange={setPanelDragState}
                    onItemDetailClick={handleChecklistItemDetailClick}
                    onScheduledItemClick={(item) =>
                      setScrollToItem({ id: item.id, ts: Date.now() })
                    }
                    boardMembers={boardMembersData}
                    onItemAdded={() => notifyScheduleRefresh()}
                    milestones={milestones}
                    jobRoles={jobRoles}
                    memberJobRoleMap={memberJobRoleMap}
                  />
                </Suspense>
              </div>
            ) : null}
          </main>
        ) : viewMode === "calendar" ? (
          <main className="flex-1 flex flex-col overflow-hidden">
            <KanbanFilterToolbar
              ref={searchInputRef}
              filterOptions={filterOptions}
              onFilterChange={setFilterOptions}
              features={features}
              tags={tags}
              boardMembersData={boardMembersData}
              tasks={tasks}
              boardId={boardId || ""}
              canEdit={canEdit}
            />
            <CalendarView
              boardId={boardId || ""}
              features={filteredFeatures}
              tasks={filteredTasks}
              checklistDataMap={checklistDataMap}
              onViewFeature={(featureId) => {
                const feature =
                  features.find((f) => f.id === featureId) ||
                  allFeatures.find((f) => f.id === featureId);
                if (feature) handleFeatureClick(feature);
              }}
              onViewTask={(taskId) => {
                const task = tasks.find((t) => t.id === taskId);
                if (task) handleTaskClick(task);
              }}
            />
          </main>
        ) : viewMode === "meeting" ? (
          <main className="flex-1 overflow-hidden">
            <MeetingCalendarView
              boardId={boardId || ""}
              boardMembers={boardMembersData}
              onRefreshSchedule={() => setScheduleRefreshKey((k) => k + 1)}
              refreshTrigger={meetingRefreshKey}
              navigateToDate={meetingNavigateDate}
            />
          </main>
        ) : viewMode === "notes" ? (
          <main className="flex-1 overflow-hidden">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <NotesView
                boardId={boardId || ""}
                currentUserRole={currentUserRole}
              />
            </Suspense>
          </main>
        ) : viewMode === "statistics" ? (
          <main className="flex-1 overflow-hidden">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <StatisticsView
                boardId={boardId || ""}
                milestones={milestones}
                tags={tags}
                members={boardMembersData.map((m) => ({
                  id: m.id,
                  user: {
                    id: m.userId,
                    name: m.name,
                    email: m.email,
                    profile_image: null,
                  },
                  role: m.role.toUpperCase() as any,
                  joined_at: "",
                }))}
                onTaskClick={(taskId) => {
                  const task = tasks.find((t) => t.id === taskId);
                  if (task) handleTaskClick(task);
                }}
                managementRefreshTrigger={managementRefreshKey}
                activeView={statisticsActiveView}
                onActiveViewChange={setStatisticsActiveView}
              />
            </Suspense>
          </main>
        ) : viewMode === "ai_report" ? (
          <main className="flex-1 overflow-hidden">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <AIReportPanel
                boardId={boardId || ""}
                members={boardMembersData.map((m) => ({
                  id: m.id,
                  user: {
                    id: m.userId,
                    name: m.name,
                    email: m.email,
                    profile_image: null,
                  },
                  role: m.role.toUpperCase() as any,
                  joined_at: "",
                }))}
                hideBilling={hideBilling}
              />
            </Suspense>
          </main>
        ) : viewMode === "milestone" ? (
          <main className="flex-1 overflow-hidden">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <MilestoneView
                boardId={boardId || ""}
                features={features}
                tasks={tasks}
                milestones={milestones}
                onFeatureClick={handleFeatureClick}
                onCreateMilestone={() => handleOpenMilestoneWithCheck()}
                onEditMilestone={(milestone) =>
                  handleOpenMilestoneWithCheck(milestone)
                }
                onDeleteMilestone={handleDeleteMilestone}
                onRefresh={() => {
                  if (boardId) {
                    const milestoneId =
                      kanbanSelectedMilestoneId !== "all"
                        ? kanbanSelectedMilestoneId
                        : undefined;
                    reloadFeaturesAndTasks(milestoneId);
                  }
                }}
              />
            </Suspense>
          </main>
        ) : viewMode === "list" ? (
          <main className="flex-1 flex flex-col overflow-hidden">
            <KanbanFilterToolbar
              ref={searchInputRef}
              filterOptions={filterOptions}
              onFilterChange={setFilterOptions}
              features={features}
              tags={tags}
              boardMembersData={boardMembersData}
              tasks={tasks}
              boardId={boardId || ""}
              canEdit={canEdit}
            />
            <BoardListView
              boardId={boardId || ""}
              features={filteredFeatures}
              tasks={filteredTasks}
              blocks={blocks}
              checklistDataMap={checklistDataMap}
              boardMembersData={boardMembersData}
              memberColorMap={memberColorMap}
              onViewFeature={(featureId) => {
                const feature =
                  features.find((f) => f.id === featureId) ||
                  allFeatures.find((f) => f.id === featureId);
                if (feature) handleFeatureClick(feature);
              }}
              onViewTask={(taskId) => {
                const task = tasks.find((t) => t.id === taskId);
                if (task) handleTaskClick(task);
              }}
            />
          </main>
        ) : null}

        {/* 모바일 하단 여백 (탭바 + safe area 공간 확보) */}
        <div
          className="shrink-0 md:hidden"
          style={{ height: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
        />

        {/* 모바일 하단 탭바 - inline으로 유지 (뷰모드 의존성이 깊어서) */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bridge-obsidian/95 backdrop-blur-xl border-t border-foreground/10"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-center justify-around px-1 pt-2 pb-1.5">
            <MobileTabButton
              active={BOARD_SUB_MODES.includes(viewMode)}
              onClick={() => {
                const subMode = getBoardSubMode();
                handleViewModeChange(subMode);
              }}
              label={t("kanban.viewBoard", "보드")}
              icon="kanban"
            />
            <MobileTabButton
              active={viewMode === "schedule"}
              onClick={() => {
                handleViewModeChange("schedule");
              }}
              label={t("kanban.viewScheduleTab", "일정")}
              icon="schedule"
            />
            <MobileTabButton
              active={viewMode === "meeting"}
              onClick={() => handleViewModeChange("meeting")}
              label={t("kanban.viewMeeting", "회의")}
              icon="meeting"
            />
            <MobileTabButton
              active={viewMode === "notes"}
              onClick={() => handleViewModeChange("notes")}
              label={t("kanban.viewNotes", "노트")}
              icon="notes"
            />
            {!isRestricted && (isAdminOrOwner || (!isViewer && !isTester)) && (
              <MobileTabButton
                active={viewMode === "statistics" || viewMode === "ai_report"}
                onClick={() => {
                  if (!canAccessStatistics) {
                    openUpgradeModal("statistics");
                    return;
                  }
                  const subMode = getAISubMode();
                  if (subMode === "statistics" && !isAdminOrOwner) {
                    handleViewModeChange("ai_report");
                  } else if (
                    subMode === "ai_report" &&
                    (isViewer || isTester)
                  ) {
                    handleViewModeChange("statistics");
                  } else {
                    handleViewModeChange(subMode);
                  }
                }}
                label={t("kanban.viewAIAnalysisTab", "AI분석")}
                icon="ai"
                locked={!canAccessStatistics}
              />
            )}
          </div>
        </nav>

        {/* Quick Add Task Modal */}
        <QuickAddTaskModal
          open={!!quickAddBlockId}
          onClose={() => setQuickAddBlockId(null)}
          features={features}
          blockName={blocks.find((b) => b.id === quickAddBlockId)?.name}
          onSubmit={handleQuickAddTask}
          isSubmitting={isQuickAddSubmitting}
        />

        {/* 휴지통 */}
        {boardId && (
          <BoardTrashView
            open={isTrashOpen}
            onClose={() => setIsTrashOpen(false)}
            boardId={boardId}
            onRestored={() => {
              const mid =
                milestoneIdRef.current && milestoneIdRef.current !== "all"
                  ? milestoneIdRef.current
                  : undefined;
              reloadFeaturesAndTasks(mid).catch(() => {});
            }}
          />
        )}

        {/* 모달들 */}
        <BoardModalManager
          boardId={boardId || ""}
          // Feature Modal
          isOnboarding={features.length <= 1 && tasks.length === 0}
          selectedFeature={selectedFeature}
          isFeatureModalOpen={isFeatureModalOpen}
          onCloseFeature={() => {
            setIsFeatureModalOpen(false);
            setSelectedFeature(null);
          }}
          featureTasks={
            selectedFeature
              ? tasks.filter((t) => t.feature_id === selectedFeature.id)
              : []
          }
          blocks={blocks}
          onAddSubtask={(title) => handleAddSubtask(selectedFeature!.id, title)}
          onRenameSubtask={(taskId, newTitle) => {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId ? { ...t, title: newTitle } : t,
              ),
            );
          }}
          onUpdateFeature={handleUpdateFeature}
          onDeleteFeature={handleDeleteFeature}
          onFeatureTaskClick={(task) => {
            setIsFeatureModalOpen(false);
            setSelectedFeature(null);
            setSelectedTask(task);
            setIsTaskModalOpen(true);
          }}
          // Task Modal
          selectedTask={selectedTask}
          isTaskModalOpen={isTaskModalOpen}
          highlightChecklistItemId={highlightChecklistItemId}
          onCloseTask={() => {
            setIsTaskModalOpen(false);
            setSelectedTask(null);
            setHighlightChecklistItemId(null);
          }}
          onUpdateTask={(updates) =>
            selectedTask && handleUpdateTask(selectedTask.id, updates)
          }
          onDeleteTask={handleDeleteTask}
          onMoveToDone={(taskId) => {
            const doneBlock = blocks.find((b) => b.fixed_type === "DONE");
            if (doneBlock) {
              handleMoveTask(taskId, doneBlock.id, 0);
              setManagementRefreshKey((prev) => prev + 1);
            }
          }}
          onMoveToBlock={(taskId, blockId) => {
            handleMoveTask(taskId, blockId, 0);
            setManagementRefreshKey((prev) => prev + 1);
          }}
          onMoveToFeature={handleMoveTaskToFeature}
          onMoveChecklistToTask={handleMoveChecklistToTask}
          features={features}
          allTasks={tasks}
          wsCommentEvent={wsCommentEvent}
          wsChecklistEvent={wsChecklistEvent}
          onOpenFeature={(featureId) => {
            setIsTaskModalOpen(false);
            setSelectedTask(null);
            const feature = features.find((f) => f.id === featureId);
            if (feature) {
              setSelectedFeature(feature);
              setIsFeatureModalOpen(true);
            }
          }}
          onChecklistSync={(taskId, items) => {
            setChecklistDataMap((prev) => {
              const prevItems = prev[taskId] || [];
              // 완료 상태 변경된 항목 → DailyScheduleView에 synthetic 이벤트 전달
              for (const item of items) {
                const prevItem = prevItems.find((p) => p.id === item.id);
                if (prevItem && prevItem.completed !== item.completed) {
                  queueMicrotask(() => {
                    setWsChecklistEvent({
                      type: "CHECKLIST_TOGGLED",
                      board_id: boardId || "",
                      user_id: currentUser?.id || "",
                      user_name: currentUser?.name || "",
                      timestamp: new Date().toISOString(),
                      data: { item, task_id: taskId },
                    });
                  });
                  break;
                }
              }
              return { ...prev, [taskId]: items };
            });
            notifyScheduleRefresh();
          }}
          // Tag
          tags={tags}
          onCreateTag={handleCreateTag}
          onUpdateTag={handleUpdateTag}
          onDeleteTag={handleDeleteTag}
          // AddBlock Modal
          isAddBlockModalOpen={isAddBlockModalOpen}
          onCloseAddBlock={() => setIsAddBlockModalOpen(false)}
          onAddBlock={handleAddBlock}
          // EditBlock Modal
          editingBlock={editingBlock}
          onCloseEditBlock={() => setEditingBlock(null)}
          onEditBlock={(name: string, color: string) => {
            if (editingBlock) {
              handleEditBlock(editingBlock.id, name, color);
              setEditingBlock(null);
            }
          }}
          // AddFeature Modal
          isAddFeatureModalOpen={isAddFeatureModalOpen}
          onCloseAddFeature={() => setIsAddFeatureModalOpen(false)}
          onAddFeature={handleAddFeature}
          milestones={milestones}
          kanbanSelectedMilestoneId={kanbanSelectedMilestoneId}
          // ShareBoard Modal
          isShareBoardModalOpen={isShareBoardModalOpen}
          onCloseShareBoard={() => setIsShareBoardModalOpen(false)}
          boardMembersData={boardMembersData}
          onAddMember={handleAddMember}
          onUpdateMemberRole={handleUpdateMemberRole}
          onRemoveMember={handleRemoveMember}
          onUpdateMemberColor={handleUpdateMemberColor}
          onReorderMembers={handleReorderMembers}
          currentUserId={currentUserId}
          onlineUsers={onlineUsers}
          inviteLinks={inviteLinks}
          onCreateInviteLink={handleCreateInviteLink}
          onDeleteInviteLink={handleDeleteInviteLink}
          seatInfo={
            !hideBillingForUser && subscription
              ? {
                  seatCount: subscription.seat_count,
                  usedSeats:
                    subscription.billable_member_count ||
                    boardMembersData.filter((m) => m.role !== "viewer").length,
                }
              : undefined
          }
          onOpenSeatManagement={
            !hideBillingForUser
              ? () => {
                  setIsShareBoardModalOpen(false);
                  setIsSubscriptionModalOpen(true);
                }
              : undefined
          }
          aiCredits={!hideBillingForUser ? aiCredits : undefined}
          onOpenAiCreditPurchase={
            !hideBillingForUser
              ? () => {
                  setIsShareBoardModalOpen(false);
                  setCreditModalMode("purchase");
                  setShowCreditModal(true);
                }
              : undefined
          }
          isOrgBoard={!!board?.organization_id}
          organizationName={board?.organization_name}
          pendingJoinRequestCount={pendingJoinRequestCount}
          isAdminOrOwner={isAdminOrOwner}
          onJoinRequestHandled={handleJoinRequestHandled}
          boardName={board?.name}
          onTransferOwnership={handleTransferOwnership}
          hideBillingForUser={hideBillingForUser}
          jobRoles={jobRoles}
          onUpdateMemberJobRole={handleUpdateMemberJobRole}
          canManageJobRoles={isAdminOrOwner}
          onJobRolesChanged={(roles) => setJobRoles(roles)}
          // Subscription Modal
          isSubscriptionModalOpen={isSubscriptionModalOpen}
          onCloseSubscription={() => setIsSubscriptionModalOpen(false)}
          subscription={subscription}
          currentBillableMembers={currentBillableMembers}
          onChangeBillingCycle={handleChangeBillingCycle}
          onPurchaseSeats={handleSubscriptionPurchaseSeats}
          onCancelSubscription={handleCancelSubscription}
          onUndoCancellation={handleUndoCancellation}
          // Inquiry Modal
          isInquiryModalOpen={isInquiryModalOpen}
          onCloseInquiry={() => setIsInquiryModalOpen(false)}
          // Milestone Modal
          isMilestoneModalOpen={isMilestoneModalOpen}
          onCloseMilestone={() => {
            setIsMilestoneModalOpen(false);
            setSelectedMilestone(null);
          }}
          selectedMilestone={selectedMilestone}
          allFeatures={allFeatures}
          featureMilestoneCountMap={featureMilestoneCountMap}
          onSaveMilestone={handleSaveMilestone}
          onDeleteMilestone={handleDeleteMilestone}
          onSelectMilestone={async (ms) => {
            if (ms && boardId) {
              try {
                const detailed = await milestoneService.getMilestone(
                  boardId,
                  ms.id,
                );
                setSelectedMilestone(detailed);
              } catch {
                setSelectedMilestone(ms);
              }
            } else {
              setSelectedMilestone(null);
            }
          }}
          // Milestone Onboarding
          isMilestoneOnboardingOpen={isMilestoneOnboardingOpen}
          onCloseMilestoneOnboarding={() => setIsMilestoneOnboardingOpen(false)}
          onCreateMilestone={() => handleOpenMilestoneWithCheck()}
          // Upgrade Modal
          isUpgradeModalOpen={isUpgradeModalOpen}
          onCloseUpgrade={() => setIsUpgradeModalOpen(false)}
          upgradeTrigger={upgradeTrigger}
          onSeatUpgrade={handleSeatUpgrade}
          // Premium Benefits Modal
          isPremiumBenefitsModalOpen={isPremiumBenefitsModalOpen}
          onClosePremiumBenefits={() => setIsPremiumBenefitsModalOpen(false)}
          // Seat Purchase Modal
          seatPurchaseModal={seatPurchaseModal}
          onCloseSeatPurchase={() => setSeatPurchaseModal(null)}
          billingCycle={subscription?.billing_cycle || "MONTHLY"}
          onPurchaseSeatsAndRetry={handlePurchaseSeatsAndRetry}
          // Org Seat Limit Modal
          orgSeatLimitModal={orgSeatLimitModal}
          onCloseOrgSeatLimit={() => setOrgSeatLimitModal(null)}
          onOrgPurchaseSeatsAndRetry={handleOrgPurchaseSeatsAndRetry}
          // Alert Modal
          alertModal={alertModal}
          onCloseAlert={() => setAlertModal({ ...alertModal, open: false })}
          // AI Credit Modal
          showCreditModal={showCreditModal}
          onCloseCreditModal={() => setShowCreditModal(false)}
          creditModalMode={creditModalMode}
          onCreditPurchaseComplete={handleCreditPurchaseComplete}
          currentCredits={aiCredits}
          // Permissions
          canEdit={canEdit}
          currentUser={currentUser}
          boardMembers={boardMembersData}
          contractors={headerContractors}
        />

        {/* Keyboard Shortcuts Help */}
        <KeyboardShortcutsModal
          open={isShortcutsHelpOpen}
          onClose={() => setIsShortcutsHelpOpen(false)}
        />

        {/* Version Info */}
        <div className="fixed bottom-16 md:bottom-2 right-3 text-xs text-slate-600 select-none pointer-events-none z-10">
          FE:{" "}
          {typeof __FE_COMMIT_HASH__ !== "undefined"
            ? __FE_COMMIT_HASH__
            : "dev"}
          {beCommit && <> · BE: {beCommit}</>}
        </div>

        {/* 우하단 플로팅 뷰 전환 버튼 (보드 표현 뷰에서만 표시, 마일스톤 제외) */}
        {BOARD_SUB_MODES.includes(viewMode) && viewMode !== "milestone" && (
          <FloatingViewSwitcher
            viewMode={viewMode}
            onViewModeChange={(mode) => handleViewModeChange(mode)}
            canAccessGantt={canAccessSchedule}
          />
        )}

        {boardId && (
          <ContractorManageModal
            open={isContractorManagerOpen}
            onClose={() => setIsContractorManagerOpen(false)}
            boardId={boardId}
            members={boardMembersData}
            currentUserId={currentUserId}
            isAdminOrAbove={isAdminOrOwner}
            onChanged={(list) => {
              notifyScheduleRefresh();
              if (list) setHeaderContractors(list);
            }}
          />
        )}
      </div>
    </DragProvider>
  );
}

import { motion } from "framer-motion";

// 모바일 하단 탭 버튼 컴포넌트

function MobileTabButton({
  active,
  onClick,
  label,
  icon,
  locked,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: "kanban" | "schedule" | "meeting" | "notes" | "ai";
  locked?: boolean;
}) {
  const iconMap = {
    kanban: <LayoutGrid size={20} />,
    schedule: <Calendar size={20} />,
    meeting: <Users size={20} />,
    notes: <FileText size={20} />,
    ai: <BarChart3 size={20} />,
  };

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 rounded-lg transition-colors ${
        active
          ? "text-bridge-secondary"
          : locked
            ? "text-zinc-700"
            : "text-zinc-500"
      }`}
    >
      {active && (
        <motion.div
          layoutId="kanban-tab-indicator"
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-bridge-secondary"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      {iconMap[icon]}
      <span className="text-xs font-medium">{label}</span>
      {locked && (
        <Lock size={8} className="absolute top-0.5 right-1 text-zinc-600" />
      )}
    </button>
  );
}
