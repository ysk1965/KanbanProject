import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Block, Feature, Task, Tag, Board, InviteLink, Subscription, ActivityLog, Milestone, BoardTierInfo, BoardLimits, ChecklistItem, AiCredits } from '../types';
import { BoardMember as ShareBoardMember, MemberRole } from '../components/ShareBoardModal';
import {
  boardService,
  featureService,
  taskService,
  checklistService,
  aiCreditService,
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
        setAllFeatures(fullData.features);
        setBoardMembersData(fullData.members.members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role.toLowerCase() as MemberRole,
          assigneeColor: m.assignee_color || null,
        })));

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

        // 체크리스트 배치 로드
        const taskIdsWithChecklist = finalTasks
          .filter((t: Task) => (t.checklist_total ?? 0) > 0)
          .map((t: Task) => t.id);

        if (taskIdsWithChecklist.length > 0) {
          try {
            const batchChecklistData = await checklistService.getBatchChecklists(boardId, taskIdsWithChecklist);
            setChecklistDataMap(parseChecklistBatch(batchChecklistData));
          } catch (error) {
            console.warn('Failed to load batch checklists:', error);
          }
        }

        // 스케줄 Task ID 로드
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

  // AI 크레딧 조회
  useEffect(() => {
    if (boardId) {
      aiCreditService.getCredits(boardId)
        .then(res => setAiCredits(res))
        .catch(() => {});
    }
  }, [boardId]);

  // 보드의 선택된 마일스톤 동기화
  useEffect(() => {
    if (board?.selected_milestone_id) {
      setKanbanSelectedMilestoneId(board.selected_milestone_id);
    } else {
      setKanbanSelectedMilestoneId('all');
    }
  }, [board?.selected_milestone_id]);

  // Feature와 Task를 milestoneId로 필터링해서 다시 로드
  const reloadFeaturesAndTasks = useCallback(async (milestoneId?: string) => {
    if (!boardId) return;
    try {
      const [featuresData, tasksData] = await Promise.all([
        featureService.getFeatures(boardId, milestoneId),
        taskService.getTasks(boardId, milestoneId ? { milestone_id: milestoneId } : undefined),
      ]);
      setFeatures(featuresData);
      setTasks(tasksData);

      const taskIdsWithChecklist = tasksData
        .filter((t: Task) => (t.checklist_total ?? 0) > 0)
        .map((t: Task) => t.id);

      if (taskIdsWithChecklist.length > 0) {
        try {
          const batchChecklistData = await checklistService.getBatchChecklists(boardId, taskIdsWithChecklist);
          setChecklistDataMap(parseChecklistBatch(batchChecklistData));
        } catch (error) {
          console.warn('Failed to load batch checklists:', error);
        }
      } else {
        setChecklistDataMap({});
      }

      try {
        const scheduledData = await scheduleAPI.getScheduledTaskIds(boardId);
        setScheduledTaskIds(new Set(scheduledData.task_ids));
      } catch (error) {
        console.warn('Failed to load scheduled task ids:', error);
      }
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
