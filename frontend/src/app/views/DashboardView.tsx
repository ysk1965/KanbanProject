import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type {
  BoardWebSocketEvent,
  Feature,
  JobRole,
  Milestone,
} from "../types";
import type { BoardMember as ShareBoardMember } from "../components/ShareBoardModal";
import { buildMilestoneColorMap } from "../utils/milestoneColor";
import { DashboardScopeRow } from "../components/boarddashboard/DashboardScopeRow";
import { MyWorkloadWidget } from "../components/boarddashboard/MyWorkloadWidget";
import { TodayTimeblockWidget } from "../components/boarddashboard/TodayTimeblockWidget";
import { SplitHandle } from "../components/boarddashboard/SplitHandle";
import {
  MIN_TIMEBLOCK_WIDTH,
  TIMEBLOCK_WIDTH_VAR,
  useTimeblockColumnSplit,
} from "../components/boarddashboard/dashboardSplit";

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
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // 타임블록 │ 워크로드 좌우 배분 — 사용자가 정하고 브라우저가 기억한다.
  // xl 미만에서는 두 열이 한 줄로 접히므로 손잡이도 값도 쓰이지 않는다.
  const {
    containerRef: gridRef,
    size: timeblockWidth,
    maxSize: maxTimeblockWidth,
    onPointerDown: onColumnPointerDown,
    onKeyDown: onColumnKeyDown,
    reset: resetColumnSplit,
  } = useTimeblockColumnSplit();

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

      {/*
        xl 이상에서는 화면이 곧 레이아웃이다 — 페이지는 스크롤하지 않고,
        왼쪽 오늘이 뷰포트 높이를 그대로 쓰고 오른쪽은 워크로드가 필요한 만큼만
        가져간 뒤 나머지를 전부 큐가 받는다.

        xl 미만에서는 두 열이 한 줄로 접힌다. 이때는 화면 높이를 나눠 가질 수 없으므로
        각 블록에 높이를 주고 페이지 쪽이 스크롤한다 — 안 그러면 타임블록·간트처럼
        "부모가 준 높이를 채우는" 뷰가 0으로 무너진다.
      */}
      <div className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden custom-scrollbar">
        {/* 스코프 행이 없을 때는 원래대로 위 여백을 준다 */}
        <div
          className={`xl:h-full px-3 md:px-5 pb-3 md:pb-5 ${
            selectableMembers.length > 1 ? "" : "pt-3 md:pt-5"
          }`}
        >
          {/* 오늘 │ 워크로드 + 큐(바닥에 백로그 독) */}
          {/*
            왼쪽 폭은 CSS 변수로 들어간다 — 드래그 중에는 이 변수만 갈아 끼워
            리렌더 없이 폭이 따라오고, xl 미만의 한 줄 배치는 그대로 남는다.
          */}
          <div
            ref={gridRef}
            style={
              { [TIMEBLOCK_WIDTH_VAR]: `${timeblockWidth}px` } as CSSProperties
            }
            /* 변수명은 리터럴로 적는다 — Tailwind 스캐너가 문자열을 그대로 읽는다 */
            className="grid grid-cols-1 gap-3 xl:h-full xl:min-h-0 xl:gap-0
              xl:grid-cols-[var(--dash-timeblock-w)_auto_minmax(0,1fr)]"
          >
            <div className="h-[520px] xl:h-full min-h-0">
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
            </div>

            {/* 한 줄로 접히면 좌우가 없으므로 손잡이도 없다 */}
            <SplitHandle
              orientation="vertical"
              value={timeblockWidth}
              min={MIN_TIMEBLOCK_WIDTH}
              max={maxTimeblockWidth}
              label={t("boardDashboard.splitColumns", "타임블록 열 폭 조절")}
              onPointerDown={onColumnPointerDown}
              onKeyDown={onColumnKeyDown}
              onReset={resetColumnSplit}
              className="hidden xl:flex"
            />

            <div className="min-w-0 min-h-0 h-[640px] xl:h-full">
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
                showBacklog={!isOtherScope}
                selectedMilestoneId={selectedMilestoneId}
                onRefreshAfterPromote={onRefreshAfterPromote}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
