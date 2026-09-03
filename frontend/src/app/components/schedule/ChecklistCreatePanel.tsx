import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Check } from "lucide-react";
import {
  boardChecklistAPI,
  taskAPI,
  TaskResponse,
  milestoneAPI,
  featureAPI,
  checklistAPI,
  ChecklistItemResponse,
} from "../../utils/api";
import { MotionModal } from "../ui/MotionModal";

// ─── 공용 체크리스트 생성 패널 ───────────────────────────────────────────────
// "체크리스트 항목 이동" 모달과 같은 문법: 마일스톤 칩 → 피처 열 → Task 열.
// 워크로드 "새 업무 추가"와 타임블록 "새로 생성"이 이 패널을 공유한다.
//
// Selection model:
// - msSel   : "INBOX"(보드 인박스) | "UNLINKED"(마일스톤 미연결) | milestoneId
// - featSel : null | "NEWF"(새 피쳐) | featureId
// - taskSel : null | "AUTO"(테스크 자동 생성) | taskId

const INBOX = "INBOX" as const;
const UNLINKED = "UNLINKED" as const;
const NEWF = "NEWF" as const;
const AUTO = "AUTO" as const;

// "MM.DD" 축약 (칩/요약 바 폭이 좁아 연도 생략)
function fmtShort(date: string): string {
  return date.slice(5).replace("-", ".");
}

// 패널이 필요로 하는 최소 형태 — Feature/Milestone(types)과 구조적으로 호환
export interface PanelFeature {
  id: string;
  title: string;
  color: string;
  total_tasks: number;
  inbox?: boolean;
}
export interface PanelMilestone {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  features?: { id: string }[];
}

export interface ChecklistCreatePanelProps {
  open: boolean;
  boardId: string;
  /** 없으면 패널이 직접 로드한다 */
  features?: PanelFeature[];
  /** 없으면 패널이 직접 로드한다 */
  milestones?: PanelMilestone[];
  assigneeId?: string | null;
  contractorId?: string | null;
  /** 생성될 항목의 기간 (payload + 경로 바 우측 표시) */
  startDate?: string;
  dueDate?: string;
  /** 마일스톤 자동 선택 기준 날짜 (기본: startDate) */
  anchorDate?: string;
  /** 경로 바 문장 끝에 "후 타임블록에 연결됩니다"를 붙인다 */
  linkContext?: boolean;
  submitLabel?: string;
  onCreated: (item: ChecklistItemResponse) => void | Promise<void>;
  onCancel: () => void;
}

export function ChecklistCreatePanel({
  open,
  boardId,
  features: featuresProp,
  milestones: milestonesProp,
  assigneeId,
  contractorId,
  startDate,
  dueDate,
  anchorDate,
  linkContext,
  submitLabel,
  onCreated,
  onCancel,
}: ChecklistCreatePanelProps) {
  const { t } = useTranslation();

  // ── Selection ──
  const [msSel, setMsSel] = useState<string>(INBOX);
  const [featSel, setFeatSel] = useState<string | null>(null);
  const [taskSel, setTaskSel] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [newFeatureTitle, setNewFeatureTitle] = useState("");
  // 체크리스트 상세 서브 모달이 열린 task (선택과 독립)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // ── Data ──
  const [selfFeatures, setSelfFeatures] = useState<PanelFeature[] | null>(null);
  const [selfMilestones, setSelfMilestones] = useState<PanelMilestone[] | null>(
    null,
  );
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
  const newFeatureInputRef = useRef<HTMLInputElement>(null);
  const didAutoSelectRef = useRef(false);

  const milestonesEff = milestonesProp ?? selfMilestones ?? [];
  const featuresEff = useMemo(
    () => featuresProp ?? selfFeatures ?? [],
    [featuresProp, selfFeatures],
  );

  // ── Derived ──
  const selectableFeatures = useMemo(
    () => featuresEff.filter((f) => !f.inbox),
    [featuresEff],
  );
  const featureById = useMemo(() => {
    const map: Record<string, PanelFeature> = {};
    for (const f of selectableFeatures) map[f.id] = f;
    return map;
  }, [selectableFeatures]);

  // 마일스톤 스코프 태스크 (진실 = task.milestone_id — 테이블 뷰와 동일 기준)
  const scopedTasks = useMemo(() => {
    if (msSel === INBOX) return [];
    if (msSel === UNLINKED) return allTasks.filter((t) => !t.milestone_id);
    return allTasks.filter((t) => t.milestone_id === msSel);
  }, [allTasks, msSel]);

  const tasksByFeature = useMemo(() => {
    const map: Record<string, TaskResponse[]> = {};
    for (const task of scopedTasks) {
      (map[task.feature_id] ??= []).push(task);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [scopedTasks]);

  // 어떤 마일스톤에도 연결되지 않은 피쳐 (매핑 로드 후에만 판정)
  const unlinkedFeatures = useMemo(() => {
    if (!msLoaded) return [];
    const linked = new Set(Object.values(msFeatureIds).flat());
    return selectableFeatures.filter((f) => !linked.has(f.id));
  }, [msLoaded, msFeatureIds, selectableFeatures]);

  const showUnlinkedChip =
    (msLoaded && unlinkedFeatures.length > 0) ||
    (milestonesEff.length === 0 && selectableFeatures.length > 0);

  // 현재 칩에 해당하는 피처 목록 (마일스톤 매핑 로딩 중이면 null)
  const visibleFeatures = useMemo(() => {
    if (msSel === INBOX) return [];
    if (msSel === UNLINKED) return unlinkedFeatures;
    const ids = msFeatureIds[msSel];
    if (ids == null) return null;
    return ids
      .map((id) => featureById[id])
      .filter((f): f is PanelFeature => !!f);
  }, [msSel, msFeatureIds, featureById, unlinkedFeatures]);

  const selFeature = featSel && featSel !== NEWF ? featureById[featSel] : null;
  const selFeatureTasks = selFeature
    ? (tasksByFeature[selFeature.id] ?? [])
    : [];
  const selTask =
    taskSel && taskSel !== AUTO
      ? selFeatureTasks.find((task) => task.id === taskSel)
      : null;
  const detailTask = detailTaskId
    ? selFeatureTasks.find((task) => task.id === detailTaskId)
    : null;
  const selMilestone =
    msSel !== INBOX && msSel !== UNLINKED
      ? milestonesEff.find((m) => m.id === msSel)
      : null;

  // ── Auto-focus title input on open ──
  useEffect(() => {
    if (open) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [open]);

  // ── On open: reset form ──
  useEffect(() => {
    if (!open) {
      didAutoSelectRef.current = false;
      return;
    }
    setTitle("");
    setNewFeatureTitle("");
    setMsSel(INBOX);
    setFeatSel(null);
    setTaskSel(null);
    setDetailTaskId(null);
    setChecklistCache({});
    setError(null);
  }, [open]);

  // ── 기준 날짜가 걸친 마일스톤 자동 선택 (마일스톤 목록이 늦게 와도 1회만) ──
  const anchor = anchorDate ?? startDate;
  useEffect(() => {
    if (!open || didAutoSelectRef.current) return;
    if (!anchor) {
      didAutoSelectRef.current = true;
      return;
    }
    if (milestonesEff.length === 0) return;
    didAutoSelectRef.current = true;
    // 기간이 걸친 마일스톤 중 가장 구체적인(짧은) 것
    const span = (m: PanelMilestone) =>
      Date.parse(m.end_date) - Date.parse(m.start_date);
    const covering = milestonesEff
      .filter((m) => m.start_date <= anchor && anchor <= m.end_date)
      .sort((a, b) => span(a) - span(b));
    if (covering[0]) setMsSel(covering[0].id);
  }, [open, milestonesEff, anchor]);

  // ── features/milestones가 prop으로 안 오면 직접 로드 ──
  useEffect(() => {
    if (!open || featuresProp) return;
    let cancelled = false;
    featureAPI
      .getFeatures(boardId)
      .then((res) => {
        if (cancelled) return;
        setSelfFeatures(
          res.features.map((f) => ({
            id: f.id,
            title: f.title,
            color: f.color,
            total_tasks: f.total_tasks,
            inbox: (f as { inbox?: boolean }).inbox,
          })),
        );
      })
      .catch((err) => console.error("Failed to load features:", err));
    return () => {
      cancelled = true;
    };
  }, [open, boardId, featuresProp]);

  useEffect(() => {
    if (!open || milestonesProp) return;
    let cancelled = false;
    milestoneAPI
      .getMilestones(boardId)
      .then((res) => {
        if (!cancelled) setSelfMilestones(res.milestones ?? []);
      })
      .catch((err) => console.error("Failed to load milestones:", err));
    return () => {
      cancelled = true;
    };
  }, [open, boardId, milestonesProp]);

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
    if (!open || milestonesEff.length === 0) {
      if (open) setMsLoaded(milestonesEff.length === 0);
      return;
    }
    let cancelled = false;
    setMsLoaded(false);
    setMsFeatureIds({});
    (async () => {
      const entries = await Promise.all(
        milestonesEff.map(async (m) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId, milestonesProp, selfMilestones]);

  // ── 상세 서브 모달 열릴 때 체크리스트 lazy load ──
  useEffect(() => {
    if (!detailTaskId) return;
    if (checklistCache[detailTaskId]) return;
    let cancelled = false;
    setIsLoadingChecklist(true);
    checklistAPI
      .getChecklist(boardId, detailTaskId)
      .then((res) => {
        if (!cancelled) {
          setChecklistCache((prev) => ({ ...prev, [detailTaskId]: res.items }));
        }
      })
      .catch((err) => console.error("Failed to load checklist:", err))
      .finally(() => {
        if (!cancelled) setIsLoadingChecklist(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailTaskId, boardId, checklistCache]);

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

  // ── Submit ──
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

      // 자동 생성될 태스크를 현재 마일스톤에 배정 (미분류/미연결이면 없음)
      const milestoneId =
        msSel !== INBOX && msSel !== UNLINKED ? msSel : undefined;

      if (featSel === NEWF) {
        payload.new_feature_title = newFeatureTitle.trim();
        payload.milestone_id = milestoneId;
      } else if (featSel && msSel !== INBOX) {
        payload.feature_id = featSel;
        if (taskSel && taskSel !== AUTO) {
          payload.task_id = taskSel;
        } else {
          // AUTO: no task → server auto-creates one in this milestone
          payload.milestone_id = milestoneId;
        }
      }
      // 미분류/피처 미선택 → no feature → goes to inbox

      const item = await boardChecklistAPI.createFromWorkload(
        boardId,
        payload,
      );
      await onCreated(item);
    } catch (err) {
      console.error("Failed to create checklist item:", err);
      setError(t("common.error", "An error occurred"));
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
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
    t,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSubmit) handleSubmit();
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
    // linkContext면 결과 문장 끝을 "후 타임블록에 연결됩니다"로 바꾼다
    const tail = (defaultTail: string) =>
      linkContext
        ? t("schedule.workloadCreate.destLinkTail", "후 타임블록에 연결됩니다")
        : defaultTail;

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
            tail(t("schedule.workloadCreate.destInboxTail", "됩니다")),
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
            tail(
              t(
                "schedule.workloadCreate.destNewFeatureTail",
                "되고 그 안에 담깁니다",
              ),
            ),
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
              {crumb(
                "＋ " + t("schedule.workloadCreate.newTaskShort", "새 테스크"),
              )}
              {hint(
                tail(t("schedule.workloadCreate.destAutoTail", "됩니다")),
                t("schedule.workloadCreate.destAuto", "테스크가 자동 생성"),
              )}
            </>
          ) : (
            <>
              {crumb(selTask.title)}
              {hint(
                tail(t("schedule.workloadCreate.destTaskTail", "됩니다")),
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
        {startDate && dueDate && (
          <span className="text-xs text-slate-600 ml-auto shrink-0">
            {fmtShort(startDate)} ~ {fmtShort(dueDate)}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="px-5 pt-4 pb-5 flex flex-col gap-4 sm:min-h-[540px]">
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

            {milestonesEff.map((m) => (
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
            overflow-hidden sm:h-[360px] bg-foreground/[0.02]"
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
              ) : visibleFeatures == null || isLoadingTasks ? (
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
                    // 마일스톤 스코프 카운트 — 다른 마일스톤 태스크는 세지 않는다.
                    // 0이어도 선택 가능: AUTO가 이 마일스톤에 새 태스크를 만든다.
                    const count = tasksByFeature[f.id]?.length ?? 0;
                    const selected = featSel === f.id;
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
                    const hasChecklist = (task.checklist_total ?? 0) > 0;
                    return (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setTaskSel(task.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setTaskSel(task.id);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs
                          text-left cursor-pointer hover:bg-foreground/5 transition-colors group"
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
                        {hasChecklist && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailTaskId(task.id);
                            }}
                            className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-lg
                              border border-foreground/10 text-slate-400
                              hover:text-foreground hover:border-bridge-accent/60 transition-colors"
                          >
                            {t("schedule.workloadCreate.taskDetail", "상세")}
                          </button>
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

      {/* Footer */}
      <div className="flex items-center gap-2.5 px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-500 flex-1">
          Esc {t("schedule.workloadCreate.cancel", "취소")}
        </span>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-bold text-foreground
            bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-all"
        >
          {t("schedule.workloadCreate.cancel", "취소")}
        </button>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-bridge-accent
            disabled:opacity-50 disabled:cursor-not-allowed
            hover:bg-bridge-accent/90 transition-all"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            (submitLabel ?? t("schedule.workloadCreate.submit", "추가"))
          )}
        </button>
      </div>

      {/* 체크리스트 상세 서브 모달 — Esc·바깥 클릭은 이 모달만 닫는다 (escStack) */}
      <MotionModal
        open={!!detailTask}
        onClose={() => setDetailTaskId(null)}
        className="w-full sm:max-w-md"
        accentColor
        aria-label={t(
          "schedule.workloadCreate.checklistDetail",
          "체크리스트 상세",
        )}
      >
        {detailTask && (
          <>
            {/* Header: 브레드크럼 + task 제목 + 진행률 */}
            <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  {selMilestone && (
                    <>
                      {crumb(selMilestone.title)}
                      {crumbSep}
                    </>
                  )}
                  {selFeature && crumb(selFeature.title, selFeature.color)}
                </div>
                <h3 className="text-sm font-bold text-foreground truncate">
                  {detailTask.title}
                </h3>
              </div>
              {detailTask.checklist_total != null && (
                <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-foreground/[0.06] text-slate-400">
                  ✓ {detailTask.checklist_completed ?? 0}/
                  {detailTask.checklist_total}
                </span>
              )}
            </div>

            {/* Body: 읽기 전용 체크리스트 */}
            <div className="px-5 py-3 max-h-[50dvh] overflow-y-auto custom-scrollbar divide-y divide-foreground/[0.06]">
              {isLoadingChecklist && !checklistCache[detailTask.id] ? (
                <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                  <Loader2
                    size={14}
                    className="animate-spin text-bridge-accent"
                  />
                  {t("common.loading", "Loading...")}
                </div>
              ) : (
                <>
                  {(checklistCache[detailTask.id] ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 py-2 text-xs"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded shrink-0 border flex
                          items-center justify-center ${
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
                  {checklistCache[detailTask.id]?.length === 0 && (
                    <p className="py-2 text-xs text-slate-500">
                      아직 체크리스트가 없습니다
                    </p>
                  )}
                  {/* 새 항목이 붙을 자리 */}
                  <div className="flex items-center gap-2.5 py-2 text-xs">
                    <span
                      className="w-3.5 h-3.5 rounded shrink-0 border border-dashed
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

            {/* Footer */}
            <div className="flex items-center gap-2.5 px-5 py-3 border-t border-foreground/[0.08]">
              <span className="text-xs text-slate-500 flex-1">
                Esc {t("schedule.workloadCreate.close", "닫기")}
              </span>
              <button
                onClick={() => setDetailTaskId(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-foreground
                  bg-foreground/5 border border-foreground/10 hover:bg-foreground/10 transition-all"
              >
                {t("schedule.workloadCreate.close", "닫기")}
              </button>
              <button
                onClick={() => {
                  setTaskSel(detailTask.id);
                  setDetailTaskId(null);
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-bridge-accent
                  hover:bg-bridge-accent/90 transition-all"
              >
                {t("schedule.workloadCreate.selectThisTask", "이 TASK 선택")}
              </button>
            </div>
          </>
        )}
      </MotionModal>
    </>
  );
}

// ─── 타임블록용 래퍼 모달 ────────────────────────────────────────────────────
// 타임블록 "새로 생성"에서 띄우는 독립 모달. 생성된 항목을 onCreated로 돌려준다.

interface ChecklistQuickCreateModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  assigneeId?: string | null;
  /** 마일스톤 자동 선택 기준 날짜 (타임블록 날짜) */
  anchorDate?: string;
  onCreated: (item: ChecklistItemResponse) => void | Promise<void>;
}

export function ChecklistQuickCreateModal({
  open,
  onClose,
  boardId,
  assigneeId,
  anchorDate,
  onCreated,
}: ChecklistQuickCreateModalProps) {
  const { t } = useTranslation();
  return (
    <MotionModal
      open={open}
      onClose={onClose}
      className="w-full sm:max-w-[840px]"
      accentColor
    >
      <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <Plus
          className="w-5 h-5 text-bridge-accent shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground">
            {t("schedule.workloadCreate.quickTitle", "새 체크리스트 항목")}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(
              "schedule.workloadCreate.quickSubtitle",
              "추가할 위치를 선택하세요 · 생성 후 타임블록에 연결됩니다",
            )}
          </p>
        </div>
      </div>
      <ChecklistCreatePanel
        open={open}
        boardId={boardId}
        assigneeId={assigneeId}
        anchorDate={anchorDate}
        linkContext
        submitLabel={t("schedule.workloadCreate.quickSubmit", "생성 후 연결")}
        onCreated={onCreated}
        onCancel={onClose}
      />
    </MotionModal>
  );
}
