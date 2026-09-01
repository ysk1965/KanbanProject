import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Columns3,
  GitBranch,
  AlertTriangle,
  Loader2,
  Layers,
} from "lucide-react";
import type {
  Feature,
  Task,
  Milestone,
  ChecklistItem,
  SprintBoard,
} from "../types";
import { checklistService } from "../utils/services";
import { sprintAPI } from "../utils/api";
import { getMilestoneStatus } from "./MilestoneView";
import { MilestoneTableView } from "./MilestoneTableView";

const UNASSIGNED = "__unassigned__";

// ========================================
// Types
// ========================================

interface MilestoneDetailViewProps {
  boardId: string;
  milestone: Milestone;
  milestones: Milestone[];
  features: Feature[];
  tasks: Task[];
  onBack: () => void;
  onSelectMilestone: (milestoneId: string) => void;
  onEditMilestone?: (milestone: Milestone) => void;
  onTaskClick?: (task: Task) => void;
  onFeatureClick?: (feature: Feature) => void;
  onViewInKanban?: (milestoneId: string) => void;
  /** 테이블 뷰 인라인 편집(태스크/체크 항목 추가, 토글) 허용 */
  canEdit?: boolean;
  /** 테이블 뷰에서 태스크 생성 후 보드 데이터 리로드 */
  onRefresh?: () => void;
}

/** task_id → 스프린트 귀속 정보 (sprint-board API에서 파생) */
export interface TaskSprintInfo {
  status: "ACTIVE" | "ARCHIVED" | null;
  seq: number | null;
  carryOver: number;
  checklistDone: number;
  checklistTotal: number;
}

type GroupMode = "feature" | "sprint";
type LayoutMode = "board" | "table";

/** "YYYY-MM-DD" → "M/D" (타임존 영향 없이 문자열 파싱) */
export function toShortDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const p = dateStr.split("-");
  return p.length < 3 ? dateStr : `${Number(p[1])}/${Number(p[2])}`;
}

/** 오늘 기준 D-day (양수 = 남음, 음수 = 지남). 날짜 문자열만 비교. */
export function daysUntil(dateStr: string): number {
  const end = new Date(`${dateStr.slice(0, 10)}T23:59:59`);
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

// ========================================
// Sub-components
// ========================================

/** 스프린트 귀속 칩 — ACTIVE(틸) / ARCHIVED(회색 ✓) / 백로그(점선) */
export function SprintChip({
  info,
  activeSeq,
}: {
  info: TaskSprintInfo | undefined;
  activeSeq: number | null;
}) {
  const { t } = useTranslation();
  if (info?.status === "ACTIVE") {
    return (
      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary whitespace-nowrap tabular-nums">
        S{info.seq ?? activeSeq ?? "?"}{" "}
        {t("milestone.detail.sprintActive", { defaultValue: "진행 중" })}
      </span>
    );
  }
  if (info?.status === "ARCHIVED") {
    return (
      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-slate-500 whitespace-nowrap tabular-nums">
        S{info.seq ?? "?"} ✓
      </span>
    );
  }
  return (
    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full border border-dashed border-foreground/20 text-slate-500 whitespace-nowrap">
      {t("milestone.detail.backlog", { defaultValue: "백로그" })}
    </span>
  );
}

/** 체크리스트 미니 게이지 */
function ChecklistMeter({ done, total }: { done: number; total: number }) {
  if (total === 0) {
    return <span className="text-xs text-slate-600 tabular-nums">—</span>;
  }
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="flex-1 h-1 rounded-full bg-foreground/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-bridge-secondary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">
        {done}/{total}
      </span>
    </div>
  );
}

/** 태스크 카드 (컬럼 내부) — 클릭 시 체크리스트 인라인 펼침 */
function TaskCard({
  task,
  sprintInfo,
  activeSeq,
  sprintEnabled,
  showFeature,
  expanded,
  checklist,
  checklistLoading,
  onToggle,
  onTitleClick,
}: {
  task: Task;
  sprintInfo: TaskSprintInfo | undefined;
  activeSeq: number | null;
  sprintEnabled: boolean;
  /** 스프린트별 묶기 모드에서 카드에 피처 표시 */
  showFeature?: { title: string; color: string } | null;
  expanded: boolean;
  checklist: ChecklistItem[] | undefined;
  checklistLoading: boolean;
  onToggle: () => void;
  onTitleClick?: () => void;
}) {
  const { t } = useTranslation();
  const clDone = sprintInfo?.checklistTotal
    ? sprintInfo.checklistDone
    : (task.checklist_completed ?? 0);
  const clTotal = sprintInfo?.checklistTotal ?? task.checklist_total ?? 0;
  const dueOver =
    !task.completed && !!task.due_date && daysUntil(task.due_date) < 0;
  const assignees = task.assignees ?? [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter") onToggle();
      }}
      className={`bg-bridge-dark rounded-xl border p-2.5 cursor-pointer transition-colors ${
        expanded
          ? "border-bridge-secondary/35 bg-bridge-secondary/[0.04]"
          : "border-foreground/[0.08] hover:border-foreground/[0.12]"
      } ${task.completed ? "opacity-55" : ""}`}
    >
      {/* 1줄: 상태 + 제목 + 키 */}
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-xs flex-shrink-0 ${
            task.completed ? "text-emerald-500" : "text-slate-400"
          }`}
        >
          {task.completed ? "✓" : clDone > 0 ? "◐" : "○"}
        </span>
        <span
          onClick={(e) => {
            if (!onTitleClick) return;
            e.stopPropagation();
            onTitleClick();
          }}
          className={`text-xs font-medium min-w-0 break-words ${
            task.completed ? "text-slate-500 line-through" : "text-foreground"
          }${onTitleClick ? " hover:text-bridge-accent hover:underline" : ""}`}
        >
          {task.title}
        </span>
        {task.task_key && (
          <span className="text-xs text-slate-600 ml-auto flex-shrink-0 tabular-nums">
            {task.task_key}
          </span>
        )}
      </div>

      {/* 2줄: 스프린트 칩 + 이월 + 마감 (+ 피처, 스프린트 모드) */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {showFeature && (
          <span className="flex items-center gap-1 text-xs text-slate-400 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: showFeature.color }}
            />
            <span className="truncate max-w-[110px]">{showFeature.title}</span>
          </span>
        )}
        {sprintEnabled && !showFeature && (
          <SprintChip info={sprintInfo} activeSeq={activeSeq} />
        )}
        {(sprintInfo?.carryOver ?? 0) > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap">
            {t("milestone.detail.carryOver", {
              count: sprintInfo!.carryOver,
              defaultValue: "이월 {{count}}",
            })}
          </span>
        )}
        {task.due_date && (
          <span
            className={`text-xs tabular-nums ml-auto whitespace-nowrap ${
              dueOver ? "font-bold text-red-500" : "text-slate-500"
            }`}
          >
            {task.completed
              ? `${toShortDate(task.due_date)} ✓`
              : `~${toShortDate(task.due_date)}`}
          </span>
        )}
      </div>

      {/* 3줄: 체크리스트 게이지 + 담당자 */}
      <div className="flex items-center gap-2 mt-2">
        <ChecklistMeter done={clDone} total={clTotal} />
        {assignees.length > 0 && (
          <span className="text-xs text-slate-500 flex-shrink-0 truncate max-w-[96px]">
            {assignees[0].name}
            {assignees.length > 1 && ` +${assignees.length - 1}`}
          </span>
        )}
      </div>

      {/* 펼침: 체크리스트 항목 */}
      {expanded && (
        <div
          className="mt-2.5 pt-2 border-t border-dashed border-foreground/10 space-y-1"
          onClick={(e) => e.stopPropagation()}
        >
          {checklistLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
            </div>
          ) : !checklist || checklist.length === 0 ? (
            <div className="text-xs text-slate-600 py-1">
              {t("milestone.detail.noChecklist", {
                defaultValue: "체크리스트가 없습니다",
              })}
            </div>
          ) : (
            checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded flex-shrink-0 border flex items-center justify-center text-xs leading-none ${
                    item.completed
                      ? "bg-bridge-secondary/20 border-bridge-secondary text-bridge-secondary"
                      : "border-foreground/25"
                  }`}
                >
                  {item.completed ? "✓" : ""}
                </span>
                <span
                  className={`text-xs min-w-0 truncate ${
                    item.completed
                      ? "text-slate-500 line-through"
                      : "text-foreground/80"
                  }`}
                >
                  {item.title}
                </span>
                <span
                  className={`text-xs ml-auto flex-shrink-0 ${
                    item.assignee
                      ? "text-slate-500"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {item.assignee?.name ??
                    t("milestone.detail.unassigned", {
                      defaultValue: "미배정",
                    })}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ========================================
// Main
// ========================================

/**
 * 마일스톤 상세 (풀 페이지) — 컬럼 = 피처(또는 스프린트), 카드 = 태스크.
 * 진실은 task.milestone_id — 집계는 전부 프론트 파생.
 * 스프린트 칩/이월은 마일스톤 단위 sprint-board API에서 task_id로 조인.
 */
export function MilestoneDetailView({
  boardId,
  milestone,
  milestones,
  features,
  tasks,
  onBack,
  onSelectMilestone,
  onEditMilestone,
  onTaskClick,
  onFeatureClick,
  onViewInKanban,
  canEdit = false,
  onRefresh,
}: MilestoneDetailViewProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();

  const [groupMode, setGroupMode] = useState<GroupMode>("feature");
  // 레이아웃: 보드(컬럼) ↔ 테이블. 보드별 localStorage 영속화.
  const layoutKey = `milestoneDetailLayout_${boardId}`;
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window === "undefined") return "board";
    return localStorage.getItem(layoutKey) === "table" ? "table" : "board";
  });
  const changeLayout = useCallback(
    (mode: LayoutMode) => {
      setLayoutMode(mode);
      try {
        localStorage.setItem(layoutKey, mode);
      } catch {
        /* ignore */
      }
    },
    [layoutKey],
  );
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [showAllColumns, setShowAllColumns] = useState<Set<string>>(new Set());
  const [checklistCache, setChecklistCache] = useState<{
    [taskId: string]: { items: ChecklistItem[]; loading: boolean };
  }>({});
  const [sprintBoard, setSprintBoard] = useState<SprintBoard | null>(null);

  const mid = milestone.id;

  // 마일스톤 전환 시 로컬 상태 초기화
  useEffect(() => {
    setExpandedTasks(new Set());
    setShowAllColumns(new Set());
    setSwitcherOpen(false);
    setSprintBoard(null);
  }, [mid]);

  // 스프린트 보드(칩·이월 데이터) + 인원 배분 로드 — 실패해도 화면은 동작
  useEffect(() => {
    let cancelled = false;
    sprintAPI
      .getSprintBoard(boardId, mid)
      .then((data) => {
        if (!cancelled) setSprintBoard(data);
      })
      .catch(() => {
        /* 스프린트 미사용/실패 → 칩 숨김 */
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, mid]);

  const sortedMilestones = useMemo(
    () =>
      [...milestones].sort(
        (a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      ),
    [milestones],
  );
  const msIndex = sortedMilestones.findIndex((m) => m.id === mid);
  const prevMs = msIndex > 0 ? sortedMilestones[msIndex - 1] : null;
  const nextMs =
    msIndex >= 0 && msIndex < sortedMilestones.length - 1
      ? sortedMilestones[msIndex + 1]
      : null;

  // 키보드: ←/→ 마일스톤 전환, Esc 복귀 (입력 필드에선 무시)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "Escape") onBack();
      else if (e.key === "ArrowLeft" && prevMs) onSelectMilestone(prevMs.id);
      else if (e.key === "ArrowRight" && nextMs) onSelectMilestone(nextMs.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBack, onSelectMilestone, prevMs, nextMs]);

  // ── 마일스톤 스코프 집계 (진실 = task.milestone_id) ──
  // JIRA 연동 태스크(jira_issue_key 보유)는 디테일 뷰에서 제외 — 테이블·보드 컬럼·헤더 집계 공통
  const scopedTasks = useMemo(
    () => tasks.filter((tk) => tk.milestone_id === mid && !tk.jira_issue_key),
    [tasks, mid],
  );
  const scopedTotal = scopedTasks.length;
  const scopedCompleted = useMemo(
    () => scopedTasks.filter((tk) => tk.completed).length,
    [scopedTasks],
  );
  const scopedPct =
    scopedTotal > 0 ? Math.round((scopedCompleted / scopedTotal) * 100) : 0;
  // 히어로 메타용 피처 수 — 그룹 모드와 무관하게 이 마일스톤에 걸친 피처 기준
  const scopedFeatureCount = useMemo(
    () => new Set(scopedTasks.map((tk) => tk.feature_id)).size,
    [scopedTasks],
  );

  // featureId → (milestoneKey → count) — 갈래·유입/유출 파생용 (전체 태스크 기준)
  const grid = useMemo(() => {
    const map = new Map<
      string,
      Map<string, { total: number; completed: number }>
    >();
    for (const tk of tasks) {
      if (!map.has(tk.feature_id)) map.set(tk.feature_id, new Map());
      const inner = map.get(tk.feature_id)!;
      const key = tk.milestone_id ?? UNASSIGNED;
      const s = inner.get(key) ?? { total: 0, completed: 0 };
      s.total += 1;
      if (tk.completed) s.completed += 1;
      inner.set(key, s);
    }
    return map;
  }, [tasks]);

  // featureId → 홈 마일스톤 (태스크 최다, 동률 → 앞선 것) — MilestoneBoard와 동일 규칙
  const homeByFeature = useMemo(() => {
    const result = new Map<string, string>();
    for (const [featureId, inner] of grid) {
      let bestKey = UNASSIGNED;
      let bestCount = 0;
      for (const ms of sortedMilestones) {
        const s = inner.get(ms.id);
        if (s && s.total > bestCount) {
          bestCount = s.total;
          bestKey = ms.id;
        }
      }
      result.set(featureId, bestCount === 0 ? UNASSIGNED : bestKey);
    }
    return result;
  }, [grid, sortedMilestones]);

  const featureById = useMemo(() => {
    const m = new Map<string, Feature>();
    for (const f of features) m.set(f.id, f);
    return m;
  }, [features]);

  const milestoneTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const ms of sortedMilestones) m.set(ms.id, ms.title);
    return m;
  }, [sortedMilestones]);

  // ── 스프린트 조인 맵 ──
  const sprintEnabled = sprintBoard?.sprint_enabled ?? false;
  const activeSeq = sprintBoard?.active_sprint?.sequence_no ?? null;
  const sprintInfoByTask = useMemo(() => {
    const map = new Map<string, TaskSprintInfo>();
    if (!sprintBoard) return map;
    const put = (item: {
      task_id: string | null;
      sprint_status?: "ACTIVE" | "ARCHIVED" | null;
      sprint_seq?: number | null;
      carry_over_count?: number;
      checklist_done: number;
      checklist_total: number;
    }) => {
      if (!item.task_id) return;
      map.set(item.task_id, {
        status: item.sprint_status ?? null,
        seq: item.sprint_seq ?? null,
        carryOver: item.carry_over_count ?? 0,
        checklistDone: item.checklist_done,
        checklistTotal: item.checklist_total,
      });
    };
    for (const col of sprintBoard.columns) col.items.forEach(put);
    sprintBoard.backlog.forEach(put);
    return map;
  }, [sprintBoard]);

  // ── 컬럼 구성 ──
  interface Column {
    key: string;
    title: string;
    color: string | null;
    tasks: Task[];
    completed: number;
    /** 피처 모드 전용 부가 배지 */
    splitCount?: number;
    splitLabel?: string;
    unassignedCount?: number;
    feature?: Feature;
  }

  const columns = useMemo<Column[]>(() => {
    if (groupMode === "sprint" && sprintEnabled) {
      // 컬럼 = 스프린트 (지난 회차 ✓ → 진행 중 → 백로그)
      const buckets = new Map<string, Task[]>();
      for (const tk of scopedTasks) {
        const info = sprintInfoByTask.get(tk.id);
        const key =
          info?.status === "ACTIVE"
            ? "active"
            : info?.status === "ARCHIVED"
              ? `arch-${info.seq ?? 0}`
              : "backlog";
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(tk);
      }
      const archSeqs = [...buckets.keys()]
        .filter((k) => k.startsWith("arch-"))
        .map((k) => Number(k.slice(5)))
        .sort((a, b) => a - b);
      const cols: Column[] = [];
      for (const seq of archSeqs) {
        const list = buckets.get(`arch-${seq}`)!;
        cols.push({
          key: `arch-${seq}`,
          title: `S${seq} ✓`,
          color: null,
          tasks: list,
          completed: list.filter((tk) => tk.completed).length,
        });
      }
      if (buckets.has("active")) {
        const list = buckets.get("active")!;
        cols.push({
          key: "active",
          title: `S${activeSeq ?? "?"} · ${t("milestone.detail.sprintActive", { defaultValue: "진행 중" })}`,
          color: null,
          tasks: list,
          completed: list.filter((tk) => tk.completed).length,
        });
      }
      if (buckets.has("backlog")) {
        const list = buckets.get("backlog")!;
        cols.push({
          key: "backlog",
          title: t("milestone.detail.backlog", { defaultValue: "백로그" }),
          color: null,
          tasks: list,
          completed: list.filter((tk) => tk.completed).length,
        });
      }
      return cols;
    }

    // 컬럼 = 피처 (완료율 높은 순)
    const byFeature = new Map<string, Task[]>();
    for (const tk of scopedTasks) {
      if (!byFeature.has(tk.feature_id)) byFeature.set(tk.feature_id, []);
      byFeature.get(tk.feature_id)!.push(tk);
    }
    const cols: Column[] = [];
    for (const [featureId, list] of byFeature) {
      const feature = featureById.get(featureId);
      const completed = list.filter((tk) => tk.completed).length;
      // 갈래: 이 피처의 태스크가 다른 마일스톤/미배정에 얼마나 걸쳤나
      let splitCount = 0;
      let splitLabel = "";
      let unassignedCount = 0;
      const inner = grid.get(featureId);
      if (inner) {
        let bestSplit = 0;
        for (const [k, s] of inner) {
          if (k === mid) continue;
          if (k === UNASSIGNED) {
            unassignedCount += s.total;
          } else {
            splitCount += s.total;
            if (s.total > bestSplit) {
              bestSplit = s.total;
              splitLabel = milestoneTitleById.get(k) ?? "";
            }
          }
        }
      }
      cols.push({
        key: featureId,
        title: feature?.title ?? list[0]?.feature_title ?? "",
        color: feature?.color ?? list[0]?.feature_color ?? null,
        tasks: list,
        completed,
        splitCount,
        splitLabel,
        unassignedCount,
        feature,
      });
    }
    cols.sort((a, b) => {
      const pa = a.tasks.length > 0 ? a.completed / a.tasks.length : 0;
      const pb = b.tasks.length > 0 ? b.completed / b.tasks.length : 0;
      return pb - pa || b.tasks.length - a.tasks.length;
    });
    return cols;
  }, [
    groupMode,
    sprintEnabled,
    scopedTasks,
    sprintInfoByTask,
    activeSeq,
    featureById,
    grid,
    mid,
    milestoneTitleById,
    t,
  ]);

  // ── 태스크 카드 인터랙션 ──
  const toggleTask = useCallback(
    (taskId: string) => {
      setExpandedTasks((prev) => {
        const next = new Set(prev);
        if (next.has(taskId)) {
          next.delete(taskId);
        } else {
          next.add(taskId);
        }
        return next;
      });
      if (!checklistCache[taskId] && !expandedTasks.has(taskId)) {
        setChecklistCache((prev) => ({
          ...prev,
          [taskId]: { items: [], loading: true },
        }));
        checklistService
          .getChecklist(boardId, taskId)
          .then((res) => {
            setChecklistCache((prev) => ({
              ...prev,
              [taskId]: { items: res.items, loading: false },
            }));
          })
          .catch(() => {
            setChecklistCache((prev) => ({
              ...prev,
              [taskId]: { items: [], loading: false },
            }));
          });
      }
    },
    [boardId, checklistCache, expandedTasks],
  );

  const toggleShowAll = useCallback((colKey: string) => {
    setShowAllColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) {
        next.delete(colKey);
      } else {
        next.add(colKey);
      }
      return next;
    });
  }, []);

  // ── 헤더 파생값 ──
  // 진행률 = 스코프 태스크들의 체크리스트 완료 합계 기준 (체크리스트가 없으면 태스크 완료 폴백)
  const clDone = scopedTasks.reduce(
    (acc, tk) => acc + (tk.checklist_completed ?? 0),
    0,
  );
  const clTotal = scopedTasks.reduce(
    (acc, tk) => acc + (tk.checklist_total ?? 0),
    0,
  );
  const progressDone = clTotal > 0 ? clDone : scopedCompleted;
  const progressTotal = clTotal > 0 ? clTotal : scopedTotal;
  const progressPct =
    progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;

  const status = getMilestoneStatus(
    milestone.start_date,
    milestone.end_date,
    scopedTotal > 0 ? progressPct : milestone.progress_percentage,
    milestone.is_default,
  );
  const dday = daysUntil(milestone.end_date);
  const start = new Date(milestone.start_date).getTime();
  const end = new Date(milestone.end_date).getTime();
  const timePct =
    end > start
      ? Math.min(
          100,
          Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)),
        )
      : 100;
  const paceDelta = progressPct - timePct;

  const statusLabel =
    status.key === "completed"
      ? t("milestone.statusCompleted")
      : status.key === "waiting"
        ? t("milestone.statusWaiting")
        : status.key === "overdue"
          ? t("schedule.overdue", { defaultValue: "Overdue" })
          : t("milestone.statusInProgress");

  const TASK_LIMIT = 6;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* ── 한 줄 헤더 바: 스위처(=제목) · 상태 · 기간 · 진행(체크리스트 기준) · 액션 ── */}
      <div className="flex items-center gap-3 flex-wrap bg-bridge-obsidian border border-foreground/[0.08] rounded-2xl px-3 py-2">
        {/* 마일스톤 스위처 = 제목 */}
        <div className="relative flex items-center gap-0.5 bg-bridge-dark border border-foreground/10 rounded-xl p-0.5">
          <button
            onClick={() => prevMs && onSelectMilestone(prevMs.id)}
            disabled={!prevMs}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/[0.07] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            aria-label={t("milestone.detail.prevMilestone", {
              defaultValue: "이전 마일스톤",
            })}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            title={milestone.description || undefined}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs md:text-sm font-bold text-foreground hover:bg-foreground/[0.07] transition-colors"
            aria-expanded={switcherOpen}
          >
            <span className="truncate max-w-[200px]">{milestone.title}</span>
            <ChevronDown className="h-3 w-3 text-slate-500" />
          </button>
          <button
            onClick={() => nextMs && onSelectMilestone(nextMs.id)}
            disabled={!nextMs}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/[0.07] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            aria-label={t("milestone.detail.nextMilestone", {
              defaultValue: "다음 마일스톤",
            })}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          {/* 점프 드롭다운 */}
          {switcherOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setSwitcherOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1.5 z-40 w-60 max-h-72 overflow-y-auto custom-scrollbar bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1.5">
                {sortedMilestones.map((ms) => (
                  <button
                    key={ms.id}
                    onClick={() => {
                      onSelectMilestone(ms.id);
                      setSwitcherOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                      ms.id === mid
                        ? "text-bridge-accent font-bold bg-bridge-accent/10"
                        : "text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    <span className="truncate flex-1">{ms.title}</span>
                    <span className="text-slate-500 tabular-nums flex-shrink-0">
                      {Math.round(ms.progress_percentage)}%
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span
          className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${status.badgeClasses}`}
        >
          {statusLabel}
        </span>
        {status.key !== "completed" && (
          <span
            className={`text-xs font-bold tabular-nums ${
              dday < 0 ? "text-red-500" : "text-slate-400"
            }`}
          >
            {dday < 0 ? `D+${-dday}` : dday === 0 ? "D-DAY" : `D-${dday}`}
          </span>
        )}
        <span className="hidden md:inline text-xs text-slate-400 tabular-nums whitespace-nowrap">
          {toShortDate(milestone.start_date)}~{toShortDate(milestone.end_date)}{" "}
          ·{" "}
          {t("milestone.detail.featureCount", {
            count: scopedFeatureCount,
            defaultValue: "피처 {{count}}개",
          })}{" "}
          ·{" "}
          {t("milestone.detail.taskCount", {
            count: scopedTotal,
            defaultValue: "태스크 {{count}}개",
          })}
        </span>

        {/* 진행 막대 (체크리스트 기준) + 오늘 마커 */}
        <div
          className="relative flex-1 min-w-[120px] h-1.5 rounded-full bg-foreground/10"
          title={t("milestone.detail.timeElapsed", {
            pct: timePct,
            defaultValue: "기간 경과 {{pct}}%",
          })}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-bridge-accent"
            style={{ width: `${progressPct}%` }}
          />
          {status.key !== "waiting" && (
            <div
              className={`absolute -top-1 -bottom-1 w-0.5 rounded ${
                status.key === "overdue" ? "bg-red-500" : "bg-bridge-secondary"
              }`}
              style={{ left: `calc(${timePct}% - 1px)` }}
              title={t("milestone.detail.todayMarker", {
                defaultValue: "오늘 (기간 경과)",
              })}
            />
          )}
        </div>
        <span
          className="text-xs text-slate-400 tabular-nums whitespace-nowrap"
          title={t("milestone.detail.progressByChecklist", {
            defaultValue: "체크리스트 완료 기준",
          })}
        >
          <b className="text-sm text-foreground font-bold">{progressPct}%</b> ·{" "}
          {progressDone}/{progressTotal}
        </span>
        {status.key !== "completed" && status.key !== "waiting" && (
          <span
            className={`text-xs font-bold tabular-nums whitespace-nowrap ${
              paceDelta >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : paceDelta > -15
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-500"
            }`}
          >
            {paceDelta >= 0
              ? t("milestone.detail.paceAhead", { defaultValue: "순항 중" })
              : t("milestone.detail.paceBehind", {
                  delta: -paceDelta,
                  defaultValue: "페이스 {{delta}}%p 부족",
                })}
          </span>
        )}

        {onViewInKanban && (
          <button
            onClick={() => onViewInKanban(mid)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all"
          >
            <Columns3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {t("milestone.detail.viewInKanban", {
                defaultValue: "칸반에서 보기",
              })}
            </span>
          </button>
        )}
        {onEditMilestone && (
          <button
            onClick={() => onEditMilestone(milestone)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            aria-label={t("common.edit", { defaultValue: "수정" })}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── 피처/스프린트 컬럼 밴드 ── */}
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-foreground/[0.04] border-b border-foreground/[0.06]">
          <span className="text-xs md:text-sm font-bold text-foreground">
            {layoutMode === "table"
              ? t("milestone.table.title", {
                  defaultValue: "피처 · 태스크 · 체크리스트",
                })
              : groupMode === "sprint"
                ? t("milestone.detail.bySprintTitle", {
                    defaultValue: "스프린트별 진행 · 이 마일스톤 기준",
                  })
                : t("milestone.detail.byFeatureTitle", {
                    defaultValue: "피처별 진행 · 이 마일스톤 기준",
                  })}
          </span>
          <div className="flex items-center gap-2">
            {layoutMode === "board" && sprintEnabled && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/5 border border-foreground/[0.08]">
                <button
                  onClick={() => setGroupMode("feature")}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    groupMode === "feature"
                      ? "bg-bridge-accent text-white font-bold"
                      : "text-slate-400 hover:text-foreground"
                  }`}
                >
                  {t("milestone.detail.byFeature", {
                    defaultValue: "피처별",
                  })}
                </button>
                <button
                  onClick={() => setGroupMode("sprint")}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    groupMode === "sprint"
                      ? "bg-bridge-accent text-white font-bold"
                      : "text-slate-400 hover:text-foreground"
                  }`}
                >
                  {t("milestone.detail.bySprint", {
                    defaultValue: "스프린트별",
                  })}
                </button>
              </div>
            )}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/5 border border-foreground/[0.08]">
              <button
                onClick={() => changeLayout("board")}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  layoutMode === "board"
                    ? "bg-bridge-accent text-white font-bold"
                    : "text-slate-400 hover:text-foreground"
                }`}
              >
                {t("milestone.table.layoutBoard", { defaultValue: "보드" })}
              </button>
              <button
                onClick={() => changeLayout("table")}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  layoutMode === "table"
                    ? "bg-bridge-accent text-white font-bold"
                    : "text-slate-400 hover:text-foreground"
                }`}
              >
                {t("milestone.table.layoutTable", {
                  defaultValue: "테이블",
                })}
              </button>
            </div>
          </div>
        </div>

        {layoutMode === "table" ? (
          <MilestoneTableView
            boardId={boardId}
            milestone={milestone}
            tasks={scopedTasks}
            featureById={featureById}
            homeByFeature={homeByFeature}
            sprintInfoByTask={sprintInfoByTask}
            activeSeq={activeSeq}
            sprintEnabled={sprintEnabled}
            canEdit={canEdit}
            onTaskClick={onTaskClick}
            onFeatureClick={onFeatureClick}
            onRefresh={onRefresh}
          />
        ) : scopedTotal === 0 ? (
          <div className="flex flex-col items-center py-12 text-slate-500">
            <Layers className="h-6 w-6 mb-2" />
            <span className="text-xs">
              {t("milestone.detail.noTasks", {
                defaultValue: "이 마일스톤에 배정된 태스크가 없습니다",
              })}
            </span>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto custom-scrollbar p-3 items-start">
            {columns.map((col, index) => {
              const pct =
                col.tasks.length > 0
                  ? Math.round((col.completed / col.tasks.length) * 100)
                  : 0;
              const showAll = showAllColumns.has(col.key);
              const sorted = [...col.tasks].sort((a, b) => {
                if (a.completed !== b.completed)
                  return Number(a.completed) - Number(b.completed);
                return (
                  (a.feature_position ?? a.position) -
                  (b.feature_position ?? b.position)
                );
              });
              const visible = showAll ? sorted : sorted.slice(0, TASK_LIMIT);
              return (
                <motion.div
                  key={col.key}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="flex-shrink-0 w-72 bg-foreground/[0.02] border border-foreground/[0.06] rounded-xl p-2.5 space-y-2"
                >
                  {/* 컬럼 헤더 */}
                  <div className="px-1 pb-2 border-b border-foreground/[0.07]">
                    <div
                      className={`flex items-center gap-2${
                        col.feature && onFeatureClick
                          ? " cursor-pointer group/fh"
                          : ""
                      }`}
                      onClick={
                        col.feature && onFeatureClick
                          ? () => onFeatureClick(col.feature!)
                          : undefined
                      }
                    >
                      {col.color && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: col.color }}
                        />
                      )}
                      <span className="text-xs font-bold text-foreground truncate flex-1 group-hover/fh:text-bridge-accent transition-colors">
                        {col.title}
                      </span>
                      <span className="text-xs font-bold text-foreground tabular-nums flex-shrink-0">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-foreground/10 overflow-hidden mt-2">
                      <div
                        className="h-full rounded-full bg-bridge-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {(col.splitCount ?? 0) > 0 && (
                        <span
                          className="flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent whitespace-nowrap"
                          title={t("milestone.board.splitTip", {
                            defaultValue: "다른 마일스톤으로 갈라진 태스크",
                          })}
                        >
                          <GitBranch className="h-3 w-3" />
                          {col.splitCount}
                          {col.splitLabel && ` → ${col.splitLabel}`}
                        </span>
                      )}
                      {(col.unassignedCount ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          <AlertTriangle className="h-3 w-3" />
                          {col.unassignedCount}
                        </span>
                      )}
                      <span className="text-xs text-slate-500 tabular-nums ml-auto">
                        {col.completed}/{col.tasks.length}
                      </span>
                    </div>
                  </div>

                  {/* 태스크 카드 */}
                  {visible.map((tk) => {
                    const cached = checklistCache[tk.id];
                    return (
                      <TaskCard
                        key={tk.id}
                        task={tk}
                        sprintInfo={sprintInfoByTask.get(tk.id)}
                        activeSeq={activeSeq}
                        sprintEnabled={sprintEnabled}
                        showFeature={
                          groupMode === "sprint"
                            ? {
                                title:
                                  featureById.get(tk.feature_id)?.title ??
                                  tk.feature_title,
                                color:
                                  featureById.get(tk.feature_id)?.color ??
                                  tk.feature_color,
                              }
                            : null
                        }
                        expanded={expandedTasks.has(tk.id)}
                        checklist={cached?.items}
                        checklistLoading={cached?.loading ?? false}
                        onToggle={() => toggleTask(tk.id)}
                        onTitleClick={
                          onTaskClick ? () => onTaskClick(tk) : undefined
                        }
                      />
                    );
                  })}
                  {sorted.length > TASK_LIMIT && (
                    <button
                      onClick={() => toggleShowAll(col.key)}
                      className="w-full text-left px-1.5 py-1 text-xs text-slate-500 hover:text-foreground transition-colors"
                    >
                      {showAll
                        ? t("milestone.detail.showLess", {
                            defaultValue: "접기",
                          })
                        : t("milestone.detail.showMore", {
                            count: sorted.length - TASK_LIMIT,
                            defaultValue: "외 {{count}}개 모두 보기",
                          })}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
