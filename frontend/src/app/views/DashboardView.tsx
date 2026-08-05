import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  BoardWebSocketEvent,
  Feature,
  JobRole,
  Milestone,
} from "../types";
import type { BoardMember as ShareBoardMember } from "../components/ShareBoardModal";
import { buildMilestoneColorMap } from "../utils/milestoneColor";
import { BacklogRail } from "../components/boarddashboard/BacklogRail";
import { DashboardScopeRow } from "../components/boarddashboard/DashboardScopeRow";
import { MyWorkloadWidget } from "../components/boarddashboard/MyWorkloadWidget";
import { TodayTimeblockWidget } from "../components/boarddashboard/TodayTimeblockWidget";

/** 대시보드 스코프 딥링크 파라미터 (?member= 는 칸반 담당자 필터가 이미 쓰고 있다) */
const SCOPE_PARAM = "scope";

interface DashboardViewProps {
  boardId: string;
  organizationId?: string;
  userId: string | undefined;
  milestones: Milestone[];
  /** 보드에서 고른 마일스톤 ("all" · "none" 포함) — 백로그 승격 모달의 기본 필터 */
  selectedMilestoneId?: string | null;
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
  /** 칸반 뷰로 전환 — 워크로드 배치 레일의 링크 */
  onOpenKanban: () => void;
  /** 일정 탭(타임블록)으로 전환 */
  onOpenSchedule: () => void;
  /** 일정 탭 리소스 뷰로 전환 */
  onOpenResourceView: () => void;
  /** 백로그 승격 직후 — 새로 생긴 태스크·블록이 타임블록·워크로드에 바로 보이게 한다 */
  onRefreshAfterPromote?: () => void;
}

/**
 * 보드 > 대시보드 — 개인 관점의 진입 화면.
 *
 * 레이아웃
 *  왼쪽 = 오늘의 타임블록 / 오른쪽 = 내 워크로드(간트 + 배치 레일)
 */
export function DashboardView({
  boardId,
  organizationId,
  userId,
  milestones,
  selectedMilestoneId,
  boardMembersData,
  memberColorMap,
  taskMilestoneMap,
  jobRoles,
  allFeatures,
  scheduleRefreshKey,
  scheduleRefreshPanel,
  wsChecklistEvent,
  currentUserRole,
  onViewFeatureById,
  onViewTaskWithChecklist,
  onNavigateToMeeting,
  onMilestoneClick,
  onUpdateMilestoneDates,
  onOpenContractorManager,
  onOpenKanban,
  onOpenSchedule,
  onOpenResourceView,
  onRefreshAfterPromote,
}: DashboardViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // 마일스톤 id → 색 (일정 탭과 같은 규칙으로 만들어 색 일관성 유지)
  const milestoneColorMap = useMemo(
    () => buildMilestoneColorMap(milestones),
    [milestones],
  );

  // 뷰어는 타임블록·워크로드에 열이 생기지 않으므로 선택 대상에서 뺀다
  const selectableMembers = useMemo(
    () => boardMembersData.filter((m) => m.role !== "viewer"),
    [boardMembersData],
  );

  // 보고 있는 대상. 기본은 나이고, ?scope=<userId> 딥링크로 열 수 있다.
  const [scopeUserId, setScopeUserId] = useState<string | undefined>(
    () => searchParams.get(SCOPE_PARAM) || undefined,
  );

  // 멤버 목록이 늦게 도착하므로, 도착한 뒤 유효하지 않은 스코프는 나로 되돌린다
  useEffect(() => {
    if (!selectableMembers.length) return;
    const valid =
      scopeUserId && selectableMembers.some((m) => m.userId === scopeUserId);
    if (!valid && scopeUserId !== userId) setScopeUserId(userId);
  }, [selectableMembers, scopeUserId, userId]);

  const isOtherScope = !!scopeUserId && scopeUserId !== userId;

  const handleScopeChange = useCallback(
    (nextUserId: string) => {
      setScopeUserId(nextUserId);
      const next = new URLSearchParams(searchParams);
      if (nextUserId === userId) next.delete(SCOPE_PARAM);
      else next.set(SCOPE_PARAM, nextUserId);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, userId],
  );

  const scopeMember = useMemo(
    () => selectableMembers.find((m) => m.userId === scopeUserId),
    [selectableMembers, scopeUserId],
  );

  // 남의 대시보드는 읽기 전용 — 기존 뷰어 게이팅을 그대로 재사용한다
  const effectiveRole = isOtherScope ? "viewer" : currentUserRole;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bridge-dark">
      {/* 혼자인 보드에서는 고를 대상이 없으므로 줄을 만들지 않는다 */}
      {selectableMembers.length > 1 && (
        <div className="flex-none pt-3">
          <DashboardScopeRow
            boardId={boardId}
            members={selectableMembers}
            myUserId={userId}
            scopeUserId={scopeUserId}
            onChange={handleScopeChange}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {/* 스코프 행이 없을 때는 원래대로 위 여백을 준다 */}
        <div
          className={`px-3 md:px-5 pb-3 md:pb-5 flex flex-col gap-3 ${
            selectableMembers.length > 1 ? "" : "pt-3 md:pt-5"
          }`}
        >
          {/* 타임블록 │ 워크로드 + 내 태스크 */}
          <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-3 items-start">
            <TodayTimeblockWidget
              boardId={boardId}
              organizationId={organizationId}
              boardMembers={boardMembersData}
              userId={scopeUserId}
              scopeName={isOtherScope ? scopeMember?.name : undefined}
              memberColorMap={memberColorMap}
              milestoneColorMap={milestoneColorMap}
              currentUserRole={effectiveRole}
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
                userId={scopeUserId}
                scopeName={isOtherScope ? scopeMember?.name : undefined}
                milestones={milestones}
                taskMilestoneMap={taskMilestoneMap}
                memberColorMap={memberColorMap}
                jobRoles={jobRoles}
                features={allFeatures}
                refreshTrigger={scheduleRefreshPanel}
                currentUserRole={effectiveRole}
                onViewTask={onViewTaskWithChecklist}
                onMilestoneClick={onMilestoneClick}
                onUpdateMilestoneDates={
                  isOtherScope ? undefined : onUpdateMilestoneDates
                }
                onOpenContractorManager={onOpenContractorManager}
                onOpenResourceView={onOpenResourceView}
                onOpenKanban={onOpenKanban}
              />
            </div>
          </div>

          {/*
            백로그 레일 — 대시보드 맨 아래 한 층.
            sticky로 붙여 스크롤 위치와 무관하게 항상 보이게 한다(안 보이는 백로그는 안 쓰인다).
            남의 대시보드를 보는 중이면 개인 데이터이므로 아예 렌더하지 않는다 —
            읽기 전용이 아니라 부재다.
          */}
          {!isOtherScope && (
            <div className="sticky bottom-0 z-10 pb-1 shadow-[0_-10px_26px_rgba(0,0,0,0.14)] rounded-2xl">
              <BacklogRail
                boardId={boardId}
                userId={userId}
                features={allFeatures}
                milestones={milestones}
                selectedMilestoneId={selectedMilestoneId}
                onPromoted={onRefreshAfterPromote}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
