import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BoardWebSocketEvent,
  Feature,
  JobRole,
  Milestone,
  Task,
} from "../types";
import type { BoardMember as ShareBoardMember } from "../components/ShareBoardModal";
import { buildMilestoneColorMap } from "../utils/milestoneColor";
import { scheduleAPI } from "../utils/api";
import { getTodayDateString, formatDate } from "../utils/dateUtils";
import { addDaysToDate, parseDate } from "../utils/workloadBar";
import { KpiStrip, KpiItem } from "../components/boarddashboard/KpiStrip";
import { MyWorkloadWidget } from "../components/boarddashboard/MyWorkloadWidget";
import { MyTaskBoardWidget } from "../components/boarddashboard/MyTaskBoardWidget";
import { TodayTimeblockWidget } from "../components/boarddashboard/TodayTimeblockWidget";
import { DependencyWidget } from "../components/boarddashboard/DependencyWidget";
import { UpcomingWidget } from "../components/boarddashboard/UpcomingWidget";
import { MentionsWidget } from "../components/boarddashboard/MentionsWidget";
import {
  isAssignedTo,
  resolveTaskBucket,
  timeToMinutes,
} from "../components/boarddashboard/dashboardUtils";

interface DashboardViewProps {
  boardId: string;
  organizationId?: string;
  userId: string | undefined;
  userName: string;
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
  /** 하루 근무시간 — 주간 목표 시간 계산용 (기본 8h × 5일) */
  workHoursPerDay?: number;
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
  /** 칸반 뷰로 전환 */
  onOpenKanban: () => void;
  /** 일정 탭(타임블록)으로 전환 */
  onOpenSchedule: () => void;
  /** 일정 탭 리소스 뷰로 전환 */
  onOpenResourceView: () => void;
}

/** 이번 주 월요일 yyyy-MM-dd */
function mondayOf(dateStr: string): string {
  const d = parseDate(dateStr);
  const dow = (d.getDay() + 6) % 7;
  return addDaysToDate(dateStr, -dow);
}

/**
 * 보드 > 대시보드 — 개인 관점의 진입 화면.
 *
 * 레이아웃
 *  A 인사 + KPI 5칸
 *  B 왼쪽 = 오늘의 타임블록 / 오른쪽 = 내 워크로드 + 내 태스크 보드
 *  C 의존성 · 다가오는 일정 · 나를 부른 것들
 */
export function DashboardView({
  boardId,
  organizationId,
  userId,
  userName,
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
  workHoursPerDay = 8,
  onTaskClick,
  onViewFeatureById,
  onViewTaskWithChecklist,
  onNavigateToMeeting,
  onMilestoneClick,
  onUpdateMilestoneDates,
  onOpenContractorManager,
  onOpenKanban,
  onOpenSchedule,
  onOpenResourceView,
}: DashboardViewProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();

  // 마일스톤 id → 색 (일정 탭과 같은 규칙으로 만들어 색 일관성 유지)
  const milestoneColorMap = useMemo(
    () => buildMilestoneColorMap(milestones),
    [milestones],
  );

  const weekStart = useMemo(() => mondayOf(today), [today]);
  const weekEnd = useMemo(() => addDaysToDate(weekStart, 6), [weekStart]);

  const [weekBlockMinutes, setWeekBlockMinutes] = useState<number | null>(null);

  // 이번 주 타임블록 배치 시간 (KPI 전용)
  useEffect(() => {
    if (!boardId || !userId) return;
    let cancelled = false;
    scheduleAPI
      .getWeeklySchedule(boardId, weekStart, weekEnd, [userId])
      .then((res) => {
        if (cancelled) return;
        let minutes = 0;
        for (const day of res.days ?? []) {
          const mine = day.columns.find((c) => c.user.id === userId);
          for (const b of mine?.blocks ?? []) {
            const s = timeToMinutes(b.start_time);
            const e = timeToMinutes(b.end_time);
            if (s != null && e != null && e > s) minutes += e - s;
          }
        }
        setWeekBlockMinutes(minutes);
      })
      .catch(() => {
        if (!cancelled) setWeekBlockMinutes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, userId, weekStart, weekEnd]);

  const kpis = useMemo<KpiItem[]>(() => {
    let assigned = 0;
    let done = 0;
    let overdue = 0;
    let dueThisWeek = 0;
    let doneThisWeek = 0;

    for (const task of tasks) {
      if (!isAssignedTo(task, userId)) continue;
      assigned += 1;

      if (task.completed) {
        done += 1;
        const completedDate = task.completed_at?.slice(0, 10);
        if (completedDate && completedDate >= weekStart && completedDate <= weekEnd) {
          doneThisWeek += 1;
        }
        continue;
      }

      if (resolveTaskBucket(task, today) === "overdue") overdue += 1;
      if (
        task.due_date &&
        task.due_date >= today &&
        task.due_date <= weekEnd
      ) {
        dueThisWeek += 1;
      }
    }

    const targetMinutes = workHoursPerDay * 5 * 60;
    const blockHours =
      weekBlockMinutes == null ? null : Math.round(weekBlockMinutes / 6) / 10;

    return [
      {
        key: "assigned",
        label: t("boardDashboard.kpiAssigned", "내 담당"),
        value: String(done),
        suffix: `/ ${assigned}`,
        percent: assigned > 0 ? (done / assigned) * 100 : 0,
        tone: "accent",
      },
      {
        key: "overdue",
        label: t("boardDashboard.kpiOverdue", "지연"),
        value: String(overdue),
        percent: overdue > 0 ? 100 : 0,
        tone: "danger",
      },
      {
        key: "dueWeek",
        label: t("boardDashboard.kpiDueThisWeek", "이번 주 마감"),
        value: String(dueThisWeek),
        percent: dueThisWeek > 0 ? 100 : 0,
        tone: "warn",
      },
      {
        key: "doneWeek",
        label: t("boardDashboard.kpiDoneThisWeek", "이번 주 완료"),
        value: String(doneThisWeek),
        percent: doneThisWeek > 0 ? Math.min(100, doneThisWeek * 12.5) : 0,
        tone: "ok",
      },
      {
        key: "timeblock",
        label: t("boardDashboard.kpiTimeblock", "이번 주 타임블록"),
        value: blockHours == null ? "–" : String(blockHours),
        suffix:
          blockHours == null ? undefined : `h / ${workHoursPerDay * 5}h`,
        percent:
          weekBlockMinutes == null || targetMinutes === 0
            ? 0
            : (weekBlockMinutes / targetMinutes) * 100,
        tone: "teal",
      },
    ];
  }, [tasks, userId, today, weekStart, weekEnd, weekBlockMinutes, workHoursPerDay, t]);

  // 로컬 Date를 넘긴다 — 문자열을 넘기면 formatDate가 UTC로 해석해 하루 어긋날 수 있다
  const dateLabel = useMemo(() => formatDate(parseDate(today), "PPPP"), [today]);

  // 오늘 걸쳐 있는 마일스톤을 맥락 한 줄로
  const contextLabel = useMemo(() => {
    const active = milestones.find(
      (ms) => ms.start_date <= today && ms.end_date >= today && !ms.is_default,
    );
    if (!active) return null;
    return active.title;
  }, [milestones, today]);

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
        {/* A. 인사 + KPI */}
        <KpiStrip
          userName={userName}
          dateLabel={dateLabel}
          contextLabel={contextLabel}
          items={kpis}
        />

        {/* B. 타임블록 │ 워크로드 + 내 태스크 */}
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
            <MyTaskBoardWidget
              tasks={tasks}
              userId={userId}
              onTaskClick={onTaskClick}
              onOpenKanban={onOpenKanban}
            />
          </div>
        </div>

        {/* C. 의존성 · 다가오는 일정 · 나를 부른 것들 */}
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
