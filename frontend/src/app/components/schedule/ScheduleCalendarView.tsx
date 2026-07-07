import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Loader2, Plus, Flag } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { Milestone } from "../../types";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  format,
  isSameMonth,
  isToday,
  getDay,
} from "date-fns";
import { BoardMember } from "../ShareBoardModal";
import { calendarEventAPI, CalendarEventItem } from "../../utils/api";
import { useHolidays, HolidayInfo } from "../../hooks/useHolidays";
import { calendarTypeMeta } from "./calendarEventMeta";
import {
  CalendarEventModal,
  CalendarEventModalInitial,
  CalendarMemberOption,
} from "./CalendarEventModal";
import { DayDetailPanel, DayDetailData } from "./DayDetailPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleCalendarViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  milestones: Milestone[];
  currentUserRole?: string;
  onMilestoneClick?: (milestone: Milestone) => void;
  /** Increment to trigger data refresh */
  refreshTrigger?: number;
}

/** 캘린더 격자에 올릴 바 하나 (팀 이벤트 / 개인 부재 / 마일스톤) */
type BarKind = "event" | "absence" | "milestone";

interface BarItem {
  id: string;
  kind: BarKind;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  icon: string;
  avatar?: string | null;
  /** 원본 이벤트 — 클릭 편집용 */
  event?: CalendarEventItem;
  /** 원본 마일스톤 — 클릭 진입용 */
  milestone?: Milestone;
}

/** 주 단위 격자를 가로지르는 멀티데이 바 세그먼트 */
interface BarSegment {
  item: BarItem;
  startCol: number;
  span: number;
  row: number;
}

/** 레이어 토글 키 */
type LayerKey = "event" | "absence" | "holiday" | "milestone";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format a Date as YYYY-MM-DD */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse date string (YYYY-MM-DD) to midnight local Date */
function parseDate(dateStr: string): Date {
  if (dateStr.length === 10) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

/**
 * Compute bar segments for all bar items (single-day and multiday) across the
 * calendar grid. Single-day items collapse to a 1-column span. Items stack into
 * lanes (rows) so nothing overlaps. Returns BarSegment[] per week-row.
 */
function computeBarSegments(items: BarItem[], weeks: Date[][]): BarSegment[][] {
  // 안정적 레인 순서: 시작 빠른 것 → 긴 것(늦게 끝나는 것) → id
  const sorted = [...items].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    if (a.endDate !== b.endDate) return a.endDate > b.endDate ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  return weeks.map((week) => {
    const weekStart = week[0];
    const weekEnd = week[week.length - 1];
    const segments: BarSegment[] = [];
    const columnMaxRow: number[] = new Array(7).fill(0);

    for (const item of sorted) {
      const itemStart = parseDate(item.startDate);
      const itemEnd = parseDate(item.endDate);
      if (itemEnd < weekStart || itemStart > weekEnd) continue;

      const clippedStart = itemStart < weekStart ? weekStart : itemStart;
      const clippedEnd = itemEnd > weekEnd ? weekEnd : itemEnd;

      const startCol = getDay(clippedStart);
      const endCol = getDay(clippedEnd);
      const span = endCol - startCol + 1;

      let row = 0;
      for (let c = startCol; c <= endCol; c++) {
        row = Math.max(row, columnMaxRow[c]);
      }
      for (let c = startCol; c <= endCol; c++) {
        columnMaxRow[c] = row + 1;
      }

      segments.push({ item, startCol, span, row });
    }

    return segments;
  });
}

// 셀 높이에 맞춰 표시할 바 개수를 동적으로 결정 (최대 5, 최소 3 — 얇은 바로 더 많이 수용)
const MAX_VISIBLE_CAP = 5;
const MIN_VISIBLE_BARS = 3;
const BAR_HEIGHT = 18;
const BAR_GAP = 2;
const HEADER_HEIGHT = 28;

const LAYER_META: { key: LayerKey; label: string; color: string }[] = [
  { key: "event", label: "이벤트", color: "#6366F1" },
  { key: "absence", label: "부재", color: "#f59e0b" },
  { key: "holiday", label: "휴무일", color: "#f87171" },
  { key: "milestone", label: "마일스톤", color: "#818cf8" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScheduleCalendarView({
  boardId,
  boardMembers,
  milestones,
  currentUserRole,
  onMilestoneClick,
  refreshTrigger,
}: ScheduleCalendarViewProps) {
  const { t, i18n } = useTranslation();

  const canManage = currentUserRole !== "viewer";

  // ------ State ------
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [eventModal, setEventModal] = useState<{
    open: boolean;
    initial?: CalendarEventModalInitial;
    editing?: CalendarEventItem | null;
  }>({ open: false });
  // 선택된 날짜 (우측 상세 패널) — 기본값 오늘, 데스크톱에서 상시 노출
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    toDateString(new Date()),
  );
  // 모바일: 패널이 캘린더를 덮으므로 탭 시에만 오버레이로 오픈
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // 레이어 토글 (숨김 Set — 기본 전체 표시)
  const layersKey = `scheduleCalendarLayers_${boardId}`;
  const [hiddenLayers, setHiddenLayers] = useState<Set<LayerKey>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(layersKey);
      return raw ? new Set(JSON.parse(raw) as LayerKey[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const toggleLayer = useCallback(
    (key: LayerKey) => {
      setHiddenLayers((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        try {
          window.localStorage.setItem(layersKey, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [layersKey],
  );

  // ------ Data fetching ------
  const fetchData = useCallback(async () => {
    if (!boardId) return;
    setIsLoading(true);
    try {
      const res = await calendarEventAPI.list(boardId);
      setCalendarEvents(res.events);
    } catch {
      // 조용히 처리 — 빈 상태 유지
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 부모 트리거(패널/외부 변경) 시 재조회 — 급격한 변경 배치
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      const timer = setTimeout(() => fetchData(), 400);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // ------ Holidays (cover prev/current/next year for grid spillover) ------
  const calendarYear = currentMonth.getFullYear();
  const { holidayMap: hPrev } = useHolidays(i18n.language, calendarYear - 1);
  const { holidayMap: hCur } = useHolidays(i18n.language, calendarYear);
  const { holidayMap: hNext } = useHolidays(i18n.language, calendarYear + 1);
  const holidayMap = useMemo(() => {
    const merged = new Map<string, HolidayInfo[]>();
    [hPrev, hCur, hNext].forEach((m) => m.forEach((v, k) => merged.set(k, v)));
    return merged;
  }, [hPrev, hCur, hNext]);

  // ------ Calendar grid computation ------
  const weeks: Date[][] = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const result: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      result.push(allDays.slice(i, i + 7));
    }
    return result;
  }, [currentMonth]);

  const gridDays = useMemo(() => weeks.flat(), [weeks]);

  const showHolidayLayer = !hiddenLayers.has("holiday");

  // ------ 셀 높이 기반 동적 표시 개수 (최대 4, 셀 작아지면 감소) ------
  const rowGroupRef = useRef<HTMLDivElement>(null);
  const [maxVisibleBars, setMaxVisibleBars] = useState(MAX_VISIBLE_CAP);
  useEffect(() => {
    const el = rowGroupRef.current;
    if (!el) return;
    const compute = () => {
      const rowCount = weeks.length || 1;
      const rowH = el.clientHeight / rowCount;
      if (rowH <= 0) return; // 레이아웃 미확정 시 기존값 유지
      const usable = rowH - HEADER_HEIGHT;
      const fit = Math.floor(usable / (BAR_HEIGHT + BAR_GAP));
      setMaxVisibleBars(
        Math.max(MIN_VISIBLE_BARS, Math.min(MAX_VISIBLE_CAP, fit)),
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [weeks.length]);

  // ------ 달력 예외(휴무일/근무일) 병합 — 리소스 뷰와 동일 로직 (반복 포함) ------
  const { mergedHolidayMap, forcedWorkdaySet } = useMemo(() => {
    const holiMap = new Map<string, HolidayInfo[]>();
    holidayMap.forEach((v, k) => holiMap.set(k, [...v]));
    const workdaySet = new Set<string>();

    const calItems = calendarEvents.filter((e) => e.category === "CALENDAR");
    if (calItems.length > 0) {
      for (const day of gridDays) {
        const ds = toDateString(day);
        const mmdd = ds.slice(5);
        for (const e of calItems) {
          const inRange = ds >= e.start_date && ds <= e.end_date;
          const recurringMatch =
            e.recurring &&
            mmdd >= e.start_date.slice(5) &&
            mmdd <= e.end_date.slice(5);
          if (!inRange && !recurringMatch) continue;
          if (e.event_type === "WORKDAY") {
            workdaySet.add(ds);
          } else {
            const arr = holiMap.get(ds) || [];
            arr.push({ date: ds, name: e.title || "휴무일", type: "custom" });
            holiMap.set(ds, arr);
          }
        }
      }
    }
    // 근무일 지정은 공휴일/주말 셰이딩을 덮어씀
    workdaySet.forEach((ds) => holiMap.delete(ds));

    return { mergedHolidayMap: holiMap, forcedWorkdaySet: workdaySet };
  }, [holidayMap, calendarEvents, gridDays]);

  // ------ 바 아이템 (이벤트/부재/마일스톤) ------
  const barItems = useMemo(() => {
    const items: BarItem[] = [];

    if (!hiddenLayers.has("event")) {
      calendarEvents
        .filter((e) => e.category === "TEAM")
        .forEach((e) => {
          const meta = calendarTypeMeta(e.event_type);
          items.push({
            id: `ev-${e.id}`,
            kind: "event",
            title: e.title || meta.label,
            startDate: e.start_date,
            endDate: e.end_date,
            color: e.color || meta.color,
            icon: meta.icon,
            event: e,
          });
        });
    }

    if (!hiddenLayers.has("absence")) {
      calendarEvents
        .filter((e) => e.category === "MEMBER" && e.member)
        .forEach((e) => {
          const meta = calendarTypeMeta(e.event_type);
          const label = e.title
            ? `${e.member!.name} · ${e.title}`
            : e.member!.name;
          items.push({
            id: `ab-${e.id}`,
            kind: "absence",
            title: label,
            startDate: e.start_date,
            endDate: e.end_date,
            color: e.color || meta.color,
            icon: meta.icon,
            avatar: e.member!.profile_image,
            event: e,
          });
        });
    }

    if (!hiddenLayers.has("milestone")) {
      milestones
        .filter((m) => m.start_date && m.end_date)
        .forEach((m) => {
          items.push({
            id: `ms-${m.id}`,
            kind: "milestone",
            title: m.title,
            startDate: m.start_date,
            endDate: m.end_date,
            color: "#6366F1",
            icon: "⚑",
            milestone: m,
          });
        });
    }

    return items;
  }, [calendarEvents, milestones, hiddenLayers]);

  const barSegmentsByWeek = useMemo(
    () => computeBarSegments(barItems, weeks),
    [barItems, weeks],
  );

  // ------ Navigation ------
  const handlePrevMonth = useCallback(
    () => setCurrentMonth((m) => subMonths(m, 1)),
    [],
  );
  const handleNextMonth = useCallback(
    () => setCurrentMonth((m) => addMonths(m, 1)),
    [],
  );
  const handleToday = useCallback(() => setCurrentMonth(new Date()), []);

  // ------ 멤버 옵션 (모달용) ------
  const memberOptions: CalendarMemberOption[] = useMemo(
    () =>
      boardMembers
        .filter((m) => m.role !== "viewer")
        .map((m) => ({ id: m.userId, name: m.name, avatar: m.avatar || null })),
    [boardMembers],
  );

  // ------ 추가/편집 ------
  const openAdd = useCallback(
    (dateStr?: string) => {
      if (!canManage) return;
      setEventModal({
        open: true,
        initial: { category: "TEAM", date: dateStr },
        editing: null,
      });
    },
    [canManage],
  );

  const handleBarClick = useCallback(
    (item: BarItem) => {
      if (item.kind === "milestone") {
        if (item.milestone && onMilestoneClick)
          onMilestoneClick(item.milestone);
        return;
      }
      // 이벤트/부재 → 편집 (뷰어는 모달 안에서 저장 불가하지만 열람은 허용)
      if (item.event) {
        setEventModal({ open: true, editing: item.event });
      }
    },
    [onMilestoneClick],
  );

  // ------ 선택 날짜 상세 (우측 패널) ------
  const selectedDayDetail = useMemo<DayDetailData | null>(() => {
    if (!selectedDate) return null;
    const sel = selectedDate;
    const activeOn = (e: CalendarEventItem) => {
      if (sel >= e.start_date && sel <= e.end_date) return true;
      if (e.recurring) {
        const mmdd = sel.slice(5);
        return mmdd >= e.start_date.slice(5) && mmdd <= e.end_date.slice(5);
      }
      return false;
    };

    const events = calendarEvents.filter(
      (e) => e.category === "TEAM" && activeOn(e),
    );
    const absences = calendarEvents.filter(
      (e) => e.category === "MEMBER" && e.member && activeOn(e),
    );
    const calItems = calendarEvents.filter(
      (e) => e.category === "CALENDAR" && activeOn(e),
    );
    const customHolidays = calItems.filter((e) => e.event_type !== "WORKDAY");
    const workdayEvents = calItems.filter((e) => e.event_type === "WORKDAY");
    const publicHolidays = holidayMap.get(sel) || [];
    const ms = milestones.filter(
      (m) =>
        m.start_date && m.end_date && sel >= m.start_date && sel <= m.end_date,
    );

    return {
      milestones: ms,
      events,
      absences,
      customHolidays,
      workdayEvents,
      publicHolidays,
    };
  }, [selectedDate, calendarEvents, milestones, holidayMap]);

  // ------ 공휴일을 근무일로 지정 (오버라이드 이벤트 생성) ------
  const openDesignateWorkday = useCallback(
    (dateStr: string) => {
      if (!canManage) return;
      setEventModal({
        open: true,
        initial: { category: "CALENDAR", eventType: "WORKDAY", date: dateStr },
        editing: null,
      });
    },
    [canManage],
  );

  // ------ 키보드 내비게이션 (←/→ 날짜 이동, Esc 모바일 패널 닫기) ------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (eventModal.open) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        setMobilePanelOpen(false);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const d = parseDate(selectedDate);
        d.setDate(d.getDate() + (e.key === "ArrowRight" ? 1 : -1));
        const ns = toDateString(d);
        setSelectedDate(ns);
        if (!isSameMonth(d, currentMonth)) setCurrentMonth(d);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDate, eventModal.open, currentMonth]);

  // ------ Render helpers ------
  const renderBar = useCallback(
    (item: BarItem) => {
      const isMilestone = item.kind === "milestone";
      return (
        <div
          key={item.id}
          role="button"
          tabIndex={0}
          aria-label={item.title}
          className={`h-full rounded-md px-1.5 flex items-center gap-1 text-xs font-medium
            truncate cursor-pointer hover:brightness-110 transition-all text-white ${
              isMilestone
                ? "bg-bridge-accent/80 border border-bridge-accent/60"
                : ""
            }`}
          style={isMilestone ? undefined : { backgroundColor: item.color }}
          onClick={(e) => {
            e.stopPropagation();
            handleBarClick(item);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleBarClick(item);
            }
          }}
        >
          {item.kind === "absence" && item.avatar ? (
            <img
              src={item.avatar}
              alt=""
              className="w-4 h-4 rounded-full shrink-0"
            />
          ) : isMilestone ? (
            <Flag className="w-3 h-3 shrink-0" />
          ) : (
            <span className="text-[11px] leading-none shrink-0">
              {item.icon}
            </span>
          )}
          <span className="truncate">{item.title}</span>
        </div>
      );
    },
    [handleBarClick],
  );

  // ------ Loading state ------
  if (isLoading && calendarEvents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bridge-dark">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  // ------ Render ------
  return (
    <div className="flex-1 flex h-full bg-bridge-dark overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ===== Top toolbar ===== */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-foreground/[0.08] bg-bridge-obsidian shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <IconButton
              aria-label={t("schedule.calendar.prevMonth", "Previous month")}
              onClick={handlePrevMonth}
            >
              <ChevronLeft />
            </IconButton>
            <button
              className="px-3 py-1 rounded-lg text-xs font-medium text-bridge-accent hover:bg-bridge-accent/10 transition-colors"
              onClick={handleToday}
            >
              {t("schedule.calendar.today", "Today")}
            </button>
            <IconButton
              aria-label={t("schedule.calendar.nextMonth", "Next month")}
              onClick={handleNextMonth}
            >
              <ChevronRight />
            </IconButton>
            <span className="text-sm font-bold text-foreground tracking-tight ml-2">
              {format(currentMonth, "MMMM yyyy")}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 레이어 토글 레전드 */}
            <div className="flex items-center gap-1 flex-wrap">
              {LAYER_META.map((layer) => {
                const active = !hiddenLayers.has(layer.key);
                return (
                  <button
                    key={layer.key}
                    type="button"
                    onClick={() => toggleLayer(layer.key)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? "border-foreground/10 bg-foreground/[0.04] text-slate-300"
                        : "border-transparent bg-transparent text-slate-600 line-through opacity-60"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: active ? layer.color : "#475569",
                      }}
                    />
                    {t(`schedule.calendar.layer.${layer.key}`, layer.label)}
                  </button>
                );
              })}
            </div>

            {/* 추가 버튼 */}
            {canManage && (
              <button
                type="button"
                onClick={() => openAdd()}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("schedule.calendar.addEvent", "추가")}
              </button>
            )}
          </div>
        </div>

        {/* ===== Calendar grid ===== */}
        <div
          className="flex-1 overflow-hidden flex flex-col"
          role="grid"
          aria-label="Monthly calendar"
        >
          {/* Weekday headers */}
          <div
            role="row"
            className="grid grid-cols-7 border-b border-foreground/[0.08]"
          >
            {WEEKDAY_LABELS_EN.map((label, idx) => (
              <div
                key={idx}
                role="columnheader"
                className="text-xs font-bold uppercase tracking-widest text-slate-400 py-2 text-center"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div
            ref={rowGroupRef}
            role="rowgroup"
            className="flex-1 grid"
            style={{
              gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))`,
            }}
          >
            {weeks.map((week, weekIdx) => {
              const segments = barSegmentsByWeek[weekIdx] || [];

              return (
                <div
                  key={weekIdx}
                  role="row"
                  className="relative grid grid-cols-7 min-h-0"
                >
                  {week.map((day, colIdx) => {
                    const dateStr = toDateString(day);
                    const inMonth = isSameMonth(day, currentMonth);
                    const today = isToday(day);
                    const holidays = showHolidayLayer
                      ? mergedHolidayMap.get(dateStr)
                      : undefined;
                    const isHoliday = !!holidays && holidays.length > 0;
                    const holidayName = isHoliday
                      ? holidays!.map((h) => h.name).join(", ")
                      : undefined;
                    const isForcedWorkday =
                      showHolidayLayer && forcedWorkdaySet.has(dateStr);

                    const overflowCount = segments.filter(
                      (s) =>
                        colIdx >= s.startCol &&
                        colIdx < s.startCol + s.span &&
                        s.row >= maxVisibleBars,
                    ).length;

                    const isSelected = selectedDate === dateStr;

                    return (
                      <div
                        key={colIdx}
                        role="gridcell"
                        aria-label={format(day, "MMMM d, yyyy")}
                        aria-selected={isSelected}
                        title={holidayName}
                        onClick={() => {
                          setSelectedDate(dateStr);
                          setMobilePanelOpen(true);
                        }}
                        className={`align-top border border-foreground/[0.05] p-1
                        transition-colors relative min-w-0 overflow-hidden
                        cursor-pointer hover:bg-foreground/[0.03]
                        ${!inMonth ? "opacity-40" : ""}
                        ${isHoliday ? "bg-red-500/[0.04]" : ""}
                        ${isForcedWorkday ? "bg-emerald-500/[0.05]" : ""}
                        ${isSelected ? "ring-2 ring-inset ring-bridge-accent bg-bridge-accent/[0.06] z-10" : ""}
                      `}
                      >
                        {/* Date number + holiday/workday label */}
                        <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                          {isHoliday ? (
                            <span className="text-xs font-medium text-red-400 truncate">
                              {holidayName}
                            </span>
                          ) : isForcedWorkday ? (
                            <span className="text-xs font-medium text-emerald-400 truncate">
                              {t("schedule.calendar.workday", "근무일")}
                            </span>
                          ) : (
                            <span />
                          )}
                          <span
                            className={`text-xs font-medium leading-none shrink-0
                            ${
                              today
                                ? "bg-bridge-accent text-white w-6 h-6 rounded-full flex items-center justify-center font-bold"
                                : isHoliday
                                  ? "text-red-400"
                                  : inMonth
                                    ? "text-foreground"
                                    : "text-slate-500"
                            }
                          `}
                          >
                            {day.getDate()}
                          </span>
                        </div>

                        {/* Overflow indicator */}
                        {overflowCount > 0 && (
                          <div className="absolute bottom-1 right-1 text-xs text-slate-400">
                            +{overflowCount} more
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Bar overlay – spans the full week row (single + multiday) */}
                  {segments.length > 0 && (
                    <div
                      className="absolute inset-x-0 bottom-0 pointer-events-none overflow-hidden"
                      style={{ top: `${HEADER_HEIGHT}px` }}
                    >
                      {segments
                        .filter((s) => s.row < maxVisibleBars)
                        .map((segment) => {
                          const leftPercent = (segment.startCol / 7) * 100;
                          const widthPercent = (segment.span / 7) * 100;
                          const topPx = segment.row * (BAR_HEIGHT + BAR_GAP);

                          return (
                            <div
                              key={segment.item.id}
                              className="absolute pointer-events-auto"
                              style={{
                                left: `calc(${leftPercent}% + 4px)`,
                                width: `calc(${widthPercent}% - 8px)`,
                                top: `${topPx}px`,
                                height: `${BAR_HEIGHT}px`,
                              }}
                            >
                              {renderBar(segment.item)}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 우측 날짜 상세 패널 (데스크톱 상시 노출 / 모바일 오버레이) ===== */}
      {selectedDayDetail && (
        <DayDetailPanel
          date={selectedDate}
          data={selectedDayDetail}
          canManage={canManage}
          mobileOpen={mobilePanelOpen}
          onClose={() => setMobilePanelOpen(false)}
          onMilestoneClick={(m) => onMilestoneClick?.(m)}
          onEventClick={(e) => setEventModal({ open: true, editing: e })}
          onAdd={(d) => openAdd(d)}
          onDesignateWorkday={openDesignateWorkday}
        />
      )}

      {/* ===== 특별 일정 추가/편집 모달 ===== */}
      <CalendarEventModal
        open={eventModal.open}
        onClose={() => setEventModal({ open: false })}
        boardId={boardId}
        members={memberOptions}
        initial={eventModal.initial}
        editing={eventModal.editing}
        onSaved={fetchData}
      />
    </div>
  );
}

ScheduleCalendarView.displayName = "ScheduleCalendarView";
