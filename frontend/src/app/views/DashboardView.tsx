import { useMemo } from "react";
import type {
  BoardWebSocketEvent,
  Feature,
  JobRole,
  Milestone,
  Task,
} from "../types";
import type { BoardMember as ShareBoardMember } from "../components/ShareBoardModal";
import { buildMilestoneColorMap } from "../utils/milestoneColor";
import { MyWorkloadWidget } from "../components/boarddashboard/MyWorkloadWidget";
import { TodayTimeblockWidget } from "../components/boarddashboard/TodayTimeblockWidget";
import { DependencyWidget } from "../components/boarddashboard/DependencyWidget";
import { UpcomingWidget } from "../components/boarddashboard/UpcomingWidget";
import { MentionsWidget } from "../components/boarddashboard/MentionsWidget";

interface DashboardViewProps {
  boardId: string;
  organizationId?: string;
  userId: string | undefined;
  tasks: Task[];
  milestones: Milestone[];
  /** 임베드된 타임블록·워크로드에 그대로 넘기는 보드 컨텍스트 */
  boardMembersData: ShareBoardMember[];
  memberColorMap: Record<string, string | null>;
  taskMilestoneMap: Record<string, string | null>;
  jobRoles: JobRole[];
  allFeatures: Feature[];
  scheduleRefreshKey: number;
  scheduleRefreshPanel: number;
  wsChecklistEvent: BoardWebSocketEvent | null;
  currentUserRole?: string;
  onTaskClick: (task: Task) => void;
  onViewFeatureById: (featureId: string) => void;
  onViewTaskWithChecklist: (taskId: string, checklistItemId?: string) => void;
  onNavigateToMeeting: (date?: Date) => void;
  onMilestoneClick: (milestone?: Milestone) => void;
  onUpdateMilestoneDates?: (
    id: string,
    start_date: string,
    end_date: string,
  ) => void | Promise<void>;
  onOpenContractorManager: () => void;
  /** 일정 탭(타임블록)으로 전환 */
  onOpenSchedule: () => void;
  /** 일정 탭 리소스 뷰로 전환 */
  onOpenResourceView: () => void;
}

/**
 * 보드 > 대시보드 — 개인 관점의 진입 화면.
 *
 * 레이아웃
 *  A 왼쪽 = 오늘의 타임블록 / 오른쪽 = 내 워크로드(간트)
 *  B 의존성 · 다가오는 일정 · 나를 부른 것들
 */
export function DashboardView({
  boardId,
  organizationId,
  userId,
  tasks,
  milestones,
  boardMembersData,
  memberColorMap,
  taskMilestoneMap,
  jobRoles,
  allFeatures,
  scheduleRefreshKey,
  scheduleRefreshPanel,
  wsChecklistEvent,
  currentUserRole,
  onTaskClick,
  onViewFeatureById,
  onViewTaskWithChecklist,
  onNavigateToMeeting,
  onMilestoneClick,
  onUpdateMilestoneDates,
  onOpenContractorManager,
  onOpenSchedule,
  onOpenResourceView,
}: DashboardViewProps) {
  // 마일스톤 id → 색 (일정 탭과 같은 규칙으로 만들어 색 일관성 유지)
  const milestoneColorMap = useMemo(
    () => buildMilestoneColorMap(milestones),
    [milestones],
  );

  const handleOpenTaskById = useMemo(
    () => (taskId: string) => {
      const task = tasks.find((item) => item.id === taskId);
      if (task) onTaskClick(task);
    },
    [tasks, onTaskClick],
  );

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-bridge-dark">
      <div className="p-3 md:p-5 flex flex-col gap-3">
        {/* A. 타임블록 │ 워크로드 + 내 태스크 */}
        <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-3 items-start">
          <TodayTimeblockWidget
            boardId={boardId}
            organizationId={organizationId}
            boardMembers={boardMembersData}
            userId={userId}
            memberColorMap={memberColorMap}
            milestoneColorMap={milestoneColorMap}
            currentUserRole={currentUserRole}
            refreshTrigger={scheduleRefreshKey}
            wsChecklistEvent={wsChecklistEvent}
            onViewFeature={onViewFeatureById}
            onViewTask={onViewTaskWithChecklist}
            onViewMeeting={(_meetingId, date) => onNavigateToMeeting(date)}
            onOpenSchedule={onOpenSchedule}
          />

          <div className="flex flex-col gap-3 min-w-0">
            <MyWorkloadWidget
              boardId={boardId}
              boardMembers={boardMembersData}
              userId={userId}
              milestones={milestones}
              taskMilestoneMap={taskMilestoneMap}
              memberColorMap={memberColorMap}
              jobRoles={jobRoles}
              features={allFeatures}
              refreshTrigger={scheduleRefreshPanel}
              onViewTask={onViewTaskWithChecklist}
              onMilestoneClick={onMilestoneClick}
              onUpdateMilestoneDates={onUpdateMilestoneDates}
              onOpenContractorManager={onOpenContractorManager}
              onOpenResourceView={onOpenResourceView}
            />
          </div>
        </div>

        {/* B. 의존성 · 다가오는 일정 · 나를 부른 것들 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr] gap-3 items-start">
          <DependencyWidget
            boardId={boardId}
            tasks={tasks}
            userId={userId}
            onTaskClick={onTaskClick}
          />
          <UpcomingWidget
            boardId={boardId}
            milestones={milestones}
            tasks={tasks}
            userId={userId}
            onOpenSchedule={onOpenSchedule}
          />
          <MentionsWidget boardId={boardId} onOpenTask={handleOpenTaskById} />
        </div>
      </div>
    </div>
  );
}
