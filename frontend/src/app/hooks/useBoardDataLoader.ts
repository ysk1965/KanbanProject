import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Block, Feature, Task, Tag, Board, InviteLink, Subscription, ActivityLog, Milestone, BoardTierInfo, BoardLimits, ChecklistItem, AiCredits } from '../types';
import { BoardMember as ShareBoardMember, MemberRole } from '../components/ShareBoardModal';
import {
  boardService,
  featureService,
  taskService,
  checklistService,
  memberService,
} from '../utils/services';
import { scheduleAPI } from '../utils/api';

function parseChecklistBatch(batchChecklistData: any): { [taskId: string]: ChecklistItem[] } {
  const checklistMap: { [taskId: string]: ChecklistItem[] } = {};
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
  return checklistMap;
}

export function useBoardDataLoader(boardId: string | undefined) {
  const navigate = useNavigate();

  // 보드 데이터
  const [board, setBoard] = useState<Board | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [allFeatures, setAllFeatures] = useState<Feature[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [activityCursor, setActivityCursor] = useState<string | undefined>();
  const [hasMoreActivity, setHasMoreActivity] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checklistDataMap, setChecklistDataMap] = useState<{ [taskId: string]: ChecklistItem[] }>({});
  const [scheduledTaskIds, setScheduledTaskIds] = useState<Set<string>>(new Set());
  const [tierInfo, setTierInfo] = useState<BoardTierInfo | null>(null);
  const [boardLimits, setBoardLimits] = useState<BoardLimits | null>(null);
  const [boardMembersData, setBoardMembersData] = useState<ShareBoardMember[]>([]);
  const [aiCredits, setAiCredits] = useState<AiCredits | null>(null);
  const [kanbanSelectedMilestoneId, setKanbanSelectedMilestoneId] = useState<string>('all');

  // 메인 데이터 로드
  useEffect(() => {
    const loadBoardData = async () => {
      if (!boardId) {
        navigate('/boards');
        return;
      }

      try {
        setIsLoading(true);
        const fullData = await boardService.getBoardFull(boardId);

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
          organization_id: fullData.organization_id || null,
          organization_name: fullData.organization_name || null,
          is_org_member_viewer: fullData.is_org_member_viewer || false,
          has_pending_join_request: fullData.has_pending_join_request || false,
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
        setAiCredits(fullData.ai_credits);
        setAllFeatures(fullData.features);
        setBoardMembersData(fullData.members.members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role.toLowerCase() as MemberRole,
          assigneeColor: m.assignee_color || null,
        })));

        // 마일스톤 선택 시 클라이언트 사이드 필터링 (추가 API 호출 제거)
        let filteredFeatures = fullData.features;
        let finalTasks = fullData.tasks;
        if (fullData.selected_milestone_id) {
          setKanbanSelectedMilestoneId(fullData.selected_milestone_id);
          const selectedMilestone = fullData.milestones.milestones.find(
            (m: Milestone) => m.id === fullData.selected_milestone_id
          );
          if (selectedMilestone?.features) {
            const milestoneFeatureIds = new Set(selectedMilestone.features.map((f: { id: string }) => f.id));
            filteredFeatures = fullData.features.filter((f: Feature) => milestoneFeatureIds.has(f.id));
            finalTasks = fullData.tasks.filter((t: Task) => milestoneFeatureIds.has(t.feature_id));
          }
        }
        // 체크리스트 배치 + 스케줄 Task ID를 먼저 로드 (카드 렌더링 전에 데이터 준비)
        const taskIdsWithChecklist = finalTasks
          .filter((t: Task) => (t.checklist_total ?? 0) > 0)
          .map((t: Task) => t.id);

        const [batchChecklistMap, scheduledData] = await Promise.all([
          taskIdsWithChecklist.length > 0
            ? checklistService.getBatchChecklists(boardId, taskIdsWithChecklist)
                .then(parseChecklistBatch)
                .catch((error) => { console.warn('Failed to load batch checklists:', error); return {} as { [taskId: string]: ChecklistItem[] }; })
            : Promise.resolve({} as { [taskId: string]: ChecklistItem[] }),
          scheduleAPI.getScheduledTaskIds(boardId)
            .catch((error) => { console.warn('Failed to load scheduled task ids:', error); return { task_ids: [] as string[] }; }),
        ]);

        // 모든 데이터를 동시에 set → 카드 렌더링 시 checklistDataMap이 이미 존재
        setFeatures(filteredFeatures);
        setTasks(finalTasks);
        setChecklistDataMap(batchChecklistMap);
        setScheduledTaskIds(new Set(scheduledData.task_ids));
      } catch (error) {
        console.error('Failed to load board data:', error);
        navigate('/boards', { state: { boardLoadFailed: boardId }, replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    loadBoardData();
  }, [boardId, navigate]);

  // Feature와 Task를 milestoneId로 필터링해서 다시 로드
  const reloadFeaturesAndTasks = useCallback(async (milestoneId?: string) => {
    if (!boardId) return;
    try {
      const [featuresData, tasksData] = await Promise.all([
        featureService.getFeatures(boardId, milestoneId),
        taskService.getTasks(boardId, milestoneId ? { milestone_id: milestoneId } : undefined),
      ]);
      const taskIdsWithChecklist = tasksData
        .filter((t: Task) => (t.checklist_total ?? 0) > 0)
        .map((t: Task) => t.id);

      const [batchChecklistMap, scheduledData] = await Promise.all([
        taskIdsWithChecklist.length > 0
          ? checklistService.getBatchChecklists(boardId, taskIdsWithChecklist)
              .then(parseChecklistBatch)
              .catch((error) => { console.warn('Failed to load batch checklists:', error); return {} as { [taskId: string]: ChecklistItem[] }; })
          : Promise.resolve({} as { [taskId: string]: ChecklistItem[] }),
        scheduleAPI.getScheduledTaskIds(boardId)
          .catch((error) => { console.warn('Failed to load scheduled task ids:', error); return { task_ids: [] as string[] }; }),
      ]);

      setFeatures(featuresData);
      setTasks(tasksData);
      setChecklistDataMap(batchChecklistMap);
      setScheduledTaskIds(new Set(scheduledData.task_ids));
    } catch (error) {
      console.error('Failed to reload features and tasks:', error);
    }
  }, [boardId]);

  // ShareBoardModal 멤버 새로고침 함수
  const refreshMembers = useCallback(async () => {
    if (!boardId) return;
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
  }, [boardId]);

  return {
    // Data
    board, setBoard,
    blocks, setBlocks,
    features, setFeatures,
    allFeatures, setAllFeatures,
    tasks, setTasks,
    tags, setTags,
    inviteLinks, setInviteLinks,
    subscription, setSubscription,
    activities, setActivities,
    activityCursor, setActivityCursor,
    hasMoreActivity, setHasMoreActivity,
    milestones, setMilestones,
    isLoading,
    checklistDataMap, setChecklistDataMap,
    scheduledTaskIds, setScheduledTaskIds,
    tierInfo, setTierInfo,
    boardLimits, setBoardLimits,
    boardMembersData, setBoardMembersData,
    aiCredits, setAiCredits,
    kanbanSelectedMilestoneId, setKanbanSelectedMilestoneId,
    // Actions
    reloadFeaturesAndTasks,
    refreshMembers,
  };
}
