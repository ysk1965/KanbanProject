import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Users, Settings, Filter, ArrowLeft, LayoutGrid, Calendar, Flag, Pencil, Lock, BarChart3, Search, X, User, ChevronDown, CheckCircle2, Circle, Tag as TagIcon, Layers, ChevronsDownUp, ChevronsUpDown, Lightbulb, MessageSquare, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { isWhiteLabelDomain } from '../utils/domain';

// 뷰 모드 타입
type ViewMode = 'kanban' | 'weekly' | 'schedule' | 'meeting' | 'notes' | 'statistics' | 'ai_report';
import { DragProvider } from '../contexts/DragContext';
import { useAuth } from '../contexts/AuthContext';
import { Block, Feature, Task, Tag, Board, InviteLink, Subscription, ActivityLog, Milestone, BoardTierInfo, BoardLimits, ChecklistItem, NotificationItem, BoardWebSocketEvent, TaskComment, AiCredits } from '../types';
import { KanbanBlock } from '../components/KanbanBlock';
import { FeatureCard } from '../components/FeatureCard';
import { FeatureChipSelector } from '../components/FeatureChipSelector';
import { FeatureDetailModal } from '../components/FeatureDetailModal';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { AddBlockModal } from '../components/AddBlockModal';
import { AddFeatureModal } from '../components/AddFeatureModal';
import { TrialBanner } from '../components/TrialBanner';
import { FilterOptions } from '../components/FilterModal';
import { ShareBoardModal, BoardMember as ShareBoardMember, MemberRole } from '../components/ShareBoardModal';
import { SubscriptionModal } from '../components/SubscriptionModal';
// ActivityLogModal replaced by NotificationDropdown
import { NotificationDropdown } from '../components/NotificationDropdown';
import { MilestoneModal } from '../components/MilestoneModal';
import { MilestoneOnboardingModal } from '../components/MilestoneOnboardingModal';
import { UpgradeModal, UpgradeTrigger } from '../components/UpgradeModal';
import { PremiumBenefitsModal } from '../components/PremiumBenefitsModal';
import { SeatPurchaseModal } from '../components/SeatPurchaseModal';
import { AlertModal } from '../components/AlertModal';
import { UserMenu } from '../components/UserMenu';
import { DailyScheduleView } from '../components/DailyScheduleView';
import { MeetingCalendarView } from '../components/MeetingCalendarView';
import { WeeklyScheduleView } from '../components/WeeklyScheduleView';
import { StatisticsView } from '../components/StatisticsView';
import { AIReportPanel } from '../components/AIReportPanel';
import { NotesView } from '../components/notes/NotesView';
import { EmptyBoardGuide } from '../components/EmptyBoardGuide';
import { InquiryModal } from '../components/InquiryModal';
import { AnnouncementDisplay } from '../components/AnnouncementDisplay';
import { AiCreditPurchaseModal } from '../components/AiCreditPurchaseModal';
import { Button } from '../components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  boardService,
  featureService,
  taskService,
  blockService,
  tagService,
  memberService,
  inviteLinkService,
  subscriptionService,
  activityService,
  milestoneService,
  checklistService,
  inquiryService,
  aiCreditService
} from '../utils/services';
import { notificationAPI, checklistAPI, scheduleAPI } from '../utils/api';

import { useTranslation } from 'react-i18next';
import { getRandomFeatureColor } from '../constants';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';
import { useBoardWebSocket } from '../hooks/useBoardWebSocket';

declare const __FE_COMMIT_HASH__: string;


export function KanbanBoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const { currentUser, logout, hideBilling, isTester, isAdmin: isSystemAdmin } = useAuth();

  // URL 쿼리 파라미터에서 뷰/탭 정보 읽기 (Slack 등 외부 링크용)
  const urlView = searchParams.get('view') as ViewMode | null;
  const urlTab = searchParams.get('tab');

  // 버전 정보
  const [beCommit, setBeCommit] = useState<string>('');
  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
    const origin = (() => { try { return new URL(apiBase).origin; } catch { return 'http://localhost:8080'; } })();
    fetch(`${origin}/health`).then(r => r.json()).then(d => setBeCommit(d.commit || '')).catch(() => {});
  }, []);

  // 뷰 모드 상태 (URL 파라미터 우선, 없으면 localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (urlView && ['kanban', 'weekly', 'schedule', 'meeting', 'notes', 'statistics', 'ai_report'].includes(urlView)) {
      return urlView;
    }
    const saved = localStorage.getItem(`viewMode_${boardId}`);
    return (saved as ViewMode) || 'kanban';
  });

  // 병합 탭 서브모드 기억 헬퍼
  const getScheduleSubMode = (): 'schedule' | 'weekly' => {
    const saved = localStorage.getItem(`scheduleSubMode_${boardId}`);
    return saved === 'weekly' ? 'weekly' : 'schedule';
  };
  const getAISubMode = (): 'statistics' | 'ai_report' => {
    const saved = localStorage.getItem(`aiSubMode_${boardId}`);
    return saved === 'ai_report' ? 'ai_report' : 'statistics';
  };

  // URL 쿼리 파라미터 소비 후 제거 (뒤로가기 시 다시 트리거 방지)
  useEffect(() => {
    if (urlView || urlTab) {
      searchParams.delete('view');
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // 보드 이름 인라인 편집
  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [editingBoardName, setEditingBoardName] = useState('');
  const boardNameInputRef = useRef<HTMLInputElement>(null);

  // 보드 데이터
  const [board, setBoard] = useState<Board | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [allFeatures, setAllFeatures] = useState<Feature[]>([]); // 마일스톤 모달용 전체 Feature
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  // pricingPlans removed - seat-based billing doesn't need PricingPlan table
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | undefined>();
  const [hasMoreActivity, setHasMoreActivity] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 배치 로드된 체크리스트 데이터 (taskId -> ChecklistItem[])
  const [checklistDataMap, setChecklistDataMap] = useState<{ [taskId: string]: ChecklistItem[] }>({});
  // 스케줄 블록이 있는 Task ID 세트 (타임블록 정렬/표시용)
  const [scheduledTaskIds, setScheduledTaskIds] = useState<Set<string>>(new Set());

  // Tier & Limits 상태
  const [tierInfo, setTierInfo] = useState<BoardTierInfo | null>(null);
  const [boardLimits, setBoardLimits] = useState<BoardLimits | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTrigger, setUpgradeTrigger] = useState<UpgradeTrigger>('task_limit');
  const [seatPurchaseModal, setSeatPurchaseModal] = useState<{
    open: boolean;
    seatCount: number;
    billableMemberCount: number;
    pendingEmail: string;
    pendingRole: MemberRole;
    pendingMemberId?: string; // 역할 변경 시 사용
  } | null>(null);

  // AI Credits 상태
  const [aiCredits, setAiCredits] = useState<AiCredits | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditModalMode, setCreditModalMode] = useState<'purchase' | 'exhausted'>('purchase');

  // 체크리스트 펼침 상태
  const [expandedChecklistTaskIds, setExpandedChecklistTaskIds] = useState<Set<string>>(new Set());
  // Feature 서브태스크 펼침 상태
  const [expandedFeatureIds, setExpandedFeatureIds] = useState<Set<string>>(new Set());

  // 멤버 데이터
  const [boardMembersData, setBoardMembersData] = useState<ShareBoardMember[]>([]);
  const currentUserId = currentUser?.id || '';

  const memberColorMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    boardMembersData.forEach((m) => { map[m.userId] = m.assigneeColor || null; });
    return map;
  }, [boardMembersData]);

  // 모달 상태
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const [meetingRefreshKey, setMeetingRefreshKey] = useState(0);
  const [managementRefreshKey, setManagementRefreshKey] = useState(0);
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);
  const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] = useState(false);
  const [isShareBoardModalOpen, setIsShareBoardModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isPremiumBenefitsModalOpen, setIsPremiumBenefitsModalOpen] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [isActivityLogModalOpen, setIsActivityLogModalOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadInquiryCount, setUnreadInquiryCount] = useState(0);
  const [wsCommentEvent, setWsCommentEvent] = useState<BoardWebSocketEvent | null>(null);
  const [wsChecklistEvent, setWsChecklistEvent] = useState<BoardWebSocketEvent | null>(null);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [isMilestoneOnboardingOpen, setIsMilestoneOnboardingOpen] = useState(false);
  const [kanbanSelectedMilestoneId, setKanbanSelectedMilestoneId] = useState<string>('all');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    keyword: '',
    members: [],
    features: [],
    tags: [],
    cardStatus: [],
    dueDate: [],
  });

  // Feature 칩 선택 상태 (null = 전체, [] = 없음, [ids] = 개별 선택)
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[] | null>(null);

  // Alert Modal 상태
  const [alertModal, setAlertModal] = useState<{
    open: boolean;
    type: 'premium' | 'permission';
  }>({ open: false, type: 'premium' });

  const showAlertModal = (type: 'premium' | 'permission') => {
    setAlertModal({ open: true, type });
  };

  // 보드 데이터 로드 - 통합 API 사용 (기존 13개 → 2개로 감소)
  useEffect(() => {
    const loadBoardData = async () => {
      if (!boardId) {
        navigate('/boards');
        return;
      }

      try {
        setIsLoading(true);

        // 통합 API 호출
        const fullData = await boardService.getBoardFull(boardId);

        // 통합 응답 분배
        setBoard({
          id: fullData.id,
          name: fullData.name,
          description: fullData.description,
          owner: fullData.owner,
          my_role: fullData.my_role,
          is_starred: fullData.is_starred,
          member_count: fullData.member_count,
          subscription: fullData.subscription,
          selected_milestone_id: fullData.selected_milestone_id,
          created_at: fullData.created_at,
          updated_at: fullData.updated_at,
        });
        setBlocks(fullData.blocks);
        setTags(fullData.tags);
        setInviteLinks(fullData.invite_links || []);
        setSubscription(fullData.subscription_detail);
        setActivities(fullData.activities.activities);
        setActivityCursor(fullData.activities.next_cursor || undefined);
        setHasMoreActivity(fullData.activities.has_more);

        setMilestones(fullData.milestones.milestones);
        setTierInfo(fullData.tier_info);
        setBoardLimits(fullData.limits);
        setAllFeatures(fullData.features); // 마일스톤 모달용 전체 Feature 저장
        setBoardMembersData(fullData.members.members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role.toLowerCase() as MemberRole,
          assigneeColor: m.assignee_color || null,
        })));

        // 보드에 선택된 마일스톤이 있으면 해당 마일스톤으로 필터링된 데이터 로드
        let finalTasks = fullData.tasks;
        if (fullData.selected_milestone_id) {
          setKanbanSelectedMilestoneId(fullData.selected_milestone_id);
          const [filteredFeatures, filteredTasks] = await Promise.all([
            featureService.getFeatures(boardId, fullData.selected_milestone_id),
            taskService.getTasks(boardId, { milestone_id: fullData.selected_milestone_id }),
          ]);
          setFeatures(filteredFeatures);
          setTasks(filteredTasks);
          finalTasks = filteredTasks;
        } else {
          setFeatures(fullData.features);
          setTasks(fullData.tasks);
        }

        // 체크리스트가 있는 Task들의 ID 수집 후 배치 로드
        const taskIdsWithChecklist = finalTasks
          .filter((t: Task) => (t.checklist_total ?? 0) > 0)
          .map((t: Task) => t.id);

        if (taskIdsWithChecklist.length > 0) {
          try {
            const batchChecklistData = await checklistService.getBatchChecklists(boardId, taskIdsWithChecklist);
            // API 응답을 ChecklistItem[] 형식으로 변환
            const checklistMap: { [taskId: string]: ChecklistItem[] } = {};
            // 백엔드 응답 형식: { checklists: [{ task_id, total, completed, items }] }
            const checklists = (batchChecklistData as any).checklists || [];
            checklists.forEach((group: any) => {
              const taskId = group.task_id || group.taskId;
              if (group && taskId && Array.isArray(group.items)) {
                checklistMap[taskId] = group.items.map((item: any) => ({
                  id: item.id,
                  title: item.title,
                  completed: item.completed,
                  position: item.position,
                  due_date: item.due_date,
                  assignee: item.assignee ? { id: item.assignee.id, name: item.assignee.name } : null,
                }));
              }
            });
            setChecklistDataMap(checklistMap);
          } catch (error) {
            console.warn('Failed to load batch checklists:', error);
            // 배치 로드 실패 시 개별 로드로 fallback (DraggableCard에서 처리)
          }
        }

        // 스케줄 블록이 있는 Task ID 로드
        try {
          const scheduledData = await scheduleAPI.getScheduledTaskIds(boardId);
          setScheduledTaskIds(new Set(scheduledData.task_ids));
        } catch (error) {
          console.warn('Failed to load scheduled task ids:', error);
        }
      } catch (error) {
        console.error('Failed to load board data:', error);
        navigate('/boards');
      } finally {
        setIsLoading(false);
      }
    };

    loadBoardData();
  }, [boardId, navigate]);

  // AI 크레딧 조회 (보드 로드 시)
  useEffect(() => {
    if (boardId) {
      aiCreditService.getCredits(boardId)
        .then(res => setAiCredits(res))
        .catch(() => {}); // 실패 시 무시 (비로그인 등)
    }
  }, [boardId]);

  // 402 이벤트 리스너 (크레딧 소진 시)
  useEffect(() => {
    const handler = () => {
      setCreditModalMode('exhausted');
      setShowCreditModal(true);
    };
    window.addEventListener('ai-credits-exhausted', handler);
    return () => window.removeEventListener('ai-credits-exhausted', handler);
  }, []);

  // AI 크레딧 구매 완료 콜백
  const handleCreditPurchaseComplete = (updatedCredits: AiCredits) => {
    setAiCredits(updatedCredits);
    setShowCreditModal(false);
  };

  // 결제 완료 후 pending action 처리 (시트 구매 → 초대/역할변경 재시도)
  useEffect(() => {
    const pendingSeatAction = localStorage.getItem('pending_seat_action');
    if (pendingSeatAction && boardId && !isLoading) {
      localStorage.removeItem('pending_seat_action');
      try {
        const action = JSON.parse(pendingSeatAction);
        if (action.type === 'roleChange' && action.pendingMemberId) {
          handleUpdateMemberRole(action.pendingMemberId, action.pendingRole);
        } else if (action.type === 'invite' && action.pendingEmail) {
          handleAddMember(action.pendingEmail, action.pendingRole);
        }
      } catch (e) {
        console.error('Failed to process pending seat action:', e);
      }
    }
  }, [boardId, isLoading]);

  // ShareBoardModal 열릴 때 멤버 목록 새로고침
  useEffect(() => {
    if (!isShareBoardModalOpen || !boardId) return;

    const refreshMembers = async () => {
      try {
        const membersData = await memberService.getMembers(boardId);
        setBoardMembersData(membersData.members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role.toLowerCase() as MemberRole,
          assigneeColor: m.assignee_color,
        })));
      } catch (error) {
        console.error('Failed to refresh members:', error);
      }
    };

    refreshMembers();
  }, [isShareBoardModalOpen, boardId]);

  // 보드의 선택된 마일스톤 동기화
  useEffect(() => {
    if (board?.selected_milestone_id) {
      setKanbanSelectedMilestoneId(board.selected_milestone_id);
    } else {
      setKanbanSelectedMilestoneId('all');
    }
  }, [board?.selected_milestone_id]);

  // ======== WebSocket 실시간 동기화 ========
  const handleWebSocketEvent = useCallback((event: BoardWebSocketEvent) => {
    const { type, data } = event;

    switch (type) {
      // Feature events
      case 'FEATURE_CREATED': {
        const feature = data as Feature;
        setFeatures(prev => prev.some(f => f.id === feature.id) ? prev : [...prev, feature]);
        setAllFeatures(prev => prev.some(f => f.id === feature.id) ? prev : [...prev, feature]);
        break;
      }
      case 'FEATURE_UPDATED': {
        const feature = data as Feature;
        setFeatures(prev => prev.map(f => f.id === feature.id ? feature : f));
        setAllFeatures(prev => prev.map(f => f.id === feature.id ? feature : f));
        break;
      }
      case 'FEATURE_DELETED': {
        const { id } = data as { id: string };
        setFeatures(prev => prev.filter(f => f.id !== id));
        setAllFeatures(prev => prev.filter(f => f.id !== id));
        setTasks(prev => prev.filter(t => t.feature_id !== id));
        break;
      }
      case 'FEATURES_REORDERED': {
        const { features } = data as { features: Feature[] };
        if (Array.isArray(features)) {
          setFeatures(features);
          setAllFeatures(features);
        }
        break;
      }

      // Task events — Feature 카운트는 서버가 계산한 값을 그대로 사용
      case 'TASK_CREATED': {
        const { task, feature } = data as { task: Task; feature: { id: string; total_tasks: number; completed_tasks: number; progress_percentage: number } };
        setTasks(prev => prev.some(t => t.id === task.id) ? prev : [...prev, task]);
        setFeatures(prev => prev.map(f => f.id === feature.id ? { ...f, ...feature } : f));
        break;
      }
      case 'TASK_UPDATED': {
        const task = data as Task;
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...task } : t));
        break;
      }
      case 'TASK_DELETED': {
        const { id, feature } = data as { id: string; feature: { id: string; total_tasks: number; completed_tasks: number; progress_percentage: number } };
        setTasks(prev => prev.filter(t => t.id !== id));
        setFeatures(prev => prev.map(f => f.id === feature.id ? { ...f, ...feature } : f));
        break;
      }
      case 'TASK_MOVED': {
        const { task, feature } = data as { task: Task; feature: { id: string; total_tasks: number; completed_tasks: number; progress_percentage: number } };
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...task } : t));
        setFeatures(prev => prev.map(f => f.id === feature.id ? { ...f, ...feature } : f));
        break;
      }

      // Block events
      case 'BLOCK_CREATED': {
        const block = data as Block;
        setBlocks(prev => prev.some(b => b.id === block.id) ? prev : [...prev, block]);
        break;
      }
      case 'BLOCK_UPDATED': {
        const block = data as Block;
        setBlocks(prev => prev.map(b => b.id === block.id ? block : b));
        break;
      }
      case 'BLOCK_DELETED': {
        const { id } = data as { id: string };
        setBlocks(prev => prev.filter(b => b.id !== id));
        break;
      }
      case 'BLOCKS_REORDERED': {
        const { blocks } = data as { blocks: Block[] };
        if (Array.isArray(blocks)) {
          setBlocks(blocks);
        }
        break;
      }

      // Checklist events → TaskDetailModal 전달 + 보드 상태 직접 업데이트
      case 'CHECKLIST_CREATED': {
        const { item: createdItem, task_id: createTaskId } = data as { item: ChecklistItem; task_id: string };
        setChecklistDataMap(prev => ({
          ...prev,
          [createTaskId]: [...(prev[createTaskId] || []), createdItem]
        }));
        setTasks(prev => prev.map(t => t.id === createTaskId ? {
          ...t,
          checklist_total: (t.checklist_total || 0) + 1,
        } : t));
        setScheduleRefreshKey(prev => prev + 1);
        setWsChecklistEvent(event);
        break;
      }
      case 'CHECKLIST_UPDATED': {
        const { item: updatedItem, task_id: updateTaskId } = data as { item: ChecklistItem; task_id: string };
        setChecklistDataMap(prev => ({
          ...prev,
          [updateTaskId]: (prev[updateTaskId] || []).map(ci => ci.id === updatedItem.id ? updatedItem : ci)
        }));
        setScheduleRefreshKey(prev => prev + 1);
        setWsChecklistEvent(event);
        break;
      }
      case 'CHECKLIST_DELETED': {
        const { id: deletedId, task_id: deleteTaskId } = data as { id: string; task_id: string };
        setChecklistDataMap(prev => {
          const items = (prev[deleteTaskId] || []).filter(ci => ci.id !== deletedId);
          return { ...prev, [deleteTaskId]: items };
        });
        setTasks(prev => prev.map(t => t.id === deleteTaskId ? {
          ...t,
          checklist_total: Math.max(0, (t.checklist_total || 0) - 1),
        } : t));
        setScheduleRefreshKey(prev => prev + 1);
        setWsChecklistEvent(event);
        break;
      }
      case 'CHECKLIST_TOGGLED': {
        const { item: toggledItem, task_id: toggleTaskId } = data as { item: ChecklistItem; task_id: string };
        setChecklistDataMap(prev => ({
          ...prev,
          [toggleTaskId]: (prev[toggleTaskId] || []).map(ci => ci.id === toggledItem.id ? toggledItem : ci)
        }));
        const delta = toggledItem.completed ? 1 : -1;
        setTasks(prev => prev.map(t => t.id === toggleTaskId ? {
          ...t,
          checklist_completed: Math.max(0, (t.checklist_completed || 0) + delta),
        } : t));
        setScheduleRefreshKey(prev => prev + 1);
        setWsChecklistEvent(event);
        break;
      }

      // Comment events → 직접 상태 업데이트 (REST 재호출 없음)
      case 'COMMENT_CREATED':
      case 'COMMENT_UPDATED':
      case 'COMMENT_DELETED':
      case 'COMMENT_REACTION_TOGGLED':
        setWsCommentEvent(event);
        break;

      // Schedule events → refreshTrigger로 DailyScheduleView 리로드
      case 'SCHEDULE_CREATED':
      case 'SCHEDULE_UPDATED':
      case 'SCHEDULE_DELETED':
        setScheduleRefreshKey(prev => prev + 1);
        break;

      // Meeting events → MeetingCalendarView 리로드
      case 'MEETING_CREATED':
      case 'MEETING_UPDATED':
      case 'MEETING_DELETED':
        setMeetingRefreshKey(prev => prev + 1);
        break;

      // Member events → assignee color 등 멤버 정보 동기화
      case 'MEMBER_UPDATED': {
        const memberData = data as { id?: string; user?: { id?: string }; assignee_color?: string | null; role?: string };
        if (memberData?.id) {
          setBoardMembersData(prev => prev.map(m =>
            m.id === memberData.id
              ? { ...m, assigneeColor: memberData.assignee_color ?? null, role: (memberData.role?.toLowerCase() as MemberRole) || m.role }
              : m
          ));
        }
        break;
      }

      // Notification events
      case 'NOTIFICATION_CREATED':
        setUnreadNotificationCount(prev => prev + 1);
        break;

      default:
        break;
    }
  }, []);

  // PREMIUM/TRIAL만 실시간 WebSocket 활성화, STANDARD는 기존 폴링 유지
  const isRealtimeEnabled = tierInfo?.tier !== 'STANDARD';

  const { connectionStatus, onlineUsers } = useBoardWebSocket({
    boardId: boardId || null,
    onEvent: handleWebSocketEvent,
    enabled: isRealtimeEnabled,
  });

  // 재연결 시 누락된 이벤트 복구: 연결이 끊겼다가 다시 연결되면 전체 데이터 silent refetch
  const hasConnectedBefore = useRef(false);
  useEffect(() => {
    if (connectionStatus === 'connected') {
      if (hasConnectedBefore.current && boardId) {
        const milestoneId = kanbanSelectedMilestoneId !== 'all' ? kanbanSelectedMilestoneId : undefined;
        reloadFeaturesAndTasks(milestoneId);
        blockService.getBlocks(boardId).then(setBlocks).catch(() => {});
        notificationAPI.getUnreadCount(boardId)
          .then(res => setUnreadNotificationCount(res.unread_count))
          .catch(() => {});
      }
      hasConnectedBefore.current = true;
    }
  }, [connectionStatus, boardId]);

  // 알림: PREMIUM/TRIAL은 WebSocket으로 실시간, STANDARD는 30초 폴링
  useEffect(() => {
    if (!boardId || !currentUser) return;
    const fetchUnreadCount = async () => {
      try {
        const response = await notificationAPI.getUnreadCount(boardId);
        setUnreadNotificationCount(response.unread_count);
      } catch (error) {
        /* silently fail */
      }
    };
    fetchUnreadCount();
    if (!isRealtimeEnabled) {
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [boardId, currentUser, isRealtimeEnabled]);

  // 문의 읽지 않은 답변 수 로드
  useEffect(() => {
    if (!currentUser) return;
    const fetchUnreadInquiryCount = async () => {
      try {
        const count = await inquiryService.getUnreadReplyCount();
        setUnreadInquiryCount(count);
      } catch (error) {
        /* silently fail */
      }
    };
    fetchUnreadInquiryCount();
  }, [currentUser, isInquiryModalOpen]);

  // STANDARD 전환 후 첫 방문 시 Premium 혜택 모달 자동 표시
  useEffect(() => {
    if (!boardId || !tierInfo || hideBilling || isLoading) return;
    if (tierInfo.tier === 'STANDARD') {
      const storageKey = `bridge_premium_benefits_shown_${boardId}`;
      if (!localStorage.getItem(storageKey)) {
        setIsPremiumBenefitsModalOpen(true);
        localStorage.setItem(storageKey, 'true');
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

  // Premium 기능 접근 제어 헬퍼 (hideBilling 사용자는 제한 없음)
  const canAccessSchedule = hideBilling || (tierInfo?.can_access_schedule ?? true);
  const canAccessMilestone = hideBilling || (tierInfo?.can_access_milestone ?? true);
  const canAccessSlack = hideBilling || (tierInfo?.can_access_slack ?? true);

  // Upgrade Modal 열기 헬퍼
  const openUpgradeModal = (trigger: UpgradeTrigger) => {
    setUpgradeTrigger(trigger);
    setIsUpgradeModalOpen(true);
  };

  // 통계 접근 권한 (Premium 보드 + Admin 이상, hideBilling 사용자는 제한 없음)
  const canAccessStatistics = hideBilling || (tierInfo?.can_access_statistics ?? true);
  const isAdminOrOwner = boardMembersData?.some(
    (m) => m.userId === currentUser?.id && (m.role === 'owner' || m.role === 'admin')
  ) ?? false;
  const canViewStatistics = canAccessStatistics && (isAdminOrOwner || isSystemAdmin);

  // Viewer 권한 체크 - Viewer는 수정 불가
  // System ADMIN이 멤버가 아닌 보드에 접근 시 board.my_role을 fallback으로 사용
  const memberRole = boardMembersData?.find(
    (m) => m.userId === currentUser?.id
  )?.role;
  const currentUserRole = memberRole ?? (
    isSystemAdmin && board?.my_role
      ? board.my_role.toLowerCase() as MemberRole
      : undefined
  );
  const isViewer = currentUserRole === 'viewer';
  const isOwner = currentUserRole === 'owner';
  const canEdit = !isViewer;

  // 보드 이름 편집 시작
  const handleStartEditBoardName = () => {
    if (!canEdit || !board) return;
    setEditingBoardName(board.name);
    setIsEditingBoardName(true);
    setTimeout(() => boardNameInputRef.current?.select(), 0);
  };

  // 보드 이름 저장
  const handleSaveBoardName = async () => {
    const trimmed = editingBoardName.trim();
    if (!trimmed || !board || !boardId || trimmed === board.name) {
      setIsEditingBoardName(false);
      return;
    }
    try {
      await boardService.updateBoard(boardId, trimmed, board.description);
      setBoard((prev) => prev ? { ...prev, name: trimmed } : prev);
    } catch (e) {
      console.error('Failed to update board name', e);
    }
    setIsEditingBoardName(false);
  };

  // 구독/결제 UI는 보드 Owner만 접근 가능 (시스템 ADMIN/TESTER도 숨김)
  const hideBillingForUser = hideBilling || !isOwner;

  // 뷰 모드 변경 핸들러 (Premium 기능 체크)
  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'weekly' && !canAccessSchedule) {
      openUpgradeModal('weekly_schedule');
      return;
    }
    if (mode === 'statistics') {
      if (!canAccessStatistics) {
        openUpgradeModal('statistics');
        return;
      }
      if (!isAdminOrOwner) {
        return;
      }
    }
    if (mode === 'ai_report' && !canAccessStatistics) {
      openUpgradeModal('statistics');
      return;
    }
    // 병합 탭 서브모드 기억
    if (mode === 'schedule' || mode === 'weekly') {
      localStorage.setItem(`scheduleSubMode_${boardId}`, mode);
    }
    if (mode === 'statistics' || mode === 'ai_report') {
      localStorage.setItem(`aiSubMode_${boardId}`, mode);
    }
    setViewMode(mode);
    localStorage.setItem(`viewMode_${boardId}`, mode);
  };

  // 마일스톤 열기 핸들러 (Premium 기능 체크)
  const handleOpenMilestoneWithCheck = async (milestone?: Milestone) => {
    if (!canAccessMilestone) {
      openUpgradeModal('milestone');
      return;
    }
    if (milestone && boardId) {
      // 목록 조회에는 features가 없으므로 상세 조회로 features 포함된 데이터를 가져옴
      try {
        const detailed = await milestoneService.getMilestone(boardId, milestone.id);
        setSelectedMilestone(detailed);
      } catch {
        setSelectedMilestone(milestone);
      }
    } else {
      setSelectedMilestone(null);
    }
    setIsMilestoneModalOpen(true);
  };

  // Seat 기반 업그레이드 핸들러 (Toss 결제창 리다이렉트)
  const handleSeatUpgrade = async (billingCycle: 'MONTHLY' | 'YEARLY', seatCount: number) => {
    if (!boardId) return;
    try {
      await subscriptionService.startSeatSubscription(boardId, {
        billing_cycle: billingCycle,
        seat_count: seatCount,
      });
      // requestPayment 이후 Toss 결제창으로 리다이렉트됨
      // 여기 도달 시 사용자가 결제창을 닫은 경우
    } catch (error: any) {
      if (error?.code === 'PAY_PROCESS_CANCELED' || error?.code === 'USER_CANCEL') {
        return;
      }
      console.error('Failed to upgrade:', error);
      throw error;
    }
  };

  // 시트 구매 후 자동 재초대/역할변경 핸들러 (Toss 결제창 리다이렉트)
  const handlePurchaseSeatsAndRetry = async (additionalSeats: number) => {
    if (!boardId || !seatPurchaseModal) return;

    // 리다이렉트 전 pending action 저장
    const { pendingEmail, pendingRole, pendingMemberId } = seatPurchaseModal;
    const pendingAction = JSON.stringify({
      type: pendingMemberId ? 'roleChange' : 'invite',
      pendingEmail,
      pendingRole,
      pendingMemberId,
    });
    localStorage.setItem('pending_payment_action', pendingAction);
    setSeatPurchaseModal(null);

    const currentBillingCycle = subscription?.billing_cycle || 'MONTHLY';
    const pricePerSeat = subscription?.price_per_seat ||
      (currentBillingCycle === 'YEARLY' ? 5000 : 500);

    try {
      await subscriptionService.purchaseSeats(boardId, additionalSeats, currentBillingCycle, pricePerSeat);
    } catch (error: any) {
      if (error?.code === 'PAY_PROCESS_CANCELED' || error?.code === 'USER_CANCEL') {
        localStorage.removeItem('pending_payment_action');
        return;
      }
      localStorage.removeItem('pending_payment_action');
      throw error;
    }
  };

  // Feature와 Task를 milestoneId로 필터링해서 다시 로드
  const reloadFeaturesAndTasks = async (milestoneId?: string) => {
    if (!boardId) return;
    try {
      const [featuresData, tasksData] = await Promise.all([
        featureService.getFeatures(boardId, milestoneId),
        taskService.getTasks(boardId, milestoneId ? { milestone_id: milestoneId } : undefined),
      ]);
      setFeatures(featuresData);
      setTasks(tasksData);

      // 체크리스트 배치 로드
      const taskIdsWithChecklist = tasksData
        .filter((t: Task) => (t.checklist_total ?? 0) > 0)
        .map((t: Task) => t.id);

      if (taskIdsWithChecklist.length > 0) {
        try {
          const batchChecklistData = await checklistService.getBatchChecklists(boardId, taskIdsWithChecklist);
          const checklistMap: { [taskId: string]: ChecklistItem[] } = {};
          // 백엔드 응답 형식: { checklists: [{ task_id, total, completed, items }] }
          const checklists = (batchChecklistData as any).checklists || [];
          checklists.forEach((group: any) => {
            const taskId = group.task_id || group.taskId;
            if (group && taskId && Array.isArray(group.items)) {
              checklistMap[taskId] = group.items.map((item: any) => ({
                id: item.id,
                title: item.title,
                completed: item.completed,
                position: item.position,
                due_date: item.due_date,
                assignee: item.assignee ? { id: item.assignee.id, name: item.assignee.name } : null,
              }));
            }
          });
          setChecklistDataMap(checklistMap);
        } catch (error) {
          console.warn('Failed to load batch checklists:', error);
        }
      } else {
        setChecklistDataMap({});
      }

      // 스케줄 블록이 있는 Task ID 리로드
      try {
        const scheduledData = await scheduleAPI.getScheduledTaskIds(boardId);
        setScheduledTaskIds(new Set(scheduledData.task_ids));
      } catch (error) {
        console.warn('Failed to load scheduled task ids:', error);
      }
    } catch (error) {
      console.error('Failed to reload features and tasks:', error);
    }
  };

  // 칸반 뷰 마일스톤 선택 핸들러
  const handleKanbanMilestoneSelect = async (milestoneId: string) => {
    setKanbanSelectedMilestoneId(milestoneId);
    if (boardId) {
      try {
        const newMilestoneId = milestoneId === 'all' ? null : milestoneId;
        await boardService.updateSelectedMilestone(boardId, newMilestoneId);
        setBoard((prev) => prev ? { ...prev, selected_milestone_id: newMilestoneId } : prev);
        // 마일스톤에 맞게 Feature와 Task 다시 로드
        await reloadFeaturesAndTasks(newMilestoneId || undefined);
      } catch (error) {
        console.error('Failed to save selected milestone:', error);
      }
    }
  };

  // 보드 멤버 관리 함수
  const handleAddMember = async (email: string, role: MemberRole) => {
    if (!boardId) return;

    if (!email.includes('@')) {
      alert(t('kanban.invalidEmail'));
      return;
    }

    if (boardMembersData.some((m) => m.email === email)) {
      alert(t('kanban.memberAlreadyAdded'));
      return;
    }

    const backendRole = role.toUpperCase();

    try {
      const result = await memberService.inviteMember(boardId, email, backendRole as any);

      if (result.type === 'DIRECT_ADD' && result.member) {
        // 기존 사용자 - 바로 멤버로 추가됨
        setBoardMembersData([...boardMembersData, {
          id: result.member.id,
          userId: result.member.user.id,
          name: result.member.user.name,
          email: result.member.user.email,
          role: result.member.role.toLowerCase() as MemberRole,
        }]);
        alert(t('kanban.memberAdded', { name: result.member.user.name }));
      } else if (result.type === 'EMAIL_SENT') {
        // 미가입 사용자 - 이메일 초대 발송됨
        alert(t('kanban.inviteEmailSent', { email: result.email }));
      }
    } catch (error: any) {
      console.error('Failed to invite member:', error);
      if (error?.code === 'S005' && error?.errors) {
        setSeatPurchaseModal({
          open: true,
          seatCount: parseInt(error.errors.seat_count),
          billableMemberCount: parseInt(error.errors.billable_member_count),
          pendingEmail: email,
          pendingRole: role,
        });
        return;
      }
      alert(error?.message || t('kanban.inviteFailed'));
    }
  };

  const handleUpdateMemberRole = async (memberId: string, role: MemberRole) => {
    if (!boardId) return;

    const prevMembers = [...boardMembersData];
    setBoardMembersData(
      boardMembersData.map((m) => (m.id === memberId ? { ...m, role } : m))
    );

    const backendRole = role.toUpperCase();

    try {
      await memberService.updateMemberRole(boardId, memberId, backendRole as any);
    } catch (error: any) {
      console.error('Failed to update member role:', error);
      setBoardMembersData(prevMembers);
      if (error?.code === 'S005' && error?.errors) {
        setSeatPurchaseModal({
          open: true,
          seatCount: parseInt(error.errors.seat_count),
          billableMemberCount: parseInt(error.errors.billable_member_count),
          pendingEmail: '',
          pendingRole: role,
          pendingMemberId: memberId,
        });
        return;
      }
      alert(error?.message || t('kanban.roleChangeFailed'));
    }
  };

  const handleUpdateMemberColor = async (memberId: string, color: string | null) => {
    if (!boardId) return;
    const prevMembers = [...boardMembersData];
    setBoardMembersData(
      boardMembersData.map((m) => (m.id === memberId ? { ...m, assigneeColor: color } : m))
    );
    try {
      await memberService.updateMemberColor(boardId, memberId, color);
    } catch (error: any) {
      console.error('Failed to update member color:', error);
      setBoardMembersData(prevMembers);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!boardId) return;

    if (memberId === currentUserId) {
      alert(t('kanban.cannotRemoveSelf'));
      return;
    }

    const prevMembers = [...boardMembersData];
    setBoardMembersData(boardMembersData.filter((m) => m.id !== memberId));

    try {
      await memberService.removeMember(boardId, memberId);
    } catch (error: any) {
      console.error('Failed to remove member:', error);
      setBoardMembersData(prevMembers);
      alert(error?.message || t('kanban.removeMemberFailed'));
    }
  };

  const handleReorderMembers = async (memberIds: string[]) => {
    if (!boardId) return;

    const prevMembers = [...boardMembersData];
    // Optimistic: reorder locally
    const memberMap = new Map(boardMembersData.map((m) => [m.id, m]));
    setBoardMembersData(memberIds.map((id) => memberMap.get(id)!).filter(Boolean));

    try {
      await memberService.reorderMembers(boardId, memberIds);
    } catch (error: any) {
      console.error('Failed to reorder members:', error);
      setBoardMembersData(prevMembers);
    }
  };

  // 초대 링크 핸들러
  const handleCreateInviteLink = async (role: string, maxUses: number, expiresIn: string) => {
    if (!boardId) return {} as InviteLink;

    let expiresInHours: number | null = null;
    if (expiresIn) {
      const match = expiresIn.match(/^(\d+)([dhm])$/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        if (unit === 'd') expiresInHours = value * 24;
        else if (unit === 'h') expiresInHours = value;
        else if (unit === 'm') expiresInHours = Math.ceil(value / 60);
      }
    }

    const link = await inviteLinkService.createInviteLink(boardId, {
      role: role as 'ADMIN' | 'MEMBER' | 'VIEWER',
      max_uses: maxUses || null,
      expires_in_hours: expiresInHours,
    });
    setInviteLinks([...inviteLinks, link]);
    return link;
  };

  const handleDeleteInviteLink = async (linkId: string) => {
    if (!boardId) return;
    await inviteLinkService.deleteInviteLink(boardId, linkId);
    setInviteLinks(inviteLinks.filter(l => l.id !== linkId));
  };

  // 구독 핸들러
  const handleChangeBillingCycle = async (billingCycle: 'MONTHLY' | 'YEARLY') => {
    if (!boardId) return;
    const newSubscription = await subscriptionService.changePlan(boardId, billingCycle);
    setSubscription(newSubscription);
  };

  const handleSubscriptionPurchaseSeats = async (additionalSeats: number) => {
    if (!boardId) return;
    const currentBillingCycle = subscription?.billing_cycle || 'MONTHLY';
    const pricePerSeat = subscription?.price_per_seat ||
      (currentBillingCycle === 'YEARLY' ? 5000 : 500);
    try {
      await subscriptionService.purchaseSeats(boardId, additionalSeats, currentBillingCycle, pricePerSeat);
    } catch (error: any) {
      if (error?.code === 'PAY_PROCESS_CANCELED' || error?.code === 'USER_CANCEL') {
        return;
      }
      throw error;
    }
  };

  const handleCancelSubscription = async () => {
    if (!boardId) return;
    await subscriptionService.cancelSubscription(boardId);
    const subscriptionData = await subscriptionService.getSubscription(boardId);
    setSubscription(subscriptionData);
  };

  // 활동 로그 핸들러
  const handleLoadMoreActivity = async () => {
    if (!hasMoreActivity || !activityCursor || !boardId) return;
    const response = await activityService.getActivities(boardId, { cursor: activityCursor, limit: 20 });
    setActivities([...activities, ...response.activities]);
    setActivityCursor(response.next_cursor || undefined);
    setHasMoreActivity(response.has_more);
  };

  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => a.position - b.position);
  }, [blocks]);

  // 블록 관리
  const handleAddBlock = async (name: string, color: string) => {
    if (!boardId) return;

    try {
      const newBlock = await blockService.createBlock(boardId, { name, color });
      const blocksData = await blockService.getBlocks(boardId);
      setBlocks(blocksData);
    } catch (error) {
      console.error('Failed to create block:', error);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    const blockToDelete = blocks.find((b) => b.id === blockId);
    if (!blockToDelete || blockToDelete.type === 'FIXED') return;

    const previousBlocks = blocks;
    const previousTasks = tasks;

    const updatedTasks = tasks.map((task) =>
      task.block_id === blockId ? { ...task, block_id: 'task' } : task
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
        console.error('Failed to delete block:', error);
        setBlocks(previousBlocks);
        setTasks(previousTasks);
      }
    }
  };

  const handleMoveBlock = (blockId: string, direction: 'left' | 'right') => {
    const blockIndex = sortedBlocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) return;

    const block = sortedBlocks[blockIndex];
    if (block.type === 'FIXED') return;

    const swapIndex = direction === 'left' ? blockIndex - 1 : blockIndex + 1;
    if (swapIndex < 0 || swapIndex >= sortedBlocks.length) return;

    const swapBlock = sortedBlocks[swapIndex];
    if (swapBlock.type === 'FIXED') return;

    const updatedBlocks = blocks.map((b) => {
      if (b.id === block.id) return { ...b, position: swapBlock.position };
      if (b.id === swapBlock.id) return { ...b, position: block.position };
      return b;
    });

    setBlocks(updatedBlocks);
  };

  const handleMoveBlockDrag = (dragIndex: number, targetIndex: number) => {
    const dragBlock = sortedBlocks[dragIndex];
    if (!dragBlock || dragBlock.type === 'FIXED') return;

    // Task(FIXED) 블록 앞으로는 이동 불가
    const taskFixedIdx = sortedBlocks.findIndex((b) => b.fixed_type === 'TASK');
    const minInsert = taskFixedIdx >= 0 ? taskFixedIdx + 1 : 0;

    const otherBlocks = sortedBlocks.filter((_, index) => index !== dragIndex);
    let insertIndex = targetIndex;
    if (dragIndex < targetIndex) insertIndex = targetIndex - 1;
    if (insertIndex < minInsert) insertIndex = minInsert;
    if (insertIndex > otherBlocks.length) insertIndex = otherBlocks.length;

    const newBlockOrder = [
      ...otherBlocks.slice(0, insertIndex),
      dragBlock,
      ...otherBlocks.slice(insertIndex),
    ];

    const updatedBlocks = blocks.map((b) => {
      const newIndex = newBlockOrder.findIndex((nb) => nb.id === b.id);
      return { ...b, position: newIndex };
    });

    setBlocks(updatedBlocks);

    if (boardId) {
      const blockIds = newBlockOrder.map((b) => b.id);
      blockService.reorderBlocks(boardId, blockIds).catch((error) => {
        console.error('Failed to reorder blocks:', error);
      });
    }
  };

  // Feature 관리
  const handleAddFeature = async (data: {
    title: string;
    description?: string;
    dueDate?: string;
    milestoneId?: string;
  }) => {
    if (!boardId) return;

    try {
      const newFeature = await featureService.createFeature(boardId, {
        title: data.title,
        description: data.description,
        color: getRandomFeatureColor(),
        due_date: data.dueDate,
      });

      // 마일스톤에 Feature 연결
      if (data.milestoneId) {
        try {
          const updatedMilestone = await milestoneService.addFeatures(boardId, data.milestoneId, [newFeature.id]);
          setMilestones((prev) => prev.map((m) => m.id === updatedMilestone.id ? updatedMilestone : m));
        } catch (error) {
          console.error('Failed to link feature to milestone:', error);
        }
      }

      setFeatures([...features, newFeature]);
      setAllFeatures([...allFeatures, newFeature]); // 전체 Feature 목록에도 추가
      // Feature 생성 후 바로 상세 모달 열기
      setSelectedFeature(newFeature);
      setIsFeatureModalOpen(true);
    } catch (error) {
      console.error('Failed to create feature:', error);
    }
  };

  const handleFeatureClick = (feature: Feature) => {
    setSelectedFeature(feature);
    setIsFeatureModalOpen(true);
  };

  // Feature 칩 토글
  const handleToggleFeatureChip = (featureId: string) => {
    setSelectedFeatureIds((prev) => {
      // 전체 모드(null)에서 클릭 → 해당 Feature만 제외
      if (prev === null) {
        return features.map((f) => f.id).filter((id) => id !== featureId);
      }
      if (prev.includes(featureId)) {
        const next = prev.filter((id) => id !== featureId);
        return next;
      }
      const next = [...prev, featureId];
      // 모두 선택되면 전체 모드로 전환
      return next.length === features.length ? null : next;
    });
  };

  const handleUpdateFeature = async (updates: Partial<Feature>) => {
    if (!boardId || !updates.id) return;

    const featureId = updates.id;

    try {
      const updatedFeature = await featureService.updateFeature(boardId, featureId, {
        title: updates.title,
        description: updates.description,
        color: updates.color,
        assignee_id: updates.assignee?.id,
        due_date: updates.due_date,
      });
      setFeatures(features.map((f) => (f.id === featureId ? updatedFeature : f)));
      setAllFeatures(allFeatures.map((f) => (f.id === featureId ? updatedFeature : f))); // 전체 Feature 목록도 업데이트
    } catch (error) {
      console.error('Failed to update feature:', error);
      setFeatures(features.map((f) => (f.id === featureId ? { ...f, ...updates } : f)));
      setAllFeatures(allFeatures.map((f) => (f.id === featureId ? { ...f, ...updates } : f)));
    }
  };

  const handleDeleteFeature = async (featureId: string) => {
    if (!boardId) return;

    // Optimistic UI update
    setFeatures(features.filter((f) => f.id !== featureId));
    setAllFeatures(allFeatures.filter((f) => f.id !== featureId));
    setTasks(tasks.filter((t) => t.feature_id !== featureId));
    setIsFeatureModalOpen(false);
    setSelectedFeature(null);

    try {
      await featureService.deleteFeature(boardId, featureId);
    } catch (error) {
      console.error('Failed to delete feature:', error);
    }
  };

  // Task 관리
  const handleAddSubtask = async (featureId: string, taskTitle: string) => {
    if (!boardId) return;

    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;

    try {
      const newTask = await taskService.createTask(boardId, featureId, { title: taskTitle });
      setTasks([...tasks, newTask]);
      setFeatures(
        features.map((f) =>
          f.id === featureId ? { ...f, total_tasks: f.total_tasks + 1 } : f
        )
      );
    } catch (error: any) {
      console.error('Failed to create task:', error);
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleNotificationClick = (notification: NotificationItem) => {
    if (notification.task_id) {
      const task = tasks.find(t => t.id === notification.task_id);
      if (task) {
        handleTaskClick(task);
      }
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    if (!boardId) return;

    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));

    const isOnlyChecklistUpdate = Object.keys(updates).every(key =>
      key === 'checklist_total' || key === 'checklist_completed' || key === 'checklist_version'
    );

    if (isOnlyChecklistUpdate) {
      // 체크리스트 변경 시 스케줄 뷰 새로고침 트리거
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
        prevTasks.map((t) => (t.id === taskId ? {
          ...updatedTask,
          checklist_total: t.checklist_total,
          checklist_completed: t.checklist_completed,
        } : t))
      );
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !boardId) return;

    const feature = features.find((f) => f.id === task.feature_id);
    if (feature) {
      const newTotalTasks = feature.total_tasks - 1;
      const newCompletedTasks = task.completed ? feature.completed_tasks - 1 : feature.completed_tasks;
      setFeatures(
        features.map((f) =>
          f.id === feature.id
            ? {
                ...f,
                total_tasks: newTotalTasks,
                completed_tasks: newCompletedTasks,
                progress_percentage: newTotalTasks > 0 ? Math.round((newCompletedTasks / newTotalTasks) * 100) : 0,
              }
            : f
        )
      );
    }

    setTasks(tasks.filter((t) => t.id !== taskId));
    setIsTaskModalOpen(false);
    setSelectedTask(null);

    try {
      await taskService.deleteTask(boardId, taskId);
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  // Milestone 핸들러
  const handleOpenMilestoneModal = (milestone?: Milestone) => {
    setSelectedMilestone(milestone || null);
    setIsMilestoneModalOpen(true);
  };

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
        // 수정
        const updated = await milestoneService.updateMilestone(boardId, selectedMilestone.id, {
          title: data.title,
          description: data.description,
          start_date: data.start_date,
          end_date: data.end_date,
        });

        // Feature 연결 변경 처리
        const currentFeatureIds = new Set(selectedMilestone.features?.map((f) => f.id) || []);
        const newFeatureIds = new Set(data.feature_ids || []);

        // 제거할 Feature들
        const featuresToRemove = [...currentFeatureIds].filter((id) => !newFeatureIds.has(id));
        // 추가할 Feature들
        const featuresToAdd = [...newFeatureIds].filter((id) => !currentFeatureIds.has(id));

        // Feature 제거
        for (const featureId of featuresToRemove) {
          await milestoneService.removeFeature(boardId, selectedMilestone.id, featureId);
        }

        // Feature 추가
        if (featuresToAdd.length > 0) {
          await milestoneService.addFeatures(boardId, selectedMilestone.id, featuresToAdd);
        }

        // 최신 마일스톤 데이터 다시 조회
        const refreshedMilestone = await milestoneService.getMilestone(boardId, selectedMilestone.id);
        setMilestones((prev) => prev.map((m) => (m.id === refreshedMilestone.id ? refreshedMilestone : m)));

        // 현재 선택된 마일스톤이 수정한 마일스톤인 경우 features/tasks 다시 로드
        if (kanbanSelectedMilestoneId === selectedMilestone.id) {
          await reloadFeaturesAndTasks(selectedMilestone.id);
        }
      } else {
        // 생성
        const created = await milestoneService.createMilestone(boardId, data);
        setMilestones((prev) => [...prev, created]);

        // 생성된 마일스톤으로 보드 선택 업데이트
        await boardService.updateSelectedMilestone(boardId, created.id);
        setBoard((prev) => prev ? { ...prev, selected_milestone_id: created.id } : prev);
        setKanbanSelectedMilestoneId(created.id);

        // 새 마일스톤으로 데이터 로드
        await reloadFeaturesAndTasks(created.id);
      }
    } catch (error) {
      console.error('Failed to save milestone:', error);
      throw error;
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    if (!boardId) return;

    try {
      await milestoneService.deleteMilestone(boardId, milestoneId);
      setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));

      // 삭제한 마일스톤이 현재 선택된 마일스톤인 경우 'all'로 변경
      if (kanbanSelectedMilestoneId === milestoneId) {
        setKanbanSelectedMilestoneId('all');
        await boardService.updateSelectedMilestone(boardId, null);
        setBoard((prev) => prev ? { ...prev, selected_milestone_id: null } : prev);
        await reloadFeaturesAndTasks(undefined);
      }
    } catch (error) {
      console.error('Failed to delete milestone:', error);
      throw error;
    }
  };

  const handleMoveTask = async (taskId: string, targetBlockId: string, newPosition: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !boardId) return;

    const doneBlock = blocks.find((b) => b.fixed_type === 'DONE');
    const targetBlock = blocks.find((b) => b.id === targetBlockId);
    const wasInDone = doneBlock?.id === task.block_id;
    const isMovingToDone = doneBlock?.id === targetBlockId;
    const isNowCompleted = isMovingToDone;

    setTasks((prevTasks) =>
      prevTasks.map((t) =>
        t.id === taskId
          ? { ...t, block_id: targetBlockId, block_name: targetBlock?.name, completed: isNowCompleted, position: newPosition }
          : t
      )
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
                  progress_percentage: f.total_tasks > 0 ? Math.round((newCompletedTasks / f.total_tasks) * 100) : 0,
                }
              : f
          )
        );
      }
    }

    try {
      // API 응답으로 해당 Task만 업데이트 (전체 재조회 제거)
      const movedTask = await taskService.moveTask(boardId, taskId, targetBlockId, newPosition);
      // 응답 데이터로 로컬 상태 업데이트 (이미 낙관적 업데이트로 처리됨, 서버 응답과 동기화)
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId
            ? { ...t, ...movedTask }
            : t
        )
      );
    } catch (error) {
      console.error('Failed to move task:', error);
      // 실패 시 원래 상태로 롤백
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId
            ? { ...t, block_id: task.block_id, completed: task.completed, position: task.position }
            : t
        )
      );
    }
  };

  const handleMoveTaskToFeature = async (taskId: string, targetFeatureId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !boardId) return;

    const oldFeature = features.find((f) => f.id === task.feature_id);
    const newFeature = features.find((f) => f.id === targetFeatureId);
    if (!oldFeature || !newFeature) return;

    // 낙관적 업데이트: Task의 feature 정보 변경
    setTasks((prevTasks) =>
      prevTasks.map((t) =>
        t.id === taskId
          ? { ...t, feature_id: targetFeatureId, feature_title: newFeature.title, feature_color: newFeature.color }
          : t
      )
    );

    // 낙관적 업데이트: 양쪽 Feature의 카운트 변경
    const oldNewTotal = oldFeature.total_tasks - 1;
    const oldNewCompleted = task.completed ? oldFeature.completed_tasks - 1 : oldFeature.completed_tasks;
    const newNewTotal = newFeature.total_tasks + 1;
    const newNewCompleted = task.completed ? newFeature.completed_tasks + 1 : newFeature.completed_tasks;

    setFeatures((prevFeatures) =>
      prevFeatures.map((f) => {
        if (f.id === oldFeature.id) {
          return {
            ...f,
            total_tasks: oldNewTotal,
            completed_tasks: oldNewCompleted,
            progress_percentage: oldNewTotal > 0 ? Math.round((oldNewCompleted / oldNewTotal) * 100) : 0,
          };
        }
        if (f.id === newFeature.id) {
          return {
            ...f,
            total_tasks: newNewTotal,
            completed_tasks: newNewCompleted,
            progress_percentage: newNewTotal > 0 ? Math.round((newNewCompleted / newNewTotal) * 100) : 0,
          };
        }
        return f;
      })
    );

    // selectedTask도 업데이트 (모달이 닫히기 전 UI 반영)
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) =>
        prev ? { ...prev, feature_id: targetFeatureId, feature_title: newFeature.title, feature_color: newFeature.color } : prev
      );
    }

    try {
      await taskService.moveTaskToFeature(boardId, taskId, targetFeatureId);
      setManagementRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to move task to feature:', error);
      // 실패 시 롤백
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId
            ? { ...t, feature_id: task.feature_id, feature_title: task.feature_title, feature_color: task.feature_color }
            : t
        )
      );
      setFeatures((prevFeatures) =>
        prevFeatures.map((f) => {
          if (f.id === oldFeature.id) return oldFeature;
          if (f.id === newFeature.id) return newFeature;
          return f;
        })
      );
    }
  };

  const handleMoveChecklistToTask = async (checklistItemId: string, sourceTaskId: string, targetTaskId: string) => {
    if (!boardId) return;

    try {
      await checklistAPI.moveToTask(boardId, sourceTaskId, checklistItemId, {
        target_task_id: targetTaskId,
      });

      // 대상 Task의 체크리스트 카운트도 증가 (source는 TaskDetailModal에서 처리)
      const movedItem = tasks.find((t) => t.id === sourceTaskId);
      if (movedItem) {
        setTasks((prevTasks) =>
          prevTasks.map((t) => {
            if (t.id === targetTaskId) {
              const newTotal = (t.checklist_total || 0) + 1;
              const wasCompleted = false; // 이동된 항목의 완료 상태는 모를 수 있으므로 refresh로 처리
              return {
                ...t,
                checklist_total: newTotal,
                checklist_version: (t.checklist_version || 0) + 1,
              };
            }
            return t;
          })
        );
      }

      setManagementRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to move checklist item:', error);
    }
  };

  const handleReorderTask = async (taskId: string, blockId: string, newPosition: number) => {
    if (!boardId) return;

    const task = tasks.find((t) => t.id === taskId);
    const originalPosition = task?.position ?? newPosition;

    setTasks((prevTasks) =>
      prevTasks.map((t) => (t.id === taskId ? { ...t, position: newPosition } : t))
    );

    try {
      // API 응답으로 해당 Task만 업데이트 (전체 재조회 제거)
      const movedTask = await taskService.moveTask(boardId, taskId, blockId, newPosition);
      setTasks((prevTasks) =>
        prevTasks.map((t) =>
          t.id === taskId
            ? { ...t, ...movedTask }
            : t
        )
      );
    } catch (error) {
      console.error('Failed to reorder task:', error);
      // 실패 시 원래 상태로 롤백
      setTasks((prevTasks) =>
        prevTasks.map((t) => (t.id === taskId ? { ...t, position: originalPosition } : t))
      );
    }
  };

  const handleToggleChecklistExpand = (taskId: string) => {
    setExpandedChecklistTaskIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) newSet.delete(taskId);
      else newSet.add(taskId);
      return newSet;
    });
  };

  // Feature 칩 선택에 따른 태스크 필터링 여부
  const showFeatureLabel = selectedFeatureIds === null || selectedFeatureIds.length !== 1;

  const getTasksForBlock = (blockId: string) => {
    let blockTasks = filteredTasks.filter((task) => task.block_id === blockId);
    // Feature 칩 필터 적용 (null = 전체, 필터 안 함)
    if (selectedFeatureIds !== null) {
      blockTasks = blockTasks.filter((task) => selectedFeatureIds.includes(task.feature_id));
    }
    // Task 블록에서는 타임블록이 있는 카드를 위쪽으로 정렬
    const block = sortedBlocks.find((b) => b.id === blockId);
    if (block?.fixed_type === 'TASK' && scheduledTaskIds.size > 0) {
      return blockTasks.sort((a, b) => {
        const aScheduled = scheduledTaskIds.has(a.id) ? 0 : 1;
        const bScheduled = scheduledTaskIds.has(b.id) ? 0 : 1;
        if (aScheduled !== bScheduled) return aScheduled - bScheduled;
        return a.position - b.position;
      });
    }
    return blockTasks.sort((a, b) => a.position - b.position);
  };

  const handleCreateTag = async (name: string, color: string) => {
    if (!boardId) return;

    const tempId = `tag_temp_${Date.now()}`;
    const newTag: Tag = { id: tempId, name, color };
    setTags([...tags, newTag]);

    try {
      const createdTag = await tagService.createTag(boardId, { name, color });
      setTags((prevTags) => prevTags.map((t) => (t.id === tempId ? createdTag : t)));
      return createdTag.id;
    } catch (error) {
      console.error('Failed to create tag:', error);
      setTags((prevTags) => prevTags.filter((t) => t.id !== tempId));
    }
  };

  const handleUpdateTag = async (tagId: string, data: { name?: string; color?: string }) => {
    if (!boardId) return;
    const prevTags = [...tags];
    setTags(tags.map((t) => (t.id === tagId ? { ...t, ...data } : t)));
    try {
      await tagService.updateTag(boardId, tagId, data);
    } catch (error) {
      console.error('Failed to update tag:', error);
      setTags(prevTags);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!boardId) return;
    const prevTags = [...tags];
    setTags(tags.filter((t) => t.id !== tagId));
    setTasks((prev) => prev.map((t) => ({ ...t, tags: (t.tags || []).filter((id) => id !== tagId) })));
    setFeatures((prev) => prev.map((f) => ({
      ...f,
      tags: (f.tags || []).filter((tag) => (typeof tag === 'string' ? tag !== tagId : (tag as Tag).id !== tagId)),
    })));
    try {
      await tagService.deleteTag(boardId, tagId);
    } catch (error) {
      console.error('Failed to delete tag:', error);
      setTags(prevTags);
    }
  };

  // 필터링 (마일스톤 필터는 API에서 처리되므로 여기서는 키워드, 멤버, 태그 필터만 적용)
  const filteredFeatures = useMemo(() => {
    return features.filter((feature) => {
      if (filterOptions.keyword && !feature.title.toLowerCase().includes(filterOptions.keyword.toLowerCase())) {
        return false;
      }
      if (filterOptions.members.length > 0) {
        const hasNoAssigneeFilter = filterOptions.members.includes('__no_members__');
        const memberNames = filterOptions.members.filter(m => m !== '__no_members__');
        const featureAssigneeName = feature.assignee?.name;
        const matchesNoAssignee = hasNoAssigneeFilter && !featureAssigneeName;
        const matchesMember = memberNames.length > 0 && memberNames.some(m => featureAssigneeName === m);
        if (!matchesNoAssignee && !matchesMember) {
          return false;
        }
      }
      if (filterOptions.tags.length > 0 && !filterOptions.tags.some((tagId) => feature.tags?.some((t) => t.id === tagId))) {
        return false;
      }
      return true;
    });
  }, [features, filterOptions]);

  // Feature가 속한 마일스톤 찾기
  const getFeatureMilestone = (featureId: string): Milestone | undefined => {
    return milestones.find((m) => m.features?.some((f) => f.id === featureId));
  };

  // 마일스톤 필터는 API에서 처리되므로 여기서는 키워드, 멤버, 피쳐, 태그, 상태 필터만 적용
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterOptions.keyword && !task.title.toLowerCase().includes(filterOptions.keyword.toLowerCase())) {
        return false;
      }
      if (filterOptions.members.length > 0) {
        const hasNoAssigneeFilter = filterOptions.members.includes('__no_members__');
        const memberNames = filterOptions.members.filter(m => m !== '__no_members__');
        // task.assignees (API) + checklistDataMap 보충
        const taskAssigneeNames = new Set<string>();
        if (task.assignees) {
          task.assignees.forEach(a => taskAssigneeNames.add(a.name));
        }
        const taskChecklists = checklistDataMap[task.id] || [];
        taskChecklists.filter(ci => ci.assignee?.name).forEach(ci => taskAssigneeNames.add(ci.assignee!.name));
        const hasNoAssignee = taskAssigneeNames.size === 0;
        const matchesNoAssignee = hasNoAssigneeFilter && hasNoAssignee;
        const matchesMember = memberNames.length > 0 && memberNames.some(m => taskAssigneeNames.has(m));
        if (!matchesNoAssignee && !matchesMember) {
          return false;
        }
      }
      if (filterOptions.features.length > 0 && !filterOptions.features.includes(task.feature_id)) {
        return false;
      }
      if (filterOptions.tags.length > 0 && !filterOptions.tags.some((tagId) => task.tags?.some((t) => t.id === tagId))) {
        return false;
      }
      if (filterOptions.cardStatus.length > 0) {
        const hasStatus =
          (filterOptions.cardStatus.includes('completed') && task.completed) ||
          (filterOptions.cardStatus.includes('incomplete') && !task.completed);
        if (!hasStatus) return false;
      }
      return true;
    });
  }, [tasks, filterOptions, checklistDataMap]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-foreground text-lg font-light">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <DragProvider>
      <AnnouncementDisplay />
      <div className="min-h-screen bg-bridge-dark flex flex-col">
        <TrialBanner
          status={subscription?.status || 'ACTIVE'}
          tier={tierInfo?.tier}
          trialEndsAt={tierInfo?.trial_ends_at || subscription?.trial_ends_at}
          onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
          onOpenPremiumBenefits={() => setIsPremiumBenefitsModalOpen(true)}
          hideBilling={hideBillingForUser}
        />

        <header className="min-h-[3.5rem] md:h-16 border-b border-kanban-border flex items-center justify-between px-3 md:px-6 bg-kanban-bg shrink-0 z-30 gap-2">
          {/* 좌측 영역 */}
          <div className="flex items-center gap-2 md:gap-6 min-w-0">
            {!hideBilling && (
              <button
                onClick={() => navigate('/boards')}
                className="p-2 hover:bg-kanban-surface rounded-lg transition-colors text-zinc-400 hover:text-foreground"
              >
                <ArrowLeft size={18} />
              </button>
            )}

            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              {isEditingBoardName ? (
                <input
                  ref={boardNameInputRef}
                  value={editingBoardName}
                  onChange={(e) => setEditingBoardName(e.target.value)}
                  onBlur={handleSaveBoardName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveBoardName();
                    if (e.key === 'Escape') setIsEditingBoardName(false);
                  }}
                  className="text-sm md:text-lg font-bold tracking-tight text-foreground bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent max-w-[160px] sm:max-w-[200px] md:max-w-[300px]"
                  autoFocus
                />
              ) : (
                <h1
                  className={`text-sm md:text-lg font-bold tracking-tight text-foreground truncate max-w-[100px] sm:max-w-[160px] md:max-w-none ${canEdit ? 'cursor-pointer hover:text-bridge-accent transition-colors' : ''}`}
                  onClick={canEdit ? handleStartEditBoardName : undefined}
                  title={canEdit ? t('common.edit') : undefined}
                >
                  {board?.name || t('kanban.defaultBoardName')}
                </h1>
              )}

              {/* 마일스톤 셀렉터 */}
              <div className="hidden sm:flex items-center gap-2 bg-kanban-card px-3 py-1.5 rounded-md border border-kanban-border hover:border-[#2DD4BF]/40 cursor-pointer transition-all">
                <Flag size={14} className="text-[#2DD4BF]" />
                {milestones.length > 0 ? (
                  <Select value={kanbanSelectedMilestoneId} onValueChange={handleKanbanMilestoneSelect}>
                    <SelectTrigger className="bg-transparent border-none text-xs font-medium text-foreground focus:ring-0 h-auto p-0 w-[120px] [&>svg]:text-zinc-400">
                      <SelectValue placeholder={t('kanban.selectMilestone')} />
                    </SelectTrigger>
                    <SelectContent className="bg-kanban-card border-kanban-border">
                      <SelectItem value="all" className="text-zinc-300 hover:bg-white/10 focus:bg-white/10 focus:text-foreground text-xs">
                        {t('common.all')}
                      </SelectItem>
                      {milestones.map((milestone) => {
                        const startDate = format(parseISO(milestone.start_date), 'M/d');
                        const endDate = format(parseISO(milestone.end_date), 'M/d');
                        return (
                          <SelectItem
                            key={milestone.id}
                            value={milestone.id}
                            className="text-zinc-300 hover:bg-white/10 focus:bg-white/10 focus:text-foreground text-xs"
                          >
                            <div className="flex flex-col">
                              <span>{milestone.title}</span>
                              <span className="text-zinc-500 text-[10px]">{startDate} ~ {endDate}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : allFeatures.length > 0 ? (
                  <button
                    onClick={() => setIsMilestoneOnboardingOpen(true)}
                    className="flex items-center gap-1.5 group"
                  >
                    <Lightbulb size={12} className="text-[#2DD4BF] animate-pulse" />
                    <span className="text-xs text-[#2DD4BF] group-hover:text-[#2DD4BF]/80 transition-colors">{t('kanban.startMilestone')}</span>
                  </button>
                ) : (
                  <span className="text-xs text-zinc-500">{t('kanban.noMilestone')}</span>
                )}
              </div>

              {kanbanSelectedMilestoneId !== 'all' && (
                <button
                  onClick={() => {
                    const milestone = milestones.find((m) => m.id === kanbanSelectedMilestoneId);
                    if (milestone) handleOpenMilestoneWithCheck(milestone);
                  }}
                  className="p-1.5 text-zinc-400 hover:text-foreground transition-colors"
                  title={t('kanban.editMilestone')}
                >
                  <Pencil size={14} />
                </button>
              )}

              <button
                onClick={() => handleOpenMilestoneWithCheck()}
                className={`p-1.5 transition-colors ${
                  !canAccessMilestone
                    ? 'text-zinc-600 hover:text-zinc-500'
                    : 'text-zinc-400 hover:text-foreground'
                }`}
              >
                <Plus size={18} />
                {!canAccessMilestone && <Lock className="h-2.5 w-2.5 absolute -top-0.5 -right-0.5" />}
              </button>
            </div>
          </div>

          {/* 중앙 탭 영역 (칸반보드, 일정, 회의 + 도메인별 노트/AI분석) - 모바일에서는 하단 탭바 사용 */}
          <div className="hidden md:flex justify-center min-w-0 md:flex-1">
          <nav className="flex items-center gap-1 bg-kanban-card p-1 rounded-xl border border-kanban-border overflow-x-auto shrink-0">
            {/* 1. 칸반보드 */}
            <button
              onClick={() => handleViewModeChange('kanban')}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                viewMode === 'kanban'
                  ? 'bg-gradient-to-r from-[#2DD4BF] to-[#6366F1] text-white shadow-lg shadow-[#2DD4BF]/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
              }`}
            >
              <LayoutGrid size={14} />
              <span className="hidden md:inline">{t('kanban.viewKanban')}</span>
            </button>

            {/* 2. 일정 (schedule + weekly 병합) */}
            <button
              onClick={() => {
                const subMode = getScheduleSubMode();
                if (subMode === 'weekly' && !canAccessSchedule) {
                  handleViewModeChange('schedule');
                } else {
                  handleViewModeChange(subMode);
                }
              }}
              className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                viewMode === 'schedule' || viewMode === 'weekly'
                  ? 'bg-gradient-to-r from-[#2DD4BF] to-[#6366F1] text-white shadow-lg shadow-[#2DD4BF]/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
              }`}
            >
              <Calendar size={14} />
              <span className="hidden md:inline">{t('kanban.viewScheduleTab', '일정')}</span>
            </button>

            {/* 3. 회의 */}
            {!isWhiteLabelDomain && (
              <button
                onClick={() => handleViewModeChange('meeting')}
                className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  viewMode === 'meeting'
                    ? 'bg-gradient-to-r from-[#2DD4BF] to-[#6366F1] text-white shadow-lg shadow-[#2DD4BF]/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
                }`}
              >
                <Users size={14} />
                <span className="hidden md:inline">{t('kanban.viewMeeting', '회의')}</span>
              </button>
            )}

            {/* 4. 노트 */}
            {!isWhiteLabelDomain && (
              <button
                onClick={() => handleViewModeChange('notes')}
                className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  viewMode === 'notes'
                    ? 'bg-gradient-to-r from-[#2DD4BF] to-[#6366F1] text-white shadow-lg shadow-[#2DD4BF]/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
                }`}
              >
                <FileText size={14} />
                <span className="hidden md:inline">{t('kanban.viewNotes', '노트')}</span>
              </button>
            )}

            {/* 5. AI분석 (statistics + ai_report 병합) */}
            {!isWhiteLabelDomain && (isAdminOrOwner || (!isViewer && !isTester)) && (
              <button
                onClick={() => {
                  if (!canAccessStatistics) {
                    openUpgradeModal('statistics');
                    return;
                  }
                  const subMode = getAISubMode();
                  if (subMode === 'statistics' && !isAdminOrOwner) {
                    handleViewModeChange('ai_report');
                  } else if (subMode === 'ai_report' && (isViewer || isTester)) {
                    handleViewModeChange('statistics');
                  } else {
                    handleViewModeChange(subMode);
                  }
                }}
                className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all relative whitespace-nowrap ${
                  viewMode === 'statistics' || viewMode === 'ai_report'
                    ? 'bg-gradient-to-r from-[#2DD4BF] to-[#6366F1] text-white shadow-lg shadow-[#2DD4BF]/20'
                    : !canAccessStatistics
                      ? 'text-zinc-600 cursor-not-allowed opacity-50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
                }`}
              >
                <BarChart3 size={14} />
                <span className="hidden md:inline">{t('kanban.viewAIAnalysisTab', 'AI분석')}</span>
                {!canAccessStatistics && <Lock size={10} className="ml-0.5 text-zinc-500" />}
              </button>
            )}
          </nav>
          </div>

          {/* 우측 액션 영역 */}
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <div className="flex items-center gap-0.5 md:gap-1 border-r border-kanban-border pr-2 md:pr-3 mr-0.5 md:mr-1">
              <NotificationDropdown
                boardId={boardId || ''}
                unreadCount={unreadNotificationCount}
                activities={activities}
                hasMoreActivities={hasMoreActivity}
                onLoadMoreActivities={handleLoadMoreActivity}
                onNotificationClick={handleNotificationClick}
                onUnreadCountChange={setUnreadNotificationCount}
                canAccessSlack={canAccessSlack}
                onSlackUpgrade={() => openUpgradeModal('slack')}
                isAdmin={isAdminOrOwner}
                isTester={isTester}
              />
              {!isTester && (
                <button
                  onClick={() => setIsInquiryModalOpen(true)}
                  className="relative flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-kanban-surface rounded-lg transition-all"
                  title={t('kanban.inquiry')}
                >
                  <MessageSquare size={18} />
                  {unreadInquiryCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {unreadInquiryCount > 99 ? '99+' : unreadInquiryCount}
                    </span>
                  )}
                </button>
              )}
                <button
                onClick={() => setIsShareBoardModalOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-kanban-surface rounded-lg transition-all"
              >
                <Users size={18} />
                <span className="hidden md:inline text-xs font-semibold">{t('kanban.team')}</span>
              </button>
            </div>

            {currentUser && (
              <UserMenu
                user={currentUser}
                assigneeColor={memberColorMap[currentUser.id]}
                onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
                onLogout={logout}
                hideBilling={hideBillingForUser}
              />
            )}
          </div>
        </header>

        {/* 병합 탭 서브토글 바 */}
        {(viewMode === 'schedule' || viewMode === 'weekly') && (
          <div className="flex items-center justify-center py-1.5 bg-kanban-header/50 border-b border-white/5">
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
              <button
                onClick={() => handleViewModeChange('schedule')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'schedule'
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('kanban.viewSchedule')}
              </button>
              <button
                onClick={() => handleViewModeChange('weekly')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'weekly'
                    ? 'bg-white/10 text-white'
                    : !canAccessSchedule
                      ? 'text-zinc-600 cursor-not-allowed'
                      : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('kanban.viewGantt')}
                {!canAccessSchedule && <Lock size={10} className="inline ml-1 text-zinc-500" />}
              </button>
            </div>
          </div>
        )}
        {(viewMode === 'statistics' || viewMode === 'ai_report') && isAdminOrOwner && !isViewer && !isTester && (
          <div className="flex items-center justify-center py-1.5 bg-kanban-header/50 border-b border-white/5">
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
              <button
                onClick={() => handleViewModeChange('statistics')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'statistics'
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('kanban.viewStatistics')}
              </button>
              <button
                onClick={() => handleViewModeChange('ai_report')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'ai_report'
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('kanban.viewAIReport')}
              </button>
            </div>
          </div>
        )}

        {/* 뷰 모드에 따른 컨텐츠 렌더링 */}
        {viewMode === 'weekly' ? (
          <main className="flex-1 overflow-hidden">
            <WeeklyScheduleView
              boardId={boardId || ''}
              features={features}
              tasks={tasks}
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
                  const updatedTask = await taskService.updateTaskDates(boardId || '', taskId, {
                    start_date: startDate,
                    end_date: endDate,
                  });
                  // 로컬 상태 업데이트
                  setTasks((prev) =>
                    prev.map((t) =>
                      t.id === taskId
                        ? { ...t, start_date: updatedTask.start_date, due_date: updatedTask.due_date }
                        : t
                    )
                  );
                } catch (error) {
                  console.error('Failed to update task dates:', error);
                }
              }}
              selectedMilestoneId={kanbanSelectedMilestoneId}
              onSaveBaseline={async () => {
                try {
                  await taskService.saveBaseline(boardId || '');
                  const updatedTasks = await taskService.getTasks(boardId || '');
                  setTasks(updatedTasks);
                } catch (error) {
                  console.error('Failed to save baseline:', error);
                }
              }}
            />
          </main>
        ) : viewMode === 'kanban' ? (
          <main className="flex-1 flex flex-col overflow-hidden bg-kanban-bg">
            {features.length === 0 ? (
              <EmptyBoardGuide onCreateFeature={() => setIsAddFeatureModalOpen(true)} />
            ) : (
            <>
            {/* 검색 + 필터 툴바 */}
            <div className="px-3 md:px-6 py-2 md:py-3 border-b border-kanban-border flex items-center gap-2 overflow-x-auto md:overflow-x-visible md:flex-wrap kanban-scrollbar">
              {/* 검색 */}
              <div className="relative w-52 sm:w-80 shrink-0">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder={t('kanban.searchPlaceholder')}
                  value={filterOptions.keyword}
                  onChange={(e) => setFilterOptions({ ...filterOptions, keyword: e.target.value })}
                  className="w-full bg-kanban-surface border border-kanban-border rounded-lg py-2 pl-10 pr-8 text-sm text-foreground placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#2DD4BF]/40 focus:border-[#2DD4BF]/40 transition-all"
                />
                {filterOptions.keyword && (
                  <button
                    onClick={() => setFilterOptions({ ...filterOptions, keyword: '' })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-foreground transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="h-6 w-px bg-kanban-border mx-1 shrink-0" />

              {/* 담당자 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all shrink-0 ${
                      filterOptions.members.length > 0
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                        : 'bg-kanban-surface border border-kanban-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
                    }`}
                  >
                    <User size={14} />
                    <span className="hidden sm:inline">{t('kanban.assignee')}</span>
                    {filterOptions.members.length > 0 && (
                      <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                        {filterOptions.members.length}
                      </span>
                    )}
                    <ChevronDown size={14} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-kanban-card border-kanban-border" align="start">
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        const exists = filterOptions.members.includes('__no_members__');
                        setFilterOptions({
                          ...filterOptions,
                          members: exists
                            ? filterOptions.members.filter(m => m !== '__no_members__')
                            : [...filterOptions.members, '__no_members__']
                        });
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                        filterOptions.members.includes('__no_members__')
                          ? 'bg-zinc-600 text-foreground'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <Circle size={14} className="text-zinc-400" />
                      {t('kanban.noAssignee')}
                    </button>
                    {boardMembersData.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => {
                          const exists = filterOptions.members.includes(member.name);
                          setFilterOptions({
                            ...filterOptions,
                            members: exists
                              ? filterOptions.members.filter(m => m !== member.name)
                              : [...filterOptions.members, member.name]
                          });
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                          filterOptions.members.includes(member.name)
                            ? 'bg-white/10 text-white'
                            : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold whitespace-nowrap overflow-hidden"
                          style={{ backgroundColor: getAssigneeHex(member.name, member.assigneeColor) }}
                        >
                          {getInitials(member.name)}
                        </div>
                        <span className="truncate">{member.name}</span>
                        {filterOptions.members.includes(member.name) && (
                          <CheckCircle2 size={14} className="ml-auto text-[#2DD4BF]" />
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Feature 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all shrink-0 ${
                      filterOptions.features.length > 0
                        ? 'bg-[#2DD4BF]/15 text-[#2DD4BF] border border-[#2DD4BF]/40'
                        : 'bg-kanban-surface border border-kanban-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
                    }`}
                  >
                    <Layers size={14} />
                    <span className="hidden sm:inline">Feature</span>
                    {filterOptions.features.length > 0 && (
                      <span className="bg-[#2DD4BF] text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                        {filterOptions.features.length}
                      </span>
                    )}
                    <ChevronDown size={14} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2 bg-kanban-card border-kanban-border max-h-80 overflow-y-auto" align="start">
                  <div className="space-y-1">
                    {features.map((feature) => (
                      <button
                        key={feature.id}
                        onClick={() => {
                          const exists = filterOptions.features.includes(feature.id);
                          setFilterOptions({
                            ...filterOptions,
                            features: exists
                              ? filterOptions.features.filter(f => f !== feature.id)
                              : [...filterOptions.features, feature.id]
                          });
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                          filterOptions.features.includes(feature.id)
                            ? 'bg-[#2DD4BF]/15 text-[#2DD4BF]'
                            : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: feature.color || '#8B5CF6' }}
                        />
                        <span className="truncate">{feature.title}</span>
                        {filterOptions.features.includes(feature.id) && (
                          <CheckCircle2 size={14} className="ml-auto text-[#2DD4BF] flex-shrink-0" />
                        )}
                      </button>
                    ))}
                    {features.length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-2">{t('kanban.noFeatures')}</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* 라벨 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all shrink-0 ${
                      filterOptions.tags.length > 0
                        ? 'bg-teal-500/20 text-teal-400 border border-teal-500/50'
                        : 'bg-kanban-surface border border-kanban-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
                    }`}
                  >
                    <TagIcon size={14} />
                    <span className="hidden sm:inline">{t('kanban.label')}</span>
                    {filterOptions.tags.length > 0 && (
                      <span className="bg-teal-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                        {filterOptions.tags.length}
                      </span>
                    )}
                    <ChevronDown size={14} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-kanban-card border-kanban-border max-h-80 overflow-y-auto" align="start">
                  <div className="space-y-1">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => {
                          const exists = filterOptions.tags.includes(tag.id);
                          setFilterOptions({
                            ...filterOptions,
                            tags: exists
                              ? filterOptions.tags.filter(t => t !== tag.id)
                              : [...filterOptions.tags, tag.id]
                          });
                        }}
                        className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                          filterOptions.tags.includes(tag.id)
                            ? 'ring-1 ring-white/50'
                            : 'hover:opacity-80'
                        }`}
                        style={{ backgroundColor: tag.color }}
                      >
                        <span className="text-white truncate">{tag.name}</span>
                        {filterOptions.tags.includes(tag.id) && (
                          <CheckCircle2 size={14} className="ml-auto text-white flex-shrink-0" />
                        )}
                      </button>
                    ))}
                    {tags.length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-2">{t('kanban.noLabels')}</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* 상태 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all shrink-0 ${
                      filterOptions.cardStatus.length > 0
                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                        : 'bg-kanban-surface border border-kanban-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
                    }`}
                  >
                    <CheckCircle2 size={14} />
                    <span className="hidden sm:inline">{t('kanban.status')}</span>
                    {filterOptions.cardStatus.length > 0 && (
                      <span className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
                        {filterOptions.cardStatus.length}
                      </span>
                    )}
                    <ChevronDown size={14} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-2 bg-kanban-card border-kanban-border" align="start">
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        const exists = filterOptions.cardStatus.includes('completed');
                        setFilterOptions({
                          ...filterOptions,
                          cardStatus: exists
                            ? filterOptions.cardStatus.filter(s => s !== 'completed')
                            : [...filterOptions.cardStatus, 'completed']
                        });
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                        filterOptions.cardStatus.includes('completed')
                          ? 'bg-green-500/20 text-green-300'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <CheckCircle2 size={14} className="text-green-400" />
                      {t('kanban.statusCompleted')}
                      {filterOptions.cardStatus.includes('completed') && (
                        <CheckCircle2 size={14} className="ml-auto text-green-400" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        const exists = filterOptions.cardStatus.includes('incomplete');
                        setFilterOptions({
                          ...filterOptions,
                          cardStatus: exists
                            ? filterOptions.cardStatus.filter(s => s !== 'incomplete')
                            : [...filterOptions.cardStatus, 'incomplete']
                        });
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-all ${
                        filterOptions.cardStatus.includes('incomplete')
                          ? 'bg-yellow-500/20 text-yellow-300'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <Circle size={14} className="text-yellow-400" />
                      {t('kanban.statusIncomplete')}
                      {filterOptions.cardStatus.includes('incomplete') && (
                        <CheckCircle2 size={14} className="ml-auto text-yellow-400" />
                      )}
                    </button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* 필터 초기화 */}
              {(filterOptions.keyword || filterOptions.members.length > 0 || filterOptions.features.length > 0 || filterOptions.tags.length > 0 || filterOptions.cardStatus.length > 0) && (
                <>
                  <div className="h-6 w-px bg-kanban-border mx-1 shrink-0" />
                  <button
                    onClick={() => setFilterOptions({ keyword: '', members: [], features: [], tags: [], cardStatus: [], dueDate: [] })}
                    className="flex items-center gap-1 px-3 py-2 text-xs text-zinc-500 hover:text-foreground transition-colors shrink-0 whitespace-nowrap"
                  >
                    <X size={12} />
                    {t('kanban.reset')}
                  </button>
                </>
              )}

              {/* 스페이서 */}
              <div className="hidden md:block flex-1" />

              {/* 모두 펼치기/닫기 */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    // 체크리스트 모두 펼치기
                    const allTaskIds = tasks.map(t => t.id);
                    setExpandedChecklistTaskIds(new Set(allTaskIds));
                    // Feature 서브태스크 모두 펼치기
                    const allFeatureIds = features.map(f => f.id);
                    setExpandedFeatureIds(new Set(allFeatureIds));
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-kanban-surface rounded-lg transition-colors"
                  title={t('kanban.expandAll')}
                >
                  <ChevronsUpDown size={14} />
                  <span className="hidden sm:inline">{t('kanban.expand')}</span>
                </button>
                <button
                  onClick={() => {
                    // 체크리스트 모두 닫기
                    setExpandedChecklistTaskIds(new Set());
                    // Feature 서브태스크 모두 닫기
                    setExpandedFeatureIds(new Set());
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-kanban-surface rounded-lg transition-colors"
                  title={t('kanban.collapseAll')}
                >
                  <ChevronsDownUp size={14} />
                  <span className="hidden sm:inline">{t('kanban.collapse')}</span>
                </button>
              </div>
            </div>
            {/* Feature 칩 선택 영역 */}
            <FeatureChipSelector
              features={filteredFeatures}
              selectedFeatureIds={selectedFeatureIds ?? []}
              isAllSelected={selectedFeatureIds === null}
              onToggleFeature={handleToggleFeatureChip}
              onSelectAll={() => setSelectedFeatureIds((prev) => prev === null ? [] : null)}
              onFeatureInfoClick={handleFeatureClick}
              onAddFeature={() => setIsAddFeatureModalOpen(true)}
            />

            {/* 칸반 보드 */}
            <div className="flex-1 p-3 md:p-6 overflow-x-auto kanban-scrollbar">
              <div className="flex gap-3 md:gap-4 min-w-max">
              {sortedBlocks.filter((b) => b.fixed_type !== 'FEATURE').map((block) => {
              const customBlocks = sortedBlocks.filter((b) => b.type === 'CUSTOM');
              const customBlockIndex = customBlocks.findIndex((b) => b.id === block.id);
              const sortedBlockIndex = sortedBlocks.findIndex((b) => b.id === block.id);

              return (
                <div key={block.id} className="flex items-start gap-4">
                    <KanbanBlock
                      block={block}
                      tasks={getTasksForBlock(block.id).map((task) => ({
                        ...task,
                        onClick: () => handleTaskClick(task),
                      }))}
                      features={features}
                      onMoveTask={handleMoveTask}
                      onReorderTask={handleReorderTask}
                      onEditBlock={block.type === 'CUSTOM' ? () => {} : undefined}
                      onDeleteBlock={block.type === 'CUSTOM' ? () => handleDeleteBlock(block.id) : undefined}
                      onMoveBlockLeft={
                        block.type === 'CUSTOM' && customBlockIndex > 0
                          ? () => handleMoveBlock(block.id, 'left')
                          : undefined
                      }
                      onMoveBlockRight={
                        block.type === 'CUSTOM' && customBlockIndex < customBlocks.length - 1
                          ? () => handleMoveBlock(block.id, 'right')
                          : undefined
                      }
                      canMoveLeft={block.type === 'CUSTOM' && customBlockIndex > 0}
                      canMoveRight={block.type === 'CUSTOM' && customBlockIndex < customBlocks.length - 1}
                      availableTags={tags}
                      boardId={boardId || ''}
                      expandedChecklistTaskIds={expandedChecklistTaskIds}
                      onToggleChecklistExpand={handleToggleChecklistExpand}
                      blockIndex={sortedBlockIndex}
                      onMoveBlockDrag={handleMoveBlockDrag}
                      checklistDataMap={checklistDataMap}
                      memberColorMap={memberColorMap}
                      showFeatureLabel={showFeatureLabel}
                      scheduledTaskIds={scheduledTaskIds}
                    />

                  {block.fixed_type === 'TASK' && (
                    <button
                      onClick={() => setIsAddBlockModalOpen(true)}
                      className="h-10 w-10 mt-4 flex items-center justify-center rounded-xl border border-dashed border-kanban-border text-zinc-500 hover:text-white hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  )}
                </div>
              );
            })}
              </div>
            </div>
            </>
            )}
          </main>
        ) : viewMode === 'schedule' ? (
          <main className="flex-1 overflow-hidden">
            <DailyScheduleView
              boardId={boardId || ''}
              boardMembers={boardMembersData}
              memberColorMap={memberColorMap}
              onViewFeature={(featureId) => {
                const feature = features.find((f) => f.id === featureId);
                if (feature) handleFeatureClick(feature);
              }}
              onViewTask={(taskId) => {
                const task = tasks.find((t) => t.id === taskId);
                if (task) handleTaskClick(task);
              }}
              refreshTrigger={scheduleRefreshKey}
              currentUserRole={currentUserRole}
              initialSubTab={urlTab as 'timeblock' | 'meeting' | undefined}
            />
          </main>
        ) : viewMode === 'meeting' ? (
          <main className="flex-1 overflow-hidden">
            <MeetingCalendarView
              boardId={boardId || ''}
              boardMembers={boardMembersData}
              onRefreshSchedule={() => setScheduleRefreshKey(k => k + 1)}
              aiCredits={aiCredits}
              refreshTrigger={meetingRefreshKey}
            />
          </main>
        ) : viewMode === 'notes' ? (
          <main className="flex-1 overflow-hidden">
            <NotesView
              boardId={boardId || ''}
              currentUserRole={currentUserRole}
              aiCredits={aiCredits}
            />
          </main>
        ) : viewMode === 'statistics' ? (
          <main className="flex-1 overflow-hidden">
            <StatisticsView
              boardId={boardId || ''}
              milestones={milestones}
              tags={tags}
              members={boardMembersData.map(m => ({
                id: m.id,
                user: {
                  id: m.userId,
                  name: m.name,
                  email: m.email,
                  profile_image: null,
                },
                role: m.role.toUpperCase() as any,
                joined_at: '',
              }))}
              onTaskClick={(taskId) => {
                const task = tasks.find(t => t.id === taskId);
                if (task) handleTaskClick(task);
              }}
              managementRefreshTrigger={managementRefreshKey}
            />
          </main>
        ) : viewMode === 'ai_report' ? (
          <main className="flex-1 overflow-hidden">
            <AIReportPanel
              boardId={boardId || ''}
              members={boardMembersData.map(m => ({
                id: m.id,
                user: {
                  id: m.userId,
                  name: m.name,
                  email: m.email,
                  profile_image: null,
                },
                role: m.role.toUpperCase() as any,
                joined_at: '',
              }))}
              aiCredits={aiCredits}
              hideBilling={hideBilling}
            />
          </main>
        ) : null}

        {/* 모바일 하단 여백 (탭바 공간 확보) */}
        <div className="h-14 shrink-0 md:hidden" />

        {/* 모바일 하단 탭바 */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-bridge-obsidian/95 backdrop-blur-xl border-t border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-around px-1 pt-2 pb-1.5">
            {/* 칸반보드 */}
            <button
              onClick={() => handleViewModeChange('kanban')}
              className={`flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 rounded-lg transition-all ${
                viewMode === 'kanban' ? 'text-[#2DD4BF]' : 'text-zinc-500'
              }`}
            >
              <LayoutGrid size={20} />
              <span className="text-[10px] font-medium">{t('kanban.viewKanban')}</span>
            </button>

            {/* 일정 */}
            <button
              onClick={() => {
                const subMode = getScheduleSubMode();
                if (subMode === 'weekly' && !canAccessSchedule) {
                  handleViewModeChange('schedule');
                } else {
                  handleViewModeChange(subMode);
                }
              }}
              className={`flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 rounded-lg transition-all ${
                viewMode === 'schedule' || viewMode === 'weekly' ? 'text-[#2DD4BF]' : 'text-zinc-500'
              }`}
            >
              <Calendar size={20} />
              <span className="text-[10px] font-medium">{t('kanban.viewScheduleTab', '일정')}</span>
            </button>

            {/* 회의 */}
            {!isWhiteLabelDomain && (
              <button
                onClick={() => handleViewModeChange('meeting')}
                className={`flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 rounded-lg transition-all ${
                  viewMode === 'meeting' ? 'text-[#2DD4BF]' : 'text-zinc-500'
                }`}
              >
                <Users size={20} />
                <span className="text-[10px] font-medium">{t('kanban.viewMeeting', '회의')}</span>
              </button>
            )}

            {/* 노트 */}
            {!isWhiteLabelDomain && (
              <button
                onClick={() => handleViewModeChange('notes')}
                className={`flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 rounded-lg transition-all ${
                  viewMode === 'notes' ? 'text-[#2DD4BF]' : 'text-zinc-500'
                }`}
              >
                <FileText size={20} />
                <span className="text-[10px] font-medium">{t('kanban.viewNotes', '노트')}</span>
              </button>
            )}

            {/* AI분석 */}
            {!isWhiteLabelDomain && (isAdminOrOwner || (!isViewer && !isTester)) && (
              <button
                onClick={() => {
                  if (!canAccessStatistics) {
                    openUpgradeModal('statistics');
                    return;
                  }
                  const subMode = getAISubMode();
                  if (subMode === 'statistics' && !isAdminOrOwner) {
                    handleViewModeChange('ai_report');
                  } else if (subMode === 'ai_report' && (isViewer || isTester)) {
                    handleViewModeChange('statistics');
                  } else {
                    handleViewModeChange(subMode);
                  }
                }}
                className={`relative flex flex-col items-center gap-0.5 min-w-[3rem] px-2 py-1 rounded-lg transition-all ${
                  viewMode === 'statistics' || viewMode === 'ai_report'
                    ? 'text-[#2DD4BF]'
                    : !canAccessStatistics
                      ? 'text-zinc-700'
                      : 'text-zinc-500'
                }`}
              >
                <BarChart3 size={20} />
                <span className="text-[10px] font-medium">{t('kanban.viewAIAnalysisTab', 'AI분석')}</span>
                {!canAccessStatistics && <Lock size={8} className="absolute top-0.5 right-1 text-zinc-600" />}
              </button>
            )}
          </div>
        </nav>

        {/* 모달들 */}
        <FeatureDetailModal
          feature={selectedFeature}
          tasks={selectedFeature ? tasks.filter((t) => t.feature_id === selectedFeature.id) : []}
          blocks={blocks}
          open={isFeatureModalOpen}
          onClose={() => { setIsFeatureModalOpen(false); setSelectedFeature(null); }}
          onAddSubtask={(title) => handleAddSubtask(selectedFeature!.id, title)}
          onRenameSubtask={(taskId, newTitle) => {
            setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, title: newTitle } : t));
          }}
          onUpdateFeature={handleUpdateFeature}
          onDelete={handleDeleteFeature}
          availableTags={tags}
          onCreateTag={handleCreateTag}
          onUpdateTag={handleUpdateTag}
          onDeleteTag={handleDeleteTag}
          boardId={boardId || ''}
          canEdit={canEdit}
        />

        <TaskDetailModal
          task={selectedTask}
          open={isTaskModalOpen}
          onClose={() => { setIsTaskModalOpen(false); setSelectedTask(null); }}
          onUpdate={(updates) => selectedTask && handleUpdateTask(selectedTask.id, updates)}
          onDelete={handleDeleteTask}
          onMoveToDone={(taskId) => {
            const doneBlock = blocks.find((b) => b.fixed_type === 'DONE');
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
          blocks={blocks}
          features={features}
          allTasks={tasks}
          availableTags={tags}
          onCreateTag={handleCreateTag}
          onUpdateTag={handleUpdateTag}
          onDeleteTag={handleDeleteTag}
          boardMembers={boardMembersData}
          currentUser={currentUser}
          boardId={boardId || ''}
          canEdit={canEdit}
          isAdminOrOwner={isAdminOrOwner}
          wsCommentEvent={wsCommentEvent}
          wsChecklistEvent={wsChecklistEvent}
        />

        <AddBlockModal
          open={isAddBlockModalOpen}
          onClose={() => setIsAddBlockModalOpen(false)}
          onAdd={handleAddBlock}
        />

        <AddFeatureModal
          open={isAddFeatureModalOpen}
          onClose={() => setIsAddFeatureModalOpen(false)}
          onAdd={handleAddFeature}
          milestones={milestones}
          defaultMilestoneId={kanbanSelectedMilestoneId}
        />

        <ShareBoardModal
          open={isShareBoardModalOpen}
          onClose={() => setIsShareBoardModalOpen(false)}
          members={boardMembersData}
          onAddMember={handleAddMember}
          onUpdateMemberRole={handleUpdateMemberRole}
          onRemoveMember={handleRemoveMember}
          onUpdateMemberColor={handleUpdateMemberColor}
          onReorderMembers={handleReorderMembers}
          currentUserId={currentUserId}
          boardId={boardId || ''}
          onlineUserIds={onlineUsers}
          inviteLinks={inviteLinks}
          onCreateInviteLink={handleCreateInviteLink}
          onDeleteInviteLink={handleDeleteInviteLink}
          seatInfo={!hideBillingForUser && subscription ? {
            seatCount: subscription.seat_count,
            usedSeats: subscription.billable_member_count || boardMembersData.filter(m => m.role !== 'viewer').length
          } : undefined}
          onOpenSeatManagement={!hideBillingForUser ? () => {
            setIsShareBoardModalOpen(false);
            setIsSubscriptionModalOpen(true);
          } : undefined}
          aiCredits={!hideBillingForUser ? aiCredits : undefined}
        />

        {!hideBillingForUser && (
          <SubscriptionModal
            open={isSubscriptionModalOpen}
            onClose={() => setIsSubscriptionModalOpen(false)}
            subscription={subscription}
            currentBillableMembers={subscription?.billable_member_count || boardMembersData.filter(m => m.role !== 'viewer').length || 0}
            onChangeBillingCycle={handleChangeBillingCycle}
            onPurchaseSeats={handleSubscriptionPurchaseSeats}
            onCancelSubscription={handleCancelSubscription}
          />
        )}

        <InquiryModal
          isOpen={isInquiryModalOpen}
          onClose={() => setIsInquiryModalOpen(false)}
        />

        {/* ActivityLogModal replaced by NotificationDropdown */}

        <MilestoneModal
          isOpen={isMilestoneModalOpen}
          onClose={() => {
            setIsMilestoneModalOpen(false);
            setSelectedMilestone(null);
          }}
          milestone={selectedMilestone}
          features={allFeatures}
          featureMilestoneCountMap={featureMilestoneCountMap}
          onSave={handleSaveMilestone}
          onDelete={handleDeleteMilestone}
        />

        <MilestoneOnboardingModal
          isOpen={isMilestoneOnboardingOpen}
          onClose={() => setIsMilestoneOnboardingOpen(false)}
          onCreateMilestone={() => handleOpenMilestoneWithCheck()}
        />

        {!hideBillingForUser && (
          <UpgradeModal
            open={isUpgradeModalOpen}
            onClose={() => setIsUpgradeModalOpen(false)}
            trigger={upgradeTrigger}
            currentBillableMembers={subscription?.billable_member_count || boardMembersData.filter(m => m.role !== 'viewer').length || 1}
            onUpgrade={handleSeatUpgrade}
          />
        )}

        {!hideBillingForUser && (
          <PremiumBenefitsModal
            open={isPremiumBenefitsModalOpen}
            onClose={() => setIsPremiumBenefitsModalOpen(false)}
            currentBillableMembers={subscription?.billable_member_count || boardMembersData.filter(m => m.role !== 'viewer').length || 1}
            onUpgrade={handleSeatUpgrade}
          />
        )}

        {seatPurchaseModal && (
          <SeatPurchaseModal
            open={seatPurchaseModal.open}
            onClose={() => setSeatPurchaseModal(null)}
            seatCount={seatPurchaseModal.seatCount}
            billableMemberCount={seatPurchaseModal.billableMemberCount}
            billingCycle={subscription?.billing_cycle || 'MONTHLY'}
            onPurchase={handlePurchaseSeatsAndRetry}
            pendingInviteEmail={seatPurchaseModal.pendingEmail || undefined}
            isRoleChange={!!seatPurchaseModal.pendingMemberId}
          />
        )}

        <AlertModal
          open={alertModal.open && !(hideBillingForUser && alertModal.type === 'premium')}
          onClose={() => setAlertModal({ ...alertModal, open: false })}
          type={alertModal.type}
        />

        {/* AI Credit Purchase Modal */}
        <AiCreditPurchaseModal
          isOpen={showCreditModal}
          onClose={() => setShowCreditModal(false)}
          boardId={boardId || ''}
          mode={creditModalMode}
          onPurchaseComplete={handleCreditPurchaseComplete}
          currentCredits={aiCredits}
        />

        {/* Version Info */}
        <div className="fixed bottom-16 md:bottom-2 right-3 text-[10px] text-slate-600 select-none pointer-events-none z-10">
          FE: {typeof __FE_COMMIT_HASH__ !== 'undefined' ? __FE_COMMIT_HASH__ : 'dev'}
          {beCommit && <> · BE: {beCommit}</>}
        </div>
      </div>
    </DragProvider>
  );
}
