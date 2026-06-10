import { Suspense, useState } from "react";
import {
  Milestone,
  JobRole,
  JobRoleInfo,
  BoardWebSocketEvent,
} from "../types";
import { DailyScheduleView } from "../components/DailyScheduleView";
import { ScheduleSubTab } from "../components/ScheduleSubTabBar";
import { BoardMember as ShareBoardMember } from "../components/ShareBoardModal";
import { checklistAPI } from "../utils/api";
import { lazyWithRetry } from "../utils/lazyWithRetry";
import type { PanelDragState } from "../components/schedule/ChecklistItemPanel";

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

interface TaskPickerItem {
  taskId: string;
  taskTitle: string;
  featureId: string;
  featureTitle: string;
  featureColor: string;
}

interface ScheduleViewProps {
  boardId: string;
  scheduleSubTab: ScheduleSubTab;
  organizationId?: string;
  boardMembersData: ShareBoardMember[];
  memberColorMap: Record<string, string | null>;
  jobRoles: JobRole[];
  memberJobRoleMap: Record<string, JobRoleInfo | null>;
  milestones: Milestone[];
  taskPickerList: TaskPickerItem[];
  scheduleRefreshKey: number;
  scheduleRefreshPanel: number;
  wsChecklistEvent: BoardWebSocketEvent | null;
  currentUserRole?: string;
  urlTab: string | null;
  notifyScheduleRefresh: () => void;
  onViewFeatureById: (featureId: string) => void;
  onNavigateToMeeting: (date?: Date) => void;
  onViewTaskWithChecklist: (taskId: string, checklistItemId?: string) => void;
  onViewTaskById: (taskId: string) => void;
  onItemDetailClick: (item: { task: { id: string } | null }) => void;
  onOpenContractorManager: () => void;
  onMilestoneClick: (milestone?: Milestone) => void;
}

// 일정 뷰 (타임블록 / 캘린더 / 워크로드) — 패널 DnD 상태를 자체 소유
export function ScheduleView({
  boardId,
  scheduleSubTab,
  organizationId,
  boardMembersData,
  memberColorMap,
  jobRoles,
  memberJobRoleMap,
  milestones,
  taskPickerList,
  scheduleRefreshKey,
  scheduleRefreshPanel,
  wsChecklistEvent,
  currentUserRole,
  urlTab,
  notifyScheduleRefresh,
  onViewFeatureById,
  onNavigateToMeeting,
  onViewTaskWithChecklist,
  onViewTaskById,
  onItemDetailClick,
  onOpenContractorManager,
  onMilestoneClick,
}: ScheduleViewProps) {
  // ChecklistItemPanel drag state (calendar/resource DnD integration)
  const [panelDragState, setPanelDragState] = useState<PanelDragState | null>(
    null,
  );
  const [scrollToItem, setScrollToItem] = useState<{
    id: string;
    ts: number;
  } | null>(null);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {scheduleSubTab === "timeblock" ? (
        <DailyScheduleView
          boardId={boardId}
          boardMembers={boardMembersData}
          organizationId={organizationId}
          memberColorMap={memberColorMap}
          onViewFeature={onViewFeatureById}
          onViewMeeting={(_meetingId, date) => {
            onNavigateToMeeting(date);
          }}
          onViewTask={async (taskId, checklistItemId) => {
            onViewTaskWithChecklist(taskId, checklistItemId);
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
              boardId={boardId}
              boardMembers={boardMembersData}
              memberColorMap={memberColorMap}
              jobRoles={jobRoles}
              onViewTask={async (taskId) => {
                onViewTaskById(taskId);
              }}
              onDropChecklist={async (item, targetDate) => {
                if (item.task?.id) {
                  try {
                    await checklistAPI.updateItem(
                      boardId,
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
              boardId={boardId}
              onDragStateChange={setPanelDragState}
              onItemDetailClick={onItemDetailClick}
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
              boardId={boardId}
              boardMembers={boardMembersData}
              milestones={milestones}
              memberColorMap={memberColorMap}
              jobRoles={jobRoles}
              onOpenContractorManager={onOpenContractorManager}
              onViewTask={async (taskId) => {
                onViewTaskById(taskId);
              }}
              onDropChecklist={async (item, targetDate, targetAssigneeId) => {
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
                      boardId,
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
              onMilestoneClick={onMilestoneClick}
              scrollToItem={scrollToItem}
              tasks={taskPickerList}
            />
          </Suspense>
          <Suspense fallback={null}>
            <ChecklistItemPanel
              key={scheduleRefreshPanel}
              boardId={boardId}
              onDragStateChange={setPanelDragState}
              onItemDetailClick={onItemDetailClick}
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
  );
}
