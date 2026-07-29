import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
  Plus,
  Loader2,
  Clock,
  CheckSquare,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  format,
  addDays,
  subDays,
  startOfDay,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
} from "date-fns";
import { formatDate } from "../utils/dateUtils";
import { useHolidays } from "../hooks/useHolidays";
import { BoardMember } from "./ShareBoardModal";
import { ScheduleBlock } from "./ScheduleBlock";
import { ScheduleDetailPanel } from "./ScheduleDetailPanel";
import { ChecklistCreateModal } from "./ChecklistCreateModal";
import {
  ScheduleSettingsModal,
  ScheduleDisplayMode,
} from "./ScheduleSettingsModal";
import { WeeklySummaryModal } from "./WeeklySummaryModal";
import { DailySummaryModal } from "./DailySummaryModal";
import { EmbeddedDailyChecklist } from "./EmbeddedDailyChecklist";
import { AddDailyChecklistModal } from "./AddDailyChecklistModal";
import { useNavigate } from "react-router-dom";
import { meetingAPI, MeetingSummary } from "../utils/api";
import {
  scheduleAPI,
  dailyChecklistAPI,
  checklistAPI,
  ScheduleBlockInfo,
  ScheduleColumnInfo,
  ScheduleSettingsResponse,
  DailyChecklistColumnResponse,
} from "../utils/api";
import { getInitials, getAssigneeHex } from "../utils/assigneeColor";
import type { MilestoneColorMap } from "../utils/milestoneColor";
import { BoardWebSocketEvent, ChecklistItem } from "../types";

interface DailyScheduleViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  organizationId?: string | null;
  memberColorMap?: Record<string, string | null>;
  milestoneColorMap?: MilestoneColorMap;
  onViewFeature?: (featureId: string) => void;
  onViewTask?: (taskId: string, checklistItemId?: string) => void;
  onViewMeeting?: (meetingId: string, date?: Date) => void;
  refreshTrigger?: number;
  wsChecklistEvent?: BoardWebSocketEvent | null;
  currentUserRole?: string;
  initialSubTab?: string;
  /**
   * 대시보드 위젯 등 좁은 컨테이너에 끼워 넣을 때 true.
   * 전체 화면 전제의 상단 크롬(일/주 토글·설정·멤버 헤더)을 감추고 슬롯 높이를 줄인다.
   * 블록 생성·이동·시간 조절 등 실제 동작은 그대로다.
   */
  embedded?: boolean;
  /**
   * 시간대만 보여줄 때 true — 멤버 헤더 아래 "오늘의 체크리스트" 행을 뺀다.
   * embedded와 별개 축이다(좁은 컨테이너여도 체크리스트를 볼 수 있어야 하므로).
   */
  hideDailyChecklist?: boolean;
}

const SLOT_HEIGHT = 40; // 30분 슬롯의 기본 높이 (px)
const EMBED_SLOT_HEIGHT = 28; // 임베드 모드 — 하루가 스크롤 없이 들어오도록 낮춘 높이
const MIN_BLOCK_HEIGHT = 28; // 블록 최소 가시 높이 (px) - 제목 텍스트가 보이는 최소 크기

// 시간 문자열 → 분 단위 (예: "14:30" → 870)
const timeToMin = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// 분 → 시간 문자열 (예: 870 → "14:30")
const minToTime = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

// 시간 슬롯 생성 (30분 단위, 24시까지 지원)
const generateTimeSlots = (startHour: number, endHour: number) => {
  const slots: string[] = [];
  const endMinutes = Math.min(endHour, 24) * 60;
  for (let min = Math.floor(startHour) * 60; min < endMinutes; min += 30) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    slots.push(
      `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
    );
  }
  return slots;
};

// 시간 문자열에서 시간만 추출 (예: "09:00" 또는 "09:00:00" -> 9)
const parseHour = (time: string): number => {
  return parseInt(time.split(":")[0], 10);
};

type ScheduleViewMode = "day" | "week";

export function DailyScheduleView({
  boardId,
  boardMembers,
  organizationId,
  memberColorMap,
  milestoneColorMap,
  onViewFeature,
  onViewTask,
  onViewMeeting,
  refreshTrigger,
  wsChecklistEvent,
  currentUserRole,
  initialSubTab,
  embedded = false,
  hideDailyChecklist = false,
}: DailyScheduleViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { holidayMap } = useHolidays(i18n.language, new Date().getFullYear());
  // viewer 역할 제외한 멤버 목록
  const activeMembers = useMemo(
    () => boardMembers.filter((m) => m.role !== "viewer"),
    [boardMembers],
  );
  // 임베드 모드: 슬롯을 낮추고, 멤버 열은 고정폭 대신 남는 폭을 채운다
  const slotH: number = embedded ? EMBED_SLOT_HEIGHT : SLOT_HEIGHT;
  const memberColClass = embedded
    ? "flex-1 min-w-0"
    : "w-36 md:w-48 flex-shrink-0";
  const dayWrapClass = embedded ? "min-w-full" : "min-w-max";
  // 회의 오버레이 데이터
  const [overlayMeetings, setOverlayMeetings] = useState<MeetingSummary[]>([]);
  // 체크리스트 펼침 상태 (멤버별)
  const [expandedChecklists, setExpandedChecklists] = useState<Set<string>>(
    new Set(),
  );

  // W 단축키: bridge:toggleExpandCollapse 이벤트 리스너
  useEffect(() => {
    const handler = () => {
      setExpandedChecklists((prev) => {
        const allMemberIds = activeMembers.map((m) => m.userId);
        const allExpanded =
          allMemberIds.length > 0 && allMemberIds.every((id) => prev.has(id));
        if (allExpanded) {
          return new Set<string>();
        } else {
          return new Set(allMemberIds);
        }
      });
    };
    window.addEventListener("bridge:toggleExpandCollapse", handler);
    return () =>
      window.removeEventListener("bridge:toggleExpandCollapse", handler);
  }, [activeMembers]);

  const [viewMode, setViewMode] = useState<ScheduleViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<Date>(
    startOfDay(new Date()),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [columns, setColumns] = useState<ScheduleColumnInfo[]>([]);
  const [weeklyData, setWeeklyData] = useState<
    Map<string, ScheduleColumnInfo[]>
  >(new Map());
  const [settings, setSettings] = useState<ScheduleSettingsResponse | null>(
    null,
  );

  // 데일리 체크리스트 데이터
  const [dailyChecklists, setDailyChecklists] = useState<
    DailyChecklistColumnResponse[]
  >([]);

  // 드래그 선택 상태
  const [dragState, setDragState] = useState<{
    userId: string;
    startSlotIndex: number;
    endSlotIndex: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 터치 드래그 refs (모바일 long-press → 멀티슬롯 선택)
  const timeGridRef = useRef<HTMLDivElement>(null);
  const isTouchRef = useRef(false);
  const touchDragRef = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    startUserId: "",
    startSlotIndex: -1,
    endSlotIndex: -1,
    startX: 0,
    startY: 0,
    active: false,
  });

  // 선택된 블록 (상세 패널용)
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlockInfo | null>(
    null,
  );

  // 대기 중인 블록 생성 (Action Choice 모달용)
  const [pendingBlock, setPendingBlock] = useState<{
    userId: string;
    startTime: string;
    endTime: string;
    startSlotIndex: number;
    endSlotIndex: number;
    splitBlocks?: Array<{ startTime: string; endTime: string }>;
  } | null>(null);

  // 체크리스트 모달 상태 (선택 + 생성 통합)
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  // 데일리 체크리스트 추가 모달 상태
  const [showAddChecklistModal, setShowAddChecklistModal] = useState(false);
  const [addChecklistAssigneeId, setAddChecklistAssigneeId] =
    useState<string>("");

  // 설정 모달 상태
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // 주간 요약 모달 대상 멤버
  const [summaryMember, setSummaryMember] = useState<BoardMember | null>(null);

  // 설정에서 표시 모드 가져오기 (TIME -> time, BLOCK -> block)
  const displayMode: ScheduleDisplayMode =
    settings?.schedule_display_mode === "BLOCK" ? "block" : "time";

  // 설정에서 시간 범위 계산
  const workStartHour = settings ? parseHour(settings.work_start_time) : 9;
  const workEndHour = settings
    ? workStartHour + settings.work_hours_per_day
    : 19;

  // 점심시간 계산
  const breakStartMinutes = settings?.break_start_time
    ? (() => {
        const [h, m] = settings.break_start_time.split(":").map(Number);
        return h * 60 + m;
      })()
    : null;
  const breakEndMinutes = settings?.break_end_time
    ? (() => {
        const [h, m] = settings.break_end_time.split(":").map(Number);
        return h * 60 + m;
      })()
    : null;
  const hasBreak = breakStartMinutes !== null && breakEndMinutes !== null;

  const isBreakSlot = useCallback(
    (slotTime: string): boolean => {
      if (!hasBreak) return false;
      const [h, m] = slotTime.split(":").map(Number);
      const minutes = h * 60 + m;
      return minutes >= breakStartMinutes! && minutes < breakEndMinutes!;
    },
    [hasBreak, breakStartMinutes, breakEndMinutes],
  );

  const timeSlots = useMemo(
    () => generateTimeSlots(workStartHour, workEndHour),
    [workStartHour, workEndHour],
  );

  // 주 단위 날짜 배열 계산
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // 월요일 시작
    const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [selectedDate]);

  // 스케줄 데이터 로드
  const loadSchedule = useCallback(async () => {
    if (!boardId) return;

    setIsLoading(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      if (viewMode === "day") {
        // 통합 API로 스케줄 + 데일리 체크리스트 1회 로드 (기존 2회 → 1회)
        const response = await scheduleAPI.getDailyFull(
          boardId,
          dateStr,
          undefined,
          !!organizationId,
        );
        setColumns(response.columns);
        setSettings(response.settings);
        // 오늘의 체크리스트는 서버가 `기간 파생 + 핀 - 제외`를 병합해서 내려준다.
        // (예전에는 여기서 by-assignee를 따로 불러 가상 항목으로 합쳤고,
        //  그 목록을 타임블록 모달이 몰라서 두 화면이 어긋났다)
        setDailyChecklists(response.daily_checklists || []);
        setOverlayMeetings(
          (response.meetings || []).filter((m) => m.start_time && m.end_time),
        );
      } else {
        // 주 단위: 통합 API로 7일치 데이터 1회 로드 (기존 7회 → 1회)
        const startDateStr = format(weekDays[0], "yyyy-MM-dd");
        const endDateStr = format(weekDays[weekDays.length - 1], "yyyy-MM-dd");

        const response = await scheduleAPI.getWeeklySchedule(
          boardId,
          startDateStr,
          endDateStr,
          undefined,
          !!organizationId,
        );

        const newWeeklyData = new Map<string, ScheduleColumnInfo[]>();
        response.days.forEach(({ date, columns: cols }) => {
          newWeeklyData.set(date, cols);
        });
        if (response.settings) setSettings(response.settings);
        setWeeklyData(newWeeklyData);
      }
    } catch (error) {
      console.error("Failed to load schedule:", error);
    } finally {
      setIsLoading(false);
    }
  }, [
    boardId,
    selectedDate,
    viewMode,
    weekDays,
    organizationId,
  ]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule, refreshTrigger]);

  // WebSocket 체크리스트 이벤트 → 로컬 UI 업데이트 (API 호출 없음)
  useEffect(() => {
    if (!wsChecklistEvent) return;
    const { type, data } = wsChecklistEvent;
    const eventData = data as {
      item?: ChecklistItem;
      id?: string;
      task_id?: string;
    };

    if (type === "CHECKLIST_TOGGLED" || type === "CHECKLIST_UPDATED") {
      const item = eventData.item;
      if (!item) return;
      // 스케줄 블록의 체크리스트 완료 상태 업데이트
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          blocks: col.blocks.map((b) =>
            b.checklist_item && b.checklist_item.id === item.id
              ? {
                  ...b,
                  checklist_item: {
                    ...b.checklist_item,
                    completed: item.completed,
                  },
                }
              : b,
          ),
        })),
      );
      // 데일리 체크리스트 완료 상태 업데이트
      setDailyChecklists((prev) =>
        prev.map((col) => ({
          ...col,
          items: col.items.map((i) =>
            i.checklist_item_id === item.id
              ? { ...i, completed: item.completed }
              : i,
          ),
        })),
      );
    }
  }, [wsChecklistEvent]);

  // 스케줄 데이터가 변경되면 선택된 블록도 업데이트
  useEffect(() => {
    if (selectedBlock && columns.length > 0) {
      // 모든 컬럼에서 선택된 블록 찾기
      for (const col of columns) {
        const updatedBlock = col.blocks.find((b) => b.id === selectedBlock.id);
        if (updatedBlock) {
          setSelectedBlock(updatedBlock);
          break;
        }
      }
    }
  }, [columns]);

  // 날짜 네비게이션
  const handlePrev = () => {
    if (viewMode === "day") {
      setSelectedDate(subDays(selectedDate, 1));
    } else {
      setSelectedDate(subWeeks(selectedDate, 1));
    }
  };
  const handleNext = () => {
    if (viewMode === "day") {
      setSelectedDate(addDays(selectedDate, 1));
    } else {
      setSelectedDate(addWeeks(selectedDate, 1));
    }
  };
  const handleToday = () => setSelectedDate(startOfDay(new Date()));

  const dayOfWeek = formatDate(selectedDate, "EEEE");
  const isToday =
    format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  const isTodayInWeek = weekDays.some(
    (d) => format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"),
  );

  // 멤버별 블록 매핑
  const blocksByUser = useMemo(() => {
    const map = new Map<string, ScheduleBlockInfo[]>();
    columns.forEach((col) => {
      map.set(col.user.id, col.blocks);
    });
    return map;
  }, [columns]);

  // 멤버별 조직 크로스보드 블록 매핑 (읽기 전용 오버레이)
  const orgBlocksByUser = useMemo(() => {
    const map = new Map<string, ScheduleBlockInfo[]>();
    columns.forEach((col) => {
      if (col.org_blocks && col.org_blocks.length > 0) {
        map.set(col.user.id, col.org_blocks);
      }
    });
    return map;
  }, [columns]);

  // 선택 범위에서 기존 블록 시간을 제외한 가장 큰 빈 시간 찾기
  const findFreeTimeInRange = useCallback(
    (
      userId: string,
      rangeStartTime: string,
      rangeEndTime: string,
    ): { startTime: string; endTime: string } | null => {
      const blocks = blocksByUser.get(userId) || [];
      const rangeStart = timeToMin(rangeStartTime);
      const rangeEnd = timeToMin(rangeEndTime);

      // 범위와 겹치는 블록 (시작시간순 정렬)
      const overlapping = blocks
        .filter((b) => {
          const bStart = timeToMin(b.start_time);
          let bEnd = timeToMin(b.end_time);
          if (bEnd <= bStart) bEnd = workEndHour * 60;
          return bStart < rangeEnd && bEnd > rangeStart;
        })
        .sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time));

      if (overlapping.length === 0)
        return { startTime: rangeStartTime, endTime: rangeEndTime };

      // 빈 시간 갭 수집
      const gaps: Array<{ start: number; end: number }> = [];
      let cursor = rangeStart;

      for (const block of overlapping) {
        const bStart = timeToMin(block.start_time);
        let bEnd = timeToMin(block.end_time);
        if (bEnd <= bStart) bEnd = workEndHour * 60;

        if (bStart > cursor) {
          gaps.push({ start: cursor, end: Math.min(bStart, rangeEnd) });
        }
        cursor = Math.max(cursor, bEnd);
      }

      if (cursor < rangeEnd) {
        gaps.push({ start: cursor, end: rangeEnd });
      }

      if (gaps.length === 0) return null;

      // 가장 큰 빈 시간 선택
      const largest = gaps.reduce((max, gap) =>
        gap.end - gap.start > max.end - max.start ? gap : max,
      );

      if (largest.end - largest.start < 10) return null; // 최소 10분

      return {
        startTime: minToTime(largest.start),
        endTime: minToTime(largest.end),
      };
    },
    [blocksByUser, workEndHour],
  );

  // 선택 범위 → 빈 시간 찾기 + 점심시간 분할 (마우스/터치 공용)
  const computeSegments = useCallback(
    (
      userId: string,
      rawStartTime: string,
      rawEndTime: string,
    ): Array<{ startTime: string; endTime: string }> | null => {
      const freeTime = findFreeTimeInRange(userId, rawStartTime, rawEndTime);
      if (!freeTime) return null;

      const freeStartMin = timeToMin(freeTime.startTime);
      const freeEndMin = timeToMin(freeTime.endTime);
      const segments: Array<{ startTime: string; endTime: string }> = [];

      if (
        hasBreak &&
        breakStartMinutes != null &&
        breakEndMinutes != null &&
        freeStartMin < breakEndMinutes &&
        freeEndMin > breakStartMinutes
      ) {
        // 점심시간과 겹침 → 분할
        if (freeStartMin < breakStartMinutes) {
          segments.push({
            startTime: freeTime.startTime,
            endTime: minToTime(breakStartMinutes),
          });
        }
        if (freeEndMin > breakEndMinutes) {
          segments.push({
            startTime: minToTime(breakEndMinutes),
            endTime: freeTime.endTime,
          });
        }
      } else {
        segments.push({
          startTime: freeTime.startTime,
          endTime: freeTime.endTime,
        });
      }

      return segments.length > 0 ? segments : null;
    },
    [findFreeTimeInRange, hasBreak, breakStartMinutes, breakEndMinutes],
  );

  // 터치 핸들러용 ref (stale closure 방지)
  const computeSegmentsRef = useRef(computeSegments);
  useEffect(() => {
    computeSegmentsRef.current = computeSegments;
  }, [computeSegments]);

  // 슬롯별 가변 높이 계산: 짧은 블록이 있는 슬롯을 확장
  const slotHeightData = useMemo(() => {
    const heights = timeSlots.map(() => slotH);
    const workStartMin = workStartHour * 60;

    for (const col of columns) {
      const allBlocks = [...col.blocks, ...(col.org_blocks || [])];
      for (const block of allBlocks) {
        const bStart = timeToMin(block.start_time);
        let bEnd = timeToMin(block.end_time);
        if (bEnd <= bStart) bEnd = workEndHour * 60; // overnight
        const bDuration = bEnd - bStart;
        const naturalHeight = (bDuration / 30) * slotH;

        if (naturalHeight >= MIN_BLOCK_HEIGHT) continue;

        // 짧은 블록 → 해당 슬롯 확장
        const scaleFactor = MIN_BLOCK_HEIGHT / naturalHeight;
        const startSlotIdx = Math.floor((bStart - workStartMin) / 30);
        const endSlotIdx = Math.ceil((bEnd - workStartMin) / 30) - 1;

        for (
          let i = Math.max(0, startSlotIdx);
          i <= Math.min(endSlotIdx, heights.length - 1);
          i++
        ) {
          heights[i] = Math.max(heights[i], slotH * scaleFactor);
        }
      }
    }

    // 누적 오프셋 (절대 Y 위치 계산용)
    const offsets = [0];
    for (let i = 0; i < heights.length; i++) {
      offsets.push(offsets[i] + heights[i]);
    }

    return { heights, offsets, totalHeight: offsets[offsets.length - 1] };
  }, [timeSlots, columns, workStartHour, workEndHour, slotH]);

  // 분(minutes) → 픽셀 위치 변환 (가변 슬롯 높이 반영)
  const minutesToPx = useCallback(
    (minutes: number): number => {
      const { heights, offsets } = slotHeightData;
      const minFromStart = minutes - workStartHour * 60;
      if (minFromStart <= 0) return 0;

      const slotIdx = Math.floor(minFromStart / 30);
      const minInSlot = minFromStart % 30;

      if (slotIdx >= heights.length) return offsets[heights.length];

      return offsets[slotIdx] + (minInSlot / 30) * heights[slotIdx];
    },
    [slotHeightData, workStartHour],
  );

  // 픽셀 → 분 역변환 (드래그/리사이즈용)
  const pxToMinutes = useCallback(
    (px: number): number => {
      const { heights, offsets } = slotHeightData;
      if (px <= 0) return workStartHour * 60;

      let slotIdx = 0;
      while (slotIdx < heights.length && offsets[slotIdx + 1] <= px) {
        slotIdx++;
      }

      if (slotIdx >= heights.length) return workEndHour * 60;

      const pxInSlot = px - offsets[slotIdx];
      const minInSlot = (pxInSlot / heights[slotIdx]) * 30;

      return workStartHour * 60 + slotIdx * 30 + minInSlot;
    },
    [slotHeightData, workStartHour, workEndHour],
  );

  // Viewer 권한 여부
  const isViewer = currentUserRole === "viewer";

  // 드래그 시작
  const handleMouseDown = (
    e: React.MouseEvent,
    userId: string,
    slotIndex: number,
  ) => {
    // Viewer는 타임블록 생성 불가
    if (isViewer) return;
    // 터치 이벤트 진행 중이면 합성 마우스 이벤트 무시
    if (isTouchRef.current) return;

    e.preventDefault(); // 텍스트 선택 방지
    setIsDragging(true);
    setDragState({
      userId,
      startSlotIndex: slotIndex,
      endSlotIndex: slotIndex,
    });
  };

  // 드래그 중
  const handleMouseEnter = (userId: string, slotIndex: number) => {
    if (!isDragging || !dragState) return;
    if (dragState.userId !== userId) return;

    setDragState({
      ...dragState,
      endSlotIndex: slotIndex,
    });
  };

  // 드래그 종료
  const handleMouseUp = () => {
    if (!isDragging || !dragState) {
      setIsDragging(false);
      setDragState(null);
      return;
    }

    const { userId, startSlotIndex, endSlotIndex } = dragState;
    const minIndex = Math.min(startSlotIndex, endSlotIndex);
    const maxIndex = Math.max(startSlotIndex, endSlotIndex);

    // 최소 1슬롯 이상 선택해야 함
    if (maxIndex - minIndex >= 0) {
      const rawStartTime = timeSlots[minIndex];
      const rawEndTime = timeSlots[maxIndex + 1] || `${workEndHour}:00`;

      // 기존 블록 시간 제외 + 점심시간 분할
      const segments = computeSegments(userId, rawStartTime, rawEndTime);
      if (!segments) {
        setIsDragging(false);
        setDragState(null);
        return;
      }

      // 체크리스트 모달 열기
      setPendingBlock({
        userId,
        startTime: segments[0].startTime,
        endTime: segments[segments.length - 1].endTime,
        startSlotIndex: minIndex,
        endSlotIndex: maxIndex,
        splitBlocks: segments.length > 1 ? segments : undefined,
      });
      setShowChecklistModal(true);
    }

    setIsDragging(false);
    setDragState(null);
  };

  // 셀이 드래그 선택 영역에 포함되는지 확인
  const isSlotSelected = (userId: string, slotIndex: number) => {
    if (!dragState || dragState.userId !== userId) return false;
    const minIndex = Math.min(dragState.startSlotIndex, dragState.endSlotIndex);
    const maxIndex = Math.max(dragState.startSlotIndex, dragState.endSlotIndex);
    return slotIndex >= minIndex && slotIndex <= maxIndex;
  };

  // 블록 클릭 핸들러
  const handleBlockClick = (block: ScheduleBlockInfo) => {
    setSelectedBlock(block);
  };

  // 패널 닫기
  const handleClosePanel = () => {
    setSelectedBlock(null);
  };

  // 블록 삭제 후 처리
  const handleBlockDeleted = () => {
    setSelectedBlock(null);
    loadSchedule();
  };

  // 체크리스트 토글 후 처리
  const handleChecklistToggled = () => {
    loadSchedule();
  };

  // 새 체크리스트 아이템 생성 후 블록 생성
  const handleChecklistCreate = async (taskId: string, title: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const segments = pendingBlock.splitBlocks || [
        { startTime: pendingBlock.startTime, endTime: pendingBlock.endTime },
      ];

      // 첫 세그먼트: createWithChecklistItem → checklist_item.id 획득
      const result = await scheduleAPI.createWithChecklistItem(boardId, {
        assignee_id: pendingBlock.userId,
        scheduled_date: dateStr,
        start_time: segments[0].startTime,
        end_time: segments[0].endTime,
        checklist_item: {
          task_id: taskId,
          title: title,
        },
      });
      // 나머지 세그먼트: 같은 checklist_item_id로 블록 생성
      for (let i = 1; i < segments.length; i++) {
        await scheduleAPI.createBlock(boardId, {
          checklist_item_id: result.checklist_item!.id,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: segments[i].startTime,
          end_time: segments[i].endTime,
        });
      }
      await loadSchedule();
    } catch (error) {
      console.error("Failed to create block with new checklist item:", error);
    }
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 기존 체크리스트 아이템 선택 후 블록 생성
  const handleChecklistItemSelect = async (checklistItemId: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const segments = pendingBlock.splitBlocks || [
        { startTime: pendingBlock.startTime, endTime: pendingBlock.endTime },
      ];

      for (const seg of segments) {
        await scheduleAPI.createBlock(boardId, {
          checklist_item_id: checklistItemId,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: seg.startTime,
          end_time: seg.endTime,
        });
      }
      await loadSchedule();
    } catch (error) {
      console.error("Failed to create block with checklist item:", error);
    }
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 보드 체크리스트 항목 선택 → 데일리 체크리스트 추가 + 타임블록 생성
  const handleBoardChecklistItemSelect = async (checklistItemId: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const segments = pendingBlock.splitBlocks || [
        { startTime: pendingBlock.startTime, endTime: pendingBlock.endTime },
      ];

      // 1) 데일리 체크리스트에 추가 (한 번만)
      await dailyChecklistAPI.addItem(boardId, {
        checklist_item_id: checklistItemId,
        assignee_id: pendingBlock.userId,
        assigned_date: dateStr,
      });
      // 2) 타임블록 생성 (세그먼트별)
      for (const seg of segments) {
        await scheduleAPI.createBlock(boardId, {
          checklist_item_id: checklistItemId,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: seg.startTime,
          end_time: seg.endTime,
        });
      }
      await loadSchedule();
    } catch (error) {
      console.error(
        "Failed to add board checklist item and create block:",
        error,
      );
    }
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 회의 선택 후 블록 생성
  const handleMeetingSelect = async (meetingId: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const segments = pendingBlock.splitBlocks || [
        { startTime: pendingBlock.startTime, endTime: pendingBlock.endTime },
      ];

      for (const seg of segments) {
        await scheduleAPI.createBlock(boardId, {
          meeting_id: meetingId,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: seg.startTime,
          end_time: seg.endTime,
        });
      }
      await loadSchedule();
    } catch (error) {
      console.error("Failed to create block with meeting:", error);
    }
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 커스텀 블록 생성
  const handleCustomCreate = async (title: string, color: string) => {
    if (!pendingBlock) return;

    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const segments = pendingBlock.splitBlocks || [
        { startTime: pendingBlock.startTime, endTime: pendingBlock.endTime },
      ];

      for (const seg of segments) {
        await scheduleAPI.createBlock(boardId, {
          block_type: "CUSTOM",
          title,
          color,
          assignee_id: pendingBlock.userId,
          scheduled_date: dateStr,
          start_time: seg.startTime,
          end_time: seg.endTime,
        });
      }

      setPendingBlock(null);
      setShowChecklistModal(false);
      await loadSchedule();
    } catch (error) {
      console.error("Failed to create custom block:", error);
    }
  };

  // 체크리스트 모달 닫기
  const handleCloseChecklistModal = () => {
    setShowChecklistModal(false);
    setPendingBlock(null);
  };

  // 현재 시간 표시선용 상태 (1분마다 갱신)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // 현재 시간의 Y 위치 계산 (px) - 가변 슬롯 높이 반영
  const currentTimeTop = useMemo(() => {
    if (!isToday || viewMode !== "day") return null;
    const h = now.getHours();
    const m = now.getMinutes();
    const totalMin = h * 60 + m;
    if (totalMin < workStartHour * 60 || totalMin > workEndHour * 60)
      return null;
    return minutesToPx(totalMin);
  }, [now, isToday, viewMode, workStartHour, workEndHour, minutesToPx]);

  // 현재 시간 표시선이 보이도록 자동 스크롤
  const timeIndicatorRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (
      currentTimeTop != null &&
      timeIndicatorRef.current &&
      !hasScrolledRef.current
    ) {
      timeIndicatorRef.current.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
      hasScrolledRef.current = true;
    }
  }, [currentTimeTop]);
  // 날짜가 바뀌면 스크롤 플래그 리셋
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [selectedDate]);

  // 모바일 터치 드래그 (long-press 400ms → 멀티슬롯 선택)
  useEffect(() => {
    const el = timeGridRef.current;
    if (!el || isViewer || viewMode !== "day") return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      const target = e.target as HTMLElement;
      const cell = target.closest("[data-slotinfo]") as HTMLElement | null;
      if (!cell) return;

      const [userId, slotIndexStr] = cell.dataset.slotinfo!.split(":");
      const slotIndex = parseInt(slotIndexStr, 10);
      const slotTime = timeSlots[slotIndex];
      if (isBreakSlot(slotTime)) return;

      isTouchRef.current = true;
      touchDragRef.current = {
        timer: setTimeout(() => {
          touchDragRef.current.active = true;
          setIsDragging(true);
          setDragState({
            userId,
            startSlotIndex: slotIndex,
            endSlotIndex: slotIndex,
          });
          try {
            navigator.vibrate?.(30);
          } catch {}
        }, 400),
        startUserId: userId,
        startSlotIndex: slotIndex,
        endSlotIndex: slotIndex,
        startX: touch.clientX,
        startY: touch.clientY,
        active: false,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const d = touchDragRef.current;
      const touch = e.touches[0];

      if (!d.active) {
        // 긴 누르기 전에 움직이면 타이머 취소 (스크롤 허용)
        if (
          d.timer &&
          (Math.abs(touch.clientX - d.startX) > 10 ||
            Math.abs(touch.clientY - d.startY) > 10)
        ) {
          clearTimeout(d.timer);
          d.timer = null;
        }
        return;
      }

      // 드래그 활성 상태: 스크롤 및 텍스트 선택 방지
      e.preventDefault();
      e.stopPropagation();

      const target = document.elementFromPoint(
        touch.clientX,
        touch.clientY,
      ) as HTMLElement | null;
      const cell = target?.closest("[data-slotinfo]") as HTMLElement | null;
      if (cell && cell.dataset.slotinfo) {
        const [userId, slotIndexStr] = cell.dataset.slotinfo.split(":");
        const slotIndex = parseInt(slotIndexStr, 10);

        // 같은 멤버 컬럼 내에서만 드래그 허용
        if (userId === d.startUserId) {
          d.endSlotIndex = slotIndex;
          setDragState({
            userId: d.startUserId,
            startSlotIndex: d.startSlotIndex,
            endSlotIndex: slotIndex,
          });
        }
      }
    };

    const handleTouchEnd = () => {
      const d = touchDragRef.current;
      if (d.timer) {
        clearTimeout(d.timer);
        d.timer = null;
      }

      if (d.active) {
        const minIndex = Math.min(d.startSlotIndex, d.endSlotIndex);
        const maxIndex = Math.max(d.startSlotIndex, d.endSlotIndex);

        if (maxIndex - minIndex >= 0) {
          const rawStartTime = timeSlots[minIndex];
          const rawEndTime = timeSlots[maxIndex + 1] || `${workEndHour}:00`;

          // 기존 블록 시간 제외 + 점심시간 분할
          const segments = computeSegmentsRef.current(
            d.startUserId,
            rawStartTime,
            rawEndTime,
          );
          if (segments) {
            setPendingBlock({
              userId: d.startUserId,
              startTime: segments[0].startTime,
              endTime: segments[segments.length - 1].endTime,
              startSlotIndex: minIndex,
              endSlotIndex: maxIndex,
              splitBlocks: segments.length > 1 ? segments : undefined,
            });
            setShowChecklistModal(true);
          }
        }
      }

      d.active = false;
      d.startUserId = "";
      d.startSlotIndex = -1;
      d.endSlotIndex = -1;
      setIsDragging(false);
      setDragState(null);

      // 합성 마우스 이벤트 방지를 위해 약간 지연 후 터치 플래그 해제
      setTimeout(() => {
        isTouchRef.current = false;
      }, 300);
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      if (touchDragRef.current.timer) {
        clearTimeout(touchDragRef.current.timer);
      }
    };
  }, [isViewer, viewMode, timeSlots, isBreakSlot, workEndHour]);

  // selectedBlock을 ref로 추적 (handleBlockResize의 stale closure 방지)
  const selectedBlockRef = useRef(selectedBlock);
  useEffect(() => {
    selectedBlockRef.current = selectedBlock;
  }, [selectedBlock]);

  // 블록 리사이즈/이동 처리
  const handleBlockResize = useCallback(
    async (blockId: string, startTime: string, endTime: string) => {
      // Optimistic update: 로컬 state를 먼저 업데이트하여 깜빡임 방지
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          blocks: col.blocks.map((b) =>
            b.id === blockId
              ? { ...b, start_time: startTime, end_time: endTime }
              : b,
          ),
        })),
      );

      // 선택된 블록이면 상세 패널도 즉시 업데이트
      const currentSelected = selectedBlockRef.current;
      if (currentSelected && currentSelected.id === blockId) {
        setSelectedBlock({
          ...currentSelected,
          start_time: startTime,
          end_time: endTime,
        });
      }

      try {
        await scheduleAPI.updateBlock(boardId, blockId, {
          start_time: startTime,
          end_time: endTime,
        });
      } catch (error) {
        console.error("[Schedule] Failed to update block:", error);
      } finally {
        // 성공/실패 모두 서버 데이터로 동기화 (에러 시 원래 상태 복구)
        await loadSchedule();
      }
    },
    [boardId, loadSchedule],
  );

  // 블록 분할 리사이즈/이동 처리 (점심시간을 걸칠 때)
  const handleBlockSplitResize = useCallback(
    async (
      blockId: string,
      segments: Array<{ startTime: string; endTime: string }>,
    ) => {
      if (segments.length === 0) return;

      // 대상 블록과 사용자 찾기
      let targetBlock: ScheduleBlockInfo | null = null;
      let targetUserId: string | null = null;
      for (const col of columns) {
        const found = col.blocks.find((b) => b.id === blockId);
        if (found) {
          targetBlock = found;
          targetUserId = col.user.id;
          break;
        }
      }
      if (!targetBlock || !targetUserId) return;

      try {
        const dateStr = format(selectedDate, "yyyy-MM-dd");

        // 첫 번째 세그먼트: 기존 블록 업데이트
        await scheduleAPI.updateBlock(boardId, blockId, {
          start_time: segments[0].startTime,
          end_time: segments[0].endTime,
        });

        // 나머지 세그먼트: 같은 체크리스트/회의로 새 블록 생성
        for (let i = 1; i < segments.length; i++) {
          if (targetBlock.meeting) {
            await scheduleAPI.createBlock(boardId, {
              meeting_id: targetBlock.meeting.id,
              assignee_id: targetUserId,
              scheduled_date: dateStr,
              start_time: segments[i].startTime,
              end_time: segments[i].endTime,
            });
          } else if (targetBlock.checklist_item) {
            await scheduleAPI.createBlock(boardId, {
              checklist_item_id: targetBlock.checklist_item.id,
              assignee_id: targetUserId,
              scheduled_date: dateStr,
              start_time: segments[i].startTime,
              end_time: segments[i].endTime,
            });
          }
        }
      } catch (error) {
        console.error("[Schedule] Failed to split block:", error);
      } finally {
        await loadSchedule();
      }
    },
    [boardId, columns, selectedDate, loadSchedule],
  );

  return (
    <div
      className="h-full flex flex-col"
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (isDragging) {
          setIsDragging(false);
          setDragState(null);
        }
      }}
    >
      {/* 상단 날짜 네비게이션 */}
      <div
        className={
          embedded
            ? "flex items-center justify-between px-3 py-1.5 border-b border-foreground/[0.08] gap-2"
            : "flex items-center justify-between px-3 md:px-6 py-2 md:py-3 bg-bridge-surface border-b border-bridge-border gap-2"
        }
      >
        <div
          className={
            embedded
              ? "flex items-center gap-1 min-w-0 w-full"
              : "flex items-center gap-2 md:gap-4 flex-wrap min-w-0"
          }
        >
          {/* 일/주 토글 — 임베드 모드에선 "오늘" 하루만 다루므로 감춘다 */}
          {!embedded && (
            <div
              className="flex bg-bridge-dark rounded-lg p-1 cursor-pointer"
              onClick={() => setViewMode(viewMode === "day" ? "week" : "day")}
            >
              <span
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === "day"
                    ? "bg-bridge-surface-hover text-foreground"
                    : "text-zinc-400"
                }`}
              >
                {t("dailySchedule.day")}
              </span>
              <span
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === "week"
                    ? "bg-bridge-surface-hover text-foreground"
                    : "text-zinc-400"
                }`}
              >
                {t("dailySchedule.week")}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              className="text-zinc-400 hover:text-foreground hover:bg-foreground/5 h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span
              className={
                embedded
                  ? "text-xs font-bold text-foreground text-center whitespace-nowrap"
                  : "text-sm md:text-lg font-bold text-foreground min-w-0 sm:min-w-[280px] text-center whitespace-nowrap"
              }
            >
              {embedded
                ? `${formatDate(selectedDate, "M/d")} (${dayOfWeek})`
                : viewMode === "day"
                  ? `${formatDate(selectedDate, t("dailySchedule.dateFormatDay"))} (${dayOfWeek})`
                  : `${formatDate(weekDays[0], t("dailySchedule.dateFormatWeek"))} - ${formatDate(weekDays[6], t("dailySchedule.dateFormatWeek"))}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              className="text-zinc-400 hover:text-foreground hover:bg-foreground/5 h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant={
              (viewMode === "day" ? isToday : isTodayInWeek)
                ? "default"
                : "outline"
            }
            size="sm"
            onClick={handleToday}
            className={`${
              (viewMode === "day" ? isToday : isTodayInWeek)
                ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white"
                : "border-bridge-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            } ${embedded ? "ml-auto h-6 px-2.5 text-xs" : ""}`}
          >
            {t("dailySchedule.today")}
          </Button>
          {isLoading && (
            <Loader2 className="h-4 w-4 text-zinc-400 animate-spin" />
          )}
        </div>
        {!embedded &&
          (currentUserRole === "owner" || currentUserRole === "admin") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettingsModal(true)}
              className="border-bridge-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <Settings className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">
                {t("dailySchedule.settings")}
              </span>
            </Button>
          )}
      </div>

      {/* 타임블록 스케줄 그리드 + 상세 패널 */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-auto custom-scrollbar min-w-0">
          {viewMode === "day" ? (
            /* 일 단위 뷰 */
            <div className={dayWrapClass}>
              {/* 헤더: 시간/블록 + 멤버 컬럼 — 임베드 모드는 내 열 하나뿐이라 감춘다 */}
              <div
                className={`flex sticky top-0 bg-bridge-surface z-10 border-b border-bridge-border ${embedded ? "hidden" : ""}`}
              >
                <div className="w-14 md:w-20 flex-shrink-0 p-2 md:p-3 text-xs md:text-sm font-medium text-zinc-400 border-r border-bridge-border">
                  {displayMode === "block"
                    ? t("dailySchedule.block")
                    : t("dailySchedule.time")}
                </div>
                {activeMembers.map((member) => (
                  <div
                    key={member.userId}
                    className="w-36 md:w-48 flex-shrink-0 p-2 md:p-3 border-r border-bridge-border"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-medium"
                        style={{
                          backgroundColor: getAssigneeHex(
                            member.name,
                            member.assigneeColor,
                          ),
                        }}
                      >
                        {getInitials(member.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate block">
                          {member.name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                          {member.jobRole && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none shrink-0"
                              style={{
                                backgroundColor: `${member.jobRole.color || "#6366F1"}26`,
                                color: member.jobRole.color || "#6366F1",
                              }}
                              title={t("jobRole.title")}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    member.jobRole.color || "#6366F1",
                                }}
                              />
                              <span className="truncate max-w-[80px]">
                                {member.jobRole.name}
                              </span>
                            </span>
                          )}
                          <button
                            onClick={() => setSummaryMember(member)}
                            className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors shrink-0"
                          >
                            {t("dailySummary.summaryButton")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {activeMembers.length === 0 && (
                  <div className="flex-1 p-3 text-zinc-400 text-sm">
                    {t("dailySchedule.noMembers")}
                  </div>
                )}
              </div>

              {/* 데일리 체크리스트 영역 */}
              {!hideDailyChecklist && (
                <div className="flex border-b border-bridge-border bg-foreground/[0.02]">
                  <div className="w-14 md:w-20 flex-shrink-0 p-2 text-xs text-zinc-400 border-r border-bridge-border flex items-center justify-center">
                    <CheckSquare className="h-3.5 w-3.5" />
                  </div>
                  {activeMembers.map((member) => {
                    const memberChecklist = dailyChecklists.find(
                      (c) => c.user.id === member.userId,
                    );
                    const items = memberChecklist?.items || [];

                    return (
                      <div
                        key={`checklist-${member.userId}`}
                        className="w-36 md:w-48 flex-shrink-0 p-2 border-r border-bridge-border"
                      >
                        <EmbeddedDailyChecklist
                          boardId={boardId}
                          items={items}
                          isViewer={isViewer}
                          isExpanded={expandedChecklists.has(member.userId)}
                          onToggleExpand={() => {
                            setExpandedChecklists((prev) => {
                              const next = new Set(prev);
                              if (next.has(member.userId))
                                next.delete(member.userId);
                              else next.add(member.userId);
                              return next;
                            });
                          }}
                          onToggle={async (
                            itemId,
                            checklistItemId,
                            taskId,
                            newCompleted,
                          ) => {
                            // 낙관적 업데이트 - 체크리스트
                            setDailyChecklists((prev) =>
                              prev.map((col) => ({
                                ...col,
                                items: col.items.map((i) =>
                                  i.id === itemId
                                    ? { ...i, completed: newCompleted }
                                    : i,
                                ),
                              })),
                            );
                            // 낙관적 업데이트 - 스케줄 블록
                            setColumns((prev) =>
                              prev.map((col) => ({
                                ...col,
                                blocks: col.blocks.map((b) =>
                                  b.checklist_item &&
                                  b.checklist_item.id === checklistItemId
                                    ? {
                                        ...b,
                                        checklist_item: {
                                          ...b.checklist_item,
                                          completed: newCompleted,
                                        },
                                      }
                                    : b,
                                ),
                              })),
                            );
                            try {
                              await checklistAPI.toggleItem(
                                boardId,
                                taskId,
                                checklistItemId,
                              );
                            } catch {
                              // 실패 시 원복
                              setDailyChecklists((prev) =>
                                prev.map((col) => ({
                                  ...col,
                                  items: col.items.map((i) =>
                                    i.id === itemId
                                      ? { ...i, completed: !newCompleted }
                                      : i,
                                  ),
                                })),
                              );
                              setColumns((prev) =>
                                prev.map((col) => ({
                                  ...col,
                                  blocks: col.blocks.map((b) =>
                                    b.checklist_item &&
                                    b.checklist_item.id === checklistItemId
                                      ? {
                                          ...b,
                                          checklist_item: {
                                            ...b.checklist_item,
                                            completed: !newCompleted,
                                          },
                                        }
                                      : b,
                                  ),
                                })),
                              );
                              throw new Error("Toggle failed");
                            }
                          }}
                          onRefresh={loadSchedule}
                          onAddClick={() => {
                            setAddChecklistAssigneeId(member.userId);
                            setShowAddChecklistModal(true);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 시간 그리드 */}
              <div ref={timeGridRef} className="relative select-none">
                {timeSlots.map((time, slotIndex) => {
                  const isBreak = isBreakSlot(time);
                  return (
                    <div
                      key={time}
                      className={`flex border-b border-bridge-border ${isBreak ? "bg-amber-900/5" : ""}`}
                      style={{
                        height: `${slotHeightData.heights[slotIndex]}px`,
                      }}
                    >
                      {/* 시간/블록 라벨 */}
                      <div
                        className={`w-14 md:w-20 flex-shrink-0 p-2 text-xs border-r border-bridge-border bg-bridge-dark ${isBreak ? "text-amber-500/50" : "text-zinc-400"}`}
                      >
                        {displayMode === "block"
                          ? `${slotIndex + 1}`
                          : time.endsWith(":00")
                            ? time
                            : ""}
                      </div>
                      {/* 멤버별 시간 셀 */}
                      {activeMembers.map((member) => {
                        const isSelected = isSlotSelected(
                          member.userId,
                          slotIndex,
                        );
                        return (
                          <div
                            key={`${member.userId}-${time}`}
                            data-slotinfo={`${member.userId}:${slotIndex}`}
                            className={`${memberColClass} border-r border-bridge-border transition-colors group relative h-full ${
                              isBreak
                                ? isDragging
                                  ? "cursor-pointer"
                                  : "cursor-not-allowed"
                                : isViewer
                                  ? "cursor-default"
                                  : "cursor-pointer"
                            } ${
                              isBreak
                                ? isSelected
                                  ? "bg-bridge-secondary/5"
                                  : ""
                                : isSelected
                                  ? "bg-bridge-secondary/20"
                                  : isViewer
                                    ? ""
                                    : "hover:bg-foreground/5"
                            }`}
                            onMouseDown={
                              isBreak
                                ? undefined
                                : (e) =>
                                    handleMouseDown(e, member.userId, slotIndex)
                            }
                            onMouseEnter={
                              isBreak && !isDragging
                                ? undefined
                                : () =>
                                    handleMouseEnter(member.userId, slotIndex)
                            }
                          >
                            {/* 점심시간 빗금 오버레이 */}
                            {isBreak && (
                              <div
                                className="absolute inset-0 opacity-20 pointer-events-none"
                                style={{
                                  backgroundImage:
                                    "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(245,158,11,0.15) 4px, rgba(245,158,11,0.15) 8px)",
                                }}
                              />
                            )}
                            {/* 빈 셀 호버 시 + 버튼 표시 (Viewer 제외, 점심시간 제외) */}
                            {!isBreak && !isSelected && !isViewer && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <Plus className="h-4 w-4 text-zinc-400" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {activeMembers.length === 0 && (
                        <div className="flex-1 border-r border-bridge-border h-full" />
                      )}
                    </div>
                  );
                })}

                {/* 현재 시간 표시선 */}
                {currentTimeTop != null && (
                  <div
                    ref={timeIndicatorRef}
                    className="absolute left-0 right-0 z-[5] pointer-events-none flex items-center"
                    style={{ top: `${currentTimeTop}px` }}
                  >
                    {/* 왼쪽 시간 라벨 */}
                    <div className="w-14 md:w-20 flex-shrink-0 flex justify-end pr-1">
                      <span className="text-xs font-bold text-red-400 bg-red-500/20 px-1 rounded">
                        {now.getHours().toString().padStart(2, "0")}:
                        {now.getMinutes().toString().padStart(2, "0")}
                      </span>
                    </div>
                    {/* 빨간 선 */}
                    <div className="flex-1 flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                      <div className="flex-1 h-[2px] bg-red-500/70" />
                    </div>
                  </div>
                )}

                {/* 스케줄 블록들 (각 멤버 컬럼 위에 absolute로 배치) */}
                <div className="absolute top-0 left-14 md:left-20 right-0 pointer-events-none">
                  <div className="flex">
                    {activeMembers.map((member) => {
                      const blocks = blocksByUser.get(member.userId) || [];
                      const orgBlocks =
                        orgBlocksByUser.get(member.userId) || [];
                      return (
                        <div
                          key={member.userId}
                          className={`${memberColClass} relative`}
                          style={{ height: `${slotHeightData.totalHeight}px` }}
                        >
                          {blocks.map((block) => (
                            <ScheduleBlock
                              key={block.id}
                              block={block}
                              slotHeight={slotH}
                              workStartHour={workStartHour}
                              workEndHour={workEndHour}
                              otherBlocks={blocks}
                              breakStartTime={settings?.break_start_time}
                              breakEndTime={settings?.break_end_time}
                              minutesToPx={minutesToPx}
                              pxToMinutes={pxToMinutes}
                              onClick={handleBlockClick}
                              onResize={handleBlockResize}
                              onMove={handleBlockResize}
                              onSplitResize={handleBlockSplitResize}
                            />
                          ))}
                          {/* Cross-board org schedule blocks (read-only overlay) */}
                          {orgBlocks.map((block) => (
                            <ScheduleBlock
                              key={`org-${block.id}`}
                              block={block}
                              slotHeight={slotH}
                              workStartHour={workStartHour}
                              workEndHour={workEndHour}
                              otherBlocks={blocks}
                              breakStartTime={settings?.break_start_time}
                              breakEndTime={settings?.break_end_time}
                              minutesToPx={minutesToPx}
                              pxToMinutes={pxToMinutes}
                              isOrgOverlay={true}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 회의 오버레이 (전체 컬럼 가로 스팬) */}
                {overlayMeetings.length > 0 && (
                  <div className="absolute top-0 left-14 md:left-20 right-0 pointer-events-none z-[5]">
                    {overlayMeetings.map((meeting) => {
                      const startParts = meeting.start_time!.split(":");
                      const endParts = meeting.end_time!.split(":");
                      const startMinutes =
                        parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
                      let endMinutes =
                        parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
                      // Overnight: cap to work end
                      if (endMinutes < startMinutes) {
                        endMinutes = workEndHour * 60;
                      }
                      const top = minutesToPx(startMinutes);
                      const height = Math.max(
                        minutesToPx(endMinutes) - top,
                        slotH,
                      );

                      if (top < 0) return null;

                      return (
                        <div
                          key={`overlay-${meeting.id}`}
                          className="absolute left-0 right-0 rounded-lg border-2 border-dashed cursor-pointer pointer-events-auto hover:opacity-80 transition-opacity"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            backgroundColor: `${meeting.color}15`,
                            borderColor: `${meeting.color}50`,
                          }}
                          onClick={() =>
                            navigate(
                              `?view=meeting&date=${meeting.meeting_date}`,
                            )
                          }
                        >
                          <div className="flex items-center gap-1.5 px-3 py-1 overflow-hidden">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: meeting.color }}
                            />
                            <span
                              className="text-xs font-medium truncate"
                              style={{ color: meeting.color }}
                            >
                              {meeting.title}
                            </span>
                            {meeting.start_time && (
                              <span
                                className="text-xs opacity-60 flex-shrink-0"
                                style={{ color: meeting.color }}
                              >
                                {meeting.start_time.slice(0, 5)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* 주 단위 뷰 */
            <div className="min-w-max">
              {/* 헤더: 멤버 + 요일 */}
              <div className="flex sticky top-0 bg-bridge-surface z-10 border-b border-bridge-border">
                <div className="w-24 md:w-32 flex-shrink-0 p-2 md:p-3 text-xs md:text-sm font-medium text-zinc-400 border-r border-bridge-border">
                  멤버
                </div>
                {weekDays.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const isCurrentDay =
                    dateStr === format(new Date(), "yyyy-MM-dd");
                  const isHoliday = holidayMap.has(dateStr);
                  const dayOfWeek = day.getDay();
                  return (
                    <div
                      key={dateStr}
                      className={`w-28 md:w-36 flex-shrink-0 p-2 md:p-3 border-r border-bridge-border text-center ${
                        isCurrentDay ? "bg-bridge-secondary/10" : ""
                      }`}
                    >
                      <div
                        className={`text-sm font-medium ${isCurrentDay ? "text-bridge-secondary" : isHoliday || dayOfWeek === 0 ? "text-red-400" : "text-foreground"}`}
                      >
                        {formatDate(day, "E")}
                      </div>
                      <div
                        className={`text-xs ${isCurrentDay ? "text-bridge-secondary" : isHoliday || dayOfWeek === 0 ? "text-red-400" : "text-zinc-400"}`}
                      >
                        {formatDate(day, "M/d")}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 멤버별 행 */}
              {activeMembers.map((member) => (
                <div
                  key={member.userId}
                  className="flex border-b border-bridge-border"
                >
                  {/* 멤버 정보 */}
                  <div className="w-24 md:w-32 flex-shrink-0 p-2 md:p-3 border-r border-bridge-border bg-bridge-dark">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-medium"
                        style={{
                          backgroundColor: getAssigneeHex(
                            member.name,
                            member.assigneeColor,
                          ),
                        }}
                      >
                        {getInitials(member.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate block">
                          {member.name}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5 min-w-0 flex-wrap">
                          {member.jobRole && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none shrink-0"
                              style={{
                                backgroundColor: `${member.jobRole.color || "#6366F1"}26`,
                                color: member.jobRole.color || "#6366F1",
                              }}
                              title={t("jobRole.title")}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    member.jobRole.color || "#6366F1",
                                }}
                              />
                              <span className="truncate max-w-[60px]">
                                {member.jobRole.name}
                              </span>
                            </span>
                          )}
                          <button
                            onClick={() => setSummaryMember(member)}
                            className="text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors shrink-0"
                          >
                            요약
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 요일별 블록들 */}
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const isCurrentDay =
                      dateStr === format(new Date(), "yyyy-MM-dd");
                    const dayColumns = weeklyData.get(dateStr) || [];
                    const memberColumn = dayColumns.find(
                      (col) => col.user.id === member.userId,
                    );
                    const blocks = memberColumn?.blocks || [];
                    const orgBlocks = memberColumn?.org_blocks || [];

                    return (
                      <div
                        key={dateStr}
                        className={`w-28 md:w-36 flex-shrink-0 p-2 border-r border-bridge-border min-h-[100px] ${
                          isCurrentDay ? "bg-bridge-secondary/8" : ""
                        }`}
                      >
                        <div className="space-y-1">
                          {blocks.map((block) => {
                            const isCustom = block.block_type === "CUSTOM";
                            const hasMeeting = !!block.meeting;
                            const blockTitle = isCustom
                              ? block.title || t("scheduleBlock.custom")
                              : hasMeeting
                                ? block.meeting!.title
                                : block.checklist_item?.title ||
                                  t("scheduleBlock.unlinked");
                            const isCompleted = isCustom
                              ? false
                              : (block.checklist_item?.completed ?? false);
                            const dueDate = block.checklist_item?.due_date
                              ? new Date(block.checklist_item.due_date)
                              : null;
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const threeDaysLater = new Date(today);
                            threeDaysLater.setDate(today.getDate() + 3);

                            let blockBg = "bg-blue-500/30 hover:bg-blue-500/50";
                            let timeColor = "text-blue-700 dark:text-blue-200";
                            let inlineStyle: Record<string, string> = {};
                            if (isCustom) {
                              const color = block.color || "#F59E0B";
                              blockBg = "hover:opacity-80";
                              timeColor = "text-foreground/60";
                              inlineStyle = {
                                backgroundColor: `${color}33`,
                                borderLeft: `3px solid ${color}`,
                              };
                            } else if (hasMeeting && block.meeting?.color) {
                              const color = block.meeting.color;
                              blockBg = "hover:opacity-80";
                              timeColor = "text-foreground/60";
                              inlineStyle = {
                                backgroundColor: `${color}33`,
                                borderLeft: `3px solid ${color}`,
                              };
                            } else if (isCompleted) {
                              blockBg = "bg-green-500/30 hover:bg-green-500/50";
                              timeColor = "text-green-700 dark:text-green-200";
                            } else if (dueDate && dueDate < today) {
                              blockBg = "bg-red-500/30 hover:bg-red-500/50";
                              timeColor = "text-red-700 dark:text-red-200";
                            } else if (dueDate && dueDate <= threeDaysLater) {
                              blockBg =
                                "bg-yellow-500/30 hover:bg-yellow-500/50";
                              timeColor =
                                "text-yellow-700 dark:text-yellow-200";
                            }

                            return (
                              <div
                                key={block.id}
                                onClick={() => handleBlockClick(block)}
                                className={`p-2 rounded ${blockBg} cursor-pointer transition-colors`}
                                style={inlineStyle}
                              >
                                <div
                                  className={`text-xs text-foreground font-medium truncate ${isCompleted ? "line-through opacity-70" : ""}`}
                                >
                                  {blockTitle}
                                </div>
                                <div className={`text-xs ${timeColor}`}>
                                  {block.start_time.slice(0, 5)} -{" "}
                                  {block.end_time.slice(0, 5)}
                                  {block.end_time < block.start_time && (
                                    <span className="text-bridge-accent ml-0.5">
                                      ({t("scheduleBlock.nextDay")})
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {/* Cross-board org schedule blocks (read-only, weekly view) */}
                          {orgBlocks.map((block) => {
                            const blockTitle =
                              block.block_type === "CUSTOM"
                                ? block.title || t("scheduleBlock.custom")
                                : block.meeting
                                  ? block.meeting.title
                                  : block.checklist_item?.title ||
                                    t("scheduleBlock.unlinked");

                            return (
                              <div
                                key={`org-${block.id}`}
                                className="p-2 rounded bg-bridge-accent/10 border border-dashed border-bridge-accent/30 opacity-60 pointer-events-none"
                              >
                                {block.board_name && (
                                  <span className="text-xs font-bold px-1 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent truncate inline-block max-w-full mb-0.5">
                                    {t("scheduleBlock.orgScheduleLabel", {
                                      boardName: block.board_name,
                                    })}
                                  </span>
                                )}
                                <div className="text-xs text-foreground font-medium truncate">
                                  {blockTitle}
                                </div>
                                <div className="text-xs text-slate-400">
                                  {block.start_time.slice(0, 5)} -{" "}
                                  {block.end_time.slice(0, 5)}
                                </div>
                              </div>
                            );
                          })}
                          {blocks.length === 0 && orgBlocks.length === 0 && (
                            <div className="text-xs text-slate-400 text-center py-4">
                              -
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {activeMembers.length === 0 && (
                <div className="p-6 text-slate-400 text-center">
                  {t("dailySchedule.noMembers")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 블록 상세 패널 */}
        {selectedBlock && (
          <ScheduleDetailPanel
            block={selectedBlock}
            boardId={boardId}
            selectedDate={selectedDate}
            displayMode={displayMode}
            workStartHour={workStartHour}
            onClose={handleClosePanel}
            onDelete={handleBlockDeleted}
            onUpdate={loadSchedule}
            onChecklistToggle={handleChecklistToggled}
            onViewFeature={onViewFeature}
            onViewTask={onViewTask}
            onViewMeeting={onViewMeeting}
          />
        )}
      </div>

      {/* 하단 안내 */}
      <div className="px-3 md:px-6 py-2 md:py-3 bg-bridge-surface border-t border-bridge-border">
        <p className="text-sm text-slate-400">
          {isViewer
            ? t("dailySchedule.viewerGuide")
            : viewMode === "day"
              ? t("dailySchedule.dragGuide")
              : t("dailySchedule.clickGuide")}
        </p>
      </div>

      {/* 체크리스트 모달 (타임블록 탭에서만, 선택 + 생성 통합) */}
      {pendingBlock && showChecklistModal && (
        <ChecklistCreateModal
          boardId={boardId}
          milestoneColorMap={milestoneColorMap}
          assigneeId={pendingBlock.userId}
          startTime={pendingBlock.startTime}
          endTime={pendingBlock.endTime}
          selectedDate={format(selectedDate, "yyyy-MM-dd")}
          displayMode={displayMode}
          startBlockIndex={pendingBlock.startSlotIndex}
          endBlockIndex={pendingBlock.endSlotIndex}
          splitBlocks={pendingBlock.splitBlocks}
          onCreate={handleChecklistCreate}
          onSelectExisting={handleChecklistItemSelect}
          onSelectBoardItem={handleBoardChecklistItemSelect}
          onSelectMeeting={handleMeetingSelect}
          onCreateCustom={handleCustomCreate}
          onTimeChange={(newStart, newEnd) => {
            setPendingBlock((prev) =>
              prev
                ? {
                    ...prev,
                    startTime: newStart,
                    endTime: newEnd,
                    splitBlocks: undefined,
                  }
                : null,
            );
          }}
          onClose={handleCloseChecklistModal}
        />
      )}

      {/* 데일리 체크리스트 추가 모달 */}
      {showAddChecklistModal && addChecklistAssigneeId && (
        <AddDailyChecklistModal
          boardId={boardId}
          assigneeId={addChecklistAssigneeId}
          assignedDate={format(selectedDate, "yyyy-MM-dd")}
          onAdd={() => {
            loadSchedule();
            setShowAddChecklistModal(false);
            setAddChecklistAssigneeId("");
          }}
          onClose={() => {
            setShowAddChecklistModal(false);
            setAddChecklistAssigneeId("");
          }}
        />
      )}

      {/* 설정 모달 (타임블록 탭에서만) */}
      {showSettingsModal && settings && (
        <ScheduleSettingsModal
          currentStartTime={settings.work_start_time}
          currentWorkHours={settings.work_hours_per_day}
          currentDisplayMode={displayMode}
          currentBreakStartTime={settings.break_start_time}
          currentBreakEndTime={settings.break_end_time}
          onSave={async (
            startTime,
            workHours,
            newDisplayMode,
            breakStart,
            breakEnd,
          ) => {
            try {
              await scheduleAPI.updateSettings(boardId, {
                work_start_time: startTime,
                work_hours_per_day: workHours,
                schedule_display_mode:
                  newDisplayMode === "block" ? "BLOCK" : "TIME",
                break_start_time: breakStart,
                break_end_time: breakEnd,
              });
              await loadSchedule();
              setShowSettingsModal(false);
            } catch (error) {
              console.error("Failed to update settings:", error);
            }
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* 주간 요약 모달 */}
      {summaryMember && viewMode === "week" && (
        <WeeklySummaryModal
          boardId={boardId}
          member={summaryMember}
          weekDays={weekDays}
          weeklyData={weeklyData}
          onClose={() => setSummaryMember(null)}
        />
      )}

      {/* 일일 요약 모달 */}
      {summaryMember && viewMode === "day" && (
        <DailySummaryModal
          boardId={boardId}
          member={summaryMember}
          selectedDate={selectedDate}
          blocks={blocksByUser.get(summaryMember.userId) || []}
          onClose={() => setSummaryMember(null)}
        />
      )}
    </div>
  );
}
