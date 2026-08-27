import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Loader2,
  Plus,
  ChevronRight,
  Search,
  Inbox,
  Flag,
  Check,
} from "lucide-react";
import {
  boardChecklistAPI,
  taskAPI,
  TaskResponse,
  milestoneAPI,
  calendarEventAPI,
  checklistAPI,
  ChecklistItemResponse,
} from "../../utils/api";
import { Feature, Milestone } from "../../types";
import { MotionModal } from "../ui/MotionModal";

// ─── Selection ──────────────────────────────────────────────────────────────
// 트리에서 노드를 클릭하면 곧바로 "추가 위치"가 결정된다.
// - inbox      → 보드 인박스(미분류)에 추가
// - feature    → 해당 피쳐 아래 테스크 자동 생성 후 체크리스트로 추가
// - newTask    → feature와 동일 페이로드 (트리 안 탐색 중 명시적 진입점)
// - task       → 해당 테스크 아래 체크리스트로 추가
// - newFeature → 새 피쳐 생성 후 그 안에 추가

type Selection =
  | { kind: "inbox" }
  | { kind: "feature"; featureId: string; milestoneId: string | null }
  | { kind: "newTask"; featureId: string; milestoneId: string | null }
  | {
      kind: "task";
      featureId: string;
      taskId: string;
      milestoneId: string | null;
    }
  | { kind: "newFeature" };

function selKey(s: Selection): string {
  switch (s.kind) {
    case "inbox":
      return "inbox";
    case "newFeature":
      return "newFeature";
    case "task":
      return `task:${s.taskId}`;
    default:
      return `${s.kind}:${s.featureId}`;
  }
}

// "MM.DD" 형식으로 축약 (트리 폭이 좁아 연도 생략)
function fmtShort(date: string): string {
  return date.slice(5).replace("-", ".");
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface WorkloadCreateModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  features: Feature[];
  milestones: Milestone[];
  assigneeId?: string | null;
  /** 부재 탭 표시용 멤버 이름 (assigneeId가 멤버일 때) */
  assigneeName?: string | null;
  contractorId?: string | null;
  startDate: string;
  dueDate: string;
  onCreated: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WorkloadCreateModal({
  open,
  onClose,
  boardId,
  features,
  milestones,
  assigneeId,
  assigneeName,
  contractorId,
  startDate,
  dueDate,
  onCreated,
}: WorkloadCreateModalProps) {
  const { t } = useTranslation();

  // 업무 / 부재 탭 (부재는 멤버 행에서만 — assigneeId 있을 때)
  const [tab, setTab] = useState<"task" | "absence">("task");
  const [absStart, setAbsStart] = useState(startDate);
  const [absEnd, setAbsEnd] = useState(dueDate);

  // ── Form state ──
  const [title, setTitle] = useState("");
  const [newFeatureTitle, setNewFeatureTitle] = useState("");
  const [sel, setSel] = useState<Selection>({ kind: "inbox" });

  // ── Tree state ──
  const [query, setQuery] = useState("");
  const [expandedMs, setExpandedMs] = useState<Set<string>>(new Set());
  const [expandedFt, setExpandedFt] = useState<Set<string>>(new Set());

  // ── Data ──
  const [allTasks, setAllTasks] = useState<TaskResponse[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  // milestoneId → featureId[] (전 마일스톤 매핑을 열 때 한 번에 로드)
  const [msFeatureIds, setMsFeatureIds] = useState<Record<string, string[]>>(
    {},
  );
  const [msLoaded, setMsLoaded] = useState(false);
  // taskId → 체크리스트 항목 (미리보기용, 선택 시 lazy load)
  const [checklistCache, setChecklistCache] = useState<
    Record<string, ChecklistItemResponse[]>
  >({});
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);

  // ── Submit ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refs ──
  const titleInputRef = useRef<HTMLInputElement>(null);
  const newFeatureInputRef = useRef<HTMLInputElement>(null);

  // ── Derived ──
  const selectableFeatures = useMemo(
    () => features.filter((f) => !f.inbox),
    [features],
  );
  const featureById = useMemo(() => {
    const map: Record<string, Feature> = {};
    for (const f of selectableFeatures) map[f.id] = f;
    return map;
  }, [selectableFeatures]);

  const tasksByFeature = useMemo(() => {
    const map: Record<string, TaskResponse[]> = {};
    for (const task of allTasks) {
      (map[task.feature_id] ??= []).push(task);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [allTasks]);

  // 어떤 마일스톤에도 연결되지 않은 피쳐 (매핑 로드 후에만 판정)
  const unlinkedFeatures = useMemo(() => {
    if (!msLoaded) return [];
    const linked = new Set(Object.values(msFeatureIds).flat());
    return selectableFeatures.filter((f) => !linked.has(f.id));
  }, [msLoaded, msFeatureIds, selectableFeatures]);

  const featureHasTasks = useCallback(
    (f: Feature) => (tasksByFeature[f.id]?.length ?? f.total_tasks) > 0,
    [tasksByFeature],
  );

  // ── 검색 ──
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;
  const featureMatches = useCallback(
    (f: Feature) =>
      !isSearching ||
      f.title.toLowerCase().includes(q) ||
      (tasksByFeature[f.id] ?? []).some((task) =>
        task.title.toLowerCase().includes(q),
      ),
    [isSearching, q, tasksByFeature],
  );

  const activeKey = selKey(sel);

  // ── Auto-focus title input on open ──
  useEffect(() => {
    if (open) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [open]);

  // ── On open: reset form and auto-expand the milestone covering the period ──
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setNewFeatureTitle("");
    setSel({ kind: "inbox" });
    setQuery("");
    setExpandedFt(new Set());
    setChecklistCache({});
    setError(null);
    setTab("task");
    setAbsStart(startDate);
    setAbsEnd(dueDate);

    // Find the milestone whose [start_date, end_date] contains the dragged
    // period start. If several match, prefer the most specific (shortest) span.
    const span = (m: Milestone) =>
      Date.parse(m.end_date) - Date.parse(m.start_date);
    const covering = milestones
      .filter((m) => m.start_date <= startDate && startDate <= m.end_date)
      .sort((a, b) => span(a) - span(b));
    setExpandedMs(new Set(covering[0] ? [covering[0].id] : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Load all board tasks once (tree의 테스크 레벨 + 카운트) ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoadingTasks(true);
    taskAPI
      .getTasks(boardId)
      .then((res) => {
        if (!cancelled) setAllTasks(res.tasks);
      })
      .catch((err) => console.error("Failed to load tasks:", err))
      .finally(() => {
        if (!cancelled) setIsLoadingTasks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, boardId]);

  // ── Load milestone → feature 매핑 (prop에 있으면 재사용, 없으면 조회) ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMsLoaded(false);
    setMsFeatureIds({});
    (async () => {
      const entries = await Promise.all(
        milestones.map(async (m) => {
          if (m.features) {
            return [m.id, m.features.map((f) => f.id)] as const;
          }
          try {
            const res = await milestoneAPI.getMilestone(boardId, m.id);
            return [m.id, res.features.map((f) => f.id)] as const;
          } catch (err) {
            console.error("Failed to load milestone features:", err);
            return [m.id, []] as const;
          }
        }),
      );
      if (!cancelled) {
        setMsFeatureIds(Object.fromEntries(entries));
        setMsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, boardId, milestones]);

  // ── 테스크 선택 시 체크리스트 미리보기 lazy load ──
  useEffect(() => {
    if (sel.kind !== "task") return;
    const taskId = sel.taskId;
    if (checklistCache[taskId]) return;
    let cancelled = false;
    setIsLoadingChecklist(true);
    checklistAPI
      .getChecklist(boardId, taskId)
      .then((res) => {
        if (!cancelled) {
          setChecklistCache((prev) => ({ ...prev, [taskId]: res.items }));
        }
      })
      .catch((err) => console.error("Failed to load checklist:", err))
      .finally(() => {
        if (!cancelled) setIsLoadingChecklist(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sel, boardId, checklistCache]);

  // ── 새 피쳐 선택 시 피쳐명 입력에 포커스 ──
  useEffect(() => {
    if (sel.kind === "newFeature") {
      setTimeout(() => newFeatureInputRef.current?.focus(), 50);
    }
  }, [sel.kind]);

  // ── Toggle helpers ──
  const toggleMilestone = useCallback((id: string) => {
    setExpandedMs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleFeature = useCallback((id: string) => {
    setExpandedFt((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const selectFeature = useCallback(
    (featureId: string, milestoneId: string | null) => {
      setSel({ kind: "feature", featureId, milestoneId });
      setExpandedFt((prev) => {
        if (prev.has(featureId)) return prev;
        const next = new Set(prev);
        next.add(featureId);
        return next;
      });
    },
    [],
  );

  // ── Submit handler ──
  const canSubmit =
    title.trim().length > 0 &&
    !(sel.kind === "newFeature" && !newFeatureTitle.trim());

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmitting) return;
    if (sel.kind === "newFeature" && !newFeatureTitle.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: Parameters<
        typeof boardChecklistAPI.createFromWorkload
      >[1] = {
        title: trimmedTitle,
        assignee_id: assigneeId || undefined,
        contractor_id: contractorId || undefined,
        start_date: startDate,
        due_date: dueDate,
      };

      switch (sel.kind) {
        case "inbox":
          // No feature → goes to inbox
          break;
        case "newFeature":
          payload.new_feature_title = newFeatureTitle.trim();
          break;
        case "feature":
        case "newTask":
          // No task → server auto-creates one
          payload.feature_id = sel.featureId;
          break;
        case "task":
          payload.feature_id = sel.featureId;
          payload.task_id = sel.taskId;
          break;
      }

      await boardChecklistAPI.createFromWorkload(boardId, payload);
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create workload item:", err);
      setError(t("common.error", "An error occurred"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    title,
    isSubmitting,
    sel,
    newFeatureTitle,
    assigneeId,
    contractorId,
    startDate,
    dueDate,
    boardId,
    onCreated,
    onClose,
    t,
  ]);

  // ── 부재 저장 (calendarEventAPI) ──
  const handleSubmitAbsence = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || !assigneeId || isSubmitting) return;
    if (absEnd < absStart) {
      setError(t("common.error", "An error occurred"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await calendarEventAPI.create(boardId, {
        event_type: "ABSENCE",
        member_id: assigneeId,
        title: trimmed,
        start_date: absStart,
        end_date: absEnd,
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create absence:", err);
      setError(t("common.error", "An error occurred"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    title,
    assigneeId,
    isSubmitting,
    absStart,
    absEnd,
    boardId,
    onCreated,
    onClose,
    t,
  ]);

  // ── Key handler ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (tab === "absence") handleSubmitAbsence();
      else if (canSubmit) handleSubmit();
    }
  };

  // ── Tree renderers ──────────────────────────────────────────────────────

  const renderTaskRow = (
    task: TaskResponse,
    featureId: string,
    milestoneId: string | null,
  ) => {
    const selected = activeKey === `task:${task.id}`;
    return (
      <button
        key={task.id}
        onClick={() =>
          setSel({ kind: "task", featureId, taskId: task.id, milestoneId })
        }
        className={`w-full flex items-center gap-2 pl-10 pr-2 py-1.5 rounded-lg text-xs
          text-left transition-colors ${
            selected
              ? "bg-bridge-accent/15 ring-1 ring-inset ring-bridge-accent/50 text-foreground"
              : "text-foreground hover:bg-foreground/5"
          }`}
      >
        <span className="flex-1 truncate">{task.title}</span>
        {task.checklist_total != null && (
          <span className="shrink-0 text-xs text-slate-500 font-medium">
            ✓ {task.checklist_completed ?? 0}/{task.checklist_total}
          </span>
        )}
      </button>
    );
  };

  const renderFeatureRows = (f: Feature, milestoneId: string | null) => {
    if (isSearching && !featureMatches(f)) return null;
    const hasTasks = featureHasTasks(f);
    const ftTasks = tasksByFeature[f.id] ?? [];
    const ftOpen = isSearching || expandedFt.has(f.id);
    const selected = activeKey === `feature:${f.id}`;
    const newTaskSelected = activeKey === `newTask:${f.id}`;
    const showAllTasks = !isSearching || f.title.toLowerCase().includes(q);
    const visibleTasks = showAllTasks
      ? ftTasks
      : ftTasks.filter((task) => task.title.toLowerCase().includes(q));

    // 테스크 없는 피쳐: 노출하되 선택 불가 (규칙을 숨기지 않고 보여준다)
    if (!hasTasks) {
      return (
        <div
          key={`${milestoneId ?? "un"}:${f.id}`}
          className="flex items-center gap-2 pl-6 pr-2 py-1.5 text-xs opacity-40
            cursor-not-allowed select-none"
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: f.color }}
          />
          <span className="flex-1 truncate text-foreground">{f.title}</span>
          <span className="shrink-0 text-xs text-slate-500">
            {t("schedule.workloadCreate.noTasks", "테스크 없음")}
          </span>
        </div>
      );
    }

    return (
      <div key={`${milestoneId ?? "un"}:${f.id}`}>
        <div
          className={`flex items-center gap-1 pl-4 pr-2 py-0.5 rounded-lg transition-colors ${
            selected
              ? "bg-bridge-accent/15 ring-1 ring-inset ring-bridge-accent/50"
              : "hover:bg-foreground/5"
          }`}
        >
          <button
            onClick={() => toggleFeature(f.id)}
            aria-label={ftOpen ? "접기" : "펼치기"}
            className="p-0.5 rounded text-slate-500 hover:text-foreground shrink-0"
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${ftOpen ? "rotate-90" : ""}`}
            />
          </button>
          <button
            onClick={() => selectFeature(f.id, milestoneId)}
            className="flex-1 min-w-0 flex items-center gap-2 py-1 text-xs text-left
              text-foreground"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: f.color }}
            />
            <span className="flex-1 truncate font-medium">{f.title}</span>
            <span
              className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full
                bg-bridge-accent/15 text-bridge-accent"
            >
              {ftTasks.length || f.total_tasks}
            </span>
          </button>
        </div>

        {ftOpen && (
          <div className="relative">
            <span
              aria-hidden="true"
              className="absolute left-[22px] top-0 bottom-0 w-px bg-foreground/[0.08]"
            />
            {visibleTasks.map((task) => renderTaskRow(task, f.id, milestoneId))}
            <button
              onClick={() =>
                setSel({ kind: "newTask", featureId: f.id, milestoneId })
              }
              className={`w-full flex items-center gap-1.5 pl-10 pr-2 py-1.5 rounded-lg
                text-xs text-left font-bold transition-colors ${
                  newTaskSelected
                    ? "bg-bridge-accent/15 ring-1 ring-inset ring-bridge-accent/50 text-bridge-accent"
                    : "text-bridge-accent/80 hover:bg-foreground/5 hover:text-bridge-accent"
                }`}
            >
              <Plus size={12} className="shrink-0" />
              {t("schedule.workloadCreate.newTask", "새 테스크로 추가")}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderMilestone = (m: Milestone) => {
    const ftIds = msFeatureIds[m.id];
    const msFeatures = (ftIds ?? [])
      .map((id) => featureById[id])
      .filter((f): f is Feature => !!f);
    if (isSearching && !msFeatures.some(featureMatches)) return null;
    const msOpen = isSearching || expandedMs.has(m.id);

    return (
      <div key={m.id}>
        <button
          onClick={() => toggleMilestone(m.id)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs
            text-left text-foreground hover:bg-foreground/5 transition-colors"
        >
          <ChevronRight
            size={12}
            className={`shrink-0 text-slate-500 transition-transform ${
              msOpen ? "rotate-90" : ""
            }`}
          />
          <Flag size={11} className="shrink-0 text-bridge-accent" />
          <span className="flex-1 truncate font-bold">{m.title}</span>
          <span className="shrink-0 text-xs text-slate-500">
            {fmtShort(m.start_date)}~{fmtShort(m.end_date)}
          </span>
        </button>

        {msOpen && (
          <div>
            {ftIds == null ? (
              <div className="flex items-center gap-2 pl-6 py-1.5 text-xs text-slate-500">
                <Loader2 size={12} className="animate-spin text-bridge-accent" />
                {t("common.loading", "Loading...")}
              </div>
            ) : msFeatures.length === 0 ? (
              <p className="pl-6 py-1.5 text-xs text-slate-500">
                {t(
                  "schedule.workloadCreate.milestoneEmpty",
                  "이 마일스톤에 연결된 Feature가 없습니다",
                )}
              </p>
            ) : (
              msFeatures.map((f) => renderFeatureRows(f, m.id))
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Right panel: destination card ───────────────────────────────────────

  const selFeature =
    sel.kind === "feature" || sel.kind === "newTask" || sel.kind === "task"
      ? featureById[sel.featureId]
      : null;
  const selMilestone =
    (sel.kind === "feature" || sel.kind === "newTask" || sel.kind === "task") &&
    sel.milestoneId
      ? milestones.find((m) => m.id === sel.milestoneId)
      : null;
  const selTask =
    sel.kind === "task"
      ? (tasksByFeature[sel.featureId] ?? []).find(
          (task) => task.id === sel.taskId,
        )
      : null;

  const destSentence = (() => {
    switch (sel.kind) {
      case "inbox":
        return t(
          "schedule.workloadCreate.destInbox",
          "미분류(인박스)에 추가됩니다 — 나중에 분류할 수 있어요",
        );
      case "newFeature":
        return t(
          "schedule.workloadCreate.destNewFeature",
          "새 피쳐가 만들어지고 그 안에 추가됩니다",
        );
      case "feature":
        return t(
          "schedule.workloadCreate.destFeature",
          "테스크가 자동 생성되고 그 안에 체크리스트로 담깁니다",
        );
      case "newTask":
        return t(
          "schedule.workloadCreate.destNewTask",
          "입력한 제목으로 새 테스크가 생성됩니다",
        );
      case "task":
        return t(
          "schedule.workloadCreate.destTask",
          "이 테스크 아래 체크리스트로 추가됩니다",
        );
    }
  })();

  const isTealDest = sel.kind === "inbox" || sel.kind === "newFeature";

  const crumbChip = (label: string, dotColor?: string, icon?: JSX.Element) => (
    <span
      className="inline-flex items-center gap-1.5 max-w-[150px] px-2 py-0.5 rounded-full
        bg-foreground/[0.06] border border-foreground/[0.08] text-xs font-bold
        text-foreground"
    >
      {icon}
      {dotColor && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
      )}
      <span className="truncate">{label}</span>
    </span>
  );

  const crumbSep = (
    <span className="text-xs text-slate-500" aria-hidden="true">
      ›
    </span>
  );

  const selChecklist =
    sel.kind === "task" ? checklistCache[sel.taskId] : undefined;

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className={tab === "absence" ? "w-full sm:max-w-md" : "w-full sm:max-w-3xl"}
      accentColor
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Plus
          className="w-5 h-5 text-bridge-accent shrink-0"
          aria-hidden="true"
        />
        <h2 className="text-sm font-bold text-foreground flex-1">
          {tab === "absence"
            ? "부재 추가"
            : t("schedule.workloadCreate.title", "새 업무 추가")}
        </h2>
        <button
          onClick={onClose}
          aria-label={t("common.close", "Close")}
          className="p-1 rounded-lg text-slate-500 hover:text-foreground
            hover:bg-foreground/5 transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* 업무 / 부재 탭 — 멤버 행(assigneeId)에서만 노출 */}
      {assigneeId && (
        <div className="grid grid-cols-2 gap-1.5 px-5 pt-3 pb-3">
          <button
            type="button"
            onClick={() => setTab("task")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border transition-colors ${
              tab === "task"
                ? "border-bridge-accent/60 bg-bridge-accent/15 text-foreground"
                : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
            }`}
          >
            <Plus size={13} /> 업무
          </button>
          <button
            type="button"
            onClick={() => setTab("absence")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border transition-colors ${
              tab === "absence"
                ? "border-bridge-secondary/60 bg-bridge-secondary/15 text-foreground"
                : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
            }`}
          >
            🚶 부재
          </button>
        </div>
      )}

      {tab === "absence" ? (
        <div className="px-5 pb-5 pt-1 space-y-4">
          {/* 대상 멤버 */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
              대상 멤버
            </label>
            <div className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/10 rounded-xl text-xs text-foreground">
              {assigneeName || "이 멤버"}
            </div>
          </div>

          {/* 내용 */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
              내용
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="예: 부산 출장 · 오전 반차 · 재택"
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
                py-3 px-4 text-foreground placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              바에 이 텍스트가 표시됩니다
            </p>
          </div>

          {/* 기간 */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
              기간
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={absStart}
                onChange={(e) => {
                  const v = e.target.value;
                  setAbsStart(v);
                  if (absEnd < v) setAbsEnd(v);
                }}
                className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all [color-scheme:dark]"
              />
              <span className="text-slate-500 text-sm">~</span>
              <input
                type="date"
                value={absEnd}
                min={absStart}
                onChange={(e) => setAbsEnd(e.target.value)}
                className="flex-1 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all [color-scheme:dark]"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div
          className={`flex flex-col sm:flex-row sm:h-[440px] ${
            assigneeId ? "border-t border-foreground/[0.08]" : ""
          }`}
        >
          {/* ── Left: hierarchy tree ── */}
          <div
            className="sm:w-[300px] sm:shrink-0 flex flex-col bg-foreground/[0.02]
              border-b sm:border-b-0 sm:border-r border-foreground/[0.08]"
          >
            {/* 검색 */}
            <div className="p-3 pb-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t(
                    "schedule.workloadCreate.search",
                    "피쳐·테스크 검색",
                  )}
                  className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-lg
                    py-2 pl-8 pr-3 text-xs text-foreground placeholder-slate-500
                    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              </div>
            </div>

            {/* 트리 */}
            <div
              role="tree"
              aria-label={t("schedule.workloadCreate.treeLabel", "추가 위치 선택")}
              className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3 space-y-0.5
                max-h-[240px] sm:max-h-none"
            >
              {/* 미분류 (보드당 1개, 마일스톤 밖 전역) */}
              <button
                onClick={() => setSel({ kind: "inbox" })}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs
                  font-bold text-left transition-colors ${
                    activeKey === "inbox"
                      ? "bg-bridge-secondary/15 ring-1 ring-inset ring-bridge-secondary/50 text-bridge-secondary"
                      : "text-bridge-secondary/80 hover:bg-foreground/5 hover:text-bridge-secondary"
                  }`}
              >
                <Inbox size={13} className="shrink-0" />
                {t("schedule.workloadCreate.inboxNode", "미분류에 바로 추가")}
              </button>

              {isLoadingTasks && !msLoaded ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
                  <Loader2
                    size={14}
                    className="animate-spin text-bridge-accent"
                  />
                  {t("common.loading", "Loading...")}
                </div>
              ) : (
                <>
                  {milestones.map(renderMilestone)}

                  {/* 마일스톤 미연결 피쳐 */}
                  {unlinkedFeatures.length > 0 && (
                    <div>
                      <p className="px-2 pt-2 pb-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                        {t(
                          "schedule.workloadCreate.unlinked",
                          "마일스톤 미연결",
                        )}
                      </p>
                      {unlinkedFeatures.map((f) => renderFeatureRows(f, null))}
                    </div>
                  )}

                  {/* 새 피쳐 만들기 */}
                  {!isSearching && (
                    <button
                      onClick={() => setSel({ kind: "newFeature" })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                        text-xs font-bold text-left transition-colors ${
                          activeKey === "newFeature"
                            ? "bg-bridge-secondary/15 ring-1 ring-inset ring-bridge-secondary/50 text-bridge-secondary"
                            : "text-bridge-secondary/80 hover:bg-foreground/5 hover:text-bridge-secondary"
                        }`}
                    >
                      <Plus size={13} className="shrink-0" />
                      {t(
                        "schedule.workloadCreate.featureNew",
                        "새 Feature 만들기",
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Right: form ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-4 p-5 overflow-y-auto custom-scrollbar">
            {/* 추가 위치 */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                {t("schedule.workloadCreate.destination", "추가 위치")}
              </label>
              <div
                className={`rounded-xl border p-3 ${
                  isTealDest
                    ? "border-bridge-secondary/40 bg-bridge-secondary/10"
                    : "border-bridge-accent/40 bg-bridge-accent/10"
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                  {sel.kind === "inbox" &&
                    crumbChip(
                      t("schedule.workloadCreate.featureNone", "미분류"),
                      undefined,
                      <Inbox
                        size={11}
                        className="shrink-0 text-bridge-secondary"
                      />,
                    )}
                  {sel.kind === "newFeature" &&
                    crumbChip(
                      newFeatureTitle.trim() ||
                        t(
                          "schedule.workloadCreate.featureNew",
                          "새 Feature 만들기",
                        ),
                      undefined,
                      <Plus
                        size={11}
                        className="shrink-0 text-bridge-secondary"
                      />,
                    )}
                  {selMilestone && (
                    <>
                      {crumbChip(
                        selMilestone.title,
                        undefined,
                        <Flag
                          size={11}
                          className="shrink-0 text-bridge-accent"
                        />,
                      )}
                      {crumbSep}
                    </>
                  )}
                  {selFeature && crumbChip(selFeature.title, selFeature.color)}
                  {sel.kind === "task" && selTask && (
                    <>
                      {crumbSep}
                      {crumbChip(selTask.title)}
                    </>
                  )}
                  {sel.kind === "newTask" && (
                    <>
                      {crumbSep}
                      {crumbChip(
                        t("schedule.workloadCreate.newTask", "새 테스크로 추가"),
                        undefined,
                        <Plus
                          size={11}
                          className="shrink-0 text-bridge-accent"
                        />,
                      )}
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-400">{destSentence}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {startDate} ~ {dueDate}
                </p>
              </div>
            </div>

            {/* 체크리스트 미리보기 (테스크 선택 시) */}
            {sel.kind === "task" && (
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                  {t(
                    "schedule.workloadCreate.checklistPreview",
                    "체크리스트 미리보기",
                  )}
                </label>
                <div
                  className="rounded-xl border border-foreground/[0.08] max-h-[140px]
                    overflow-y-auto custom-scrollbar divide-y divide-foreground/[0.06]"
                >
                  {isLoadingChecklist && !selChecklist ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-500">
                      <Loader2
                        size={13}
                        className="animate-spin text-bridge-accent"
                      />
                      {t("common.loading", "Loading...")}
                    </div>
                  ) : (
                    <>
                      {(selChecklist ?? []).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs"
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center
                              justify-center ${
                                item.completed
                                  ? "bg-bridge-accent border-bridge-accent"
                                  : "border-foreground/20"
                              }`}
                          >
                            {item.completed && (
                              <Check size={9} className="text-white" />
                            )}
                          </span>
                          <span
                            className={`flex-1 truncate ${
                              item.completed
                                ? "line-through text-slate-500"
                                : "text-slate-400"
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>
                      ))}
                      {selChecklist && selChecklist.length === 0 && (
                        <p className="px-3 py-2 text-xs text-slate-500">
                          {t(
                            "schedule.workloadCreate.checklistEmpty",
                            "아직 체크리스트가 없습니다",
                          )}
                        </p>
                      )}
                      {/* 새 항목이 붙을 자리 */}
                      <div className="flex items-center gap-2.5 px-3 py-2 text-xs">
                        <span
                          className="w-3.5 h-3.5 rounded shrink-0 border border-dashed
                            border-bridge-accent/60"
                        />
                        <span className="flex-1 truncate font-bold text-bridge-accent">
                          {title.trim()
                            ? `＋ ${title.trim()}`
                            : t(
                                "schedule.workloadCreate.checklistGhost",
                                "＋ 여기에 새 항목이 추가됩니다",
                              )}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1" />

            {/* 새 피쳐 제목 (새 피쳐 선택 시) */}
            {sel.kind === "newFeature" && (
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                  {t("schedule.workloadCreate.newFeatureTitle", "피쳐 이름")}
                </label>
                <input
                  ref={newFeatureInputRef}
                  type="text"
                  value={newFeatureTitle}
                  onChange={(e) => setNewFeatureTitle(e.target.value)}
                  placeholder={t(
                    "schedule.workloadCreate.featureNew",
                    "새 Feature 만들기",
                  )}
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
                    py-3 px-4 text-foreground placeholder-slate-500
                    focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              </div>
            )}

            {/* Title input */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                {sel.kind === "task"
                  ? t(
                      "schedule.workloadCreate.checklistItemTitle",
                      "체크리스트 항목",
                    )
                  : t("schedule.panel.itemTitle", "Item title")}
              </label>
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  sel.kind === "task"
                    ? t(
                        "schedule.workloadCreate.checklistPlaceholder",
                        "체크리스트 항목을 입력하세요",
                      )
                    : t(
                        "schedule.workloadCreate.titlePlaceholder",
                        "업무 제목을 입력하세요",
                      )
                }
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
                  py-3 px-4 text-foreground placeholder-slate-500
                  focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
            </div>

            {/* Error */}
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-500">
          Esc {t("schedule.workloadCreate.cancel", "취소")}
        </span>
        <button
          onClick={tab === "absence" ? handleSubmitAbsence : handleSubmit}
          disabled={
            (tab === "absence" ? title.trim().length === 0 : !canSubmit) ||
            isSubmitting
          }
          className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-bridge-accent
            disabled:opacity-50 disabled:cursor-not-allowed
            hover:bg-bridge-accent/90 transition-all"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            t("schedule.workloadCreate.submit", "추가")
          )}
        </button>
      </div>
    </MotionModal>
  );
}
