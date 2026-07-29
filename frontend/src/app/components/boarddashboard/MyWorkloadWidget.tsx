import { Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2 } from "lucide-react";
import type { Feature, JobRole, Milestone } from "../../types";
import { lazyWithRetry } from "../../utils/lazyWithRetry";
import type { BoardMember as ShareBoardMember } from "../ShareBoardModal";
import { DashboardEmpty } from "./DashboardCard";

const ScheduleResourceView = lazyWithRetry(
  () =>
    import("../schedule/ScheduleResourceView").then((m) => ({
      default: m.ScheduleResourceView,
    })),
  "ScheduleResourceView",
);

/**
 * 헤더 + 마일스톤·이벤트 밴드 + 내 행이 들어가는 높이.
 * 같은 그리드 행의 타임블록 위젯(840)보다 낮아 페이지 높이는 늘지 않는다.
 */
const WIDGET_HEIGHT = 720;

interface MyWorkloadWidgetProps {
  boardId: string;
  /** 보드 전체 멤버 — 내 행만 남기고 걸러 쓴다 */
  boardMembers: ShareBoardMember[];
  userId: string | undefined;
  milestones: Milestone[];
  taskMilestoneMap: Record<string, string | null>;
  memberColorMap: Record<string, string | null>;
  jobRoles: JobRole[];
  features: Feature[];
  refreshTrigger: number;
  onViewTask: (taskId: string, checklistItemId?: string) => void;
  onMilestoneClick: (milestone: Milestone) => void;
  onUpdateMilestoneDates?: (
    id: string,
    start_date: string,
    end_date: string,
  ) => void | Promise<void>;
  onOpenContractorManager: () => void;
  /** 헤더 링크: 일정 탭 리소스 뷰로 이동 */
  onOpenResourceView: () => void;
}

/**
 * 내 워크로드 — 일정 탭의 ScheduleResourceView를 한 카드에 담는다.
 *
 * 바 이동 · 기간 조절 · 빈 행 드래그로 업무 생성 · 특별일 등록 · 줌은 원본 그대로 동작한다.
 */
export function MyWorkloadWidget({
  boardId,
  boardMembers,
  userId,
  milestones,
  taskMilestoneMap,
  memberColorMap,
  jobRoles,
  features,
  refreshTrigger,
  onViewTask,
  onMilestoneClick,
  onUpdateMilestoneDates,
  onOpenContractorManager,
  onOpenResourceView,
}: MyWorkloadWidgetProps) {
  const { t } = useTranslation();

  // 내 행만 남긴다 — 참조가 매 렌더 바뀌면 하위 뷰가 재조회하므로 메모한다
  const myMembers = useMemo(
    () => boardMembers.filter((m) => m.userId === userId),
    [boardMembers, userId],
  );

  return (
    <section
      className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden flex flex-col"
      style={{ height: WIDGET_HEIGHT }}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-foreground/[0.08] flex-none">
        <h2 className="text-xs md:text-sm font-bold text-foreground">
          {t("boardDashboard.workloadTitle", "내 워크로드")}
        </h2>
        <button
          type="button"
          onClick={onOpenResourceView}
          className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors"
        >
          {t("boardDashboard.workloadLink", "리소스 뷰에서 열기")}
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        {myMembers.length === 0 ? (
          <DashboardEmpty
            message={t(
              "boardDashboard.notBoardMember",
              "이 보드의 멤버로 등록되어 있지 않습니다.",
            )}
          />
        ) : (
          <div className="flex-1 min-h-0 min-w-0 flex">
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <Loader2
                    className="w-6 h-6 animate-spin text-bridge-accent"
                    aria-label={t("common.loading", "불러오는 중")}
                  />
                </div>
              }
            >
              <ScheduleResourceView
                boardId={boardId}
                boardMembers={myMembers}
                milestones={milestones}
                taskMilestoneMap={taskMilestoneMap}
                memberColorMap={memberColorMap}
                jobRoles={jobRoles}
                features={features}
                refreshTrigger={refreshTrigger}
                onViewTask={async (taskId, checklistItemId) => {
                  onViewTask(taskId, checklistItemId);
                }}
                onMilestoneClick={onMilestoneClick}
                onUpdateMilestoneDates={onUpdateMilestoneDates}
                onOpenContractorManager={onOpenContractorManager}
                embedded
              />
            </Suspense>
          </div>
        )}
      </div>
    </section>
  );
}
