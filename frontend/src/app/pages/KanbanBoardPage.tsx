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
  | "list"
  | "mindmap"
  | "minikanban";

// 보드 서브뷰 그룹 (보드 탭에 속하는 ViewMode 집합)
const BOARD_SUB_MODES: ViewMode[] = [
  "kanban",
  "gantt",
  "calendar",
  "list",
  "mindmap",
  "minikanban",
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
import { MilestoneTabBar } from "../components/MilestoneTabBar";
import { ScheduleSubTabBar } from "../components/ScheduleSubTabBar";
import { GanttView } from "../views/GanttView";
import { KanbanView } from "../views/KanbanView";
import { ScheduleView } from "../views/ScheduleView";
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
const MindMapView = lazyWithRetry(
  () =>
    import("../views/MindMapView").then((m) => ({
      default: m.MindMapView,
    })),
  "MindMapView",
);
const MiniKanbanView = lazyWithRetry(
  () =>
    import("../views/MiniKanbanView").then((m) => ({
      default: m.MiniKanbanView,
    })),
  "MiniKanbanView",
);
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
import { useBoardWebSocketHandlers } from "../hooks/useBoardWebSocketHandlers";
import { useBoardDataLoader } from "../hooks/useBoardDataLoader";
import { useBoardFilters } from "../hooks/useBoardFilters";
import { useBoardModals } from "../hooks/useBoardModals";
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
    | "milestone"
    | "mindmap"
    | "minikanban" => {
    const saved = localStorage.getItem(`boardSubMode_${boardId}`);
    if (saved === "gantt") return "gantt";
    if (saved === "calendar") return "calendar";
    if (saved === "list") return "list";
    if (saved === "milestone") return "milestone";
    if (saved === "mindmap") return "mindmap";
    if (saved === "minikanban") return "minikanban";
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
    allBlocks,
    setAllBlocks,
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

  // 모달 상태 (open/close 상태는 useBoardModals 훅에서 관리)
  const {
    isFeatureModalOpen,
    setIsFeatureModalOpen,
    isTaskModalOpen,
    setIsTaskModalOpen,
    isAddBlockModalOpen,
    setIsAddBlockModalOpen,
    editingBlock,
    setEditingBlock,
    isAddFeatureModalOpen,
    setIsAddFeatureModalOpen,
    isShareBoardModalOpen,
    setIsShareBoardModalOpen,
    isContractorManagerOpen,
    setIsContractorManagerOpen,
    isTrashOpen,
    setIsTrashOpen,
    isSubscriptionModalOpen,
    setIsSubscriptionModalOpen,
    isPremiumBenefitsModalOpen,
    setIsPremiumBenefitsModalOpen,
    isInquiryModalOpen,
    setIsInquiryModalOpen,
    isActivityLogModalOpen,
    setIsActivityLogModalOpen,
    isMilestoneModalOpen,
    setIsMilestoneModalOpen,
    isMilestoneOnboardingOpen,
    setIsMilestoneOnboardingOpen,
    isUpgradeModalOpen,
    setIsUpgradeModalOpen,
    upgradeTrigger,
    setUpgradeTrigger,
    seatPurchaseModal,
    setSeatPurchaseModal,
    orgSeatLimitModal,
    setOrgSeatLimitModal,
    showCreditModal,
    setShowCreditModal,
    creditModalMode,
    setCreditModalMode,
    quickAddBlockId,
    setQuickAddBlockId,
    isQuickAddSubmitting,
    setIsQuickAddSubmitting,
    isShortcutsHelpOpen,
    setIsShortcutsHelpOpen,
    alertModal,
    setAlertModal,
    isAnyModalOpen,
  } = useBoardModals();

  // 모달에 표시되는 도메인 데이터 상태 (모달 wiring 외부에서도 사용 → 페이지에 유지)
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [highlightChecklistItemId, setHighlightChecklistItemId] = useState<
    string | null
  >(null);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const [meetingRefreshKey, setMeetingRefreshKey] = useState(0);
  const [meetingNavigateDate, setMeetingNavigateDate] = useState<Date | null>(
    null,
  );
  const [managementRefreshKey, setManagementRefreshKey] = useState(0);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [headerContractors, setHeaderContractors] = useState<BoardContractor[]>(
    [],
  );
  const [wsCommentEvent, setWsCommentEvent] =
    useState<BoardWebSocketEvent | null>(null);
  const [wsChecklistEvent, setWsChecklistEvent] =
    useState<BoardWebSocketEvent | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(
    null,
  );
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    keyword: "",
    members: [],
    features: [],
    tags: [],
    cardStatus: [],
    dueDate: [],
  });

  // Feature 칩 선택 상태 (null = 전체, [] = 없음, [ids] = 개별 선택)
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[] | null>(
    null,
  );

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

  const searchInputRef = useRef<HTMLInputElement>(null);
  // AI분석 > 마일스톤 서브탭 (statistics 내부 6개 탭)
  const [statisticsActiveView, setStatisticsActiveView] =
    useState<StatisticsViewType>("overview");

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

  // ======== 마일스톤 파생 필터 (칸반 계열 뷰 전용) ========
  // features/tasks는 전체(full) 단일 소스. 마일스톤 필터는 여기서 파생 계산해
  // 칸반/리스트/간트/캘린더에만 적용한다. (독립 서브탭은 전체 데이터를 사용)
  // 서버 semantics 일치: features=마일스톤 멤버십, tasks=task.milestone_id 기준.
  const kanbanFeatures = useMemo(() => {
    const mid = kanbanSelectedMilestoneId;
    if (!mid || mid === "all") return features;
    if (mid === "none") {
      const assigned = new Set<string>();
      milestones.forEach((m) => m.features?.forEach((f) => assigned.add(f.id)));
      return features.filter((f) => !assigned.has(f.id));
    }
    const ids = new Set(
      (milestones.find((m) => m.id === mid)?.features ?? []).map((f) => f.id),
    );
    return features.filter((f) => ids.has(f.id));
  }, [features, milestones, kanbanSelectedMilestoneId]);

  const kanbanTasks = useMemo(() => {
    const mid = kanbanSelectedMilestoneId;
    if (!mid || mid === "all") return tasks;
    if (mid === "none") return tasks.filter((t) => !t.milestone_id);
    return tasks.filter((t) => t.milestone_id === mid);
  }, [tasks, kanbanSelectedMilestoneId]);

  // ======== 커스텀 Hook: 필터 ========
  const { filteredFeatures, filteredTasks, sortedBlocks } = useBoardFilters(
    kanbanFeatures,
    kanbanTasks,
    blocks,
    filterOptions,
    checklistDataMap,
  );

  // ======== 키보드 단축키 ========
  // isAnyModalOpen은 useBoardModals 훅에서 파생

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

  // 마일스톤 컨텍스트 기준 블록 재로드 (WS 핸들러/블록 숨김·표시에서 공용)
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
      // 독립 서브탭(미니칸반)용 전체 블록도 최신화.
      // 마일스톤 스코프 조회면 전체 블록은 별도 조회, 아니면 동일 결과 재사용.
      if (reloadMilestoneId) {
        const fullBlockResult = await blockService.getBlocksWithHidden(
          boardId,
          undefined,
        );
        setAllBlocks(fullBlockResult.blocks);
      } else {
        setAllBlocks(blockResult.blocks);
      }
    },
    [boardId, kanbanSelectedMilestoneId, setAllBlocks],
  );

  // ======== WebSocket 실시간 동기화 ========
  const handleWebSocketEvent = useBoardWebSocketHandlers({
    boardId,
    setFeatures,
    setAllFeatures,
    setTasks,
    setBlocks,
    setChecklistDataMap,
    setBoardMembersData,
    setJobRoles,
    setUnreadNotificationCount,
    setWsChecklistEvent,
    setWsCommentEvent,
    setScheduleRefreshKey,
    setMeetingRefreshKey,
    setCascadeFeatureId,
    notifyScheduleRefresh,
    reloadFeaturesAndTasks,
    reloadBlocksForMilestone,
    milestoneIdRef,
    tasksRef,
  });

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
        // reloadFeaturesAndTasks가 마일스톤 스코프 blocks를 설정하므로,
        // 여기서는 독립 서브탭용 전체 blocks만 최신화한다.
        blockService
          .getBlocks(boardId)
          .then(setAllBlocks)
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

  // Feature별 대표(홈) 마일스톤 ID 맵 (MilestoneModal "이어짐" 판별용)
  const featurePrimaryMilestoneMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ms of milestones) {
      if (ms.features) {
        for (const f of ms.features) {
          if (f.is_primary) map[f.id] = ms.id;
        }
      }
    }
    return map;
  }, [milestones]);

  // Feature별 소속 마일스톤 목록 맵 (마인드맵 노드 칩 표시용)
  // 한 피쳐가 여러 마일스톤에 속할 수 있어 배열, idx는 색상 매핑용(마일스톤 순서)
  const featureMilestonesMap = useMemo(() => {
    const map: Record<string, { id: string; title: string; idx: number }[]> =
      {};
    milestones.forEach((ms, idx) => {
      ms.features?.forEach((f) => {
        (map[f.id] ||= []).push({ id: ms.id, title: ms.title, idx });
      });
    });
    return map;
  }, [milestones]);

  // Upgrade Modal 열기 헬퍼
  const openUpgradeModal = (trigger: UpgradeTrigger) => {
    if (hideBilling) return;
    setUpgradeTrigger(trigger);
    setIsUpgradeModalOpen(true);
  };

  // 뷰 모드 변경 핸들러 (Premium 기능 체크)
  // stable 콜백(handleNavigateToMeeting)에서 최신 handleViewModeChange 접근용
  const handleViewModeChangeRef = useRef<(mode: ViewMode) => void>(() => {});
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
  handleViewModeChangeRef.current = handleViewModeChange;

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

  const handleToggleBlockProgressBar = async (
    blockId: string,
    enabled: boolean,
  ) => {
    if (!boardId) return;
    const previousBlocks = blocks;
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, show_progress_bar: enabled } : b,
      ),
    );
    try {
      await blockService.updateBlock(boardId, blockId, {
        show_progress_bar: enabled,
      });
    } catch (error) {
      console.error("Failed to toggle progress bar:", error);
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

  const handleShowBlock = useCallback(
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
          false,
        );
        await reloadBlocksForMilestone();
      } catch (error) {
        console.error("Failed to show block:", error);
      }
    },
    [boardId, kanbanSelectedMilestoneId, reloadBlocksForMilestone],
  );

  // Feature 관리
  // 피처 생성 + (선택 시) 마일스톤 연결 + 상태 갱신. 생성된 Feature 반환.
  const createFeatureCore = async (data: {
    title: string;
    description?: string;
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
  }): Promise<Feature | null> => {
    if (!boardId) return null;

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
      notifyScheduleRefresh();
      return newFeature;
    } catch (error) {
      console.error("Failed to create feature:", error);
      return null;
    }
  };

  const handleAddFeature = async (data: {
    title: string;
    description?: string;
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
  }) => {
    const newFeature = await createFeatureCore(data);
    if (newFeature) {
      setSelectedFeature(newFeature);
      setIsFeatureModalOpen(true);
    }
  };

  // 마인드맵에서 피처 생성 (상세 모달을 열지 않고 Feature 반환 → 캔버스에 노드 배치)
  const handleCreateFeatureFromMindmap = useCallback(
    (data: {
      title: string;
      description?: string;
      startDate?: string;
      dueDate?: string;
      milestoneId?: string;
    }) => createFeatureCore(data),
    // createFeatureCore는 매 렌더 재생성되지만 최신 클로저를 참조하므로 의존성 생략
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

  const handleOpenAddBlockModal = useCallback(() => {
    setIsAddBlockModalOpen(true);
  }, []);

  const handleJoinRequestSent = useCallback(() => {
    setBoard((prev) =>
      prev ? { ...prev, has_pending_join_request: true } : prev,
    );
  }, [setBoard]);

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

  // 일정 뷰 콜백 (ScheduleView로 전달)
  const handleViewFeatureById = useCallback(
    (featureId: string) => {
      const feature = features.find((f) => f.id === featureId);
      if (feature) handleFeatureClick(feature);
    },
    [features, handleFeatureClick],
  );

  const handleNavigateToMeeting = useCallback((date?: Date) => {
    if (date) {
      setMeetingNavigateDate(date);
    }
    handleViewModeChangeRef.current("meeting");
  }, []);

  const handleViewTaskById = useCallback(
    async (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        handleTaskClick(task);
      } else if (boardId) {
        try {
          const fetched = await taskService.getTask(boardId, taskId);
          handleTaskClick(fetched);
        } catch (err) {
          console.warn("Failed to fetch task for schedule view", err);
        }
      }
    },
    [tasks, boardId, handleTaskClick],
  );

  const handleViewTaskWithChecklist = useCallback(
    (taskId: string, checklistItemId?: string) => {
      setHighlightChecklistItemId(checklistItemId || null);
      handleViewTaskById(taskId);
    },
    [handleViewTaskById],
  );

  const handleOpenContractorManager = useCallback(() => {
    setIsContractorManagerOpen(true);
  }, []);

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
      // 마일스톤 변경 시에는 기존 값과 병합해 다른 필드(날짜/설명 등)가 null로 덮이지 않게 한다.
      const hasMilestone = "milestone_id" in updates;
      const existing = tasks.find((t) => t.id === taskId);
      const base = hasMilestone ? { ...existing, ...updates } : updates;
      const updatedTask = await taskService.updateTask(boardId, taskId, {
        title: base.title,
        description: base.description,
        assignee_id: updates.assignee?.id ?? null,
        start_date: base.start_date ?? null,
        due_date: base.due_date ?? null,
        estimated_minutes: base.estimated_minutes ?? null,
        // ""=해제, 값=배정, undefined=변경 없음
        milestone_id: hasMilestone ? (updates.milestone_id ?? "") : undefined,
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

  // 피처의 대표(홈) 마일스톤을 현재 선택된 마일스톤으로 지정
  const handleSetPrimaryMilestoneFeature = async (featureId: string) => {
    if (!boardId || !selectedMilestone) return;
    const prevPrimaryId = featurePrimaryMilestoneMap[featureId];
    try {
      await milestoneService.setPrimaryFeature(
        boardId,
        selectedMilestone.id,
        featureId,
      );
      // 대표 이동으로 새 대표 + 기존 대표 마일스톤이 모두 영향받으므로 둘 다 갱신
      const affectedIds = new Set<string>([selectedMilestone.id]);
      if (prevPrimaryId) affectedIds.add(prevPrimaryId);
      const refreshed = await Promise.all(
        [...affectedIds].map((id) =>
          milestoneService.getMilestone(boardId, id),
        ),
      );
      setMilestones((prev) =>
        prev.map((m) => refreshed.find((r) => r.id === m.id) || m),
      );
      const newSelected = refreshed.find((r) => r.id === selectedMilestone.id);
      if (newSelected) setSelectedMilestone(newSelected);
    } catch (error) {
      console.error("Failed to set primary milestone feature:", error);
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

  // 타임라인 막대 드래그로 마일스톤 기간(start/end) 조정
  const handleUpdateMilestoneDates = useCallback(
    async (id: string, start_date: string, end_date: string) => {
      if (!boardId) return;
      try {
        const updated = await milestoneService.updateMilestone(boardId, id, {
          start_date,
          end_date,
        });
        setMilestones((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...updated } : m)),
        );
      } catch (error) {
        console.error("Failed to update milestone dates:", error);
      }
    },
    [boardId, setMilestones],
  );

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

  // ── 미니 칸반 뷰 핸들러 ──
  // 태스크 노드를 다른 블록 레인으로 이동 (block_id 변경, 대상 블록 끝에 append)
  const handleMiniMoveTask = useCallback(
    (taskId: string, targetBlockId: string) => {
      const count = tasks.filter((t) => t.block_id === targetBlockId).length;
      handleMoveTask(taskId, targetBlockId, count);
    },
    [tasks, handleMoveTask],
  );

  // 체크리스트 항목 날짜 패치 (TODO↔DOING 전환용 start_date 조정) — 옵티미스틱 + WS 재동기화
  const handleMiniPatchChecklist = useCallback(
    (taskId: string, itemId: string, patch: { start_date?: string | null }) => {
      if (!boardId) return;
      setChecklistDataMap((prev) => {
        const items = prev[taskId];
        if (!items) return prev;
        return {
          ...prev,
          [taskId]: items.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  ...("start_date" in patch
                    ? { start_date: patch.start_date ?? null }
                    : {}),
                }
              : it,
          ),
        };
      });
      checklistAPI
        .patchItem(boardId, taskId, itemId, patch)
        .catch((e) => console.error("mini kanban patch checklist failed", e));
    },
    [boardId, setChecklistDataMap],
  );

  // 체크리스트 완료 토글 (DONE 이동/복귀) — 옵티미스틱 + WS 재동기화(done_date는 서버 반영)
  const handleMiniToggleChecklist = useCallback(
    (taskId: string, itemId: string) => {
      if (!boardId) return;
      setChecklistDataMap((prev) => {
        const items = prev[taskId];
        if (!items) return prev;
        return {
          ...prev,
          [taskId]: items.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  completed: !it.completed,
                  done_date: !it.completed ? it.done_date : null,
                }
              : it,
          ),
        };
      });
      checklistAPI
        .toggleItem(boardId, taskId, itemId)
        .catch((e) => console.error("mini kanban toggle checklist failed", e));
    },
    [boardId, setChecklistDataMap],
  );

  const handleMoveTaskToFeature = async (
    taskId: string,
    targetFeatureId: string,
  ) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !boardId) return;

    // allFeatures(전 마일스톤)에서 조회 → 다른 마일스톤의 Feature로도 이동 가능
    const oldFeature = allFeatures.find((f) => f.id === task.feature_id);
    const newFeature = allFeatures.find((f) => f.id === targetFeatureId);
    if (!oldFeature || !newFeature) return;

    // 대상 Feature가 현재 마일스톤 뷰 밖이면(크로스 마일스톤) 현재 목록에서 제거
    const isCrossMilestone = !features.some((f) => f.id === targetFeatureId);

    if (isCrossMilestone) {
      setTasks((prevTasks) => prevTasks.filter((t) => t.id !== taskId));
    } else {
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
    }

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
      if (isCrossMilestone) {
        // 제거했던 태스크 복원
        setTasks((prevTasks) =>
          prevTasks.some((t) => t.id === taskId)
            ? prevTasks
            : [...prevTasks, task],
        );
      } else {
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
      }
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

        {/* 서브뷰 ↔ 마일스톤 구분선 (마인드맵은 통합 뷰라 마일스톤 필터 제외) */}
        {BOARD_SUB_MODES.includes(viewMode) &&
          viewMode !== "milestone" &&
          viewMode !== "mindmap" &&
          milestones.length > 0 && (
            <div className="border-b border-foreground/[0.08]" />
          )}

        {/* 마일스톤 탭 바 (보드 서브뷰에서 표시, milestone·mindmap 뷰 제외) */}
        {BOARD_SUB_MODES.includes(viewMode) &&
          viewMode !== "milestone" &&
          viewMode !== "mindmap" &&
          milestones.length > 0 && (
            <MilestoneTabBar
              milestones={milestones}
              allFeatures={allFeatures}
              selectedMilestoneId={kanbanSelectedMilestoneId}
              canAccessMilestone={canAccessMilestone}
              onSelect={handleKanbanMilestoneSelect}
              onOpenMilestone={handleOpenMilestoneWithCheck}
            />
          )}

        {/* 일정 탭 서브탭 바 (타임블록 / 캘린더 / 리소스) */}
        {viewMode === "schedule" && (
          <ScheduleSubTabBar
            activeTab={scheduleSubTab}
            onChange={handleScheduleSubTabChange}
          />
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
          <GanttView
            boardId={boardId || ""}
            searchInputRef={searchInputRef}
            filterOptions={filterOptions}
            onFilterChange={setFilterOptions}
            features={kanbanFeatures}
            filteredFeatures={filteredFeatures}
            tasks={kanbanTasks}
            filteredTasks={filteredTasks}
            setTasks={setTasks}
            tags={tags}
            boardMembersData={boardMembersData}
            milestones={milestones}
            selectedMilestoneId={kanbanSelectedMilestoneId}
            canEdit={canEdit}
            onFeatureClick={handleFeatureClick}
            onTaskClick={handleTaskClick}
          />
        ) : viewMode === "kanban" ? (
          <KanbanView
            boardId={boardId || ""}
            searchInputRef={searchInputRef}
            features={kanbanFeatures}
            filteredFeatures={filteredFeatures}
            tasks={kanbanTasks}
            filteredTasks={filteredTasks}
            tags={tags}
            boardMembersData={boardMembersData}
            blocks={blocks}
            setBlocks={setBlocks}
            sortedBlocks={sortedBlocks}
            hiddenBlocks={hiddenBlocks}
            checklistDataMap={checklistDataMap}
            memberColorMap={memberColorMap}
            expandedChecklistTaskIds={expandedChecklistTaskIds}
            scheduledTaskIds={scheduledTaskIds}
            recentlyCompletedTaskIds={recentlyCompletedTaskIds}
            cascadeFeatureId={cascadeFeatureId}
            selectedFeatureIds={selectedFeatureIds}
            selectedMilestoneId={kanbanSelectedMilestoneId}
            filterOptions={filterOptions}
            canEdit={canEdit}
            isOrgMemberViewer={isOrgMemberViewer}
            hasPendingJoinRequest={board?.has_pending_join_request ?? false}
            onFilterChange={setFilterOptions}
            onToggleFeatureChip={handleToggleFeatureChip}
            onSelectAllFeatureChips={handleSelectAllFeatureChips}
            onFeatureClick={handleFeatureClick}
            onOpenAddFeature={handleOpenAddFeatureModal}
            onOpenAddBlock={handleOpenAddBlockModal}
            onTaskClick={handleTaskClick}
            onMoveTask={handleMoveTask}
            onReorderTask={handleReorderTask}
            onEditBlock={setEditingBlock}
            onDeleteBlock={handleDeleteBlock}
            onToggleProgressBar={handleToggleBlockProgressBar}
            onHideBlock={handleHideBlock}
            onShowBlock={handleShowBlock}
            onToggleChecklistExpand={handleToggleChecklistExpand}
            onQuickAddTask={setQuickAddBlockId}
            onJoinRequestSent={handleJoinRequestSent}
          />
        ) : viewMode === "schedule" ? (
          <ScheduleView
            boardId={boardId || ""}
            scheduleSubTab={scheduleSubTab}
            organizationId={board?.organization_id}
            boardMembersData={boardMembersData}
            memberColorMap={memberColorMap}
            jobRoles={jobRoles}
            memberJobRoleMap={memberJobRoleMap}
            milestones={milestones}
            allFeatures={allFeatures}
            scheduleRefreshKey={scheduleRefreshKey}
            scheduleRefreshPanel={scheduleRefreshPanel}
            wsChecklistEvent={wsChecklistEvent}
            currentUserRole={currentUserRole}
            urlTab={urlTab}
            notifyScheduleRefresh={notifyScheduleRefresh}
            onViewFeatureById={handleViewFeatureById}
            onNavigateToMeeting={handleNavigateToMeeting}
            onViewTaskWithChecklist={handleViewTaskWithChecklist}
            onViewTaskById={handleViewTaskById}
            onItemDetailClick={handleChecklistItemDetailClick}
            onOpenContractorManager={handleOpenContractorManager}
            onMilestoneClick={handleOpenMilestoneWithCheck}
          />
        ) : viewMode === "calendar" ? (
          <main className="flex-1 flex flex-col overflow-hidden">
            <KanbanFilterToolbar
              ref={searchInputRef}
              filterOptions={filterOptions}
              onFilterChange={setFilterOptions}
              features={kanbanFeatures}
              tags={tags}
              boardMembersData={boardMembersData}
              tasks={kanbanTasks}
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
                onUpdateMilestoneDates={
                  canEdit ? handleUpdateMilestoneDates : undefined
                }
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
              features={kanbanFeatures}
              tags={tags}
              boardMembersData={boardMembersData}
              tasks={kanbanTasks}
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
        ) : viewMode === "mindmap" ? (
          <main className="flex-1 flex flex-col overflow-hidden">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <MindMapView
                boardId={boardId || ""}
                features={allFeatures}
                tasks={tasks}
                featureMilestonesMap={featureMilestonesMap}
                canEdit={canEdit}
                memberColorMap={memberColorMap}
                milestones={milestones}
                onFeatureClick={handleFeatureClick}
                onTaskClick={handleTaskClick}
                onCreateFeature={handleCreateFeatureFromMindmap}
              />
            </Suspense>
          </main>
        ) : viewMode === "minikanban" ? (
          <main className="flex-1 flex flex-col overflow-hidden">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="w-8 h-8 border-2 border-bridge-accent border-t-transparent rounded-full animate-spin" />
                </div>
              }
            >
              <MiniKanbanView
                boardId={boardId || ""}
                blocks={blocks}
                tasks={kanbanTasks}
                checklistByTask={checklistDataMap}
                canEdit={canEdit}
                memberColorMap={memberColorMap}
                onTaskClick={handleTaskClick}
                onMoveTask={handleMiniMoveTask}
                onPatchChecklist={handleMiniPatchChecklist}
                onToggleChecklist={handleMiniToggleChecklist}
              />
            </Suspense>
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
          features={kanbanFeatures}
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
          featurePrimaryMilestoneMap={featurePrimaryMilestoneMap}
          onSetPrimaryMilestoneFeature={handleSetPrimaryMilestoneFeature}
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

        {/* 우하단 플로팅 뷰 전환 버튼 (보드 표현 뷰에서만 표시, 마일스톤·마인드맵 제외) */}
        {BOARD_SUB_MODES.includes(viewMode) &&
          viewMode !== "milestone" &&
          viewMode !== "mindmap" && (
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
