import { useState, useEffect, useMemo, useCallback } from "react";
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
  /** 데일리 체크리스트를 추가하는 날 "yyyy-MM-dd" — window 중심 + 마커 */
  assignedDate: string;
  /** 모달에서 지금 선택 중인 항목 id (실시간 강조용) */
  selectedItemIds: Set<string>;
  /** 바 클릭 → 해당 항목 카드로 점프 (선택) */
  onBarClick?: (itemId: string) => void;
}

const TOTAL_DAYS = 42; // 6주
const WEEKS = 6;
const MAX_LANES = 3;
const BAR_H = 20;
const LANE_GAP = 4;
const DEFAULT_FEATURE_COLOR = "#6366F1";

/** "yyyy-MM-dd" → "M/D" */
function shortLabel(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface PlacedBar {
  item: AssigneeItemResponse;
  lane: number;
  leftPct: number;
  widthPct: number;
  overflowLeft: boolean;
  overflowRight: boolean;
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

  // ─── window: assignedDate가 속한 주(일요일 시작)의 1주 전부터 6주 ───
  const rangeStart = useMemo(() => {
    const weekday = parseDate(assignedDate).getDay(); // 0=Sun
    return addDaysToDate(assignedDate, -weekday - 7);
  }, [assignedDate]);
  const rangeEnd = useMemo(
    () => addDaysToDate(rangeStart, TOTAL_DAYS - 1),
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
    boardChecklistAPI
      .getItemsByAssignee(boardId, {
        start_date: rangeStart,
        end_date: rangeEnd,
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
  }, [boardId, assigneeId, rangeStart, rangeEnd]);

  // ─── 바 배치 계산 ───
  const { placedBars, hiddenCount, laneCount } = useMemo(() => {
    const dated = items.filter((it) => it.start_date || it.due_date);

    const ranges: BarRange[] = [];
    const meta = new Map<string, { startIdx: number; endIdx: number }>();
    for (const it of dated) {
      const start = it.start_date || it.due_date!;
      const end = it.due_date || it.start_date!;
      const startIdx = diffDays(rangeStart, start);
      const endIdx = diffDays(rangeStart, end);
      // window 밖(완전히 벗어남)이면 제외
      if (endIdx < 0 || startIdx > TOTAL_DAYS - 1) continue;
      ranges.push({ id: it.id, startDayIndex: startIdx, endDayIndex: endIdx });
      meta.set(it.id, { startIdx, endIdx });
    }

    const lanes = computeBarLanes(ranges);
    const byId = new Map(dated.map((it) => [it.id, it]));

    const placed: PlacedBar[] = [];
    let hidden = 0;
    let maxLane = -1;

    for (const r of ranges) {
      const lane = lanes[r.id] ?? 0;
      if (lane >= MAX_LANES) {
        hidden += 1;
        continue;
      }
      maxLane = Math.max(maxLane, lane);
      const m = meta.get(r.id)!;
      const rawLeft = m.startIdx / TOTAL_DAYS;
      const rawRight = (m.endIdx + 1) / TOTAL_DAYS;
      const leftClamped = Math.max(0, rawLeft);
      const rightClamped = Math.min(1, rawRight);
      const item = byId.get(r.id)!;
      placed.push({
        item,
        lane,
        leftPct: leftClamped * 100,
        widthPct: Math.max((rightClamped - leftClamped) * 100, 1.4),
        overflowLeft: rawLeft < 0,
        overflowRight: rawRight > 1,
        color: item.feature?.color || DEFAULT_FEATURE_COLOR,
      });
    }

    return {
      placedBars: placed,
      hiddenCount: hidden,
      laneCount: Math.max(maxLane + 1, 1),
    };
  }, [items, rangeStart]);

  // ─── 마커 위치 ───
  const todayStr = getTodayDateString();
  const todayIdx = diffDays(rangeStart, todayStr);
  const addIdx = diffDays(rangeStart, assignedDate);
  const todayPct =
    todayIdx >= 0 && todayIdx <= TOTAL_DAYS - 1
      ? (todayIdx / TOTAL_DAYS) * 100
      : null;
  const addPct =
    addIdx >= 0 && addIdx <= TOTAL_DAYS - 1
      ? (addIdx / TOTAL_DAYS) * 100
      : null;

  const trackHeight = laneCount * BAR_H + (laneCount - 1) * LANE_GAP + LANE_GAP;

  // 에러 시 조용히 숨김 (모달 본문 흐름 방해 X)
  if (hasError) return null;

  const displayName = assignee?.name ?? "";
  const barCount = placedBars.length + hiddenCount;

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
            <span className="text-xs text-slate-500 whitespace-nowrap hidden sm:inline">
              {shortLabel(rangeStart)} – {shortLabel(rangeEnd)}
            </span>
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
              <div className="flex gap-3">
                {/* Avatar column */}
                <div className="w-24 flex-shrink-0 flex items-start gap-2 pt-5">
                  {assignee?.profile_image ? (
                    <img
                      src={assignee.profile_image}
                      alt={displayName}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: getAssigneeHex(displayName) }}
                    >
                      {getInitials(displayName)}
                    </div>
                  )}
                </div>

                {/* Track */}
                <div className="flex-1 min-w-0">
                  <div
                    className="relative"
                    style={{ height: trackHeight + 20 }}
                  >
                    {/* Week gridlines + labels */}
                    {Array.from({ length: WEEKS }).map((_, i) => {
                      const leftPct = ((i * 7) / TOTAL_DAYS) * 100;
                      const labelDate = addDaysToDate(rangeStart, i * 7);
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-l border-foreground/[0.06]"
                          style={{ left: `${leftPct}%` }}
                        >
                          <span className="absolute top-0 left-1 text-xs text-slate-500 tabular-nums">
                            {shortLabel(labelDate)}
                          </span>
                        </div>
                      );
                    })}

                    {/* Today marker */}
                    {todayPct !== null && (
                      <div
                        className="absolute z-20"
                        style={{
                          left: `${todayPct}%`,
                          top: 16,
                          bottom: 0,
                        }}
                      >
                        <div className="absolute top-0 bottom-0 border-l-[1.5px] border-bridge-secondary" />
                        <span className="absolute -top-4 left-0 -translate-x-1/2 text-xs font-medium px-1.5 py-px rounded bg-bridge-secondary text-bridge-dark whitespace-nowrap">
                          {t("dailyChecklist.workloadToday")}
                        </span>
                      </div>
                    )}

                    {/* Add-date marker */}
                    {addPct !== null && (
                      <div
                        className="absolute z-20"
                        style={{ left: `${addPct}%`, top: 16, bottom: 0 }}
                      >
                        <div className="absolute top-0 bottom-0 border-l-[1.5px] border-dashed border-bridge-accent" />
                        <span className="absolute -top-4 left-0 -translate-x-1/2 text-xs font-medium px-1.5 py-px rounded bg-bridge-accent text-white whitespace-nowrap">
                          {t("dailyChecklist.workloadAddDate")}
                        </span>
                      </div>
                    )}

                    {/* Bars */}
                    {placedBars.map((b) => {
                      const isSel = selectedItemIds.has(b.item.id);
                      const top = 20 + b.lane * (BAR_H + LANE_GAP);
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
                          } ${b.overflowLeft ? "rounded-l-none" : ""} ${
                            b.overflowRight ? "rounded-r-none" : ""
                          }`}
                          style={{
                            left: `${b.leftPct}%`,
                            width: `${b.widthPct}%`,
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

                    {/* Hidden overflow chip */}
                    {hiddenCount > 0 && (
                      <div
                        className="absolute right-0 text-xs font-medium text-slate-400"
                        style={{
                          top: 20 + (MAX_LANES - 1) * (BAR_H + LANE_GAP),
                        }}
                      >
                        +{hiddenCount}
                      </div>
                    )}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
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
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
