import {
  useCallback,
  useRef,
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import {
  Feature,
  Task,
  Block,
  ChecklistItem,
  JobRole,
  BoardWebSocketEvent,
} from "../types";
import {
  BoardMember as ShareBoardMember,
  MemberRole,
} from "../components/ShareBoardModal";
import { jobRoleService, memberService } from "../utils/services";

interface UseBoardWebSocketHandlersDeps {
  boardId: string | undefined;
  setFeatures: Dispatch<SetStateAction<Feature[]>>;
  setAllFeatures: Dispatch<SetStateAction<Feature[]>>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  setBlocks: Dispatch<SetStateAction<Block[]>>;
  setChecklistDataMap: Dispatch<
    SetStateAction<{ [taskId: string]: ChecklistItem[] }>
  >;
  setBoardMembersData: Dispatch<SetStateAction<ShareBoardMember[]>>;
  setJobRoles: Dispatch<SetStateAction<JobRole[]>>;
  setUnreadNotificationCount: Dispatch<SetStateAction<number>>;
  setWsChecklistEvent: Dispatch<SetStateAction<BoardWebSocketEvent | null>>;
  setWsCommentEvent: Dispatch<SetStateAction<BoardWebSocketEvent | null>>;
  setScheduleRefreshKey: Dispatch<SetStateAction<number>>;
  setMeetingRefreshKey: Dispatch<SetStateAction<number>>;
  setCascadeFeatureId: Dispatch<SetStateAction<string | null>>;
  notifyScheduleRefresh: () => void;
  reloadFeaturesAndTasks: (milestoneId?: string) => Promise<void>;
  reloadBlocksForMilestone: (overrideMilestoneId?: string) => Promise<void>;
  milestoneIdRef: MutableRefObject<string>;
  tasksRef: MutableRefObject<Task[]>;
}

/**
 * 보드 WebSocket 이벤트 → 상태 패치 핸들러.
 * deps는 매 렌더 ref로 갱신되어 핸들러가 항상 최신 setter/콜백을 사용한다
 * (반환 핸들러 자체는 stable — useBoardWebSocket 구독 안정성 유지).
 */
export function useBoardWebSocketHandlers(
  deps: UseBoardWebSocketHandlersDeps,
): (event: BoardWebSocketEvent) => void {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  return useCallback((event: BoardWebSocketEvent) => {
    const {
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
    } = depsRef.current;

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
      case "CHECKLIST_MOVED": {
        const {
          item: movedItem,
          source_task_id: moveSourceTaskId,
          target_task_id: moveTargetTaskId,
        } = data as {
          item: ChecklistItem;
          source_task_id: string;
          target_task_id: string;
        };
        setChecklistDataMap((prev) => {
          const sourceItems = (prev[moveSourceTaskId] || []).filter(
            (ci) => ci.id !== movedItem.id,
          );
          const targetItems = [
            ...(prev[moveTargetTaskId] || []).filter(
              (ci) => ci.id !== movedItem.id,
            ),
            movedItem,
          ];
          return {
            ...prev,
            [moveSourceTaskId]: sourceItems,
            [moveTargetTaskId]: targetItems,
          };
        });
        const moveDelta = movedItem.completed ? 1 : 0;
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id === moveSourceTaskId) {
              return {
                ...t,
                checklist_total: Math.max(0, (t.checklist_total || 0) - 1),
                checklist_completed: Math.max(
                  0,
                  (t.checklist_completed || 0) - moveDelta,
                ),
              };
            }
            if (t.id === moveTargetTaskId) {
              return {
                ...t,
                checklist_total: (t.checklist_total || 0) + 1,
                checklist_completed: (t.checklist_completed || 0) + moveDelta,
              };
            }
            return t;
          }),
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
        const cascadeTask = tasksRef.current.find((t) => t.id === toggleTaskId);
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
}
