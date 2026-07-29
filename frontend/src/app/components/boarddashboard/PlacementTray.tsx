import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, GripVertical, Loader2 } from "lucide-react";
import {
  boardChecklistAPI,
  type BoardChecklistItemResponse,
} from "../../utils/api";
import { getTodayDateString, getDDay } from "../../utils/dateUtils";
import { addDaysToDate } from "../../utils/workloadBar";

/** 드래그 페이로드 MIME — ScheduleResourceView.handleDrop이 읽는 키와 같아야 한다 */
export const PLACEMENT_DRAG_TYPE = "application/checklist-item";

type TrayTab = "unplaced" | "overdue";

interface PlacementTrayProps {
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
 * 배치 인박스 — 워크로드 간트에 아직 자리가 없는 내 항목들.
 *
 * 간트 바는 체크리스트 항목 단위라 트레이도 항목 단위로 담는다.
 * 카드를 내 행의 날짜 칸에 떨구면 그 날짜로 시작·마감이 잡히고 바가 생긴다.
 * 지연 탭은 "다시 배치할 것"이라 같은 동작으로 리스케줄된다.
 */
export function PlacementTray({
  boardId,
  userId,
  refreshTrigger,
  canEdit,
  onPlace,
  onOpenTask,
  onOpenKanban,
  onPendingChange,
}: PlacementTrayProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();

  const [items, setItems] = useState<BoardChecklistItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TrayTab>("unplaced");
  // 빠른 배치 직후 서버 응답을 기다리는 동안 카드를 미리 감춘다
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!boardId || !userId) return;
    let cancelled = false;
    const savedScrollTop = scrollRef.current?.scrollTop ?? 0;

    setIsLoading(true);
    boardChecklistAPI
      .getItems(boardId, { assignee_id: userId })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setHiddenIds(new Set());
        setError(null);
        // 배치로 항목이 빠져도 화면이 튀지 않도록 스크롤 위치를 되돌린다
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop;
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
    const open = items.filter((i) => !i.completed && !hiddenIds.has(i.id));

    const unplacedList = open
      .filter(isUnplaced)
      .sort((a, b) =>
        (a.task?.title ?? "").localeCompare(b.task?.title ?? ""),
      );

    const overdueList = open
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
    } else if (tab === "overdue" && overdue.length === 0 && unplaced.length > 0) {
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

  const list = tab === "unplaced" ? unplaced : overdue;

  const TABS: { key: TrayTab; label: string; count: number; dot: string }[] = [
    {
      key: "unplaced",
      label: t("boardDashboard.trayUnplaced", "미배치"),
      count: unplaced.length,
      dot: "bg-bridge-secondary",
    },
    {
      key: "overdue",
      label: t("boardDashboard.trayOverdue", "지연"),
      count: overdue.length,
      dot: "bg-rose-500",
    },
  ];

  return (
    <div className="flex flex-col min-h-0 h-full border-t lg:border-t-0 lg:border-l border-foreground/[0.08]">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-foreground/[0.08] flex-none">
        {TABS.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                active
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
              {item.label}
              <span className="text-xs font-bold text-slate-500">
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1.5"
      >
        {isLoading && items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2
              className="w-5 h-5 animate-spin text-bridge-accent"
              aria-label={t("common.loading", "불러오는 중")}
            />
          </div>
        ) : error ? (
          <p className="text-xs text-slate-500 text-center py-6">{error}</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6 px-2 leading-relaxed">
            {tab === "unplaced"
              ? t("boardDashboard.trayAllPlaced", "모두 배치했습니다.")
              : t("boardDashboard.trayNoOverdue", "지연된 항목이 없습니다.")}
          </p>
        ) : (
          list.map((item) => {
            const taskId = item.task?.id;
            const draggable = canEdit && !!taskId;
            const dday = getDDay(item.due_date);

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
                className={`group bg-bridge-dark rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] p-2 transition-colors ${
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
                    {item.feature && (
                      <span
                        className="inline-block text-xs font-bold px-1.5 py-0.5 rounded-full mb-1"
                        style={{
                          backgroundColor: `${item.feature.color || "#6366F1"}26`,
                          color: item.feature.color || "#6366F1",
                        }}
                      >
                        {item.feature.title}
                      </span>
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
                  <div className="flex items-center gap-1 mt-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickPlace(item, today)}
                      className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      {t("boardDashboard.trayToday", "오늘")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickPlace(item, addDaysToDate(today, 1))
                      }
                      className="px-2 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      {t("boardDashboard.trayTomorrow", "내일")}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex-none px-3 py-2 border-t border-foreground/[0.08] flex items-center gap-2">
        <p className="text-xs text-slate-600 leading-tight">
          {canEdit
            ? t("boardDashboard.trayHint", "끌어서 날짜에 놓으면 배치됩니다")
            : t("boardDashboard.trayReadOnly", "읽기 전용")}
        </p>
        <button
          type="button"
          onClick={onOpenKanban}
          className="ml-auto flex-none flex items-center gap-1 text-xs text-slate-400 hover:text-foreground transition-colors"
        >
          {t("boardDashboard.myTasksLink", "칸반에서 보기")}
          <ExternalLink size={11} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
