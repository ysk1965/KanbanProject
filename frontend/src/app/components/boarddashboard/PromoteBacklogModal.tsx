import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Loader2, Search, Sparkles } from "lucide-react";
import { MotionModal } from "../ui/MotionModal";
import {
  checklistAPI,
  personalTaskAPI,
  taskAPI,
  type PromoteSuggestion,
  type TaskResponse,
} from "../../utils/api";
import type { Feature, Milestone, PersonalTask } from "../../types";
import { getDDay, getTodayDateString } from "../../utils/dateUtils";
import { getAssigneeHex } from "../../utils/assigneeColor";
import {
  buildMilestoneColorMap,
  resolveMilestoneColor,
} from "../../utils/milestoneColor";

export type PromoteTarget = "TIMEBLOCK" | "TASK" | "CHECKLIST_ITEM";

/** 목록을 무엇으로 정렬할지. 기본은 섹션(최근 → 내 것 → 피처별). */
type SortMode = "default" | "due" | "recent";

/** 마일스톤 필터 값 — null이면 전체, "none"이면 마일스톤 미배정만 */
type MilestoneFilter = string | null;
const MILESTONE_NONE = "none";

interface PromoteBacklogModalProps {
  boardId: string;
  item: PersonalTask;
  /** 어느 대상으로 열렸는지 — 모달 안에서 바꿀 수 있다 */
  target: PromoteTarget;
  /** 간트 날짜 칸에 떨궈서 열렸다면 그 날짜 — 태스크의 시작·마감으로 쓴다 */
  presetDate?: string;
  features: Feature[];
  /** 보드의 마일스톤 — 1차 필터. 2개 미만이면 필터 자체를 그리지 않는다. */
  milestones?: Milestone[];
  /** 보드에서 보고 있던 마일스톤 — 이 모달의 기본 필터가 된다 */
  selectedMilestoneId?: string | null;
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

/** 추천 섹션 접힘 상태 — 매번 접는 사람에게 매번 펼쳐 보이지 않는다 */
const suggestKey = (boardId: string) => `bridge.backlog.suggestOpen.${boardId}`;

/** 목록 한 덩어리 — 검색 중에는 섹션을 접고 하나로 합친다 */
interface Section<T> {
  key: string;
  label: string;
  color?: string;
  /** 이 섹션이 피처 하나로 묶여 있으면 행에서 피처명을 지운다(중복) */
  featureScoped?: boolean;
  items: T[];
}

/** 추천 카드 한 줄 — 태스크 탭이면 task, 피처 탭이면 feature가 채워진다 */
interface SuggestionRow {
  suggestion: PromoteSuggestion;
  id: string;
  title: string;
  task?: TaskResponse;
  feature?: Feature;
}

/** 마일스톤 미배정을 포함한 태스크 소속 판정 */
function inMilestone(
  taskMilestoneId: string | null | undefined,
  filter: MilestoneFilter,
): boolean {
  if (filter === null) return true;
  if (filter === MILESTONE_NONE) return !taskMilestoneId;
  return taskMilestoneId === filter;
}

/**
 * 백로그 항목 승격 모달.
 *
 * 적을 때는 제목 하나만 받았으므로, 대상마다 꼭 필요한 것만 여기서 받는다.
 * 붙일 곳은 드롭다운이 아니라 본문 자체가 목록이다 — 이미 모달인데 그 안에서 또
 * 팝오버를 여는 건 클릭만 한 번 더 받는 일이라, 탭을 고르면 그 대상의 목록이
 * 바로 펼쳐지고 검색창이 커서를 받는다.
 *
 * 좁히기는 두 단이다. 마일스톤(상위)을 고르면 피처 칩(하위)이 그 마일스톤 것만 남고,
 * 각 칩은 자기 개수를 달고 있어 눌러 보기 전에 결과 크기를 알 수 있다.
 * 그 위에 "붙일 만한 곳" 추천 세 개를 얹는다 — 규칙 추천은 열자마자 무료로 뜨고,
 * AI는 버튼을 눌렀을 때만 크레딧을 쓴다.
 *
 * 드래그로 승격할 때는 놓은 자리가 이 값들을 대신하므로 이 모달을 거치지 않는다.
 */
export function PromoteBacklogModal({
  boardId,
  item,
  target: initialTarget,
  presetDate,
  features,
  milestones,
  selectedMilestoneId,
  userId,
  onClose,
  onPromoted,
}: PromoteBacklogModalProps) {
  const { t, i18n } = useTranslation();

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
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [activeIndex, setActiveIndex] = useState(0);

  const milestoneList = useMemo(() => milestones ?? [], [milestones]);

  // 보드에서 보고 있던 마일스톤을 그대로 물려받는다 — 승격도 같은 맥락에서 일어난다.
  // "all"은 페이지가 쓰는 전체 표시값이라 여기선 null로 바꾼다.
  const [milestoneFilter, setMilestoneFilter] = useState<MilestoneFilter>(
    () => {
      if (!selectedMilestoneId || selectedMilestoneId === "all") return null;
      if (selectedMilestoneId === MILESTONE_NONE) return MILESTONE_NONE;
      return milestoneList.some((m) => m.id === selectedMilestoneId)
        ? selectedMilestoneId
        : null;
    },
  );
  const [milestoneOpen, setMilestoneOpen] = useState(false);

  // 추천
  const [suggestions, setSuggestions] = useState<PromoteSuggestion[]>([]);
  const [suggestSource, setSuggestSource] = useState<"AI" | "RULE" | null>(
    null,
  );
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [creditsExhausted, setCreditsExhausted] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(() => {
    try {
      return localStorage.getItem(suggestKey(boardId)) !== "0";
    } catch {
      return true;
    }
  });

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const milestoneRef = useRef<HTMLDivElement>(null);

  const isPicker = target !== "TIMEBLOCK";
  const isFeatureMode = target === "TASK";

  const milestoneColorMap = useMemo(
    () => buildMilestoneColorMap(milestoneList),
    [milestoneList],
  );

  /**
   * 목록은 두 탭 모두 태스크가 있어야 만들어진다.
   * 체크리스트 탭은 태스크가 곧 후보고, 태스크 탭은 피처의 마일스톤 소속과 개수를
   * 태스크에서 파생하기 때문이다(보드 칸반이 쓰는 판정과 같은 규칙).
   */
  useEffect(() => {
    if (!isPicker || tasksLoaded || tasksLoading) return;
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
  }, [isPicker, boardId, tasksLoaded, tasksLoading, t]);

  /** 탭을 바꾸면 좁히기 조건과 고른 것을 비운다 — 다른 목록이라 이어질 이유가 없다 */
  const switchTarget = useCallback((next: PromoteTarget) => {
    setTarget(next);
    setQuery("");
    setFeatureFilter(null);
    setShowDone(false);
    setSortMode("default");
    setActiveIndex(0);
    setFeatureId("");
    setTaskId("");
    setError(null);
    setSuggestions([]);
    setSuggestSource(null);
    setCreditsExhausted(false);
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

  /**
   * 피처 → 소속 마일스톤. 보드 칸반과 같은 규칙으로 판정한다:
   * 태스크가 배정된 마일스톤이 우선이고, 태스크 배정이 하나도 없는 피처만
   * 마일스톤의 피처 목록(멤버십)으로 폴백한다.
   */
  const featureMilestones = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    const derived = new Set<string>();
    tasks.forEach((task) => {
      if (!task.milestone_id) return;
      (map[task.feature_id] ||= new Set()).add(task.milestone_id);
      derived.add(task.feature_id);
    });
    milestoneList.forEach((milestone) => {
      milestone.features?.forEach((feature) => {
        if (derived.has(feature.id)) return;
        (map[feature.id] ||= new Set()).add(milestone.id);
      });
    });
    return map;
  }, [tasks, milestoneList]);

  const featureInMilestone = useCallback(
    (id: string) => {
      if (milestoneFilter === null) return true;
      const set = featureMilestones[id];
      if (milestoneFilter === MILESTONE_NONE) return !set || set.size === 0;
      return !!set?.has(milestoneFilter);
    },
    [featureMilestones, milestoneFilter],
  );

  /** 마일스톤·완료 조건까지만 적용한 태스크 풀 — 피처 칩 개수의 기준이 된다 */
  const taskPool = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (showDone || !task.completed) &&
          inMilestone(task.milestone_id, milestoneFilter),
      ),
    [tasks, showDone, milestoneFilter],
  );

  /** 이 마일스톤에 실제로 후보가 있는 피처만 칩으로 남긴다 (0건 칩은 그리지 않는다) */
  const featureChips = useMemo(() => {
    if (isFeatureMode) return [];
    const counts = new Map<string, number>();
    taskPool.forEach((task) => {
      counts.set(task.feature_id, (counts.get(task.feature_id) ?? 0) + 1);
    });
    return features
      .filter((feature) => counts.has(feature.id))
      .map((feature) => ({ feature, count: counts.get(feature.id) ?? 0 }));
  }, [features, taskPool, isFeatureMode]);

  // 마일스톤을 바꿔 사라진 피처 칩이 눌린 채로 남아 목록이 비는 걸 막는다
  useEffect(() => {
    if (!featureFilter) return;
    if (!featureChips.some((chip) => chip.feature.id === featureFilter)) {
      setFeatureFilter(null);
    }
  }, [featureChips, featureFilter]);

  /** 태스크 섹션 — 최근에 붙인 곳 → 내 태스크 → 피처별 */
  const taskSections = useMemo<Section<TaskResponse>[]>(() => {
    const q = query.trim().toLowerCase();

    // 검색은 좁히기를 뚫는다 — 필터 때문에 안 나오는 상황을 만들지 않는다
    if (q) {
      const hit = tasks.filter(
        (task) =>
          (showDone || !task.completed) &&
          (task.title.toLowerCase().includes(q) ||
            (task.feature_title ?? "").toLowerCase().includes(q) ||
            (task.task_key ?? "").toLowerCase().includes(q)),
      );
      return [
        {
          key: "search",
          label: t("backlog.sectionSearch", "검색 결과"),
          items: hit,
        },
      ];
    }

    let pool = taskPool;
    if (featureFilter) {
      pool = pool.filter((task) => task.feature_id === featureFilter);
    }

    if (sortMode !== "default") {
      const sorted = [...pool].sort((a, b) => {
        if (sortMode === "due") {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        }
        const left = a.updated_at ?? a.created_at ?? "";
        const right = b.updated_at ?? b.created_at ?? "";
        return right.localeCompare(left);
      });
      return [
        {
          key: sortMode,
          label:
            sortMode === "due"
              ? t("backlog.sortDue", "마감 임박")
              : t("backlog.sortRecent", "최근 수정"),
          items: sorted,
        },
      ];
    }

    const used = new Set<string>();
    const take = (predicate: (task: TaskResponse) => boolean) => {
      const picked = pool.filter(
        (task) => !used.has(task.id) && predicate(task),
      );
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
      const mine = take(
        (task) => !!task.assignees?.some((a) => a.id === userId),
      );
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
        featureScoped: true,
        items,
      });
    });
    // 보드 피처 목록에 없는 것(인박스 등)은 응답이 알려준 이름으로 뒤에 붙인다
    byFeature.forEach((items, id) => {
      sections.push({
        key: `f-${id}`,
        label: items[0]?.feature_title ?? "",
        color: items[0]?.feature_color,
        featureScoped: true,
        items,
      });
    });

    return sections;
  }, [
    tasks,
    taskPool,
    showDone,
    featureFilter,
    sortMode,
    query,
    recentIds,
    userId,
    features,
    t,
  ]);

  /** 피처 섹션 — 최근에 붙인 곳만 위로 올리고 나머지는 보드 순서 */
  const featureSections = useMemo<Section<Feature>[]>(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return [
        {
          key: "search",
          label: t("backlog.sectionSearch", "검색 결과"),
          items: features.filter((feature) =>
            feature.title.toLowerCase().includes(q),
          ),
        },
      ];
    }

    const pool = features.filter((feature) => featureInMilestone(feature.id));
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
  }, [features, featureInMilestone, query, recentIds, t]);

  const sections: Section<TaskResponse | Feature>[] = isFeatureMode
    ? featureSections
    : taskSections;

  // ─── 추천 ───

  /**
   * 지금 보고 있는 조건으로 후보를 추천받는다.
   * useAi=false는 무료라 조건이 바뀔 때마다 부르고, true는 버튼을 눌렀을 때만 부른다.
   */
  const fetchSuggestions = useCallback(
    async (useAi: boolean) => {
      if (!isPicker) return;
      if (useAi) setAiLoading(true);
      else setSuggestLoading(true);
      try {
        const res = await personalTaskAPI.promoteSuggestions(item.id, {
          target,
          milestone_id: milestoneFilter,
          include_done: showDone,
          use_ai: useAi,
          recent_ref_ids: recentIds,
          language: i18n.language,
        });
        setSuggestions(res.suggestions ?? []);
        setSuggestSource(res.source);
        setCreditsExhausted(res.credits_exhausted);
      } catch {
        // 추천은 곁다리다 — 실패해도 승격 자체는 막지 않는다
        setSuggestions([]);
        setSuggestSource(null);
      } finally {
        if (useAi) setAiLoading(false);
        else setSuggestLoading(false);
      }
    },
    [
      isPicker,
      item.id,
      target,
      milestoneFilter,
      showDone,
      recentIds,
      i18n.language,
    ],
  );

  // 조건이 바뀌면 규칙 추천만 다시 받는다(무료). AI 결과는 버튼을 다시 눌러야 갱신된다.
  useEffect(() => {
    if (!isPicker) return;
    const timer = window.setTimeout(() => void fetchSuggestions(false), 200);
    return () => window.clearTimeout(timer);
  }, [isPicker, fetchSuggestions]);

  const toggleSuggest = useCallback(() => {
    const next = !suggestOpen;
    setSuggestOpen(next);
    try {
      localStorage.setItem(suggestKey(boardId), next ? "1" : "0");
    } catch {
      // 접힘 상태는 편의값이라 저장 실패를 알리지 않는다
    }
  }, [boardId, suggestOpen]);

  /** 추천 카드에 그릴 대상 — 목록 필터 밖이어도 보여준다(추천은 필터보다 위에 있다) */
  const suggestionRows = useMemo<SuggestionRow[]>(() => {
    if (!isPicker) return [];
    const rows: SuggestionRow[] = [];
    suggestions.forEach((suggestion) => {
      if (isFeatureMode) {
        const feature = features.find((f) => f.id === suggestion.ref_id);
        if (feature) {
          rows.push({
            suggestion,
            id: feature.id,
            title: feature.title,
            feature,
          });
        }
        return;
      }
      const task = tasks.find((row) => row.id === suggestion.ref_id);
      if (task) {
        rows.push({ suggestion, id: task.id, title: task.title, task });
      }
    });
    return rows;
  }, [suggestions, isPicker, isFeatureMode, features, tasks]);

  const reasonText = useCallback(
    (suggestion: PromoteSuggestion) => {
      if (suggestion.reason) return suggestion.reason;
      const words = (suggestion.reason_tokens ?? []).slice(0, 3).join(" · ");
      switch (suggestion.reason_code) {
        case "TITLE_MATCH":
          return words
            ? t("backlog.reasonTitleMatch", "‘{{words}}’ 겹침", { words })
            : t("backlog.reasonRelated", "관련도 높음");
        case "TAG_MATCH":
          return t("backlog.reasonTagMatch", "같은 말머리");
        case "MINE":
          return t("backlog.reasonMine", "내가 맡은 일");
        case "RECENT":
          return t("backlog.reasonRecent", "최근에 붙인 곳");
        case "SAME_MILESTONE":
          return t("backlog.reasonSameMilestone", "같은 마일스톤");
        default:
          return t("backlog.reasonRelated", "관련도 높음");
      }
    },
    [t],
  );

  // ─── 키보드 커서 ───

  /** 추천 → 목록 순서로 이어지는 한 줄짜리 커서 */
  const flatIds = useMemo(() => {
    const suggested = suggestOpen ? suggestionRows.map((row) => row.id) : [];
    const listed = isFeatureMode
      ? featureSections.flatMap((section) => section.items.map((f) => f.id))
      : taskSections.flatMap((section) => section.items.map((task) => task.id));
    return [...suggested, ...listed];
  }, [
    suggestOpen,
    suggestionRows,
    isFeatureMode,
    featureSections,
    taskSections,
  ]);

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

  // 마일스톤 드롭다운은 바깥을 누르면 닫는다
  useEffect(() => {
    if (!milestoneOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!milestoneRef.current?.contains(e.target as Node)) {
        setMilestoneOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [milestoneOpen]);

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

  const SORTS: { key: SortMode; label: string }[] = [
    { key: "default", label: t("backlog.sortDefault", "기본") },
    { key: "due", label: t("backlog.sortDue", "마감 임박") },
    { key: "recent", label: t("backlog.sortRecent", "최근 수정") },
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

  const activeMilestone = useMemo(
    () => milestoneList.find((m) => m.id === milestoneFilter) ?? null,
    [milestoneList, milestoneFilter],
  );

  /** 마일스톤별 후보 수 — 옵션에 붙여 눌러 보기 전에 크기를 알게 한다 */
  const milestoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let none = 0;
    const pool = isFeatureMode
      ? []
      : tasks.filter((task) => showDone || !task.completed);
    pool.forEach((task) => {
      if (task.milestone_id) {
        counts[task.milestone_id] = (counts[task.milestone_id] ?? 0) + 1;
      } else {
        none += 1;
      }
    });
    if (isFeatureMode) {
      features.forEach((feature) => {
        const set = featureMilestones[feature.id];
        if (!set || set.size === 0) {
          none += 1;
          return;
        }
        set.forEach((id) => {
          counts[id] = (counts[id] ?? 0) + 1;
        });
      });
    }
    return {
      counts,
      none,
      total: isFeatureMode ? features.length : pool.length,
    };
  }, [tasks, features, featureMilestones, isFeatureMode, showDone]);

  /** 색 점 · 제목 · 한 줄 컨텍스트 · 꼬리표(키/진행률) · 선택 표시 */
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
        {/*
          고르는 기준은 제목이다. 한 줄로 자르면 [태그] 뒤에 붙은 본문이 잘려
          정작 판단할 근거가 사라지므로 두 줄까지는 편다.
        */}
        <span
          className={`block line-clamp-2 text-sm text-foreground ${
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

  /** 담당자 한 명 + 나머지 수 */
  const renderAssignee = (task: TaskResponse) => {
    const assignee = task.assignees?.[0];
    const extra = (task.assignees?.length ?? 0) - 1;
    if (!assignee) {
      return (
        <span className="text-slate-600">
          {t("backlog.noAssignee", "담당 없음")}
        </span>
      );
    }
    return (
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
    );
  };

  /** 체크 진행도 — 숫자만 있으면 "거의 다 찬 태스크"가 눈에 안 들어온다 */
  const renderProgress = (task: TaskResponse) => {
    if (!task.checklist_total) return null;
    const done = task.checklist_completed ?? 0;
    return (
      <span className="flex items-center gap-1.5">
        <span className="w-7 h-1 rounded-full bg-foreground/10 overflow-hidden">
          <span
            className="block h-full rounded-full bg-bridge-secondary"
            style={{ width: `${(done / task.checklist_total) * 100}%` }}
          />
        </span>
        <span className="tabular-nums">
          {done}/{task.checklist_total}
        </span>
      </span>
    );
  };

  const renderTaskRow = (
    task: TaskResponse,
    idx: number,
    featureScoped?: boolean,
  ) => {
    const dday = getDDay(task.due_date);
    const outsideFilter =
      !!query.trim() && !inMilestone(task.milestone_id, milestoneFilter);
    return renderRow(
      task.id,
      idx,
      task.id === taskId,
      task.feature_color,
      task.title,
      <>
        {/* 섹션이 이미 피처 하나로 묶여 있으면 행마다 같은 이름을 반복하지 않는다 */}
        {!featureScoped && (
          <span className="truncate max-w-[10rem]">{task.feature_title}</span>
        )}
        {renderAssignee(task)}
        {renderProgress(task)}
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
        {/* 완료 여부는 상태가 갈릴 때만 — "할 일"이 줄줄이 붙어 있으면 읽히지 않는다 */}
        {task.completed && (
          <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-slate-400">
            {t("backlog.doneBadge", "완료")}
          </span>
        )}
        {outsideFilter && (
          <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            {t("backlog.otherMilestone", "다른 마일스톤")}
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

  const isEmpty = sections.every((section) => section.items.length === 0);
  // 섹션을 가로지르는 행 번호 — 키보드 커서(flatIds)와 같은 순서를 유지한다.
  // 추천 카드가 앞에 오므로 그만큼 뒤에서 시작한다.
  const suggestionCount = suggestOpen ? suggestionRows.length : 0;
  let rowIndex = suggestionCount - 1;

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
              "이 시간에 개인 블록으로 잡힙니다. 항목은 백로그에서 빠집니다.",
            )}
          </p>
        </div>
      )}

      {isPicker && (
        <>
          <div className="px-5 pb-3 flex flex-col gap-2.5 border-b border-foreground/[0.08]">
            {/*
              마일스톤 = 1차 필터. 보통 2~6개고 피처보다 상위 축이라 칩을 한 줄 더
              쌓지 않고 셀렉트 한 줄로 둔다 — 그만큼 목록에 높이를 준다.
            */}
            {milestoneList.length > 1 && (
              <div className="relative" ref={milestoneRef}>
                <button
                  type="button"
                  onClick={() => setMilestoneOpen((prev) => !prev)}
                  aria-haspopup="listbox"
                  aria-expanded={milestoneOpen}
                  className="w-full flex items-center gap-2 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-sm text-foreground hover:border-foreground/20 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: activeMilestone
                        ? resolveMilestoneColor(
                            activeMilestone.id,
                            milestoneColorMap,
                          ).hex
                        : "#64748b",
                    }}
                    aria-hidden="true"
                  />
                  <span className="font-bold truncate">
                    {activeMilestone
                      ? activeMilestone.title
                      : milestoneFilter === MILESTONE_NONE
                        ? t("backlog.milestoneNone", "마일스톤 없음")
                        : t("backlog.milestoneAll", "전체 마일스톤")}
                  </span>
                  {activeMilestone && (
                    <span className="text-xs text-slate-500 shrink-0">
                      {getDDay(activeMilestone.end_date).text}
                    </span>
                  )}
                  <span className="flex-1" />
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">
                    {activeMilestone
                      ? (milestoneCounts.counts[activeMilestone.id] ?? 0)
                      : milestoneFilter === MILESTONE_NONE
                        ? milestoneCounts.none
                        : milestoneCounts.total}
                  </span>
                  <ChevronDown
                    className="w-4 h-4 text-slate-500 shrink-0"
                    aria-hidden="true"
                  />
                </button>

                {milestoneOpen && (
                  <div
                    role="listbox"
                    aria-label={t("backlog.milestone", "마일스톤")}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        // 모달까지 닫히면 고르던 것이 날아간다 — 여기서 멈춘다
                        e.stopPropagation();
                        setMilestoneOpen(false);
                      }
                    }}
                    className="absolute z-20 left-0 right-0 mt-1.5 p-1.5 bg-bridge-surface border border-foreground/[0.12] rounded-xl shadow-2xl max-h-[40vh] overflow-y-auto custom-scrollbar"
                  >
                    {[
                      {
                        id: null as MilestoneFilter,
                        label: t("backlog.milestoneAll", "전체 마일스톤"),
                        count: milestoneCounts.total,
                        hex: "#64748b",
                      },
                      ...milestoneList.map((milestone) => ({
                        id: milestone.id as MilestoneFilter,
                        label: milestone.title,
                        count: milestoneCounts.counts[milestone.id] ?? 0,
                        hex: resolveMilestoneColor(
                          milestone.id,
                          milestoneColorMap,
                        ).hex,
                        dday: getDDay(milestone.end_date).text,
                        progress: milestone.progress_percentage,
                      })),
                      {
                        id: MILESTONE_NONE as MilestoneFilter,
                        label: t("backlog.milestoneNone", "마일스톤 없음"),
                        count: milestoneCounts.none,
                        hex: "#64748b",
                      },
                    ].map((option) => (
                      <button
                        key={option.id ?? "all"}
                        type="button"
                        role="option"
                        aria-selected={milestoneFilter === option.id}
                        onClick={() => {
                          setMilestoneFilter(option.id);
                          setMilestoneOpen(false);
                          setActiveIndex(0);
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                          milestoneFilter === option.id
                            ? "bg-bridge-accent/15 text-foreground font-bold"
                            : "text-foreground hover:bg-foreground/5"
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: option.hex }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{option.label}</span>
                        {"dday" in option && option.dday && (
                          <span className="text-xs text-slate-500 shrink-0">
                            {option.dday}
                          </span>
                        )}
                        <span className="flex-1" />
                        {"progress" in option &&
                          typeof option.progress === "number" && (
                            <span className="w-10 h-1 rounded-full bg-foreground/10 overflow-hidden shrink-0">
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${option.progress}%`,
                                  backgroundColor: option.hex,
                                }}
                              />
                            </span>
                          )}
                        <span className="text-xs text-slate-500 tabular-nums shrink-0">
                          {option.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                      ? t(
                          "backlog.searchFeaturePlaceholder",
                          "피처 이름으로 검색",
                        )
                      : t(
                          "backlog.searchTaskPlaceholder",
                          "제목 · 피처 · 키로 검색",
                        )
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

            {/* 피처 칩 — 고른 마일스톤에 실제로 후보가 있는 것만, 개수를 달고 */}
            {!isFeatureMode && featureChips.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                {featureChips.map(({ feature, count }) => (
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
                    <span className="tabular-nums text-slate-600">{count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 정렬 — 목록이 긴 태스크 탭에만 둔다(피처는 몇 개 되지 않는다) */}
            {!isFeatureMode && !query.trim() && (
              <div className="flex items-center gap-1.5">
                {SORTS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setSortMode(option.key);
                      setActiveIndex(0);
                    }}
                    aria-pressed={sortMode === option.key}
                    className={chipClass(sortMode === option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ─── 붙일 만한 곳 ─── */}
          <div className="px-3 pt-2.5">
            <div className="rounded-2xl border border-bridge-accent/30 bg-bridge-accent/[0.07] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles
                  className="w-3.5 h-3.5 text-bridge-accent shrink-0"
                  aria-hidden="true"
                />
                <span className="text-xs font-bold uppercase tracking-widest text-bridge-accent truncate">
                  {t("backlog.suggestTitle", "붙일 만한 곳")}
                </span>
                {suggestSource && (
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      suggestSource === "AI"
                        ? "bg-bridge-secondary/15 text-teal-600 dark:text-teal-400"
                        : "bg-foreground/[0.06] text-slate-400"
                    }`}
                  >
                    {suggestSource === "AI"
                      ? t("backlog.suggestSourceAi", "AI")
                      : t("backlog.suggestSourceRule", "규칙")}
                  </span>
                )}
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => void fetchSuggestions(true)}
                  disabled={aiLoading || !suggestOpen}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-bridge-accent hover:bg-bridge-accent/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {aiLoading && (
                    <Loader2
                      className="w-3 h-3 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {t("backlog.suggestWithAi", "AI로 추천 · 크레딧 1")}
                </button>
                <button
                  type="button"
                  onClick={toggleSuggest}
                  aria-expanded={suggestOpen}
                  className="px-1.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                  {suggestOpen
                    ? t("common.collapse", "접기")
                    : t("common.expand", "펼치기")}
                </button>
              </div>

              {suggestOpen && (
                <div
                  className="mt-2 flex flex-col gap-1.5"
                  role="group"
                  aria-label={t("backlog.suggestTitle", "붙일 만한 곳")}
                >
                  {suggestLoading && !suggestionRows.length ? (
                    <p className="py-3 text-center text-xs text-slate-500">
                      {t("common.loading", "불러오는 중")}
                    </p>
                  ) : !suggestionRows.length ? (
                    <p className="py-3 text-center text-xs text-slate-500">
                      {t(
                        "backlog.suggestEmpty",
                        "추천할 만한 곳을 찾지 못했습니다.",
                      )}
                    </p>
                  ) : (
                    suggestionRows.map((row, idx) => {
                      const selected = isFeatureMode
                        ? row.id === featureId
                        : row.id === taskId;
                      return (
                        <button
                          key={`s-${row.id}`}
                          type="button"
                          data-idx={idx}
                          onClick={() => pick(row.id)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          aria-pressed={selected}
                          className={`w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded-xl border transition-colors ${
                            selected
                              ? "bg-bridge-accent/15 border-bridge-accent/50"
                              : idx === activeIndex
                                ? "bg-bridge-obsidian border-bridge-accent/35"
                                : "bg-bridge-obsidian/60 border-foreground/[0.08] hover:border-foreground/[0.16]"
                          }`}
                        >
                          <span className="shrink-0 w-4 h-4 mt-0.5 rounded-md bg-bridge-accent/20 text-bridge-accent text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span
                              className={`block line-clamp-2 text-sm text-foreground ${
                                selected ? "font-bold" : "font-medium"
                              }`}
                            >
                              {row.title}
                            </span>
                            <span className="block mt-0.5 text-xs text-teal-600 dark:text-teal-400 truncate">
                              {reasonText(row.suggestion)}
                            </span>
                          </span>
                          <span className="shrink-0 flex items-center gap-2 mt-0.5">
                            {row.task?.task_key && (
                              <span className="text-xs text-slate-600 tabular-nums">
                                {row.task.task_key}
                              </span>
                            )}
                            {selected && (
                              <Check
                                className="w-4 h-4 text-bridge-accent"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}

                  {creditsExhausted && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {t(
                        "backlog.suggestNoCredits",
                        "AI 크레딧이 없어 규칙 추천으로 보여줍니다.",
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
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
            className="max-h-[38vh] min-h-[12rem] overflow-y-auto custom-scrollbar px-3 py-2"
          >
            {/*
              피처 목록은 props로 이미 와 있으므로 태스크를 기다리지 않는다.
              태스크는 피처의 마일스톤 소속을 더 정확히 가리는 데만 쓰이고, 도착하면 다시 걸린다.
            */}
            {!isFeatureMode && tasksLoading && !tasksLoaded ? (
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
              <div className="py-14 text-center text-xs text-slate-500 leading-relaxed">
                {isFeatureMode && features.length === 0 ? (
                  // 붙일 곳 자체가 없는 보드 — 좁히기 문제가 아니라서 힌트를 주지 않는다
                  t("backlog.noFeature", "피처가 없습니다")
                ) : milestoneFilter !== null && !query.trim() ? (
                  // 좁혀서 빈 것이므로 빠져나갈 길을 같이 준다
                  <>
                    {t(
                      "backlog.noMatchMilestone",
                      "이 마일스톤에는 붙일 곳이 없습니다.",
                    )}
                    <br />
                    <button
                      type="button"
                      onClick={() => {
                        setMilestoneFilter(null);
                        setActiveIndex(0);
                      }}
                      className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold text-bridge-accent hover:bg-bridge-accent/10 transition-colors"
                    >
                      {t("backlog.milestoneAll", "전체 마일스톤")}
                    </button>
                  </>
                ) : (
                  <>
                    {isFeatureMode
                      ? t(
                          "backlog.noMatchFeature",
                          "조건에 맞는 피처가 없습니다.",
                        )
                      : t(
                          "backlog.noMatchTask",
                          "조건에 맞는 태스크가 없습니다.",
                        )}
                    <br />
                    {isFeatureMode
                      ? t("backlog.noMatchFeatureHint", "검색어를 지워 보세요.")
                      : t(
                          "backlog.noMatchHint",
                          "검색어를 지우거나 완료 포함을 켜 보세요.",
                        )}
                  </>
                )}
              </div>
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
                      : renderTaskRow(
                          entry as TaskResponse,
                          rowIndex,
                          section.featureScoped,
                        );
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
