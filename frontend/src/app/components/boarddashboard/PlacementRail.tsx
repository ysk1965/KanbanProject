import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Loader2,
} from "lucide-react";
import {
  boardChecklistAPI,
  type BoardChecklistItemResponse,
} from "../../utils/api";
import {
  getTodayDateString,
  getDDay,
  toDateInputValue,
} from "../../utils/dateUtils";
import { addDaysToDate } from "../../utils/workloadBar";

/** 드래그 페이로드 MIME — ScheduleResourceView.handleDrop이 읽는 키와 같아야 한다 */
export const PLACEMENT_DRAG_TYPE = "application/checklist-item";

type RailTab = "unplaced" | "overdue";

interface PlacementRailProps {
  boardId: string;
  userId: string | undefined;
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
  /** 미배치 건수 — 워크로드 헤더 배지용 */
  onPendingChange?: (count: number) => void;
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
 * 배치 레일 — 워크로드 간트에 아직 자리가 없는 내 항목들을 간트 아래 가로줄로 깔아 둔다.
 *
 * 간트 바는 체크리스트 항목 단위라 레일도 항목 단위로 담는다.
 * 카드를 내 행의 날짜 칸에 떨구면 그 날짜로 시작·마감이 잡히고 바가 생긴다.
 * 지연 탭은 "다시 배치할 것"이라 같은 동작으로 리스케줄된다.
 *
 * 세로 목록이 아닌 가로 레일인 이유: 항목이 늘어도 간트 높이를 잠식하지 않고,
 * 넘치는 만큼 옆으로만 밀린다.
 */
export function PlacementRail({
  boardId,
  userId,
  refreshTrigger,
  canEdit,
  onPlace,
  onOpenTask,
  onOpenKanban,
  onPendingChange,
}: PlacementRailProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();
  const storageKey = `placementRailOpen_${boardId}`;

  const [items, setItems] = useState<BoardChecklistItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<RailTab>("unplaced");
  // 오늘 생성분만 보기 — 레일이 길어졌을 때 새로 들어온 것만 추려 낸다
  const [onlyToday, setOnlyToday] = useState(false);
  // 빠른 배치 직후 서버 응답을 기다리는 동안 카드를 미리 감춘다
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(storageKey) !== "false";
  });
  const trackRef = useRef<HTMLDivElement | null>(null);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // 저장 실패는 접힘 상태만 잃을 뿐이라 무시한다
      }
      return next;
    });
  }, [storageKey]);

  useEffect(() => {
    if (!boardId || !userId) return;
    let cancelled = false;
    const savedScrollLeft = trackRef.current?.scrollLeft ?? 0;

    setIsLoading(true);
    boardChecklistAPI
      .getItems(boardId, { assignee_id: userId })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setHiddenIds(new Set());
        setError(null);
        // 배치로 카드가 빠져도 보던 위치가 튀지 않도록 되돌린다
        requestAnimationFrame(() => {
          if (trackRef.current) trackRef.current.scrollLeft = savedScrollLeft;
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
    const openItems = items.filter(
      (i) => !i.completed && !hiddenIds.has(i.id),
    );

    const unplacedList = openItems
      .filter(isUnplaced)
      .sort((a, b) => (a.task?.title ?? "").localeCompare(b.task?.title ?? ""));

    const overdueList = openItems
      .filter((i) => i.due_date && i.due_date < today)
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

    return { unplaced: unplacedList, overdue: overdueList };
  }, [items, hiddenIds, today]);

  useEffect(() => {
    onPendingChange?.(unplaced.length);
  }, [unplaced.length, onPendingChange]);

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

  const TABS: { key: RailTab; label: string; count: number; dot: string }[] = [
    {
      key: "unplaced",
      label: t("boardDashboard.railUnplaced", "미배치"),
      count: unplaced.length,
      dot: "bg-bridge-secondary",
    },
    {
      key: "overdue",
      label: t("boardDashboard.railOverdue", "지연"),
      count: overdue.length,
      dot: "bg-rose-500",
    },
  ];

  return (
    <div className="flex-none border-t border-foreground/[0.08]">
      <div
        className="flex items-center gap-1 px-3 py-2"
        role="tablist"
        aria-label={t("boardDashboard.railTabsLabel", "배치 대기 항목")}
      >
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`placement-rail-tab-${item.key}`}
              aria-selected={active}
              aria-controls="placement-rail-panel"
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                active
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${item.dot}`}
                aria-hidden="true"
              />
              {item.label}
              <span className="text-xs font-bold text-slate-500">
                {item.count}
              </span>
            </button>
          );
        })}

        {todayCount > 0 && (
          <button
            type="button"
            onClick={() => setOnlyToday((prev) => !prev)}
            aria-pressed={onlyToday}
            className={`flex-none flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-bold transition-colors ${
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
        )}

        <p className="ml-auto hidden md:block text-xs text-slate-600 truncate">
          {canEdit
            ? t("boardDashboard.railHint", "끌어서 내 행의 날짜에 놓으면 배치됩니다")
            : t("boardDashboard.railReadOnly", "읽기 전용")}
        </p>

        <button
          type="button"
          onClick={onOpenKanban}
          className="ml-auto md:ml-3 flex-none flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors"
        >
          {t("boardDashboard.myTasksLink", "칸반에서 보기")}
          <ExternalLink size={11} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={
            open
              ? t("boardDashboard.railCollapse", "배치 레일 접기")
              : t("boardDashboard.railExpand", "배치 레일 펼치기")
          }
          className="flex-none p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          {open ? (
            <ChevronDown size={14} aria-hidden="true" />
          ) : (
            <ChevronUp size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        id="placement-rail-panel"
        role="tabpanel"
        aria-labelledby={`placement-rail-tab-${tab}`}
        hidden={!open}
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
          <p className="text-xs text-slate-500 text-center py-6 px-3 leading-relaxed">
            {tab === "unplaced"
              ? t("boardDashboard.railAllPlaced", "모두 배치했습니다.")
              : t("boardDashboard.railNoOverdue", "지연된 항목이 없습니다.")}
          </p>
        ) : (
          <div
            ref={trackRef}
            className="flex items-stretch gap-2 px-3 pb-3 overflow-x-auto custom-scrollbar snap-x"
          >
            {list.map((item) => {
              const taskId = item.task?.id;
              const draggable = canEdit && !!taskId;
              const dday = getDDay(item.due_date);
              const isNew = isCreatedToday(item, today);

              return (
                <div
                  key={item.id}
                  draggable={draggable}
                  onDragStart={(e) => {
                    if (!draggable || !taskId) return;
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
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={`group flex-none w-[236px] snap-start bg-bridge-dark rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] p-2.5 flex flex-col gap-1 transition-colors ${
                    draggable ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    {draggable && (
                      <GripVertical
                        size={12}
                        className="text-slate-600 mt-0.5 flex-none"
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => taskId && onOpenTask(taskId, item.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      {(item.feature || isNew) && (
                        <div className="flex items-center gap-1 mb-1 min-w-0">
                          {item.feature && (
                            <span
                              className="text-xs font-bold px-1.5 py-0.5 rounded-full truncate"
                              style={{
                                backgroundColor: `${item.feature.color || "#6366F1"}26`,
                                color: item.feature.color || "#6366F1",
                              }}
                            >
                              {item.feature.title}
                            </span>
                          )}
                          {isNew && (
                            <span className="flex-none text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
                              {t("boardDashboard.railNew", "NEW")}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-slate-500 truncate">
                          {item.task?.title ??
                            t("boardDashboard.noBlock", "미분류")}
                        </span>
                        {tab === "overdue" && dday.text && (
                          <span className="ml-auto flex-none text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                            {dday.text}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1 mt-auto">
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
