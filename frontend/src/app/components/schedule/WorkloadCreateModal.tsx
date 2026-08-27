import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, Plus, Check } from "lucide-react";
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

// ─── Selection model ────────────────────────────────────────────────────────
// "체크리스트 항목 이동" 모달과 같은 문법: 마일스톤 칩 → 피처 열 → Task 열.
// - msSel   : "INBOX"(보드 인박스) | "UNLINKED"(마일스톤 미연결) | milestoneId
// - featSel : null | "NEWF"(새 피쳐) | featureId
// - taskSel : null | "AUTO"(테스크 자동 생성) | taskId

const INBOX = "INBOX" as const;
const UNLINKED = "UNLINKED" as const;
const NEWF = "NEWF" as const;
const AUTO = "AUTO" as const;

// 부재 빠른 선택 프리셋 — 라벨이 그대로 내용에 들어간다
const ABSENCE_PRESETS = [
  "🏠 재택",
  "🌴 휴가",
  "⏰ 오전 반차",
  "⏰ 오후 반차",
  "✈️ 출장",
];

// "MM.DD" 축약 (칩/요약 바 폭이 좁아 연도 생략)
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

  // ── 업무 탭 상태 ──
  const [msSel, setMsSel] = useState<string>(INBOX);
  const [featSel, setFeatSel] = useState<string | null>(null);
  const [taskSel, setTaskSel] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [newFeatureTitle, setNewFeatureTitle] = useState("");

  // ── 부재 탭 상태 ──
  const [absTitle, setAbsTitle] = useState("");
  const [absStart, setAbsStart] = useState(startDate);
  const [absEnd, setAbsEnd] = useState(dueDate);

  // ── Data ──
  const [allTasks, setAllTasks] = useState<TaskResponse[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  // milestoneId → featureId[] (열릴 때 전 마일스톤 매핑을 한 번에 로드)
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
  const absTitleInputRef = useRef<HTMLInputElement>(null);
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

  const showUnlinkedChip =
    (msLoaded && unlinkedFeatures.length > 0) ||
    (milestones.length === 0 && selectableFeatures.length > 0);

  // 현재 칩에 해당하는 피처 목록 (마일스톤 매핑 로딩 중이면 null)
  const visibleFeatures = useMemo(() => {
    if (msSel === INBOX) return [];
    if (msSel === UNLINKED) return unlinkedFeatures;
    const ids = msFeatureIds[msSel];
    if (ids == null) return null;
    return ids
      .map((id) => featureById[id])
      .filter((f): f is Feature => !!f);
  }, [msSel, msFeatureIds, featureById, unlinkedFeatures]);

  const selFeature = featSel && featSel !== NEWF ? featureById[featSel] : null;
  const selFeatureTasks = selFeature
    ? (tasksByFeature[selFeature.id] ?? [])
    : [];
  const selTask =
    taskSel && taskSel !== AUTO
      ? selFeatureTasks.find((task) => task.id === taskSel)
      : null;
  const selMilestone =
    msSel !== INBOX && msSel !== UNLINKED
      ? milestones.find((m) => m.id === msSel)
      : null;
  const selChecklist = selTask ? checklistCache[selTask.id] : undefined;

  const absDays = useMemo(() => {
    const a = Date.parse(absStart);
    const b = Date.parse(absEnd);
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }, [absStart, absEnd]);

  // ── Auto-focus title input on open ──
  useEffect(() => {
    if (open) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [open]);

  // ── On open: reset form and auto-select the milestone covering the period ──
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setNewFeatureTitle("");
    setFeatSel(null);
    setTaskSel(null);
    setChecklistCache({});
    setError(null);
    setTab("task");
    setAbsTitle("");
    setAbsStart(startDate);
    setAbsEnd(dueDate);

    // Find the milestone whose [start_date, end_date] contains the dragged
    // period start. If several match, prefer the most specific (shortest) span.
    const span = (m: Milestone) =>
      Date.parse(m.end_date) - Date.parse(m.start_date);
    const covering = milestones
      .filter((m) => m.start_date <= startDate && startDate <= m.end_date)
      .sort((a, b) => span(a) - span(b));
    setMsSel(covering[0]?.id ?? INBOX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Load all board tasks once (Task 열 + 피처 카운트) ──
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
    if (!taskSel || taskSel === AUTO) return;
    if (checklistCache[taskSel]) return;
    let cancelled = false;
    setIsLoadingChecklist(true);
    checklistAPI
      .getChecklist(boardId, taskSel)
      .then((res) => {
        if (!cancelled) {
          setChecklistCache((prev) => ({ ...prev, [taskSel]: res.items }));
        }
      })
      .catch((err) => console.error("Failed to load checklist:", err))
      .finally(() => {
        if (!cancelled) setIsLoadingChecklist(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskSel, boardId, checklistCache]);

  // ── 새 피쳐 선택 시 피쳐명 입력에 포커스 ──
  useEffect(() => {
    if (featSel === NEWF) {
      setTimeout(() => newFeatureInputRef.current?.focus(), 50);
    }
  }, [featSel]);

  // ── Handlers ──
  const selectMilestoneChip = useCallback((id: string) => {
    setMsSel(id);
    setFeatSel(null);
    setTaskSel(null);
    setNewFeatureTitle("");
  }, []);

  const selectFeature = useCallback((id: string) => {
    setFeatSel(id);
    setTaskSel(AUTO);
    setNewFeatureTitle("");
  }, []);

  // ── Submit handler ──
  const canSubmit =
    title.trim().length > 0 &&
    !(featSel === NEWF && !newFeatureTitle.trim());

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSubmitting) return;
    if (featSel === NEWF && !newFeatureTitle.trim()) return;

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

      if (featSel === NEWF) {
        payload.new_feature_title = newFeatureTitle.trim();
      } else if (featSel && msSel !== INBOX) {
        payload.feature_id = featSel;
        if (taskSel && taskSel !== AUTO) {
          payload.task_id = taskSel;
        }
        // AUTO: no task → server auto-creates one
      }
      // 미분류/피처 미선택 → no feature → goes to inbox

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
    featSel,
    msSel,
    taskSel,
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
  const canSubmitAbsence = absTitle.trim().length > 0 && absDays > 0;

  const handleSubmitAbsence = useCallback(async () => {
    const trimmed = absTitle.trim();
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
    absTitle,
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
      if (tab === "absence") {
        if (canSubmitAbsence) handleSubmitAbsence();
      } else if (canSubmit) {
        handleSubmit();
      }
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────

  const crumb = (label: string, dotColor?: string) => (
    <span className="inline-flex items-center gap-1.5 max-w-[170px] text-xs font-bold text-foreground">
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

  const destBar = () => {
    const hint = (text: string, accent: string, teal = false) => (
      <span className="text-xs text-slate-500">
        —{" "}
        <span
          className={`font-bold ${teal ? "text-bridge-secondary" : "text-bridge-accent"}`}
        >
          {accent}
        </span>{" "}
        {text}
      </span>
    );

    let content: JSX.Element;
    if (msSel === INBOX) {
      content = (
        <>
          {crumb("📥 " + t("schedule.workloadCreate.featureNone", "미분류"))}
          {hint(
            t("schedule.workloadCreate.destInboxTail", "됩니다"),
            t("schedule.workloadCreate.destInbox", "인박스에 추가"),
            true,
          )}
        </>
      );
    } else if (featSel === NEWF) {
      content = (
        <>
          {selMilestone && (
            <>
              {crumb(selMilestone.title)}
              {crumbSep}
            </>
          )}
          {crumb(
            newFeatureTitle.trim() ||
              t("schedule.workloadCreate.featureNew", "새 Feature 만들기"),
          )}
          {hint(
            t("schedule.workloadCreate.destNewFeatureTail", "되고 그 안에 담깁니다"),
            t("schedule.workloadCreate.destNewFeature", "새 피처가 생성"),
            true,
          )}
        </>
      );
    } else if (!selFeature) {
      content = (
        <>
          {selMilestone && crumb(selMilestone.title)}
          <span className="text-xs text-slate-500">
            {t(
              "schedule.workloadCreate.destPickFeature",
              "피처 선택 — 지금 추가하면",
            )}{" "}
            <span className="font-bold text-bridge-secondary">
              {t("schedule.workloadCreate.destPickFeatureInbox", "미분류로")}
            </span>{" "}
            {t("schedule.workloadCreate.destPickFeatureTail", "들어갑니다")}
          </span>
        </>
      );
    } else {
      content = (
        <>
          {selMilestone && (
            <>
              {crumb(selMilestone.title)}
              {crumbSep}
            </>
          )}
          {crumb(selFeature.title, selFeature.color)}
          {crumbSep}
          {taskSel === AUTO || !selTask ? (
            <>
              {crumb("＋ " + t("schedule.workloadCreate.newTaskShort", "새 테스크"))}
              {hint(
                t("schedule.workloadCreate.destAutoTail", "됩니다"),
                t("schedule.workloadCreate.destAuto", "테스크가 자동 생성"),
              )}
            </>
          ) : (
            <>
              {crumb(selTask.title)}
              {hint(
                t("schedule.workloadCreate.destTaskTail", "됩니다"),
                t("schedule.workloadCreate.destTask", "체크리스트로 추가"),
              )}
            </>
          )}
        </>
      );
    }

    return (
      <div
        className="flex items-center gap-2 flex-wrap border border-foreground/[0.08]
          rounded-xl bg-foreground/[0.03] px-4 py-2.5"
      >
        <span className="text-xs font-bold text-slate-400 shrink-0">
          {t("schedule.workloadCreate.destination", "추가 위치")}
        </span>
        {content}
        <span className="text-xs text-slate-600 ml-auto shrink-0">
          {fmtShort(startDate)} ~ {fmtShort(dueDate)}
        </span>
      </div>
    );
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="w-full sm:max-w-[720px]"
      accentColor
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Plus
          className="w-5 h-5 text-bridge-accent shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground">
            {tab === "absence"
              ? "부재 추가"
              : t("schedule.workloadCreate.title", "새 업무 추가")}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {tab === "absence"
              ? "부재 내용과 기간을 입력하세요"
              : t(
                  "schedule.workloadCreate.subtitle",
                  "추가할 위치를 선택하세요",
                )}
          </p>
        </div>
        {assigneeId && (
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setTab("task")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                tab === "task"
                  ? "border-bridge-accent/60 bg-bridge-accent/15 text-foreground"
                  : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
              }`}
            >
              <Plus size={12} /> 업무
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("absence");
                setTimeout(() => absTitleInputRef.current?.focus(), 50);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                tab === "absence"
                  ? "border-bridge-secondary/60 bg-bridge-secondary/15 text-foreground"
                  : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5"
              }`}
            >
              🚶 부재
            </button>
          </div>
        )}
        <button
          onClick={onClose}
          aria-label={t("common.close", "Close")}
          className="p-1 rounded-lg text-slate-500 hover:text-foreground
            hover:bg-foreground/5 transition-colors"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {tab === "absence" ? (
        /* ── 부재 pane ── */
        <div className="px-5 pt-4 pb-5 flex flex-col gap-4 sm:min-h-[440px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 대상 멤버 */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                대상 멤버
              </label>
              <div
                className="flex items-center gap-2.5 px-3 py-2 bg-foreground/[0.03]
                  border border-foreground/10 rounded-xl"
              >
                <span
                  className="w-8 h-8 rounded-full shrink-0 bg-bridge-secondary/15
                    text-bridge-secondary text-xs font-bold flex items-center justify-center"
                >
                  {(assigneeName || "?").slice(0, 1)}
                </span>
                <span className="text-xs font-bold text-foreground truncate">
                  {assigneeName || "이 멤버"}
                </span>
              </div>
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
                  className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10
                    rounded-xl py-2 px-3 text-xs text-foreground focus:outline-none
                    focus:ring-2 focus:ring-bridge-secondary/50 transition-all [color-scheme:dark]"
                />
                <span className="text-slate-500 text-xs">~</span>
                <input
                  type="date"
                  value={absEnd}
                  min={absStart}
                  onChange={(e) => setAbsEnd(e.target.value)}
                  className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10
                    rounded-xl py-2 px-3 text-xs text-foreground focus:outline-none
                    focus:ring-2 focus:ring-bridge-secondary/50 transition-all [color-scheme:dark]"
                />
                <span
                  className="shrink-0 text-xs font-bold px-2 py-1 rounded-full
                    bg-bridge-secondary/15 text-bridge-secondary"
                >
                  {absDays > 0 ? `${absDays}일` : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* 빠른 선택 */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
              빠른 선택
            </label>
            <div className="flex flex-wrap gap-2">
              {ABSENCE_PRESETS.map((preset) => {
                const label = preset.replace(/^\S+\s/, "");
                const active = absTitle.trim() === label;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAbsTitle(label)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      active
                        ? "border-bridge-secondary/60 bg-bridge-secondary/15 text-bridge-secondary"
                        : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 내용 */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
              내용
            </label>
            <input
              ref={absTitleInputRef}
              type="text"
              value={absTitle}
              onChange={(e) => setAbsTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="예: 부산 출장 · 오전 반차 · 재택"
              className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
                py-3 px-4 text-foreground placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-bridge-secondary/50 transition-all"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              워크로드 바에 이 텍스트가 표시됩니다
            </p>
          </div>

          <div className="flex-1" />

          {/* 부재 표시 요약 바 */}
          <div
            className="flex items-center gap-2 flex-wrap border border-bridge-secondary/30
              rounded-xl bg-bridge-secondary/[0.06] px-4 py-2.5"
          >
            <span className="text-xs font-bold text-slate-400 shrink-0">
              부재 표시
            </span>
            {crumb("🚶 " + (assigneeName || "이 멤버"))}
            {crumbSep}
            <span
              className={`text-xs font-bold truncate max-w-[170px] ${
                absTitle.trim() ? "text-foreground" : "text-slate-500"
              }`}
            >
              {absTitle.trim() || "내용 입력"}
            </span>
            {crumbSep}
            {crumb(`${fmtShort(absStart)} ~ ${fmtShort(absEnd)}`)}
            <span className="text-xs text-slate-500">
              {absDays > 0 ? (
                <>
                  —{" "}
                  <span className="font-bold text-bridge-secondary">
                    {absDays}일간 부재
                  </span>
                  로 표시됩니다
                </>
              ) : (
                "— 종료일이 시작일보다 빠릅니다"
              )}
            </span>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        /* ── 업무 pane ── */
        <div className="px-5 pt-4 pb-5 flex flex-col gap-4 sm:min-h-[440px]">
          {/* 마일스톤 칩 */}
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-slate-400 block mb-2">
              {t("schedule.workloadCreate.milestoneLabel", "마일스톤")}
            </label>
            <div className="flex flex-wrap gap-2">
              {/* 미분류 (보드 전역 인박스) */}
              <button
                type="button"
                onClick={() => selectMilestoneChip(INBOX)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  msSel === INBOX
                    ? "border-bridge-secondary/60 bg-bridge-secondary/15 text-bridge-secondary"
                    : "border-dashed border-bridge-secondary/30 bg-foreground/[0.03] text-bridge-secondary/70 hover:text-bridge-secondary hover:bg-foreground/5"
                }`}
              >
                📥 {t("schedule.workloadCreate.featureNone", "미분류")}
              </button>

              {milestones.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMilestoneChip(m.id)}
                  title={`${m.start_date} ~ ${m.end_date}`}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    msSel === m.id
                      ? "border-bridge-accent bg-bridge-accent text-white"
                      : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {m.title}
                </button>
              ))}

              {showUnlinkedChip && (
                <button
                  type="button"
                  onClick={() => selectMilestoneChip(UNLINKED)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    msSel === UNLINKED
                      ? "border-bridge-accent bg-bridge-accent text-white"
                      : "border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {t("schedule.workloadCreate.unlinked", "미연결")}
                </button>
              )}
            </div>
          </div>

          {/* 피처 / Task 2열 */}
          <div
            className="flex flex-col sm:flex-row border border-foreground/[0.08] rounded-xl
              overflow-hidden sm:h-[264px] bg-foreground/[0.02]"
          >
            {/* 피처 열 */}
            <div
              className="sm:w-[45%] sm:shrink-0 flex flex-col min-w-0
                border-b sm:border-b-0 sm:border-r border-foreground/[0.08]"
            >
              <div
                className="flex items-center justify-between px-4 py-2.5
                  border-b border-foreground/[0.08]"
              >
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t("schedule.workloadCreate.featureCol", "피처")}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {visibleFeatures?.length ?? ""}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[180px] sm:max-h-none">
                {msSel === INBOX ? (
                  <p className="px-4 py-4 text-xs text-slate-500 leading-relaxed">
                    <span className="font-bold text-foreground">
                      📥 미분류(인박스)
                    </span>
                    에 바로 추가합니다.
                    <br />
                    피처 없이 제목만 입력하면 되고, 나중에 보드에서 분류할 수
                    있어요.
                  </p>
                ) : visibleFeatures == null || (isLoadingTasks && !msLoaded) ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500">
                    <Loader2
                      size={13}
                      className="animate-spin text-bridge-accent"
                    />
                    {t("common.loading", "Loading...")}
                  </div>
                ) : (
                  <>
                    {visibleFeatures.length === 0 && (
                      <p className="px-4 py-3 text-xs text-slate-500">
                        {t(
                          "schedule.workloadCreate.milestoneEmpty",
                          "이 마일스톤에 연결된 Feature가 없습니다",
                        )}
                      </p>
                    )}
                    {visibleFeatures.map((f) => {
                      const count =
                        tasksByFeature[f.id]?.length ?? f.total_tasks;
                      const hasTasks = count > 0;
                      const selected = featSel === f.id;
                      if (!hasTasks) {
                        return (
                          <div
                            key={f.id}
                            className="flex items-center gap-2.5 px-4 py-2.5 text-xs
                              opacity-40 cursor-not-allowed select-none
                              border-l-2 border-transparent"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: f.color }}
                            />
                            <span className="flex-1 truncate text-foreground font-medium">
                              {f.title}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">
                              {t("schedule.workloadCreate.noTasks", "없음")}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={f.id}
                          onClick={() => selectFeature(f.id)}
                          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-xs
                            text-left transition-colors border-l-2 ${
                              selected
                                ? "border-bridge-accent bg-bridge-accent/10"
                                : "border-transparent hover:bg-foreground/5"
                            }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: f.color }}
                          />
                          <span className="flex-1 truncate text-foreground font-medium">
                            {f.title}
                          </span>
                          <span
                            className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full
                              bg-foreground/[0.06] text-slate-400"
                          >
                            {count}
                          </span>
                          <span
                            className="shrink-0 text-slate-500 text-xs"
                            aria-hidden="true"
                          >
                            ›
                          </span>
                        </button>
                      );
                    })}
                    {/* 새 Feature 만들기 */}
                    <button
                      onClick={() => {
                        setFeatSel(NEWF);
                        setTaskSel(null);
                      }}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs
                        font-bold text-left transition-colors border-l-2 ${
                          featSel === NEWF
                            ? "border-bridge-secondary bg-bridge-secondary/10 text-bridge-secondary"
                            : "border-transparent text-bridge-secondary/80 hover:bg-foreground/5 hover:text-bridge-secondary"
                        }`}
                    >
                      <Plus size={12} className="shrink-0" />
                      {t(
                        "schedule.workloadCreate.featureNew",
                        "새 Feature 만들기",
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Task 열 */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-4 py-2.5 border-b border-foreground/[0.08]">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Task
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[200px] sm:max-h-none">
                {msSel === INBOX ? (
                  <p className="px-4 py-4 text-xs text-slate-500">
                    미분류는 Task 선택 없이 바로 추가됩니다
                  </p>
                ) : featSel === NEWF ? (
                  <div className="px-4 py-4">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      <span className="font-bold text-foreground">
                        새 Feature
                      </span>
                      가 만들어지고 그 안에 추가됩니다.
                    </p>
                    <input
                      ref={newFeatureInputRef}
                      type="text"
                      value={newFeatureTitle}
                      onChange={(e) => setNewFeatureTitle(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={t(
                        "schedule.workloadCreate.newFeaturePlaceholder",
                        "새 Feature 이름",
                      )}
                      className="mt-3 w-full bg-foreground/[0.03] border border-foreground/10
                        rounded-xl py-2.5 px-3.5 text-xs text-foreground placeholder-slate-500
                        focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    />
                  </div>
                ) : !selFeature ? (
                  <p className="px-4 py-4 text-xs text-slate-500">
                    {t(
                      "schedule.workloadCreate.pickFeature",
                      "피처를 선택하세요",
                    )}
                  </p>
                ) : (
                  <>
                    {/* 새 테스크 (자동 생성) — 기본 선택 */}
                    <button
                      onClick={() => setTaskSel(AUTO)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs
                        text-left hover:bg-foreground/5 transition-colors"
                    >
                      <span className="flex-1 truncate font-bold text-bridge-accent">
                        ＋{" "}
                        {t(
                          "schedule.workloadCreate.autoTask",
                          "새 테스크 (자동 생성)",
                        )}
                      </span>
                      <span
                        className={`w-[18px] h-[18px] rounded-full shrink-0 border-[1.5px]
                          flex items-center justify-center transition-colors ${
                            taskSel === AUTO
                              ? "border-bridge-accent bg-bridge-accent"
                              : "border-foreground/20"
                          }`}
                      >
                        {taskSel === AUTO && (
                          <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </span>
                    </button>

                    {selFeatureTasks.map((task) => {
                      const selected = taskSel === task.id;
                      return (
                        <div key={task.id}>
                          <button
                            onClick={() => setTaskSel(task.id)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs
                              text-left hover:bg-foreground/5 transition-colors"
                          >
                            <span className="flex-1 truncate text-foreground">
                              {task.title}
                            </span>
                            {task.checklist_total != null && (
                              <span className="shrink-0 text-xs text-slate-500 font-medium">
                                ✓ {task.checklist_completed ?? 0}/
                                {task.checklist_total}
                              </span>
                            )}
                            <span
                              className={`w-[18px] h-[18px] rounded-full shrink-0 border-[1.5px]
                                flex items-center justify-center transition-colors ${
                                  selected
                                    ? "border-bridge-accent bg-bridge-accent"
                                    : "border-foreground/20"
                                }`}
                            >
                              {selected && (
                                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </span>
                          </button>

                          {/* 선택된 테스크 아래 체크리스트 미리보기 */}
                          {selected && (
                            <div
                              className="mx-4 mb-2 border border-foreground/[0.08] rounded-lg
                                overflow-hidden divide-y divide-foreground/[0.06]"
                            >
                              {isLoadingChecklist &&
                              !checklistCache[task.id] ? (
                                <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                                  <Loader2
                                    size={12}
                                    className="animate-spin text-bridge-accent"
                                  />
                                  {t("common.loading", "Loading...")}
                                </div>
                              ) : (
                                <>
                                  {(checklistCache[task.id] ?? []).map(
                                    (item) => (
                                      <div
                                        key={item.id}
                                        className="flex items-center gap-2 px-3 py-1.5 text-xs"
                                      >
                                        <span
                                          className={`w-3 h-3 rounded shrink-0 border flex
                                            items-center justify-center ${
                                              item.completed
                                                ? "bg-bridge-accent border-bridge-accent"
                                                : "border-foreground/20"
                                            }`}
                                        >
                                          {item.completed && (
                                            <Check
                                              size={8}
                                              className="text-white"
                                            />
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
                                    ),
                                  )}
                                  {checklistCache[task.id]?.length === 0 && (
                                    <p className="px-3 py-1.5 text-xs text-slate-500">
                                      아직 체크리스트가 없습니다
                                    </p>
                                  )}
                                  {/* 새 항목이 붙을 자리 */}
                                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                    <span
                                      className="w-3 h-3 rounded shrink-0 border border-dashed
                                        border-bridge-accent/60"
                                    />
                                    <span className="flex-1 truncate font-bold text-bridge-accent">
                                      {title.trim()
                                        ? `＋ ${title.trim()}`
                                        : "＋ 여기에 새 항목이 추가됩니다"}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Title input */}
          <input
            ref={titleInputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selTask
                ? t(
                    "schedule.workloadCreate.checklistPlaceholder",
                    "체크리스트 항목을 입력하세요",
                  )
                : taskSel === AUTO
                  ? t(
                      "schedule.workloadCreate.autoTaskPlaceholder",
                      "새 테스크 제목을 입력하세요",
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

          {/* 추가 위치 요약 바 */}
          {destBar()}

          {/* Error */}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2.5 px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-500 flex-1">
          Esc {t("schedule.workloadCreate.cancel", "취소")}
        </span>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs font-bold text-foreground
            bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-all"
        >
          {t("schedule.workloadCreate.cancel", "취소")}
        </button>
        <button
          onClick={tab === "absence" ? handleSubmitAbsence : handleSubmit}
          disabled={
            (tab === "absence" ? !canSubmitAbsence : !canSubmit) ||
            isSubmitting
          }
          className={`px-5 py-2 rounded-xl text-xs font-bold text-white
            disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
              tab === "absence"
                ? "bg-bridge-secondary hover:bg-bridge-secondary/90"
                : "bg-bridge-accent hover:bg-bridge-accent/90"
            }`}
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
