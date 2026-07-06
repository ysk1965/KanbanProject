import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import {
  boardChecklistAPI,
  AssigneeItemResponse,
  AssigneeGroupResponse,
} from "../../utils/api";
import { getTodayDateString } from "../../utils/dateUtils";
import { getAssigneeHex, getInitials } from "../../utils/assigneeColor";
import {
  diffDays,
  addDaysToDate,
  parseDate,
  computeBarLanes,
  BarRange,
} from "../../utils/workloadBar";

interface MyWorkloadStripProps {
  boardId: string;
  /** 바를 그릴 담당자 (대개 현재 사용자) */
  assigneeId: string;
  /** 데일리 체크리스트를 추가하는 날 "yyyy-MM-dd" — window 기준 + 마커 */
  assignedDate: string;
  /** 모달에서 지금 선택 중인 항목 id (실시간 강조용) */
  selectedItemIds: Set<string>;
  /** 바 클릭 → 해당 항목 카드로 점프 (선택) */
  onBarClick?: (itemId: string) => void;
}

const VISIBLE_DAYS = 28; // 화면에 보이는 4주 (나머지는 가로 스크롤)
const FETCH_DAYS = 168; // 담당자 항목을 넉넉히 가져올 범위 (24주)
const BAR_H = 20;
const LANE_GAP = 4;
const TOP_OFFSET = 20; // 주 라벨 영역
const MIN_BAR_PX = 10;
const DEFAULT_FEATURE_COLOR = "#6366F1";

/** "yyyy-MM-dd" → "M/D" */
function shortLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface PlacedBar {
  item: AssigneeItemResponse;
  lane: number;
  startIdx: number;
  endIdx: number;
  color: string;
}

export function MyWorkloadStrip({
  boardId,
  assigneeId,
  assignedDate,
  selectedItemIds,
  onBarClick,
}: MyWorkloadStripProps) {
  const { t } = useTranslation();
  const storageKey = `workloadStripOpen_${boardId}`;

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(storageKey) !== "false";
  });
  const [items, setItems] = useState<AssigneeItemResponse[]>([]);
  const [assignee, setAssignee] = useState<
    AssigneeGroupResponse["assignee"] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const didInitScroll = useRef(false);

  // ─── window: assignedDate가 속한 주(일요일)의 1주 전부터 시작 ───
  const rangeStart = useMemo(() => {
    const weekday = parseDate(assignedDate).getDay(); // 0=Sun
    return addDaysToDate(assignedDate, -weekday - 7);
  }, [assignedDate]);
  const fetchEnd = useMemo(
    () => addDaysToDate(rangeStart, FETCH_DAYS - 1),
    [rangeStart],
  );

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  // ─── fetch: 마일스톤 필터와 무관하게 담당자의 전체 활성 항목 ───
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setHasError(false);
    didInitScroll.current = false;
    boardChecklistAPI
      .getItemsByAssignee(boardId, {
        start_date: rangeStart,
        end_date: fetchEnd,
      })
      .then((res) => {
        if (cancelled) return;
        const group = res.assignees.find((g) => g.assignee.id === assigneeId);
        setItems(group?.items ?? []);
        setAssignee(group?.assignee ?? null);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, assigneeId, rangeStart, fetchEnd]);

  // ─── 뷰포트 폭 측정 → dayWidth 계산 (4주가 보이는 폭에 맞춤) ───
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, isLoading]);

  const dayWidth = viewportWidth > 0 ? viewportWidth / VISIBLE_DAYS : 0;

  // ─── 바 배치 계산 (레인 제한 없음 — 전부 표시) ───
  const { placedBars, laneCount, maxEndIdx } = useMemo(() => {
    const dated = items.filter((it) => it.start_date || it.due_date);

    const ranges: BarRange[] = [];
    const meta = new Map<string, { startIdx: number; endIdx: number }>();
    let maxEnd = VISIBLE_DAYS - 1;
    for (const it of dated) {
      const start = it.start_date || it.due_date!;
      const end = it.due_date || it.start_date!;
      const startIdx = diffDays(rangeStart, start);
      const endIdx = diffDays(rangeStart, end);
      if (endIdx < 0) continue; // window 시작 이전이면 제외
      ranges.push({ id: it.id, startDayIndex: startIdx, endDayIndex: endIdx });
      meta.set(it.id, { startIdx, endIdx });
      maxEnd = Math.max(maxEnd, endIdx);
    }

    const lanes = computeBarLanes(ranges);
    const byId = new Map(dated.map((it) => [it.id, it]));

    const placed: PlacedBar[] = [];
    let maxLane = -1;
    for (const r of ranges) {
      const lane = lanes[r.id] ?? 0;
      maxLane = Math.max(maxLane, lane);
      const m = meta.get(r.id)!;
      const item = byId.get(r.id)!;
      placed.push({
        item,
        lane,
        startIdx: m.startIdx,
        endIdx: m.endIdx,
        color: item.feature?.color || DEFAULT_FEATURE_COLOR,
      });
    }

    return {
      placedBars: placed,
      laneCount: Math.max(maxLane + 1, 1),
      maxEndIdx: maxEnd,
    };
  }, [items, rangeStart]);

  // ─── 마커 위치(일 인덱스) ───
  const todayIdx = diffDays(rangeStart, getTodayDateString());
  const addIdx = diffDays(rangeStart, assignedDate);

  // ─── 콘텐츠 총 일수: 데이터에 딱 맞게 (필요할 때만 스크롤) ───
  const contentDays = Math.max(
    VISIBLE_DAYS,
    maxEndIdx + 3,
    addIdx + 3,
    todayIdx + 3,
  );
  const contentWidth = contentDays * dayWidth;
  const weekCount = Math.ceil(contentDays / 7);
  const trackHeight = TOP_OFFSET + laneCount * (BAR_H + LANE_GAP);

  // ─── 초기 스크롤: 추가일이 살짝 왼쪽에 오도록 ───
  useEffect(() => {
    if (didInitScroll.current) return;
    if (isLoading || dayWidth <= 0 || !scrollRef.current) return;
    const target = Math.max(0, (addIdx - 2) * dayWidth);
    scrollRef.current.scrollLeft = target;
    didInitScroll.current = true;
  }, [isLoading, dayWidth, addIdx]);

  // 에러 시 조용히 숨김 (모달 본문 흐름 방해 X)
  if (hasError) return null;

  const displayName = assignee?.name ?? "";
  const barCount = placedBars.length;

  return (
    <div className="px-6 pt-3">
      <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={toggleOpen}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-foreground/[0.03] transition-colors"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {assignee &&
              (assignee.profile_image ? (
                <img
                  src={assignee.profile_image}
                  alt={displayName}
                  className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: getAssigneeHex(displayName) }}
                >
                  {getInitials(displayName)}
                </div>
              ))}
            <span className="text-xs font-bold uppercase tracking-widest text-bridge-accent">
              {t("dailyChecklist.workloadTitle")}
            </span>
            {displayName && (
              <span className="text-xs text-slate-400 truncate">
                {displayName}
              </span>
            )}
            {!isLoading && barCount > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-foreground/5 text-slate-400 whitespace-nowrap">
                {t("dailyChecklist.workloadActive", { count: barCount })}
              </span>
            )}
          </div>
          <span className="text-slate-400 flex-shrink-0">
            {open ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </button>

        {/* Body */}
        {open && (
          <div className="px-4 pb-3 pt-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-16">
                <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
              </div>
            ) : barCount === 0 ? (
              <div className="flex items-center justify-center h-12 text-xs text-slate-500">
                {t("dailyChecklist.workloadEmpty")}
              </div>
            ) : (
              <>
                {/* 가로 스크롤 타임라인 */}
                <div
                  ref={scrollRef}
                  className="overflow-x-auto overflow-y-hidden custom-scrollbar"
                >
                  <div
                    className="relative"
                    style={{
                      width: contentWidth || "100%",
                      height: trackHeight,
                    }}
                  >
                    {/* 주 눈금 + 라벨 */}
                    {Array.from({ length: weekCount + 1 }).map((_, i) => {
                      const left = i * 7 * dayWidth;
                      if (left > contentWidth) return null;
                      const labelDate = addDaysToDate(rangeStart, i * 7);
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-l border-foreground/[0.06]"
                          style={{ left }}
                        >
                          <span className="absolute top-0 left-1 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                            {shortLabel(labelDate)}
                          </span>
                        </div>
                      );
                    })}

                    {/* 오늘 마커 */}
                    {todayIdx >= 0 && (
                      <div
                        className="absolute z-20"
                        style={{
                          left: todayIdx * dayWidth,
                          top: 16,
                          bottom: 0,
                        }}
                      >
                        <div className="absolute top-0 bottom-0 border-l-[1.5px] border-bridge-secondary" />
                        <span className="absolute -top-0 left-1 text-xs font-medium px-1.5 py-px rounded bg-bridge-secondary text-bridge-dark whitespace-nowrap">
                          {t("dailyChecklist.workloadToday")}
                        </span>
                      </div>
                    )}

                    {/* 추가일 마커 */}
                    {addIdx >= 0 && addIdx !== todayIdx && (
                      <div
                        className="absolute z-20"
                        style={{ left: addIdx * dayWidth, top: 16, bottom: 0 }}
                      >
                        <div className="absolute top-0 bottom-0 border-l-[1.5px] border-dashed border-bridge-accent" />
                        <span className="absolute -top-0 left-1 text-xs font-medium px-1.5 py-px rounded bg-bridge-accent text-white whitespace-nowrap">
                          {t("dailyChecklist.workloadAddDate")}
                        </span>
                      </div>
                    )}

                    {/* 바 */}
                    {placedBars.map((b) => {
                      const isSel = selectedItemIds.has(b.item.id);
                      const rawLeft = b.startIdx * dayWidth;
                      const rawRight = (b.endIdx + 1) * dayWidth;
                      const left = Math.max(0, rawLeft);
                      const width = Math.max(rawRight - left, MIN_BAR_PX);
                      const overflowLeft = b.startIdx < 0;
                      const top = TOP_OFFSET + b.lane * (BAR_H + LANE_GAP);
                      return (
                        <div
                          key={b.item.id}
                          title={`${b.item.title}${
                            b.item.feature ? ` · ${b.item.feature.title}` : ""
                          }`}
                          onClick={
                            onBarClick ? () => onBarClick(b.item.id) : undefined
                          }
                          className={`absolute flex items-center px-1.5 rounded-md text-xs text-white overflow-hidden whitespace-nowrap transition-shadow ${
                            onBarClick ? "cursor-pointer" : ""
                          } ${overflowLeft ? "rounded-l-none" : ""}`}
                          style={{
                            left,
                            width,
                            top,
                            height: BAR_H,
                            backgroundColor: b.color,
                            opacity: b.item.completed ? 0.5 : 1,
                            boxShadow: isSel
                              ? "inset 0 0 0 1px rgba(255,255,255,.18), 0 0 0 1.5px var(--bridge-dark, #191f2d), 0 0 0 3px #fff"
                              : "inset 0 0 0 1px rgba(255,255,255,.14)",
                          }}
                        >
                          {b.item.completed && (
                            <CheckCircle2 className="w-3 h-3 mr-1 flex-shrink-0" />
                          )}
                          <span className="truncate">{b.item.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <i className="inline-block w-0.5 h-3 bg-bridge-secondary" />
                    {t("dailyChecklist.workloadToday")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="inline-block w-0.5 h-3 bg-bridge-accent" />
                    {t("dailyChecklist.workloadAddDate")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="inline-block w-3 h-3 rounded-sm border border-white/70" />
                    {t("dailyChecklist.workloadSelected")}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
