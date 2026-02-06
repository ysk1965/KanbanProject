import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Users, Settings, Filter, ArrowLeft, LayoutGrid, Calendar, CalendarDays, Flag, Pencil, Lock, BarChart3, Search, X, User, ChevronDown, CheckCircle2, Circle, Tag as TagIcon, Layers, ChevronsDownUp, ChevronsUpDown, Shield, Lightbulb, MessageSquare } from 'lucide-react';
import { format, parseISO } from 'date-fns';

// 뷰 모드 타입
type ViewMode = 'kanban' | 'weekly' | 'schedule' | 'statistics' | 'management';
import { DragProvider } from '../contexts/DragContext';
import { useAuth } from '../contexts/AuthContext';
import { Block, Feature, Task, Priority, Tag, Board, InviteLink, Subscription, PricingPlan, ActivityLog, Milestone, BoardTierInfo, BoardLimits, ChecklistItem, NotificationItem } from '../types';
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
import { AlertModal } from '../components/AlertModal';
import { UserMenu } from '../components/UserMenu';
import { DailyScheduleView } from '../components/DailyScheduleView';
import { WeeklyScheduleView } from '../components/WeeklyScheduleView';
import { StatisticsView } from '../components/StatisticsView';
import { ManagementView } from '../components/ManagementView';
import { EmptyBoardGuide } from '../components/EmptyBoardGuide';
import { InquiryModal } from '../components/InquiryModal';
import { AnnouncementDisplay } from '../components/AnnouncementDisplay';
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
  pricingService,
  milestoneService,
  checklistService,
  inquiryService
} from '../utils/services';
import { notificationAPI } from '../utils/api';

import { getRandomFeatureColor } from '../constants';
import { getInitials, getAssigneeHex } from '../utils/assigneeColor';

export function KanbanBoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const { currentUser, logout, hideBilling } = useAuth();

  // 뷰 모드 상태
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // 보드 데이터
  const [board, setBoard] = useState<Board | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [allFeatures, setAllFeatures] = useState<Feature[]>([]); // 마일스톤 모달용 전체 Feature
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | undefined>();
  const [hasMoreActivity, setHasMoreActivity] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // 배치 로드된 체크리스트 데이터 (taskId -> ChecklistItem[])
  const [checklistDataMap, setChecklistDataMap] = useState<{ [taskId: string]: ChecklistItem[] }>({});

  // Tier & Limits 상태
  const [tierInfo, setTierInfo] = useState<BoardTierInfo | null>(null);
  const [boardLimits, setBoardLimits] = useState<BoardLimits | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeTrigger, setUpgradeTrigger] = useState<UpgradeTrigger>('task_limit');

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
  const [managementRefreshKey, setManagementRefreshKey] = useState(0);
  const [isAddBlockModalOpen, setIsAddBlockModalOpen] = useState(false);
  const [isAddFeatureModalOpen, setIsAddFeatureModalOpen] = useState(false);
  const [isShareBoardModalOpen, setIsShareBoardModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [isActivityLogModalOpen, setIsActivityLogModalOpen] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadInquiryCount, setUnreadInquiryCount] = useState(0);
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

  // 보드 데이터 로드
  useEffect(() => {
    const loadBoardData = async () => {
      if (!boardId) {
        navigate('/boards');
        return;
      }

      try {
        setIsLoading(true);

        const [
          boardData,
          blocksData,
          featuresData,
          tasksData,
          tagsData,
          inviteLinksData,
          subscriptionData,
          activitiesResponse,
          membersData,
          pricingResponse,
          milestonesData,
          tierData,
          limitsData,
        ] = await Promise.all([
          boardService.getBoard(boardId),
          blockService.getBlocks(boardId),
          featureService.getFeatures(boardId),
          taskService.getTasks(boardId),
          tagService.getTags(boardId),
          inviteLinkService.getInviteLinks(boardId),
          subscriptionService.getSubscription(boardId),
          activityService.getActivities(boardId),
          memberService.getMembers(boardId),
          pricingService.getPlans(),
          milestoneService.getMilestones(boardId),
          boardService.getBoardTier(boardId),
          boardService.getBoardLimits(boardId),
        ]);

        setBoard(boardData);
        setBlocks(blocksData);
        setTags(tagsData);
        setInviteLinks(inviteLinksData);
        setSubscription(subscriptionData);
        setActivities(activitiesResponse.activities);
        setActivityCursor(activitiesResponse.next_cursor || undefined);
        setHasMoreActivity(activitiesResponse.has_more);
        setPricingPlans(pricingResponse.plans);
        setMilestones(milestonesData);
        setTierInfo(tierData);
        setBoardLimits(limitsData);
        setAllFeatures(featuresData); // 마일스톤 모달용 전체 Feature 저장
        setBoardMembersData(membersData.members.map((m: any) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: (m.role === 'VIEWER' ? 'observer' : m.role.toLowerCase()) as MemberRole,
          assigneeColor: m.assignee_color || null,
        })));

        // 보드에 선택된 마일스톤이 있으면 해당 마일스톤으로 필터링된 데이터 로드
        let finalTasks = tasksData;
        if (boardData.selected_milestone_id) {
          setKanbanSelectedMilestoneId(boardData.selected_milestone_id);
          const [filteredFeatures, filteredTasks] = await Promise.all([
            featureService.getFeatures(boardId, boardData.selected_milestone_id),
            taskService.getTasks(boardId, { milestone_id: boardData.selected_milestone_id }),
          ]);
          setFeatures(filteredFeatures);
          setTasks(filteredTasks);
          finalTasks = filteredTasks;
        } else {
          setFeatures(featuresData);
          setTasks(tasksData);
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
            Object.entries(batchChecklistData).forEach(([taskId, data]) => {
              checklistMap[taskId] = data.items.map((item) => ({
                id: item.id,
                title: item.title,
                completed: item.completed,
                position: item.position,
                due_date: item.due_date,
                assignee: item.assignee ? { id: item.assignee.id, name: item.assignee.name } : null,
              }));
            });
            setChecklistDataMap(checklistMap);
          } catch (error) {
            console.warn('Failed to load batch checklists:', error);
            // 배치 로드 실패 시 개별 로드로 fallback (DraggableCard에서 처리)
          }
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

  // 보드의 선택된 마일스톤 동기화
  useEffect(() => {
    if (board?.selected_milestone_id) {
      setKanbanSelectedMilestoneId(board.selected_milestone_id);
    } else {
      setKanbanSelectedMilestoneId('all');
    }
  }, [board?.selected_milestone_id]);

  // 알림 읽지 않은 수 폴링
  useEffect(() => {
    if (!boardId || !currentUser) return;
    const fetchUnreadCount = async () => {
      try {
        const response = await notificationAPI.getUnreadCount();
        setUnreadNotificationCount(response.unread_count);
      } catch (error) {
        /* silently fail */
      }
    };
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [boardId, currentUser]);

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

  // Premium 기능 접근 제어 헬퍼 (hideBilling 사용자는 제한 없음)
  const canAccessSchedule = hideBilling || (tierInfo?.can_access_schedule ?? true);
  const canAccessMilestone = hideBilling || (tierInfo?.can_access_milestone ?? true);
  const isStandardTier = hideBilling ? false : tierInfo?.tier === 'STANDARD';

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
  const canViewStatistics = canAccessStatistics && isAdminOrOwner;

  // Viewer(Observer) 권한 체크 - Viewer는 수정 불가
  const currentUserRole = boardMembersData?.find(
    (m) => m.userId === currentUser?.id
  )?.role;
  const isViewer = currentUserRole === 'observer';
  const canEdit = !isViewer;

  // 뷰 모드 변경 핸들러 (Premium 기능 체크)
  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'weekly' && !canAccessSchedule) {
      openUpgradeModal('weekly_schedule');
      return;
    }
    if (mode === 'schedule' && !canAccessSchedule) {
      openUpgradeModal('daily_schedule');
      return;
    }
    if (mode === 'statistics') {
      if (!canAccessStatistics) {
        openUpgradeModal('statistics');
        return;
      }
      if (!isAdminOrOwner) {
        // Admin 권한 없음 알림 (별도 처리 가능)
        return;
      }
    }
    setViewMode(mode);
  };

  // 마일스톤 열기 핸들러 (Premium 기능 체크)
  const handleOpenMilestoneWithCheck = (milestone?: Milestone) => {
    if (!canAccessMilestone) {
      openUpgradeModal('milestone');
      return;
    }
    setSelectedMilestone(milestone || null);
    setIsMilestoneModalOpen(true);
  };

  // Seat 기반 업그레이드 핸들러
  const handleSeatUpgrade = async (billingCycle: 'MONTHLY' | 'YEARLY') => {
    if (!boardId) return;
    try {
      const newSubscription = await subscriptionService.startSeatSubscription(boardId, {
        billing_cycle: billingCycle,
      });
      setSubscription(newSubscription);
      // 업그레이드 후 tier/limits 다시 로드
      const [tierData, limitsData] = await Promise.all([
        boardService.getBoardTier(boardId),
        boardService.getBoardLimits(boardId),
      ]);
      setTierInfo(tierData);
      setBoardLimits(limitsData);
    } catch (error) {
      console.error('Failed to upgrade:', error);
      throw error;
    }
  };

  // Task 생성 가능 여부 확인 (hideBilling 사용자는 제한 없음)
  const canCreateTask = hideBilling || (boardLimits?.can_create_task ?? true);

  // boardLimits 갱신 함수 (Task 생성/삭제 후 호출)
  const refreshBoardLimits = async () => {
    if (!boardId) return;
    try {
      const limitsData = await boardService.getBoardLimits(boardId);
      setBoardLimits(limitsData);
    } catch (error) {
      console.error('Failed to refresh board limits:', error);
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
          Object.entries(batchChecklistData).forEach(([taskId, data]) => {
            checklistMap[taskId] = data.items.map((item) => ({
              id: item.id,
              title: item.title,
              completed: item.completed,
              position: item.position,
              due_date: item.due_date,
              assignee: item.assignee ? { id: item.assignee.id, name: item.assignee.name } : null,
            }));
          });
          setChecklistDataMap(checklistMap);
        } catch (error) {
          console.warn('Failed to load batch checklists:', error);
        }
      } else {
        setChecklistDataMap({});
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
      alert('올바른 이메일 주소를 입력해주세요.');
      return;
    }

    if (boardMembersData.some((m) => m.email === email)) {
      alert('이미 보드에 추가된 멤버입니다.');
      return;
    }

    const backendRole = role === 'observer' ? 'VIEWER' : role.toUpperCase();

    try {
      const result = await memberService.inviteMember(boardId, email, backendRole as any);

      if (result.type === 'DIRECT_ADD' && result.member) {
        // 기존 사용자 - 바로 멤버로 추가됨
        setBoardMembersData([...boardMembersData, {
          id: result.member.id,
          userId: result.member.user.id,
          name: result.member.user.name,
          email: result.member.user.email,
          role: (result.member.role === 'VIEWER' ? 'observer' : result.member.role.toLowerCase()) as MemberRole,
        }]);
        alert(`${result.member.user.name}님이 멤버로 추가되었습니다.`);
      } else if (result.type === 'EMAIL_SENT') {
        // 미가입 사용자 - 이메일 초대 발송됨
        alert(`${result.email}로 초대 이메일이 발송되었습니다. 가입 후 참여할 수 있습니다.`);
      }
    } catch (error: any) {
      console.error('Failed to invite member:', error);
      alert(error?.message || '멤버 초대에 실패했습니다.');
    }
  };

  const handleUpdateMemberRole = async (memberId: string, role: MemberRole) => {
    if (!boardId) return;

    const prevMembers = [...boardMembersData];
    setBoardMembersData(
      boardMembersData.map((m) => (m.id === memberId ? { ...m, role } : m))
    );

    const backendRole = role === 'observer' ? 'VIEWER' : role.toUpperCase();

    try {
      await memberService.updateMemberRole(boardId, memberId, backendRole as any);
    } catch (error: any) {
      console.error('Failed to update member role:', error);
      setBoardMembersData(prevMembers);
      alert(error?.message || '역할 변경에 실패했습니다.');
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
      alert('자기 자신은 제거할 수 없습니다.');
      return;
    }

    const prevMembers = [...boardMembersData];
    setBoardMembersData(boardMembersData.filter((m) => m.id !== memberId));

    try {
      await memberService.removeMember(boardId, memberId);
    } catch (error: any) {
      console.error('Failed to remove member:', error);
      setBoardMembersData(prevMembers);
      alert(error?.message || '멤버 제거에 실패했습니다.');
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
  const handleSubscribe = async (planId: string, billingCycle: 'monthly' | 'yearly') => {
    if (!boardId) return;
    const newSubscription = await subscriptionService.subscribe(boardId, planId, billingCycle);
    setSubscription(newSubscription);
  };

  const handleChangePlan = async (planId: string, billingCycle: 'monthly' | 'yearly') => {
    if (!boardId) return;
    const newSubscription = await subscriptionService.changePlan(boardId, planId, billingCycle);
    setSubscription(newSubscription);
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

  const handleDeleteBlock = (blockId: string) => {
    const blockToDelete = blocks.find((b) => b.id === blockId);
    if (!blockToDelete || blockToDelete.type === 'FIXED') return;

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
    priority?: Priority;
    dueDate?: string;
  }) => {
    if (!boardId) return;

    try {
      const newFeature = await featureService.createFeature(boardId, {
        title: data.title,
        description: data.description,
        color: getRandomFeatureColor(),
        priority: data.priority?.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW' | undefined,
        due_date: data.dueDate,
      });
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
        priority: updates.priority,
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

    // Task 생성 제한 체크
    if (!canCreateTask) {
      openUpgradeModal('task_limit');
      return;
    }

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
      // Task 생성 후 limits 갱신
      await refreshBoardLimits();
    } catch (error: any) {
      // 서버에서 Task 제한 오류 반환 시 처리
      if (error?.code === 'T003') {
        openUpgradeModal('task_limit');
        return;
      }
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
      key === 'checklist_total' || key === 'checklist_completed'
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
      // Task 삭제 후 limits 갱신
      await refreshBoardLimits();
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

  // 필터링 (마일스톤 필터는 API에서 처리되므로 여기서는 키워드, 멤버, 태그 필터만 적용)
  const filteredFeatures = useMemo(() => {
    return features.filter((feature) => {
      if (filterOptions.keyword && !feature.title.toLowerCase().includes(filterOptions.keyword.toLowerCase())) {
        return false;
      }
      if (filterOptions.members.length > 0 && !filterOptions.members.some((m) => feature.assignee?.name === m)) {
        return false;
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
      if (filterOptions.members.length > 0 && !filterOptions.members.some((m) => task.assignee?.name === m)) {
        return false;
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
  }, [tasks, filterOptions]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bridge-dark flex items-center justify-center">
        <div className="text-foreground text-lg font-light">로딩 중...</div>
      </div>
    );
  }

  return (
    <DragProvider>
      <AnnouncementDisplay />
      <div className="min-h-screen bg-bridge-dark flex flex-col">
        <TrialBanner
          status={subscription?.status || 'TRIAL'}
          daysRemaining={
            subscription?.trial_ends_at
              ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
              : 0
          }
          tier={tierInfo?.tier}
          onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
          hideBilling={hideBilling}
        />

        <header className="h-16 border-b border-kanban-border flex items-center justify-between px-6 bg-kanban-bg shrink-0 z-30">
          {/* 좌측 영역 */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/boards')}
              className="p-2 hover:bg-kanban-surface rounded-lg transition-colors text-zinc-400 hover:text-foreground"
            >
              <ArrowLeft size={18} />
            </button>

            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                {board?.name || '팀 칸반보드'}
              </h1>

              {/* 마일스톤 셀렉터 */}
              <div className="flex items-center gap-2 bg-kanban-card px-3 py-1.5 rounded-md border border-kanban-border hover:border-indigo-500/50 cursor-pointer transition-all">
                <Flag size={14} className="text-indigo-400" />
                {milestones.length > 0 ? (
                  <Select value={kanbanSelectedMilestoneId} onValueChange={handleKanbanMilestoneSelect}>
                    <SelectTrigger className="bg-transparent border-none text-xs font-medium text-foreground focus:ring-0 h-auto p-0 w-[120px] [&>svg]:text-zinc-400">
                      <SelectValue placeholder="마일스톤 선택" />
                    </SelectTrigger>
                    <SelectContent className="bg-kanban-card border-kanban-border">
                      <SelectItem value="all" className="text-zinc-300 hover:bg-white/10 focus:bg-white/10 focus:text-foreground text-xs">
                        전체
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
                    <Lightbulb size={12} className="text-indigo-400 animate-pulse" />
                    <span className="text-xs text-indigo-400 group-hover:text-indigo-300 transition-colors">마일스톤을 시작해보세요</span>
                  </button>
                ) : (
                  <span className="text-xs text-zinc-500">마일스톤 없음</span>
                )}
              </div>

              {kanbanSelectedMilestoneId !== 'all' && (
                <button
                  onClick={() => {
                    const milestone = milestones.find((m) => m.id === kanbanSelectedMilestoneId);
                    if (milestone) handleOpenMilestoneWithCheck(milestone);
                  }}
                  className="p-1.5 text-zinc-400 hover:text-foreground transition-colors"
                  title="마일스톤 수정"
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

          {/* 중앙 탭 영역 */}
          <nav className="flex items-center gap-1 bg-kanban-card p-1 rounded-xl border border-kanban-border">
            <button
              onClick={() => handleViewModeChange('kanban')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'kanban'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
              }`}
            >
              <LayoutGrid size={14} />
              칸반보드
            </button>
            <button
              onClick={() => {
                if (!canAccessSchedule) {
                  showAlertModal('premium');
                  return;
                }
                handleViewModeChange('schedule');
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'schedule'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : !canAccessSchedule
                    ? 'text-zinc-600 cursor-not-allowed opacity-50'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
              }`}
            >
              <Calendar size={14} />
              데일리스케줄
              {!canAccessSchedule && <Lock size={10} className="ml-0.5 text-zinc-500" />}
            </button>
            <button
              onClick={() => {
                if (!canAccessSchedule) {
                  showAlertModal('premium');
                  return;
                }
                handleViewModeChange('weekly');
              }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'weekly'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : !canAccessSchedule
                    ? 'text-zinc-600 cursor-not-allowed opacity-50'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
              }`}
            >
              <CalendarDays size={14} />
              간트차트
              {!canAccessSchedule && <Lock size={10} className="ml-0.5 text-zinc-500" />}
            </button>
            {isAdminOrOwner && (
              <button
                onClick={() => {
                  if (!canAccessStatistics) {
                    showAlertModal('premium');
                    return;
                  }
                  handleViewModeChange('statistics');
                }}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                  viewMode === 'statistics'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : !canAccessStatistics
                      ? 'text-zinc-600 cursor-not-allowed opacity-50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
                }`}
              >
                <BarChart3 size={14} />
                마일스톤
                {!canAccessStatistics && <Lock size={10} className="ml-0.5 text-zinc-500" />}
              </button>
            )}
            {isAdminOrOwner && (
              <button
                onClick={() => {
                  if (!canAccessStatistics) {
                    showAlertModal('premium');
                    return;
                  }
                  handleViewModeChange('management');
                }}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                  viewMode === 'management'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : !canAccessStatistics
                      ? 'text-zinc-600 cursor-not-allowed opacity-50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-kanban-surface'
                }`}
              >
                <Shield size={14} />
                관리
                {!canAccessStatistics && <Lock size={10} className="ml-0.5 text-zinc-500" />}
              </button>
            )}
          </nav>

          {/* 우측 액션 영역 */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border-r border-kanban-border pr-3 mr-1">
              <NotificationDropdown
                boardId={boardId || ''}
                unreadCount={unreadNotificationCount}
                activities={activities}
                hasMoreActivities={hasMoreActivity}
                onLoadMoreActivities={handleLoadMoreActivity}
                onNotificationClick={handleNotificationClick}
                onUnreadCountChange={setUnreadNotificationCount}
              />
              <button
                onClick={() => setIsInquiryModalOpen(true)}
                className="relative flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-kanban-surface rounded-lg transition-all"
                title="문의하기"
              >
                <MessageSquare size={18} />
                {unreadInquiryCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {unreadInquiryCount > 99 ? '99+' : unreadInquiryCount}
                  </span>
                )}
              </button>
                <button
                onClick={() => setIsShareBoardModalOpen(true)}
                className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-kanban-surface rounded-lg transition-all"
              >
                <Users size={18} />
                <span className="text-xs font-semibold">팀원</span>
              </button>
              <button
                className="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-foreground hover:bg-kanban-surface rounded-lg transition-all"
              >
                <Settings size={18} />
              </button>
            </div>

            {currentUser && (
              <UserMenu
                user={currentUser}
                assigneeColor={memberColorMap[currentUser.id]}
                onOpenSubscription={() => setIsSubscriptionModalOpen(true)}
                onOpenSettings={() => {}}
                onLogout={logout}
                hideBilling={hideBilling}
              />
            )}
          </div>
        </header>

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
            />
          </main>
        ) : viewMode === 'kanban' ? (
          <main className="flex-1 flex flex-col overflow-hidden bg-kanban-bg">
            {features.length === 0 ? (
              <EmptyBoardGuide onCreateFeature={() => setIsAddFeatureModalOpen(true)} />
            ) : (
            <>
            {/* Task 카운터 (Standard 보드) */}
            {isStandardTier && boardLimits && (
              <div className="px-6 py-2 bg-kanban-card border-b border-kanban-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">
                      Task: <span className={`font-semibold ${boardLimits.current_task_count >= (boardLimits.task_limit || 10) ? 'text-red-400' : 'text-white'}`}>
                        {boardLimits.current_task_count}
                      </span>
                      <span className="text-zinc-600">/{boardLimits.task_limit || 10}</span>
                    </span>
                    {!boardLimits.can_create_task && (
                      <span className="text-xs text-red-400 font-semibold">(한도 도달)</span>
                    )}
                  </div>
                  {!boardLimits.can_create_task && !hideBilling && (
                    <button
                      onClick={() => openUpgradeModal('task_limit')}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                    >
                      Premium으로 업그레이드
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* 검색 + 필터 툴바 */}
            <div className="px-6 py-3 border-b border-kanban-border flex items-center gap-2 flex-wrap">
              {/* 검색 */}
              <div className="relative w-80">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="검색..."
                  value={filterOptions.keyword}
                  onChange={(e) => setFilterOptions({ ...filterOptions, keyword: e.target.value })}
                  className="w-full bg-kanban-surface border border-kanban-border rounded-lg py-2 pl-10 pr-8 text-sm text-foreground placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
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

              <div className="h-6 w-px bg-kanban-border mx-1" />

              {/* 담당자 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                      filterOptions.members.length > 0
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                        : 'bg-kanban-surface border border-kanban-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
                    }`}
                  >
                    <User size={14} />
                    담당자
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
                      담당자 없음
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
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                          style={{ backgroundColor: getAssigneeHex(member.name, member.assigneeColor) }}
                        >
                          {getInitials(member.name)}
                        </div>
                        <span className="truncate">{member.name}</span>
                        {filterOptions.members.includes(member.name) && (
                          <CheckCircle2 size={14} className="ml-auto text-indigo-400" />
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
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                      filterOptions.features.length > 0
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50'
                        : 'bg-kanban-surface border border-kanban-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
                    }`}
                  >
                    <Layers size={14} />
                    Feature
                    {filterOptions.features.length > 0 && (
                      <span className="bg-indigo-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px]">
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
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: feature.color || '#8B5CF6' }}
                        />
                        <span className="truncate">{feature.title}</span>
                        {filterOptions.features.includes(feature.id) && (
                          <CheckCircle2 size={14} className="ml-auto text-indigo-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                    {features.length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-2">Feature가 없습니다</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* 라벨 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                      filterOptions.tags.length > 0
                        ? 'bg-teal-500/20 text-teal-400 border border-teal-500/50'
                        : 'bg-kanban-surface border border-kanban-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
                    }`}
                  >
                    <TagIcon size={14} />
                    라벨
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
                      <p className="text-sm text-zinc-500 text-center py-2">라벨이 없습니다</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* 상태 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                      filterOptions.cardStatus.length > 0
                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                        : 'bg-kanban-surface border border-kanban-border text-zinc-400 hover:text-foreground hover:border-zinc-600'
                    }`}
                  >
                    <CheckCircle2 size={14} />
                    상태
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
                      완료됨
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
                      미완료
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
                  <div className="h-6 w-px bg-kanban-border mx-1" />
                  <button
                    onClick={() => setFilterOptions({ keyword: '', members: [], features: [], tags: [], cardStatus: [], dueDate: [] })}
                    className="flex items-center gap-1 px-3 py-2 text-xs text-zinc-500 hover:text-foreground transition-colors"
                  >
                    <X size={12} />
                    초기화
                  </button>
                </>
              )}

              {/* 스페이서 */}
              <div className="flex-1" />

              {/* 모두 펼치기/닫기 */}
              <div className="flex items-center gap-1">
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
                  title="모두 펼치기"
                >
                  <ChevronsUpDown size={14} />
                  펼치기
                </button>
                <button
                  onClick={() => {
                    // 체크리스트 모두 닫기
                    setExpandedChecklistTaskIds(new Set());
                    // Feature 서브태스크 모두 닫기
                    setExpandedFeatureIds(new Set());
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-kanban-surface rounded-lg transition-colors"
                  title="모두 닫기"
                >
                  <ChevronsDownUp size={14} />
                  닫기
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
            <div className="flex-1 p-6 overflow-x-auto kanban-scrollbar">
              <div className="flex gap-4 min-w-max">
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
                role: m.role === 'observer' ? 'VIEWER' : m.role.toUpperCase() as any,
                joined_at: '',
              }))}
            />
          </main>
        ) : viewMode === 'management' ? (
          <main className="flex-1 overflow-hidden">
            <ManagementView
              boardId={boardId || ''}
              milestones={milestones}
              members={boardMembersData.map(m => ({
                id: m.id,
                user: {
                  id: m.userId,
                  name: m.name,
                  email: m.email,
                  profile_image: null,
                },
                role: m.role === 'observer' ? 'VIEWER' : m.role.toUpperCase() as any,
                joined_at: '',
              }))}
              onTaskClick={(taskId) => {
                const task = tasks.find(t => t.id === taskId);
                if (task) handleTaskClick(task);
              }}
              refreshTrigger={managementRefreshKey}
            />
          </main>
        ) : null}

        {/* 모달들 */}
        <FeatureDetailModal
          feature={selectedFeature}
          tasks={selectedFeature ? tasks.filter((t) => t.feature_id === selectedFeature.id) : []}
          blocks={blocks}
          open={isFeatureModalOpen}
          onClose={() => { setIsFeatureModalOpen(false); setSelectedFeature(null); }}
          onAddSubtask={(title) => handleAddSubtask(selectedFeature!.id, title)}
          onUpdateFeature={handleUpdateFeature}
          onDelete={handleDeleteFeature}
          availableTags={tags}
          onCreateTag={handleCreateTag}
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
          blocks={blocks}
          availableTags={tags}
          onCreateTag={handleCreateTag}
          boardMembers={boardMembersData}
          currentUser={currentUser}
          boardId={boardId || ''}
          canEdit={canEdit}
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
        />

        <ShareBoardModal
          open={isShareBoardModalOpen}
          onClose={() => setIsShareBoardModalOpen(false)}
          members={boardMembersData}
          onAddMember={handleAddMember}
          onUpdateMemberRole={handleUpdateMemberRole}
          onRemoveMember={handleRemoveMember}
          onUpdateMemberColor={handleUpdateMemberColor}
          currentUserId={currentUserId}
          inviteLinks={inviteLinks}
          onCreateInviteLink={handleCreateInviteLink}
          onDeleteInviteLink={handleDeleteInviteLink}
        />

        {!hideBilling && (
          <SubscriptionModal
            open={isSubscriptionModalOpen}
            onClose={() => setIsSubscriptionModalOpen(false)}
            subscription={subscription}
            plans={pricingPlans}
            onSubscribe={handleSubscribe}
            onChangePlan={handleChangePlan}
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
          onSave={handleSaveMilestone}
          onDelete={handleDeleteMilestone}
        />

        <MilestoneOnboardingModal
          isOpen={isMilestoneOnboardingOpen}
          onClose={() => setIsMilestoneOnboardingOpen(false)}
          onCreateMilestone={() => handleOpenMilestoneWithCheck()}
        />

        {!hideBilling && (
          <UpgradeModal
            open={isUpgradeModalOpen}
            onClose={() => setIsUpgradeModalOpen(false)}
            trigger={upgradeTrigger}
            seatCount={subscription?.billable_member_count || boardMembersData.filter(m => m.role !== 'observer').length || 1}
            onUpgrade={handleSeatUpgrade}
          />
        )}

        <AlertModal
          open={alertModal.open && !(hideBilling && alertModal.type === 'premium')}
          onClose={() => setAlertModal({ ...alertModal, open: false })}
          type={alertModal.type}
        />
      </div>
    </DragProvider>
  );
}
