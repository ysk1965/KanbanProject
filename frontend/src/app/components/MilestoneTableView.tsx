import {
  Fragment,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  Download,
  GripVertical,
  Loader2,
  Plus,
} from "lucide-react";
import type { ChecklistItem, Feature, Milestone, Task } from "../types";
import { checklistService, taskService } from "../utils/services";
import { checklistAPI } from "../utils/api";
import {
  SprintChip,
  toShortDate,
  daysUntil,
  type TaskSprintInfo,
} from "./MilestoneDetailView";

// ========================================
// Types
// ========================================

interface MilestoneTableViewProps {
  boardId: string;
  milestone: Milestone;
  /** 이 마일스톤 스코프의 태스크 (진실 = task.milestone_id) */
  tasks: Task[];
  featureById: Map<string, Feature>;
  /** featureId → 홈 마일스톤 id — "기본 마일스톤" 태그 표시용 */
  homeByFeature: Map<string, string>;
  sprintInfoByTask: Map<string, TaskSprintInfo>;
  activeSeq: number | null;
  sprintEnabled: boolean;
  canEdit: boolean;
  onTaskClick?: (task: Task) => void;
  onFeatureClick?: (feature: Feature) => void;
  /** 태스크 생성 후 보드 데이터 리로드 */
  onRefresh?: () => void;
}

type StatusFilter = "all" | "doing" | "open" | "sprint";
type TaskStatus = "done" | "doing" | "todo";

interface ChecklistState {
  items: ChecklistItem[];
  loaded: boolean;
}

/** CSV 필드 이스케이프 — 항상 따옴표로 감싼다 */
function csvField(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * batch 응답 정규화 — 서비스 타입 선언과 달리 실제 응답은
 * { checklists: [{ task_id, items }] } 배열이다 (useBoardDataLoader의
 * parseChecklistBatch와 동일 처리). 맵 형태가 와도 동작하도록 겸용.
 */
function parseBatchChecklists(res: unknown): {
  [taskId: string]: ChecklistItem[];
} {
  const map: { [taskId: string]: ChecklistItem[] } = {};
  const groups = (res as { checklists?: unknown } | null)?.checklists;
  if (Array.isArray(groups)) {
    for (const g of groups as Array<{
      task_id?: string;
      taskId?: string;
      items?: ChecklistItem[];
    }>) {
      const taskId = g.task_id ?? g.taskId;
      if (taskId && Array.isArray(g.items)) map[taskId] = g.items;
    }
    return map;
  }
  // 폴백: {[taskId]: {items}} 맵 형태
  if (res && typeof res === "object") {
    for (const [taskId, group] of Object.entries(
      res as { [taskId: string]: { items?: ChecklistItem[] } },
    )) {
      if (Array.isArray(group?.items)) map[taskId] = group.items;
    }
  }
  return map;
}

// ========================================
// Main
// ========================================

/**
 * 마일스톤 상세 테이블 뷰 — 피처(세로 병합) | 태스크 | 체크리스트(항목별 담당자).
 * 체크리스트는 batch API로 일괄 로드, 인라인 추가/토글은 기존 엔드포인트 재사용.
 */
export function MilestoneTableView({
  boardId,
  milestone,
  tasks,
  featureById,
  homeByFeature,
  sprintInfoByTask,
  activeSeq,
  sprintEnabled,
  canEdit,
  onTaskClick,
  onFeatureClick,
  onRefresh,
}: MilestoneTableViewProps) {
  const { t } = useTranslation();
  const mid = milestone.id;

  const [checklists, setChecklists] = useState<{
    [taskId: string]: ChecklistState;
  }>({});
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  /** 인라인 입력 활성 위치 — 태스크 추가(featureId) / 항목 추가(taskId) */
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const addInputRef = useRef<HTMLInputElement | null>(null);

  // 마일스톤 전환 시 필터·입력 초기화
  useEffect(() => {
    setStatusFilter("all");
    setAssigneeFilter(null);
    setAssigneeOpen(false);
    setAddingTaskFor(null);
    setAddingItemFor(null);
  }, [mid]);

  // 체크리스트 일괄 로드 — 새 태스크(미로드)만 추가 요청
  useEffect(() => {
    const missing = tasks.filter((tk) => !checklists[tk.id]).map((tk) => tk.id);
    if (missing.length === 0) return;
    let cancelled = false;
    setChecklistsLoading(true);
    checklistService
      .getBatchChecklists(boardId, missing)
      .then((res) => {
        if (cancelled) return;
        const byTask = parseBatchChecklists(res);
        setChecklists((prev) => {
          const next = { ...prev };
          for (const id of missing) {
            next[id] = { items: byTask[id] ?? [], loaded: true };
          }
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setChecklists((prev) => {
          const next = { ...prev };
          for (const id of missing) {
            next[id] = next[id] ?? { items: [], loaded: false };
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setChecklistsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // checklists를 deps에 넣으면 setChecklists 직후 재실행되므로 tasks 기준으로만 감지한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, mid, tasks]);

  // 인라인 입력 포커스
  useEffect(() => {
    if (addingTaskFor || addingItemFor) addInputRef.current?.focus();
  }, [addingTaskFor, addingItemFor]);

  // 체크리스트 드래그 정렬 센서 (TaskDetailModal과 동일 설정)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ── 파생값 ──
  const itemsOf = useCallback(
    (taskId: string): ChecklistItem[] =>
      [...(checklists[taskId]?.items ?? [])].sort(
        (a, b) => a.position - b.position,
      ),
    [checklists],
  );

  const statusOf = useCallback(
    (tk: Task): TaskStatus => {
      if (tk.completed) return "done";
      const state = checklists[tk.id];
      const done = state?.loaded
        ? state.items.filter((i) => i.completed).length
        : (tk.checklist_completed ?? 0);
      return done > 0 ? "doing" : "todo";
    },
    [checklists],
  );

  /** 담당자 필터 후보 — 태스크 담당자 합집합 + 체크리스트 담당자 */
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const tk of tasks) {
      for (const a of tk.assignees ?? []) map.set(a.id, a.name);
      for (const item of checklists[tk.id]?.items ?? []) {
        if (item.assignee) map.set(item.assignee.id, item.assignee.name);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, checklists]);

  const taskMatches = useCallback(
    (tk: Task): boolean => {
      if (statusFilter === "doing" && statusOf(tk) !== "doing") return false;
      if (statusFilter === "open" && tk.completed) return false;
      if (
        statusFilter === "sprint" &&
        sprintInfoByTask.get(tk.id)?.status !== "ACTIVE"
      )
        return false;
      if (assigneeFilter) {
        const inTask = (tk.assignees ?? []).some(
          (a) => a.id === assigneeFilter,
        );
        const inChecklist = (checklists[tk.id]?.items ?? []).some(
          (i) => i.assignee?.id === assigneeFilter,
        );
        if (!inTask && !inChecklist) return false;
      }
      return true;
    },
    [statusFilter, assigneeFilter, statusOf, sprintInfoByTask, checklists],
  );

  /** 피처 그룹 — 완료율 높은 순 (보드 컬럼과 동일 규칙) */
  const groups = useMemo(() => {
    const byFeature = new Map<string, Task[]>();
    for (const tk of tasks) {
      if (!byFeature.has(tk.feature_id)) byFeature.set(tk.feature_id, []);
      byFeature.get(tk.feature_id)!.push(tk);
    }
    const result = [...byFeature.entries()].map(([featureId, list]) => {
      const sorted = [...list].sort((a, b) => {
        if (a.completed !== b.completed)
          return Number(a.completed) - Number(b.completed);
        return (
          (a.feature_position ?? a.position) -
          (b.feature_position ?? b.position)
        );
      });
      const completed = list.filter((tk) => tk.completed).length;
      return {
        featureId,
        feature: featureById.get(featureId),
        title:
          featureById.get(featureId)?.title ?? list[0]?.feature_title ?? "",
        color:
          featureById.get(featureId)?.color ?? list[0]?.feature_color ?? null,
        tasks: sorted,
        visibleTasks: sorted.filter(taskMatches),
        completed,
        total: list.length,
      };
    });
    result.sort((a, b) => {
      const pa = a.total > 0 ? a.completed / a.total : 0;
      const pb = b.total > 0 ? b.completed / b.total : 0;
      return pb - pa || b.total - a.total;
    });
    return result;
  }, [tasks, featureById, taskMatches]);

  const isFiltered = statusFilter !== "all" || assigneeFilter !== null;
  const visibleGroups = isFiltered
    ? groups.filter((g) => g.visibleTasks.length > 0)
    : groups;

  // ── 상호작용 ──
  const handleToggleItem = useCallback(
    (taskId: string, item: ChecklistItem) => {
      if (!canEdit) return;
      // 낙관적 갱신 → 실패 시 되돌림
      const flip = (completed: boolean) =>
        setChecklists((prev) => {
          const state = prev[taskId];
          if (!state) return prev;
          return {
            ...prev,
            [taskId]: {
              ...state,
              items: state.items.map((i) =>
                i.id === item.id ? { ...i, completed } : i,
              ),
            },
          };
        });
      flip(!item.completed);
      checklistService.toggleItem(boardId, taskId, item.id).catch(() => {
        flip(item.completed);
      });
    },
    [boardId, canEdit],
  );

  const handleAddTask = useCallback(
    async (featureId: string, title: string) => {
      if (!title.trim() || saving) return;
      setSaving(true);
      try {
        const created = await taskService.createTask(boardId, featureId, {
          title: title.trim(),
          milestone_id: mid,
        });
        setChecklists((prev) => ({
          ...prev,
          [created.id]: { items: [], loaded: true },
        }));
        setAddingTaskFor(null);
        onRefresh?.();
      } catch {
        /* 실패 시 입력 유지 */
      } finally {
        setSaving(false);
      }
    },
    [boardId, mid, saving, onRefresh],
  );

  const handleAddItem = useCallback(
    async (taskId: string, title: string) => {
      if (!title.trim() || saving) return;
      setSaving(true);
      try {
        const item = await checklistService.addItem(boardId, taskId, {
          title: title.trim(),
        });
        setChecklists((prev) => {
          const state = prev[taskId] ?? { items: [], loaded: true };
          return {
            ...prev,
            [taskId]: { ...state, items: [...state.items, item] },
          };
        });
        setAddingItemFor(null);
      } catch {
        /* 실패 시 입력 유지 */
      } finally {
        setSaving(false);
      }
    },
    [boardId, saving],
  );

  /** 체크리스트 항목 드래그 정렬 — 낙관적 갱신 후 실패 시 롤백 */
  const handleReorder = useCallback(
    (taskId: string, event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const state = checklists[taskId];
      if (!state?.loaded) return;
      const sorted = [...state.items].sort((a, b) => a.position - b.position);
      const oldIndex = sorted.findIndex((i) => i.id === active.id);
      const newIndex = sorted.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(sorted, oldIndex, newIndex).map(
        (item, idx) => ({ ...item, position: idx }),
      );
      const prevItems = state.items;
      setChecklists((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], items: reordered },
      }));
      checklistAPI
        .reorderItems(boardId, taskId, {
          item_ids: reordered.map((i) => i.id),
        })
        .catch(() => {
          setChecklists((prev) => ({
            ...prev,
            [taskId]: { ...prev[taskId], items: prevItems },
          }));
        });
    },
    [boardId, checklists],
  );

  // ── CSV 내보내기 (UTF-8 BOM — 엑셀 한글 호환) ──
  const handleExport = useCallback(() => {
    const statusLabel: Record<TaskStatus, string> = {
      done: t("milestone.table.statusDone", { defaultValue: "완료" }),
      doing: t("milestone.table.statusDoing", { defaultValue: "진행중" }),
      todo: t("milestone.table.statusTodo", { defaultValue: "대기" }),
    };
    const header = [
      t("milestone.table.colFeature", { defaultValue: "피처" }),
      t("milestone.table.csvFeatureProgress", { defaultValue: "피처 진행" }),
      t("milestone.table.colTask", { defaultValue: "태스크" }),
      t("milestone.table.csvStatus", { defaultValue: "상태" }),
      t("milestone.table.csvSprint", { defaultValue: "스프린트" }),
      t("milestone.table.csvDue", { defaultValue: "마감" }),
      t("milestone.table.colChecklist", { defaultValue: "체크리스트" }),
      t("milestone.table.csvChecked", { defaultValue: "완료" }),
      t("milestone.table.csvAssignee", { defaultValue: "담당자" }),
    ];
    const rows: string[][] = [header];
    for (const g of visibleGroups) {
      const pct = g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0;
      const progress = `${g.completed}/${g.total} (${pct}%)`;
      for (const tk of g.visibleTasks) {
        const info = sprintInfoByTask.get(tk.id);
        const sprint =
          info?.status === "ACTIVE"
            ? `S${info.seq ?? activeSeq ?? ""}`
            : info?.status === "ARCHIVED"
              ? `S${info.seq ?? ""}`
              : "";
        const base = [
          g.title,
          progress,
          tk.title,
          statusLabel[statusOf(tk)],
          sprint,
          tk.due_date ?? "",
        ];
        const items = itemsOf(tk.id);
        if (items.length === 0) {
          rows.push([...base, "", "", ""]);
        } else {
          for (const item of items) {
            rows.push([
              ...base,
              item.title,
              item.completed ? "O" : "X",
              item.assignee?.name ?? "",
            ]);
          }
        }
      }
    }
    const csv =
      "\uFEFF" + rows.map((r) => r.map(csvField).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${milestone.title}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [
    visibleGroups,
    sprintInfoByTask,
    activeSeq,
    statusOf,
    itemsOf,
    milestone.title,
    t,
  ]);

  // ── 렌더 ──
  const filterChips: { key: StatusFilter; label: string }[] = [
    {
      key: "all",
      label: t("milestone.table.filterAll", { defaultValue: "전체" }),
    },
    {
      key: "doing",
      label: t("milestone.table.filterDoing", { defaultValue: "진행중만" }),
    },
    {
      key: "open",
      label: t("milestone.table.filterOpen", { defaultValue: "미완료만" }),
    },
    ...(sprintEnabled
      ? [
          {
            key: "sprint" as const,
            label: t("milestone.table.filterActiveSprint", {
              defaultValue: "현재 스프린트만",
            }),
          },
        ]
      : []),
  ];

  const statusPill = (s: TaskStatus) =>
    s === "done" ? (
      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
        {t("milestone.table.statusDone", { defaultValue: "완료" })}
      </span>
    ) : s === "doing" ? (
      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent whitespace-nowrap">
        {t("milestone.table.statusDoing", { defaultValue: "진행중" })}
      </span>
    ) : (
      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-slate-500 whitespace-nowrap">
        {t("milestone.table.statusTodo", { defaultValue: "대기" })}
      </span>
    );

  const inlineInput = (
    placeholder: string,
    onCommit: (value: string) => void,
    onCancel: () => void,
  ) => (
    <input
      ref={addInputRef}
      type="text"
      placeholder={placeholder}
      disabled={saving}
      className="w-full max-w-[240px] bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5 py-1 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value);
        else if (e.key === "Escape") onCancel();
      }}
      onBlur={(e) => {
        if (!e.target.value.trim()) onCancel();
      }}
    />
  );

  const assigneeFilterName = assigneeFilter
    ? (assigneeOptions.find((a) => a.id === assigneeFilter)?.name ?? "")
    : null;

  return (
    <div>
      {/* ── 필터 툴바 ── */}
      <div className="flex items-center gap-1.5 flex-wrap px-3 py-2 border-b border-foreground/[0.06]">
        {filterChips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setStatusFilter(chip.key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              statusFilter === chip.key
                ? "bg-bridge-accent/15 border-bridge-accent/40 text-bridge-accent font-bold"
                : "bg-foreground/[0.03] border-foreground/10 text-slate-400 hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        ))}

        {/* 담당자 필터 */}
        <div className="relative">
          <button
            onClick={() => setAssigneeOpen((v) => !v)}
            aria-expanded={assigneeOpen}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              assigneeFilter
                ? "bg-bridge-accent/15 border-bridge-accent/40 text-bridge-accent font-bold"
                : "bg-foreground/[0.03] border-foreground/10 text-slate-400 hover:text-foreground"
            }`}
          >
            {assigneeFilterName ??
              t("milestone.table.filterAssignee", { defaultValue: "담당자" })}
            <ChevronDown className="h-3 w-3" />
          </button>
          {assigneeOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setAssigneeOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1.5 z-40 w-44 max-h-56 overflow-y-auto custom-scrollbar bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1.5">
                <button
                  onClick={() => {
                    setAssigneeFilter(null);
                    setAssigneeOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                    assigneeFilter === null
                      ? "text-bridge-accent font-bold bg-bridge-accent/10"
                      : "text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {t("milestone.table.filterAll", { defaultValue: "전체" })}
                </button>
                {assigneeOptions.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAssigneeFilter(a.id);
                      setAssigneeOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs truncate transition-colors ${
                      assigneeFilter === a.id
                        ? "text-bridge-accent font-bold bg-bridge-accent/10"
                        : "text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {checklistsLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
          )}
          <button
            onClick={handleExport}
            disabled={checklistsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <Download className="h-3.5 w-3.5" />
            {t("milestone.table.exportExcel", {
              defaultValue: "엑셀 내보내기",
            })}
          </button>
        </div>
      </div>

      {/* ── 테이블 ── */}
      {visibleGroups.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-10">
          {isFiltered
            ? t("milestone.table.noMatch", {
                defaultValue: "조건에 맞는 태스크가 없습니다",
              })
            : t("milestone.detail.noTasks", {
                defaultValue: "이 마일스톤에 배정된 태스크가 없습니다",
              })}
        </div>
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-bridge-border">
                <th className="w-[24%] px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t("milestone.table.colFeature", { defaultValue: "피처" })}
                </th>
                <th className="w-[36%] px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t("milestone.table.colTask", { defaultValue: "태스크" })}
                </th>
                <th className="w-[40%] px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t("milestone.table.colChecklist", {
                    defaultValue: "체크리스트",
                  })}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map((g) => {
                const pct =
                  g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0;
                const showAddRow = canEdit;
                const span = g.visibleTasks.length + (showAddRow ? 1 : 0) || 1;
                const isHome = homeByFeature.get(g.featureId) === mid;

                const featureCell = (
                  <td
                    rowSpan={span}
                    className="align-top px-4 py-3 bg-foreground/[0.03] border-r border-foreground/[0.08]"
                  >
                    <div
                      className={`flex items-center gap-2${
                        g.feature && onFeatureClick
                          ? " cursor-pointer group/f"
                          : ""
                      }`}
                      onClick={
                        g.feature && onFeatureClick
                          ? () => onFeatureClick(g.feature!)
                          : undefined
                      }
                    >
                      {g.color && (
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: g.color }}
                        />
                      )}
                      <span className="text-xs font-bold text-foreground group-hover/f:text-bridge-accent transition-colors break-words">
                        {g.title}
                      </span>
                    </div>
                    {isHome && (
                      <span className="inline-block mt-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                        {t("milestone.table.homeMilestone", {
                          defaultValue: "기본 마일스톤",
                        })}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-2.5">
                      <div className="flex-1 max-w-[110px] h-1 rounded-full bg-foreground/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct === 100 ? "bg-emerald-500" : "bg-bridge-accent"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                        <b className="text-foreground font-bold">
                          {g.completed}/{g.total}
                        </b>{" "}
                        · {pct}%
                      </span>
                    </div>
                  </td>
                );

                const rows = g.visibleTasks.map((tk, i) => {
                  const items = itemsOf(tk.id);
                  const state = checklists[tk.id];
                  const dueOver =
                    !tk.completed &&
                    !!tk.due_date &&
                    daysUntil(tk.due_date) < 0;
                  return (
                    <tr
                      key={tk.id}
                      className={`border-b border-foreground/[0.05]${
                        i === 0 ? " border-t border-t-foreground/[0.12]" : ""
                      }`}
                    >
                      {i === 0 && featureCell}
                      {/* 태스크 셀 */}
                      <td className="align-top px-4 py-3 border-r border-foreground/[0.08]">
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={`text-xs flex-shrink-0 ${
                              tk.completed
                                ? "text-emerald-500"
                                : "text-slate-400"
                            }`}
                          >
                            {tk.completed
                              ? "✓"
                              : statusOf(tk) === "doing"
                                ? "◐"
                                : "○"}
                          </span>
                          <span
                            onClick={
                              onTaskClick ? () => onTaskClick(tk) : undefined
                            }
                            className={`text-xs font-medium break-words ${
                              tk.completed
                                ? "text-slate-500 line-through"
                                : "text-foreground"
                            }${
                              onTaskClick
                                ? " cursor-pointer hover:text-bridge-accent hover:underline"
                                : ""
                            }`}
                          >
                            {tk.title}
                          </span>
                          {tk.task_key && (
                            <span className="text-xs text-slate-600 ml-auto flex-shrink-0 tabular-nums">
                              {tk.task_key}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {statusPill(statusOf(tk))}
                          {sprintEnabled && (
                            <SprintChip
                              info={sprintInfoByTask.get(tk.id)}
                              activeSeq={activeSeq}
                            />
                          )}
                          {tk.due_date && (
                            <span
                              className={`text-xs tabular-nums ml-auto whitespace-nowrap ${
                                dueOver
                                  ? "font-bold text-red-500"
                                  : "text-slate-500"
                              }`}
                            >
                              {tk.completed
                                ? `${toShortDate(tk.due_date)} ✓`
                                : `~${toShortDate(tk.due_date)}`}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* 체크리스트 셀 */}
                      <td className="align-top px-4 py-3">
                        {state && !state.loaded ? (
                          <span className="text-xs text-slate-600">—</span>
                        ) : items.length === 0 && addingItemFor !== tk.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-600">—</span>
                            {canEdit && (
                              <button
                                onClick={() => setAddingItemFor(tk.id)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-bridge-secondary transition-colors"
                              >
                                <Plus className="h-3 w-3" />
                                {t("milestone.table.addItem", {
                                  defaultValue: "항목 추가",
                                })}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {items.length > 0 && (
                              <span className="inline-block text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary tabular-nums mb-1">
                                ☑ {items.filter((c) => c.completed).length}/
                                {items.length}
                              </span>
                            )}
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              modifiers={[
                                restrictToVerticalAxis,
                                restrictToParentElement,
                              ]}
                              onDragEnd={(e) => handleReorder(tk.id, e)}
                            >
                              <SortableContext
                                items={items.map((i) => i.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {items.map((item) => (
                                  <SortableChecklistLine
                                    key={item.id}
                                    item={item}
                                    canEdit={canEdit}
                                    onToggle={() =>
                                      handleToggleItem(tk.id, item)
                                    }
                                    unassignedLabel={t(
                                      "milestone.detail.unassigned",
                                      { defaultValue: "미배정" },
                                    )}
                                  />
                                ))}
                              </SortableContext>
                            </DndContext>
                            {canEdit &&
                              (addingItemFor === tk.id ? (
                                inlineInput(
                                  t("milestone.table.addItemPlaceholder", {
                                    defaultValue: "체크 항목 입력 후 Enter",
                                  }),
                                  (v) => void handleAddItem(tk.id, v),
                                  () => setAddingItemFor(null),
                                )
                              ) : (
                                <button
                                  onClick={() => setAddingItemFor(tk.id)}
                                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-bridge-secondary transition-colors pt-0.5"
                                >
                                  <Plus className="h-3 w-3" />
                                  {t("milestone.table.addItem", {
                                    defaultValue: "항목 추가",
                                  })}
                                </button>
                              ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                });

                return (
                  <Fragment key={g.featureId}>
                    {rows}
                    {showAddRow && (
                      <tr
                        className={`border-b border-foreground/[0.05]${
                          g.visibleTasks.length === 0
                            ? " border-t border-t-foreground/[0.12]"
                            : ""
                        }`}
                      >
                        {g.visibleTasks.length === 0 && featureCell}
                        <td colSpan={2} className="px-4 py-2">
                          {addingTaskFor === g.featureId ? (
                            inlineInput(
                              t("milestone.table.addTaskPlaceholder", {
                                defaultValue: "태스크 이름 입력 후 Enter",
                              }),
                              (v) => void handleAddTask(g.featureId, v),
                              () => setAddingTaskFor(null),
                            )
                          ) : (
                            <button
                              onClick={() => {
                                setAddingItemFor(null);
                                setAddingTaskFor(g.featureId);
                              }}
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-bridge-accent transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                              {t("milestone.table.addTask", {
                                defaultValue: "태스크 추가",
                              })}
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ========================================
// Sortable checklist line
// ========================================

/** 체크리스트 항목 한 줄 — 그립 드래그로 순서 변경 (canEdit일 때만) */
function SortableChecklistLine({
  item,
  canEdit,
  onToggle,
  unassignedLabel,
}: {
  item: ChecklistItem;
  canEdit: boolean;
  onToggle: () => void;
  unassignedLabel: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 group/cl"
      {...attributes}
    >
      {canEdit && (
        <span
          {...listeners}
          aria-label={item.title}
          className="cursor-grab active:cursor-grabbing text-slate-600 opacity-0 group-hover/cl:opacity-100 transition-opacity flex-shrink-0 touch-none"
        >
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      <button
        onClick={onToggle}
        disabled={!canEdit}
        aria-label={item.title}
        className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center text-xs leading-none transition-colors ${
          item.completed
            ? "bg-bridge-secondary/20 border-bridge-secondary text-bridge-secondary"
            : "border-foreground/25"
        }${canEdit ? " cursor-pointer hover:border-bridge-secondary" : ""}`}
      >
        {item.completed ? "✓" : ""}
      </button>
      <span
        className={`text-xs min-w-0 flex-1 break-words ${
          item.completed ? "text-slate-500 line-through" : "text-foreground/80"
        }`}
      >
        {item.title}
      </span>
      <span
        className={`text-xs flex-shrink-0 ${
          item.assignee
            ? "text-slate-500"
            : "text-amber-600 dark:text-amber-400"
        }`}
      >
        {item.assignee?.name ?? unassignedLabel}
      </span>
    </div>
  );
}
