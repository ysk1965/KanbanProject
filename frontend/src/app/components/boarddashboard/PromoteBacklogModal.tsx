import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import { personalTaskAPI, taskAPI } from "../../utils/api";
import type { Feature, PersonalTask } from "../../types";
import { getTodayDateString } from "../../utils/dateUtils";

export type PromoteTarget = "TIMEBLOCK" | "TASK" | "CHECKLIST_ITEM";

interface PromoteBacklogModalProps {
  boardId: string;
  item: PersonalTask;
  /** 어느 대상으로 열렸는지 — 모달 안에서 바꿀 수 있다 */
  target: PromoteTarget;
  /** 간트 날짜 칸에 떨궈서 열렸다면 그 날짜 — 태스크의 시작·마감으로 쓴다 */
  presetDate?: string;
  features: Feature[];
  onClose: () => void;
  onPromoted: (updated: PersonalTask) => void;
}

/** "HH:mm" 한 시간 뒤 */
function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const next = (h + 1) % 24;
  return `${String(next).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 지금 시각을 정시로 내림 — 타임블록 기본값 */
function currentHour(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:00`;
}

/**
 * 백로그 항목 승격 모달.
 *
 * 적을 때는 제목 하나만 받았으므로, 대상마다 꼭 필요한 것만 여기서 받는다.
 * 드래그로 승격할 때는 놓은 자리가 이 값들을 대신하므로 이 모달을 거치지 않는다.
 */
export function PromoteBacklogModal({
  boardId,
  item,
  target: initialTarget,
  presetDate,
  features,
  onClose,
  onPromoted,
}: PromoteBacklogModalProps) {
  const { t } = useTranslation();

  const [target, setTarget] = useState<PromoteTarget>(initialTarget);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 타임블록
  const [date, setDate] = useState(getTodayDateString());
  const [startTime, setStartTime] = useState(currentHour());
  const [endTime, setEndTime] = useState(addHour(currentHour()));

  // 태스크 — 피처에 붙는다 (태스크는 피처에 속한 구조라 블록만으로는 만들 수 없다)
  const [featureId, setFeatureId] = useState(features[0]?.id ?? "");

  // 체크리스트 — 붙일 태스크
  const [taskId, setTaskId] = useState("");
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  useEffect(() => {
    if (target !== "CHECKLIST_ITEM" || tasks.length || tasksLoading) return;
    setTasksLoading(true);
    taskAPI
      .getTasks(boardId)
      .then((res) => {
        const list = (res.tasks ?? []).map((task) => ({
          id: task.id,
          title: task.title,
        }));
        setTasks(list);
        setTaskId((prev) => prev || list[0]?.id || "");
      })
      .catch(() =>
        setError(t("backlog.taskLoadFailed", "태스크 목록을 불러오지 못했습니다.")),
      )
      .finally(() => setTasksLoading(false));
  }, [target, boardId, tasks.length, tasksLoading, t]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (target === "TASK") return !!featureId;
    if (target === "CHECKLIST_ITEM") return !!taskId;
    return !!date && !!startTime && !!endTime && startTime < endTime;
  }, [submitting, target, featureId, taskId, date, startTime, endTime]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await personalTaskAPI.promote(item.id, {
        target,
        ...(target === "TASK"
          ? {
              feature_id: featureId,
              // 간트에 떨궈서 열렸다면 그 날짜에 바가 생겨야 한다
              ...(presetDate
                ? { start_date: presetDate, due_date: presetDate }
                : {}),
            }
          : {}),
        ...(target === "CHECKLIST_ITEM" ? { task_id: taskId } : {}),
        ...(target === "TIMEBLOCK"
          ? { scheduled_date: date, start_time: startTime, end_time: endTime }
          : {}),
      });
      onPromoted(updated);
    } catch {
      setError(t("backlog.promoteFailed", "승격에 실패했습니다."));
      setSubmitting(false);
    }
  }, [
    canSubmit,
    item.id,
    target,
    featureId,
    taskId,
    presetDate,
    date,
    startTime,
    endTime,
    onPromoted,
    t,
  ]);

  const TARGETS: { key: PromoteTarget; label: string }[] = [
    { key: "TIMEBLOCK", label: t("backlog.kindTimeblock", "타임블록") },
    { key: "CHECKLIST_ITEM", label: t("backlog.kindChecklist", "체크리스트") },
    { key: "TASK", label: t("backlog.kindTask", "태스크") },
  ];

  const fieldClass =
    "w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";
  const labelClass =
    "text-xs font-bold uppercase tracking-widest text-slate-400";

  return (
    <MotionModal
      open
      onClose={onClose}
      accentColor
      className="w-full sm:max-w-md"
      aria-label={t("backlog.promoteTitle", "백로그 항목 승격")}
    >
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">
            {t("backlog.promoteTitle", "백로그 항목 승격")}
          </h2>
          <p className="text-xs text-slate-500 truncate mt-0.5">{item.title}</p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4 flex flex-col gap-4">
        <div className="flex items-center gap-1">
          {TARGETS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setTarget(option.key)}
              aria-pressed={target === option.key}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                target === option.key
                  ? "bg-bridge-accent/15 text-bridge-accent"
                  : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {target === "TIMEBLOCK" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="promote-date">
                {t("backlog.date", "날짜")}
              </label>
              <input
                id="promote-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="promote-start">
                  {t("backlog.startTime", "시작")}
                </label>
                <input
                  id="promote-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    if (e.target.value >= endTime) {
                      setEndTime(addHour(e.target.value));
                    }
                  }}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass} htmlFor="promote-end">
                  {t("backlog.endTime", "종료")}
                </label>
                <input
                  id="promote-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t(
                "backlog.timeblockNote",
                "항목은 백로그에 남습니다. 시간을 잡았을 뿐 아직 끝난 일이 아닙니다.",
              )}
            </p>
          </>
        )}

        {target === "TASK" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="promote-feature">
                {t("backlog.feature", "붙일 피처")}
              </label>
              <select
                id="promote-feature"
                value={featureId}
                onChange={(e) => setFeatureId(e.target.value)}
                className={fieldClass}
              >
                {features.length === 0 && (
                  <option value="">
                    {t("backlog.noFeature", "피처가 없습니다")}
                  </option>
                )}
                {features.map((feature) => (
                  <option key={feature.id} value={feature.id}>
                    {feature.title}
                  </option>
                ))}
              </select>
            </div>
            {presetDate && (
              <p className="text-xs font-bold text-bridge-secondary">
                {t("backlog.presetDate", "{{date}}에 배치됩니다", {
                  date: presetDate,
                })}
              </p>
            )}
            <p className="text-xs text-slate-500 leading-relaxed">
              {t(
                "backlog.promoteNote",
                "담당자는 나로 지정됩니다. 승격 후 이 항목은 대기 목록에서 빠집니다.",
              )}
            </p>
          </>
        )}

        {target === "CHECKLIST_ITEM" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass} htmlFor="promote-task">
                {t("backlog.task", "붙일 태스크")}
              </label>
              {tasksLoading ? (
                <div className="flex items-center gap-2 py-2.5">
                  <Loader2
                    className="w-4 h-4 animate-spin text-bridge-accent"
                    aria-hidden="true"
                  />
                  <span className="text-xs text-slate-500">
                    {t("common.loading", "불러오는 중")}
                  </span>
                </div>
              ) : (
                <select
                  id="promote-task"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className={fieldClass}
                >
                  {tasks.length === 0 && (
                    <option value="">
                      {t("backlog.noTask", "태스크가 없습니다")}
                    </option>
                  )}
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t(
                "backlog.promoteNote",
                "담당자는 나로 지정됩니다. 승격 후 이 항목은 대기 목록에서 빠집니다.",
              )}
            </p>
          </>
        )}

        {error && (
          <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">
          {t("common.escToClose", "Esc 닫기")}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            {t("common.cancel", "취소")}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting && (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            )}
            {t("backlog.promote", "승격")}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
