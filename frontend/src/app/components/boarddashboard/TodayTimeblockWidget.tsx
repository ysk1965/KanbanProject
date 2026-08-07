import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import type { BoardWebSocketEvent } from "../../types";
import type { MilestoneColorMap } from "../../utils/milestoneColor";
import { DailyScheduleView } from "../DailyScheduleView";
import type { BoardMember as ShareBoardMember } from "../ShareBoardModal";
import { DashboardEmpty } from "./DashboardCard";

interface TodayTimeblockWidgetProps {
  boardId: string;
  organizationId?: string;
  /** 보드 전체 멤버 — 보고 있는 대상의 열만 남기고 걸러 쓴다 */
  boardMembers: ShareBoardMember[];
  /** 보고 있는 대상의 userId (기본은 나, 스코프 행에서 바뀐다) */
  userId: string | undefined;
  /** 다른 멤버를 보는 중일 때 그 이름 — 제목에 붙는다 */
  scopeName?: string;
  memberColorMap: Record<string, string | null>;
  milestoneColorMap: MilestoneColorMap;
  currentUserRole?: string;
  refreshTrigger: number;
  wsChecklistEvent: BoardWebSocketEvent | null;
  onViewFeature: (featureId: string) => void;
  onViewTask: (taskId: string, checklistItemId?: string) => void;
  onViewMeeting: (meetingId: string, date?: Date) => void;
  /** 헤더 링크: 일정 탭 타임블록으로 이동 */
  onOpenSchedule: () => void;
}

/**
 * 오늘의 타임블록 — 일정 탭의 DailyScheduleView를 그대로 임베드한다.
 *
 * 블록 생성(빈 곳 드래그) · 이동 · 시간 조절 · 분할 · 회의 오버레이 · 체크리스트 토글 등
 * 타임블록의 모든 동작이 원본 그대로 동작한다. 다른 점은 내 열만 보인다는 것뿐이다.
 */
export function TodayTimeblockWidget({
  boardId,
  organizationId,
  boardMembers,
  userId,
  scopeName,
  memberColorMap,
  milestoneColorMap,
  currentUserRole,
  refreshTrigger,
  wsChecklistEvent,
  onViewFeature,
  onViewTask,
  onViewMeeting,
  onOpenSchedule,
}: TodayTimeblockWidgetProps) {
  const { t } = useTranslation();

  // 보고 있는 대상의 열만 남긴다 — 참조가 매 렌더 바뀌면 하위 뷰가 재조회하므로 메모한다
  const myMembers = useMemo(
    () => boardMembers.filter((m) => m.userId === userId),
    [boardMembers, userId],
  );

  return (
    // 높이는 부모가 준 만큼 다 쓴다 — 하루가 안 들어오면 이 안에서만 스크롤한다
    <section className="h-full min-h-0 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-foreground/[0.08] flex-none">
        <h2 className="text-xs md:text-sm font-bold text-foreground truncate">
          {t("boardDashboard.timeblockTitle", "오늘의 타임블록")}
          {scopeName && (
            <span className="ml-1 font-normal text-slate-400">
              · {scopeName}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={onOpenSchedule}
          className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors"
        >
          {t("boardDashboard.timeblockLink", "주간 타임블록")}
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 min-h-0">
        {myMembers.length === 0 ? (
          <DashboardEmpty
            message={t(
              "boardDashboard.notBoardMember",
              "이 보드의 멤버로 등록되어 있지 않습니다.",
            )}
          />
        ) : (
          <DailyScheduleView
            boardId={boardId}
            boardMembers={myMembers}
            organizationId={organizationId}
            memberColorMap={memberColorMap}
            milestoneColorMap={milestoneColorMap}
            onViewFeature={onViewFeature}
            onViewTask={onViewTask}
            onViewMeeting={onViewMeeting}
            refreshTrigger={refreshTrigger}
            wsChecklistEvent={wsChecklistEvent}
            currentUserRole={currentUserRole}
            initialSubTab="timeblock"
            embedded
            hideDailyChecklist
            // 오른쪽 큐의 배치 레일이 같이 떠 있는 화면이라 블록을 되돌려 보낼 자리가 있다
            canUnplace
          />
        )}
      </div>
    </section>
  );
}
