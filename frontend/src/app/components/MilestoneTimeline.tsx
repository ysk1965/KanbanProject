import { useState, useEffect, useMemo, useRef } from "react";
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
import {
  buildMilestoneColorMap,
  resolveMilestoneColor,
} from "../utils/milestoneColor";

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
const TODAY_SCROLL_MARGIN = 120; // 초기 스크롤 시 오늘 왼쪽 여백

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

// 좌측 컬럼과 우측 트랙을 같은 순서/높이로 렌더하기 위한 평면 행 모델
type TimelineRow =
  | {
      kind: "milestone";
      milestone: Milestone;
      hasDates: boolean;
      status: ReturnType<typeof getMilestoneStatus> | null;
      barOffset: number;
      barDuration: number;
      isExpanded: boolean;
    }
  | {
      kind: "feature";
      key: string;
      fi: MilestoneFeatureInfo;
      hasFeatDates: boolean;
      fOffset: number;
      fDuration: number;
      isContinuation: boolean;
    };

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
  const [pan, setPan] = useState<{ startX: number; startLeft: number } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const canDrag = !!onUpdateDates;

  // 피처 id → Feature (날짜 조회용)
  const featureMap = useMemo(() => {
    const map = new Map<string, Feature>();
    for (const f of features) map.set(f.id, f);
    return map;
  }, [features]);

  // 마일스톤 id → 색 (배열 순서 기준 — 다른 뷰와 동일)
  const milestoneColorMap = useMemo(
    () => buildMilestoneColorMap(milestones),
    [milestones],
  );

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

  // 초기 진입 시 오늘 위치로 가로 스크롤
  useEffect(() => {
    if (!scrollRef.current || totalDays === 0) return;
    const todayPx = differenceInDays(new Date(), rangeStart) * DAY_WIDTH;
    scrollRef.current.scrollLeft = Math.max(0, todayPx - TODAY_SCROLL_MARGIN);
  }, [rangeStart, totalDays]);

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

  // 날짜 영역(빈 트랙/헤더)을 잡고 끌어 가로 스크롤 (막대는 mousedown에서 전파 차단 → 충돌 없음)
  useEffect(() => {
    if (!pan) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = pan.startLeft - (e.clientX - pan.startX);
    };
    const handleMouseUp = () => {
      document.body.style.cursor = "";
      setPan(null);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [pan]);

  const handlePanStart = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    e.preventDefault();
    document.body.style.cursor = "grabbing";
    setPan({ startX: e.clientX, startLeft: scrollRef.current.scrollLeft });
  };

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

  // 좌측/우측 공통 행 목록 구성
  const rows: TimelineRow[] = [];
  for (const milestone of milestones) {
    const hasDates = !!(milestone.start_date && milestone.end_date);
    const status = hasDates
      ? getMilestoneStatus(
          milestone.start_date,
          milestone.end_date,
          milestone.progress_percentage,
        )
      : null;
    const barOffset = hasDates
      ? differenceInDays(parseLocalDate(milestone.start_date), rangeStart)
      : 0;
    const barDuration = hasDates
      ? differenceInDays(
          parseLocalDate(milestone.end_date),
          parseLocalDate(milestone.start_date),
        ) + 1
      : 0;
    const isExpanded = expandedMilestones.has(milestone.id);
    rows.push({
      kind: "milestone",
      milestone,
      hasDates,
      status,
      barOffset,
      barDuration,
      isExpanded,
    });

    if (isExpanded) {
      const cached = detailCache[milestone.id];
      const milestoneFeatures = cached?.features ?? milestone.features ?? [];
      for (const fi of milestoneFeatures) {
        const feat = featureMap.get(fi.id);
        // 피처 자체 날짜 우선 → 없으면 부모 마일스톤 기간을 따름
        const fStart = feat?.start_date
          ? parseLocalDate(feat.start_date)
          : hasDates
            ? parseLocalDate(milestone.start_date)
            : null;
        const fEnd = feat?.due_date
          ? parseLocalDate(feat.due_date)
          : hasDates
            ? parseLocalDate(milestone.end_date)
            : null;
        const hasFeatDates = !!(fStart && fEnd);
        rows.push({
          kind: "feature",
          key: `${milestone.id}:${fi.id}`,
          fi,
          hasFeatDates,
          fOffset: hasFeatDates ? differenceInDays(fStart!, rangeStart) : 0,
          fDuration: hasFeatDates ? differenceInDays(fEnd!, fStart!) + 1 : 0,
          isContinuation: fi.is_primary === false,
        });
      }
    }
  }

  const TodayLine = () =>
    showToday ? (
      <div
        className="absolute top-0 bottom-0 w-px bg-bridge-secondary/40 pointer-events-none"
        style={{ left: todayOffset * DAY_WIDTH }}
      />
    ) : null;

  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
      <div className="flex">
        {/* 좌측 고정 컬럼 (가로 스크롤되지 않음) */}
        <div
          className="flex-shrink-0 border-r border-foreground/[0.08]"
          style={{ width: LEFT_COL_WIDTH }}
        >
          {/* 코너 */}
          <div
            className="flex items-center px-4 border-b border-foreground/[0.08]"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t("milestone.timeline.title", { defaultValue: "타임라인" })}
            </span>
          </div>

          {rows.map((row) =>
            row.kind === "milestone" ? (
              <button
                key={row.milestone.id}
                onClick={() => onToggle(row.milestone.id)}
                className="w-full flex items-center gap-1.5 px-3 border-b border-foreground/[0.05] hover:bg-foreground/[0.03] transition-colors text-left"
                style={{ height: ROW_HEIGHT }}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${
                    row.isExpanded ? "rotate-90" : ""
                  }`}
                />
                <span className="text-xs font-bold text-foreground truncate flex-1">
                  {row.milestone.title}
                </span>
                <span className="text-xs text-slate-500 tabular-nums flex-shrink-0">
                  {Math.round(row.milestone.progress_percentage)}%
                </span>
              </button>
            ) : (
              <div
                key={row.key}
                className="flex items-center gap-1.5 pl-9 pr-3 border-b border-foreground/[0.04] bg-foreground/[0.015]"
                style={{ height: FEATURE_ROW_HEIGHT }}
              >
                <span
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: row.fi.color }}
                />
                <span className="text-xs text-slate-400 truncate">
                  {row.fi.title}
                </span>
                {row.isContinuation && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary flex-shrink-0">
                    {t("milestone.continuationBadge", {
                      defaultValue: "이어짐",
                    })}
                  </span>
                )}
              </div>
            ),
          )}
        </div>

        {/* 우측 가로 스크롤 영역 (자체 좌측 경계에서 클리핑 → 막대가 좌측 컬럼 침범 불가) */}
        <div
          ref={scrollRef}
          onMouseDown={handlePanStart}
          className="flex-1 overflow-x-auto custom-scrollbar cursor-grab active:cursor-grabbing select-none"
        >
          <div style={{ width: timelineWidth }}>
            {/* 헤더: 주 컬럼 */}
            <div
              className="relative border-b border-foreground/[0.08]"
              style={{ height: HEADER_HEIGHT }}
            >
              {weeks.map((week) => {
                const offset = differenceInDays(week, rangeStart);
                return (
                  <div
                    key={week.toISOString()}
                    className="absolute flex items-center px-2 text-xs text-slate-500 border-r border-foreground/[0.05]"
                    style={{
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

            {/* 트랙 */}
            {rows.map((row) =>
              row.kind === "milestone" ? (
                <div
                  key={row.milestone.id}
                  className="relative border-b border-foreground/[0.05]"
                  style={{ height: ROW_HEIGHT }}
                >
                  <TodayLine />
                  {row.hasDates && row.status && (
                    <div
                      data-milestone-bar={row.milestone.id}
                      onMouseDown={(e) => startDrag(e, row.milestone, "move")}
                      onClick={(e) => {
                        if (drag?.moved) return;
                        e.stopPropagation();
                        onMilestoneClick?.(row.milestone);
                      }}
                      className={`group absolute rounded-md ${row.status.barColor} flex items-center px-2 shadow-sm ${
                        canDrag ? "cursor-grab" : "cursor-pointer"
                      }`}
                      style={{
                        left: row.barOffset * DAY_WIDTH,
                        width: row.barDuration * DAY_WIDTH,
                        height: BAR_HEIGHT,
                        top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                      }}
                      title={`${row.milestone.title} (${row.milestone.start_date} ~ ${row.milestone.end_date})`}
                    >
                      {/* 마일스톤 색 좌측 레일 (상태 채움은 유지, 정체성만 추가) */}
                      <span
                        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md pointer-events-none"
                        style={{
                          backgroundColor: resolveMilestoneColor(
                            row.milestone.id,
                            milestoneColorMap,
                          ).hex,
                        }}
                      />
                      {canDrag && (
                        <>
                          <div
                            onMouseDown={(e) =>
                              startDrag(e, row.milestone, "left")
                            }
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-l-md opacity-0 group-hover:opacity-100 bg-black/20"
                          />
                          <div
                            onMouseDown={(e) =>
                              startDrag(e, row.milestone, "right")
                            }
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r-md opacity-0 group-hover:opacity-100 bg-black/20"
                          />
                        </>
                      )}
                      <span className="text-xs font-bold text-white truncate pointer-events-none">
                        {row.milestone.title}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={row.key}
                  className="relative border-b border-foreground/[0.04] bg-foreground/[0.015]"
                  style={{ height: FEATURE_ROW_HEIGHT }}
                >
                  <TodayLine />
                  {row.hasFeatDates ? (
                    <div
                      className="absolute rounded border border-dashed border-foreground/20"
                      style={{
                        left: row.fOffset * DAY_WIDTH,
                        width: row.fDuration * DAY_WIDTH,
                        height: FEATURE_BAR_HEIGHT,
                        top: (FEATURE_ROW_HEIGHT - FEATURE_BAR_HEIGHT) / 2,
                        // 이어짐(non-primary)은 더 옅게 표시해 대표 막대와 구분
                        backgroundColor: `${row.fi.color}${row.isContinuation ? "2b" : "55"}`,
                        opacity: row.isContinuation ? 0.7 : 1,
                      }}
                      title={row.fi.title}
                    />
                  ) : (
                    <span
                      className="absolute flex items-center gap-1 text-xs text-slate-600"
                      style={{ left: 8, top: (FEATURE_ROW_HEIGHT - 16) / 2 }}
                    >
                      <FileText className="h-3 w-3" />
                      {t("milestone.timeline.noDate", {
                        defaultValue: "날짜 없음",
                      })}
                    </span>
                  )}
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

MilestoneTimeline.displayName = "MilestoneTimeline";
