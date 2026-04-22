import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  Flag,
  Info,
  Lock,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getAssigneeHex, getInitials } from '../../utils/assigneeColor';
import { planningService } from '../../utils/services';
import type {
  PlanningCard,
  PlanningCardCreateRequest,
  PlanningCardMoveRequest,
  PlanningCardStatus,
  PlanningCardUpdateRequest,
  PlanningCellSummary,
  PlanningColumnTotal,
  PlanningListResponse,
  PlanningMilestoneInfo,
  PlanningRowTotal,
  PlanningSummaryResponse,
  PlanningWeekInfo,
} from '../../types';

// =============================================================================
// Layout constants
// =============================================================================

const MEMBER_COL_WIDTH = 200;
const WEEK_COL_WIDTH = 112;
const MILESTONE_BAR_HEIGHT = 40;
const WEEK_HEADER_HEIGHT = 48;
const ROW_MIN_HEIGHT = 92;
const CARD_HEIGHT = 32;
const LOAD_STRIP_HEIGHT = 20;
const FOOTER_HEIGHT = 40;
const DRAG_THRESHOLD = 3;
const MAX_VISIBLE_CARDS = 5;
const DEFAULT_WEEK_COUNT = 12;
const OVER_THRESHOLD = 1.1;
const UNDER_THRESHOLD = 0.5;

// =============================================================================
// Utility functions
// =============================================================================

/** Return the Monday (ISO week start) of the given date (local time). */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** ISO 8601 week number for a given Monday. */
function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Parse an ISO date (YYYY-MM-DD) into a local Date (midnight). */
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date as YYYY-MM-DD (local time). */
function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format a Date as MM-DD. */
function formatDateShort(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}-${d}`;
}

/** Add N days to a Date. */
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Diff in days between two Dates (b - a). */
function diffInDays(a: Date, b: Date): number {
  const msA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const msB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((msB - msA) / 86400000);
}

/**
 * Compute the list of week-start Dates (Mondays) to render.
 * If the summary provides weeks, use those. Otherwise fall back to milestone
 * min/max expanded to Monday boundaries. If no milestones, default to
 * `defaultWeeks` weeks starting from this week.
 */
function computeWeekRange(
  summaryWeeks: PlanningWeekInfo[],
  milestones: PlanningMilestoneInfo[],
  defaultWeeks = DEFAULT_WEEK_COUNT,
): Date[] {
  if (summaryWeeks && summaryWeeks.length > 0) {
    return summaryWeeks.map((w) => parseISODate(w.start_date));
  }

  const valid = milestones.filter((m) => m.start_date && m.end_date);
  if (valid.length === 0) {
    const thisMonday = getMondayOf(new Date());
    const weeks: Date[] = [];
    for (let i = 0; i < defaultWeeks; i++) {
      weeks.push(addDays(thisMonday, i * 7));
    }
    return weeks;
  }

  const starts = valid.map((m) => parseISODate(m.start_date!));
  const ends = valid.map((m) => parseISODate(m.end_date!));
  const minStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  const maxEnd = new Date(Math.max(...ends.map((d) => d.getTime())));
  const firstMonday = getMondayOf(minStart);
  const lastMonday = getMondayOf(maxEnd);
  const weeks: Date[] = [];
  let cur = firstMonday;
  while (cur.getTime() <= lastMonday.getTime()) {
    weeks.push(cur);
    cur = addDays(cur, 7);
  }
  return weeks;
}

/**
 * Determine the primary milestone for a given week start (Monday).
 * The primary is the milestone whose [start_date, end_date] range contains the
 * Monday of that week. Returns null for gap weeks.
 */
function primaryMilestoneFor(
  weekStart: Date,
  milestones: PlanningMilestoneInfo[],
): PlanningMilestoneInfo | null {
  const ts = weekStart.getTime();
  for (const m of milestones) {
    if (!m.start_date || !m.end_date) continue;
    const s = parseISODate(m.start_date).getTime();
    const e = parseISODate(m.end_date).getTime();
    if (ts >= s && ts <= e) return m;
  }
  return null;
}

/**
 * Compute a 10% threshold based cell status given actual load and capacity.
 * Mirrors UtilizationStatus.determine on the backend.
 */
function computeCellStatus(
  actual: number,
  capacity: number | null | undefined,
): PlanningCardStatus {
  if (capacity == null) return 'UNKNOWN';
  if (capacity <= 0) return actual > 0 ? 'OVER' : 'UNKNOWN';
  if (actual > capacity * OVER_THRESHOLD) return 'OVER';
  if (actual < capacity * UNDER_THRESHOLD) return 'UNDER';
  return 'NORMAL';
}

/** Status → color tokens (kept co-located to keep the module self-contained). */
function statusTextClass(status: PlanningCardStatus): string {
  switch (status) {
    case 'OVER':
      return 'text-rose-500 dark:text-rose-400';
    case 'NORMAL':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'UNDER':
      return 'text-slate-400';
    default:
      return 'text-slate-500';
  }
}

function statusBarClass(status: PlanningCardStatus): string {
  switch (status) {
    case 'OVER':
      return 'bg-rose-500';
    case 'NORMAL':
      return 'bg-emerald-500';
    case 'UNDER':
      return 'bg-slate-500/50';
    default:
      return 'bg-foreground/10';
  }
}

function statusCellRingClass(status: PlanningCardStatus): string {
  switch (status) {
    case 'OVER':
      return 'ring-1 ring-rose-500/40 ring-inset';
    case 'UNKNOWN':
      return 'border-dashed';
    default:
      return '';
  }
}

// =============================================================================
// Local types
// =============================================================================

type MemberLite = {
  id: string;
  name: string;
  profile_image: string | null;
  color?: string | null;
};

interface PoolDragState {
  card: PlanningCard;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isActive: boolean;
}

interface DropTargetHint {
  type: 'cell' | 'pool';
  memberId?: string;
  weekStart?: string;
}

interface SchedulePlanningViewProps {
  boardId: string;
  currentUser: { id: string; name: string };
  /** True when user has Member+ role. */
  canEdit: boolean;
  memberColorMap?: Record<string, string>;
  onMilestoneClick?: (milestoneId: string) => void;
  language?: string;
  /** External signal to refetch (incremented by WebSocket handlers upstream). */
  refreshTrigger?: number;
  /** Exposed so the parent can force a refresh on demand. */
  onRefresh?: () => void;
}

// =============================================================================
// Main component
// =============================================================================

export function SchedulePlanningView({
  boardId,
  currentUser,
  canEdit,
  memberColorMap,
  onMilestoneClick,
  refreshTrigger,
  onRefresh,
}: SchedulePlanningViewProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ─── Data state ───
  const [data, setData] = useState<PlanningListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Pool filter / search ───
  const [poolFilter, setPoolFilter] = useState<'all' | 'unplaced' | 'placed'>('unplaced');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Quick add form (persistent hours/assignee) ───
  const [quickTitle, setQuickTitle] = useState('');
  const [quickHours, setQuickHours] = useState<number | null>(4);
  const [quickAssigneeId, setQuickAssigneeId] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<{
    memberId: string;
    weekStart: string;
  } | null>(null);

  // ─── Drag state ───
  const [dragState, setDragState] = useState<PoolDragState | null>(null);
  const dragStateRef = useRef<PoolDragState | null>(null);
  const [dropHint, setDropHint] = useState<DropTargetHint | null>(null);
  const dropHintRef = useRef<DropTargetHint | null>(null);

  // ─── Mobile segment (md-) ───
  const [mobileSegment, setMobileSegment] = useState<'grid' | 'pool'>('grid');

  // ─── Legend popover ───
  const [legendOpen, setLegendOpen] = useState(false);

  // ─── Fetch ───
  const fetchData = useCallback(
    async (silent = false) => {
      if (!boardId) return;
      try {
        if (!silent) setLoading(true);
        const resp = await planningService.list(boardId);
        setData(resp);
        setError(null);
      } catch (err) {
        console.warn('Failed to fetch planning data', err);
        setError(t('common.error', 'An error occurred'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [boardId, t],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchData(true);
    }
  }, [refreshTrigger, fetchData]);

  // ─── ESC cancels drag ───
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragStateRef.current) {
        dragStateRef.current = null;
        dropHintRef.current = null;
        setDragState(null);
        setDropHint(null);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // ─── window blur safety net ───
  useEffect(() => {
    const handleBlur = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      dropHintRef.current = null;
      setDragState(null);
      setDropHint(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  // ─── Derived data ───
  const summary: PlanningSummaryResponse | null = data?.summary ?? null;
  const cards: PlanningCard[] = data?.cards ?? [];

  const members: MemberLite[] = useMemo(() => {
    return (summary?.members ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      profile_image: m.profile_image,
      color: memberColorMap?.[m.name] ?? null,
    }));
  }, [summary, memberColorMap]);

  const milestones: PlanningMilestoneInfo[] = summary?.milestones ?? [];

  const weeks: Date[] = useMemo(
    () => computeWeekRange(summary?.weeks ?? [], milestones),
    [summary, milestones],
  );

  const weekKeys = useMemo(() => weeks.map(formatISODate), [weeks]);

  const thisMondayKey = useMemo(() => formatISODate(getMondayOf(new Date())), []);
  const todayWeekIndex = useMemo(
    () => weekKeys.indexOf(thisMondayKey),
    [weekKeys, thisMondayKey],
  );

  /**
   * (memberId, weekStart) → card[]
   * Cards without a week or assignee are excluded (they belong to the pool).
   */
  const cardsByCell = useMemo(() => {
    const map = new Map<string, PlanningCard[]>();
    for (const c of cards) {
      if (!c.week_start_date || !c.assignee) continue;
      const key = `${c.assignee.id}|${c.week_start_date}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [cards]);

  /** (memberId, weekStart) → cell summary */
  const cellSummaryMap = useMemo(() => {
    const map = new Map<string, PlanningCellSummary>();
    for (const c of summary?.cells ?? []) {
      map.set(`${c.assignee_id}|${c.week_start_date}`, c);
    }
    return map;
  }, [summary]);

  const rowTotalMap = useMemo(() => {
    const map = new Map<string, PlanningRowTotal>();
    for (const r of summary?.row_totals ?? []) {
      map.set(r.assignee_id, r);
    }
    return map;
  }, [summary]);

  const columnTotalMap = useMemo(() => {
    const map = new Map<string, PlanningColumnTotal>();
    for (const c of summary?.column_totals ?? []) {
      map.set(c.week_start_date, c);
    }
    return map;
  }, [summary]);

  /** Pool cards (filter + search). */
  const poolCards = useMemo(() => {
    let result = cards;
    if (poolFilter === 'unplaced') {
      result = result.filter((c) => c.week_start_date == null);
    } else if (poolFilter === 'placed') {
      result = result.filter((c) => c.week_start_date != null);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q));
    }
    result = [...result].sort((a, b) => a.position - b.position);
    return result;
  }, [cards, poolFilter, searchQuery]);

  // ─── Today scroll ───
  const scrollToToday = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || todayWeekIndex < 0) return;
    const left =
      MEMBER_COL_WIDTH +
      todayWeekIndex * WEEK_COL_WIDTH -
      container.clientWidth / 2 +
      WEEK_COL_WIDTH / 2;
    container.scrollTo({
      left: Math.max(0, left),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [todayWeekIndex, reducedMotion]);

  useEffect(() => {
    if (!loading && todayWeekIndex >= 0) {
      scrollToToday();
    }
    // Initial scroll only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ─── Drag: start ───
  const startCardDrag = useCallback(
    (e: React.MouseEvent, card: PlanningCard) => {
      if (!canEdit) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const initial: PoolDragState = {
        card,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        isActive: false,
      };
      dragStateRef.current = initial;
      document.body.style.userSelect = 'none';

      const handleMove = (ev: MouseEvent) => {
        const cur = dragStateRef.current;
        if (!cur) return;
        const dx = ev.clientX - cur.startX;
        const dy = ev.clientY - cur.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isActive = dist >= DRAG_THRESHOLD;

        const updated: PoolDragState = {
          ...cur,
          currentX: ev.clientX,
          currentY: ev.clientY,
          isActive,
        };
        dragStateRef.current = updated;
        setDragState({ ...updated });

        if (isActive) {
          document.body.style.cursor = 'grabbing';
          // Probe drop target
          const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
          const targetEl = el?.closest('[data-drop-target]') as HTMLElement | null;
          if (targetEl) {
            const type = targetEl.getAttribute('data-drop-target');
            if (type === 'planning-cell' || type === 'cell') {
              const memberId = targetEl.getAttribute('data-member-id') || undefined;
              const weekStart = targetEl.getAttribute('data-week-start') || undefined;
              if (memberId && weekStart) {
                const hint: DropTargetHint = { type: 'cell', memberId, weekStart };
                dropHintRef.current = hint;
                setDropHint(hint);
                return;
              }
            }
            if (type === 'pool') {
              const hint: DropTargetHint = { type: 'pool' };
              dropHintRef.current = hint;
              setDropHint(hint);
              return;
            }
          }
          dropHintRef.current = null;
          setDropHint(null);
        }
      };

      const handleUp = async () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        const final = dragStateRef.current;
        const hint = dropHintRef.current;
        dragStateRef.current = null;
        dropHintRef.current = null;
        setDragState(null);
        setDropHint(null);

        if (!final?.isActive) return;
        if (!hint) return;

        // Compute move request
        let moveReq: PlanningCardMoveRequest;
        if (hint.type === 'pool') {
          moveReq = { week_start_date: null, assignee_id: null, position: 0 };
        } else {
          moveReq = {
            week_start_date: hint.weekStart!,
            assignee_id: hint.memberId!,
            position:
              (cardsByCell.get(`${hint.memberId}|${hint.weekStart}`)?.length ?? 0),
          };
        }

        // Short-circuit no-op
        const curWeek = final.card.week_start_date;
        const curAssignee = final.card.assignee?.id ?? null;
        if (
          (moveReq.week_start_date ?? null) === (curWeek ?? null) &&
          (moveReq.assignee_id ?? null) === (curAssignee ?? null)
        ) {
          return;
        }

        // Optimistic update
        const prevData = data;
        setData((cur) => {
          if (!cur) return cur;
          const nextCards = cur.cards.map((c) => {
            if (c.id !== final.card.id) return c;
            const nextAssignee = moveReq.assignee_id
              ? members.find((m) => m.id === moveReq.assignee_id)
                ? {
                    id: moveReq.assignee_id!,
                    name:
                      members.find((m) => m.id === moveReq.assignee_id)?.name ?? '',
                    profile_image:
                      members.find((m) => m.id === moveReq.assignee_id)
                        ?.profile_image ?? null,
                  }
                : c.assignee
              : null;
            return {
              ...c,
              week_start_date: moveReq.week_start_date,
              assignee: nextAssignee,
              position: moveReq.position,
            };
          });
          return { ...cur, cards: nextCards };
        });

        try {
          await planningService.move(boardId, final.card.id, moveReq);
          // Silent refresh to capture recomputed summary/primary_milestone_id
          await fetchData(true);
          onRefresh?.();
        } catch (err) {
          console.warn('Failed to move planning card', err);
          // Rollback
          setData(prevData);
          toast.error(t('schedule.planning.error.placeFailed', 'Failed to place card'));
        }
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [boardId, canEdit, cardsByCell, data, fetchData, members, onRefresh, t],
  );

  // ─── Quick add ───
  const handleQuickAdd = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!canEdit) return;
      const title = quickTitle.trim();
      if (!title) return;

      const placement = pendingPlacement;
      const req: PlanningCardCreateRequest = {
        title,
        estimated_hours: quickHours,
        assignee_id: placement?.memberId ?? quickAssigneeId ?? null,
        week_start_date: placement?.weekStart ?? null,
      };

      try {
        await planningService.create(boardId, req);
        setQuickTitle('');
        setPendingPlacement(null);
        await fetchData(true);
        onRefresh?.();
      } catch (err) {
        console.warn('Failed to create planning card', err);
        toast.error(t('schedule.planning.error.placeFailed', 'Failed to create card'));
      }
    },
    [
      boardId,
      canEdit,
      fetchData,
      onRefresh,
      pendingPlacement,
      quickAssigneeId,
      quickHours,
      quickTitle,
      t,
    ],
  );

  // ─── Delete ───
  const handleDelete = useCallback(
    async (card: PlanningCard) => {
      if (!canEdit) return;
      const prev = data;
      setData((cur) =>
        cur ? { ...cur, cards: cur.cards.filter((c) => c.id !== card.id) } : cur,
      );
      try {
        await planningService.remove(boardId, card.id);
        await fetchData(true);
        onRefresh?.();
      } catch (err) {
        console.warn('Failed to delete planning card', err);
        setData(prev);
        toast.error(t('schedule.planning.error.placeFailed', 'Failed to delete card'));
      }
    },
    [boardId, canEdit, data, fetchData, onRefresh, t],
  );

  // ─── Update (inline rename / hours) ───
  const handleUpdate = useCallback(
    async (card: PlanningCard, patch: PlanningCardUpdateRequest) => {
      if (!canEdit) return;
      try {
        await planningService.update(boardId, card.id, patch);
        await fetchData(true);
        onRefresh?.();
      } catch (err) {
        console.warn('Failed to update planning card', err);
        toast.error(t('schedule.planning.error.placeFailed', 'Failed to update card'));
      }
    },
    [boardId, canEdit, fetchData, onRefresh, t],
  );

  // ─── Empty-cell click: focus pool input and set pending placement ───
  const handleEmptyCellClick = useCallback(
    (memberId: string, weekStart: string) => {
      if (!canEdit) return;
      setPendingPlacement({ memberId, weekStart });
      const el = document.getElementById('planning-quickadd-title');
      if (el instanceof HTMLInputElement) el.focus();
    },
    [canEdit],
  );

  // ─── Milestone bar positions ───
  const milestoneBars = useMemo(() => {
    if (weeks.length === 0) return [] as Array<{
      milestone: PlanningMilestoneInfo;
      left: number;
      width: number;
    }>;
    const firstWeek = weeks[0];
    const lastWeek = weeks[weeks.length - 1];
    const firstWeekStart = firstWeek;
    const lastWeekEnd = addDays(lastWeek, 6);

    return milestones
      .filter((m) => m.start_date && m.end_date)
      .map((m) => {
        const ms = parseISODate(m.start_date!);
        const me = parseISODate(m.end_date!);
        const clampedStart = ms.getTime() < firstWeekStart.getTime() ? firstWeekStart : ms;
        const clampedEnd = me.getTime() > lastWeekEnd.getTime() ? lastWeekEnd : me;

        const startWeekIdx = Math.floor(
          Math.max(0, diffInDays(firstWeekStart, clampedStart)) / 7,
        );
        const endWeekIdx = Math.floor(
          Math.max(0, diffInDays(firstWeekStart, clampedEnd)) / 7,
        );
        const left = MEMBER_COL_WIDTH + startWeekIdx * WEEK_COL_WIDTH + 3;
        const width = Math.max(
          20,
          (endWeekIdx - startWeekIdx + 1) * WEEK_COL_WIDTH - 6,
        );
        return { milestone: m, left, width };
      });
  }, [milestones, weeks]);

  // =============================================================================
  // Render
  // =============================================================================

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bridge-dark">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" aria-label={t('common.loading', 'Loading...')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bridge-dark">
        <div className="text-center">
          <p className="text-xs text-rose-400">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-3 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90"
          >
            {t('common.retry', 'Retry')}
          </button>
        </div>
      </div>
    );
  }

  const totalWidth = MEMBER_COL_WIDTH + weeks.length * WEEK_COL_WIDTH;
  const showMobilePool = mobileSegment === 'pool';
  const showMobileGrid = mobileSegment === 'grid';

  const noMilestones = milestones.length === 0;
  const noMembers = members.length === 0;
  const noAllocations =
    !noMembers &&
    !noMilestones &&
    (summary?.cells ?? []).every((c) => c.capacity_hours == null);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden bg-bridge-dark relative"
      role="region"
      aria-label={t('schedule.planning.title', 'Planning')}
    >
      {/* ─── Toolbar ─── */}
      <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-foreground/[0.08] bg-bridge-obsidian">
        <Flag size={14} className="text-bridge-accent shrink-0" aria-hidden="true" />
        <span className="text-xs md:text-sm font-bold text-foreground tracking-tight">
          {t('schedule.planning.title', 'Planning')}
        </span>
        <span className="text-xs text-slate-500 hidden md:inline">
          {members.length} · {weeks.length}w · {milestones.length}
        </span>
        {!canEdit && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400">
            <Lock size={10} aria-hidden="true" />
            {t('common.readonly', 'Read-only')}
          </span>
        )}
        <div className="flex-1" />

        {/* Mobile segment */}
        <div className="md:hidden flex items-center rounded-lg bg-foreground/[0.03] border border-foreground/10 p-0.5">
          <button
            onClick={() => setMobileSegment('grid')}
            className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
              showMobileGrid
                ? 'bg-bridge-accent text-white'
                : 'text-slate-400 hover:text-foreground'
            }`}
          >
            {t('schedule.planning.mobile.segmentGrid', 'Grid')}
          </button>
          <button
            onClick={() => setMobileSegment('pool')}
            className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
              showMobilePool
                ? 'bg-bridge-accent text-white'
                : 'text-slate-400 hover:text-foreground'
            }`}
          >
            {t('schedule.planning.mobile.segmentPool', 'Pool')}
          </button>
        </div>

        <button
          onClick={scrollToToday}
          disabled={todayWeekIndex < 0}
          className="px-2.5 py-1 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('schedule.planning.toolbar.today', 'Today')}
        </button>
        <div className="relative">
          <IconButton
            aria-label={t('schedule.planning.toolbar.legend', 'Legend')}
            onClick={() => setLegendOpen((v) => !v)}
            size="sm"
          >
            <Info size={16} aria-hidden="true" />
          </IconButton>
          {legendOpen && <LegendPopover onClose={() => setLegendOpen(false)} />}
        </div>
      </div>

      {/* ─── Info banners ─── */}
      {noMilestones && (
        <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-foreground/[0.08] bg-bridge-accent/5">
          <Info size={12} className="text-bridge-accent shrink-0" aria-hidden="true" />
          <span className="text-xs text-foreground">
            {t(
              'schedule.planning.empty.noMilestones.description',
              'Create a milestone to enable capacity visualization',
            )}
          </span>
        </div>
      )}
      {noMembers && (
        <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-foreground/[0.08] bg-bridge-accent/5">
          <Users size={12} className="text-bridge-accent shrink-0" aria-hidden="true" />
          <span className="text-xs text-foreground">
            {t(
              'schedule.planning.empty.noMembers.description',
              'Invite members to enable resource simulation',
            )}
          </span>
        </div>
      )}
      {noAllocations && (
        <div className="flex items-center gap-2 px-3 md:px-4 py-2 border-b border-foreground/[0.08] bg-amber-500/10">
          <AlertTriangle size={12} className="text-amber-500 shrink-0" aria-hidden="true" />
          <span className="text-xs text-foreground">
            {t(
              'schedule.planning.warn.noAllocations',
              'No milestone allocations. Configure allocations first.',
            )}
          </span>
        </div>
      )}

      {/* ─── Main grid ─── */}
      <div
        className={`flex-1 flex flex-col overflow-hidden ${showMobileGrid ? '' : 'hidden md:flex'}`}
      >
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto custom-scrollbar"
          role="grid"
          aria-rowcount={members.length + 1}
          aria-colcount={weeks.length + 1}
        >
          <div style={{ width: totalWidth }}>
            {/* Milestone timeline lane (sticky top-0) */}
            <MilestoneTimelineLane
              milestoneBars={milestoneBars}
              weeks={weeks}
              onMilestoneClick={onMilestoneClick}
              memberColWidth={MEMBER_COL_WIDTH}
              reducedMotion={reducedMotion}
            />

            {/* Week header lane (sticky top-10) */}
            <WeekHeaderLane
              weeks={weeks}
              milestones={milestones}
              todayWeekIndex={todayWeekIndex}
              memberColWidth={MEMBER_COL_WIDTH}
            />

            {/* Member rows */}
            {members.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-xs text-slate-500">
                  {t(
                    'schedule.planning.empty.noMembers.title',
                    'No members yet',
                  )}
                </p>
              </div>
            ) : (
              members.map((member, rowIdx) => {
                const rowTotal = rowTotalMap.get(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex border-b border-foreground/[0.08]"
                    style={{ minHeight: ROW_MIN_HEIGHT }}
                    role="row"
                  >
                    <MemberLabelColumn
                      member={member}
                      rowTotal={rowTotal}
                      reducedMotion={reducedMotion}
                      index={rowIdx}
                    />
                    {weeks.map((weekStart, colIdx) => {
                      const weekKey = weekKeys[colIdx];
                      const cellKey = `${member.id}|${weekKey}`;
                      const cellCards = cardsByCell.get(cellKey) ?? [];
                      const cellSummary = cellSummaryMap.get(cellKey);
                      const status: PlanningCardStatus =
                        cellSummary?.status ??
                        computeCellStatus(
                          cellCards.reduce(
                            (acc, c) => acc + (c.estimated_hours ?? 0),
                            0,
                          ),
                          null,
                        );
                      const isTodayCol = colIdx === todayWeekIndex;
                      const isDropTarget =
                        dropHint?.type === 'cell' &&
                        dropHint.memberId === member.id &&
                        dropHint.weekStart === weekKey;
                      const draggedCard = dragState?.card;
                      const overPreview =
                        isDropTarget && draggedCard
                          ? computeCellStatus(
                              cellCards.reduce(
                                (acc, c) =>
                                  c.id === draggedCard.id
                                    ? acc
                                    : acc + (c.estimated_hours ?? 0),
                                0,
                              ) + (draggedCard.estimated_hours ?? 0),
                              cellSummary?.capacity_hours ?? null,
                            )
                          : null;

                      return (
                        <PlanningCell
                          key={weekKey}
                          memberId={member.id}
                          weekStart={weekKey}
                          cards={cellCards}
                          summary={cellSummary}
                          status={status}
                          isTodayCol={isTodayCol}
                          isDropTarget={isDropTarget}
                          overPreview={overPreview}
                          canEdit={canEdit}
                          onEmptyClick={() => handleEmptyCellClick(member.id, weekKey)}
                          onCardMouseDown={startCardDrag}
                          onCardDelete={handleDelete}
                          draggingId={dragState?.isActive ? dragState.card.id : null}
                        />
                      );
                    })}
                  </div>
                );
              })
            )}

            {/* Footer Σ column totals (sticky bottom) */}
            {members.length > 0 && (
              <div
                className="flex sticky bottom-0 z-20 bg-bridge-obsidian border-t border-foreground/[0.08]"
                style={{ height: FOOTER_HEIGHT }}
                role="row"
              >
                <div
                  className="shrink-0 sticky left-0 z-30 bg-bridge-obsidian border-r border-foreground/[0.08] flex items-center gap-2 px-4"
                  style={{ width: MEMBER_COL_WIDTH, height: FOOTER_HEIGHT }}
                  role="rowheader"
                >
                  <span className="text-xs font-bold text-slate-400 tracking-widest uppercase">
                    Σ
                  </span>
                </div>
                {weeks.map((_, colIdx) => {
                  const key = weekKeys[colIdx];
                  const total = columnTotalMap.get(key);
                  const status: PlanningCardStatus = total?.status ?? 'UNKNOWN';
                  return (
                    <div
                      key={key}
                      className="shrink-0 flex items-center justify-center gap-1 border-r border-foreground/[0.04]"
                      style={{ width: WEEK_COL_WIDTH, height: FOOTER_HEIGHT }}
                      role="gridcell"
                    >
                      <span
                        className={`text-xs font-bold tabular-nums ${statusTextClass(status)}`}
                      >
                        {formatLoadNumbers(
                          total?.load_hours ?? 0,
                          total?.capacity_hours ?? null,
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── Pool (desktop + mobile pool) ─── */}
        <div
          className={`${showMobilePool ? 'flex' : 'hidden'} md:flex flex-col border-t border-foreground/[0.08] bg-bridge-obsidian`}
        >
          <PlanningPool
            poolCards={poolCards}
            members={members}
            canEdit={canEdit}
            poolFilter={poolFilter}
            setPoolFilter={setPoolFilter}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            quickTitle={quickTitle}
            setQuickTitle={setQuickTitle}
            quickHours={quickHours}
            setQuickHours={setQuickHours}
            quickAssigneeId={quickAssigneeId}
            setQuickAssigneeId={setQuickAssigneeId}
            pendingPlacement={pendingPlacement}
            setPendingPlacement={setPendingPlacement}
            onQuickAdd={handleQuickAdd}
            onCardMouseDown={startCardDrag}
            onCardDelete={handleDelete}
            onCardUpdate={handleUpdate}
            draggingId={dragState?.isActive ? dragState.card.id : null}
            dropHint={dropHint}
            currentUser={currentUser}
            reducedMotion={reducedMotion}
          />
        </div>
      </div>

      {/* ─── Pool only on mobile when segment=pool ─── */}
      {showMobilePool && (
        <div className="md:hidden flex-1 flex flex-col bg-bridge-obsidian">
          <PlanningPool
            poolCards={poolCards}
            members={members}
            canEdit={canEdit}
            poolFilter={poolFilter}
            setPoolFilter={setPoolFilter}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            quickTitle={quickTitle}
            setQuickTitle={setQuickTitle}
            quickHours={quickHours}
            setQuickHours={setQuickHours}
            quickAssigneeId={quickAssigneeId}
            setQuickAssigneeId={setQuickAssigneeId}
            pendingPlacement={pendingPlacement}
            setPendingPlacement={setPendingPlacement}
            onQuickAdd={handleQuickAdd}
            onCardMouseDown={startCardDrag}
            onCardDelete={handleDelete}
            onCardUpdate={handleUpdate}
            draggingId={dragState?.isActive ? dragState.card.id : null}
            dropHint={dropHint}
            currentUser={currentUser}
            reducedMotion={reducedMotion}
          />
        </div>
      )}

      {/* Drag ghost */}
      {dragState?.isActive && <DragGhost dragState={dragState} />}
    </div>
  );
}

SchedulePlanningView.displayName = 'SchedulePlanningView';

// =============================================================================
// Sub-components
// =============================================================================

interface MilestoneTimelineLaneProps {
  milestoneBars: Array<{
    milestone: PlanningMilestoneInfo;
    left: number;
    width: number;
  }>;
  weeks: Date[];
  memberColWidth: number;
  onMilestoneClick?: (id: string) => void;
  reducedMotion: boolean;
}

function MilestoneTimelineLane({
  milestoneBars,
  weeks,
  memberColWidth,
  onMilestoneClick,
  reducedMotion,
}: MilestoneTimelineLaneProps) {
  const { t } = useTranslation();
  return (
    <div
      className="flex sticky top-0 z-30 bg-bridge-obsidian border-b border-foreground/[0.08]"
      style={{ height: MILESTONE_BAR_HEIGHT }}
    >
      <div
        className="shrink-0 sticky left-0 z-40 bg-bridge-obsidian border-r border-foreground/[0.08] flex items-center gap-2 px-4"
        style={{ width: memberColWidth, height: MILESTONE_BAR_HEIGHT }}
      >
        <Flag size={12} className="text-bridge-accent shrink-0" aria-hidden="true" />
        <span className="text-xs font-bold text-foreground truncate">
          {t('schedule.planning.header.milestone', 'Milestone')}
        </span>
      </div>
      <div
        className="relative"
        style={{
          width: weeks.length * WEEK_COL_WIDTH,
          height: MILESTONE_BAR_HEIGHT,
        }}
      >
        {milestoneBars.map(({ milestone, left, width }) => (
          <button
            key={milestone.id}
            onClick={() => onMilestoneClick?.(milestone.id)}
            className={`absolute top-2 h-6 rounded-md px-2.5 flex items-center gap-1.5
              bg-bridge-accent/80 hover:bg-bridge-accent transition-all
              ${reducedMotion ? '' : 'hover:shadow-[0_0_18px_rgba(99,102,241,0.35)]'}`}
            style={{ left: left - memberColWidth, width }}
            title={`${milestone.title} (${milestone.start_date} ~ ${milestone.end_date})`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/90 shrink-0" />
            <span className="text-xs font-bold text-white truncate">
              {milestone.title}
            </span>
            {milestone.progress_percentage > 0 && (
              <span className="ml-auto text-xs font-bold text-white/70 tabular-nums shrink-0">
                {milestone.progress_percentage}%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface WeekHeaderLaneProps {
  weeks: Date[];
  milestones: PlanningMilestoneInfo[];
  todayWeekIndex: number;
  memberColWidth: number;
}

function WeekHeaderLane({
  weeks,
  milestones,
  todayWeekIndex,
  memberColWidth,
}: WeekHeaderLaneProps) {
  const { t } = useTranslation();
  return (
    <div
      className="flex sticky z-30 bg-bridge-obsidian border-b border-foreground/[0.08]"
      style={{ top: MILESTONE_BAR_HEIGHT, height: WEEK_HEADER_HEIGHT }}
    >
      <div
        className="shrink-0 sticky left-0 z-40 bg-bridge-obsidian border-r border-foreground/[0.08] flex items-center px-4"
        style={{ width: memberColWidth, height: WEEK_HEADER_HEIGHT }}
        role="columnheader"
      >
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('schedule.planning.col.member', 'Member')}
        </span>
      </div>
      {weeks.map((weekStart, idx) => {
        const iso = getIsoWeek(weekStart);
        const hasMilestone = primaryMilestoneFor(weekStart, milestones) != null;
        const isTodayCol = idx === todayWeekIndex;
        return (
          <div
            key={formatISODate(weekStart)}
            role="columnheader"
            className={`shrink-0 flex flex-col items-center justify-center border-r border-foreground/[0.08] text-xs tabular-nums
              ${isTodayCol ? 'bg-bridge-accent/10' : ''}
              ${!hasMilestone && !isTodayCol ? 'bg-foreground/[0.02]' : ''}`}
            style={{ width: WEEK_COL_WIDTH, height: WEEK_HEADER_HEIGHT }}
          >
            <span
              className={`font-bold ${isTodayCol ? 'text-bridge-accent' : 'text-foreground'}`}
            >
              {t('schedule.planning.header.week', 'W{{num}}', { num: iso })}
            </span>
            <span
              className={`${isTodayCol ? 'text-bridge-accent/80' : 'text-slate-500'}`}
            >
              {formatDateShort(weekStart)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface MemberLabelColumnProps {
  member: MemberLite;
  rowTotal?: PlanningRowTotal;
  reducedMotion: boolean;
  index: number;
}

function MemberLabelColumn({
  member,
  rowTotal,
  reducedMotion,
  index,
}: MemberLabelColumnProps) {
  const status: PlanningCardStatus = rowTotal?.status ?? 'UNKNOWN';
  return (
    <motion.div
      initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : index * 0.04 }}
      className="shrink-0 sticky left-0 z-20 bg-bridge-obsidian border-r border-foreground/[0.08] flex items-start gap-2 px-3 pt-3 pb-2"
      style={{ width: MEMBER_COL_WIDTH }}
      role="rowheader"
    >
      {member.profile_image ? (
        <img
          src={member.profile_image}
          alt={member.name}
          className="w-7 h-7 rounded-full shrink-0 object-cover mt-0.5"
        />
      ) : (
        <div
          className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
          style={{ backgroundColor: getAssigneeHex(member.name, member.color) }}
        >
          {getInitials(member.name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground truncate">{member.name}</p>
        {rowTotal && (
          <p className={`text-xs font-bold tabular-nums ${statusTextClass(status)}`}>
            {formatLoadNumbers(rowTotal.load_hours, rowTotal.capacity_hours)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

interface PlanningCellProps {
  memberId: string;
  weekStart: string;
  cards: PlanningCard[];
  summary?: PlanningCellSummary;
  status: PlanningCardStatus;
  isTodayCol: boolean;
  isDropTarget: boolean;
  overPreview: PlanningCardStatus | null;
  canEdit: boolean;
  draggingId: string | null;
  onEmptyClick: () => void;
  onCardMouseDown: (e: React.MouseEvent, card: PlanningCard) => void;
  onCardDelete: (card: PlanningCard) => void;
}

function PlanningCell({
  memberId,
  weekStart,
  cards,
  summary,
  status,
  isTodayCol,
  isDropTarget,
  overPreview,
  canEdit,
  draggingId,
  onEmptyClick,
  onCardMouseDown,
  onCardDelete,
}: PlanningCellProps) {
  const { t } = useTranslation();
  const visible = cards.slice(0, MAX_VISIBLE_CARDS);
  const hiddenCount = cards.length - visible.length;
  const dropRingClass =
    isDropTarget && overPreview === 'OVER'
      ? 'ring-2 ring-rose-500/50 ring-inset bg-rose-500/5'
      : isDropTarget
        ? 'ring-2 ring-bridge-accent/30 ring-inset bg-bridge-accent/10'
        : '';

  const cellClasses: string[] = [
    'shrink-0 flex flex-col gap-1 p-1.5 border-r border-foreground/[0.04] relative',
    statusCellRingClass(status),
    dropRingClass,
  ];
  if (status === 'UNKNOWN') {
    cellClasses.push('border-r-dashed border-foreground/10');
  }
  if (isTodayCol && !isDropTarget) {
    cellClasses.push('bg-bridge-accent/5');
  }

  const isEmpty = cards.length === 0;
  return (
    <div
      className={cellClasses.join(' ')}
      style={{ width: WEEK_COL_WIDTH, minHeight: ROW_MIN_HEIGHT }}
      data-drop-target="planning-cell"
      data-member-id={memberId}
      data-week-start={weekStart}
      role="gridcell"
      onClick={isEmpty ? onEmptyClick : undefined}
    >
      {/* Load strip */}
      <CellLoadStrip summary={summary} status={status} />

      {/* Cards */}
      {visible.map((card) => (
        <PlanningCardView
          key={card.id}
          card={card}
          canEdit={canEdit}
          isDragging={draggingId === card.id}
          onMouseDown={onCardMouseDown}
          onDelete={onCardDelete}
        />
      ))}

      {hiddenCount > 0 && (
        <span className="text-xs text-slate-500 px-1">
          {t('schedule.planning.cell.expandMore', '+{{count}} more', {
            count: hiddenCount,
          })}
        </span>
      )}

      {/* Empty hint */}
      {isEmpty && canEdit && (
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
          aria-hidden="true"
        >
          <span className="text-xs text-slate-500 font-bold">
            {t('schedule.planning.cell.placeHint', '+ Drop')}
          </span>
        </div>
      )}
    </div>
  );
}

interface CellLoadStripProps {
  summary?: PlanningCellSummary;
  status: PlanningCardStatus;
}

function CellLoadStrip({ summary, status }: CellLoadStripProps) {
  const actual = summary?.load_hours ?? 0;
  const capacity = summary?.capacity_hours ?? null;
  const ratio =
    capacity && capacity > 0 ? Math.max(0, actual / capacity) : 0;
  return (
    <div
      className="flex items-center gap-1 px-1.5 rounded bg-foreground/[0.04]"
      style={{ height: LOAD_STRIP_HEIGHT }}
      title={
        capacity != null
          ? `${actual}h / ${capacity}h`
          : `${actual}h / —`
      }
    >
      <span
        className={`text-xs font-bold tabular-nums leading-none ${statusTextClass(status)}`}
      >
        {formatLoadNumbers(actual, capacity)}
      </span>
      <div className="flex-1 h-1 bg-foreground/[0.08] rounded-full overflow-hidden">
        <div
          className={`h-full ${statusBarClass(status)}`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      {status === 'OVER' && (
        <AlertTriangle size={10} className="text-rose-500 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}

interface PlanningCardViewProps {
  card: PlanningCard;
  canEdit: boolean;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent, card: PlanningCard) => void;
  onDelete: (card: PlanningCard) => void;
}

function PlanningCardView({
  card,
  canEdit,
  isDragging,
  onMouseDown,
  onDelete,
}: PlanningCardViewProps) {
  const { t } = useTranslation();
  const [showActions, setShowActions] = useState(false);
  const hex = card.color || (card.assignee
    ? getAssigneeHex(card.assignee.name, null)
    : '#64748b');
  const style: CSSProperties = {
    height: CARD_HEIGHT,
    borderLeft: `3px solid ${hex}`,
  };
  return (
    <div
      role="button"
      aria-label={card.title}
      tabIndex={canEdit ? 0 : -1}
      onMouseDown={(e) => canEdit && onMouseDown(e, card)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={`group flex items-center gap-1.5 px-1.5 rounded-md bg-foreground/[0.03] border border-foreground/10 hover:border-foreground/20 transition-colors select-none cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={style}
    >
      <span className="flex-1 text-xs font-medium text-foreground truncate">
        {card.title}
      </span>
      {card.estimated_hours != null && (
        <span className="text-xs font-bold text-slate-400 tabular-nums shrink-0">
          {card.estimated_hours}h
        </span>
      )}
      {canEdit && showActions && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(card);
          }}
          aria-label={t('schedule.planning.card.delete', 'Delete')}
          className="shrink-0 p-0.5 rounded text-slate-500 hover:text-rose-400 hover:bg-foreground/5 transition-colors"
        >
          <Trash2 size={10} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

interface PlanningPoolProps {
  poolCards: PlanningCard[];
  members: MemberLite[];
  canEdit: boolean;
  poolFilter: 'all' | 'unplaced' | 'placed';
  setPoolFilter: (v: 'all' | 'unplaced' | 'placed') => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  quickTitle: string;
  setQuickTitle: (v: string) => void;
  quickHours: number | null;
  setQuickHours: (v: number | null) => void;
  quickAssigneeId: string | null;
  setQuickAssigneeId: (v: string | null) => void;
  pendingPlacement: { memberId: string; weekStart: string } | null;
  setPendingPlacement: (v: { memberId: string; weekStart: string } | null) => void;
  onQuickAdd: (e?: React.FormEvent) => void;
  onCardMouseDown: (e: React.MouseEvent, card: PlanningCard) => void;
  onCardDelete: (card: PlanningCard) => void;
  onCardUpdate: (card: PlanningCard, patch: PlanningCardUpdateRequest) => void;
  draggingId: string | null;
  dropHint: DropTargetHint | null;
  currentUser: { id: string; name: string };
  reducedMotion: boolean;
}

function PlanningPool({
  poolCards,
  members,
  canEdit,
  poolFilter,
  setPoolFilter,
  searchOpen,
  setSearchOpen,
  searchQuery,
  setSearchQuery,
  quickTitle,
  setQuickTitle,
  quickHours,
  setQuickHours,
  quickAssigneeId,
  setQuickAssigneeId,
  pendingPlacement,
  setPendingPlacement,
  onQuickAdd,
  onCardMouseDown,
  onCardDelete,
  onCardUpdate,
  draggingId,
  dropHint,
  reducedMotion,
}: PlanningPoolProps) {
  const { t } = useTranslation();
  const poolHighlight = dropHint?.type === 'pool';

  return (
    <div
      data-drop-target="pool"
      className={`flex flex-col ${poolHighlight ? 'ring-2 ring-bridge-accent/30 ring-inset bg-bridge-accent/5' : ''}`}
    >
      <PoolToolbar
        canEdit={canEdit}
        members={members}
        poolFilter={poolFilter}
        setPoolFilter={setPoolFilter}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        quickTitle={quickTitle}
        setQuickTitle={setQuickTitle}
        quickHours={quickHours}
        setQuickHours={setQuickHours}
        quickAssigneeId={quickAssigneeId}
        setQuickAssigneeId={setQuickAssigneeId}
        pendingPlacement={pendingPlacement}
        setPendingPlacement={setPendingPlacement}
        onQuickAdd={onQuickAdd}
      />
      <div className="flex gap-2 px-3 py-3 overflow-x-auto custom-scrollbar">
        {poolCards.length === 0 ? (
          <div className="flex-1 text-center py-4">
            <p className="text-xs text-slate-500">
              {t(
                'schedule.planning.pool.empty.title',
                'No temporary tasks yet',
              )}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              {t(
                'schedule.planning.pool.empty.description',
                'Enter a title above and press Enter',
              )}
            </p>
          </div>
        ) : (
          poolCards.map((card, idx) => (
            <PoolCardView
              key={card.id}
              card={card}
              canEdit={canEdit}
              isDragging={draggingId === card.id}
              onMouseDown={onCardMouseDown}
              onDelete={onCardDelete}
              onUpdate={onCardUpdate}
              reducedMotion={reducedMotion}
              index={idx}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface PoolToolbarProps {
  canEdit: boolean;
  members: MemberLite[];
  poolFilter: 'all' | 'unplaced' | 'placed';
  setPoolFilter: (v: 'all' | 'unplaced' | 'placed') => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  quickTitle: string;
  setQuickTitle: (v: string) => void;
  quickHours: number | null;
  setQuickHours: (v: number | null) => void;
  quickAssigneeId: string | null;
  setQuickAssigneeId: (v: string | null) => void;
  pendingPlacement: { memberId: string; weekStart: string } | null;
  setPendingPlacement: (v: { memberId: string; weekStart: string } | null) => void;
  onQuickAdd: (e?: React.FormEvent) => void;
}

const HOURS_PRESETS = [1, 2, 4, 8, 16];

function PoolToolbar({
  canEdit,
  members,
  poolFilter,
  setPoolFilter,
  searchOpen,
  setSearchOpen,
  searchQuery,
  setSearchQuery,
  quickTitle,
  setQuickTitle,
  quickHours,
  setQuickHours,
  quickAssigneeId,
  setQuickAssigneeId,
  pendingPlacement,
  setPendingPlacement,
  onQuickAdd,
}: PoolToolbarProps) {
  const { t } = useTranslation();
  const [hoursOpen, setHoursOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-foreground/[0.08]">
      <Flag size={12} className="text-slate-500 shrink-0" aria-hidden="true" />
      <span className="text-xs font-bold text-foreground shrink-0">
        {t('schedule.planning.pool.title', 'Pool')}
      </span>
      {pendingPlacement && (
        <span className="inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
          <ArrowDownToLine size={10} aria-hidden="true" />
          {pendingPlacement.weekStart}
          <button
            onClick={() => setPendingPlacement(null)}
            aria-label="clear"
            className="ml-0.5"
          >
            <X size={10} />
          </button>
        </span>
      )}

      <form
        onSubmit={(e) => onQuickAdd(e)}
        className="flex-1 flex items-center gap-1.5 min-w-0"
      >
        <input
          id="planning-quickadd-title"
          type="text"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value.slice(0, 200))}
          placeholder={t('schedule.planning.pool.quickAdd', 'Enter title...')}
          disabled={!canEdit}
          maxLength={200}
          className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 px-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all disabled:opacity-50"
        />

        {/* Hours preset */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setHoursOpen((v) => !v)}
            disabled={!canEdit}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-foreground bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-colors disabled:opacity-50"
          >
            {quickHours != null ? `${quickHours}h` : t('schedule.planning.pool.hours', 'Hours')}
          </button>
          {hoursOpen && (
            <div className="absolute bottom-full mb-1 right-0 z-30 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg shadow-xl py-1 min-w-[80px]">
              {HOURS_PRESETS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    setQuickHours(h);
                    setHoursOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 text-xs font-bold text-foreground hover:bg-foreground/5"
                >
                  {h}h
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setQuickHours(null);
                  setHoursOpen(false);
                }}
                className="w-full text-left px-3 py-1 text-xs text-slate-500 hover:bg-foreground/5"
              >
                —
              </button>
            </div>
          )}
        </div>

        {/* Assignee */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAssigneeOpen((v) => !v)}
            disabled={!canEdit || members.length === 0}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-foreground bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-colors disabled:opacity-50"
          >
            {quickAssigneeId
              ? members.find((m) => m.id === quickAssigneeId)?.name ?? t('schedule.planning.pool.assignee', 'Assignee')
              : t('schedule.planning.pool.assignee', 'Assignee')}
          </button>
          {assigneeOpen && (
            <div className="absolute bottom-full mb-1 right-0 z-30 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg shadow-xl py-1 min-w-[140px] max-h-[200px] overflow-y-auto custom-scrollbar">
              <button
                type="button"
                onClick={() => {
                  setQuickAssigneeId(null);
                  setAssigneeOpen(false);
                }}
                className="w-full text-left px-3 py-1 text-xs text-slate-500 hover:bg-foreground/5"
              >
                —
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setQuickAssigneeId(m.id);
                    setAssigneeOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 text-xs font-bold text-foreground hover:bg-foreground/5 truncate"
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!canEdit || !quickTitle.trim()}
          className="shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={12} className="inline -mt-0.5" aria-hidden="true" />
        </button>
      </form>

      {/* Filter */}
      <div className="hidden md:flex items-center rounded-lg bg-foreground/[0.03] border border-foreground/10 p-0.5 shrink-0">
        {(['all', 'unplaced', 'placed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setPoolFilter(f)}
            className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
              poolFilter === f
                ? 'bg-bridge-accent text-white'
                : 'text-slate-400 hover:text-foreground'
            }`}
          >
            {t(`schedule.planning.pool.filter.${f}`, f)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative flex items-center shrink-0">
        {searchOpen ? (
          <div className="flex items-center gap-1 bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2">
            <Search size={12} className="text-slate-500" aria-hidden="true" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => {
                if (!searchQuery) setSearchOpen(false);
              }}
              placeholder={t('common.search', 'Search')}
              className="bg-transparent border-0 text-xs text-foreground placeholder-slate-500 outline-none w-28"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                }}
                aria-label="clear search"
              >
                <X size={10} className="text-slate-500" />
              </button>
            )}
          </div>
        ) : (
          <IconButton
            aria-label={t('common.search', 'Search')}
            onClick={() => setSearchOpen(true)}
            size="sm"
          >
            <Search size={14} aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

interface PoolCardViewProps {
  card: PlanningCard;
  canEdit: boolean;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent, card: PlanningCard) => void;
  onDelete: (card: PlanningCard) => void;
  onUpdate: (card: PlanningCard, patch: PlanningCardUpdateRequest) => void;
  reducedMotion: boolean;
  index: number;
}

function PoolCardView({
  card,
  canEdit,
  isDragging,
  onMouseDown,
  onDelete,
  onUpdate,
  reducedMotion,
  index,
}: PoolCardViewProps) {
  const { t } = useTranslation();
  const [showActions, setShowActions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(card.title);
  const hex = card.color || (card.assignee
    ? getAssigneeHex(card.assignee.name, null)
    : '#6366F1');

  const commit = () => {
    setEditing(false);
    const next = draftTitle.trim();
    if (next && next !== card.title) {
      onUpdate(card, { title: next });
    } else {
      setDraftTitle(card.title);
    }
  };

  return (
    <motion.div
      initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : index * 0.04 }}
      className={`relative shrink-0 bg-bridge-dark border border-foreground/[0.08] hover:border-foreground/[0.12] rounded-xl p-2.5 transition-colors select-none ${
        isDragging ? 'opacity-30' : ''
      }`}
      style={{ width: 200, height: 88 }}
      onMouseDown={(e) => {
        if (!canEdit) return;
        if (editing) return;
        const target = e.target as HTMLElement;
        if (target.closest('[data-card-action]')) return;
        onMouseDown(e, card);
      }}
      onDoubleClick={() => canEdit && setEditing(true)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Color accent */}
      <div
        className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
        style={{ backgroundColor: hex }}
        aria-hidden="true"
      />

      {editing ? (
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value.slice(0, 200))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraftTitle(card.title);
              setEditing(false);
            }
          }}
          className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-md px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-bridge-accent/50"
        />
      ) : (
        <p className="text-xs font-bold text-foreground line-clamp-2 pl-2">
          {card.title}
        </p>
      )}
      <div className="mt-1 flex items-center gap-1.5 text-xs pl-2">
        {card.estimated_hours != null && (
          <span className="font-bold text-slate-400 tabular-nums">
            {card.estimated_hours}h
          </span>
        )}
        <span className="text-slate-500 truncate">
          {card.assignee?.name ?? t('schedule.planning.pool.filter.unplaced', 'Unplaced')}
        </span>
      </div>

      {canEdit && showActions && !editing && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5" data-card-action>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            aria-label={t('schedule.planning.card.edit', 'Edit')}
            className="p-1 rounded-md text-slate-500 hover:text-foreground hover:bg-foreground/5"
          >
            <MoreHorizontal size={12} aria-hidden="true" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(card);
            }}
            aria-label={t('schedule.planning.card.delete', 'Delete')}
            className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-foreground/5"
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

interface DragGhostProps {
  dragState: PoolDragState;
}

function DragGhost({ dragState }: DragGhostProps) {
  const { card } = dragState;
  return (
    <div
      aria-hidden="true"
      className="fixed pointer-events-none z-50 w-[180px] bg-bridge-accent/20 border border-bridge-accent rounded-lg px-3 py-2 shadow-lg shadow-bridge-accent/20"
      style={{
        left: dragState.currentX + 12,
        top: dragState.currentY - 16,
      }}
    >
      <span className="text-xs font-bold text-foreground truncate block">
        {card.title}
      </span>
      {card.estimated_hours != null && (
        <span className="text-xs text-slate-400 tabular-nums">
          {card.estimated_hours}h
        </span>
      )}
    </div>
  );
}

interface LegendPopoverProps {
  onClose: () => void;
}

function LegendPopover({ onClose }: LegendPopoverProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const rows: Array<{ status: PlanningCardStatus; labelKey: string; fallback: string }> = [
    { status: 'OVER', labelKey: 'schedule.planning.legend.over', fallback: 'Over (> 110%)' },
    { status: 'NORMAL', labelKey: 'schedule.planning.legend.normal', fallback: 'Normal (50~110%)' },
    { status: 'UNDER', labelKey: 'schedule.planning.legend.under', fallback: 'Under (< 50%)' },
    { status: 'UNKNOWN', labelKey: 'schedule.planning.legend.unknown', fallback: 'Unknown (no capacity)' },
  ];

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('schedule.planning.legend.title', 'Legend')}
      className="absolute top-full right-0 mt-2 w-64 bg-bridge-obsidian border border-foreground/10 rounded-2xl shadow-2xl p-3 z-40"
    >
      <p className="text-xs font-bold text-foreground mb-2">
        {t('schedule.planning.legend.title', 'Legend')}
      </p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.status} className="flex items-center gap-2">
            <span className={`w-3 h-1.5 rounded-full ${statusBarClass(r.status)}`} />
            <span className={`text-xs font-bold ${statusTextClass(r.status)}`}>
              {r.status}
            </span>
            <span className="text-xs text-slate-500 flex-1 truncate">
              {t(r.labelKey, r.fallback)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// Small utilities
// =============================================================================

function formatLoadNumbers(actual: number, capacity: number | null | undefined): string {
  const a = Number.isFinite(actual) ? Math.round(actual * 10) / 10 : 0;
  const aStr = Number.isInteger(a) ? String(a) : a.toFixed(1);
  if (capacity == null) return `${aStr}/—`;
  const c = Number.isFinite(capacity) ? Math.round(capacity * 10) / 10 : 0;
  const cStr = Number.isInteger(c) ? String(c) : c.toFixed(1);
  return `${aStr}/${cStr}`;
}

export default SchedulePlanningView;
