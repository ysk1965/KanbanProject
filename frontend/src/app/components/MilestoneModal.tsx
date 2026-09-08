import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Flag,
  Calendar as CalendarIcon,
  Plus,
  Check,
  Maximize2,
  MoreHorizontal,
  Trash2,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { MotionModal } from "./ui/MotionModal";
import { IconButton } from "./ui/IconButton";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { Milestone, Feature, MilestoneFeatureInfo } from "../types";
import { getTodayDateString } from "../utils/dateUtils";

// ────────────────────────────────────────────────────────────
// 상태 파생 — 완료 / 진행 / 지연 / 예정
// ────────────────────────────────────────────────────────────
type MilestoneStatus = "done" | "current" | "risk" | "todo";

// 상태별 링 색 (완료=emerald, 현재=bridge-accent, 지연=amber, 예정=slate)
const RING_COLOR: Record<MilestoneStatus, string> = {
  done: "#34d399",
  current: "#6366f1",
  risk: "#fbbf24",
  todo: "#64748b",
};

// 상태 pill 클래스 — 뱃지 BG는 /15 통일, 텍스트만 dark: 분기
const PILL_CLASS: Record<MilestoneStatus, string> = {
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  current: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  risk: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  todo: "bg-slate-500/15 text-slate-500 dark:text-slate-400",
};

// yyyy-MM-dd → 타임존 무관 day 정수 (UTC 자정 기준)
function dateToNum(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysBetween(a: string, b: string): number {
  return Math.round((dateToNum(b) - dateToNum(a)) / 86400000);
}

// 진행률 + 기간(오늘 기준)으로 마일스톤 상태 파생
function deriveMilestoneStatus(
  m: { start_date: string; end_date: string; progress_percentage: number },
  today: string,
): MilestoneStatus {
  if (m.progress_percentage >= 100) return "done";
  if (m.start_date > today) return "todo"; // 아직 시작 전
  if (m.end_date < today) return "risk"; // 기간 지났는데 미완료
  return "current"; // 오늘이 기간 내부 = 진행 중
}

// 현재 마일스톤: 기간의 경과 비율(%)
function timeElapsedPercent(
  m: { start_date: string; end_date: string },
  today: string,
): number {
  const s = dateToNum(m.start_date);
  const e = dateToNum(m.end_date);
  const t = dateToNum(today);
  if (e <= s) return t >= s ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((t - s) / (e - s)) * 100)));
}

// 종료일 기준 D-day 라벨 (D-n / D-DAY / D+n)
function dDayLabel(m: { end_date: string }, today: string): string {
  const days = daysBetween(today, m.end_date);
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-DAY";
  return `D+${-days}`;
}

// 기간 표기: 해가 바뀌는 쪽에만 두 자리 연도 (12/10~'27 4/28)
function periodLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  return sameYear
    ? `${format(s, "M/d")}~${format(e, "M/d")}`
    : `${format(s, "M/d")}~'${format(e, "yy")} ${format(e, "M/d")}`;
}

// 마일스톤 체크리스트 집계 — 응답에 없으면 피처 합산으로 폴백
function milestoneItemTotals(m: Milestone) {
  const feats = m.features ?? [];
  const sum = (pick: (f: MilestoneFeatureInfo) => number | undefined) =>
    feats.reduce((acc, f) => acc + (pick(f) ?? 0), 0);
  return {
    totalItems: m.total_items ?? sum((f) => f.total_items),
    completedItems: m.completed_items ?? sum((f) => f.completed_items),
    overdueItems: m.overdue_items ?? sum((f) => f.overdue_items),
    unassignedItems: m.unassigned_items ?? sum((f) => f.unassigned_items),
    totalTasks: m.total_tasks ?? sum((f) => f.total_tasks),
    completedTasks: m.completed_tasks ?? sum((f) => f.completed_tasks),
  };
}

// ────────────────────────────────────────────────────────────
// 진행률 링 노드
// ────────────────────────────────────────────────────────────
function MilestoneRingNode({
  percent,
  status,
  selected,
  size = 22,
}: {
  percent: number;
  status: MilestoneStatus;
  selected?: boolean;
  size?: number;
}) {
  const sw = 3;
  const R = size / 2 - sw;
  const CIRC = 2 * Math.PI * R;
  const c = size / 2;
  const pct = Math.max(0, Math.min(100, percent));
  const color = RING_COLOR[status];
  const isDone = status === "done";
  return (
    <span
      className="relative grid place-items-center rounded-full bg-bridge-dark"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={c}
          cy={c}
          r={R}
          fill="none"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth={sw}
        />
        {pct > 0 && (
          <circle
            cx={c}
            cy={c}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct / 100)}
          />
        )}
      </svg>
      {isDone && (
        <Check
          className="absolute h-3 w-3"
          style={{ color }}
          strokeWidth={3.5}
        />
      )}
      {selected && !isDone && (
        <span
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
      )}
    </span>
  );
}

// 필수 입력 필드의 충족 여부 아이콘 (생성 모드)
function FieldStatusIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <span
      className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500"
      aria-hidden
    >
      <Check className="h-3 w-3 text-white" strokeWidth={3} />
    </span>
  ) : (
    <span
      className="block h-5 w-5 rounded-full border border-dashed border-slate-500"
      aria-hidden
    />
  );
}

// 이중 진행 바 — 기간 경과(로즈) 위에 체크리스트 진행(그라디언트)
function DualBar({
  work,
  elapsed,
  height = "h-1",
}: {
  work: number;
  elapsed: number;
  height?: string;
}) {
  return (
    <span
      className={`relative block ${height} overflow-hidden rounded-full bg-foreground/10`}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-rose-400/30"
        style={{ width: `${elapsed}%` }}
      />
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bridge-secondary to-bridge-accent"
        style={{ width: `${work}%` }}
      />
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// 생성 중 임시 위치 미리보기 — 점선 고스트 노드
// ────────────────────────────────────────────────────────────
function GhostRailNode({
  title,
  startDate,
  endDate,
  newLabel,
  readyLabel,
  needTitleLabel,
  needPeriodLabel,
  undatedSubLabel,
}: {
  title: string;
  startDate?: Date;
  endDate?: Date;
  newLabel: string;
  readyLabel: string;
  needTitleLabel: string;
  needPeriodLabel: string;
  undatedSubLabel: string;
}) {
  const dated = !!(startDate && endDate);
  const hasTitle = !!title.trim();
  const ready = hasTitle && dated;
  const badgeText = ready
    ? readyLabel
    : !hasTitle
      ? needTitleLabel
      : needPeriodLabel;
  return (
    <div
      className="relative grid grid-cols-[22px_1fr] items-center gap-2 rounded-lg border border-dashed border-bridge-accent bg-bridge-accent/10 py-2 pl-1.5 pr-2"
      aria-hidden
    >
      <span className="grid h-[22px] w-[22px] place-items-center justify-self-center rounded-full border border-dashed border-bridge-accent bg-bridge-dark">
        <Plus className="h-3 w-3 text-bridge-accent" strokeWidth={2.5} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-bridge-accent">
            {title.trim() || newLabel}
          </span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold text-white ${
              ready ? "bg-emerald-500" : "bg-bridge-accent"
            }`}
          >
            {badgeText}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-400 tabular-nums">
          {dated
            ? `${format(startDate!, "M/d")}~${format(endDate!, "M/d")}`
            : undatedSubLabel}
        </span>
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 담긴 작업 필터
// ────────────────────────────────────────────────────────────
type WorkFilter = "all" | "overdue" | "unassigned";

interface MilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone?: Milestone | null;
  milestones: Milestone[];
  features: Feature[];
  featureMilestoneCountMap?: Record<string, number>;
  featurePrimaryMilestoneMap?: Record<string, string>;
  onSave: (data: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    feature_ids?: string[];
  }) => Promise<void>;
  onDelete?: (milestoneId: string) => Promise<void>;
  onSelectMilestone: (milestone: Milestone | null) => void;
  /** 담긴 작업 행 클릭 → 피처 상세 */
  onOpenFeature?: (featureId: string) => void;
  /** 상황판 "콘솔 열기" → 마일스톤 콘솔 */
  onOpenConsole?: (milestoneId: string) => void;
}

export function MilestoneModal({
  isOpen,
  onClose,
  milestone,
  milestones,
  featureMilestoneCountMap = {},
  onSave,
  onDelete,
  onSelectMilestone,
  onOpenFeature,
  onOpenConsole,
}: MilestoneModalProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  // 편집 모드 인라인 상태
  const [titleEditing, setTitleEditing] = useState(false);
  const [descOpen, setDescOpen] = useState(false); // 설명 인라인 펼침
  const [descExpanded, setDescExpanded] = useState(false); // 설명 큰 팝업
  const [periodOpen, setPeriodOpen] = useState(false);
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  const [pendingSelect, setPendingSelect] = useState<{
    target: Milestone | null;
  } | null>(null);
  // 오버플로(⋯) 메뉴 — 열려 있는 마일스톤 id ("__board__"는 상황판 메뉴)
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  const isEditMode = !!milestone;
  const isCreating = !milestone;
  const today = getTodayDateString();

  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title);
      setDescription(milestone.description || "");
      setStartDate(new Date(milestone.start_date));
      setEndDate(new Date(milestone.end_date));
    } else {
      setTitle("");
      setDescription("");
      setStartDate(undefined);
      setEndDate(undefined);
    }
    setTitleEditing(false);
    setDescOpen(false);
    setDescExpanded(false);
    setPeriodOpen(false);
    setWorkFilter("all");
    setPendingSelect(null);
    setMenuFor(null);
    setDeleteTarget(null);
  }, [milestone, isOpen]);

  useEffect(() => {
    if (titleEditing) titleInputRef.current?.focus();
  }, [titleEditing]);

  // 시작일 순 정렬 (레일·번호·이웃 계산 공용)
  const sorted = useMemo(
    () =>
      [...milestones].sort((a, b) =>
        a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0,
      ),
    [milestones],
  );

  // 생성 모드에서 미리보기용 고스트의 시작일 키 (yyyy-MM-dd) — 없으면 맨 끝
  const ghostStart =
    isCreating && startDate ? format(startDate, "yyyy-MM-dd") : null;
  type RailEntry =
    | { kind: "today" }
    | { kind: "ghost" }
    | { kind: "milestone"; m: Milestone; status: MilestoneStatus };
  const railItems = useMemo<RailEntry[]>(() => {
    const hasCurrent = sorted.some(
      (m) => m.start_date <= today && today <= m.end_date,
    );
    const items: RailEntry[] = [];
    let dividerInserted = false;
    let ghostInserted = false;
    for (const m of sorted) {
      if (
        isCreating &&
        !ghostInserted &&
        ghostStart &&
        m.start_date > ghostStart
      ) {
        items.push({ kind: "ghost" });
        ghostInserted = true;
      }
      // 현재 마일스톤이 없을 때만, 오늘보다 늦게 시작하는 첫 항목 앞에 TODAY 구분선
      if (!hasCurrent && !dividerInserted && m.start_date > today) {
        items.push({ kind: "today" });
        dividerInserted = true;
      }
      items.push({
        kind: "milestone",
        m,
        status: deriveMilestoneStatus(m, today),
      });
    }
    if (!hasCurrent && !dividerInserted) items.push({ kind: "today" });
    if (isCreating && !ghostInserted) items.push({ kind: "ghost" });
    return items;
  }, [sorted, today, isCreating, ghostStart]);

  // 피처별 소속 마일스톤 목록 (레일과 동일한 시작일 순 번호)
  const featureMilestonesMap = useMemo<
    Record<string, Array<{ id: string; order: number; title: string }>>
  >(() => {
    const orderMap: Record<string, number> = {};
    sorted.forEach((m, i) => {
      orderMap[m.id] = i + 1;
    });
    const map: Record<
      string,
      Array<{ id: string; order: number; title: string }>
    > = {};
    for (const m of sorted) {
      if (!m.features) continue;
      for (const f of m.features) {
        (map[f.id] ||= []).push({
          id: m.id,
          order: orderMap[m.id] ?? 0,
          title: m.title,
        });
      }
    }
    return map;
  }, [sorted]);

  // 헤더 요약 — 전체 체크리스트 진행 + 지연 마일스톤 수
  const boardSummary = useMemo(() => {
    let total = 0;
    let done = 0;
    let risk = 0;
    for (const m of milestones) {
      const s = milestoneItemTotals(m);
      total += s.totalItems;
      done += s.completedItems;
      if (deriveMilestoneStatus(m, today) === "risk" && !m.is_default) risk++;
    }
    return {
      count: milestones.length,
      pct: total === 0 ? 0 : Math.round((done / total) * 100),
      risk,
    };
  }, [milestones, today]);

  // 선택 마일스톤 파생 지표 (상황판)
  const selected = useMemo(() => {
    if (!milestone) return null;
    const status = deriveMilestoneStatus(milestone, today);
    const totals = milestoneItemTotals(milestone);
    const feats = milestone.features ?? [];
    const spanning = feats.filter(
      (f) => (featureMilestoneCountMap[f.id] || 0) > 1,
    ).length;
    const elapsed =
      status === "current"
        ? timeElapsedPercent(milestone, today)
        : status === "todo"
          ? 0
          : 100;
    const work = milestone.progress_percentage || 0;
    const days = daysBetween(milestone.start_date, milestone.end_date) + 1;
    return {
      status,
      ...totals,
      featureCount: feats.length,
      spanning,
      elapsed,
      work,
      days,
      dday: dDayLabel(milestone, today),
    };
  }, [milestone, today, featureMilestoneCountMap]);

  // 담긴 작업 — 필터 + 정렬(지연 우선, 진행률 낮은 순)
  const workRows = useMemo(() => {
    const feats = milestone?.features ?? [];
    const filtered = feats.filter((f) => {
      if (workFilter === "overdue") return (f.overdue_items ?? 0) > 0;
      if (workFilter === "unassigned") return (f.unassigned_items ?? 0) > 0;
      return true;
    });
    return [...filtered].sort((a, b) => {
      const ao = a.overdue_items ?? 0;
      const bo = b.overdue_items ?? 0;
      if (ao !== bo) return bo - ao;
      return (a.progress_percentage || 0) - (b.progress_percentage || 0);
    });
  }, [milestone, workFilter]);

  // 기간 이웃 검사 — 겹침 / 공백 힌트 (편집 중인 자신은 제외)
  const neighborHint = useMemo(() => {
    if (!startDate || !endDate) return null;
    const s = format(startDate, "yyyy-MM-dd");
    const e = format(endDate, "yyyy-MM-dd");
    const others = sorted.filter((m) => m.id !== milestone?.id);
    const prev = [...others].reverse().find((m) => m.start_date < s);
    const next = others.find((m) => m.start_date > s);
    const hints: Array<{ kind: "overlap" | "gap"; text: string }> = [];
    if (prev) {
      const d = daysBetween(prev.end_date, s);
      if (d <= 0) {
        hints.push({
          kind: "overlap",
          text: t("milestone.overlapWith", {
            defaultValue: "{{title}}과(와) {{days}}일 겹침",
            title: prev.title,
            days: 1 - d,
          }),
        });
      } else if (d > 1) {
        hints.push({
          kind: "gap",
          text: t("milestone.gapWith", {
            defaultValue: "{{title}}과(와) {{days}}일 공백",
            title: prev.title,
            days: d - 1,
          }),
        });
      }
    }
    if (next) {
      const d = daysBetween(e, next.start_date);
      if (d <= 0) {
        hints.push({
          kind: "overlap",
          text: t("milestone.overlapWith", {
            defaultValue: "{{title}}과(와) {{days}}일 겹침",
            title: next.title,
            days: 1 - d,
          }),
        });
      } else if (d > 1) {
        hints.push({
          kind: "gap",
          text: t("milestone.gapWith", {
            defaultValue: "{{title}}과(와) {{days}}일 공백",
            title: next.title,
            days: d - 1,
          }),
        });
      }
    }
    return hints.length ? hints : null;
  }, [startDate, endDate, sorted, milestone?.id, t]);

  // 기간 프리셋 — 이전 마일스톤 직후 / n주
  const applyPreset = (weeks?: number) => {
    const others = sorted.filter((m) => m.id !== milestone?.id);
    let from = startDate;
    if (weeks === undefined) {
      // 이전 마일스톤 직후부터: 시작일이 가장 늦은 마일스톤의 종료일 + 1
      const last = others.reduce<Milestone | null>(
        (acc, m) => (!acc || m.end_date > acc.end_date ? m : acc),
        null,
      );
      if (!last) return;
      from = new Date(dateToNum(last.end_date) + 86400000);
      setStartDate(from);
      if (!endDate || endDate < from) {
        setEndDate(new Date(from.getTime() + 27 * 86400000));
      }
      return;
    }
    if (!from) from = new Date(dateToNum(today));
    setStartDate(from);
    setEndDate(new Date(from.getTime() + (weeks * 7 - 1) * 86400000));
  };

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!title.trim() || !startDate || !endDate) return false;
    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
      });
      return true;
    } catch (error) {
      console.error("Failed to save milestone:", error);
      toast.error(t("milestone.saveFailed"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [title, description, startDate, endDate, onSave, t]);

  // 변경된 필드 목록 (푸터 표시 + dirty 판정)
  const changedFields = useMemo(() => {
    const baseTitle = milestone?.title ?? "";
    const baseDesc = milestone?.description ?? "";
    const baseStart = milestone
      ? format(new Date(milestone.start_date), "yyyy-MM-dd")
      : "";
    const baseEnd = milestone
      ? format(new Date(milestone.end_date), "yyyy-MM-dd")
      : "";
    const curStart = startDate ? format(startDate, "yyyy-MM-dd") : "";
    const curEnd = endDate ? format(endDate, "yyyy-MM-dd") : "";
    const out: string[] = [];
    if (title !== baseTitle) out.push(t("milestone.titleLabel"));
    if (description !== baseDesc) out.push(t("milestone.descriptionLabel"));
    if (curStart !== baseStart || curEnd !== baseEnd)
      out.push(t("milestone.periodLabel"));
    return out;
  }, [milestone, title, description, startDate, endDate, t]);
  const isDirty = changedFields.length > 0;

  const revert = () => {
    if (!milestone) return;
    setTitle(milestone.title);
    setDescription(milestone.description || "");
    setStartDate(new Date(milestone.start_date));
    setEndDate(new Date(milestone.end_date));
    setTitleEditing(false);
  };

  // 필수 입력(제목 + 기간) 충족 여부 — 생성 모드 게이팅
  const hasTitle = title.trim().length > 0;
  const hasPeriod = !!startDate && !!endDate;
  const canCreate = hasTitle && hasPeriod;
  const canSubmit =
    !isSaving && hasTitle && hasPeriod && (isEditMode ? isDirty : true);

  // ⌘S / Ctrl+S 저장
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canSubmit) void handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, canSubmit, handleSave]);

  // 다른 마일스톤(또는 새 마일스톤)으로 전환 — 변경사항 있으면 확인 후
  const requestSelect = (target: Milestone | null) => {
    if (target?.id === milestone?.id && target !== null) return;
    if (isDirty) {
      setPendingSelect({ target });
    } else {
      onSelectMilestone(target);
    }
  };

  const discardAndSelect = () => {
    const target = pendingSelect?.target ?? null;
    setPendingSelect(null);
    onSelectMilestone(target);
  };

  const saveAndSelect = async () => {
    const target = pendingSelect?.target ?? null;
    const ok = await handleSave();
    if (ok) {
      setPendingSelect(null);
      onSelectMilestone(target);
    }
  };

  // 레일 ↑↓ 키보드 이동
  const handleRailKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (sorted.length === 0) return;
    const idx = sorted.findIndex((m) => m.id === milestone?.id);
    const next =
      e.key === "ArrowDown"
        ? Math.min(sorted.length - 1, idx + 1)
        : Math.max(0, idx - 1);
    if (next !== idx) requestSelect(sorted[next]);
  };

  const confirmDelete = async () => {
    if (!onDelete || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      setMenuFor(null);
      // 선택 중이던 마일스톤을 지웠으면 생성 모드로
      if (milestone?.id === deletedId) onSelectMilestone(null);
    } catch (error) {
      console.error("Failed to delete milestone:", error);
      toast.error(t("milestone.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const openFeature = (featureId: string) => {
    if (!onOpenFeature) return;
    onClose();
    onOpenFeature(featureId);
  };

  // ── 공용 조각 ──────────────────────────────────────────────
  const statusPill = (m: Milestone, status: MilestoneStatus) => {
    if (m.is_default && status === "risk") {
      return (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold ${PILL_CLASS.todo}`}
        >
          {t("milestone.statusDefault", { defaultValue: "기본" })}
        </span>
      );
    }
    const text =
      status === "done"
        ? t("milestone.statusCompleted", { defaultValue: "완료" })
        : status === "current"
          ? dDayLabel(m, today)
          : status === "risk"
            ? `${t("milestone.statusOverdue", { defaultValue: "지연" })} ${m.progress_percentage || 0}%`
            : t("milestone.statusTodo", { defaultValue: "예정" });
    return (
      <span
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${PILL_CLASS[status]}`}
      >
        {text}
      </span>
    );
  };

  const ringAria = (m: Milestone, status: MilestoneStatus) =>
    `${m.title}, ${m.progress_percentage || 0}%, ${
      status === "done"
        ? t("milestone.statusCompleted", { defaultValue: "완료" })
        : status === "current"
          ? t("milestone.statusInProgress", { defaultValue: "진행 중" })
          : status === "risk"
            ? t("milestone.statusOverdue", { defaultValue: "지연" })
            : t("milestone.statusTodo", { defaultValue: "예정" })
    }`;

  const periodTrigger = (
    <Popover open={periodOpen} onOpenChange={setPeriodOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
            startDate && endDate
              ? "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:text-foreground hover:border-foreground/20"
              : "border-dashed border-bridge-accent/60 text-bridge-accent"
          }`}
        >
          <CalendarIcon className="h-3.5 w-3.5" />
          {startDate && endDate ? (
            <>
              {format(startDate, "yyyy.MM.dd")} ~ {format(endDate, "MM.dd")}
              <span className="text-slate-500">
                ·{" "}
                {daysBetween(
                  format(startDate, "yyyy-MM-dd"),
                  format(endDate, "yyyy-MM-dd"),
                ) + 1}
                {t("milestone.daysUnit", { defaultValue: "일" })}
              </span>
            </>
          ) : (
            t("milestone.selectPeriod")
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-bridge-surface border-bridge-border"
        align="start"
      >
        <div className="flex flex-wrap items-center gap-1.5 border-b border-foreground/[0.08] px-3 py-2">
          <button
            type="button"
            onClick={() => applyPreset()}
            className="rounded-full border border-foreground/10 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            {t("milestone.presetAfterLast", {
              defaultValue: "마지막 마일스톤 직후",
            })}
          </button>
          {[2, 4, 6].map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => applyPreset(w)}
              className="rounded-full border border-foreground/10 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              {t("milestone.presetWeeks", {
                defaultValue: "{{n}}주",
                n: w,
              })}
            </button>
          ))}
        </div>
        <Calendar
          mode="range"
          selected={{ from: startDate, to: endDate }}
          onSelect={(range) => {
            setStartDate(range?.from);
            setEndDate(range?.to);
          }}
          numberOfMonths={2}
          locale={ko}
          className="text-foreground"
        />
        {neighborHint && (
          <div className="flex flex-col gap-1 border-t border-foreground/[0.08] px-3 py-2">
            {neighborHint.map((h, i) => (
              <span
                key={i}
                className={`flex items-center gap-1.5 text-xs ${
                  h.kind === "overlap"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-400"
                }`}
              >
                <AlertTriangle className="h-3 w-3" />
                {h.text}
              </span>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );

  const overflowMenu = (target: Milestone, key: string, compact = false) => {
    if (!onDelete) return null;
    const open = menuFor === key;
    return (
      <>
        <IconButton
          type="button"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setMenuFor(open ? null : key);
          }}
          aria-label={t("common.more", { defaultValue: "더보기" })}
          className={`${compact ? "!h-8 !w-8 !min-h-0 !min-w-0" : ""} rounded-lg text-slate-400 transition-opacity hover:text-foreground hover:bg-foreground/10 ${
            open
              ? "opacity-100 bg-foreground/10"
              : "opacity-40 hover:opacity-100 focus:opacity-100"
          }`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
        {open && (
          <div className="absolute right-0 top-9 z-20 w-36 rounded-xl border border-foreground/10 bg-bridge-obsidian p-1 shadow-2xl">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuFor(null);
                setDeleteTarget(target);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("common.delete")}
            </button>
          </div>
        )}
      </>
    );
  };

  // 레일 행 (데스크톱)
  const renderRailRow = (m: Milestone, status: MilestoneStatus) => {
    const isSel = milestone?.id === m.id;
    const isCurrent = status === "current";
    const work = m.progress_percentage || 0;
    const elapsed = isCurrent ? timeElapsedPercent(m, today) : 0;
    return (
      <div key={m.id} className="group relative">
        <button
          type="button"
          onClick={() => requestSelect(m)}
          aria-current={isSel ? "true" : undefined}
          aria-label={ringAria(m, status)}
          className={`relative grid w-full grid-cols-[22px_1fr] items-center gap-2 rounded-lg py-2 pl-1.5 pr-9 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50 ${
            isSel
              ? "bg-bridge-accent/15 border border-bridge-accent/30"
              : "border border-transparent hover:bg-foreground/5"
          }`}
        >
          {isCurrent && (
            <span
              className="absolute -left-2 top-2 bottom-2 w-[3px] rounded-full bg-bridge-accent"
              aria-hidden
            />
          )}
          <span className="justify-self-center">
            <MilestoneRingNode
              percent={work}
              status={status}
              selected={isSel}
            />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span
                className={`min-w-0 flex-1 truncate text-sm font-medium ${
                  isSel ? "text-bridge-accent" : "text-foreground"
                }`}
              >
                {m.title}
              </span>
              {statusPill(m, status)}
            </span>
            {isCurrent && (
              <span className="mt-1.5 block">
                <DualBar work={work} elapsed={elapsed} />
              </span>
            )}
            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500 tabular-nums">
              <span className="truncate">
                {periodLabel(m.start_date, m.end_date)}
              </span>
              {isCurrent ? (
                <span className="shrink-0">
                  <span className="text-bridge-accent">
                    {t("milestone.workShort", { defaultValue: "작업" })} {work}%
                  </span>
                  <span className="text-slate-600"> · </span>
                  <span className="text-rose-500 dark:text-rose-400">
                    {t("milestone.elapsedShort", { defaultValue: "기간" })}{" "}
                    {elapsed}%
                  </span>
                </span>
              ) : status === "risk" && !m.is_default ? (
                <span className="shrink-0">{dDayLabel(m, today)}</span>
              ) : null}
            </span>
          </span>
        </button>
        <div className="absolute right-1 top-1 z-20">
          {overflowMenu(m, m.id, true)}
        </div>
      </div>
    );
  };

  const legendItems: Array<{ status: MilestoneStatus; label: string }> = [
    {
      status: "done",
      label: t("milestone.statusCompleted", { defaultValue: "완료" }),
    },
    {
      status: "current",
      label: t("milestone.statusInProgress", { defaultValue: "진행" }),
    },
    {
      status: "risk",
      label: t("milestone.statusOverdue", { defaultValue: "지연" }),
    },
    {
      status: "todo",
      label: t("milestone.statusTodo", { defaultValue: "예정" }),
    },
  ];

  return (
    <>
      <MotionModal
        open={isOpen}
        onClose={onClose}
        aria-label={t("milestone.manageTitle", "마일스톤 관리")}
        className="sm:max-w-5xl bg-bridge-dark p-0 overflow-hidden flex flex-col max-h-[90dvh]"
      >
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <Flag className="h-5 w-5 text-bridge-accent" />
          <h2 className="text-sm md:text-lg font-bold text-foreground tracking-tight">
            {t("milestone.manageTitle", "마일스톤 관리")}
          </h2>
          {milestones.length > 0 && (
            <span className="hidden sm:inline text-xs text-slate-500 tabular-nums">
              {t("milestone.headerSummary", {
                defaultValue: "{{count}}개 · 체크리스트 {{pct}}%",
                count: boardSummary.count,
                pct: boardSummary.pct,
              })}
              {boardSummary.risk > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-600 dark:text-amber-400">
                    {t("milestone.statusOverdue", { defaultValue: "지연" })}{" "}
                    {boardSummary.risk}
                  </span>
                </>
              )}
            </span>
          )}
          <IconButton
            onClick={onClose}
            aria-label={t("common.close", { defaultValue: "닫기" })}
            className="ml-auto text-slate-400 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        {/* 메뉴 열림 시 바깥 클릭 닫기용 백드롭 */}
        {menuFor && (
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuFor(null)}
            aria-hidden
          />
        )}

        {/* 모바일: 가로 칩 스트립 */}
        <div className="md:hidden flex items-center gap-1.5 overflow-x-auto border-b border-foreground/[0.08] px-3 py-2 custom-scrollbar">
          {sorted.map((m) => {
            const status = deriveMilestoneStatus(m, today);
            const isSel = milestone?.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => requestSelect(m)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  isSel
                    ? "border-bridge-accent/40 bg-bridge-accent/15 text-bridge-accent"
                    : "border-foreground/10 text-slate-400"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: RING_COLOR[status] }}
                  aria-hidden
                />
                {m.title}
                {status === "current" && (
                  <span className="text-rose-500 dark:text-rose-400 tabular-nums">
                    {dDayLabel(m, today)}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => requestSelect(null)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium ${
              isCreating
                ? "border-bridge-accent text-bridge-accent"
                : "border-foreground/20 text-slate-400"
            }`}
          >
            <Plus className="h-3 w-3" />
            {t("milestone.new", "새 마일스톤")}
          </button>
        </div>

        {/* 좌측 레일 + 우측 패널 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 좌측: 세로 타임라인 레일 (md 이상) */}
          <div className="hidden md:flex w-60 shrink-0 border-r border-foreground/[0.08] flex-col">
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pt-3 pb-1 text-xs text-slate-500">
              {legendItems.map((l) => (
                <span key={l.status} className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: RING_COLOR[l.status] }}
                    aria-hidden
                  />
                  {l.label}
                </span>
              ))}
            </div>
            <div
              ref={railRef}
              tabIndex={0}
              onKeyDown={handleRailKey}
              className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar focus:outline-none"
              aria-label={t("milestone.railAria", {
                defaultValue: "마일스톤 목록. 위아래 화살표로 이동",
              })}
            >
              <div className="relative flex flex-col gap-0.5">
                {/* 세로 스파인 */}
                <div
                  className="absolute top-3 bottom-3 w-px bg-foreground/10"
                  style={{ left: 18 }}
                  aria-hidden
                />
                {railItems.map((it) => {
                  if (it.kind === "today") {
                    return (
                      <div
                        key="__today__"
                        className="relative flex items-center gap-2 py-1 pl-1.5"
                      >
                        <span className="grid w-[22px] place-items-center">
                          <span className="h-0.5 w-3 rounded-full bg-rose-400 ring-2 ring-bridge-dark" />
                        </span>
                        <span className="text-xs font-bold tracking-widest text-rose-500 dark:text-rose-400">
                          TODAY
                        </span>
                      </div>
                    );
                  }
                  if (it.kind === "ghost") {
                    return (
                      <GhostRailNode
                        key="__ghost__"
                        title={title}
                        startDate={startDate}
                        endDate={endDate}
                        newLabel={t("milestone.new", "새 마일스톤")}
                        readyLabel={t("milestone.ghostReady", {
                          defaultValue: "생성 가능",
                        })}
                        needTitleLabel={t("milestone.ghostNeedTitle", {
                          defaultValue: "제목 필요",
                        })}
                        needPeriodLabel={t("milestone.ghostNeedPeriod", {
                          defaultValue: "기간 필요",
                        })}
                        undatedSubLabel={t("milestone.ghostUndated", {
                          defaultValue: "기간 미정 · 맨 끝",
                        })}
                      />
                    );
                  }
                  return renderRailRow(it.m, it.status);
                })}

                {/* 리스트 끝: 새 마일스톤 (편집 중일 때만, 생성 중엔 고스트로 대체) */}
                {isEditMode && (
                  <button
                    type="button"
                    onClick={() => requestSelect(null)}
                    className="mt-1 grid w-full grid-cols-[22px_1fr] items-center gap-2 rounded-lg border border-dashed border-foreground/15 py-2.5 pl-1.5 pr-2 text-left text-slate-400 transition-colors hover:border-bridge-accent hover:bg-bridge-accent/5 hover:text-bridge-accent"
                  >
                    <span className="grid h-[22px] w-[22px] place-items-center justify-self-center rounded-full border border-dashed border-current bg-bridge-dark">
                      <Plus size={13} />
                    </span>
                    <span className="text-sm font-medium">
                      {t("milestone.addNew", { defaultValue: "새 마일스톤" })}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 우측 패널 */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {isEditMode && milestone && selected ? (
              <>
                {/* 상황판 */}
                <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08] space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {titleEditing ? (
                      <input
                        ref={titleInputRef}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={() => setTitleEditing(false)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") {
                            if (e.key === "Escape") setTitle(milestone.title);
                            setTitleEditing(false);
                          }
                        }}
                        placeholder={t("milestone.titlePlaceholder")}
                        className="h-9 w-full max-w-sm bg-foreground/[0.03] border-foreground/10 text-foreground text-base font-bold placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTitleEditing(true)}
                        title={t("milestone.clickToEdit", {
                          defaultValue: "클릭해서 편집",
                        })}
                        className="min-w-0 max-w-full truncate rounded-lg px-1 -mx-1 text-base md:text-lg font-bold text-foreground tracking-tight border-b border-dashed border-transparent hover:border-foreground/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50"
                      >
                        {title || milestone.title}
                      </button>
                    )}
                    {periodTrigger}
                    <div className="ml-auto flex items-center gap-1 relative">
                      {onOpenConsole && (
                        <button
                          type="button"
                          onClick={() => onOpenConsole(milestone.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-foreground/10 bg-foreground/5 px-3 text-xs font-bold text-foreground hover:bg-foreground/10 transition-colors"
                        >
                          {t("milestone.openConsole", {
                            defaultValue: "콘솔 열기",
                          })}
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                        </button>
                      )}
                      {overflowMenu(milestone, "__board__")}
                    </div>
                  </div>

                  {/* KPI */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      {
                        key: "dday",
                        label: t("milestone.kpiDday", {
                          defaultValue: "D-day",
                        }),
                        value:
                          selected.status === "done"
                            ? t("milestone.statusCompleted", {
                                defaultValue: "완료",
                              })
                            : selected.dday,
                        sub: null as string | null,
                        tone:
                          selected.status === "risk" && !milestone.is_default
                            ? "bad"
                            : "",
                        onClick: undefined as (() => void) | undefined,
                      },
                      {
                        key: "features",
                        label: t("milestone.kpiFeatures", {
                          defaultValue: "피처",
                        }),
                        value: String(selected.featureCount),
                        sub:
                          selected.spanning > 0
                            ? t("milestone.kpiSpanning", {
                                defaultValue: "걸침 {{n}}",
                                n: selected.spanning,
                              })
                            : null,
                        tone: "",
                        onClick: undefined,
                      },
                      {
                        key: "items",
                        label: t("milestone.kpiChecklist", {
                          defaultValue: "체크리스트",
                        }),
                        value: String(selected.completedItems),
                        sub: `/ ${selected.totalItems}`,
                        tone: "",
                        onClick: undefined,
                      },
                      {
                        key: "overdue",
                        label: t("milestone.kpiOverdue", {
                          defaultValue: "지연 항목",
                        }),
                        value: String(selected.overdueItems),
                        sub:
                          selected.unassignedItems > 0
                            ? t("milestone.kpiUnassignedSub", {
                                defaultValue: "미배정 {{n}}",
                                n: selected.unassignedItems,
                              })
                            : null,
                        tone: selected.overdueItems > 0 ? "bad" : "",
                        onClick:
                          selected.overdueItems > 0
                            ? () =>
                                setWorkFilter((f) =>
                                  f === "overdue" ? "all" : "overdue",
                                )
                            : undefined,
                      },
                    ].map((k) => {
                      const Tag = k.onClick ? "button" : "div";
                      return (
                        <Tag
                          key={k.key}
                          type={k.onClick ? "button" : undefined}
                          onClick={k.onClick}
                          className={`rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] px-3 py-2 text-left ${
                            k.onClick
                              ? "hover:border-foreground/[0.12] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50"
                              : ""
                          } ${workFilter === "overdue" && k.key === "overdue" ? "ring-2 ring-bridge-accent/50" : ""}`}
                        >
                          <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            {k.label}
                          </div>
                          <div
                            className={`mt-0.5 text-lg font-bold leading-tight tabular-nums ${
                              k.tone === "bad"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-foreground"
                            }`}
                          >
                            {k.value}
                            {k.sub && (
                              <span className="ml-1 text-xs font-medium text-slate-400">
                                {k.sub}
                              </span>
                            )}
                          </div>
                        </Tag>
                      );
                    })}
                  </div>

                  {/* 작업 vs 기간 이중 바 */}
                  <div className="space-y-1">
                    <DualBar
                      work={selected.work}
                      elapsed={selected.elapsed}
                      height="h-1.5"
                    />
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="text-bridge-accent font-medium">
                        {t("milestone.workProgress", {
                          defaultValue: "체크리스트 진행 {{pct}}%",
                          pct: selected.work,
                        })}
                      </span>
                      <span className="text-rose-500 dark:text-rose-400 font-medium">
                        {t("milestone.elapsedProgress", {
                          defaultValue: "기간 경과 {{pct}}%",
                          pct: selected.elapsed,
                        })}
                        {selected.status === "current" &&
                          selected.elapsed - selected.work >= 10 && (
                            <span className="text-slate-500">
                              {" · "}
                              {t("milestone.behindBy", {
                                defaultValue: "{{n}}%p 뒤처짐",
                                n: selected.elapsed - selected.work,
                              })}
                            </span>
                          )}
                      </span>
                    </div>
                  </div>

                  {/* 설명 — 접힌 한 줄, 펼치면 textarea */}
                  {descOpen ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setDescOpen(false)}
                          className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-foreground"
                        >
                          <ChevronDown className="h-3 w-3" />
                          {t("milestone.descriptionLabel")}
                        </button>
                        <IconButton
                          onClick={() => setDescExpanded(true)}
                          aria-label={t("milestone.descriptionExpand", {
                            defaultValue: "크게 보기",
                          })}
                          className="!h-8 !w-8 !min-h-0 !min-w-0 text-slate-400 hover:text-foreground"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                      <Textarea
                        autoFocus
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t("milestone.descriptionPlaceholder")}
                        rows={3}
                        className="w-full bg-foreground/[0.03] border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDescOpen(true)}
                      className="group flex w-full items-center gap-2 rounded-lg -mx-1 px-1 py-0.5 text-left text-xs hover:bg-foreground/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50"
                    >
                      <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
                      {description.trim() ? (
                        <span className="min-w-0 truncate text-slate-400">
                          {description.trim().split("\n")[0]}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {t("milestone.addDescription", {
                            defaultValue: "설명 추가",
                          })}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* 담긴 작업 */}
                <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {t("milestone.containedWork", {
                        defaultValue: "담긴 작업",
                      })}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t("milestone.derivedHint", {
                        defaultValue: "태스크에서 자동 파생",
                      })}
                    </span>
                    {(selected.overdueItems > 0 ||
                      selected.unassignedItems > 0) && (
                      <div className="ml-auto flex items-center gap-1">
                        {(
                          [
                            {
                              key: "all",
                              label: t("common.all", { defaultValue: "전체" }),
                              n: selected.featureCount,
                            },
                            {
                              key: "overdue",
                              label: t("milestone.statusOverdue", {
                                defaultValue: "지연",
                              }),
                              n: selected.overdueItems,
                            },
                            {
                              key: "unassigned",
                              label: t("milestone.unassigned", {
                                defaultValue: "미배정",
                              }),
                              n: selected.unassignedItems,
                            },
                          ] as Array<{
                            key: WorkFilter;
                            label: string;
                            n: number;
                          }>
                        )
                          .filter((f) => f.key === "all" || f.n > 0)
                          .map((f) => (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => setWorkFilter(f.key)}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                                workFilter === f.key
                                  ? "bg-bridge-accent/15 text-bridge-accent"
                                  : "border border-foreground/10 text-slate-400 hover:text-foreground"
                              }`}
                            >
                              {f.label} {f.n}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  {workRows.length > 0 ? (
                    <div className="space-y-0.5">
                      {workRows.map((feature, idx) => {
                        const spans = featureMilestonesMap[feature.id] || [];
                        const spanning = spans.length > 1;
                        const overdue = feature.overdue_items ?? 0;
                        const unassigned = feature.unassigned_items ?? 0;
                        const totalItems = feature.total_items;
                        const completedItems = feature.completed_items;
                        const hasItems = typeof totalItems === "number";
                        const subParts: string[] = [];
                        if (overdue > 0)
                          subParts.push(
                            `${t("milestone.statusOverdue", { defaultValue: "지연" })} ${overdue}`,
                          );
                        if (unassigned > 0)
                          subParts.push(
                            `${t("milestone.unassigned", { defaultValue: "미배정" })} ${unassigned}`,
                          );
                        if (spanning)
                          subParts.push(
                            t("milestone.spanningHint", {
                              defaultValue: "마일스톤 {{list}}에 걸침",
                              list: spans.map((s) => s.order).join("·"),
                            }),
                          );
                        const clickable = !!onOpenFeature;
                        const Row = clickable ? motion.button : motion.div;
                        return (
                          <Row
                            key={feature.id}
                            type={clickable ? "button" : undefined}
                            onClick={
                              clickable
                                ? () => openFeature(feature.id)
                                : undefined
                            }
                            initial={
                              reducedMotion ? false : { opacity: 0, y: 8 }
                            }
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className={`grid w-full grid-cols-[10px_1fr_auto_auto_56px_16px] items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                              clickable
                                ? "hover:bg-foreground/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50"
                                : ""
                            }`}
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: feature.color }}
                              aria-hidden
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-foreground">
                                {feature.title}
                              </span>
                              {subParts.length > 0 && (
                                <span
                                  className={`block truncate text-xs ${
                                    overdue > 0
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-slate-500"
                                  }`}
                                >
                                  {subParts.join(" · ")}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center gap-1">
                              {spanning &&
                                spans.map((ms) => {
                                  const isHere = ms.id === milestone.id;
                                  return (
                                    <span
                                      key={ms.id}
                                      title={ms.title}
                                      className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-md border px-1 text-xs font-bold tabular-nums ${
                                        isHere
                                          ? "border-bridge-accent/50 bg-bridge-accent/15 text-bridge-accent"
                                          : "border-foreground/10 bg-foreground/5 text-slate-400"
                                      }`}
                                    >
                                      {ms.order}
                                    </span>
                                  );
                                })}
                            </span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              {hasItems
                                ? `${completedItems ?? 0}/${totalItems}`
                                : `${feature.completed_tasks}/${feature.total_tasks}`}
                            </span>
                            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-foreground/10">
                              <span
                                className="block h-full rounded-full bg-gradient-to-r from-bridge-secondary to-bridge-accent"
                                style={{
                                  width: `${feature.progress_percentage || 0}%`,
                                }}
                              />
                            </span>
                            <span className="text-slate-500">
                              {clickable && (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </span>
                          </Row>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-6 text-center text-sm text-slate-400">
                      {workFilter !== "all"
                        ? t("milestone.noFilteredWork", {
                            defaultValue: "조건에 맞는 피처가 없습니다.",
                          })
                        : t("milestone.noContainedWork", {
                            defaultValue:
                              "배정된 태스크가 없습니다. 마일스톤 보드·태스크에서 배정하세요.",
                          })}
                    </p>
                  )}
                </div>
              </>
            ) : (
              /* 생성 폼 */
              <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block">
                    {t("milestone.titleLabel")} *
                  </label>
                  <div className="relative">
                    <Input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t("milestone.titlePlaceholder")}
                      className="w-full bg-foreground/[0.03] border-foreground/10 rounded-xl py-3 px-4 pr-11 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      <FieldStatusIcon filled={hasTitle} />
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block">
                    {t("milestone.periodLabel")} *
                  </label>
                  <div className="flex items-center gap-3">
                    {periodTrigger}
                    <FieldStatusIcon filled={hasPeriod} />
                  </div>
                  {neighborHint && (
                    <div className="flex flex-col gap-1">
                      {neighborHint.map((h, i) => (
                        <span
                          key={i}
                          className={`flex items-center gap-1.5 text-xs ${
                            h.kind === "overlap"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-slate-400"
                          }`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {h.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block">
                      {t("milestone.descriptionLabel")}
                    </label>
                    <IconButton
                      onClick={() => setDescExpanded(true)}
                      aria-label={t("milestone.descriptionExpand", {
                        defaultValue: "크게 보기",
                      })}
                      className="!h-8 !w-8 !min-h-0 !min-w-0 text-slate-400 hover:text-foreground"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t("milestone.descriptionPlaceholder")}
                    rows={3}
                    className="w-full bg-foreground/[0.03] border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  />
                </div>
              </div>
            )}

            {/* 푸터 — 편집 모드는 변경이 있을 때만, 생성 모드는 항상 */}
            <AnimatePresence initial={false}>
              {(isCreating || isDirty) && (
                <motion.div
                  key="footer"
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                  className={`flex items-center gap-3 px-5 py-3 border-t border-foreground/[0.08] ${
                    isDirty ? "bg-bridge-accent/[0.06]" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
                    {isCreating ? (
                      !canCreate ? (
                        <>
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bridge-accent" />
                          <span className="truncate">
                            {t("milestone.requiredHint", {
                              defaultValue: "입력 필요",
                            })}
                            {": "}
                            {[
                              !hasTitle && t("milestone.titleLabel"),
                              !hasPeriod && t("milestone.periodLabel"),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-500">
                          {t("milestone.ghostReady", {
                            defaultValue: "생성 가능",
                          })}
                        </span>
                      )
                    ) : (
                      <>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bridge-accent" />
                        <span className="truncate text-bridge-accent font-medium">
                          {t("milestone.changedFields", {
                            defaultValue: "변경 {{n}}",
                            n: changedFields.length,
                          })}
                          <span className="text-slate-400 font-normal">
                            {" · "}
                            {changedFields.join(", ")}
                          </span>
                        </span>
                      </>
                    )}
                    <kbd className="hidden sm:inline-block shrink-0 rounded border border-foreground/10 px-1.5 py-0.5 font-mono text-xs text-slate-500">
                      ⌘S
                    </kbd>
                  </span>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    {isCreating ? (
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={revert}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        {t("milestone.revert", { defaultValue: "되돌리기" })}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={!canSubmit}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
                    >
                      {isSaving && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {isSaving
                        ? t("milestone.saving")
                        : isEditMode
                          ? t("milestone.saveChanges", {
                              defaultValue: "변경 저장",
                            })
                          : t("common.create")}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </MotionModal>

      {/* 설명 전체화면 편집 팝업 (동일 description 상태에 바인딩) */}
      <MotionModal
        open={descExpanded}
        onClose={() => setDescExpanded(false)}
        aria-label={t("milestone.descriptionLabel")}
        className="sm:max-w-3xl bg-bridge-dark p-0 overflow-hidden flex flex-col max-h-[85dvh]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <span className="text-sm font-bold text-foreground">
            {t("milestone.descriptionLabel")}
          </span>
          <IconButton
            onClick={() => setDescExpanded(false)}
            aria-label={t("common.close", { defaultValue: "닫기" })}
            className="text-slate-400 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <Textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("milestone.descriptionPlaceholder")}
            className="w-full h-[60vh] bg-foreground/[0.03] border-foreground/10 rounded-xl p-3 text-sm text-foreground placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          />
        </div>
      </MotionModal>

      {/* 편집 중 다른 마일스톤 전환 시 저장 확인 */}
      <MotionModal
        open={!!pendingSelect}
        onClose={() => setPendingSelect(null)}
        aria-label={t("milestone.unsavedTitle", {
          defaultValue: "저장하지 않은 변경사항",
        })}
        className="sm:max-w-sm bg-bridge-obsidian p-0 overflow-hidden flex flex-col"
      >
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-sm font-bold text-foreground">
            {t("milestone.unsavedTitle", {
              defaultValue: "저장하지 않은 변경사항",
            })}
          </h3>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            {t("milestone.unsavedDesc", {
              defaultValue:
                "이 마일스톤의 변경사항을 저장할까요? 저장하지 않으면 변경 내용이 사라집니다.",
            })}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-foreground/[0.08]">
          <button
            type="button"
            onClick={() => setPendingSelect(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            {t("common.cancel", { defaultValue: "취소" })}
          </button>
          <button
            type="button"
            onClick={discardAndSelect}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors"
          >
            {t("milestone.discardAndMove", { defaultValue: "버리고 이동" })}
          </button>
          <button
            type="button"
            onClick={saveAndSelect}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors disabled:opacity-50"
          >
            {t("common.save", { defaultValue: "저장" })}
          </button>
        </div>
      </MotionModal>

      {/* 삭제 확인 */}
      <MotionModal
        open={!!deleteTarget}
        onClose={() => (isDeleting ? undefined : setDeleteTarget(null))}
        aria-label={t("common.delete")}
        className="sm:max-w-sm bg-bridge-obsidian p-0 overflow-hidden flex flex-col"
      >
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-sm font-bold text-foreground">
            {t("milestone.deleteTitle", {
              defaultValue: "마일스톤을 삭제할까요?",
            })}
          </h3>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">
            <span className="font-medium text-foreground">
              {deleteTarget?.title}
            </span>
            {" — "}
            {t("milestone.deleteConfirm")}
            {(deleteTarget?.features?.length ?? 0) > 0 && (
              <>
                {" "}
                {t("milestone.deleteFeaturesHint", {
                  defaultValue: "피처 {{n}}개의 마일스톤 배정이 해제됩니다.",
                  n: deleteTarget?.features?.length ?? 0,
                })}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-foreground/[0.08]">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            {t("common.cancel", { defaultValue: "취소" })}
          </button>
          <button
            type="button"
            onClick={() => void confirmDelete()}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-500/90 transition-colors disabled:opacity-50"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("common.delete")}
          </button>
        </div>
      </MotionModal>
    </>
  );
}
