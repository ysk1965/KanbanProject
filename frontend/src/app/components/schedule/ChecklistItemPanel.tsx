import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  PanelRightClose,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  Flag,
  X,
  Plus,
  Briefcase,
  Columns3,
  Users,
  Check,
} from "lucide-react";
import {
  AssigneeItemResponse,
  boardChecklistAPI,
  resolveFileUrl,
} from "../../utils/api";
import { JobRole, JobRoleInfo, Milestone } from "../../types";
import { BoardMember } from "../ShareBoardModal";
import { ChecklistDragItem } from "./ChecklistDragItem";
import { AddChecklistItemModal } from "./AddChecklistItemModal";
import { getAssigneeHex, getInitials } from "../../utils/assigneeColor";
import { useAuth } from "../../contexts/AuthContext";

// ─── Public interface consumed by sibling views ──────────────────────────────

/** Drag state shared between ChecklistItemPanel and drop target views. */
export interface PanelDragState {
  /** The checklist item being dragged. */
  item: AssigneeItemResponse;
  /** Cursor X at drag start. */
  startX: number;
  /** Cursor Y at drag start. */
  startY: number;
  /** Current cursor X (updated on mousemove). */
  currentX: number;
  /** Current cursor Y (updated on mousemove). */
  currentY: number;
  /** True once cursor has moved ≥3px from start (prevents accidental drags). */
  isActive: boolean;
}

// ─── Component props ──────────────────────────────────────────────────────────

interface ChecklistItemPanelProps {
  boardId: string;
  /** Called when a drag ends successfully on a drop target. */
  onDragStateChange?: (state: PanelDragState | null) => void;
  /** Called when an item is dropped. Panel removes item from list. */
  onItemDropped?: (itemId: string) => void;
  /** Called when user clicks detail button on an item (opens task detail). */
  onItemDetailClick?: (item: AssigneeItemResponse) => void;
  /** Called when a scheduled item is clicked (scroll-to in workload). */
  onScheduledItemClick?: (item: AssigneeItemResponse) => void;
  /** Board members for assignee selection in add modal. */
  boardMembers?: BoardMember[];
  /** Called after new items are added via modal (triggers parent refresh). */
  onItemAdded?: () => void;
  /** Board milestones (with their feature lists) for the milestone filter. */
  milestones?: Milestone[];
  /** 직군(JobRole) 목록 — 필터 드롭다운에 사용 */
  jobRoles?: JobRole[];
  /** userId → JobRoleInfo 매핑 — 항목의 assignee를 직군에 매칭 */
  memberJobRoleMap?: Record<string, JobRoleInfo | null>;
  /** 워크로드 바에서 하이라이트된 태스크 id — 같은 태스크의 항목을 강조 */
  highlightedTaskId?: string | null;
  /** 증가 시 항목 목록만 재조회 (필터/접힘 등 패널 상태는 유지) */
  refreshTrigger?: number;
}

// ─── Feature group types ──────────────────────────────────────────────────────

const NO_FEATURE_KEY = "__no_feature__";
const NO_MILESTONE_KEY = "__no_milestone__";

/** Unified milestone header palette (assigned by sorted order). */
const MILESTONE_PALETTE = [
  "#6366F1",
  "#2DD4BF",
  "#F59E0B",
  "#F43F5E",
  "#A855F7",
  "#10B981",
  "#3B82F6",
  "#EC4899",
];

interface FeatureGroup {
  key: string;
  /** id is null for the "no feature" bucket. */
  featureId: string | null;
  title: string;
  color: string | null;
  items: AssigneeItemResponse[];
}

/** Milestone → (its feature groups) — the outer grouping level. */
interface MilestoneGroup {
  key: string;
  /** id is null for the "no milestone" bucket. */
  milestoneId: string | null;
  title: string;
  color: string;
  /** yyyy-MM-dd start, null for the "no milestone" bucket. */
  startDate: string | null;
  featureGroups: FeatureGroup[];
  itemCount: number;
}

/** feature id → the milestone it belongs to (with a display color). */
interface FeatureMilestoneRef {
  id: string;
  title: string;
  color: string;
  startDate: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The board checklist endpoint returns an `assignee` on each item (see
 * BoardChecklistItemResponse), but the shared AssigneeItemResponse type omits it.
 * Read it through a narrow cast.
 */
function getItemAssignee(
  item: AssigneeItemResponse,
): { id: string; name: string; profile_image: string | null } | null {
  return (
    (
      item as unknown as {
        assignee?: {
          id: string;
          name: string;
          profile_image: string | null;
        } | null;
      }
    ).assignee ?? null
  );
}

function groupItemsByFeature(
  items: AssigneeItemResponse[],
  noFeatureLabel: string,
): FeatureGroup[] {
  const map = new Map<string, FeatureGroup>();
  for (const item of items) {
    const key = item.feature?.id ?? NO_FEATURE_KEY;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        featureId: item.feature?.id ?? null,
        title: item.feature?.title ?? noFeatureLabel,
        color: item.feature?.color ?? null,
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(item);
  }
  // Sort groups, then within each group sort: unscheduled first, scheduled last
  const groups = Array.from(map.values()).sort((a, b) => {
    if (a.featureId === null) return 1;
    if (b.featureId === null) return -1;
    return a.title.localeCompare(b.title);
  });
  for (const group of groups) {
    group.items.sort((a, b) => {
      const aScheduled = !!(a.start_date || a.due_date);
      const bScheduled = !!(b.start_date || b.due_date);
      if (aScheduled !== bScheduled) return aScheduled ? 1 : -1;
      return 0;
    });
  }
  return groups;
}

/**
 * Two-level grouping: Milestone → Feature → items.
 *
 * A checklist item's milestone is resolved by the item's own task-level
 * milestone first (`item.milestone`), falling back to its parent feature's
 * milestone (`featureToMilestone`). This ensures a task explicitly assigned to
 * a milestone is grouped there even when its feature spans another milestone.
 * Items that resolve to neither fall into the "no milestone" bucket, sorted last.
 */
function resolveItemMilestone(
  item: AssigneeItemResponse,
  featureToMilestone: Map<string, FeatureMilestoneRef>,
  milestoneRefById: Map<string, FeatureMilestoneRef>,
): FeatureMilestoneRef | undefined {
  if (item.milestone) {
    // 태스크 단위 마일스톤 우선. 색상/시작일을 위해 ref 맵에서 조회하되,
    // 없으면 최소 정보로 구성한다.
    return (
      milestoneRefById.get(item.milestone.id) ?? {
        id: item.milestone.id,
        title: item.milestone.title,
        color: "#64748B",
        startDate: null,
      }
    );
  }
  return item.feature ? featureToMilestone.get(item.feature.id) : undefined;
}

function groupByMilestone(
  items: AssigneeItemResponse[],
  featureToMilestone: Map<string, FeatureMilestoneRef>,
  milestoneRefById: Map<string, FeatureMilestoneRef>,
  noMilestoneLabel: string,
  noFeatureLabel: string,
): MilestoneGroup[] {
  const buckets = new Map<string, AssigneeItemResponse[]>();
  const refByKey = new Map<string, FeatureMilestoneRef>();
  for (const item of items) {
    const ms = resolveItemMilestone(item, featureToMilestone, milestoneRefById);
    const key = ms?.id ?? NO_MILESTONE_KEY;
    if (ms && !refByKey.has(key)) refByKey.set(key, ms);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(item);
  }

  const groups: MilestoneGroup[] = [];
  for (const [key, bucketItems] of buckets.entries()) {
    const ref = key === NO_MILESTONE_KEY ? null : (refByKey.get(key) ?? null);
    groups.push({
      key,
      milestoneId: ref?.id ?? null,
      title: ref?.title ?? noMilestoneLabel,
      color: ref?.color ?? "#64748B",
      startDate: ref?.startDate ?? null,
      featureGroups: groupItemsByFeature(bucketItems, noFeatureLabel),
      itemCount: bucketItems.length,
    });
  }

  // Sort: by start date (earliest first), no-milestone bucket always last.
  groups.sort((a, b) => {
    if (a.milestoneId === null) return 1;
    if (b.milestoneId === null) return -1;
    if (a.startDate && b.startDate && a.startDate !== b.startDate) {
      return a.startDate < b.startDate ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });
  return groups;
}

// ─── FeatureGroupSection sub-component ───────────────────────────────────────

interface FeatureGroupSectionProps {
  group: FeatureGroup;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FeatureGroupSection({
  group,
  isOpen,
  onToggle,
  children,
}: FeatureGroupSectionProps) {
  return (
    <div>
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 py-1.5 px-1 rounded-lg
          text-left text-xs text-slate-400 hover:text-foreground
          hover:bg-foreground/5 transition-colors"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown size={12} className="shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight size={12} className="shrink-0" aria-hidden="true" />
        )}
        {group.color ? (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: group.color }}
            aria-hidden="true"
          />
        ) : (
          <span
            className="w-2 h-2 rounded-full shrink-0 bg-foreground/20"
            aria-hidden="true"
          />
        )}
        <span className="font-bold text-xs text-foreground truncate">
          {group.title}
        </span>
        <span className="ml-auto text-xs font-bold text-slate-500">
          {group.items.length}
        </span>
      </button>

      {/* Items */}
      {isOpen && <div className="space-y-1 mt-1">{children}</div>}
    </div>
  );
}

// ─── MilestoneGroupSection sub-component ─────────────────────────────────────

interface MilestoneGroupSectionProps {
  group: MilestoneGroup;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function MilestoneGroupSection({
  group,
  isOpen,
  onToggle,
  children,
}: MilestoneGroupSectionProps) {
  const shortDate = group.startDate
    ? group.startDate.slice(5).replace("-", "/")
    : null;
  return (
    <div>
      {/* Milestone header (outer group) */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
        style={{
          backgroundColor: `color-mix(in srgb, ${group.color} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${group.color} 28%, transparent)`,
        }}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown
            size={12}
            className="shrink-0 text-slate-400"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            size={12}
            className="shrink-0 text-slate-400"
            aria-hidden="true"
          />
        )}
        <Flag
          size={12}
          className="shrink-0"
          style={{ color: group.color }}
          aria-hidden="true"
        />
        <span className="font-bold text-xs text-foreground truncate">
          {group.title}
        </span>
        {shortDate && (
          <span
            className="text-xs font-bold px-1.5 py-px rounded-full shrink-0 tabular-nums"
            style={{
              color: group.color,
              backgroundColor: `color-mix(in srgb, ${group.color} 16%, transparent)`,
            }}
          >
            {shortDate}
          </span>
        )}
        <span
          className="ml-auto text-xs font-bold shrink-0 tabular-nums"
          style={{ color: group.color }}
        >
          {group.itemCount}
        </span>
      </button>

      {/* Feature groups nested inside a tinted rail */}
      {isOpen && (
        <div
          className="mt-1 mb-1 ml-2 pl-2.5 space-y-1"
          style={{
            borderLeft: `2px solid color-mix(in srgb, ${group.color} 28%, transparent)`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Right-side panel showing unscheduled checklist items as drag sources.
 * Width: 340px (collapsed: hidden, only a toggle button remains).
 *
 * DnD uses custom mouse events to match the existing ScheduleBlock.tsx pattern.
 */
export function ChecklistItemPanel({
  boardId,
  onDragStateChange,
  onItemDropped,
  onItemDetailClick,
  onScheduledItemClick,
  boardMembers = [],
  onItemAdded,
  milestones = [],
  jobRoles = [],
  memberJobRoleMap = {},
  highlightedTaskId = null,
  refreshTrigger = 0,
}: ChecklistItemPanelProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();

  // ── Panel open/close (persisted per board) ──
  const panelOpenKey = `checklistPanelOpen_${boardId}`;
  const [isOpen, setIsOpenState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(panelOpenKey) !== "0";
  });
  const setIsOpen = useCallback(
    (open: boolean) => {
      setIsOpenState(open);
      try {
        window.localStorage.setItem(panelOpenKey, open ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    [panelOpenKey],
  );

  // ── Add modal ──
  const [showAddModal, setShowAddModal] = useState(false);

  // ── Data ──
  const [items, setItems] = useState<AssigneeItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState("");

  // ── 표시 모드: 미배치(unscheduled) 우선 인박스 vs 전체 (persisted) ──
  const showModeKey = `checklistPanelShowMode_${boardId}`;
  const [showMode, setShowModeState] = useState<"unscheduled" | "all">(() => {
    if (typeof window === "undefined") return "unscheduled";
    return window.localStorage.getItem(showModeKey) === "all"
      ? "all"
      : "unscheduled";
  });
  const setShowMode = useCallback(
    (mode: "unscheduled" | "all") => {
      setShowModeState(mode);
      try {
        window.localStorage.setItem(showModeKey, mode);
      } catch {
        /* ignore */
      }
    },
    [showModeKey],
  );

  // ── Unified filter UI state (C: active chips + "add filter" menu) ──
  // activePicker = which filter's value dropdown is open (chip click / add-menu pick).
  // showAddMenu = the "+ 필터" category menu is open.
  type FilterKey = "milestone" | "jobRole" | "block" | "member";
  const [activePicker, setActivePicker] = useState<FilterKey | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const filterZoneRef = useRef<HTMLDivElement>(null);

  // ── Milestone filter (narrows visible features to those in selected milestone) ──
  // 리스트는 마일스톤별로 그룹핑되므로 필터는 선택 사항(전체 = 모든 마일스톤 그룹 표시).
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(
    null,
  );

  // ── 직군 필터 (단일 선택, "__none__" = 미지정) ──
  const jobRoleFilterKey = `checklistPanelJobRoleFilter_${boardId}`;
  const [selectedJobRoleId, setSelectedJobRoleId] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(jobRoleFilterKey);
    },
  );
  const updateJobRoleFilter = useCallback(
    (id: string | null) => {
      setSelectedJobRoleId(id);
      try {
        if (id) window.localStorage.setItem(jobRoleFilterKey, id);
        else window.localStorage.removeItem(jobRoleFilterKey);
      } catch {
        /* ignore */
      }
    },
    [jobRoleFilterKey],
  );

  // ── 블록 필터 (단일 선택, 항목의 상위 Task가 속한 칸반 블록 기준) ──
  const blockFilterKey = `checklistPanelBlockFilter_${boardId}`;
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(blockFilterKey);
  });
  const updateBlockFilter = useCallback(
    (id: string | null) => {
      setSelectedBlockId(id);
      try {
        if (id) window.localStorage.setItem(blockFilterKey, id);
        else window.localStorage.removeItem(blockFilterKey);
      } catch {
        /* ignore */
      }
    },
    [blockFilterKey],
  );

  // ── 구성원 필터 (아바타 스트립) ──
  // 값: userId | "__none__"(미배정) | "__all__"(전체) | null(미초기화 → 본인 디폴트)
  const memberFilterKey = `checklistPanelMemberFilter_${boardId}`;
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(memberFilterKey);
    },
  );
  // 저장값이 없을 때 최초 1회 본인으로 기본 선택 (사용자가 명시적으로 바꾸면 그 값을 유지).
  const didInitMemberRef = useRef(false);
  const updateMemberFilter = useCallback(
    (id: string | null) => {
      // 아바타 스트립에서는 항상 명시적 값을 저장한다("__all__" 포함) →
      // 다음 방문 때 저장값이 우선하고 본인 디폴트가 재적용되지 않는다.
      setSelectedMemberId(id);
      try {
        if (id) window.localStorage.setItem(memberFilterKey, id);
        else window.localStorage.removeItem(memberFilterKey);
      } catch {
        /* ignore */
      }
    },
    [memberFilterKey],
  );
  // 보드 전환 시 본인 디폴트 재적용 플래그 리셋
  useEffect(() => {
    didInitMemberRef.current = false;
  }, [boardId]);
  // 최초 진입 시 저장값이 없으면 기본 선택.
  // 본인이 보드 멤버(role=MEMBER)면 본인, 아니면 전체.
  // 역할 판정을 위해 boardMembers 로딩(길이>0) 이후에만 초기화한다.
  useEffect(() => {
    if (didInitMemberRef.current) return;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(memberFilterKey);
    if (stored !== null) {
      didInitMemberRef.current = true;
      return;
    }
    if (!currentUser?.id) return;
    if (boardMembers.length === 0) return; // 로딩 대기
    const selfIsMemberRole = boardMembers.some(
      (m) => m.userId === currentUser.id && m.role === "MEMBER",
    );
    setSelectedMemberId(selfIsMemberRole ? currentUser.id : "__all__");
    didInitMemberRef.current = true;
  }, [memberFilterKey, currentUser?.id, boardMembers]);

  /** 실제 필터에 쓰이는 값: "__all__"/null 은 필터 없음. */
  const memberFilterValue: string | null =
    selectedMemberId && selectedMemberId !== "__all__"
      ? selectedMemberId
      : null;

  // ── 그룹 접힘 상태 (기본 전부 펼침 = 미배치 그룹 자동 노출) ──
  // 저장하는 것은 "접힌" 키 집합. 마일스톤은 "ms:{key}", 피처는 "feat:{key}".
  const collapsedGroupKey = `checklistCollapsedGroups_${boardId}`;
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(collapsedGroupKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set();
  });
  // Persist collapsed keys per board.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        collapsedGroupKey,
        JSON.stringify([...collapsedKeys]),
      );
    } catch {
      /* ignore */
    }
  }, [collapsedGroupKey, collapsedKeys]);

  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── Scroll container ref (to preserve scroll position on item removal) ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── 담당자 스트립: 내부 드래그(잡고 끌기)로 좌우 스크롤 ──
  const stripScrollRef = useRef<HTMLDivElement>(null);
  const stripDragRef = useRef({
    down: false,
    startX: 0,
    startScroll: 0,
    moved: false,
  });

  // ── Drag state ──
  const [dragState, setDragState] = useState<PanelDragState | null>(null);
  // Use refs for handlers that need the latest drag values inside document listeners
  const dragStateRef = useRef<PanelDragState | null>(null);

  // ── Load all items (both scheduled and unscheduled) ──
  // 리스트 재조회(드롭 후 refreshTrigger 등)에도 세로 스크롤 위치를 유지한다.
  const loadItems = useCallback(async () => {
    const savedScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    setIsLoading(true);
    setError(null);
    try {
      const response = await boardChecklistAPI.getItems(boardId);
      setItems(response.items);
      // 재렌더 후 스크롤 위치 복원 (배치로 항목이 빠져도 화면이 튀지 않도록)
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedScrollTop;
        }
      });
    } catch (err) {
      console.error("ChecklistItemPanel: failed to load items", err);
      setError(t("common.error"));
    } finally {
      setIsLoading(false);
    }
  }, [boardId, t]);

  useEffect(() => {
    if (boardId) {
      loadItems();
    }
  }, [boardId, loadItems, refreshTrigger]);

  // ── Notify parent of drag state changes ──
  useEffect(() => {
    onDragStateChange?.(dragState);
  }, [dragState, onDragStateChange]);

  // ── ESC to cancel drag ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragStateRef.current) {
        dragStateRef.current = null;
        setDragState(null);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Milestone options (only milestones that have features) ──
  const milestoneOptions = useMemo(() => {
    return milestones
      .filter((m) => (m.features?.length ?? 0) > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [milestones]);

  // ── 마일스톤 매핑 (그룹핑용) ──
  // - featureToMilestone: feature id → 소속 마일스톤 (태스크 마일스톤이 없을 때의 폴백)
  //   피처가 여러 마일스톤에 걸칠 수 있으므로 is_primary 를 우선하고, 없으면 첫 매칭.
  // - milestoneRefById: milestone id → ref (태스크 단위 마일스톤 배정을 우선 반영하기 위함)
  // 색상은 마일스톤을 start_date 순으로 정렬한 인덱스로 통일 팔레트에서 배정.
  const { featureToMilestone, milestoneRefById } = useMemo(() => {
    const sorted = [...milestones].sort((a, b) => {
      if (a.start_date && b.start_date && a.start_date !== b.start_date) {
        return a.start_date < b.start_date ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
    const colorOf = (idx: number) =>
      MILESTONE_PALETTE[idx % MILESTONE_PALETTE.length];
    const refById = new Map<string, FeatureMilestoneRef>();
    sorted.forEach((m, idx) => {
      refById.set(m.id, {
        id: m.id,
        title: m.title,
        color: colorOf(idx),
        startDate: m.start_date ?? null,
      });
    });
    const map = new Map<string, FeatureMilestoneRef>();
    // 1st pass: is_primary 인 피처 우선 배정
    sorted.forEach((m) => {
      for (const f of m.features ?? []) {
        if (f.is_primary) {
          map.set(f.id, refById.get(m.id)!);
        }
      }
    });
    // 2nd pass: 아직 매핑 안 된 피처는 첫 매칭 마일스톤으로
    sorted.forEach((m) => {
      for (const f of m.features ?? []) {
        if (!map.has(f.id)) {
          map.set(f.id, refById.get(m.id)!);
        }
      }
    });
    return { featureToMilestone: map, milestoneRefById: refById };
  }, [milestones]);

  // ── Reset milestone filter if its milestone disappears ──
  useEffect(() => {
    if (
      selectedMilestoneId &&
      !milestones.some((m) => m.id === selectedMilestoneId)
    ) {
      setSelectedMilestoneId(null);
    }
  }, [milestones, selectedMilestoneId]);

  // ── Member filter options (derived from loaded items' assignees) ──
  const memberOptions = useMemo(() => {
    // 보드 멤버 중 role=MEMBER 인 user id 집합. boardMembers 미로딩 시(길이 0)에는
    // 필터를 보류해 기존처럼 항목 담당자 전체를 노출(로딩 후 정정).
    const allowed = new Set<string>();
    for (const m of boardMembers) {
      if (m.role === "MEMBER") allowed.add(m.userId);
    }
    const roleFilterActive = boardMembers.length > 0;

    const map = new Map<
      string,
      { id: string; name: string; profileImage: string | null }
    >();
    for (const item of items) {
      const assignee = getItemAssignee(item);
      if (!assignee || map.has(assignee.id)) continue;
      if (roleFilterActive && !allowed.has(assignee.id)) continue;
      map.set(assignee.id, {
        id: assignee.id,
        name: assignee.name,
        profileImage: assignee.profile_image ?? null,
      });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [items, boardMembers]);

  // ── Reset member filter if the selected member no longer has any items ──
  // 단, 센티널("__all__"/"__none__")과 본인은 항목이 없어도 유지(빈 상태 노출).
  useEffect(() => {
    if (
      selectedMemberId &&
      selectedMemberId !== "__none__" &&
      selectedMemberId !== "__all__" &&
      selectedMemberId !== currentUser?.id &&
      memberOptions.length > 0 &&
      !memberOptions.some((m) => m.id === selectedMemberId)
    ) {
      updateMemberFilter("__all__");
    }
  }, [memberOptions, selectedMemberId, updateMemberFilter, currentUser?.id]);

  // ── Block filter options (derived from loaded items' parent-task blocks) ──
  const blockOptions = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; color: string | null; position: number }
    >();
    for (const item of items) {
      const block = item.block;
      if (block && !map.has(block.id)) {
        map.set(block.id, {
          id: block.id,
          name: block.name,
          color: block.color ?? null,
          position: block.position ?? 0,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  // ── Reset block filter if the selected block no longer has any items ──
  useEffect(() => {
    if (
      selectedBlockId &&
      blockOptions.length > 0 &&
      !blockOptions.some((b) => b.id === selectedBlockId)
    ) {
      updateBlockFilter(null);
    }
  }, [blockOptions, selectedBlockId, updateBlockFilter]);

  // ── Close any open filter menu/picker on outside click ──
  useEffect(() => {
    if (!showAddMenu && !activePicker) return;
    const handleClick = (e: MouseEvent) => {
      if (
        filterZoneRef.current &&
        !filterZoneRef.current.contains(e.target as Node)
      ) {
        setShowAddMenu(false);
        setActivePicker(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAddMenu, activePicker]);

  // ── Drag start handler (onMouseDown on each item) ──
  const handleItemMouseDown = useCallback(
    (e: React.MouseEvent, item: AssigneeItemResponse) => {
      // Only primary button
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const initialState: PanelDragState = {
        item,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        isActive: false,
      };

      dragStateRef.current = initialState;
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const current = dragStateRef.current;
        if (!current) return;

        const dx = moveEvent.clientX - current.startX;
        const dy = moveEvent.clientY - current.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isActive = dist >= 3;

        const updated: PanelDragState = {
          ...current,
          currentX: moveEvent.clientX,
          currentY: moveEvent.clientY,
          isActive,
        };
        dragStateRef.current = updated;
        setDragState({ ...updated });

        // Update cursor
        if (isActive) {
          document.body.style.cursor = "grabbing";
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        const finalState = dragStateRef.current;
        dragStateRef.current = null;
        setDragState(null);

        // If drag was active, check for a drop target
        if (finalState?.isActive) {
          // Look for a registered drop target under the cursor
          const dropTarget = document.elementFromPoint(
            finalState.currentX,
            finalState.currentY,
          );
          const dropCell = dropTarget?.closest("[data-drop-target]");

          if (dropCell) {
            // Signal to parent; the parent handles API call and refresh
            onItemDropped?.(finalState.item.id);
            // Save scroll position before removing item
            const savedScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
            // Optimistically remove from panel list
            setItems((prev) => prev.filter((i) => i.id !== finalState.item.id));
            // Restore scroll position after React re-render
            requestAnimationFrame(() => {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = savedScrollTop;
              }
            });
          }
        }
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [onItemDropped],
  );

  // ── 미배치 판정 (start/due 둘 다 없으면 미배치) ──
  const isUnscheduled = (item: AssigneeItemResponse) =>
    !(item.start_date || item.due_date);

  // ── 1) 담당자·표시모드를 제외한 공통 필터 (마일스톤/블록/직군/검색) ──
  const scopedExceptMemberAndMode = useMemo(() => {
    let result = items;
    if (selectedMilestoneId) {
      // 그룹핑과 동일한 기준: 태스크 마일스톤 우선, 없으면 피처 마일스톤.
      result = result.filter(
        (item) =>
          resolveItemMilestone(item, featureToMilestone, milestoneRefById)
            ?.id === selectedMilestoneId,
      );
    }
    if (selectedJobRoleId) {
      result = result.filter((item) => {
        const assigneeId = getItemAssignee(item)?.id;
        const role = assigneeId ? memberJobRoleMap[assigneeId] : null;
        const key = role?.id || "__none__";
        return key === selectedJobRoleId;
      });
    }
    if (selectedBlockId) {
      result = result.filter((item) => item.block?.id === selectedBlockId);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => item.title.toLowerCase().includes(q));
    }
    return result;
  }, [
    items,
    selectedMilestoneId,
    featureToMilestone,
    milestoneRefById,
    searchQuery,
    selectedJobRoleId,
    selectedBlockId,
    memberJobRoleMap,
  ]);

  const matchesMember = useCallback(
    (item: AssigneeItemResponse) => {
      if (!memberFilterValue) return true;
      const id = getItemAssignee(item)?.id ?? "__none__";
      return id === memberFilterValue;
    },
    [memberFilterValue],
  );

  // ── 2) 요약 헤더 스코프 (담당자 적용, 표시모드 무시) ──
  const summaryScope = useMemo(
    () => scopedExceptMemberAndMode.filter(matchesMember),
    [scopedExceptMemberAndMode, matchesMember],
  );
  const summaryNeed = useMemo(
    () => summaryScope.filter(isUnscheduled).length,
    [summaryScope],
  );
  const summaryTotal = summaryScope.length;
  const summaryPlaced = summaryTotal - summaryNeed;

  // ── 3) 아바타 뱃지 스코프 (표시모드 적용, 담당자 무시) ──
  const badgeScope = useMemo(
    () =>
      showMode === "unscheduled"
        ? scopedExceptMemberAndMode.filter(isUnscheduled)
        : scopedExceptMemberAndMode,
    [scopedExceptMemberAndMode, showMode],
  );
  const memberBadgeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const item of badgeScope) {
      const id = getItemAssignee(item)?.id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      else none += 1;
    }
    return { counts, none, all: badgeScope.length };
  }, [badgeScope]);

  // ── 4) 최종 리스트 (표시모드 + 담당자 모두 적용) ──
  const filteredItems = useMemo(
    () => badgeScope.filter(matchesMember),
    [badgeScope, matchesMember],
  );

  // ── 5) 마일스톤 › 피처 2단 그룹 ──
  const noFeatureLabel = t("schedule.panel.noFeature", "피처 없음");
  const noMilestoneLabel = t("schedule.panel.noMilestone", "마일스톤 미지정");
  const milestoneGroups = useMemo(
    () =>
      groupByMilestone(
        filteredItems,
        featureToMilestone,
        milestoneRefById,
        noMilestoneLabel,
        noFeatureLabel,
      ),
    [
      filteredItems,
      featureToMilestone,
      milestoneRefById,
      noMilestoneLabel,
      noFeatureLabel,
    ],
  );

  // ── Collapsed state: render only a slim toggle strip ──
  if (!isOpen) {
    return (
      <div className="relative border-l border-foreground/[0.08] bg-bridge-obsidian">
        <button
          onClick={() => setIsOpen(true)}
          aria-label={t("schedule.panel.title", "Checklist")}
          className="flex flex-col items-center justify-center w-8 h-full py-4 gap-2
            text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <Search size={14} aria-hidden="true" />
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ writingMode: "vertical-rl" }}
          >
            {t("schedule.panel.title", "Checklist")}
          </span>
        </button>
      </div>
    );
  }

  // ── Unified filter model (C: active chips + "+ 필터" menu) ──────────────────
  // 담당자는 상단 아바타 스트립으로 분리했으므로 "+ 필터"에서는 제외.
  const filterOrder: FilterKey[] = ["milestone", "block", "jobRole"];

  const filterMeta: Record<
    FilterKey,
    { label: string; icon: React.ReactNode }
  > = {
    milestone: {
      label: t("schedule.panel.filterMilestoneShort", "마일스톤"),
      icon: <Flag size={12} aria-hidden="true" />,
    },
    member: {
      label: t("schedule.panel.filterMemberShort", "구성원"),
      icon: <Users size={12} aria-hidden="true" />,
    },
    block: {
      label: t("schedule.panel.filterBlockShort", "블록"),
      icon: <Columns3 size={12} aria-hidden="true" />,
    },
    jobRole: {
      label: t("schedule.panel.filterJobRoleShort", "직군"),
      icon: <Briefcase size={12} aria-hidden="true" />,
    },
  };

  const isFilterAvailable = (key: FilterKey): boolean => {
    switch (key) {
      case "milestone":
        return milestoneOptions.length > 0;
      case "member":
        return memberOptions.length > 0;
      case "block":
        return blockOptions.length > 0;
      case "jobRole":
        return jobRoles.length > 0;
    }
  };

  const filterSelectedId = (key: FilterKey): string | null => {
    switch (key) {
      case "milestone":
        return selectedMilestoneId;
      case "member":
        return selectedMemberId;
      case "block":
        return selectedBlockId;
      case "jobRole":
        return selectedJobRoleId;
    }
  };

  const clearFilter = (key: FilterKey) => {
    switch (key) {
      case "milestone":
        setSelectedMilestoneId(null);
        break;
      case "member":
        updateMemberFilter(null);
        break;
      case "block":
        updateBlockFilter(null);
        break;
      case "jobRole":
        updateJobRoleFilter(null);
        break;
    }
  };

  const selectFilterValue = (key: FilterKey, id: string) => {
    switch (key) {
      case "milestone":
        setSelectedMilestoneId(id);
        break;
      case "member":
        updateMemberFilter(id);
        break;
      case "block":
        updateBlockFilter(id);
        break;
      case "jobRole":
        updateJobRoleFilter(id);
        break;
    }
    setActivePicker(null);
    setShowAddMenu(false);
  };

  const memberAvatar = (
    name: string,
    profileImage: string | null,
    size = 14,
  ): React.ReactNode =>
    profileImage ? (
      <img
        src={resolveFileUrl(profileImage)}
        alt=""
        draggable={false}
        className="rounded-full shrink-0 object-cover select-none pointer-events-none"
        style={{ width: size, height: size }}
      />
    ) : (
      <span
        className="rounded-full shrink-0 grid place-items-center text-white font-bold"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.5,
          backgroundColor: getAssigneeHex(name),
        }}
        aria-hidden="true"
      >
        {getInitials(name)}
      </span>
    );

  // Chip label/leading-visual for a selected filter value.
  const renderChipContent = (key: FilterKey): React.ReactNode => {
    const id = filterSelectedId(key);
    if (!id) return null;
    switch (key) {
      case "milestone": {
        const ms = milestoneOptions.find((m) => m.id === id);
        return <span className="truncate">{ms?.title ?? ""}</span>;
      }
      case "member": {
        if (id === "__none__")
          return <span>{t("schedule.panel.unassigned", "미배정")}</span>;
        const m = memberOptions.find((x) => x.id === id);
        if (!m) return null;
        return (
          <>
            {memberAvatar(m.name, m.profileImage)}
            <span className="truncate">{m.name}</span>
          </>
        );
      }
      case "block": {
        const b = blockOptions.find((x) => x.id === id);
        if (!b) return null;
        return (
          <>
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: b.color || "#6366F1" }}
            />
            <span className="truncate">{b.name}</span>
          </>
        );
      }
      case "jobRole": {
        if (id === "__none__")
          return <span>{t("jobRole.unassigned", "미지정")}</span>;
        const r = jobRoles.find((x) => x.id === id);
        return r ? <span className="truncate">{r.name}</span> : null;
      }
    }
  };

  // Value dropdown rows for a filter (used from both the chip and the add-menu).
  const renderPickerOptions = (key: FilterKey): React.ReactNode => {
    const selectedId = filterSelectedId(key);
    const rowCls =
      "w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-foreground/5 transition-colors";
    const noneCls =
      "w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-foreground/5 transition-colors border-t border-foreground/[0.06] mt-1 pt-1.5";
    switch (key) {
      case "milestone":
        return milestoneOptions.map((m) => (
          <button
            key={m.id}
            onClick={() => selectFilterValue("milestone", m.id)}
            className={rowCls}
          >
            {selectedId === m.id && (
              <Check size={12} className="shrink-0 text-bridge-accent" />
            )}
            <span className="truncate">{m.title}</span>
            <span className="ml-auto text-xs text-slate-500 shrink-0">
              {m.features?.length ?? 0}
            </span>
          </button>
        ));
      case "member":
        return (
          <>
            {memberOptions.map((m) => (
              <button
                key={m.id}
                onClick={() => selectFilterValue("member", m.id)}
                className={rowCls}
              >
                {memberAvatar(m.name, m.profileImage, 18)}
                <span className="truncate">{m.name}</span>
                {selectedId === m.id && (
                  <Check
                    size={12}
                    className="ml-auto shrink-0 text-bridge-accent"
                  />
                )}
              </button>
            ))}
            <button
              onClick={() => selectFilterValue("member", "__none__")}
              className={noneCls}
            >
              <span className="w-[18px] h-[18px] rounded-full shrink-0 bg-foreground/10" />
              {t("schedule.panel.unassigned", "미배정")}
            </button>
          </>
        );
      case "block":
        return blockOptions.map((b) => (
          <button
            key={b.id}
            onClick={() => selectFilterValue("block", b.id)}
            className={rowCls}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: b.color || "#6366F1" }}
            />
            <span className="truncate">{b.name}</span>
            {selectedId === b.id && (
              <Check
                size={12}
                className="ml-auto shrink-0 text-bridge-accent"
              />
            )}
          </button>
        ));
      case "jobRole":
        return (
          <>
            {jobRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => selectFilterValue("jobRole", role.id)}
                className={rowCls}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: role.color || "#6366F1" }}
                />
                <span className="truncate">{role.name}</span>
                {selectedId === role.id && (
                  <Check
                    size={12}
                    className="ml-auto shrink-0 text-bridge-accent"
                  />
                )}
              </button>
            ))}
            <button
              onClick={() => selectFilterValue("jobRole", "__none__")}
              className={noneCls}
            >
              <span className="w-2 h-2 rounded-full shrink-0 bg-slate-500" />
              {t("jobRole.unassigned", "미지정")}
            </button>
          </>
        );
    }
  };

  const activeFilterKeys = filterOrder.filter(
    (k) => isFilterAvailable(k) && filterSelectedId(k) !== null,
  );
  const addableFilterKeys = filterOrder.filter(
    (k) => isFilterAvailable(k) && filterSelectedId(k) === null,
  );

  const pickerDropdownCls =
    "absolute top-full left-0 mt-1 z-30 min-w-[180px] max-w-[calc(100%-16px)] bg-bridge-obsidian border border-foreground/[0.08] rounded-lg shadow-xl max-h-[240px] overflow-y-auto custom-scrollbar py-1";

  // ── 담당자 아바타 스트립 데이터 ──
  const isAllSelected = !selectedMemberId || selectedMemberId === "__all__";
  // 본인 아바타(나)는 본인이 보드 멤버(role=MEMBER)일 때만 노출.
  // boardMembers 미로딩(길이 0) 시엔 허용(로딩 후 정정).
  const selfIsMember =
    !currentUser?.id
      ? false
      : boardMembers.length === 0
        ? true
        : boardMembers.some(
            (m) => m.userId === currentUser.id && m.role === "MEMBER",
          );
  const selfInOptions = memberOptions.find((m) => m.id === currentUser?.id);
  const selfEntry =
    currentUser && selfIsMember
      ? {
          id: currentUser.id,
          name: selfInOptions?.name ?? currentUser.name,
          profileImage:
            selfInOptions?.profileImage ?? currentUser.profile_image ?? null,
        }
      : null;
  const otherMembers = memberOptions.filter((m) => m.id !== currentUser?.id);
  const summaryWho = isAllSelected
    ? null
    : selectedMemberId === "__none__"
      ? t("schedule.panel.unassigned", "미배정")
      : (memberOptions.find((m) => m.id === selectedMemberId)?.name ??
        (selectedMemberId === currentUser?.id ? currentUser?.name : null) ??
        null);
  const summaryPct =
    summaryTotal > 0 ? Math.round((summaryPlaced / summaryTotal) * 100) : 0;

  // ── 담당자 스트립 드래그-스크롤 핸들러 ──
  const handleStripMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = stripScrollRef.current;
    if (!el) return;
    stripDragRef.current = {
      down: true,
      startX: e.pageX,
      startScroll: el.scrollLeft,
      moved: false,
    };
  };
  const handleStripMouseMove = (e: React.MouseEvent) => {
    const st = stripDragRef.current;
    const el = stripScrollRef.current;
    if (!st.down || !el) return;
    const dx = e.pageX - st.startX;
    if (Math.abs(dx) > 3) st.moved = true;
    el.scrollLeft = st.startScroll - dx;
  };
  const endStripDrag = () => {
    stripDragRef.current.down = false;
  };
  // 드래그로 끌었으면 뒤따라오는 아바타 클릭(필터 선택)을 취소한다.
  const handleStripClickCapture = (e: React.MouseEvent) => {
    if (stripDragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      stripDragRef.current.moved = false;
    }
  };

  // 담당자 아바타 버튼 (스트립 공용)
  const renderStripAvatar = (
    key: string,
    face: React.ReactNode,
    label: string,
    count: number,
    isSelected: boolean,
    onClick: () => void,
  ) => {
    // 3자리 초과는 "99+"로 축약해 배지가 아바타를 벗어나 잘리지 않도록 한다.
    const countLabel = count > 99 ? "99+" : String(count);
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        aria-pressed={isSelected}
        title={`${label} · ${count}`}
        className="flex flex-col items-center gap-1 w-[46px] shrink-0 group"
      >
        <span
          className={`relative rounded-full transition-all ${
            isSelected
              ? "ring-2 ring-bridge-accent ring-offset-2 ring-offset-bridge-obsidian"
              : "opacity-70 group-hover:opacity-100"
          }`}
        >
          {face}
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full
            flex items-center justify-center text-xs font-bold leading-none
            border-2 border-bridge-obsidian tabular-nums ${
              count > 0
                ? "bg-amber-500 text-[#1a1200]"
                : "bg-slate-600 text-slate-900"
            }`}
          >
            {countLabel}
          </span>
        </span>
        <span
          className={`text-xs max-w-[46px] truncate ${
            isSelected ? "text-foreground font-medium" : "text-slate-500"
          }`}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* Panel container */}
      <div
        className="w-[340px] border-l border-foreground/[0.08] bg-bridge-obsidian
          flex flex-col overflow-hidden shrink-0"
        role="complementary"
        aria-label={t("schedule.panel.title", "Checklist")}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/[0.08]">
          <span className="text-[13px] font-bold text-foreground">
            {t("schedule.panel.title", "Checklist")}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setShowAddModal(true)}
              aria-label={t("schedule.panel.addItem", "Add checklist item")}
              className="p-1 rounded-lg text-slate-500 hover:text-foreground
                hover:bg-foreground/5 transition-colors"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              aria-label={t("common.close", "Close")}
              className="p-1 rounded-lg text-slate-500 hover:text-foreground
                hover:bg-foreground/5 transition-colors"
            >
              <PanelRightClose size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Summary header — 배치 필요 요약 + 진행률 */}
        <div className="px-4 py-3 border-b border-foreground/[0.08]">
          <div className="flex items-baseline gap-1.5">
            {summaryWho && (
              <span className="text-xs font-bold text-bridge-accent truncate max-w-[110px]">
                {summaryWho}
              </span>
            )}
            <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
              {summaryNeed}
            </span>
            <span className="text-xs text-slate-400">
              {t("schedule.panel.needPlacement", "개 배치 필요")}
            </span>
            <span className="ml-auto text-xs text-slate-500 tabular-nums shrink-0">
              {t("schedule.panel.placedOf", {
                defaultValue: "배치 {{placed}}/{{total}}",
                placed: summaryPlaced,
                total: summaryTotal,
              })}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-foreground/[0.07] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-[width] duration-300"
              style={{ width: `${summaryPct}%` }}
            />
          </div>
        </div>

        {/* 미배치 / 전체 세그먼트 */}
        <div className="px-3 pt-2.5">
          <div
            role="tablist"
            aria-label={t("schedule.panel.showMode", "표시 모드")}
            className="flex gap-1 p-0.5 rounded-lg bg-foreground/[0.03] border border-foreground/10"
          >
            <button
              role="tab"
              aria-selected={showMode === "unscheduled"}
              onClick={() => setShowMode("unscheduled")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                showMode === "unscheduled"
                  ? "bg-bridge-accent text-white"
                  : "text-slate-400 hover:text-foreground"
              }`}
            >
              {t("schedule.panel.modeUnscheduled", "미배치")}
              <span className="text-xs font-bold tabular-nums opacity-80">
                {summaryNeed}
              </span>
            </button>
            <button
              role="tab"
              aria-selected={showMode === "all"}
              onClick={() => setShowMode("all")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                showMode === "all"
                  ? "bg-bridge-accent text-white"
                  : "text-slate-400 hover:text-foreground"
              }`}
            >
              {t("schedule.panel.modeAll", "전체")}
              <span className="text-xs font-bold tabular-nums opacity-80">
                {summaryTotal}
              </span>
            </button>
          </div>
        </div>

        {/* 담당자 아바타 스트립 */}
        {(selfEntry || otherMembers.length > 0) && (
          <div className="pt-2.5 pb-2 border-b border-foreground/[0.08]">
            <div className="px-4 pb-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
              {t("schedule.panel.filterMemberShort", "담당자")}
            </div>
            <div
              ref={stripScrollRef}
              onMouseDown={handleStripMouseDown}
              onMouseMove={handleStripMouseMove}
              onMouseUp={endStripDrag}
              onMouseLeave={endStripDrag}
              onDragStart={(e) => e.preventDefault()}
              onClickCapture={handleStripClickCapture}
              className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto custom-scrollbar
                cursor-grab active:cursor-grabbing select-none"
            >
              {/* 전체 */}
              {renderStripAvatar(
                "__all__",
                <span className="w-9 h-9 rounded-full grid place-items-center bg-bridge-surface text-slate-300 text-xs font-bold">
                  {t("schedule.panel.allShort", "전체")}
                </span>,
                t("common.all", "전체"),
                memberBadgeCounts.all,
                isAllSelected,
                () => updateMemberFilter("__all__"),
              )}
              {/* 본인 */}
              {selfEntry &&
                renderStripAvatar(
                  selfEntry.id,
                  memberAvatar(selfEntry.name, selfEntry.profileImage, 36),
                  t("schedule.panel.me", "나"),
                  memberBadgeCounts.counts.get(selfEntry.id) ?? 0,
                  selectedMemberId === selfEntry.id,
                  () => updateMemberFilter(selfEntry.id),
                )}
              {/* 그 외 구성원 */}
              {otherMembers.map((m) =>
                renderStripAvatar(
                  m.id,
                  memberAvatar(m.name, m.profileImage, 36),
                  m.name,
                  memberBadgeCounts.counts.get(m.id) ?? 0,
                  selectedMemberId === m.id,
                  () => updateMemberFilter(m.id),
                ),
              )}
              {/* 미배정 */}
              {memberBadgeCounts.none > 0 &&
                renderStripAvatar(
                  "__none__",
                  <span className="w-9 h-9 rounded-full grid place-items-center bg-foreground/10 text-slate-500 text-xs font-bold">
                    ?
                  </span>,
                  t("schedule.panel.unassigned", "미배정"),
                  memberBadgeCounts.none,
                  selectedMemberId === "__none__",
                  () => updateMemberFilter("__none__"),
                )}
            </div>
          </div>
        )}

        {/* Search input */}
        <div className="px-3 py-2 border-b border-foreground/[0.08]">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("schedule.panel.search", "Search...")}
              aria-label={t("schedule.panel.search", "Search...")}
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg
                py-1.5 pl-7 pr-3 text-xs text-foreground placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
          </div>
        </div>

        {/* Filter zone (C: active chips + "+ 필터" menu) */}
        {(activeFilterKeys.length > 0 || addableFilterKeys.length > 0) && (
          <div
            ref={filterZoneRef}
            className="px-3 py-2 border-b border-foreground/[0.08]"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Active filter chips */}
              {activeFilterKeys.map((key) => {
                const isPickerOpen = activePicker === key;
                return (
                  <div key={key} className="relative">
                    <span
                      className="inline-flex items-center gap-1.5 max-w-[220px] pl-2 pr-1 py-1 rounded-lg
                        bg-bridge-accent/10 text-bridge-accent text-xs font-medium border border-bridge-accent/20"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMenu(false);
                          setActivePicker(isPickerOpen ? null : key);
                        }}
                        aria-expanded={isPickerOpen}
                        className="inline-flex items-center gap-1.5 max-w-[180px] hover:opacity-80 transition-opacity"
                      >
                        {filterMeta[key].icon}
                        {renderChipContent(key)}
                      </button>
                      <button
                        type="button"
                        onClick={() => clearFilter(key)}
                        aria-label={t("common.remove", "Remove")}
                        className="p-0.5 rounded hover:bg-bridge-accent/20 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                    {isPickerOpen && (
                      <div className={pickerDropdownCls}>
                        {renderPickerOptions(key)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* "+ 필터" add-filter button */}
              {addableFilterKeys.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setActivePicker(null);
                      setShowAddMenu((p) => !p);
                    }}
                    aria-expanded={showAddMenu}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs
                      text-slate-400 border border-dashed border-foreground/15
                      hover:text-foreground hover:border-foreground/25 hover:bg-foreground/5 transition-colors"
                  >
                    <Plus size={12} aria-hidden="true" />
                    <span>{t("schedule.panel.addFilter", "필터")}</span>
                  </button>

                  {/* Category menu */}
                  {showAddMenu && (
                    <div
                      className="absolute top-full left-0 mt-1 z-30 min-w-[160px]
                        bg-bridge-obsidian border border-foreground/[0.08] rounded-lg shadow-xl py-1"
                    >
                      {addableFilterKeys.map((key) => (
                        <button
                          key={key}
                          onClick={() => {
                            setShowAddMenu(false);
                            setActivePicker(key);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs
                            text-foreground hover:bg-foreground/5 transition-colors"
                        >
                          <span className="text-slate-400">
                            {filterMeta[key].icon}
                          </span>
                          <span>{filterMeta[key].label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Value picker for a filter being added (no value yet) */}
                  {activePicker &&
                    filterSelectedId(activePicker) === null &&
                    addableFilterKeys.includes(activePicker) && (
                      <div className={pickerDropdownCls}>
                        {renderPickerOptions(activePicker)}
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scrollable item list */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-3"
        >
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2
                size={18}
                className="animate-spin mr-2 text-bridge-accent"
                aria-hidden="true"
              />
              <span className="text-xs">
                {t("common.loading", "Loading...")}
              </span>
            </div>
          )}

          {!isLoading && error && (
            <div role="alert" className="text-xs text-red-400 text-center py-4">
              {error}
            </div>
          )}

          {!isLoading && !error && filteredItems.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-slate-500">
                {searchQuery
                  ? t("common.noData", "No data available")
                  : summaryWho
                    ? t(
                        "schedule.panel.noItemsForMember",
                        "이 담당자의 배치할 항목이 없어요 🎉",
                      )
                    : showMode === "unscheduled"
                      ? t(
                          "schedule.panel.noUnscheduled",
                          "All items are scheduled",
                        )
                      : t("common.noData", "No data available")}
              </p>
            </div>
          )}

          {!isLoading && !error && filteredItems.length > 0 && (
            <>
              {milestoneGroups.map((ms) => {
                const msCollapseKey = `ms:${ms.key}`;
                const msOpen = !collapsedKeys.has(msCollapseKey);
                return (
                  <MilestoneGroupSection
                    key={ms.key}
                    group={ms}
                    isOpen={msOpen}
                    onToggle={() => toggleCollapsed(msCollapseKey)}
                  >
                    {ms.featureGroups.map((group) => {
                      const featCollapseKey = `feat:${group.key}`;
                      const featOpen = !collapsedKeys.has(featCollapseKey);
                      return (
                        <FeatureGroupSection
                          key={group.key}
                          group={group}
                          isOpen={featOpen}
                          onToggle={() => toggleCollapsed(featCollapseKey)}
                        >
                          {group.items.map((item) => {
                            const scheduled = !!(
                              item.start_date || item.due_date
                            );
                            return (
                              <ChecklistDragItem
                                key={item.id}
                                item={item}
                                assignee={getItemAssignee(item)}
                                isDragging={
                                  dragState?.item.id === item.id &&
                                  dragState.isActive
                                }
                                isScheduled={scheduled}
                                isHighlighted={
                                  !!highlightedTaskId &&
                                  item.task?.id === highlightedTaskId
                                }
                                onMouseDown={handleItemMouseDown}
                                onDetailClick={onItemDetailClick}
                                onScheduledClick={() =>
                                  onScheduledItemClick?.(item)
                                }
                              />
                            );
                          })}
                        </FeatureGroupSection>
                      );
                    })}
                  </MilestoneGroupSection>
                );
              })}
            </>
          )}
        </div>

        {/* Drag hint footer */}
        <div className="px-4 py-3 border-t border-foreground/[0.08]">
          <p className="text-xs text-slate-600 text-center leading-relaxed">
            💡{" "}
            {t("schedule.panel.dragHint", "Drag to place on calendar/resource")}
          </p>
        </div>
      </div>

      {/* Ghost element (rendered while dragging) */}
      {dragState?.isActive && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none z-50 w-[240px]
            bg-bridge-accent/20 border border-bridge-accent rounded-lg px-3 py-2
            shadow-lg shadow-bridge-accent/20"
          style={{
            left: dragState.currentX + 12,
            top: dragState.currentY - 16,
          }}
        >
          {/* Feature color accent */}
          {dragState.item.feature && (
            <div
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
              style={{ backgroundColor: dragState.item.feature.color }}
            />
          )}
          <span className="text-xs font-medium text-foreground truncate block pl-1">
            {dragState.item.title}
          </span>
          {(() => {
            const ghostAssignee = getItemAssignee(dragState.item);
            const ghostSubtitle = [
              dragState.item.feature?.title,
              dragState.item.task?.title,
            ]
              .filter(Boolean)
              .join(" > ");
            if (!ghostAssignee && !ghostSubtitle) return null;
            return (
              <span className="flex items-center gap-1 text-xs text-slate-500 truncate pl-1 mt-0.5">
                {ghostAssignee && (
                  <span className="text-slate-400 shrink-0">
                    {ghostAssignee.name}
                  </span>
                )}
                {ghostAssignee && ghostSubtitle && (
                  <span className="text-slate-600 shrink-0">·</span>
                )}
                {ghostSubtitle && (
                  <span className="truncate">{ghostSubtitle}</span>
                )}
              </span>
            );
          })()}
        </div>
      )}

      {/* Add checklist item modal */}
      {showAddModal && (
        <AddChecklistItemModal
          boardId={boardId}
          boardMembers={boardMembers}
          onAdd={() => {
            loadItems();
            onItemAdded?.();
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  );
}

ChecklistItemPanel.displayName = "ChecklistItemPanel";
