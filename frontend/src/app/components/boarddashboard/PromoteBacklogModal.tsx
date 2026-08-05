import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Search } from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import {
  checklistAPI,
  personalTaskAPI,
  taskAPI,
  type TaskResponse,
} from "../../utils/api";
import type { Feature, PersonalTask } from "../../types";
import { getDDay, getTodayDateString } from "../../utils/dateUtils";
import { getAssigneeHex } from "../../utils/assigneeColor";

export type PromoteTarget = "TIMEBLOCK" | "TASK" | "CHECKLIST_ITEM";

interface PromoteBacklogModalProps {
  boardId: string;
  item: PersonalTask;
  /** 어느 대상으로 열렸는지 — 모달 안에서 바꿀 수 있다 */
  target: PromoteTarget;
  /** 간트 날짜 칸에 떨궈서 열렸다면 그 날짜 — 태스크의 시작·마감으로 쓴다 */
  presetDate?: string;
  features: Feature[];
  /** 나 — 목록에서 내가 맡은 태스크를 위로 끌어올리는 데 쓴다 */
  userId?: string;
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
 * 최근에 붙인 곳 — 대상별로 따로 기억한다.
 * 백로그 정리는 몰아서 하는 일이라 방금 붙인 곳에 또 붙일 확률이 가장 높다.
 */
const RECENT_MAX = 3;
const recentKey = (boardId: string, target: PromoteTarget) =>
  `bridge.backlog.promoteRecent.${boardId}.${target}`;

function readRecent(boardId: string, target: PromoteTarget): string[] {
  try {
    const raw = localStorage.getItem(recentKey(boardId, target));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function pushRecent(boardId: string, target: PromoteTarget, id: string) {
  try {
    const next = [
      id,
      ...readRecent(boardId, target).filter((value) => value !== id),
    ].slice(0, RECENT_MAX);
    localStorage.setItem(recentKey(boardId, target), JSON.stringify(next));
  } catch {
    // 저장 실패는 조용히 넘긴다 — 순서 힌트일 뿐 기능이 아니다
  }
}

/** 목록 한 덩어리 — 검색 중에는 섹션을 접고 하나로 합친다 */
interface Section<T> {
  key: string;
  label: string;
  color?: string;
  items: T[];
}

/**
 * 백로그 항목 승격 모달.
 *
 * 적을 때는 제목 하나만 받았으므로, 대상마다 꼭 필요한 것만 여기서 받는다.
 * 붙일 곳은 드롭다운이 아니라 본문 자체가 목록이다 — 이미 모달인데 그 안에서 또
 * 팝오버를 여는 건 클릭만 한 번 더 받는 일이라, 탭을 고르면 그 대상의 목록이
 * 바로 펼쳐지고 검색창이 커서를 받는다.
 * 드래그로 승격할 때는 놓은 자리가 이 값들을 대신하므로 이 모달을 거치지 않는다.
 */
export function PromoteBacklogModal({
  boardId,
  item,
  target: initialTarget,
  presetDate,
  features,
  userId,
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

  // 붙일 곳 — 고르기 전에는 비어 있다. 아무거나 미리 골라 두면
  // 고르지 않고 승격을 눌러 엉뚱한 곳에 붙는다.
  const [featureId, setFeatureId] = useState("");
  const [taskId, setTaskId] = useState("");

  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksLoaded, setTasksLoaded] = useState(false);

  // 목록 좁히기
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [featureFilter, setFeatureFilter] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isPicker = target !== "TIMEBLOCK";
  const isFeatureMode = target === "TASK";

  useEffect(() => {
    if (target !== "CHECKLIST_ITEM" || tasksLoaded || tasksLoading) return;
    setTasksLoading(true);
    taskAPI
      .getTasks(boardId)
      .then((res) => {
        setTasks(res.tasks ?? []);
        setTasksLoaded(true);
      })
      .catch(() =>
        setError(
          t("backlog.taskLoadFailed", "태스크 목록을 불러오지 못했습니다."),
        ),
      )
      .finally(() => setTasksLoading(false));
  }, [target, boardId, tasksLoaded, tasksLoading, t]);

  /** 탭을 바꾸면 좁히기 조건과 고른 것을 비운다 — 다른 목록이라 이어질 이유가 없다 */
  const switchTarget = useCallback((next: PromoteTarget) => {
    setTarget(next);
    setQuery("");
    setFeatureFilter(null);
    setShowDone(false);
    setActiveIndex(0);
    setFeatureId("");
    setTaskId("");
    setError(null);
  }, []);

  // 열자마자 검색창에 커서 — 손이 바로 좁히기로 간다
  useEffect(() => {
    if (!isPicker) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [isPicker, target]);

  const recentIds = useMemo(
    () => (isPicker ? readRecent(boardId, target) : []),
    [boardId, target, isPicker],
  );

  /** 태스크 섹션 — 최근에 붙인 곳 → 내 태스크 → 피처별 */
  const taskSections = useMemo<Section<TaskResponse>[]>(() => {
    const q = query.trim().toLowerCase();

    let pool = tasks.filter((task) => showDone || !task.completed);
    if (featureFilter) {
      pool = pool.filter((task) => task.feature_id === featureFilter);
    }

    if (q) {
      const hit = pool.filter(
        (task) =>
          task.title.toLowerCase().includes(q) ||
          (task.feature_title ?? "").toLowerCase().includes(q) ||
          (task.task_key ?? "").toLowerCase().includes(q),
      );
      return [
        { key: "search", label: t("backlog.sectionSearch", "검색 결과"), items: hit },
      ];
    }

    const used = new Set<string>();
    const take = (predicate: (task: TaskResponse) => boolean) => {
      const picked = pool.filter((task) => !used.has(task.id) && predicate(task));
      picked.forEach((task) => used.add(task.id));
      return picked;
    };

    const sections: Section<TaskResponse>[] = [];

    const recent = recentIds
      .map((id) => pool.find((task) => task.id === id))
      .filter((task): task is TaskResponse => !!task);
    recent.forEach((task) => used.add(task.id));
    if (recent.length) {
      sections.push({
        key: "recent",
        label: t("backlog.sectionRecent", "최근에 붙인 곳"),
        items: recent,
      });
    }

    if (userId) {
      const mine = take((task) => !!task.assignees?.some((a) => a.id === userId));
      if (mine.length) {
        sections.push({
          key: "mine",
          label: t("backlog.sectionMine", "내 태스크"),
          items: mine,
        });
      }
    }

    // 나머지는 피처별로 — 보드에 놓인 피처 순서를 그대로 따른다
    const byFeature = new Map<string, TaskResponse[]>();
    take(() => true).forEach((task) => {
      const list = byFeature.get(task.feature_id);
      if (list) list.push(task);
      else byFeature.set(task.feature_id, [task]);
    });

    features.forEach((feature) => {
      const items = byFeature.get(feature.id);
      if (!items?.length) return;
      byFeature.delete(feature.id);
      sections.push({
        key: `f-${feature.id}`,
        label: feature.title,
        color: feature.color,
        items,
      });
    });
    // 보드 피처 목록에 없는 것(인박스 등)은 응답이 알려준 이름으로 뒤에 붙인다
    byFeature.forEach((items, id) => {
      sections.push({
        key: `f-${id}`,
        label: items[0]?.feature_title ?? "",
        color: items[0]?.feature_color,
        items,
      });
    });

    return sections;
  }, [tasks, showDone, featureFilter, query, recentIds, userId, features, t]);

  /** 피처 섹션 — 최근에 붙인 곳만 위로 올리고 나머지는 보드 순서 */
  const featureSections = useMemo<Section<Feature>[]>(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? features.filter((feature) => feature.title.toLowerCase().includes(q))
      : features;

    if (q) {
      return [
        { key: "search", label: t("backlog.sectionSearch", "검색 결과"), items: pool },
      ];
    }

    const recent = recentIds
      .map((id) => pool.find((feature) => feature.id === id))
      .filter((feature): feature is Feature => !!feature);
    const rest = pool.filter((feature) => !recent.includes(feature));

    const sections: Section<Feature>[] = [];
    if (recent.length) {
      sections.push({
        key: "recent",
        label: t("backlog.sectionRecent", "최근에 붙인 곳"),
        items: recent,
      });
    }
    if (rest.length) {
      sections.push({
        key: "all",
        label: t("backlog.feature", "붙일 피처"),
        items: rest,
      });
    }
    return sections;
  }, [features, query, recentIds, t]);

  /** 키보드 이동을 위해 섹션을 펼친 순서 */
  const flatIds = useMemo(
    () =>
      isFeatureMode
        ? featureSections.flatMap((section) => section.items.map((f) => f.id))
        : taskSections.flatMap((section) => section.items.map((task) => task.id)),
    [isFeatureMode, featureSections, taskSections],
  );

  useEffect(() => {
    setActiveIndex((prev) =>
      prev >= flatIds.length ? Math.max(0, flatIds.length - 1) : prev,
    );
  }, [flatIds.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const pick = useCallback(
    (id: string) => {
      if (isFeatureMode) setFeatureId(id);
      else setTaskId(id);
    },
    [isFeatureMode],
  );

  /** 검색창에서도, 목록 안에서도 같은 커서를 움직인다 */
  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, flatIds.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const id = flatIds[activeIndex];
        if (id) pick(id);
      }
    },
    [flatIds, activeIndex, pick],
  );

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === taskId) ?? null,
    [tasks, taskId],
  );
  const selectedFeature = useMemo(
    () => features.find((feature) => feature.id === featureId) ?? null,
    [features, featureId],
  );

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

      // 승격 API는 체크리스트 항목에 날짜를 받지 않는다(제목·담당자만 만든다).
      // 간트 날짜 칸에 떨궈서 열린 경우엔 그 자리에 바가 생겨야 하므로 여기서 채운다.
      if (
        target === "CHECKLIST_ITEM" &&
        presetDate &&
        updated.promoted_ref_id
      ) {
        try {
          await checklistAPI.patchItem(
            boardId,
            taskId,
            updated.promoted_ref_id,
            { start_date: presetDate, due_date: presetDate },
          );
        } catch {
          // 항목은 이미 만들어졌다 — 날짜만 비어 배치 레일에 남는다(복구 가능한 상태)
        }
      }

      if (target === "TASK") pushRecent(boardId, target, featureId);
      if (target === "CHECKLIST_ITEM") pushRecent(boardId, target, taskId);

      onPromoted(updated);
    } catch {
      setError(t("backlog.promoteFailed", "승격에 실패했습니다."));
      setSubmitting(false);
    }
  }, [
    canSubmit,
    boardId,
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

  const headTitle =
    target === "TASK"
      ? t("backlog.promoteToTask", "태스크로 승격")
      : target === "CHECKLIST_ITEM"
        ? t("backlog.promoteToChecklist", "체크리스트로 승격")
        : t("backlog.promoteToTimeblock", "타임블록으로 승격");

  const fieldClass =
    "w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all";
  const labelClass =
    "text-xs font-bold uppercase tracking-widest text-slate-400";
  const chipClass = (on: boolean) =>
    `flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full text-xs border transition-colors ${
      on
        ? "bg-bridge-accent/15 text-bridge-accent border-transparent font-bold"
        : "text-slate-400 border-foreground/10 hover:text-foreground"
    }`;

  /** 공통 행 — 색 점 · 제목 · 한 줄 컨텍스트 · 꼬리표(키/진행률) · 선택 표시 */
  const renderRow = (
    id: string,
    idx: number,
    selected: boolean,
    color: string | undefined,
    title: string,
    meta: React.ReactNode,
    tail: React.ReactNode,
  ) => (
    <button
      key={id}
      type="button"
      role="option"
      aria-selected={selected}
      data-idx={idx}
      onClick={() => pick(id)}
      onMouseEnter={() => setActiveIndex(idx)}
      className={`w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded-lg border transition-colors ${
        selected
          ? "bg-bridge-accent/15 border-bridge-accent/50"
          : idx === activeIndex
            ? "bg-bridge-accent/10 border-bridge-accent/25"
            : "border-transparent hover:bg-foreground/5"
      }`}
    >
      <span
        className="shrink-0 w-2 h-2 rounded-full mt-1.5"
        style={{ backgroundColor: color || "#64748b" }}
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0">
        <span
          className={`block truncate text-sm text-foreground ${
            selected ? "font-bold" : "font-medium"
          }`}
        >
          {title}
        </span>
        <span className="flex items-center flex-wrap gap-x-1.5 gap-y-1 mt-0.5 text-xs text-slate-500">
          {meta}
        </span>
      </span>
      <span className="shrink-0 flex items-center gap-2 mt-0.5">
        {tail}
        {selected && (
          <Check className="w-4 h-4 text-bridge-accent" aria-hidden="true" />
        )}
      </span>
    </button>
  );

  const renderTaskRow = (task: TaskResponse, idx: number) => {
    const dday = getDDay(task.due_date);
    const assignee = task.assignees?.[0];
    const extra = (task.assignees?.length ?? 0) - 1;
    return renderRow(
      task.id,
      idx,
      task.id === taskId,
      task.feature_color,
      task.title,
      <>
        <span className="truncate max-w-[10rem]">{task.feature_title}</span>
        {task.block_name && (
          <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-slate-400">
            {task.block_name}
          </span>
        )}
        {assignee ? (
          <span className="flex items-center gap-1">
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ backgroundColor: getAssigneeHex(assignee.name) }}
              aria-hidden="true"
            >
              {assignee.name.slice(0, 1)}
            </span>
            <span>
              {assignee.name}
              {extra > 0 ? ` +${extra}` : ""}
            </span>
          </span>
        ) : (
          <span className="text-slate-600">
            {t("backlog.noAssignee", "담당 없음")}
          </span>
        )}
        {dday.text && (
          <span
            className={
              dday.urgency === "normal" || dday.urgency === "none"
                ? ""
                : "font-bold text-amber-600 dark:text-amber-400"
            }
          >
            {dday.text}
          </span>
        )}
        {!!task.checklist_total && (
          <span>
            {t("backlog.checklistCount", "체크 {{done}}/{{total}}", {
              done: task.checklist_completed ?? 0,
              total: task.checklist_total,
            })}
          </span>
        )}
      </>,
      task.task_key ? (
        <span className="text-xs text-slate-600 tabular-nums">
          {task.task_key}
        </span>
      ) : null,
    );
  };

  const renderFeatureRow = (feature: Feature, idx: number) =>
    renderRow(
      feature.id,
      idx,
      feature.id === featureId,
      feature.color,
      feature.title,
      <>
        <span>
          {t("backlog.taskCount", "태스크 {{done}}/{{total}}", {
            done: feature.completed_tasks,
            total: feature.total_tasks,
          })}
        </span>
        <span className="w-14 h-1 rounded-full bg-foreground/10 overflow-hidden">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${feature.progress_percentage}%`,
              backgroundColor: feature.color,
            }}
          />
        </span>
      </>,
      <span className="text-xs text-slate-600 tabular-nums">
        {feature.progress_percentage}%
      </span>,
    );

  const sections: Section<TaskResponse | Feature>[] = isFeatureMode
    ? featureSections
    : taskSections;
  const isEmpty = flatIds.length === 0;
  // 섹션을 가로지르는 행 번호 — 키보드 커서(flatIds)와 같은 순서를 유지한다
  let rowIndex = -1;

  return (
    <MotionModal
      open
      onClose={onClose}
      accentColor
      className="w-full sm:max-w-lg"
      aria-label={t("backlog.promoteTitle", "백로그 항목 승격")}
    >
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground">{headTitle}</h2>
          <p className="text-xs text-slate-500 truncate mt-0.5">{item.title}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 px-5 pt-3 pb-2.5">
        {TARGETS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => switchTarget(option.key)}
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
        <div className="px-5 pb-5 flex flex-col gap-4">
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
        </div>
      )}

      {isPicker && (
        <>
          <div className="px-5 pb-3 flex flex-col gap-2.5 border-b border-foreground/[0.08]">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleListKeyDown}
                  placeholder={
                    isFeatureMode
                      ? t("backlog.searchFeaturePlaceholder", "피처 이름으로 검색")
                      : t("backlog.searchTaskPlaceholder", "제목 · 피처 · 키로 검색")
                  }
                  aria-label={
                    isFeatureMode
                      ? t("backlog.feature", "붙일 피처")
                      : t("backlog.task", "붙일 태스크")
                  }
                  className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 pl-9 pr-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
              </div>
              {!isFeatureMode && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDone((prev) => !prev);
                    setActiveIndex(0);
                  }}
                  aria-pressed={showDone}
                  className={chipClass(showDone)}
                >
                  {t("backlog.includeDone", "완료 포함")}
                </button>
              )}
            </div>

            {!isFeatureMode && features.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                {features.map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => {
                      setFeatureFilter((prev) =>
                        prev === feature.id ? null : feature.id,
                      );
                      setActiveIndex(0);
                    }}
                    aria-pressed={featureFilter === feature.id}
                    className={chipClass(featureFilter === feature.id)}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: feature.color }}
                      aria-hidden="true"
                    />
                    {feature.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            ref={listRef}
            role="listbox"
            onKeyDown={handleListKeyDown}
            aria-label={
              isFeatureMode
                ? t("backlog.feature", "붙일 피처")
                : t("backlog.task", "붙일 태스크")
            }
            className="max-h-[46vh] min-h-[14rem] overflow-y-auto custom-scrollbar px-3 py-2"
          >
            {tasksLoading && !isFeatureMode ? (
              <div className="flex items-center justify-center gap-2 py-16">
                <Loader2
                  className="w-5 h-5 animate-spin text-bridge-accent"
                  aria-hidden="true"
                />
                <span className="text-xs text-slate-500">
                  {t("common.loading", "불러오는 중")}
                </span>
              </div>
            ) : isEmpty ? (
              <p className="py-16 text-center text-xs text-slate-500 leading-relaxed">
                {isFeatureMode && features.length === 0 ? (
                  // 붙일 곳 자체가 없는 보드 — 좁히기 문제가 아니라서 힌트를 주지 않는다
                  t("backlog.noFeature", "피처가 없습니다")
                ) : (
                  <>
                    {isFeatureMode
                      ? t("backlog.noMatchFeature", "조건에 맞는 피처가 없습니다.")
                      : t("backlog.noMatchTask", "조건에 맞는 태스크가 없습니다.")}
                    <br />
                    {isFeatureMode
                      ? t("backlog.noMatchFeatureHint", "검색어를 지워 보세요.")
                      : t(
                          "backlog.noMatchHint",
                          "검색어를 지우거나 완료 포함을 켜 보세요.",
                        )}
                  </>
                )}
              </p>
            ) : (
              sections.map((section) => (
                <div key={section.key} role="group" aria-label={section.label}>
                  <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5">
                    {section.color && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: section.color }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500 truncate">
                      {section.label}
                    </span>
                    <span className="text-xs text-slate-600">
                      {section.items.length}
                    </span>
                    <span className="flex-1 h-px bg-foreground/[0.06]" />
                  </div>
                  {section.items.map((entry) => {
                    rowIndex += 1;
                    return isFeatureMode
                      ? renderFeatureRow(entry as Feature, rowIndex)
                      : renderTaskRow(entry as TaskResponse, rowIndex);
                  })}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {(presetDate || error) && isPicker && (
        <div className="px-5 pt-3 flex flex-col gap-1.5">
          {presetDate && (
            <p className="text-xs font-bold text-bridge-secondary">
              {t("backlog.presetDate", "{{date}}에 배치됩니다", {
                date: presetDate,
              })}
            </p>
          )}
          {error && (
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
      )}
      {error && !isPicker && (
        <p className="px-5 pt-3 text-xs font-bold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-foreground/[0.08]">
        <p className="min-w-0 text-xs text-slate-500 truncate">
          {selectedTask ? (
            <>
              <span className="font-bold text-foreground">
                {selectedTask.title}
              </span>
              {t("backlog.pickedChecklistSuffix", "의 체크리스트로")}
            </>
          ) : selectedFeature ? (
            <>
              <span className="font-bold text-foreground">
                {selectedFeature.title}
              </span>
              {t("backlog.pickedTaskSuffix", " 아래 태스크로")}
            </>
          ) : isPicker ? (
            t("backlog.pickHint", "붙일 곳을 고르세요 · ↑↓ 이동 · Enter 선택")
          ) : (
            t("common.escToClose", "Esc 닫기")
          )}
        </p>
        <div className="flex items-center gap-2 shrink-0">
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
