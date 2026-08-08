import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownToLine, GripVertical, Loader2 } from "lucide-react";
import {
  PanelCount,
  PanelFooterHint,
  PanelShell,
  panelTabClass,
} from "./DashboardCard";
import {
  boardChecklistAPI,
  type BoardChecklistItemResponse,
} from "../../utils/api";
import type { Milestone } from "../../types";
import {
  getTodayDateString,
  getDDay,
  toDateInputValue,
} from "../../utils/dateUtils";
import {
  buildMilestoneColorMap,
  resolveMilestoneColor,
  withAlpha,
} from "../../utils/milestoneColor";
import { addDaysToDate } from "../../utils/workloadBar";
import {
  dispatchAxisDrop,
  endAxisDrag,
  requestTimeblockPlacement,
  setAxisDragData,
  setAxisDragGhost,
  useAxisDropZone,
  type AxisZone,
} from "../../utils/axisTransfer";

/** 드래그 페이로드 MIME — ScheduleResourceView.handleDrop이 읽는 키와 같아야 한다 */
export const PLACEMENT_DRAG_TYPE = "application/checklist-item";

/**
 * 이 레일이 받아 주는 출발지 — 위(간트 바·타임블록)와 아래(백로그) 양쪽.
 * 타임블록에서 내려오는 건은 블록까지 지워야 하므로 타임블록 쪽이 먼저 처리하고 알린다.
 */
const ACCEPTS: AxisZone[] = ["workload", "backlog", "timeblock"];

type RailTab = "unplaced" | "overdue";

interface PlacementRailProps {
  boardId: string;
  userId: string | undefined;
  /** 보드 마일스톤 — 배열 순서(시작일 오름차순)가 칩 색과 정렬 순서의 기준이다 */
  milestones: Milestone[];
  /** 증가 시 목록 재조회 — 배치 직후 부모가 올린다 */
  refreshTrigger: number;
  /** 뷰어는 드래그·빠른 배치 불가 */
  canEdit: boolean;
  /** 빠른 배치(오늘/내일) — 드래그를 못 쓰는 환경의 대체 경로 */
  onPlace: (
    item: BoardChecklistItemResponse,
    targetDate: string,
  ) => void | Promise<void>;
  onOpenTask: (taskId: string, checklistItemId?: string) => void;
  onOpenKanban: () => void;
}

/** 배치가 필요한 항목인지 — 시작·마감이 둘 다 없으면 간트에 놓일 자리가 없다 */
function isUnplaced(item: BoardChecklistItemResponse): boolean {
  return !(item.start_date || item.due_date);
}

/**
 * 오늘 만들어진 항목인지 — created_at은 UTC라 로컬 날짜로 바꿔 비교한다.
 * (문자열을 그대로 잘라 쓰면 자정 전후로 하루가 어긋난다)
 */
function isCreatedToday(
  item: BoardChecklistItemResponse,
  today: string,
): boolean {
  if (!item.created_at) return false;
  return toDateInputValue(item.created_at) === today;
}

/**
 * 배치 대기 — 워크로드 간트에 아직 자리가 없는 내 항목들. 오른쪽 열의 가운데 카드다.
 *
 * 위(워크로드)와 아래(백로그)가 각자 높이를 갖고, 이 카드가 남는 만큼을 전부 가져간다 —
 * 늘 자리가 모자란 쪽이 여기이기 때문이다.
 *
 * 간트 바는 체크리스트 항목 단위라 이 목록도 항목 단위로 담는다.
 * 행을 내 행의 날짜 칸에 떨구면 그 날짜로 시작·마감이 잡히고 바가 생긴다.
 * 지연 탭은 "다시 배치할 것"이라 같은 동작으로 리스케줄된다.
 *
 * 가로 카드가 아닌 세로 행인 이유: 큐 카드가 오른쪽 열 폭을 다 쓰므로
 * 236px 카드로는 한 번에 3건뿐이었다. 한 줄 행이면 같은 높이에 3~4배가 들어온다.
 */
export function PlacementRail({
  boardId,
  userId,
  milestones,
  refreshTrigger,
  canEdit,
  onPlace,
  onOpenTask,
  onOpenKanban,
}: PlacementRailProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();

  const [items, setItems] = useState<BoardChecklistItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RailTab>("unplaced");
  // 오늘 생성분만 보기 — 레일이 길어졌을 때 새로 들어온 것만 추려 낸다
  const [onlyToday, setOnlyToday] = useState(false);
  // 빠른 배치 직후 서버 응답을 기다리는 동안 카드를 미리 감춘다
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const trackRef = useRef<HTMLDivElement | null>(null);

  // 위(간트 바)·아래(백로그)에서 내려오거나 올라오는 항목을 받는다.
  // 실제 변경은 그 항목을 들고 있는 쪽(MyWorkloadWidget / BacklogRail)이 한다.
  const {
    active: dropActive,
    over: dropOver,
    zoneProps,
  } = useAxisDropZone({
    zone: "placement",
    accepts: ACCEPTS,
    disabled: !canEdit,
  });

  // 마일스톤 id → 색 (배열 순서 기준 — 간트·마인드맵과 같은 색이 나온다)
  const milestoneColorMap = useMemo(
    () => buildMilestoneColorMap(milestones),
    [milestones],
  );

  /**
   * 마일스톤 id → 정렬 순위. milestones는 시작일 오름차순이라 순위가 곧 시간 순이다.
   * 마일스톤이 없는 항목은 맨 뒤로 보낸다 (보드에서 사라진 마일스톤 참조는 그 바로 앞).
   */
  const milestoneRank = useMemo(() => {
    const map: Record<string, number> = {};
    milestones.forEach((m, i) => {
      map[m.id] = i;
    });
    return map;
  }, [milestones]);

  const rankOf = useCallback(
    (item: BoardChecklistItemResponse) => {
      if (!item.milestone) return Number.MAX_SAFE_INTEGER;
      return milestoneRank[item.milestone.id] ?? Number.MAX_SAFE_INTEGER - 1;
    },
    [milestoneRank],
  );

  useEffect(() => {
    if (!boardId || !userId) return;
    let cancelled = false;
    const savedScrollTop = trackRef.current?.scrollTop ?? 0;

    setIsLoading(true);
    boardChecklistAPI
      .getItems(boardId, { assignee_id: userId })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setHiddenIds(new Set());
        setError(null);
        // 배치로 행이 빠져도 보던 위치가 튀지 않도록 되돌린다
        requestAnimationFrame(() => {
          if (trackRef.current) trackRef.current.scrollTop = savedScrollTop;
        });
      })
      .catch(() => {
        if (!cancelled) setError(t("common.error", "불러오지 못했습니다"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boardId, userId, refreshTrigger, t]);

  const { unplaced, overdue } = useMemo(() => {
    const openItems = items.filter((i) => !i.completed && !hiddenIds.has(i.id));

    // 마일스톤 순(가까운 것 먼저) → 같은 마일스톤 안에서는 기존대로 태스크 제목순.
    // 먼 마일스톤에 미리 등록된 항목이 레일 앞을 차지하지 않게 하는 것이 목적이다.
    const unplacedList = openItems.filter(isUnplaced).sort((a, b) => {
      const diff = rankOf(a) - rankOf(b);
      if (diff !== 0) return diff;
      return (a.task?.title ?? "").localeCompare(b.task?.title ?? "");
    });

    // 지연 탭은 마일스톤보다 마감이 급하므로 날짜순을 유지한다
    const overdueList = openItems
      .filter((i) => i.due_date && i.due_date < today)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

    return { unplaced: unplacedList, overdue: overdueList };
  }, [items, hiddenIds, today, rankOf]);

  // 보고 있던 탭이 비면 남아 있는 쪽으로 옮겨 준다
  useEffect(() => {
    if (tab === "unplaced" && unplaced.length === 0 && overdue.length > 0) {
      setTab("overdue");
    } else if (
      tab === "overdue" &&
      overdue.length === 0 &&
      unplaced.length > 0
    ) {
      setTab("unplaced");
    }
  }, [tab, unplaced.length, overdue.length]);

  const handleQuickPlace = useCallback(
    (item: BoardChecklistItemResponse, targetDate: string) => {
      setHiddenIds((prev) => new Set(prev).add(item.id));
      Promise.resolve(onPlace(item, targetDate)).catch(() => {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      });
    },
    [onPlace],
  );

  const baseList = tab === "unplaced" ? unplaced : overdue;

  const todayCount = useMemo(
    () => baseList.filter((i) => isCreatedToday(i, today)).length,
    [baseList, today],
  );

  // 오늘 것이 하나도 없는 탭으로 옮겨 가면 필터를 풀어 준다 (빈 레일 방지)
  useEffect(() => {
    if (todayCount === 0 && onlyToday) setOnlyToday(false);
  }, [todayCount, onlyToday]);

  const list = onlyToday
    ? baseList.filter((i) => isCreatedToday(i, today))
    : baseList;

  const TABS: { key: RailTab; label: string; count: number }[] = [
    {
      key: "unplaced",
      label: t("boardDashboard.railUnplaced", "미배치"),
      count: unplaced.length,
    },
    {
      key: "overdue",
      label: t("boardDashboard.railOverdue", "지연"),
      count: overdue.length,
    },
  ];

  return (
    <PanelShell
      /* 단계 도트는 보고 있는 탭을 따른다 — 지연을 보는 동안에는 이 카드가 지연 카드다 */
      dot={tab === "overdue" ? "rose" : "amber"}
      title={t("boardDashboard.placementTitle", "배치 대기")}
      tabs={
        <div
          className="flex-none flex items-center gap-1"
          role="tablist"
          aria-label={t("boardDashboard.railTabsLabel", "배치 대기 항목")}
        >
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`placement-rail-tab-${item.key}`}
              aria-selected={tab === item.key}
              aria-controls="placement-rail-panel"
              onClick={() => setTab(item.key)}
              className={panelTabClass(tab === item.key)}
            >
              {item.label}
              {/* 지연은 쉬고 있을 때도 붉게 둔다 — 탭을 눌러 보게 만드는 건 이 숫자다 */}
              <PanelCount
                value={item.count}
                tone={
                  item.key === "overdue" && item.count > 0 ? "rose" : "muted"
                }
              />
            </button>
          ))}
        </div>
      }
      headerExtra={
        todayCount > 0 ? (
          <button
            type="button"
            onClick={() => setOnlyToday((prev) => !prev)}
            aria-pressed={onlyToday}
            className={`flex-none flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-bold transition-colors ${
              onlyToday
                ? "border-bridge-secondary/40 bg-bridge-secondary/15 text-bridge-secondary"
                : "border-foreground/10 text-slate-400 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full bg-bridge-secondary"
              aria-hidden="true"
            />
            {t("boardDashboard.railTodayCount", "오늘 {{count}}", {
              count: todayCount,
            })}
          </button>
        ) : undefined
      }
      linkLabel={t("boardDashboard.myTasksLink", "칸반에서 보기")}
      onLinkClick={onOpenKanban}
      /*
        힌트는 머리에서 내려온다. 머리 오른쪽은 링크 자리라 문구가 함께 서면
        둘 중 하나가 밀리고, 무엇보다 "여기에 놓으면"은 놓을 자리 옆에 있어야 읽힌다.
      */
      footer={
        <PanelFooterHint emphasized={dropActive}>
          {!canEdit
            ? t("boardDashboard.railReadOnly", "읽기 전용")
            : dropActive
              ? t(
                  "boardDashboard.railDropHint",
                  "여기에 놓으면 일정 없이 카드로 돌아옵니다",
                )
              : t(
                  "boardDashboard.railHint",
                  "끌어서 날짜 칸에 놓으면 배치 · 타임블록에 놓으면 그 시각까지",
                )}
        </PanelFooterHint>
      }
      padded={false}
      bodyClassName="flex flex-col"
      sectionProps={zoneProps}
      className="flex-1"
      overlayClassName={
        dropOver
          ? "bg-bridge-accent/[0.12] ring-2 ring-inset ring-bridge-accent"
          : dropActive
            ? "bg-bridge-accent/[0.05]"
            : undefined
      }
    >
      <div
        ref={trackRef}
        id="placement-rail-panel"
        role="tabpanel"
        aria-labelledby={`placement-rail-tab-${tab}`}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
      >
        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <Loader2
              className="w-5 h-5 animate-spin text-bridge-accent"
              aria-label={t("common.loading", "불러오는 중")}
            />
          </div>
        ) : error ? (
          <p className="text-xs text-slate-500 text-center py-6">{error}</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6 px-3.5 leading-relaxed">
            {tab === "unplaced"
              ? t("boardDashboard.railAllPlaced", "모두 배치했습니다.")
              : t("boardDashboard.railNoOverdue", "지연된 항목이 없습니다.")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {list.map((item) => {
              const taskId = item.task?.id;
              const draggable = canEdit && !!taskId;
              const dday = getDDay(item.due_date);
              const isNew = isCreatedToday(item, today);
              const milestone = item.milestone;
              const milestoneHex = milestone
                ? resolveMilestoneColor(milestone.id, milestoneColorMap).hex
                : null;

              return (
                <li
                  key={item.id}
                  draggable={draggable}
                  onDragStart={(e) => {
                    if (!draggable || !taskId) return;
                    // 「오늘」·「내일」·「백로그」를 누르려다 행이 끌려가지 않게 한다.
                    // 행 전체를 잡을 수 있어야 하므로(손잡이만 12px다) 버튼만 예외로 뺀다.
                    if ((e.target as HTMLElement).closest("button")) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData(
                      PLACEMENT_DRAG_TYPE,
                      JSON.stringify({
                        id: item.id,
                        task_id: taskId,
                        start_date: item.start_date,
                        due_date: item.due_date,
                        title: item.title,
                      }),
                    );
                    // 축 이동용 페이로드도 함께 싣는다 — 간트는 위의 기존 키를,
                    // 백로그 독은 이 키를 읽는다
                    setAxisDragData(e.dataTransfer, "placement", {
                      id: item.id,
                      task_id: taskId,
                      title: item.title,
                      start_date: item.start_date,
                      due_date: item.due_date,
                    });
                    // 잔상을 지정하지 않으면 이 행이 통째로 떠서 간트의 날짜 칸을 덮는다
                    setAxisDragGhost(e.dataTransfer, e.currentTarget, {
                      title: item.title,
                      accentHex: milestoneHex,
                    });
                  }}
                  onDragEnd={endAxisDrag}
                  className={`group flex items-center gap-2 px-3.5 py-1.5 border-b border-foreground/[0.06] hover:bg-foreground/[0.03] transition-colors ${
                    draggable ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                >
                  {draggable && (
                    <GripVertical
                      size={12}
                      className="flex-none text-slate-600"
                      aria-hidden="true"
                    />
                  )}

                  {/* 마일스톤이 1순위 단서 — 색은 간트·마인드맵과 같은 팔레트를 쓴다 */}
                  {milestone && milestoneHex ? (
                    <span
                      className="flex-none flex items-center gap-1 min-w-0 max-w-[7.5rem] text-xs font-bold pl-1.5 pr-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: withAlpha(milestoneHex, 0.15),
                        color: milestoneHex,
                      }}
                      title={milestone.title}
                    >
                      <span
                        className="flex-none w-1.5 h-1.5 rounded-[1px]"
                        style={{ backgroundColor: milestoneHex }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{milestone.title}</span>
                    </span>
                  ) : (
                    <span className="flex-none flex items-center gap-1 min-w-0 max-w-[7.5rem] text-xs font-bold pl-1.5 pr-2 py-0.5 rounded-full bg-foreground/[0.06] text-slate-500">
                      <span
                        className="flex-none w-1.5 h-1.5 rounded-[1px] bg-slate-600"
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {t("boardDashboard.railNoMilestone", "마일스톤 없음")}
                      </span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => taskId && onOpenTask(taskId, item.id)}
                    title={item.title}
                    className="flex-1 min-w-0 text-left text-xs font-medium text-foreground truncate"
                  >
                    {item.title}
                  </button>

                  {isNew && (
                    <span className="flex-none text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
                      {t("boardDashboard.railNew", "NEW")}
                    </span>
                  )}

                  {tab === "overdue" && dday.text && (
                    <span className="flex-none text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                      {dday.text}
                    </span>
                  )}

                  {/* 어느 태스크에 붙은 항목인지 — 좁은 폭에서는 제목에 자리를 내준다 */}
                  <span className="hidden lg:block flex-none max-w-[10rem] text-xs text-slate-500 truncate">
                    {item.task?.title ?? t("boardDashboard.noBlock", "미분류")}
                  </span>

                  {canEdit && (
                    <span className="flex-none flex items-center gap-1">
                      {/* 드래그를 못 쓰는 환경(터치·키보드)의 타임블록 경로.
                          시각은 타임블록이 정하고, 실패하면 그쪽이 안내한다 */}
                      {taskId && (
                        <button
                          type="button"
                          onClick={() =>
                            requestTimeblockPlacement({
                              id: item.id,
                              task_id: taskId,
                              title: item.title,
                              start_date: item.start_date,
                              due_date: item.due_date,
                              assignee_id: item.assignee?.id ?? null,
                            })
                          }
                          title={t(
                            "boardDashboard.railNowTitle",
                            "지금 시각부터 타임블록에 넣기",
                          )}
                          className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        >
                          {t("boardDashboard.railNow", "지금")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleQuickPlace(item, today)}
                        className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        {t("boardDashboard.railToday", "오늘")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickPlace(item, addDaysToDate(today, 1))
                        }
                        className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        {t("boardDashboard.railTomorrow", "내일")}
                      </button>
                      {/* 드래그를 못 쓰는 환경(터치·키보드)의 하향 경로.
                          드래그와 같은 이벤트를 쏘므로 처리도 한 곳에서 끝난다 */}
                      {taskId && (
                        <button
                          type="button"
                          onClick={() =>
                            dispatchAxisDrop({
                              from: "placement",
                              to: "backlog",
                              item: {
                                id: item.id,
                                task_id: taskId,
                                title: item.title,
                                start_date: item.start_date,
                                due_date: item.due_date,
                              },
                            })
                          }
                          aria-label={t(
                            "boardDashboard.railToBacklogAria",
                            "백로그로 내리기",
                          )}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <ArrowDownToLine size={11} aria-hidden="true" />
                          {t("boardDashboard.railToBacklog", "백로그")}
                        </button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}
