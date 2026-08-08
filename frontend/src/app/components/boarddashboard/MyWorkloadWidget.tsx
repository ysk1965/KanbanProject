import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Undo2 } from "lucide-react";
import type { Feature, JobRole, Milestone } from "../../types";
import { lazyWithRetry } from "../../utils/lazyWithRetry";
import { checklistAPI, type BoardChecklistItemResponse } from "../../utils/api";
import { formatDate } from "../../utils/dateUtils";
import { parseDate } from "../../utils/workloadBar";
import type { BoardMember as ShareBoardMember } from "../ShareBoardModal";
import { DashboardEmpty, PanelBanner, PanelShell } from "./DashboardCard";
import { BacklogRail } from "./BacklogRail";
import { PlacementRail } from "./PlacementRail";
import {
  BACKLOG_COLLAPSED_HEIGHT,
  BACKLOG_HEIGHT_VAR,
  MIN_BACKLOG_HEIGHT,
  MIN_PLACEMENT_HEIGHT,
  MIN_QUEUE_HEIGHT,
  MIN_WORKLOAD_HEIGHT,
  SPLIT_HANDLE_SIZE,
  useBacklogSplit,
  useWorkloadSplit,
} from "./dashboardSplit";
import { SplitHandle } from "./SplitHandle";
import { requestAxisRefresh, useAxisTransfer } from "../../utils/axisTransfer";

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
  /**
   * placed        = 날짜가 잡혔다
   * timeblocked   = 날짜 + 타임블록까지 잡혔다 (되돌리기는 날짜만 되돌린다 — 그래서 문구가 다르다)
   * unscheduled   = 일정이 풀려 미배치로 내려갔다
   * untimeblocked = 타임블록에서 빠지며 일정도 풀렸다 (되돌려도 지워진 블록은 안 돌아온다)
   */
  kind: "placed" | "timeblocked" | "unscheduled" | "untimeblocked";
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
  /** 증가 시 간트·배치 레일이 함께 재조회 — 대시보드가 WS 신호와 축 리프레시를 합쳐 내린다 */
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
  /** 큐 바닥의 백로그 독을 그릴지 — 남의 대시보드에서는 개인 데이터라 아예 없다 */
  showBacklog: boolean;
  /** 보드에서 고른 마일스톤 — 백로그 승격 모달의 기본 필터 */
  selectedMilestoneId?: string | null;
  /** 승격 직후 보드 데이터를 다시 읽게 한다 */
  onRefreshAfterPromote?: () => void;
}

/**
 * 대시보드 오른쪽 열 — 카드 세 장을 세로로 쌓는다.
 *
 *   위     = 이번 주 워크로드 (일정 탭의 ScheduleResourceView). 이미 배치된 일.
 *   가운데 = 배치 대기 · 지연. 태스크는 됐지만 아직 날짜가 없는 일.
 *   아래   = 내 백로그. 아직 아무것도 아닌 일.
 *
 * 성숙도 순으로 내려간다: 간트(날짜 있음) → 배치 대기(태스크는 됨) → 백로그(아직 아무것도 아님).
 * 아래에서 위로 끌어 올리는 것이 곧 승격이고, 위에서 아래로 내리면 강등이다.
 *
 * 셋은 같은 셸(PanelShell)을 쓴다 — 예전에는 백로그가 배치 대기 카드 바닥에 붙은
 * 틴트 영역이라, 화면에 보이는 덩어리는 셋인데 카드 경계는 둘이었다.
 *
 * 높이 규칙 — 위와 아래가 각자 크기를 갖고, 가운데가 남는 만큼을 전부 가져간다
 * (늘 자리가 모자란 쪽이 배치 대기다). 두 크기 모두 손잡이로 조절하고 브라우저가 기억한다.
 *
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
  showBacklog,
  selectedMilestoneId,
  onRefreshAfterPromote,
}: MyWorkloadWidgetProps) {
  const { t } = useTranslation();

  // 두 카드가 같은 문구를 쓴다 — 멤버가 아니면 간트도 큐도 만들 수 없다
  const notMemberMessage = t(
    "boardDashboard.notBoardMember",
    "이 보드의 멤버로 등록되어 있지 않습니다.",
  );

  // 보고 있는 대상의 행만 남긴다 — 참조가 매 렌더 바뀌면 하위 뷰가 재조회하므로 메모한다
  const myMembers = useMemo(
    () => boardMembers.filter((m) => m.userId === userId),
    [boardMembers, userId],
  );

  // 남의 대시보드에서는 부모가 currentUserRole을 viewer로 낮춰 보낸다
  const canEdit = currentUserRole !== "viewer";

  const [notice, setNotice] = useState<PlacementNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  // 배치 후 다시 읽어야 할 곳은 여기 두 패널만이 아니다 — 왼쪽 타임블록도 같은 항목의
  // 마감으로 블록 색을 칠한다. 그래서 자체 카운터 대신 축 리프레시를 쏘고,
  // 대시보드가 그걸 받아 세 패널에 한 번에 내린다(refreshTrigger로 되돌아온다).
  const bumpRefresh = useCallback(() => requestAxisRefresh(), []);

  /*
    오른쪽 열은 카드 셋이 쌓인 스택이고, 배분은 전부 사용자 손에 있다.

      워크로드  ← 손잡이 ① 이 높이를 잡는다
      배치 대기 ← 남는 만큼 (늘 자리가 모자란 쪽)
      백로그    ← 손잡이 ② 이 높이를 잡는다 (아래를 잡으므로 방향이 뒤집힌다)

    두 손잡이는 서로의 값을 참조하지 않는다. ②의 기준 컨테이너가 "워크로드를 뺀
    나머지"라서, ①이 움직이면 그 높이가 변하고 ②의 상한이 저절로 따라온다.
  */
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);

  // 백로그가 없는 화면(남의 대시보드)·접힌 화면에서는 큐가 요구하는 하한도 달라진다
  const minQueueHeight = !showBacklog
    ? MIN_PLACEMENT_HEIGHT
    : backlogCollapsed
      ? MIN_PLACEMENT_HEIGHT + BACKLOG_COLLAPSED_HEIGHT
      : MIN_QUEUE_HEIGHT;

  const {
    containerRef: splitContainerRef,
    paneRef: workloadCardRef,
    size: workloadHeight,
    maxSize: maxWorkloadHeight,
    onPointerDown: onSplitPointerDown,
    onKeyDown: onSplitKeyDown,
    reset: resetSplit,
  } = useWorkloadSplit(minQueueHeight);

  const {
    containerRef: queueRef,
    size: backlogHeight,
    maxSize: maxBacklogHeight,
    onPointerDown: onBacklogPointerDown,
    onKeyDown: onBacklogKeyDown,
    reset: resetBacklogSplit,
  } = useBacklogSplit();

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
      noticeKind: "placed" | "timeblocked" = "placed",
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
          kind: noticeKind,
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
    async (
      item: {
        id: string;
        task_id: string;
        title?: string;
        start_date?: string | null;
        due_date?: string | null;
      },
      noticeKind: "unscheduled" | "untimeblocked" = "unscheduled",
    ) => {
      try {
        await checklistAPI.patchItem(boardId, item.task_id, item.id, {
          start_date: null,
          due_date: null,
        });
        setError(null);
        showNotice({
          kind: noticeKind,
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

  // 축 이동 수신 — 워크로드에서 나가는 건과 타임블록으로 꽂히는 건을 여기서 처리한다.
  // (백로그로 내리는 건 백로그 레일이 자기 목록까지 고쳐야 해서 그쪽이 받는다)
  useAxisTransfer((detail) => {
    if (!canEdit) return;
    if (!detail.item.task_id) return;

    // 타임블록에 놓였다 — 블록은 타임블록이 이미 만들었다. 우리는 날짜만 잡는다.
    // (이 이벤트가 왔다는 건 블록 생성이 성공했다는 뜻이다)
    //
    // 미배치 행(placement)과 간트 바(workload) 둘 다 여기로 온다. 바는 이미 날짜가 있지만
    // 놓은 날이 그 날이 아닐 수 있으므로 같은 규칙으로 다시 잡는다 —
    // placeItem이 시작일이 앞서면 기간을 살리고 마감만 옮긴다.
    if (
      (detail.from === "placement" || detail.from === "workload") &&
      detail.to === "timeblock" &&
      detail.targetDate
    ) {
      void placeItem(
        {
          id: detail.item.id,
          task_id: detail.item.task_id,
          title: detail.item.title,
          start_date: detail.item.start_date,
          due_date: detail.item.due_date,
        },
        detail.targetDate,
        undefined,
        "timeblocked",
      ).catch(() => {
        /* placeItem이 이미 안내를 띄운다 */
      });
      return;
    }

    if (detail.to !== "placement") return;
    if (detail.from !== "workload" && detail.from !== "timeblock") return;

    // 타임블록에서 내려온 건은 블록을 이미 타임블록이 지웠다 — 우리는 날짜만 푼다.
    // (되돌리기로도 블록은 안 돌아오므로 안내 문구가 다르다)
    void unscheduleItem(
      {
        id: detail.item.id,
        task_id: detail.item.task_id,
        title: detail.item.title,
        start_date: detail.item.start_date,
        due_date: detail.item.due_date,
      },
      detail.from === "timeblock" ? "untimeblocked" : "unscheduled",
    );
  });

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

  return (
    // gap 대신 손잡이가 두 카드 사이를 벌린다 (12px으로 예전 gap-3과 같은 간격이다)
    <div ref={splitContainerRef} className="h-full min-h-0 flex flex-col">
      {/*
        이번 주 워크로드 — 높이는 사용자가 손잡이로 정하고 브라우저가 기억한다.
        남는 세로 공간은 전부 아래 큐가 가져간다.
      */}
      <PanelShell
        dot="accent"
        title={
          scopeName
            ? t("boardDashboard.workloadTitleOf", "{{name}}의 워크로드", {
                name: scopeName,
              })
            : t("boardDashboard.workloadTitle", "내 워크로드")
        }
        linkLabel={t("boardDashboard.workloadLink", "리소스 뷰에서 열기")}
        onLinkClick={onOpenResourceView}
        banner={
          notice || error ? (
            <PanelBanner tone={error ? "error" : "info"}>
              {error ? (
                <p className="text-xs">{error}</p>
              ) : (
                <>
                  <p className="text-xs truncate">
                  {notice!.kind === "untimeblocked"
                    ? // 지워진 블록은 되돌리기로도 안 돌아온다 — 무엇이 돌아오는지만 말한다
                      t("boardDashboard.untimeblockedNotice", {
                        title: notice!.title,
                        defaultValue:
                          "「{{title}}」 타임블록에서 빠짐 · 되돌리면 날짜만 돌아옵니다",
                      })
                    : notice!.kind === "unscheduled"
                      ? t("boardDashboard.unscheduledNotice", {
                          title: notice!.title,
                          defaultValue:
                            "「{{title}}」 일정 해제됨 · 담당자와 체크리스트는 그대로입니다",
                        })
                      : notice!.kind === "timeblocked"
                        ? // 되돌리기는 날짜만 되돌린다 — 만들어진 타임블록은 남는다.
                          // 그래서 "배치됨"과 다른 문구로 무엇이 생겼는지 알린다.
                          //
                          // 날짜가 이미 있던 건(간트 바)은 되돌려도 "풀리는" 게 아니라
                          // 이전 날짜로 돌아간다 — 같은 동작이라도 결과가 달라 문구를 나눈다.
                          notice!.prevDueDate || notice!.prevStartDate
                          ? t("boardDashboard.timeblockMovedNotice", {
                              title: notice!.title,
                              date: formatDate(
                                parseDate(notice!.targetDate ?? ""),
                                "PPP",
                              ),
                              defaultValue:
                                "「{{title}}」 {{date}} 타임블록으로 옮김 · 되돌리면 날짜만 되돌아갑니다",
                            })
                          : t("boardDashboard.timeblockedNotice", {
                              title: notice!.title,
                              date: formatDate(
                                parseDate(notice!.targetDate ?? ""),
                                "PPP",
                              ),
                              defaultValue:
                                "「{{title}}」 {{date}} 타임블록에 배치됨 · 되돌리면 날짜만 풀립니다",
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
            </PanelBanner>
          ) : undefined
        }
        padded={false}
        bodyClassName="flex"
      >
        {myMembers.length === 0 ? (
          <DashboardEmpty message={notMemberMessage} />
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
                onDropChecklist={handleDropChecklist}
                onMilestoneClick={onMilestoneClick}
                onUpdateMilestoneDates={onUpdateMilestoneDates}
                onOpenContractorManager={onOpenContractorManager}
                embedded
                readOnly={!canEdit}
              />
            </Suspense>
          </div>
        )}
      </PanelShell>

      <SplitHandle
        orientation="horizontal"
        value={workloadHeight}
        min={MIN_WORKLOAD_HEIGHT}
        max={maxWorkloadHeight}
        label={t(
          "boardDashboard.splitWorkloadQueue",
          "워크로드와 배치 대기 높이 조절",
        )}
        onPointerDown={onSplitPointerDown}
        onKeyDown={onSplitKeyDown}
        onReset={resetSplit}
        className="flex"
      />

      {/*
        큐 스택 — 워크로드가 남긴 높이를 배치 대기와 백로그가 나눠 갖는다.
        이 노드가 손잡이 ②의 기준이자, 백로그 높이를 담는 CSS 변수의 주인이다.
      */}
      <div
        ref={queueRef}
        style={
          { [BACKLOG_HEIGHT_VAR]: `${backlogHeight}px` } as CSSProperties
        }
        className="flex-1 min-h-0 flex flex-col"
      >
        {myMembers.length === 0 ? (
          <section className="flex-1 min-h-0 bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
            <DashboardEmpty message={notMemberMessage} />
          </section>
        ) : (
          <>
            <PlacementRail
              boardId={boardId}
              userId={userId}
              milestones={milestones}
              refreshTrigger={refreshTrigger}
              canEdit={canEdit}
              onPlace={handleQuickPlace}
              onOpenTask={onViewTask}
              onOpenKanban={onOpenKanban}
            />

            {/* 남의 대시보드에서는 개인 데이터라 아예 렌더하지 않는다 — 읽기 전용이 아니라 부재다 */}
            {showBacklog && (
              <>
                {/* 접으면 잡을 칸이 없다 — 손잡이도 같이 사라진다 */}
                {!backlogCollapsed && (
                  <SplitHandle
                    orientation="horizontal"
                    value={backlogHeight}
                    min={MIN_BACKLOG_HEIGHT}
                    max={maxBacklogHeight}
                    label={t(
                      "boardDashboard.splitQueueBacklog",
                      "배치 대기와 백로그 높이 조절",
                    )}
                    onPointerDown={onBacklogPointerDown}
                    onKeyDown={onBacklogKeyDown}
                    onReset={resetBacklogSplit}
                    className="flex"
                  />
                )}

                {/*
                  높이를 들고 있는 건 부모다 — 카드 자신은 준 만큼을 쓴다.
                  접힌 동안에는 머리 한 줄만 남기고, 손잡이가 빠진 만큼 위로 붙인다.
                */}
                <div
                  className="flex-none min-h-0"
                  style={{
                    height: backlogCollapsed
                      ? BACKLOG_COLLAPSED_HEIGHT
                      : `var(${BACKLOG_HEIGHT_VAR})`,
                    marginTop: backlogCollapsed ? SPLIT_HANDLE_SIZE : undefined,
                  }}
                >
                  <BacklogRail
                    boardId={boardId}
                    userId={userId}
                    features={features}
                    milestones={milestones}
                    selectedMilestoneId={selectedMilestoneId}
                    onPromoted={onRefreshAfterPromote}
                    onCollapsedChange={setBacklogCollapsed}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
