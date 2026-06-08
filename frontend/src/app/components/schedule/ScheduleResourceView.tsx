import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  Fragment,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  CheckCircle2,
  Loader2,
  Flag,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Trash2,
  ListChecks,
} from "lucide-react";
import { BoardMember } from "../ShareBoardModal";
import { BoardContractor, JobRole, Milestone } from "../../types";
import {
  boardChecklistAPI,
  checklistAPI,
  contractorAPI,
  AssigneeItemResponse,
  ChecklistByAssigneeResponse,
} from "../../utils/api";
import { TaskPickerPopover, TaskPickerItem } from "./TaskPickerPopover";
import { getInitials, getAssigneeHex } from "../../utils/assigneeColor";
import { useHolidays, HolidayInfo } from "../../hooks/useHolidays";

// ========================================
// Constants
// ========================================

const DAY_WIDTH = 60;
const ROW_HEIGHT = 80;
const MILESTONE_ROW_HEIGHT = 48;
const BAR_HEIGHT = 32;
const BAR_TOP_OFFSET = 4;
const LEFT_COL_WIDTH = 200;
const HEADER_HEIGHT = 48;
const MIN_BAR_WIDTH = 20;
/** Maximum number of visible bar lanes before collapsing with "+N more" */
const MAX_VISIBLE_LANES = 4;
/** 클릭과 "그리기"를 구분하기 위한 최소 드래그 픽셀 거리 */
const DRAW_DRAG_THRESHOLD = 6;

// ========================================
// Types
// ========================================

interface ScheduleResourceViewProps {
  boardId: string;
  boardMembers: BoardMember[];
  milestones: Milestone[];
  memberColorMap?: Record<string, string | null>;
  jobRoles?: JobRole[];
  /** 외주 관리 모달을 여는 핸들러 (없으면 버튼 미표시) */
  onOpenContractorManager?: () => void;
  onViewTask?: (taskId: string) => void;
  onDropChecklist?: (
    item: { id: string; task_id: string },
    targetDate: string,
    targetAssigneeId: string,
  ) => void;
  /** External drag state forwarded from parent (ChecklistItemPanel ghost) */
  externalDragItem?: AssigneeItemResponse | null;
  /** Increment to trigger data refresh */
  refreshTrigger?: number;
  onMilestoneClick?: (milestone: Milestone) => void;
  /** Scroll to and highlight a specific item (from panel click) */
  scrollToItem?: { id: string; ts: number } | null;
  /** 보드의 태스크 목록 (임시 업무 배치 시 태스크 선택용) */
  tasks?: TaskPickerItem[];
}

/** 빈 행을 드래그해 임시(예정) 바를 그리는 중의 상태 */
interface DrawState {
  rowIndex: number;
  rowId: string;
  startDayIndex: number;
  currentDayIndex: number;
}

interface DragState {
  itemId: string;
  taskId: string;
  assigneeId: string | null;
  assigneeIndex: number;
  startDate: string;
  dueDate: string;
  featureColor: string;
  dragType: "move" | "resize-left" | "resize-right";
  /** Day index of the cursor column at mousedown (for day-aligned snapping) */
  initialCursorDayIndex: number;
  currentDeltaDays: number;
  /** Cross-row drag: origin row index (fixed at drag start) */
  originRowIndex: number;
  /** Cross-row drag: current target row index (updates on mousemove) */
  targetRowIndex: number;
  /** Cross-row drag: target row's assignee ID */
  targetAssigneeId: string | null;
}

interface TooltipState {
  x: number;
  y: number;
  item: AssigneeItemResponse;
  featureName: string;
}

interface DropHighlight {
  rowIndex: number;
  dayIndex: number;
}

// ========================================
// Utility functions
// ========================================

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToDate(dateStr: string, days: number): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateStr(date);
}

function diffDays(a: string, b: string): number {
  // Use UTC to avoid DST-related off-by-one errors
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const utcA = Date.UTC(ay, am - 1, ad);
  const utcB = Date.UTC(by, bm - 1, bd);
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getDayLabel(date: Date, locale: string): string {
  const days: Record<string, string[]> = {
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ko: ["일", "월", "화", "수", "목", "금", "토"],
    ja: ["日", "月", "火", "水", "木", "金", "土"],
    zh: ["日", "一", "二", "三", "四", "五", "六"],
    "zh-TW": ["日", "一", "二", "三", "四", "五", "六"],
    vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
    th: ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"],
    es: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
    "pt-BR": ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    hi: ["रवि", "सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"],
  };
  const arr = days[locale] || days.en;
  return arr[date.getDay()];
}

// ========================================
// Component
// ========================================

export function ScheduleResourceView({
  boardId,
  boardMembers,
  milestones,
  memberColorMap,
  jobRoles = [],
  onOpenContractorManager,
  onViewTask,
  onDropChecklist,
  externalDragItem,
  refreshTrigger,
  onMilestoneClick,
  scrollToItem,
  tasks = [],
}: ScheduleResourceViewProps) {
  const { t, i18n } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ─── State ───
  const [data, setData] = useState<ChecklistByAssigneeResponse | null>(null);
  const [contractors, setContractors] = useState<BoardContractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [dropHighlight, setDropHighlight] = useState<DropHighlight | null>(
    null,
  );
  /** Track which member rows are expanded (showing all lanes) */
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  /** Highlighted item id for scroll-to flash effect */
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(
    null,
  );

  // 직군별 그룹 모드
  const groupKey = `scheduleResourceGroupBy_${boardId}`;
  const collapsedKey = `scheduleResourceCollapsedRoles_${boardId}`;
  const [groupByJobRole, setGroupByJobRoleState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(groupKey) === "jobRole";
  });
  const setGroupByJobRole = useCallback(
    (next: boolean) => {
      setGroupByJobRoleState(next);
      try {
        window.localStorage.setItem(groupKey, next ? "jobRole" : "member");
      } catch {
        /* ignore */
      }
    },
    [groupKey],
  );
  const [collapsedRoleGroups, setCollapsedRoleGroups] = useState<Set<string>>(
    () => {
      if (typeof window === "undefined") return new Set();
      try {
        const raw = window.localStorage.getItem(collapsedKey);
        return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
      } catch {
        return new Set();
      }
    },
  );
  const toggleRoleGroupCollapsed = useCallback(
    (key: string) => {
      setCollapsedRoleGroups((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        try {
          window.localStorage.setItem(collapsedKey, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [collapsedKey],
  );
  // Refs for mouse event handlers (avoid stale closure)
  const dragStateRef = useRef<DragState | null>(null);
  // 드래그/리사이즈 후 click 이벤트 방지용 ref
  const wasDraggedRef = useRef(false);

  // ─── 임시(예정) 바 그리기 상태 ───
  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const drawStateRef = useRef<DrawState | null>(null);
  /** 그리기 완료 후 태스크 선택 팝오버 (앵커 좌표 + 확정된 기간/행) */
  const [pendingTentative, setPendingTentative] = useState<{
    rowId: string;
    startDate: string;
    dueDate: string;
    anchorX: number;
    anchorY: number;
  } | null>(null);
  /** 임시 바 우클릭 컨텍스트 메뉴 */
  const [tentativeMenu, setTentativeMenu] = useState<{
    x: number;
    y: number;
    item: AssigneeItemResponse;
  } | null>(null);

  // ─── Timeline range: wide fixed range (12 weeks before + 40 weeks after today) ───
  const { timelineDays, todayIndex, rangeStart, rangeEnd } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(start.getDate() - 84); // 12 weeks before
    const end = new Date(today);
    end.setDate(end.getDate() + 280); // 40 weeks after

    const days: Date[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const todayStr = formatDateStr(today);
    const todayIdx = days.findIndex((d) => formatDateStr(d) === todayStr);

    return {
      timelineDays: days,
      todayIndex: todayIdx,
      rangeStart: formatDateStr(start),
      rangeEnd: formatDateStr(end),
    };
  }, []);

  // ─── Holidays (covers ~52w timeline crossing up to 3 calendar years) ───
  const currentYear = new Date().getFullYear();
  const { holidayMap: hPrev } = useHolidays(i18n.language, currentYear - 1);
  const { holidayMap: hCur } = useHolidays(i18n.language, currentYear);
  const { holidayMap: hNext } = useHolidays(i18n.language, currentYear + 1);
  const holidayMap = useMemo(() => {
    const merged = new Map<string, HolidayInfo[]>();
    [hPrev, hCur, hNext].forEach((m) => m.forEach((v, k) => merged.set(k, v)));
    return merged;
  }, [hPrev, hCur, hNext]);

  // ─── Fetch data ───
  const fetchData = useCallback(
    async (silent = false) => {
      if (!boardId) return;
      try {
        if (!silent) setLoading(true);
        const [result, contractorList] = await Promise.all([
          boardChecklistAPI.getItemsByAssignee(boardId, {
            start_date: rangeStart,
            end_date: rangeEnd,
          }),
          contractorAPI.list(boardId).catch(() => ({ contractors: [] })),
        ]);
        setData(result);
        setContractors(contractorList.contractors as BoardContractor[]);
      } catch (err) {
        console.warn("Failed to fetch checklist items by assignee", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [boardId, rangeStart, rangeEnd],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh when parent triggers (e.g. after external drop) — debounced to batch rapid updates
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      const timer = setTimeout(() => fetchData(true), 400);
      return () => clearTimeout(timer);
    }
  }, [refreshTrigger, fetchData]);

  // Scroll to today on mount
  useEffect(() => {
    if (!loading && scrollContainerRef.current && todayIndex >= 0) {
      const scrollTo = todayIndex * DAY_WIDTH - 7 * DAY_WIDTH;
      scrollContainerRef.current.scrollLeft = Math.max(0, scrollTo);
    }
  }, [loading, todayIndex]);

  // ─── External DnD drop tracking (from ChecklistItemPanel) ───
  const externalDropRef = useRef<{ rowId: string; dayIndex: number } | null>(
    null,
  );

  useEffect(() => {
    if (!externalDragItem) {
      setDropHighlight(null);
      externalDropRef.current = null;
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Find which row the cursor is over via data attribute
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const rowEl = el?.closest("[data-resource-row]") as HTMLElement | null;
      if (!rowEl) {
        setDropHighlight(null);
        externalDropRef.current = null;
        return;
      }

      const rowId = rowEl.getAttribute("data-resource-row") || "";
      const rowIndex = Number(
        rowEl.getAttribute("data-resource-row-index") || "0",
      );

      // Determine day index: prefer DOM data attribute for accuracy,
      // fall back to pixel math if no grid column element is found.
      let dayIndex = -1;
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      const gridCol = elements.find(
        (el) => el.getAttribute("data-day-index") != null,
      );
      if (gridCol) {
        dayIndex = Number(gridCol.getAttribute("data-day-index"));
      } else {
        const containerRect = container.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        dayIndex = Math.floor(
          (e.clientX - containerRect.left - LEFT_COL_WIDTH + scrollLeft) /
            DAY_WIDTH,
        );
      }

      if (dayIndex >= 0 && dayIndex < timelineDays.length) {
        setDropHighlight({ rowIndex, dayIndex });
        externalDropRef.current = { rowId, dayIndex };
      } else {
        setDropHighlight(null);
        externalDropRef.current = null;
      }
    };

    const handleMouseUp = () => {
      const drop = externalDropRef.current;
      if (drop && externalDragItem && onDropChecklist) {
        const targetDate = formatDateStr(timelineDays[drop.dayIndex]);

        // Optimistic update: immediately add the bar to the chart
        const optimisticItem: AssigneeItemResponse = {
          ...externalDragItem,
          start_date: targetDate,
          due_date: targetDate,
        };
        setData((prevData) => {
          if (!prevData)
            return {
              assignees: [
                {
                  assignee: {
                    id: drop.rowId,
                    name: "",
                    email: "",
                    avatar: null,
                  },
                  items: [optimisticItem],
                },
              ],
              unassigned: [],
            };

          const targetGroupExists = prevData.assignees.some(
            (g) => g.assignee.id === drop.rowId,
          );

          return {
            assignees: targetGroupExists
              ? prevData.assignees.map((group) =>
                  group.assignee.id === drop.rowId
                    ? {
                        ...group,
                        items: [...group.items, optimisticItem],
                      }
                    : group,
                )
              : [
                  ...prevData.assignees,
                  {
                    assignee: {
                      id: drop.rowId,
                      name: "",
                      email: "",
                      avatar: null,
                    },
                    items: [optimisticItem],
                  },
                ],
            // Remove from unassigned if it was there
            unassigned: prevData.unassigned.filter(
              (i) => i.id !== externalDragItem.id,
            ),
          };
        });

        onDropChecklist(
          { id: externalDragItem.id, task_id: externalDragItem.task?.id || "" },
          targetDate,
          drop.rowId,
        );
      }
      setDropHighlight(null);
      externalDropRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [externalDragItem, timelineDays, onDropChecklist]);

  // ─── Build row data ───
  // Always show board members as rows, even when API data is not yet loaded
  const rows = useMemo(() => {
    type Row = {
      kind: "member" | "contractor" | "unassigned";
      id: string;
      contractorId?: string | null;
      managerMemberId?: string | null;
      name: string;
      avatar: string | null;
      color: string | null;
      items: AssigneeItemResponse[];
      jobRoleId: string | null;
      jobRoleName: string | null;
      jobRoleColor: string | null;
      startDate?: string | null;
      endDate?: string | null;
    };

    // Filter members to exclude viewers
    const activeMembers = boardMembers.filter((m) => m.role !== "viewer");

    // Build member rows
    const memberRows: Row[] = activeMembers.map((member) => {
      const assigneeGroup = data?.assignees.find(
        (a) => a.assignee.id === member.userId,
      );
      return {
        kind: "member",
        id: member.userId,
        name: member.name,
        avatar: member.avatar || null,
        color: memberColorMap?.[member.name] || null,
        items: assigneeGroup?.items || [],
        jobRoleId: member.jobRole?.id || null,
        jobRoleName: member.jobRole?.name || null,
        jobRoleColor: member.jobRole?.color || null,
      };
    });

    // 직군별 그룹 모드: 직군 순서대로 정렬 (정의 순서, 미지정은 마지막)
    if (groupByJobRole && jobRoles.length > 0) {
      const orderMap = new Map<string, number>();
      jobRoles.forEach((r, i) => orderMap.set(r.id, i));
      memberRows.sort((a, b) => {
        const ai = a.jobRoleId ? (orderMap.get(a.jobRoleId) ?? 9999) : 10000;
        const bi = b.jobRoleId ? (orderMap.get(b.jobRoleId) ?? 9999) : 10000;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });
    }

    // Build contractor rows grouped by manager
    const memberIdToBoardMemberId = new Map<string, string>();
    activeMembers.forEach((m) => memberIdToBoardMemberId.set(m.id, m.userId));
    const contractorItemsById = new Map<string, AssigneeItemResponse[]>();
    (data?.contractors ?? []).forEach((g) => {
      contractorItemsById.set(g.contractor.id, g.items);
    });

    const contractorsByManager = new Map<string, Row[]>();
    const orphanContractors: Row[] = [];
    contractors.forEach((c) => {
      const row: Row = {
        kind: "contractor",
        id: `contractor:${c.id}`,
        contractorId: c.id,
        managerMemberId: c.manager_member_id || null,
        name: c.name,
        avatar: null,
        color: c.color || null,
        items: contractorItemsById.get(c.id) || [],
        jobRoleId: c.job_role?.id || null,
        jobRoleName: c.job_role?.name || null,
        jobRoleColor: c.job_role?.color || null,
        startDate: c.start_date || null,
        endDate: c.end_date || null,
      };
      if (c.manager_member_id) {
        const arr = contractorsByManager.get(c.manager_member_id) || [];
        arr.push(row);
        contractorsByManager.set(c.manager_member_id, arr);
      } else {
        orphanContractors.push(row);
      }
    });

    // Interleave: member row → manager 의 외주 행들
    const interleaved: Row[] = [];
    memberRows.forEach((mr) => {
      interleaved.push(mr);
      const member = activeMembers.find((m) => m.userId === mr.id);
      if (!member) return;
      const childContractors = contractorsByManager.get(member.id) || [];
      // 직군 그룹 모드에서는 외주의 직군이 우선, 아니면 manager 직군 상속 표시는 그대로 둠
      childContractors.forEach((cr) => interleaved.push(cr));
    });

    // Manager 가 사라진 (또는 viewer 인) 외주는 끝쪽에 모아서 표시
    orphanContractors.forEach((cr) => interleaved.push(cr));

    // Add unassigned row if there are unassigned items
    if (data && data.unassigned.length > 0) {
      interleaved.push({
        kind: "unassigned",
        id: "__unassigned__",
        name: t("schedule.resource.unassigned", "Unassigned"),
        avatar: null,
        color: null,
        items: data.unassigned,
        jobRoleId: null,
        jobRoleName: null,
        jobRoleColor: null,
      });
    }

    return interleaved;
  }, [
    data,
    boardMembers,
    memberColorMap,
    t,
    groupByJobRole,
    jobRoles,
    contractors,
  ]);

  // ─── Compute group segments (직군별 그룹 헤더 위치) ───
  const roleGroupSegments = useMemo(() => {
    if (!groupByJobRole)
      return [] as Array<{
        key: string;
        name: string;
        color: string | null;
        startIndex: number;
        count: number;
      }>;
    const segments: Array<{
      key: string;
      name: string;
      color: string | null;
      startIndex: number;
      count: number;
    }> = [];
    let currentKey: string | null | undefined = undefined; // sentinel
    rows.forEach((row, idx) => {
      // __unassigned__ 행은 별도 그룹으로 노출하지 않음
      if (row.id === "__unassigned__") return;
      const key = row.jobRoleId || "__none__";
      if (key !== currentKey) {
        const role =
          key === "__none__" ? null : jobRoles.find((r) => r.id === key);
        segments.push({
          key,
          name: role?.name || t("jobRole.unassigned", "미지정"),
          color: role?.color || null,
          startIndex: idx,
          count: 0,
        });
        currentKey = key;
      }
      segments[segments.length - 1].count += 1;
    });
    return segments;
  }, [groupByJobRole, rows, jobRoles, t]);

  /** Hidden row indices (collapsed group members) */
  const hiddenRowIndices = useMemo(() => {
    if (!groupByJobRole) return new Set<number>();
    const set = new Set<number>();
    roleGroupSegments.forEach((seg) => {
      if (collapsedRoleGroups.has(seg.key)) {
        for (let i = seg.startIndex; i < seg.startIndex + seg.count; i++) {
          set.add(i);
        }
      }
    });
    return set;
  }, [groupByJobRole, roleGroupSegments, collapsedRoleGroups]);

  // ─── 'w' shortcut: toggle expand/collapse all rows + role groups ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "w" && e.key !== "W") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
        return;
      e.preventDefault();

      if (groupByJobRole && roleGroupSegments.length > 0) {
        const anyExpanded = roleGroupSegments.some(
          (seg) => !collapsedRoleGroups.has(seg.key),
        );
        const allKeys = roleGroupSegments.map((seg) => seg.key);
        const nextCollapsed = anyExpanded
          ? new Set(allKeys)
          : new Set<string>();
        setCollapsedRoleGroups(nextCollapsed);
        try {
          window.localStorage.setItem(
            collapsedKey,
            JSON.stringify([...nextCollapsed]),
          );
        } catch {
          /* ignore */
        }
      }

      setExpandedRows((prev) =>
        prev.size > 0 ? new Set() : new Set(rows.map((r) => r.id)),
      );
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    rows,
    groupByJobRole,
    roleGroupSegments,
    collapsedRoleGroups,
    collapsedKey,
  ]);

  // ─── Bar position calculations ───
  const getBarPosition = useCallback(
    (startDate: string | null, dueDate: string | null) => {
      if (!startDate && !dueDate) return null;

      const effectiveStart = startDate || dueDate!;
      const effectiveEnd = dueDate || startDate!;
      const startDayIndex = diffDays(rangeStart, effectiveStart);
      const endDayIndex = diffDays(rangeStart, effectiveEnd);

      const left = startDayIndex * DAY_WIDTH;
      const width = Math.max(
        (endDayIndex - startDayIndex + 1) * DAY_WIDTH,
        MIN_BAR_WIDTH,
      );

      return { left, width, startDayIndex, endDayIndex };
    },
    [rangeStart],
  );

  // ─── Scroll to a specific item (triggered by panel click) ───
  useEffect(() => {
    if (!scrollToItem || !data || !scrollContainerRef.current) return;

    let targetRowId: string | null = null;
    let targetItem: AssigneeItemResponse | null = null;

    for (const group of data.assignees) {
      const found = group.items.find((i) => i.id === scrollToItem.id);
      if (found) {
        targetRowId = group.assignee.id;
        targetItem = found;
        break;
      }
    }
    if (!targetItem) {
      const found = data.unassigned.find((i) => i.id === scrollToItem.id);
      if (found) {
        targetRowId = "__unassigned__";
        targetItem = found;
      }
    }
    if (!targetItem || !targetRowId) return;

    const pos = getBarPosition(targetItem.start_date, targetItem.due_date);
    if (pos) {
      const containerWidth = scrollContainerRef.current.clientWidth;
      scrollContainerRef.current.scrollTo({
        left: Math.max(0, pos.left - containerWidth / 2 + pos.width / 2),
        behavior: "smooth",
      });
    }

    const rowEl = scrollContainerRef.current.querySelector(
      `[data-resource-row="${targetRowId}"]`,
    );
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    setHighlightedItemId(scrollToItem.id);
    const timer = setTimeout(() => setHighlightedItemId(null), 2000);
    return () => clearTimeout(timer);
  }, [scrollToItem, data, getBarPosition]);

  // ─── Milestone bar positions ───
  const milestoneBarData = useMemo(() => {
    return milestones
      .filter((m) => m.start_date && m.end_date)
      .map((m) => {
        const pos = getBarPosition(m.start_date, m.end_date);
        return { milestone: m, pos };
      })
      .filter((d) => d.pos !== null);
  }, [milestones, getBarPosition]);

  // ─── Handle bar interactions ───
  const handleBarClick = useCallback(
    (item: AssigneeItemResponse) => {
      // 드래그/리사이즈 직후 click 이벤트 무시
      if (wasDraggedRef.current) {
        wasDraggedRef.current = false;
        return;
      }
      if (item.task && onViewTask) {
        onViewTask(item.task.id);
      }
    },
    [onViewTask],
  );

  const handleBarMouseEnter = useCallback(
    (e: React.MouseEvent, item: AssigneeItemResponse) => {
      const featureName = item.feature?.title || "";
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        item,
        featureName,
      });
    },
    [],
  );

  const handleBarMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // ─── Resize/Move handlers ───
  const handleResizeStart = useCallback(
    (
      e: React.MouseEvent,
      item: AssigneeItemResponse,
      assigneeIndex: number,
      type: "resize-left" | "resize-right" | "move",
    ) => {
      e.stopPropagation();
      e.preventDefault();

      if (!item.start_date && !item.due_date) return;

      const startDate = item.start_date || item.due_date!;
      const dueDate = item.due_date || item.start_date!;

      // Compute cursor's day-column index at mousedown for grid-aligned snapping
      const container = scrollContainerRef.current;
      const containerRect = container?.getBoundingClientRect();
      const scrollLeft = container?.scrollLeft || 0;
      const cursorContentX =
        e.clientX - (containerRect?.left || 0) - LEFT_COL_WIDTH + scrollLeft;
      const initialCursorDayIndex = Math.floor(cursorContentX / DAY_WIDTH);

      const rowId = rows[assigneeIndex]?.id || null;
      const initialAssigneeId =
        rowId && rowId !== "__unassigned__" ? rowId : null;
      const newDragState: DragState = {
        itemId: item.id,
        taskId: item.task?.id || "",
        assigneeId: initialAssigneeId,
        assigneeIndex,
        startDate,
        dueDate,
        featureColor: item.feature?.color || "#6366F1",
        dragType: type,
        initialCursorDayIndex,
        currentDeltaDays: 0,
        originRowIndex: assigneeIndex,
        targetRowIndex: assigneeIndex,
        targetAssigneeId: initialAssigneeId,
      };

      setDragState(newDragState);
      dragStateRef.current = newDragState;
      document.body.style.userSelect = "none";
      document.body.style.cursor = type === "move" ? "grabbing" : "ew-resize";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const ds = dragStateRef.current;
        if (!ds) return;

        // X-axis: day-column index for grid-aligned delta
        const cont = scrollContainerRef.current;
        const rect = cont?.getBoundingClientRect();
        const sl = cont?.scrollLeft || 0;
        const contentX =
          moveEvent.clientX - (rect?.left || 0) - LEFT_COL_WIDTH + sl;
        const currentDayIndex = Math.floor(contentX / DAY_WIDTH);
        const deltaDays = currentDayIndex - ds.initialCursorDayIndex;

        // Y-axis: detect target row for cross-row reassignment (move only)
        let newTargetRowIndex = ds.targetRowIndex;
        let newTargetAssigneeId = ds.targetAssigneeId;

        if (ds.dragType === "move") {
          const el = document.elementFromPoint(
            moveEvent.clientX,
            moveEvent.clientY,
          );
          const rowEl = el?.closest(
            "[data-resource-row]",
          ) as HTMLElement | null;
          if (rowEl) {
            const rowIdx = Number(
              rowEl.getAttribute("data-resource-row-index") ??
                ds.originRowIndex,
            );
            if (rowIdx !== newTargetRowIndex) {
              newTargetRowIndex = rowIdx;
              const targetRow = rows[rowIdx];
              newTargetAssigneeId =
                targetRow?.id && targetRow.id !== "__unassigned__"
                  ? targetRow.id
                  : null;
            }
          }
        }

        const hasChanged =
          deltaDays !== ds.currentDeltaDays ||
          newTargetRowIndex !== ds.targetRowIndex;

        if (hasChanged) {
          wasDraggedRef.current = true;
          const updated = {
            ...ds,
            currentDeltaDays: deltaDays,
            targetRowIndex: newTargetRowIndex,
            targetAssigneeId: newTargetAssigneeId,
          };
          dragStateRef.current = updated;
          setDragState(updated);
        }
      };

      const handleMouseUp = async () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        const ds = dragStateRef.current;
        const isCrossRow = ds ? ds.targetRowIndex !== ds.originRowIndex : false;
        if (!ds || (ds.currentDeltaDays === 0 && !isCrossRow)) {
          setDragState(null);
          dragStateRef.current = null;
          return;
        }

        let newStart = ds.startDate;
        let newDue = ds.dueDate;

        if (ds.dragType === "move") {
          newStart = addDaysToDate(ds.startDate, ds.currentDeltaDays);
          newDue = addDaysToDate(ds.dueDate, ds.currentDeltaDays);
        } else if (ds.dragType === "resize-left") {
          newStart = addDaysToDate(ds.startDate, ds.currentDeltaDays);
          if (diffDays(newStart, newDue) < 0) {
            newStart = newDue;
          }
        } else if (ds.dragType === "resize-right") {
          newDue = addDaysToDate(ds.dueDate, ds.currentDeltaDays);
          if (diffDays(newStart, newDue) < 0) {
            newDue = newStart;
          }
        }

        const newAssigneeId = isCrossRow ? ds.targetAssigneeId : ds.assigneeId;

        if (isCrossRow) {
          // Cross-row: remove from origin row, add to target row
          setData((prevData) => {
            if (!prevData) return prevData;
            let movedItem: AssigneeItemResponse | null = null;

            const newAssignees = prevData.assignees.map((group) => ({
              ...group,
              items: group.items.filter((item) => {
                if (item.id === ds.itemId) {
                  movedItem = {
                    ...item,
                    start_date: newStart,
                    due_date: newDue,
                  };
                  return false;
                }
                return true;
              }),
            }));
            let newUnassigned = prevData.unassigned.filter((item) => {
              if (item.id === ds.itemId) {
                movedItem = { ...item, start_date: newStart, due_date: newDue };
                return false;
              }
              return true;
            });

            if (!movedItem) return prevData;

            const targetRow = rows[ds.targetRowIndex];
            if (targetRow?.id === "__unassigned__") {
              newUnassigned = [...newUnassigned, movedItem];
            } else {
              const idx = newAssignees.findIndex(
                (g) => g.assignee.id === targetRow?.id,
              );
              if (idx >= 0) {
                newAssignees[idx] = {
                  ...newAssignees[idx],
                  items: [...newAssignees[idx].items, movedItem],
                };
              }
            }

            return { assignees: newAssignees, unassigned: newUnassigned };
          });
        } else {
          // Same-row: update dates in-place
          setData((prevData) => {
            if (!prevData) return prevData;
            const updateItems = (
              items: AssigneeItemResponse[],
            ): AssigneeItemResponse[] =>
              items.map((item) =>
                item.id === ds.itemId
                  ? { ...item, start_date: newStart, due_date: newDue }
                  : item,
              );
            return {
              assignees: prevData.assignees.map((group) => ({
                ...group,
                items: updateItems(group.items),
              })),
              unassigned: updateItems(prevData.unassigned),
            };
          });
        }

        setDragState(null);
        dragStateRef.current = null;

        if (ds.taskId) {
          try {
            // newAssigneeId 가 "contractor:<id>" 라면 contractor_id 로 전송, 아니면 assignee_id
            const isContractor =
              typeof newAssigneeId === "string" &&
              newAssigneeId.startsWith("contractor:");
            const payload = isContractor
              ? {
                  start_date: newStart,
                  due_date: newDue,
                  assignee_id: null as string | null,
                  contractor_id: newAssigneeId!.substring("contractor:".length),
                }
              : {
                  start_date: newStart,
                  due_date: newDue,
                  assignee_id: newAssigneeId,
                  contractor_id: null as string | null,
                };
            await checklistAPI.updateItem(
              boardId,
              ds.taskId,
              ds.itemId,
              payload,
            );
            const result = await boardChecklistAPI.getItemsByAssignee(boardId, {
              start_date: rangeStart,
              end_date: rangeEnd,
            });
            setData(result);
          } catch (err) {
            console.warn("Failed to update checklist item", err);
            fetchData();
          }
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [boardId, fetchData, rangeStart, rangeEnd, rows],
  );

  // ─── 임시(예정) 바: 빈 행 영역을 드래그해 그리기 ───
  const handleDrawStart = useCallback(
    (e: React.MouseEvent, rowIndex: number, rowId: string) => {
      if (e.button !== 0) return; // 좌클릭만
      if (externalDragItem || dragStateRef.current) return; // 다른 드래그 진행 중
      const target = e.target as HTMLElement;
      // 바/리사이즈 핸들 위에서 시작하면 무시 (바는 stopPropagation 하지만 방어적으로 한번 더)
      if (target.closest("[data-bar]") || target.dataset.resizeHandle) return;

      const container = scrollContainerRef.current;
      const rect = container?.getBoundingClientRect();
      const scrollLeft = container?.scrollLeft || 0;
      const startDayIndex = Math.floor(
        (e.clientX - (rect?.left || 0) - LEFT_COL_WIDTH + scrollLeft) /
          DAY_WIDTH,
      );
      if (startDayIndex < 0 || startDayIndex >= timelineDays.length) return;

      const startClientX = e.clientX;
      let moved = false;
      const initial: DrawState = {
        rowIndex,
        rowId,
        startDayIndex,
        currentDayIndex: startDayIndex,
      };
      drawStateRef.current = initial;
      setDrawState(initial);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "crosshair";

      const handleMove = (moveEvent: MouseEvent) => {
        const ds = drawStateRef.current;
        if (!ds) return;
        if (Math.abs(moveEvent.clientX - startClientX) >= DRAW_DRAG_THRESHOLD) {
          moved = true;
        }
        const cont = scrollContainerRef.current;
        const r = cont?.getBoundingClientRect();
        const sl = cont?.scrollLeft || 0;
        let dayIndex = Math.floor(
          (moveEvent.clientX - (r?.left || 0) - LEFT_COL_WIDTH + sl) /
            DAY_WIDTH,
        );
        dayIndex = Math.max(0, Math.min(timelineDays.length - 1, dayIndex));
        if (dayIndex !== ds.currentDayIndex) {
          const updated = { ...ds, currentDayIndex: dayIndex };
          drawStateRef.current = updated;
          setDrawState(updated);
        }
      };

      const handleUp = (upEvent: MouseEvent) => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        const ds = drawStateRef.current;
        drawStateRef.current = null;
        setDrawState(null);
        if (!ds || !moved) return; // 단순 클릭이면 무시

        const a = Math.min(ds.startDayIndex, ds.currentDayIndex);
        const b = Math.max(ds.startDayIndex, ds.currentDayIndex);
        setPendingTentative({
          rowId: ds.rowId,
          startDate: formatDateStr(timelineDays[a]),
          dueDate: formatDateStr(timelineDays[b]),
          anchorX: upEvent.clientX,
          anchorY: upEvent.clientY,
        });
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [externalDragItem, timelineDays],
  );

  // ─── 임시 항목 생성 (태스크 선택 후) ───
  const handleCreateTentative = useCallback(
    async (taskId: string, title: string) => {
      const pending = pendingTentative;
      if (!pending) return;
      setPendingTentative(null);
      const isContractor = pending.rowId.startsWith("contractor:");
      const isUnassigned = pending.rowId === "__unassigned__";
      try {
        await checklistAPI.addItem(boardId, taskId, {
          title,
          start_date: pending.startDate,
          due_date: pending.dueDate,
          assignee_id: isContractor || isUnassigned ? null : pending.rowId,
          contractor_id: isContractor
            ? pending.rowId.substring("contractor:".length)
            : null,
          is_tentative: true,
        });
        const result = await boardChecklistAPI.getItemsByAssignee(boardId, {
          start_date: rangeStart,
          end_date: rangeEnd,
        });
        setData(result);
      } catch (err) {
        console.warn("Failed to create tentative item", err);
        fetchData();
      }
    },
    [pendingTentative, boardId, rangeStart, rangeEnd, fetchData],
  );

  // ─── 임시 → 실제 체크리스트로 전환 ───
  const handlePromoteTentative = useCallback(
    async (item: AssigneeItemResponse) => {
      setTentativeMenu(null);
      if (!item.task) return;
      try {
        await checklistAPI.patchItem(boardId, item.task.id, item.id, {
          is_tentative: false,
        });
        const result = await boardChecklistAPI.getItemsByAssignee(boardId, {
          start_date: rangeStart,
          end_date: rangeEnd,
        });
        setData(result);
      } catch (err) {
        console.warn("Failed to promote tentative item", err);
        fetchData();
      }
    },
    [boardId, rangeStart, rangeEnd, fetchData],
  );

  // ─── 임시 항목 삭제 ───
  const handleDeleteTentative = useCallback(
    async (item: AssigneeItemResponse) => {
      setTentativeMenu(null);
      if (!item.task) return;
      try {
        await checklistAPI.deleteItem(boardId, item.task.id, item.id);
        setData((prev) => {
          if (!prev) return prev;
          const remove = (arr: AssigneeItemResponse[]) =>
            arr.filter((i) => i.id !== item.id);
          return {
            ...prev,
            assignees: prev.assignees.map((g) => ({
              ...g,
              items: remove(g.items),
            })),
            contractors: prev.contractors?.map((g) => ({
              ...g,
              items: remove(g.items),
            })),
            unassigned: remove(prev.unassigned),
          };
        });
      } catch (err) {
        console.warn("Failed to delete tentative item", err);
        fetchData();
      }
    },
    [boardId, fetchData],
  );

  // ─── External DnD drop handling ───
  const handleDrop = useCallback(
    (e: React.DragEvent, rowId: string, dayIndex: number) => {
      e.preventDefault();
      setDropHighlight(null);

      try {
        const rawData = e.dataTransfer.getData("application/checklist-item");
        if (!rawData) return;
        const parsed = JSON.parse(rawData);

        if (parsed.id && parsed.task_id) {
          const targetDate = formatDateStr(timelineDays[dayIndex]);
          if (onDropChecklist) {
            onDropChecklist(
              { id: parsed.id, task_id: parsed.task_id },
              targetDate,
              rowId,
            );
          }
        }
      } catch {
        // Ignore invalid data
      }
    },
    [timelineDays, onDropChecklist],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, rowIndex: number, dayIndex: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropHighlight({ rowIndex, dayIndex });
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDropHighlight(null);
  }, []);

  // ─── Compute bar styles during drag ───
  const computeDraggedBarPosition = useCallback(
    (item: AssigneeItemResponse) => {
      if (!dragState || dragState.itemId !== item.id) return null;

      let startDate = dragState.startDate;
      let dueDate = dragState.dueDate;

      if (dragState.dragType === "move") {
        startDate = addDaysToDate(startDate, dragState.currentDeltaDays);
        dueDate = addDaysToDate(dueDate, dragState.currentDeltaDays);
      } else if (dragState.dragType === "resize-left") {
        startDate = addDaysToDate(startDate, dragState.currentDeltaDays);
        if (diffDays(startDate, dueDate) < 0) startDate = dueDate;
      } else if (dragState.dragType === "resize-right") {
        dueDate = addDaysToDate(dueDate, dragState.currentDeltaDays);
        if (diffDays(startDate, dueDate) < 0) dueDate = startDate;
      }

      return getBarPosition(startDate, dueDate);
    },
    [dragState, getBarPosition],
  );

  // ─── Header drag-to-scroll ───
  const headerDragRef = useRef<{
    isDown: boolean;
    startX: number;
    scrollLeft: number;
  } | null>(null);

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    headerDragRef.current = {
      isDown: true,
      startX: e.clientX,
      scrollLeft: container.scrollLeft,
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const state = headerDragRef.current;
      if (!state?.isDown) return;
      const dx = moveEvent.clientX - state.startX;
      container.scrollLeft = state.scrollLeft - dx;
    };

    const handleMouseUp = () => {
      headerDragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-bridge-dark">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  // ─── Empty state: only when no board members at all ───
  if (rows.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-bridge-dark">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <div className="w-14 h-14 rounded-2xl bg-bridge-secondary/10 border border-bridge-secondary/20 flex items-center justify-center">
            <Users className="w-7 h-7 text-bridge-secondary" />
          </div>
          <h2 className="text-sm md:text-lg font-bold text-foreground tracking-tight">
            {t("schedule.subTab.resource", "Workload")}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {t("schedule.resource.noItems", "No items assigned")}
          </p>
        </div>
      </div>
    );
  }

  const totalTimelineWidth = timelineDays.length * DAY_WIDTH;
  const totalContentHeight =
    (milestoneBarData.length > 0 ? MILESTONE_ROW_HEIGHT : 0) +
    rows.length * ROW_HEIGHT;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bridge-dark relative">
      {/* Main scrollable container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto custom-scrollbar"
      >
        <div
          style={{
            width: LEFT_COL_WIDTH + totalTimelineWidth,
            minHeight: HEADER_HEIGHT + totalContentHeight,
          }}
        >
          {/* ─── Header row ─── */}
          <div className="flex sticky top-0 z-20 bg-bridge-obsidian border-b border-foreground/[0.08]">
            {/* Empty left corner — 직군별 그룹 토글 + 외주 관리 */}
            <div
              className="shrink-0 sticky left-0 z-30 bg-bridge-obsidian border-r border-foreground/[0.08] flex items-center justify-center gap-1 px-2"
              style={{ width: LEFT_COL_WIDTH, height: HEADER_HEIGHT }}
            >
              {jobRoles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setGroupByJobRole(!groupByJobRole)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    groupByJobRole
                      ? "bg-bridge-accent/20 text-bridge-accent"
                      : "bg-foreground/[0.06] text-slate-400 hover:text-foreground hover:bg-foreground/10"
                  }`}
                  title={t("schedule.resource.groupByJobRole", "직군별 그룹")}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  {groupByJobRole
                    ? t("schedule.resource.groupByJobRole", "직군별")
                    : t("schedule.resource.groupByMember", "멤버별")}
                </button>
              )}
              {onOpenContractorManager && (
                <button
                  type="button"
                  onClick={onOpenContractorManager}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-foreground/[0.06] text-slate-400 hover:text-foreground hover:bg-foreground/10 transition-all"
                  title={t("contractor.manage", "외주 관리")}
                >
                  <Briefcase className="w-3.5 h-3.5 border-l-2 border-dashed pl-0.5" />
                  {t("contractor.short", "외주")}
                </button>
              )}
            </div>

            {/* Day headers — drag to scroll */}
            <div
              className="relative cursor-grab active:cursor-grabbing"
              style={{ width: totalTimelineWidth, height: HEADER_HEIGHT }}
              onMouseDown={handleHeaderMouseDown}
            >
              {timelineDays.map((day, idx) => {
                const weekend = isWeekend(day);
                const isToday = idx === todayIndex;
                const dayNum = day.getDate();
                const showMonth = dayNum === 1 || idx === 0;
                const locale = i18n.language || "en";
                const holidays = holidayMap.get(formatDateStr(day));
                const isHoliday = !!holidays && holidays.length > 0;
                const holidayName = isHoliday
                  ? holidays!.map((h) => h.name).join(", ")
                  : undefined;

                return (
                  <div
                    key={idx}
                    title={holidayName}
                    className={`absolute top-0 flex flex-col items-center justify-center border-r border-foreground/[0.04]
                      ${isHoliday ? "bg-red-500/[0.04]" : weekend ? "bg-foreground/[0.02]" : ""}
                      ${isToday ? "bg-bridge-accent/5" : ""}`}
                    style={{
                      left: idx * DAY_WIDTH,
                      width: DAY_WIDTH,
                      height: HEADER_HEIGHT,
                    }}
                  >
                    <span
                      className={`text-xs ${
                        isHoliday
                          ? "text-red-400"
                          : weekend
                            ? "text-slate-500"
                            : "text-slate-400"
                      }`}
                    >
                      {getDayLabel(day, locale)}
                    </span>
                    <span
                      className={`text-xs font-medium ${
                        isToday
                          ? "w-6 h-6 rounded-full bg-bridge-accent text-white flex items-center justify-center"
                          : isHoliday
                            ? "text-red-400"
                            : weekend
                              ? "text-slate-500"
                              : "text-foreground"
                      }`}
                    >
                      {dayNum}
                    </span>
                    {showMonth && (
                      <span className="text-xs text-slate-500 absolute top-0.5 left-1">
                        {day.toLocaleDateString(locale, { month: "short" })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── Milestone row ─── */}
          {milestoneBarData.length > 0 && (
            <div className="flex border-b border-foreground/[0.08]">
              {/* Left label */}
              <div
                className="shrink-0 sticky left-0 z-10 bg-bridge-obsidian border-r border-foreground/[0.08]
                  flex items-center gap-2 px-4"
                style={{ width: LEFT_COL_WIDTH, height: MILESTONE_ROW_HEIGHT }}
              >
                <Flag size={14} className="text-bridge-accent shrink-0" />
                <span className="text-xs font-medium text-foreground truncate">
                  {t("schedule.resource.milestone", "Milestone")}
                </span>
              </div>

              {/* Timeline area */}
              <div
                className="relative"
                style={{
                  width: totalTimelineWidth,
                  height: MILESTONE_ROW_HEIGHT,
                }}
              >
                {/* Weekend + holiday columns */}
                {timelineDays.map((day, idx) => {
                  const weekend = isWeekend(day);
                  const isHoliday = holidayMap.has(formatDateStr(day));
                  if (!weekend && !isHoliday) return null;
                  return (
                    <div
                      key={`mw-${idx}`}
                      className={`absolute top-0 bottom-0 ${
                        isHoliday ? "bg-red-500/[0.04]" : "bg-foreground/[0.02]"
                      }`}
                      style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                    />
                  );
                })}

                {/* Milestone bars */}
                {milestoneBarData.map(
                  ({ milestone, pos }) =>
                    pos && (
                      <div
                        key={milestone.id}
                        className="absolute h-7 rounded-lg flex items-center px-2 text-xs font-medium
                        text-white bg-bridge-accent/80 hover:bg-bridge-accent hover:shadow-lg transition-all cursor-pointer"
                        style={{
                          left: pos.left,
                          width: pos.width,
                          top: (MILESTONE_ROW_HEIGHT - 28) / 2,
                        }}
                        title={`${milestone.title} (${milestone.start_date} ~ ${milestone.end_date})`}
                        onClick={() => onMilestoneClick?.(milestone)}
                      >
                        <span className="truncate">{milestone.title}</span>
                      </div>
                    ),
                )}

                {/* Today line */}
                {todayIndex >= 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                    style={{ left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }}
                  />
                )}
              </div>
            </div>
          )}

          {/* ─── Member rows ─── */}
          {rows.map((row, rowIndex) => {
            const isCrossRowTarget =
              dragState?.dragType === "move" &&
              dragState.targetRowIndex === rowIndex &&
              dragState.originRowIndex !== rowIndex;

            // 직군 그룹 헤더 — 이 row가 그룹의 시작이면 헤더 먼저 렌더
            const groupSegment = roleGroupSegments.find(
              (s) => s.startIndex === rowIndex,
            );
            const groupHeader = groupSegment ? (
              <div
                key={`group-${groupSegment.key}`}
                className="flex border-b border-foreground/[0.08] bg-bridge-surface/40 sticky z-[5]"
                style={{ minHeight: 36 }}
              >
                <button
                  type="button"
                  onClick={() => toggleRoleGroupCollapsed(groupSegment.key)}
                  className="shrink-0 sticky left-0 z-10 bg-bridge-surface/80 border-r border-foreground/[0.08] flex items-center gap-2 px-4 hover:bg-bridge-surface transition-colors"
                  style={{ width: LEFT_COL_WIDTH }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: groupSegment.color || "#64748b" }}
                  />
                  <Briefcase size={12} className="text-slate-400 shrink-0" />
                  <span className="text-xs font-bold text-foreground truncate flex-1 text-left">
                    {groupSegment.name}
                  </span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                    {groupSegment.count}
                  </span>
                  {collapsedRoleGroups.has(groupSegment.key) ? (
                    <ChevronDown size={14} className="text-slate-400" />
                  ) : (
                    <ChevronUp size={14} className="text-slate-400" />
                  )}
                </button>
                <div
                  className="bg-bridge-surface/40"
                  style={{ width: totalTimelineWidth }}
                />
              </div>
            ) : null;

            // 그룹이 접힌 경우 멤버 행을 숨김 (헤더만 노출)
            if (hiddenRowIndices.has(rowIndex)) {
              return <Fragment key={row.id}>{groupHeader}</Fragment>;
            }

            // Compute bars for this row based on items with valid dates
            const itemsWithBars = row.items
              .filter((item) => item.start_date || item.due_date)
              .map((item) => {
                const isDragging = dragState?.itemId === item.id;
                const pos = isDragging
                  ? computeDraggedBarPosition(item)
                  : getBarPosition(item.start_date, item.due_date);
                return { item, pos, isDragging };
              })
              .filter((d) => d.pos !== null);

            // Stack bars to avoid overlap
            const barLanes = computeBarLanes(
              itemsWithBars.map((d) => ({
                id: d.item.id,
                startDayIndex: d.pos!.startDayIndex,
                endDayIndex: d.pos!.endDayIndex,
              })),
            );

            const maxLane = Math.max(0, ...Object.values(barLanes));
            const isExpanded = expandedRows.has(row.id);
            const needsCollapse = maxLane >= MAX_VISIBLE_LANES;
            const visibleMaxLane =
              !isExpanded && needsCollapse ? MAX_VISIBLE_LANES - 1 : maxLane;
            const hiddenCount =
              needsCollapse && !isExpanded
                ? itemsWithBars.filter(
                    (d) => (barLanes[d.item.id] || 0) >= MAX_VISIBLE_LANES,
                  ).length
                : 0;
            const COLLAPSE_BTN_HEIGHT = needsCollapse ? 28 : 0;
            const dynamicRowHeight = Math.max(
              ROW_HEIGHT,
              (visibleMaxLane + 1) * (BAR_HEIGHT + BAR_TOP_OFFSET) +
                BAR_TOP_OFFSET * 2 +
                COLLAPSE_BTN_HEIGHT,
            );

            return (
              <Fragment key={row.id}>
                {groupHeader}
                <div
                  className={`flex border-b border-foreground/[0.08] ${isCrossRowTarget ? "bg-bridge-accent/5" : ""}`}
                  style={{ height: dynamicRowHeight }}
                  data-resource-row={row.id}
                  data-resource-row-index={rowIndex}
                >
                  {/* Left label */}
                  <div
                    className={`shrink-0 sticky left-0 z-10 bg-bridge-obsidian border-r border-foreground/[0.08]
                    flex flex-col ${row.kind === "contractor" ? "pl-8 pr-4" : "px-4"} pt-3 ${isCrossRowTarget ? "ring-2 ring-bridge-accent/30 ring-inset" : ""}`}
                    style={{
                      width: LEFT_COL_WIDTH,
                      minHeight: dynamicRowHeight,
                    }}
                  >
                    <div className="flex items-start gap-2">
                      {row.avatar ? (
                        <img
                          src={row.avatar}
                          alt={row.name}
                          className="w-7 h-7 rounded-full shrink-0 object-cover"
                        />
                      ) : (
                        <div
                          className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white ${row.kind === "contractor" ? "border-2 border-dashed border-foreground/30" : ""}`}
                          style={{
                            backgroundColor:
                              row.id === "__unassigned__"
                                ? "#64748b"
                                : row.kind === "contractor"
                                  ? row.color || "#94a3b8"
                                  : getAssigneeHex(row.name, row.color),
                          }}
                        >
                          {getInitials(row.name)}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0 mt-0.5">
                        <span className="text-sm font-medium text-foreground truncate">
                          {row.name}
                        </span>
                        {row.kind === "contractor" && (
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mt-0.5">
                            {t("schedule.resource.contractor", "외주")}
                            {(row.startDate || row.endDate) && (
                              <span className="font-medium normal-case tracking-normal ml-1">
                                ·{" "}
                                {row.startDate?.slice(5).replace("-", ".") ||
                                  "?"}
                                ~
                                {row.endDate?.slice(5).replace("-", ".") || "?"}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    {needsCollapse && (
                      <button
                        className="flex items-center gap-1 mt-1.5 text-xs text-slate-400 hover:text-foreground transition-colors"
                        onClick={() => {
                          setExpandedRows((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.id)) {
                              next.delete(row.id);
                            } else {
                              next.add(row.id);
                            }
                            return next;
                          });
                        }}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={12} />
                            {t("schedule.resource.collapse", "Collapse")}
                          </>
                        ) : (
                          <>
                            <ChevronDown size={12} />+{hiddenCount}{" "}
                            {t("schedule.resource.more", "more")}
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Timeline area */}
                  <div
                    className="relative"
                    style={{
                      width: totalTimelineWidth,
                      minHeight: dynamicRowHeight,
                    }}
                    onMouseDown={(e) => handleDrawStart(e, rowIndex, row.id)}
                    onDragOver={(e) => {
                      const rect =
                        scrollContainerRef.current?.getBoundingClientRect();
                      const scrollLeft =
                        scrollContainerRef.current?.scrollLeft || 0;
                      const di = Math.floor(
                        (e.clientX -
                          (rect?.left || 0) -
                          LEFT_COL_WIDTH +
                          scrollLeft) /
                          DAY_WIDTH,
                      );
                      handleDragOver(e, rowIndex, di);
                    }}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => {
                      const rect =
                        scrollContainerRef.current?.getBoundingClientRect();
                      const scrollLeft =
                        scrollContainerRef.current?.scrollLeft || 0;
                      const dayIndex = Math.floor(
                        (e.clientX -
                          (rect?.left || 0) -
                          LEFT_COL_WIDTH +
                          scrollLeft) /
                          DAY_WIDTH,
                      );
                      handleDrop(e, row.id, dayIndex);
                    }}
                  >
                    {/* Weekend + holiday + grid columns */}
                    {timelineDays.map((day, idx) => {
                      const weekend = isWeekend(day);
                      const isHoliday = holidayMap.has(formatDateStr(day));
                      const isHighlighted =
                        dropHighlight?.rowIndex === rowIndex &&
                        dropHighlight?.dayIndex === idx;

                      return (
                        <div
                          key={`grid-${idx}`}
                          data-day-index={idx}
                          className={`absolute top-0 bottom-0 border-r border-foreground/[0.04]
                          ${isHoliday ? "bg-red-500/[0.04]" : weekend ? "bg-foreground/[0.02]" : ""}
                          ${isHighlighted ? "bg-bridge-accent/10 ring-2 ring-bridge-accent/30 ring-inset" : ""}`}
                          style={{ left: idx * DAY_WIDTH, width: DAY_WIDTH }}
                        />
                      );
                    })}

                    {/* Contract period background bar for contractor rows */}
                    {row.kind === "contractor" &&
                      (row.startDate || row.endDate) &&
                      (() => {
                        const periodPos = getBarPosition(
                          row.startDate || null,
                          row.endDate || null,
                        );
                        if (!periodPos) return null;
                        return (
                          <div
                            className="absolute rounded-lg border-2 border-dashed pointer-events-none"
                            style={{
                              left: periodPos.left,
                              width: periodPos.width,
                              top: 0,
                              bottom: 0,
                              borderColor: `${row.color || "#14b8a6"}40`,
                              backgroundColor: `${row.color || "#14b8a6"}08`,
                            }}
                          />
                        );
                      })()}

                    {/* 임시(예정) 바 그리기 미리보기 */}
                    {drawState?.rowIndex === rowIndex &&
                      (() => {
                        const a = Math.min(
                          drawState.startDayIndex,
                          drawState.currentDayIndex,
                        );
                        const b = Math.max(
                          drawState.startDayIndex,
                          drawState.currentDayIndex,
                        );
                        return (
                          <div
                            className="absolute rounded-lg border-2 border-dashed border-bridge-accent bg-bridge-accent/15 pointer-events-none z-20 flex items-center px-2"
                            style={{
                              left: a * DAY_WIDTH,
                              width: (b - a + 1) * DAY_WIDTH,
                              top: BAR_TOP_OFFSET,
                              height: BAR_HEIGHT,
                            }}
                          >
                            <span className="text-xs font-bold text-bridge-accent truncate">
                              {t("schedule.resource.tentative", "예정")}
                            </span>
                          </div>
                        );
                      })()}

                    {/* Checklist item bars */}
                    {itemsWithBars.map(
                      ({ item, pos, isDragging: isItemDragging }) => {
                        if (!pos) return null;

                        const lane = barLanes[item.id] || 0;
                        // Hide bars beyond MAX_VISIBLE_LANES when collapsed
                        if (
                          !isExpanded &&
                          needsCollapse &&
                          lane >= MAX_VISIBLE_LANES
                        )
                          return null;

                        const featureColor = item.feature?.color || "#6366F1";
                        const barTop =
                          BAR_TOP_OFFSET + lane * (BAR_HEIGHT + BAR_TOP_OFFSET);

                        const isHighlightTarget = highlightedItemId === item.id;
                        const isTentative = !!item.tentative;

                        return (
                          <div
                            key={item.id}
                            data-bar="true"
                            className={`absolute rounded-lg flex items-center px-2 text-xs font-medium
                          cursor-pointer hover:brightness-110 hover:shadow-lg transition-all
                          ${isTentative ? "text-foreground border-2 border-dashed" : "text-white"}
                          ${item.completed ? "opacity-50" : ""}
                          ${
                            isItemDragging
                              ? dragState?.targetRowIndex !==
                                dragState?.originRowIndex
                                ? "z-20 opacity-30"
                                : "z-20 shadow-2xl ring-2 ring-white/30"
                              : ""
                          }
                          ${isHighlightTarget ? "z-30 ring-2 ring-white/70 shadow-[0_0_16px_rgba(255,255,255,0.4)] animate-pulse" : ""}`}
                            style={{
                              left: pos.left,
                              width: pos.width,
                              top: barTop,
                              height: BAR_HEIGHT,
                              backgroundColor: isTentative
                                ? `${featureColor}26`
                                : featureColor,
                              borderColor: isTentative
                                ? featureColor
                                : undefined,
                            }}
                            onClick={() => handleBarClick(item)}
                            onContextMenu={
                              isTentative
                                ? (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTentativeMenu({
                                      x: e.clientX,
                                      y: e.clientY,
                                      item,
                                    });
                                  }
                                : undefined
                            }
                            onMouseDown={(e) => {
                              // Ignore if clicking on resize handles
                              if (
                                (e.target as HTMLElement).dataset.resizeHandle
                              )
                                return;
                              handleResizeStart(e, item, rowIndex, "move");
                            }}
                            onMouseEnter={(e) => handleBarMouseEnter(e, item)}
                            onMouseLeave={handleBarMouseLeave}
                          >
                            {/* Left resize handle */}
                            <div
                              data-resize-handle="true"
                              className="absolute top-0 left-0 w-2 h-full cursor-ew-resize
                            hover:bg-white/30 rounded-l-lg"
                              onMouseDown={(e) =>
                                handleResizeStart(
                                  e,
                                  item,
                                  rowIndex,
                                  "resize-left",
                                )
                              }
                            />

                            {/* 예정 뱃지 */}
                            {isTentative && (
                              <span className="shrink-0 mr-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-bridge-accent/15 text-bridge-accent">
                                {t("schedule.resource.tentative", "예정")}
                              </span>
                            )}

                            {/* Content */}
                            <span
                              className={`truncate flex-1 ${item.completed ? "line-through" : ""}`}
                            >
                              {isTentative
                                ? item.title
                                : item.task
                                  ? `${item.task.title} / ${item.title}`
                                  : item.title}
                            </span>
                            {item.completed && (
                              <CheckCircle2
                                size={12}
                                className="ml-1 shrink-0"
                              />
                            )}

                            {/* Right resize handle */}
                            <div
                              data-resize-handle="true"
                              className="absolute top-0 right-0 w-2 h-full cursor-ew-resize
                            hover:bg-white/30 rounded-r-lg"
                              onMouseDown={(e) =>
                                handleResizeStart(
                                  e,
                                  item,
                                  rowIndex,
                                  "resize-right",
                                )
                              }
                            />
                          </div>
                        );
                      },
                    )}

                    {/* Ghost bar for cross-row drag target */}
                    {isCrossRowTarget &&
                      dragState &&
                      (() => {
                        const gs = addDaysToDate(
                          dragState.startDate,
                          dragState.currentDeltaDays,
                        );
                        const ge = addDaysToDate(
                          dragState.dueDate,
                          dragState.currentDeltaDays,
                        );
                        const gPos = getBarPosition(gs, ge);
                        if (!gPos) return null;
                        const originRow = rows[dragState.originRowIndex];
                        const draggedItem = originRow?.items.find(
                          (i) => i.id === dragState.itemId,
                        );
                        return (
                          <div
                            className="absolute rounded-lg flex items-center px-2 text-xs font-medium
                          text-white opacity-50 pointer-events-none z-20 border-2 border-dashed border-white/40"
                            style={{
                              left: gPos.left,
                              width: gPos.width,
                              top: BAR_TOP_OFFSET,
                              height: BAR_HEIGHT,
                              backgroundColor: dragState.featureColor,
                            }}
                          >
                            <span className="truncate">
                              {draggedItem?.task
                                ? `${draggedItem.task.title} / ${draggedItem.title}`
                                : draggedItem?.title || ""}
                            </span>
                          </div>
                        );
                      })()}

                    {/* Today line */}
                    {todayIndex >= 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
                        style={{
                          left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2,
                          borderLeft: "1px dashed",
                          borderColor: "rgb(248 113 113)",
                          width: 0,
                        }}
                      />
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* ─── Tooltip ─── */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-bridge-obsidian border border-foreground/[0.12]
            rounded-lg px-3 py-2 shadow-xl max-w-[240px]"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y + 12,
          }}
        >
          <p className="text-xs font-medium text-foreground truncate">
            {tooltip.item.title}
          </p>
          {tooltip.featureName && (
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {tooltip.featureName}
              {tooltip.item.task && ` > ${tooltip.item.task.title}`}
            </p>
          )}
          {(tooltip.item.start_date || tooltip.item.due_date) && (
            <p className="text-xs text-slate-400 mt-1">
              {tooltip.item.start_date || "?"} ~ {tooltip.item.due_date || "?"}
            </p>
          )}
          {tooltip.item.completed && (
            <span className="text-xs font-bold text-emerald-400 mt-0.5 block">
              {t("schedule.resource.completed", "Completed")}
            </span>
          )}
        </div>
      )}

      {/* ─── 임시 업무 태스크 선택 팝오버 ─── */}
      {pendingTentative && (
        <TaskPickerPopover
          tasks={tasks}
          x={pendingTentative.anchorX}
          y={pendingTentative.anchorY}
          onSelect={handleCreateTentative}
          onClose={() => setPendingTentative(null)}
        />
      )}

      {/* ─── 임시 바 컨텍스트 메뉴 (전환/삭제) ─── */}
      {tentativeMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setTentativeMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setTentativeMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-[180px] bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1.5"
            style={{ left: tentativeMenu.x, top: tentativeMenu.y }}
          >
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-foreground/5 transition-colors"
              onClick={() => handlePromoteTentative(tentativeMenu.item)}
            >
              <ListChecks className="w-4 h-4 text-bridge-secondary shrink-0" />
              {t(
                "schedule.resource.promoteToChecklist",
                "실제 체크리스트로 전환",
              )}
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-foreground/5 transition-colors"
              onClick={() => handleDeleteTentative(tentativeMenu.item)}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              {t("common.delete", "삭제")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

ScheduleResourceView.displayName = "ScheduleResourceView";

// ========================================
// Bar lane computation (stack bars to avoid overlap)
// ========================================

interface BarRange {
  id: string;
  startDayIndex: number;
  endDayIndex: number;
}

function computeBarLanes(bars: BarRange[]): Record<string, number> {
  // Sort by start, then by width (wider first)
  const sorted = [...bars].sort((a, b) => {
    if (a.startDayIndex !== b.startDayIndex)
      return a.startDayIndex - b.startDayIndex;
    return b.endDayIndex - b.startDayIndex - (a.endDayIndex - a.startDayIndex);
  });

  const lanes: Record<string, number> = {};
  const laneEnds: number[] = []; // Track where each lane's last bar ends

  for (const bar of sorted) {
    let assigned = false;
    for (let lane = 0; lane < laneEnds.length; lane++) {
      if (laneEnds[lane] < bar.startDayIndex) {
        lanes[bar.id] = lane;
        laneEnds[lane] = bar.endDayIndex;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      lanes[bar.id] = laneEnds.length;
      laneEnds.push(bar.endDayIndex);
    }
  }

  return lanes;
}
