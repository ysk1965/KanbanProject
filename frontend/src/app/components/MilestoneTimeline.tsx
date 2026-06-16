import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, FileText } from "lucide-react";
import {
  eachWeekOfInterval,
  differenceInDays,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isAfter,
  isBefore,
} from "date-fns";
import { ko } from "date-fns/locale";
import type { Feature, Milestone, MilestoneFeatureInfo } from "../types";
import { getMilestoneStatus } from "./MilestoneView";

// ========================================
// Constants
// ========================================

const DAY_WIDTH = 24; // 하루 픽셀 너비 (주 = 168px)
const WEEK_WIDTH = DAY_WIDTH * 7;
const LEFT_COL_WIDTH = 220; // 왼쪽 고정 컬럼
const HEADER_HEIGHT = 36;
const ROW_HEIGHT = 44;
const FEATURE_ROW_HEIGHT = 30;
const BAR_HEIGHT = 22;
const FEATURE_BAR_HEIGHT = 14;
const WEEK_OPTS = { weekStartsOn: 1 as const }; // 월요일 시작

// ========================================
// Types
// ========================================

type DetailCache = Record<
  string,
  { features: MilestoneFeatureInfo[]; loading: boolean }
>;

type DragMode = "move" | "left" | "right";

interface DragState {
  id: string;
  mode: DragMode;
  initialX: number;
  initialStart: Date;
  initialEnd: Date;
  moved: boolean;
}

interface MilestoneTimelineProps {
  milestones: Milestone[];
  /** 피처 날짜(start_date/due_date) 조회용 — 전체 피처 목록 */
  features: Feature[];
  expandedMilestones: Set<string>;
  detailCache: DetailCache;
  onToggle: (milestoneId: string) => void;
  onMilestoneClick?: (milestone: Milestone) => void;
  /** 있으면 드래그/리사이즈 활성 (편집 권한) */
  onUpdateDates?: (id: string, start: string, end: string) => void;
}

// ========================================
// Helpers
// ========================================

/** 'YYYY-MM-DD'를 로컬 타임존 기준으로 파싱 (오프바이원 방지) */
const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const toDateStr = (d: Date): string => format(d, "yyyy-MM-dd");

// ========================================
// Component
// ========================================

export function MilestoneTimeline({
  milestones,
  features,
  expandedMilestones,
  detailCache,
  onToggle,
  onMilestoneClick,
  onUpdateDates,
}: MilestoneTimelineProps) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState<DragState | null>(null);

  const canDrag = !!onUpdateDates;

  // 피처 id → Feature (날짜 조회용)
  const featureMap = useMemo(() => {
    const map = new Map<string, Feature>();
    for (const f of features) map.set(f.id, f);
    return map;
  }, [features]);

  // 전체 날짜 범위 (주 경계로 패딩)
  const { rangeStart, totalDays, weeks } = useMemo(() => {
    const valid = milestones.filter((m) => m.start_date && m.end_date);
    if (valid.length === 0) {
      return { rangeStart: new Date(), totalDays: 0, weeks: [] as Date[] };
    }
    let minDate = parseLocalDate(valid[0].start_date);
    let maxDate = parseLocalDate(valid[0].end_date);
    for (const m of valid) {
      const s = parseLocalDate(m.start_date);
      const e = parseLocalDate(m.end_date);
      if (isBefore(s, minDate)) minDate = s;
      if (isAfter(e, maxDate)) maxDate = e;
    }
    const start = startOfWeek(minDate, WEEK_OPTS);
    const end = endOfWeek(maxDate, WEEK_OPTS);
    return {
      rangeStart: start,
      totalDays: differenceInDays(end, start) + 1,
      weeks: eachWeekOfInterval({ start, end }, WEEK_OPTS),
    };
  }, [milestones]);

  // 드래그 중 처리 (live preview + mouseup 커밋)
  useEffect(() => {
    if (!drag) return;

    const computeDates = (deltaDays: number) => {
      let newStart = drag.initialStart;
      let newEnd = drag.initialEnd;
      if (drag.mode === "move") {
        newStart = addDays(drag.initialStart, deltaDays);
        newEnd = addDays(drag.initialEnd, deltaDays);
      } else if (drag.mode === "left") {
        newStart = addDays(drag.initialStart, deltaDays);
        if (isAfter(newStart, newEnd)) newStart = newEnd;
      } else if (drag.mode === "right") {
        newEnd = addDays(drag.initialEnd, deltaDays);
        if (isBefore(newEnd, newStart)) newEnd = newStart;
      }
      return { newStart, newEnd };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaDays = Math.round((e.clientX - drag.initialX) / DAY_WIDTH);
      if (deltaDays !== 0 && !drag.moved) {
        setDrag((prev) => (prev ? { ...prev, moved: true } : prev));
      }
      const { newStart, newEnd } = computeDates(deltaDays);
      const bar = document.querySelector(
        `[data-milestone-bar="${drag.id}"]`,
      ) as HTMLElement | null;
      if (bar) {
        const offset = differenceInDays(newStart, rangeStart);
        const duration = differenceInDays(newEnd, newStart) + 1;
        bar.style.left = `${offset * DAY_WIDTH}px`;
        bar.style.width = `${duration * DAY_WIDTH}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.body.style.cursor = "";
      const deltaDays = Math.round((e.clientX - drag.initialX) / DAY_WIDTH);
      if (deltaDays !== 0 && onUpdateDates) {
        const { newStart, newEnd } = computeDates(deltaDays);
        onUpdateDates(drag.id, toDateStr(newStart), toDateStr(newEnd));
      }
      setDrag(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [drag, rangeStart, onUpdateDates]);

  const startDrag = (
    e: React.MouseEvent,
    milestone: Milestone,
    mode: DragMode,
  ) => {
    if (!canDrag) return;
    e.preventDefault();
    e.stopPropagation();
    document.body.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
    setDrag({
      id: milestone.id,
      mode,
      initialX: e.clientX,
      initialStart: parseLocalDate(milestone.start_date),
      initialEnd: parseLocalDate(milestone.end_date),
      moved: false,
    });
  };

  // 마일스톤 없거나 날짜 산출 불가 시 타임라인 숨김
  if (totalDays === 0) return null;

  const timelineWidth = totalDays * DAY_WIDTH;
  const todayOffset = differenceInDays(new Date(), rangeStart);
  const showToday = todayOffset >= 0 && todayOffset < totalDays;

  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <div style={{ width: LEFT_COL_WIDTH + timelineWidth }}>
          {/* Header: week columns */}
          <div
            className="flex sticky top-0 z-20 bg-bridge-obsidian border-b border-foreground/[0.08]"
            style={{ height: HEADER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-10 flex items-center px-4 bg-bridge-obsidian border-r border-foreground/[0.08]"
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {t("milestone.timeline.title", { defaultValue: "타임라인" })}
              </span>
            </div>
            <div className="relative flex" style={{ width: timelineWidth }}>
              {weeks.map((week) => {
                const offset = differenceInDays(week, rangeStart);
                return (
                  <div
                    key={week.toISOString()}
                    className="flex items-center justify-start px-2 text-xs text-slate-500 border-r border-foreground/[0.05]"
                    style={{
                      position: "absolute",
                      left: offset * DAY_WIDTH,
                      width: WEEK_WIDTH,
                      height: "100%",
                    }}
                  >
                    {format(week, "M/d", { locale: ko })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Milestone rows */}
          {milestones.map((milestone) => {
            const hasDates = !!(milestone.start_date && milestone.end_date);
            const isExpanded = expandedMilestones.has(milestone.id);
            const cached = detailCache[milestone.id];
            const milestoneFeatures =
              cached?.features ?? milestone.features ?? [];

            const status = hasDates
              ? getMilestoneStatus(
                  milestone.start_date,
                  milestone.end_date,
                  milestone.progress_percentage,
                )
              : null;

            const barOffset = hasDates
              ? differenceInDays(
                  parseLocalDate(milestone.start_date),
                  rangeStart,
                )
              : 0;
            const barDuration = hasDates
              ? differenceInDays(
                  parseLocalDate(milestone.end_date),
                  parseLocalDate(milestone.start_date),
                ) + 1
              : 0;

            return (
              <div key={milestone.id}>
                {/* Milestone row */}
                <div
                  className="flex border-b border-foreground/[0.05]"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Left fixed cell */}
                  <button
                    onClick={() => onToggle(milestone.id)}
                    className="sticky left-0 z-10 flex items-center gap-1.5 px-3 bg-bridge-obsidian border-r border-foreground/[0.08] hover:bg-foreground/[0.03] transition-colors text-left"
                    style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                    <span className="text-xs font-bold text-foreground truncate flex-1">
                      {milestone.title}
                    </span>
                    <span className="text-xs text-slate-500 tabular-nums flex-shrink-0">
                      {Math.round(milestone.progress_percentage)}%
                    </span>
                  </button>

                  {/* Timeline area */}
                  <div className="relative" style={{ width: timelineWidth }}>
                    {showToday && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-bridge-secondary/40 z-0 pointer-events-none"
                        style={{ left: todayOffset * DAY_WIDTH }}
                      />
                    )}
                    {hasDates && status && (
                      <div
                        data-milestone-bar={milestone.id}
                        onMouseDown={(e) => startDrag(e, milestone, "move")}
                        onClick={(e) => {
                          // 드래그 직후 클릭 억제
                          if (drag?.moved) return;
                          e.stopPropagation();
                          onMilestoneClick?.(milestone);
                        }}
                        className={`group absolute rounded-md ${status.barColor} flex items-center px-2 shadow-sm ${
                          canDrag ? "cursor-grab" : "cursor-pointer"
                        }`}
                        style={{
                          left: barOffset * DAY_WIDTH,
                          width: barDuration * DAY_WIDTH,
                          height: BAR_HEIGHT,
                          top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                        }}
                        title={`${milestone.title} (${milestone.start_date} ~ ${milestone.end_date})`}
                      >
                        {/* Resize handles */}
                        {canDrag && (
                          <>
                            <div
                              onMouseDown={(e) =>
                                startDrag(e, milestone, "left")
                              }
                              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-l-md opacity-0 group-hover:opacity-100 bg-black/20"
                            />
                            <div
                              onMouseDown={(e) =>
                                startDrag(e, milestone, "right")
                              }
                              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r-md opacity-0 group-hover:opacity-100 bg-black/20"
                            />
                          </>
                        )}
                        <span className="text-xs font-bold text-white truncate pointer-events-none">
                          {milestone.title}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Feature sub-rows (expanded) */}
                {isExpanded &&
                  milestoneFeatures.map((fi) => {
                    const feat = featureMap.get(fi.id);
                    const fStart = feat?.start_date
                      ? parseLocalDate(feat.start_date)
                      : null;
                    const fEnd = feat?.due_date
                      ? parseLocalDate(feat.due_date)
                      : null;
                    const hasFeatDates = !!(fStart && fEnd);

                    const fOffset = hasFeatDates
                      ? differenceInDays(fStart, rangeStart)
                      : 0;
                    const fDuration = hasFeatDates
                      ? differenceInDays(fEnd, fStart) + 1
                      : 0;

                    return (
                      <div
                        key={fi.id}
                        className="flex border-b border-foreground/[0.04] bg-foreground/[0.015]"
                        style={{ height: FEATURE_ROW_HEIGHT }}
                      >
                        <div
                          className="sticky left-0 z-10 flex items-center gap-1.5 pl-9 pr-3 bg-bridge-obsidian border-r border-foreground/[0.08]"
                          style={{
                            width: LEFT_COL_WIDTH,
                            minWidth: LEFT_COL_WIDTH,
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: fi.color }}
                          />
                          <span className="text-xs text-slate-400 truncate">
                            {fi.title}
                          </span>
                        </div>
                        <div
                          className="relative"
                          style={{ width: timelineWidth }}
                        >
                          {showToday && (
                            <div
                              className="absolute top-0 bottom-0 w-px bg-bridge-secondary/40 z-0 pointer-events-none"
                              style={{ left: todayOffset * DAY_WIDTH }}
                            />
                          )}
                          {hasFeatDates ? (
                            <div
                              className="absolute rounded border border-dashed border-foreground/20"
                              style={{
                                left: fOffset * DAY_WIDTH,
                                width: fDuration * DAY_WIDTH,
                                height: FEATURE_BAR_HEIGHT,
                                top:
                                  (FEATURE_ROW_HEIGHT - FEATURE_BAR_HEIGHT) / 2,
                                backgroundColor: `${fi.color}55`,
                              }}
                              title={fi.title}
                            />
                          ) : (
                            <span
                              className="absolute flex items-center gap-1 text-xs text-slate-600"
                              style={{
                                left: 8,
                                top: (FEATURE_ROW_HEIGHT - 16) / 2,
                              }}
                            >
                              <FileText className="h-3 w-3" />
                              {t("milestone.timeline.noDate", {
                                defaultValue: "날짜 없음",
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

MilestoneTimeline.displayName = "MilestoneTimeline";
