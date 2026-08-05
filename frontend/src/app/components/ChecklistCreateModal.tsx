import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Clock,
  ChevronDown,
  ChevronRight,
  Folder,
  FileText,
  Loader2,
  CheckSquare,
  Layers,
  Plus,
  Coffee,
  Flag,
  Pin,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO, isToday as isDateToday } from "date-fns";
import { getDDay } from "../utils/dateUtils";
import {
  MilestoneColorMap,
  resolveMilestoneColor,
} from "../utils/milestoneColor";
import {
  featureAPI,
  taskAPI,
  dailyChecklistAPI,
  meetingAPI,
  milestoneAPI,
  FeatureResponse,
  TaskResponse,
  DailyChecklistItemResponse,
  BoardChecklistItemResponse,
  MilestoneSimpleResponse,
  MeetingSummary,
} from "../utils/api";
import { MotionModal } from "./ui/MotionModal";
import { TimePicker } from "./ui/TimePicker";
import { ColorPickerPopover } from "./ui/ColorPickerPopover";
import { FEATURE_COLORS } from "../constants";

type TimeblockTab = "checklist" | "meeting" | "custom";

interface TimeblockItemRowProps {
  title: string;
  featureTitle?: string | null;
  featureColor?: string | null;
  taskTitle?: string | null;
  blockName?: string | null;
  blockColor?: string | null;
  milestoneTitle?: string | null;
  milestoneColor?: string | null;
  hideMilestone?: boolean;
  dueDate?: string | null;
  /** 사용자가 이 날짜로 직접 당겨온 항목 (기간과 무관하게 오늘 목록에 있음) */
  pinned?: boolean;
  onClick: () => void;
}

/**
 * 타임블록 항목 선택 행 (컴팩트 시안 A)
 * - 제목행: 제목 + 우측 마감 배지(D-day)
 * - 메타행: 마일스톤 · 블록 · 피처 › 태스크 (값 있는 것만, 배경 없는 마커)
 */
function TimeblockItemRow({
  title,
  featureTitle,
  featureColor,
  taskTitle,
  blockName,
  blockColor,
  milestoneTitle,
  milestoneColor,
  hideMilestone,
  dueDate,
  pinned,
  onClick,
}: TimeblockItemRowProps) {
  const { t } = useTranslation();
  const dday = getDDay(dueDate);
  const hasSchedule = !!dueDate;
  const dateText = hasSchedule
    ? `~${format(parseISO(dueDate as string), "M/d")}${
        dday.urgency !== "normal" && dday.text ? ` · ${dday.text}` : ""
      }`
    : t("dailySchedule.noDueDate");
  const dateTone = !hasSchedule
    ? "border border-dashed border-foreground/15 text-slate-500"
    : dday.urgency === "overdue"
      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
      : dday.urgency === "today" || dday.urgency === "soon"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-foreground/[0.06] text-slate-400";

  const showMilestone = !!milestoneTitle && !hideMilestone;
  const hasMeta = !!(showMilestone || blockName || featureTitle);

  return (
    <button
      onClick={onClick}
      className="w-full px-3.5 py-2.5 flex items-start gap-2.5 hover:bg-bridge-accent/10 transition-colors text-left group"
    >
      <div className="w-4 h-4 rounded border border-bridge-border flex-shrink-0 mt-0.5 group-hover:border-bridge-accent/50" />
      <div className="flex-1 min-w-0">
        {/* 제목 + 마감 배지 */}
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-sm text-foreground">
            {title}
          </span>
          {pinned && (
            <span
              className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-md bg-slate-500/15 text-slate-400 whitespace-nowrap"
              title={t("dailySchedule.badgePinned")}
            >
              <Pin className="w-3 h-3" />
              {t("dailySchedule.badgePinned")}
            </span>
          )}
          <span
            className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-md tabular-nums whitespace-nowrap ${dateTone}`}
          >
            {dateText}
          </span>
        </div>
        {/* 메타: 마일스톤 · 블록 · 피처 › 태스크 */}
        {hasMeta && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1 text-xs min-w-0">
            {showMilestone && (
              <span
                className="inline-flex items-center gap-1 font-medium min-w-0"
                style={{ color: milestoneColor || "#f59e0b" }}
              >
                <Flag className="w-3 h-3 flex-shrink-0" />
                <span className="truncate max-w-[128px]">{milestoneTitle}</span>
              </span>
            )}
            {showMilestone && (blockName || featureTitle) && (
              <span className="text-slate-600">·</span>
            )}
            {blockName && (
              <span className="inline-flex items-center gap-1 text-bridge-secondary min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: blockColor || "#2DD4BF" }}
                />
                <span className="truncate max-w-[104px]">{blockName}</span>
              </span>
            )}
            {blockName && featureTitle && (
              <span className="text-slate-600">·</span>
            )}
            {featureTitle && (
              <span className="inline-flex items-center gap-1 text-slate-400 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: featureColor || "#64748b" }}
                />
                <span className="truncate">
                  {featureTitle}
                  {taskTitle && (
                    <span className="text-slate-500"> › {taskTitle}</span>
                  )}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

interface ChecklistCreateModalProps {
  boardId: string;
  /** 마일스톤 id → 색 (배열 순서 기준). 라벨 색 일관성용 */
  milestoneColorMap?: MilestoneColorMap;
  assigneeId: string;
  startTime: string;
  endTime: string;
  selectedDate?: string; // yyyy-MM-dd format
  displayMode: "time" | "block";
  startBlockIndex?: number;
  endBlockIndex?: number;
  splitBlocks?: Array<{ startTime: string; endTime: string }>;
  onCreate: (taskId: string, title: string) => void;
  onSelectExisting: (checklistItemId: string) => void;
  onSelectBoardItem: (checklistItemId: string) => void;
  onSelectMeeting?: (meetingId: string) => void;
  onCreateCustom?: (title: string, color: string) => void;
  onTimeChange?: (startTime: string, endTime: string) => void;
  onClose: () => void;
}

export function ChecklistCreateModal({
  boardId,
  milestoneColorMap,
  assigneeId,
  startTime,
  endTime,
  selectedDate,
  displayMode,
  startBlockIndex,
  endBlockIndex,
  splitBlocks,
  onCreate,
  onSelectExisting,
  onSelectBoardItem,
  onSelectMeeting,
  onCreateCustom,
  onTimeChange,
  onClose,
}: ChecklistCreateModalProps) {
  const { t } = useTranslation();

  // Tab state
  const [activeTab, setActiveTab] = useState<TimeblockTab>("checklist");

  // 편집 가능한 시간 상태
  const [editStartTime, setEditStartTime] = useState(startTime);
  const [editEndTime, setEditEndTime] = useState(endTime);

  // 선택된 날짜 계산
  const targetDate = selectedDate || format(new Date(), "yyyy-MM-dd");
  const targetDateObj = parseISO(targetDate);
  const isTargetToday = isDateToday(targetDateObj);
  const dateLabel = isTargetToday
    ? t("dailySchedule.todayLabel")
    : format(targetDateObj, "M/d");

  // 해당 날짜의 체크리스트 (먼저 표시)
  const [todayChecklists, setTodayChecklists] = useState<
    DailyChecklistItemResponse[]
  >([]);
  const [isLoadingToday, setIsLoadingToday] = useState(true);

  // 보드 체크리스트 항목 (오늘 목록에 없는 나머지)
  const [boardItems, setBoardItems] = useState<BoardChecklistItemResponse[]>(
    [],
  );
  const [isLoadingBoardItems, setIsLoadingBoardItems] = useState(true);

  // 목록 세그먼트 — 오늘 / 지연 / 다른 항목.
  // 예전에는 "오늘의 체크리스트"와 "기존 항목"이 별도 섹션이라, 오늘 마감인 항목이
  // 아래쪽 "기존 항목"에 떠 있는 모순이 보였다. 이제 하나의 목록을 필터로 나눈다.
  const [segment, setSegment] = useState<"today" | "overdue" | "others">(
    "today",
  );
  const didAutoSelectSegment = useRef(false);

  // 기존 항목: 마일스톤 그룹 (C2)
  const [milestones, setMilestones] = useState<MilestoneSimpleResponse[]>([]);
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(
    new Set(),
  );

  // 오늘의 회의 목록
  const [todayMeetings, setTodayMeetings] = useState<MeetingSummary[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(true);

  // 새로 생성 모드 토글
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [features, setFeatures] = useState<FeatureResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [isLoadingFeatures, setIsLoadingFeatures] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  const [selectedFeatureId, setSelectedFeatureId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [title, setTitle] = useState("");

  const [isFeatureDropdownOpen, setIsFeatureDropdownOpen] = useState(false);
  const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Meeting create form state
  const [showMeetingCreateForm, setShowMeetingCreateForm] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);

  // Custom tab state
  const [customTitle, setCustomTitle] = useState("");
  const [customColor, setCustomColor] = useState("#F59E0B");

  // 타임블록 데이터 통합 로드 (데일리 체크리스트 + 보드 체크리스트 + 회의)
  useEffect(() => {
    const loadTimeblockData = async () => {
      setIsLoadingToday(true);
      setIsLoadingBoardItems(true);
      setIsLoadingMeetings(true);
      try {
        const data = await dailyChecklistAPI.getTimeblockData(
          boardId,
          targetDate,
          assigneeId,
        );
        setTodayChecklists(data.daily_checklist_items || []);
        setBoardItems(data.board_checklist_items || []);
        setTodayMeetings(data.meetings || []);
      } catch (error) {
        console.error("Failed to load timeblock data:", error);
        setTodayChecklists([]);
        setBoardItems([]);
        setTodayMeetings([]);
      } finally {
        setIsLoadingToday(false);
        setIsLoadingBoardItems(false);
        setIsLoadingMeetings(false);
      }
    };
    loadTimeblockData();
  }, [boardId, assigneeId, targetDate]);


  // 마일스톤 진행률/기간 로드 (기존 항목 그룹 헤더용)
  useEffect(() => {
    const loadMilestones = async () => {
      try {
        const res = await milestoneAPI.getMilestones(boardId);
        setMilestones(res.milestones || []);
      } catch (error) {
        console.error("Failed to load milestones:", error);
        setMilestones([]);
      }
    };
    loadMilestones();
  }, [boardId]);

  const milestoneInfoMap = useMemo(() => {
    const map = new Map<string, MilestoneSimpleResponse>();
    milestones.forEach((m) => map.set(m.id, m));
    return map;
  }, [milestones]);

  // 오늘의 체크리스트를 "오늘 할 것"과 "지연"으로 나눈다.
  // 서버가 이미 파생 + 핀 - 제외를 병합해줬으므로 여기서는 표시용 분류만 한다.
  const todayItems = useMemo(
    () => todayChecklists.filter((item) => item.source !== "OVERDUE"),
    [todayChecklists],
  );
  const overdueItems = useMemo(
    () => todayChecklists.filter((item) => item.source === "OVERDUE"),
    [todayChecklists],
  );

  // 초기 세그먼트: 지연이 있으면 지연을 먼저 보여준다(놓친 일이 가장 급하다).
  // 지연이 없고 오늘도 비었으면 "다른 항목"을 펼쳐준다.
  // (빈 목록만 보여주고 사용자가 탭을 찾아 누르게 만들지 않는다)
  useEffect(() => {
    if (isLoadingToday || didAutoSelectSegment.current) return;
    didAutoSelectSegment.current = true;
    if (overdueItems.length > 0) {
      setSegment("overdue");
    } else if (todayItems.length === 0) {
      setSegment("others");
    }
  }, [isLoadingToday, todayItems.length, overdueItems.length]);

  // 기존 항목 필터링: 완료 항목 제외, 오늘의 체크리스트에 이미 있는 항목 제외
  // 정렬: 마감일(due_date) 오름차순, 일정 없는 항목은 맨 아래
  const filteredBoardItems = useMemo(() => {
    const todayItemIds = new Set(
      todayChecklists.map((item) => item.checklist_item_id).filter(Boolean),
    );
    return boardItems
      .filter((item) => !item.completed && !todayItemIds.has(item.id))
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
  }, [boardItems, todayChecklists]);

  // 세그먼트 칩 — 지연이 있으면 맨 앞에 둔다(가장 급한 목록이 먼저 눈에 들어오게).
  const segmentChips = useMemo(() => {
    const today = {
      id: "today" as const,
      label: t("dailySchedule.segmentToday", { date: dateLabel }),
      count: todayItems.length,
    };
    const overdue = {
      id: "overdue" as const,
      label: t("dailySchedule.segmentOverdue"),
      count: overdueItems.length,
    };
    const others = {
      id: "others" as const,
      label: t("dailySchedule.segmentOthers"),
      count: filteredBoardItems.length,
    };
    return overdue.count > 0
      ? [overdue, today, others]
      : [today, overdue, others];
  }, [
    t,
    dateLabel,
    todayItems.length,
    overdueItems.length,
    filteredBoardItems.length,
  ]);

  // 기존 항목: 마일스톤별 그룹 (C2) — 기간 없는 항목도 각 마일스톤 아래 그대로 노출
  const NO_MILESTONE_KEY = "__none__";
  const groupedBoardItems = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string | null;
        title: string;
        progress: number | null;
        endDate: string | null;
        items: BoardChecklistItemResponse[];
      }
    >();

    filteredBoardItems.forEach((item) => {
      const key = item.milestone?.id ?? NO_MILESTONE_KEY;
      if (!groups.has(key)) {
        const info = item.milestone?.id
          ? milestoneInfoMap.get(item.milestone.id)
          : undefined;
        groups.set(key, {
          id: item.milestone?.id ?? null,
          title: item.milestone?.title ?? t("dailySchedule.noMilestone"),
          progress: info ? info.progress_percentage : null,
          endDate: info ? info.end_date : null,
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    });

    // 정렬: 마일스톤 종료일 가까운 순 → 없는 항목 그룹은 맨 아래
    return Array.from(groups.values()).sort((a, b) => {
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      if (a.endDate && b.endDate) return a.endDate.localeCompare(b.endDate);
      if (a.endDate) return -1;
      if (b.endDate) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [filteredBoardItems, milestoneInfoMap, t]);

  const toggleMilestoneGroup = (key: string) => {
    setCollapsedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 최초 로드 시: 첫 그룹만 펼치고 나머지는 접힌 상태로 초기화 (이후 사용자 토글은 유지)
  const didInitCollapseRef = useRef(false);
  useEffect(() => {
    if (didInitCollapseRef.current) return;
    if (groupedBoardItems.length === 0) return;
    didInitCollapseRef.current = true;
    setCollapsedMilestones(
      new Set(
        groupedBoardItems.slice(1).map((group) => group.id ?? NO_MILESTONE_KEY),
      ),
    );
  }, [groupedBoardItems]);

  // Feature 목록 로드 (새로 생성 모드일 때만)
  useEffect(() => {
    if (!showCreateForm) return;

    const loadFeatures = async () => {
      setIsLoadingFeatures(true);
      try {
        const response = await featureAPI.getFeatures(boardId);
        setFeatures(response.features);
      } catch (error) {
        console.error("Failed to load features:", error);
      } finally {
        setIsLoadingFeatures(false);
      }
    };
    loadFeatures();
  }, [boardId, showCreateForm]);

  // Feature 선택 시 Task 목록 로드
  useEffect(() => {
    if (!selectedFeatureId) {
      setTasks([]);
      setSelectedTaskId("");
      return;
    }

    const loadTasks = async () => {
      setIsLoadingTasks(true);
      try {
        const response = await taskAPI.getTasks(boardId, {
          feature_id: selectedFeatureId,
        });
        setTasks(response.tasks);
        setSelectedTaskId("");
      } catch (error) {
        console.error("Failed to load tasks:", error);
      } finally {
        setIsLoadingTasks(false);
      }
    };
    loadTasks();
  }, [boardId, selectedFeatureId]);

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selectedFeatureId),
    [features, selectedFeatureId],
  );

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId),
    [tasks, selectedTaskId],
  );

  const canSubmit =
    activeTab === "custom"
      ? customTitle.trim().length > 0
      : activeTab === "meeting"
        ? showMeetingCreateForm && meetingTitle.trim().length > 0
        : activeTab === "checklist"
          ? !!(selectedTaskId && title.trim())
          : false;

  const handleSubmit = async () => {
    if (activeTab === "custom" && onCreateCustom) {
      onCreateCustom(customTitle.trim(), customColor);
      return;
    }
    if (
      activeTab === "meeting" &&
      showMeetingCreateForm &&
      meetingTitle.trim()
    ) {
      setIsCreatingMeeting(true);
      try {
        await meetingAPI.createMeeting(boardId, {
          title: meetingTitle.trim(),
          meeting_date: targetDate,
        });
        // 회의 생성 후 목록 새로고침 → 사용자가 직접 선택
        const data = await dailyChecklistAPI.getTimeblockData(
          boardId,
          targetDate,
          assigneeId,
        );
        setTodayMeetings(data.meetings || []);
        setMeetingTitle("");
        setShowMeetingCreateForm(false);
      } catch (error) {
        console.error("Failed to create meeting:", error);
      } finally {
        setIsCreatingMeeting(false);
      }
      return;
    }
    // existing checklist create logic
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      onCreate(selectedTaskId, title.trim());
    } catch (error) {
      console.error("Failed to create checklist item:", error);
      setIsSubmitting(false);
    }
  };

  return (
    <MotionModal
      open
      onClose={onClose}
      className="sm:w-[720px] sm:max-w-[calc(100%-2rem)] max-h-[92dvh] flex flex-col p-0 overflow-hidden bg-bridge-dark"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
        <h2 className="text-lg font-bold text-foreground">
          {t("dailySchedule.addTimeblock")}
        </h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-foreground transition-colors"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Time/Block Display */}
      <div className="px-6 py-3 border-b border-foreground/10">
        {displayMode === "block" ? (
          <div className="bg-bridge-accent/20 rounded-xl px-4 py-2.5 flex items-center gap-3 border border-bridge-accent/30">
            <Layers className="h-4 w-4 text-bridge-accent" />
            <span className="text-bridge-accent font-medium text-sm">
              {startBlockIndex !== undefined && endBlockIndex !== undefined
                ? startBlockIndex === endBlockIndex
                  ? t("dailySchedule.blockN", { n: startBlockIndex + 1 })
                  : t("dailySchedule.blockRange", {
                      start: startBlockIndex + 1,
                      end: endBlockIndex + 1,
                    })
                : t("dailySchedule.selectBlock")}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-bridge-accent flex-shrink-0" />
              <span className="text-bridge-accent font-medium text-sm">
                {format(targetDateObj, "M/d")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <TimePicker
                  value={editStartTime}
                  onChange={(val) => {
                    setEditStartTime(val);
                    onTimeChange?.(val, editEndTime);
                  }}
                  className="py-1.5 px-3 text-xs border-foreground/10"
                />
              </div>
              <span className="text-slate-500 text-xs shrink-0">~</span>
              <div className="flex-1">
                <TimePicker
                  value={editEndTime}
                  onChange={(val) => {
                    setEditEndTime(val);
                    onTimeChange?.(editStartTime, val);
                  }}
                  className="py-1.5 px-3 text-xs border-foreground/10"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab Selector */}
      <div className="flex gap-1 px-6 py-2 border-b border-foreground/10">
        {[
          {
            id: "checklist" as const,
            icon: CheckSquare,
            label: t("dailySchedule.tabChecklist"),
          },
          {
            id: "meeting" as const,
            icon: FileText,
            label: t("dailySchedule.tabMeeting"),
          },
          {
            id: "custom" as const,
            icon: Coffee,
            label: t("dailySchedule.tabCustom"),
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id
                ? "bg-bridge-accent/20 text-bridge-accent border border-bridge-accent/30"
                : "text-slate-400 hover:text-foreground hover:bg-foreground/5 border border-transparent"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
        {/* Checklist Tab */}
        {activeTab === "checklist" && (
          <>
            {/* 오늘의 체크리스트 = 내 체크리스트를 이 날짜로 거른 결과.
                예전처럼 "오늘 목록"과 "기존 항목"을 따로 두지 않고,
                하나의 목록을 세그먼트로 나눠 보여준다. */}
            <div>
              <div className="flex gap-1.5 mb-2">
                {segmentChips.map((seg) => (
                  <button
                    key={seg.id}
                    type="button"
                    onClick={() => setSegment(seg.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                      segment === seg.id
                        ? seg.id === "overdue" && seg.count > 0
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          : "bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30"
                        : seg.id === "overdue" && seg.count > 0
                          ? "bg-rose-500/[0.08] text-rose-600 dark:text-rose-400 border-transparent hover:bg-rose-500/15"
                          : "bg-foreground/[0.03] text-slate-400 border-transparent hover:bg-foreground/5"
                    }`}
                  >
                    {seg.id === "overdue" && seg.count > 0 && (
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                    )}
                    {seg.label}
                    <span className="tabular-nums opacity-70">{seg.count}</span>
                  </button>
                ))}
              </div>

              <div className="border border-foreground/10 rounded-xl h-[48dvh] min-h-[300px] max-h-[560px] overflow-y-auto custom-scrollbar bg-bridge-surface">
                {(segment === "others" ? isLoadingBoardItems : isLoadingToday) ? (
                  <div className="px-4 py-6 text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-bridge-accent" />
                    {t("common.loading")}
                  </div>
                ) : segment === "today" ? (
                  todayItems.length === 0 ? (
                    <div className="px-4 py-6 text-slate-500 text-xs text-center">
                      {t("dailySchedule.noTodayChecklist", { date: dateLabel })}
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {todayItems.map((item) => (
                        <TimeblockItemRow
                          key={item.id}
                          title={item.title}
                          featureTitle={item.feature?.title}
                          featureColor={item.feature?.color}
                          taskTitle={item.task?.title}
                          blockName={item.block?.name}
                          blockColor={item.block?.color}
                          milestoneTitle={item.milestone?.title}
                          milestoneColor={
                            resolveMilestoneColor(
                              item.milestone?.id,
                              milestoneColorMap,
                            ).hex
                          }
                          dueDate={item.due_date}
                          pinned={item.source === "PINNED"}
                          onClick={() =>
                            onSelectExisting(item.checklist_item_id)
                          }
                        />
                      ))}
                    </div>
                  )
                ) : segment === "overdue" ? (
                  overdueItems.length === 0 ? (
                    <div className="px-4 py-6 text-slate-500 text-xs text-center">
                      {t("dailySchedule.noOverdueItems")}
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {overdueItems.map((item) => (
                        <TimeblockItemRow
                          key={item.id}
                          title={item.title}
                          featureTitle={item.feature?.title}
                          featureColor={item.feature?.color}
                          taskTitle={item.task?.title}
                          blockName={item.block?.name}
                          blockColor={item.block?.color}
                          milestoneTitle={item.milestone?.title}
                          milestoneColor={
                            resolveMilestoneColor(
                              item.milestone?.id,
                              milestoneColorMap,
                            ).hex
                          }
                          dueDate={item.due_date}
                          onClick={() =>
                            onSelectExisting(item.checklist_item_id)
                          }
                        />
                      ))}
                    </div>
                  )
                ) : filteredBoardItems.length === 0 ? (
                  <div className="px-4 py-6 text-slate-500 text-xs text-center">
                    {t("dailySchedule.noBoardItems")}
                  </div>
                ) : (
                  groupedBoardItems.map((group) => {
                    const key = group.id ?? NO_MILESTONE_KEY;
                    const collapsed = collapsedMilestones.has(key);
                    return (
                      <div key={key}>
                        <button
                          type="button"
                          onClick={() => toggleMilestoneGroup(key)}
                          className="w-full flex items-center gap-2 px-3 py-2 bg-foreground/[0.04] hover:bg-foreground/[0.06] border-b border-white/5 transition-colors"
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-slate-500 flex-shrink-0 transition-transform ${
                              collapsed ? "" : "rotate-90"
                            }`}
                          />
                          {group.id && (
                            <Flag className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          )}
                          <span className="text-xs font-bold text-foreground truncate max-w-[150px]">
                            {group.title}
                          </span>
                          {group.progress !== null && (
                            <>
                              <span className="text-xs font-medium text-slate-500 tabular-nums flex-shrink-0">
                                {group.progress}%
                              </span>
                              <span className="w-12 h-1 rounded-full bg-foreground/10 overflow-hidden flex-shrink-0">
                                <span
                                  className="block h-full bg-amber-500 rounded-full"
                                  style={{ width: `${group.progress}%` }}
                                />
                              </span>
                            </>
                          )}
                          <span className="ml-auto flex-shrink-0 text-xs font-medium text-slate-500 tabular-nums bg-foreground/[0.06] px-2 py-0.5 rounded-full">
                            {group.items.length}
                          </span>
                        </button>
                        {!collapsed && (
                          <div className="divide-y divide-white/5">
                            {group.items.map((item) => (
                              <TimeblockItemRow
                                key={item.id}
                                title={item.title}
                                featureTitle={item.feature?.title}
                                featureColor={item.feature?.color}
                                taskTitle={item.task?.title}
                                blockName={item.block?.name}
                                blockColor={item.block?.color}
                                milestoneTitle={item.milestone?.title}
                                milestoneColor={
                                  resolveMilestoneColor(
                                    item.milestone?.id,
                                    milestoneColorMap,
                                  ).hex
                                }
                                hideMilestone
                                dueDate={item.due_date}
                                onClick={() => onSelectBoardItem(item.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 구분선 */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-foreground/10" />
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {showCreateForm
                  ? t("dailySchedule.collapse")
                  : t("dailySchedule.createNew")}
              </button>
              <div className="flex-1 border-t border-foreground/10" />
            </div>

            {/* 새로 생성 폼 (토글) */}
            {showCreateForm && (
              <>
                {/* Feature Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    <Folder className="inline h-4 w-4 mr-1 text-amber-500" />
                    Feature
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setIsFeatureDropdownOpen(!isFeatureDropdownOpen)
                      }
                      className="w-full flex items-center justify-between px-4 py-3 bg-bridge-surface border border-foreground/10 rounded-xl text-left hover:border-bridge-border transition-colors"
                    >
                      {isLoadingFeatures ? (
                        <span className="text-slate-400 flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </span>
                      ) : selectedFeature ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: selectedFeature.color }}
                          />
                          <span className="text-foreground">
                            {selectedFeature.title}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">
                          {t("dailySchedule.selectFeature")}
                        </span>
                      )}
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform ${isFeatureDropdownOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isFeatureDropdownOpen && !isLoadingFeatures && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-bridge-surface border border-foreground/10 rounded-xl shadow-xl z-10 max-h-72 overflow-y-auto">
                        {features.length === 0 ? (
                          <div className="px-4 py-3 text-slate-400 text-sm">
                            {t("dailySchedule.noFeatures")}
                          </div>
                        ) : (
                          features.map((feature) => (
                            <button
                              key={feature.id}
                              onClick={() => {
                                setSelectedFeatureId(feature.id);
                                setIsFeatureDropdownOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-foreground/5 transition-colors ${
                                feature.id === selectedFeatureId
                                  ? "bg-bridge-accent/20"
                                  : ""
                              }`}
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: feature.color }}
                              />
                              <span className="text-foreground">
                                {feature.title}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Task Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    <FileText className="inline h-4 w-4 mr-1 text-bridge-accent" />
                    Task
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        selectedFeatureId &&
                        setIsTaskDropdownOpen(!isTaskDropdownOpen)
                      }
                      disabled={!selectedFeatureId}
                      className={`w-full flex items-center justify-between px-4 py-3 bg-bridge-surface border border-foreground/10 rounded-xl text-left transition-colors ${
                        !selectedFeatureId
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:border-bridge-border"
                      }`}
                    >
                      {isLoadingTasks ? (
                        <span className="text-slate-400 flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </span>
                      ) : selectedTask ? (
                        <span className="text-foreground">
                          {selectedTask.title}
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          {selectedFeatureId
                            ? t("dailySchedule.selectTask")
                            : t("dailySchedule.selectFeatureFirst")}
                        </span>
                      )}
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 transition-transform ${isTaskDropdownOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isTaskDropdownOpen && !isLoadingTasks && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-bridge-surface border border-foreground/10 rounded-xl shadow-xl z-10 max-h-72 overflow-y-auto">
                        {tasks.length === 0 ? (
                          <div className="px-4 py-3 text-slate-400 text-sm">
                            {t("dailySchedule.noTasks")}
                          </div>
                        ) : (
                          tasks.map((task) => (
                            <button
                              key={task.id}
                              onClick={() => {
                                setSelectedTaskId(task.id);
                                setIsTaskDropdownOpen(false);
                              }}
                              className={`w-full px-4 py-3 text-left hover:bg-foreground/5 transition-colors ${
                                task.id === selectedTaskId
                                  ? "bg-bridge-accent/20"
                                  : ""
                              }`}
                            >
                              <span className="text-foreground">
                                {task.title}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 새 체크리스트 생성 */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                    {t("dailySchedule.newChecklistItem")}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("dailySchedule.newChecklistPlaceholder")}
                    className="w-full px-4 py-3 bg-bridge-surface border border-foreground/10 rounded-xl text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* Meeting Tab */}
        {activeTab === "meeting" && onSelectMeeting && (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                <FileText className="inline h-4 w-4 mr-1 text-purple-400" />
                {t("meeting.selectMeeting", { date: dateLabel })}
              </label>
              <div className="border border-foreground/10 rounded-xl h-[36dvh] min-h-[200px] max-h-[440px] overflow-y-auto custom-scrollbar bg-bridge-surface">
                {isLoadingMeetings ? (
                  <div className="px-4 py-4 text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("common.loading")}
                  </div>
                ) : todayMeetings.length === 0 ? (
                  <div className="px-4 py-4 text-slate-400 text-sm text-center">
                    {t("dailySchedule.noMeetingsForDate", { date: dateLabel })}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {todayMeetings.map((meeting) => (
                      <button
                        key={meeting.id}
                        onClick={() => onSelectMeeting(meeting.id)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bridge-accent/10 transition-colors text-left group"
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: meeting.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-foreground truncate">
                            {meeting.title}
                          </div>
                          {meeting.start_time && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              {meeting.start_time.slice(0, 5)}
                              {meeting.end_time
                                ? ` - ${meeting.end_time.slice(0, 5)}`
                                : ""}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-bridge-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          {t("dailySchedule.select")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 구분선 + 새로 생성 토글 */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-foreground/10" />
              <button
                onClick={() => setShowMeetingCreateForm(!showMeetingCreateForm)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {showMeetingCreateForm
                  ? t("dailySchedule.collapse")
                  : t("dailySchedule.createNewMeeting")}
              </button>
              <div className="flex-1 border-t border-foreground/10" />
            </div>

            {/* 새 회의 생성 폼 */}
            {showMeetingCreateForm && (
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <FileText className="inline h-4 w-4 mr-1 text-purple-400" />
                  {t("meeting.title")}
                </label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder={t("meeting.titlePlaceholder")}
                  maxLength={200}
                  className="w-full px-4 py-3 bg-bridge-surface border border-foreground/10 rounded-xl text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              </div>
            )}
          </>
        )}

        {/* Custom Tab */}
        {activeTab === "custom" && (
          <div className="space-y-4">
            {/* Preset Buttons */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t("dailySchedule.customPresets")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    label: t("dailySchedule.presetMeetingPrep"),
                    emoji: "📝",
                    color: "#3B82F6",
                  },
                  {
                    label: t("dailySchedule.presetOutside"),
                    emoji: "🚗",
                    color: "#10B981",
                  },
                  {
                    label: t("dailySchedule.presetRest"),
                    emoji: "😌",
                    color: "#8B5CF6",
                  },
                  {
                    label: t("dailySchedule.preset1on1"),
                    emoji: "🤝",
                    color: "#6366F1",
                  },
                  {
                    label: t("dailySchedule.presetPersonal"),
                    emoji: "📋",
                    color: "#64748B",
                  },
                  {
                    label: t("dailySchedule.presetMeal"),
                    emoji: "🍽️",
                    color: "#F59E0B",
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setCustomTitle(preset.label);
                      setCustomColor(preset.color);
                    }}
                    className={`py-2.5 px-2 rounded-xl border text-xs font-medium transition-all text-center ${
                      customTitle === preset.label
                        ? "border-bridge-accent bg-bridge-accent/20 text-bridge-accent"
                        : "border-foreground/10 text-slate-400 hover:border-bridge-accent/30 hover:text-foreground"
                    }`}
                  >
                    <span className="text-base">{preset.emoji}</span>
                    <span className="block mt-0.5 truncate">
                      {preset.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Label Input */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                {t("dailySchedule.customLabel")}
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder={t("dailySchedule.customPlaceholder")}
                maxLength={100}
                className="w-full px-4 py-3 bg-bridge-surface border border-foreground/10 rounded-xl text-foreground placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>

            {/* Color Picker */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {t("dailySchedule.customColor")}
              </label>
              <ColorPickerPopover
                colors={FEATURE_COLORS}
                selectedColor={customColor}
                onColorChange={setCustomColor}
                triggerShape="circle"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-foreground/10 flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-foreground transition-colors border border-foreground/10 rounded-xl hover:bg-foreground/5"
        >
          {t("common.cancel")}
        </button>
        {(activeTab !== "meeting" || showMeetingCreateForm) && (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting || isCreatingMeeting}
            className="flex-1 py-3 bg-gradient-to-r from-bridge-accent to-purple-500 text-sm font-bold text-white rounded-xl shadow-lg shadow-bridge-accent/20 disabled:opacity-50 disabled:grayscale hover:shadow-bridge-accent/40 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting || isCreatingMeeting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("dailySchedule.creating")}
              </>
            ) : (
              t("common.create")
            )}
          </button>
        )}
      </div>
    </MotionModal>
  );
}
