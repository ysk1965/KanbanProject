import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { boardChecklistAPI, AssigneeItemResponse } from "../../utils/api";
import { getTodayDateString } from "../../utils/dateUtils";
import {
  addDaysToDate,
  computeBarLanes,
  diffDays,
  parseDate,
  BarRange,
} from "../../utils/workloadBar";
import { DashboardCard, DashboardEmpty } from "./DashboardCard";

const DEFAULT_COLOR = "#6366F1";
const BAR_H = 22;
const LANE_GAP = 4;
const LANE_TOP = 4;

interface PlacedBar {
  item: AssigneeItemResponse;
  lane: number;
  startIdx: number;
  endIdx: number;
  color: string;
  overdue: boolean;
}

interface MyWorkloadWidgetProps {
  boardId: string;
  userId: string | undefined;
  /** 헤더 링크: 일정 탭 리소스 뷰로 이동 */
  onOpenResourceView: () => void;
  /** 바 클릭 → 연결된 태스크 열기 */
  onOpenTask?: (taskId: string) => void;
}

/** 그 주(월요일) 시작 날짜를 yyyy-MM-dd로 */
function mondayOf(dateStr: string): string {
  const d = parseDate(dateStr);
  const dow = (d.getDay() + 6) % 7; // 월=0
  return addDaysToDate(dateStr, -dow);
}

/**
 * 내 워크로드 — 4주 / 8주 타임라인.
 * 데이터는 일정 탭 리소스 뷰와 같은 by-assignee 응답을 쓰고,
 * 레인 패킹은 workloadBar.ts의 computeBarLanes를 재사용한다.
 */
export function MyWorkloadWidget({
  boardId,
  userId,
  onOpenResourceView,
  onOpenTask,
}: MyWorkloadWidgetProps) {
  const { t } = useTranslation();
  const today = getTodayDateString();

  const [weeks, setWeeks] = useState<4 | 8>(4);
  const [items, setItems] = useState<AssigneeItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const totalDays = weeks * 7;
  // 지난 주 월요일부터 시작해 앞뒤 맥락을 같이 본다
  const windowStart = useMemo(
    () => mondayOf(addDaysToDate(today, -7)),
    [today],
  );
  const windowEnd = useMemo(
    () => addDaysToDate(windowStart, totalDays - 1),
    [windowStart, totalDays],
  );

  useEffect(() => {
    if (!boardId || !userId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    boardChecklistAPI
      .getItemsByAssignee(boardId, {
        start_date: windowStart,
        end_date: windowEnd,
      })
      .then((res) => {
        if (cancelled) return;
        const mine = res.assignees.find((g) => g.assignee.id === userId);
        setItems(mine?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, userId, windowStart, windowEnd]);

  const { bars, laneCount, weekLoads } = useMemo(() => {
    const ranges: BarRange[] = [];
    const byId = new Map<string, AssigneeItemResponse>();

    for (const item of items) {
      if (item.completed) continue;
      const from = item.start_date ?? item.due_date;
      const to = item.due_date ?? item.start_date;
      if (!from || !to) continue;

      const rawStart = diffDays(windowStart, from);
      const rawEnd = diffDays(windowStart, to);
      if (rawEnd < 0 || rawStart > totalDays - 1) continue;

      const startIdx = Math.max(0, Math.min(totalDays - 1, rawStart));
      const endIdx = Math.max(startIdx, Math.min(totalDays - 1, rawEnd));
      ranges.push({ id: item.id, startDayIndex: startIdx, endDayIndex: endIdx });
      byId.set(item.id, item);
    }

    const lanes = computeBarLanes(ranges);
    const placed: PlacedBar[] = ranges.map((r) => {
      const item = byId.get(r.id)!;
      return {
        item,
        lane: lanes[r.id] ?? 0,
        startIdx: r.startDayIndex,
        endIdx: r.endDayIndex,
        color: item.feature?.color || DEFAULT_COLOR,
        overdue: !!item.due_date && item.due_date < today,
      };
    });

    const maxLane = placed.reduce((m, b) => Math.max(m, b.lane), -1);

    // 주별 건수 — "이번 주에 몰려 있다"를 숫자로도 보여준다
    const loads: number[] = Array.from({ length: weeks }, () => 0);
    for (const b of placed) {
      const w = Math.floor(b.startIdx / 7);
      if (w >= 0 && w < weeks) loads[w] += 1;
    }

    return { bars: placed, laneCount: maxLane + 1, weekLoads: loads };
  }, [items, windowStart, totalDays, weeks, today]);

  const todayIdx = diffDays(windowStart, today);
  const todayPercent = (todayIdx / totalDays) * 100;
  const gridHeight = Math.max(
    3 * (BAR_H + LANE_GAP),
    laneCount * (BAR_H + LANE_GAP) + LANE_TOP,
  );

  // 피처 범례 (중복 제거)
  const legend = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of bars) {
      if (b.item.feature) map.set(b.item.feature.title, b.color);
    }
    return Array.from(map.entries()).slice(0, 6);
  }, [bars]);

  const weekLabels = useMemo(
    () =>
      Array.from({ length: weeks }, (_, i) => {
        const d = parseDate(addDaysToDate(windowStart, i * 7));
        return `${d.getMonth() + 1}/${d.getDate()}`;
      }),
    [weeks, windowStart],
  );

  return (
    <DashboardCard
      title={t("boardDashboard.workloadTitle", "내 워크로드")}
      subtitle={`${windowStart.slice(5).replace("-", "/")} – ${windowEnd.slice(5).replace("-", "/")}`}
      linkLabel={t("boardDashboard.workloadLink", "리소스 뷰에서 열기")}
      onLinkClick={onOpenResourceView}
      isLoading={isLoading}
      padded={false}
      headerExtra={
        <div className="flex items-center gap-0.5 bg-foreground/5 rounded-lg p-0.5">
          {([4, 8] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeeks(w)}
              className={
                weeks === w
                  ? "px-2.5 py-1 rounded-md text-xs font-bold bg-foreground/10 text-foreground"
                  : "px-2.5 py-1 rounded-md text-xs text-slate-400 hover:text-foreground transition-colors"
              }
            >
              {t("boardDashboard.workloadWeeks", { count: w })}
            </button>
          ))}
        </div>
      }
    >
      {bars.length === 0 ? (
        <div className="px-4">
          <DashboardEmpty
            message={t(
              "boardDashboard.workloadEmpty",
              "이 기간에 배정된 작업이 없습니다.",
            )}
            actionLabel={t("boardDashboard.workloadLink", "리소스 뷰에서 열기")}
            onAction={onOpenResourceView}
          />
        </div>
      ) : (
        <div className="px-4 pt-3">
          {/* 주 라벨 */}
          <div
            className="grid mb-1"
            style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}
          >
            {weekLabels.map((label) => (
              <span key={label} className="text-xs font-bold text-slate-500">
                {label}
              </span>
            ))}
          </div>

          {/* 타임라인 */}
          <div
            className="relative rounded-lg bg-foreground/[0.03] overflow-hidden"
            style={{
              height: gridHeight,
              backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.12) 0 1px, transparent 1px calc(100%/${totalDays}))`,
            }}
          >
            {/* 지난 구간 */}
            {todayIdx > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-foreground/[0.04]"
                style={{ width: `${todayPercent}%` }}
              />
            )}
            {/* 주 구분선 */}
            {Array.from({ length: weeks - 1 }, (_, i) => (
              <div
                key={`sep-${i}`}
                className="absolute inset-y-0 w-px bg-foreground/10"
                style={{ left: `${((i + 1) * 7 * 100) / totalDays}%` }}
              />
            ))}
            {/* 오늘 */}
            {todayIdx >= 0 && todayIdx < totalDays && (
              <div
                className="absolute inset-y-0 w-0.5 bg-bridge-accent"
                style={{ left: `${todayPercent}%` }}
              >
                <span className="absolute top-0.5 left-1.5 text-xs font-bold text-bridge-accent whitespace-nowrap">
                  {t("boardDashboard.workloadToday", "오늘")}
                </span>
              </div>
            )}

            {bars.map((b) => {
              const left = (b.startIdx / totalDays) * 100;
              const width = ((b.endIdx - b.startIdx + 1) / totalDays) * 100;
              const taskId = b.item.task?.id;
              return (
                <button
                  key={b.item.id}
                  type="button"
                  disabled={!taskId || !onOpenTask}
                  onClick={() => taskId && onOpenTask?.(taskId)}
                  title={b.item.title}
                  className={`absolute rounded-md px-2 text-xs font-medium text-white truncate text-left ${
                    b.overdue ? "ring-2 ring-rose-500 ring-offset-0" : ""
                  } ${taskId && onOpenTask ? "cursor-pointer hover:brightness-110" : "cursor-default"} transition-all`}
                  style={{
                    top: LANE_TOP + b.lane * (BAR_H + LANE_GAP),
                    height: BAR_H,
                    lineHeight: `${BAR_H}px`,
                    left: `${left}%`,
                    width: `calc(${width}% - 2px)`,
                    backgroundColor: b.color,
                  }}
                >
                  {b.item.title}
                </button>
              );
            })}
          </div>

          {/* 범례 + 주별 부하 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-xs text-slate-500">
            {legend.map(([name, color]) => (
              <span key={name} className="flex items-center gap-1.5">
                <i
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {name}
              </span>
            ))}
            <span className="ml-auto text-slate-400">
              {weekLoads.map((count, i) => (
                <span key={i} className="ml-3">
                  {weekLabels[i]}{" "}
                  <b
                    className={`font-bold ${i === 1 && count >= 6 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}
                  >
                    {t("boardDashboard.workloadCount", { count })}
                  </b>
                </span>
              ))}
            </span>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
