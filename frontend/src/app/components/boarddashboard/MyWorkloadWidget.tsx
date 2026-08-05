import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2, Undo2 } from "lucide-react";
import type { Feature, JobRole, Milestone } from "../../types";
import { lazyWithRetry } from "../../utils/lazyWithRetry";
import { checklistAPI, type BoardChecklistItemResponse } from "../../utils/api";
import { formatDate } from "../../utils/dateUtils";
import { parseDate } from "../../utils/workloadBar";
import type { BoardMember as ShareBoardMember } from "../ShareBoardModal";
import { DashboardEmpty } from "./DashboardCard";
import { DASHBOARD_ROW_HEIGHT } from "./dashboardUtils";
import { PlacementRail } from "./PlacementRail";
import { useAxisRefresh, useAxisTransfer } from "../../utils/axisTransfer";

const ScheduleResourceView = lazyWithRetry(
  () =>
    import("../schedule/ScheduleResourceView").then((m) => ({
      default: m.ScheduleResourceView,
    })),
  "ScheduleResourceView",
);

/** 배치 안내를 띄워 두는 시간 (ms) */
const NOTICE_TTL = 8000;

const CONTRACTOR_PREFIX = "contractor:";

/** 이동 직후 되돌리기용으로 붙잡아 두는 이전 값 */
interface PlacementNotice {
  /** placed = 날짜가 잡혔다 / unscheduled = 일정이 풀려 미배치로 내려갔다 */
  kind: "placed" | "unscheduled";
  itemId: string;
  taskId: string;
  title: string;
  /** placed일 때만 — 어느 날에 놓였는지 */
  targetDate?: string;
  prevStartDate: string | null;
  prevDueDate: string | null;
}

interface MyWorkloadWidgetProps {
  boardId: string;
  /** 보드 전체 멤버 — 보고 있는 대상의 행만 남기고 걸러 쓴다 */
  boardMembers: ShareBoardMember[];
  /** 보고 있는 대상의 userId (기본은 나, 스코프 행에서 바뀐다) */
  userId: string | undefined;
  /** 다른 멤버를 보는 중일 때 그 이름 — 제목이 「○○의 워크로드」로 바뀐다 */
  scopeName?: string;
  milestones: Milestone[];
  taskMilestoneMap: Record<string, string | null>;
  memberColorMap: Record<string, string | null>;
  jobRoles: JobRole[];
  features: Feature[];
  refreshTrigger: number;
  /** 뷰어는 배치 레일의 드래그·빠른 배치를 쓸 수 없다 */
  currentUserRole?: string;
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
  /** 레일 링크: 칸반 뷰로 이동 */
  onOpenKanban: () => void;
}

/**
 * 내 워크로드 — 일정 탭의 ScheduleResourceView + 하단 배치 레일을 한 카드에 담는다.
 *
 * 위(간트)는 이미 배치된 일, 아래(레일)는 아직 자리가 없는 일이다.
 * 레일 카드를 내 행의 날짜 칸에 떨구면 그 날짜로 시작·마감이 잡히고 바가 생긴다.
 * 바 이동 · 기간 조절 · 빈 행 드래그로 업무 생성 · 특별일 등록 · 줌은 원본 그대로 동작한다.
 */
export function MyWorkloadWidget({
  boardId,
  boardMembers,
  userId,
  scopeName,
  milestones,
  taskMilestoneMap,
  memberColorMap,
  jobRoles,
  features,
  refreshTrigger,
  currentUserRole,
  onViewTask,
  onMilestoneClick,
  onUpdateMilestoneDates,
  onOpenContractorManager,
  onOpenResourceView,
  onOpenKanban,
}: MyWorkloadWidgetProps) {
  const { t } = useTranslation();

  // 보고 있는 대상의 행만 남긴다 — 참조가 매 렌더 바뀌면 하위 뷰가 재조회하므로 메모한다
  const myMembers = useMemo(
    () => boardMembers.filter((m) => m.userId === userId),
    [boardMembers, userId],
  );

  // 남의 대시보드에서는 부모가 currentUserRole을 viewer로 낮춰 보낸다
  const canEdit = currentUserRole !== "viewer";

  // 배치 후 간트·레일을 함께 다시 그리기 위한 자체 신호.
  // 부모의 notifyScheduleRefresh는 일정 탭에서만 올라가므로 여기서 따로 센다.
  const [refreshTick, setRefreshTick] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [notice, setNotice] = useState<PlacementNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const bumpRefresh = useCallback(() => setRefreshTick((v) => v + 1), []);

  const showNotice = useCallback((next: PlacementNotice) => {
    setNotice(next);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(
      () => setNotice(null),
      NOTICE_TTL,
    );
  }, []);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  // 실패 안내도 같은 시간만 띄운다
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), NOTICE_TTL);
    return () => window.clearTimeout(timer);
  }, [error]);

  /**
   * 항목을 특정 날짜에 배치한다.
   *
   * 시작일이 이미 있고 목표일보다 앞서면 기간을 살린 채 마감만 옮긴다(지연 건 리스케줄).
   * 그 밖에는 목표일 하루로 잡는다 — 일정 탭의 드롭과 같은 규칙이다.
   */
  const placeItem = useCallback(
    async (
      item: {
        id: string;
        task_id: string;
        start_date?: string | null;
        due_date?: string | null;
        title?: string;
      },
      targetDate: string,
      targetAssigneeId?: string,
    ) => {
      const keepStart =
        item.start_date && item.start_date <= targetDate
          ? item.start_date
          : targetDate;

      const isContractorRow =
        typeof targetAssigneeId === "string" &&
        targetAssigneeId.startsWith(CONTRACTOR_PREFIX);

      // 행을 지정하지 않은 빠른 배치는 담당자 키를 아예 보내지 않는다.
      // PATCH는 미전송 필드를 보존하므로 담당자가 유지된다(PUT은 해제해 버린다).
      const assignment = !targetAssigneeId
        ? {}
        : isContractorRow
          ? {
              assignee_id: null,
              contractor_id: targetAssigneeId.substring(
                CONTRACTOR_PREFIX.length,
              ),
            }
          : {
              assignee_id:
                targetAssigneeId === "__unassigned__" ? null : targetAssigneeId,
              contractor_id: null,
            };

      try {
        await checklistAPI.patchItem(boardId, item.task_id, item.id, {
          start_date: keepStart,
          due_date: targetDate,
          ...assignment,
        });
        setError(null);
        showNotice({
          kind: "placed",
          itemId: item.id,
          taskId: item.task_id,
          title: item.title ?? "",
          targetDate,
          prevStartDate: item.start_date ?? null,
          prevDueDate: item.due_date ?? null,
        });
      } catch (err) {
        console.warn("MyWorkloadWidget: failed to place item", err);
        setNotice(null);
        setError(t("boardDashboard.placeFailed", "배치하지 못했습니다."));
        throw err;
      } finally {
        bumpRefresh();
      }
    },
    [boardId, bumpRefresh, showNotice, t],
  );

  /**
   * 간트 바를 배치 레일로 끌어내렸을 때 — 시작·마감만 비운다.
   *
   * 담당자·마일스톤·체크리스트는 건드리지 않는다(PATCH라 미전송 필드는 보존된다).
   * "일정만 취소하고 싶다"가 이 동작의 전부이므로 확인 모달 없이 바로 하고
   * 되돌리기를 띄운다 — 잃는 건 날짜 두 개뿐이라 복구가 정확하다.
   */
  const unscheduleItem = useCallback(
    async (item: {
      id: string;
      task_id: string;
      title?: string;
      start_date?: string | null;
      due_date?: string | null;
    }) => {
      try {
        await checklistAPI.patchItem(boardId, item.task_id, item.id, {
          start_date: null,
          due_date: null,
        });
        setError(null);
        showNotice({
          kind: "unscheduled",
          itemId: item.id,
          taskId: item.task_id,
          title: item.title ?? "",
          prevStartDate: item.start_date ?? null,
          prevDueDate: item.due_date ?? null,
        });
      } catch (err) {
        console.warn("MyWorkloadWidget: failed to unschedule item", err);
        setNotice(null);
        setError(
          t("boardDashboard.unscheduleFailed", "일정을 해제하지 못했습니다."),
        );
      } finally {
        bumpRefresh();
      }
    },
    [boardId, bumpRefresh, showNotice, t],
  );

  // 축 이동 수신 — 워크로드에서 나가는 건만 여기서 처리한다.
  // (백로그로 내리는 건 백로그 레일이 자기 목록까지 고쳐야 해서 그쪽이 받는다)
  useAxisTransfer((detail) => {
    if (!canEdit) return;
    if (detail.from !== "workload" || detail.to !== "placement") return;
    if (!detail.item.task_id) return;
    void unscheduleItem({
      id: detail.item.id,
      task_id: detail.item.task_id,
      title: detail.item.title,
      start_date: detail.item.start_date,
      due_date: detail.item.due_date,
    });
  });

  // 다른 존이 내 항목을 가져갔으면(예: 백로그로 강등) 간트·레일을 다시 읽는다
  useAxisRefresh(bumpRefresh);

  const handleUndo = useCallback(async () => {
    if (!notice) return;
    setNotice(null);
    try {
      // 날짜만 되돌린다 — 담당자는 건드리지 않도록 PATCH를 쓴다
      await checklistAPI.patchItem(boardId, notice.taskId, notice.itemId, {
        start_date: notice.prevStartDate,
        due_date: notice.prevDueDate,
      });
      setError(null);
    } catch (err) {
      console.warn("MyWorkloadWidget: failed to undo placement", err);
      setError(t("boardDashboard.undoFailed", "되돌리지 못했습니다."));
    } finally {
      bumpRefresh();
    }
  }, [boardId, notice, bumpRefresh, t]);

  const handleQuickPlace = useCallback(
    (item: BoardChecklistItemResponse, targetDate: string) => {
      if (!item.task?.id) return Promise.resolve();
      return placeItem(
        {
          id: item.id,
          task_id: item.task.id,
          start_date: item.start_date,
          due_date: item.due_date,
          title: item.title,
        },
        targetDate,
      );
    },
    [placeItem],
  );

  const handleDropChecklist = useCallback(
    (
      item: {
        id: string;
        task_id: string;
        start_date?: string | null;
        due_date?: string | null;
        title?: string;
      },
      targetDate: string,
      targetAssigneeId: string,
    ) => {
      if (!canEdit || !item.task_id) return;
      void placeItem(item, targetDate, targetAssigneeId);
    },
    [canEdit, placeItem],
  );

  const childRefreshTrigger = refreshTrigger + refreshTick;

  return (
    <section
      className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden flex flex-col"
      style={{ height: DASHBOARD_ROW_HEIGHT }}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-foreground/[0.08] flex-none">
        <h2 className="text-xs md:text-sm font-bold text-foreground truncate">
          {scopeName
            ? t("boardDashboard.workloadTitleOf", "{{name}}의 워크로드", {
                name: scopeName,
              })
            : t("boardDashboard.workloadTitle", "내 워크로드")}
        </h2>
        {pendingCount > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
            {t("boardDashboard.pendingPlacement", {
              count: pendingCount,
              defaultValue: "미배치 {{count}}",
            })}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenResourceView}
          className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors"
        >
          {t("boardDashboard.workloadLink", "리소스 뷰에서 열기")}
          <ExternalLink size={12} aria-hidden="true" />
        </button>
      </header>

      {(notice || error) && (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-2 border-b border-foreground/[0.08] flex-none bg-foreground/[0.03]"
        >
          {error ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 truncate">
                {notice!.kind === "unscheduled"
                  ? t("boardDashboard.unscheduledNotice", {
                      title: notice!.title,
                      defaultValue:
                        "「{{title}}」 일정 해제됨 · 담당자와 체크리스트는 그대로입니다",
                    })
                  : t("boardDashboard.placedNotice", {
                      title: notice!.title,
                      // 로컬 Date로 넘긴다 — 문자열은 UTC로 해석돼 하루 어긋날 수 있다
                      date: formatDate(
                        parseDate(notice!.targetDate ?? ""),
                        "PPP",
                      ),
                      defaultValue: "「{{title}}」 {{date}}에 배치됨",
                    })}
              </p>
              <button
                type="button"
                onClick={handleUndo}
                className="ml-auto flex-none flex items-center gap-1 text-xs font-bold text-bridge-accent hover:underline"
              >
                <Undo2 size={12} aria-hidden="true" />
                {t("boardDashboard.undo", "되돌리기")}
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {myMembers.length === 0 ? (
          <DashboardEmpty
            message={t(
              "boardDashboard.notBoardMember",
              "이 보드의 멤버로 등록되어 있지 않습니다.",
            )}
          />
        ) : (
          <>
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
                  refreshTrigger={childRefreshTrigger}
                  onViewTask={async (taskId, checklistItemId) => {
                    onViewTask(taskId, checklistItemId);
                  }}
                  onDropChecklist={handleDropChecklist}
                  onMilestoneClick={onMilestoneClick}
                  onUpdateMilestoneDates={onUpdateMilestoneDates}
                  onOpenContractorManager={onOpenContractorManager}
                  embedded
                  readOnly={!canEdit}
                />
              </Suspense>
            </div>

            <PlacementRail
              boardId={boardId}
              userId={userId}
              milestones={milestones}
              refreshTrigger={childRefreshTrigger}
              canEdit={canEdit}
              onPlace={handleQuickPlace}
              onOpenTask={onViewTask}
              onOpenKanban={onOpenKanban}
              onPendingChange={setPendingCount}
            />
          </>
        )}
      </div>
    </section>
  );
}
