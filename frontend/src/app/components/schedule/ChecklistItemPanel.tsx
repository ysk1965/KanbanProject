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
import { AssigneeItemResponse, boardChecklistAPI } from "../../utils/api";
import { JobRole, JobRoleInfo, Milestone } from "../../types";
import { BoardMember } from "../ShareBoardModal";
import { ChecklistDragItem } from "./ChecklistDragItem";
import { AddChecklistItemModal } from "./AddChecklistItemModal";
import { getTodayDateString } from "../../utils/dateUtils";
import { getAssigneeHex, getInitials } from "../../utils/assigneeColor";

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

interface FeatureGroup {
  key: string;
  /** id is null for the "no feature" bucket. */
  featureId: string | null;
  title: string;
  color: string | null;
  items: AssigneeItemResponse[];
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

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Right-side panel showing unscheduled checklist items as drag sources.
 * Width: 280px (collapsed: hidden, only a toggle button remains).
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

  // ── Unified filter UI state (C: active chips + "add filter" menu) ──
  // activePicker = which filter's value dropdown is open (chip click / add-menu pick).
  // showAddMenu = the "+ 필터" category menu is open.
  type FilterKey = "milestone" | "jobRole" | "block" | "member";
  const [activePicker, setActivePicker] = useState<FilterKey | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const filterZoneRef = useRef<HTMLDivElement>(null);

  // ── Milestone filter (narrows visible features to those in selected milestone) ──
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(
    null,
  );
  // Apply the "current period" default only once per board (do not override user choice).
  const didInitMilestoneRef = useRef(false);

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

  // ── 구성원 필터 (단일 선택, "__none__" = 미배정, 담당자는 항목에서 파생) ──
  const memberFilterKey = `checklistPanelMemberFilter_${boardId}`;
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(memberFilterKey);
    },
  );
  const updateMemberFilter = useCallback(
    (id: string | null) => {
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

  // ── Feature group expand state (expanded feature keys; default = all collapsed) ──
  const expandedFeatureKey = `expandedChecklistFeatures_${boardId}`;
  const [expandedFeatureKeys, setExpandedFeatureKeys] = useState<Set<string>>(
    () => {
      if (typeof window === "undefined") return new Set();
      try {
        const raw = window.localStorage.getItem(expandedFeatureKey);
        if (raw) return new Set(JSON.parse(raw) as string[]);
      } catch {
        /* ignore */
      }
      return new Set();
    },
  );
  // Persist expanded keys per board.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        expandedFeatureKey,
        JSON.stringify([...expandedFeatureKeys]),
      );
    } catch {
      /* ignore */
    }
  }, [expandedFeatureKey, expandedFeatureKeys]);

  // ── Scroll container ref (to preserve scroll position on item removal) ──
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Drag state ──
  const [dragState, setDragState] = useState<PanelDragState | null>(null);
  // Use refs for handlers that need the latest drag values inside document listeners
  const dragStateRef = useRef<PanelDragState | null>(null);

  // ── Load all items (both scheduled and unscheduled) ──
  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await boardChecklistAPI.getItems(boardId);
      setItems(response.items);
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

  // ── Default to the milestone covering the current date (once per board) ──
  useEffect(() => {
    if (didInitMilestoneRef.current) return;
    if (milestoneOptions.length === 0) return;
    const today = getTodayDateString();
    const current = milestoneOptions.find(
      (m) =>
        m.start_date &&
        m.end_date &&
        m.start_date <= today &&
        today <= m.end_date,
    );
    if (current) {
      setSelectedMilestoneId(current.id);
    }
    didInitMilestoneRef.current = true;
  }, [milestoneOptions]);

  // ── Reset the init flag when switching boards ──
  useEffect(() => {
    didInitMilestoneRef.current = false;
  }, [boardId]);

  // ── Selected milestone's feature ids (used to filter items) ──
  const selectedMilestoneFeatureIds = useMemo(() => {
    if (!selectedMilestoneId) return null;
    const milestone = milestones.find((m) => m.id === selectedMilestoneId);
    if (!milestone?.features) return new Set<string>();
    return new Set(milestone.features.map((f) => f.id));
  }, [milestones, selectedMilestoneId]);

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
    const map = new Map<
      string,
      { id: string; name: string; profileImage: string | null }
    >();
    for (const item of items) {
      const assignee = getItemAssignee(item);
      if (assignee && !map.has(assignee.id)) {
        map.set(assignee.id, {
          id: assignee.id,
          name: assignee.name,
          profileImage: assignee.profile_image ?? null,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [items]);

  // ── Reset member filter if the selected member no longer has any items ──
  useEffect(() => {
    if (
      selectedMemberId &&
      selectedMemberId !== "__none__" &&
      memberOptions.length > 0 &&
      !memberOptions.some((m) => m.id === selectedMemberId)
    ) {
      updateMemberFilter(null);
    }
  }, [memberOptions, selectedMemberId, updateMemberFilter]);

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

  // ── Toggle a feature group ──
  const toggleFeatureGroup = useCallback((key: string) => {
    setExpandedFeatureKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

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

  // ── Filter items by search query + milestone (via feature ids) + job role ──
  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedMilestoneFeatureIds) {
      result = result.filter(
        (item) =>
          item.feature && selectedMilestoneFeatureIds.has(item.feature.id),
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
    if (selectedMemberId) {
      result = result.filter((item) => {
        const id = getItemAssignee(item)?.id ?? "__none__";
        return id === selectedMemberId;
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) => item.title.toLowerCase().includes(q));
    }
    return result;
  }, [
    items,
    selectedMilestoneFeatureIds,
    searchQuery,
    selectedJobRoleId,
    selectedBlockId,
    selectedMemberId,
    memberJobRoleMap,
  ]);

  const noFeatureLabel = t("schedule.panel.noFeature", "피처 없음");
  const featureGroups = useMemo(
    () => groupItemsByFeature(filteredItems, noFeatureLabel),
    [filteredItems, noFeatureLabel],
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
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {t("schedule.panel.title", "Checklist")}
          </span>
        </button>
      </div>
    );
  }

  // ── Unified filter model (C: active chips + "+ 필터" menu) ──────────────────
  // Fixed display order. Milestone first: it is the only one shown by default.
  const filterOrder: FilterKey[] = ["milestone", "member", "block", "jobRole"];

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
        src={profileImage}
        alt=""
        className="rounded-full shrink-0 object-cover"
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

  return (
    <>
      {/* Panel container */}
      <div
        className="w-[280px] border-l border-foreground/[0.08] bg-bridge-obsidian
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
                  : t(
                      "schedule.panel.noUnscheduled",
                      "All items are scheduled",
                    )}
              </p>
            </div>
          )}

          {!isLoading && !error && filteredItems.length > 0 && (
            <>
              {featureGroups.map((group) => (
                <FeatureGroupSection
                  key={group.key}
                  group={group}
                  isOpen={expandedFeatureKeys.has(group.key)}
                  onToggle={() => toggleFeatureGroup(group.key)}
                >
                  {group.items.map((item) => {
                    const scheduled = !!(item.start_date || item.due_date);
                    return (
                      <ChecklistDragItem
                        key={item.id}
                        item={item}
                        assignee={null}
                        isDragging={
                          dragState?.item.id === item.id && dragState.isActive
                        }
                        isScheduled={scheduled}
                        isHighlighted={
                          !!highlightedTaskId &&
                          item.task?.id === highlightedTaskId
                        }
                        onMouseDown={handleItemMouseDown}
                        onDetailClick={onItemDetailClick}
                        onScheduledClick={() => onScheduledItemClick?.(item)}
                      />
                    );
                  })}
                </FeatureGroupSection>
              ))}
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
          {(dragState.item.feature || dragState.item.task) && (
            <span className="text-xs text-slate-500 truncate block pl-1 mt-0.5">
              {[dragState.item.feature?.title, dragState.item.task?.title]
                .filter(Boolean)
                .join(" > ")}
            </span>
          )}
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
