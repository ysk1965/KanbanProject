import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  AlertCircle,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  PauseCircle,
  PowerOff,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import {
  jiraAutofixAPI,
  JiraAutofixQueueStatus,
  JiraAutofixJob,
  JiraAutofixJobStatus,
  JiraAutofixItem,
  JiraAutofixAssignee,
  JiraAutofixTaskState,
  JiraAutofixVerdict,
  JiraAutofixCategory,
  JiraAutofixTestInfra,
  JiraAutofixRunnerStatus,
  JiraAutofixTriageRun,
  slackAppAPI,
  SlackChannel,
} from "../utils/api";
import { parseUTCDate, formatRelativeTime } from "../utils/dateUtils";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";

interface JiraAutofixDockProps {
  boardId: string;
  /** JIRA 연동 보드에서만 렌더한다. 쓸 수 없는 기능이 화면 하단을 차지하지 않게. */
  enabled: boolean;
  /**
   * 이슈 키를 눌렀을 때 원본 태스크 상세를 연다. 없으면 키는 그냥 텍스트로 남는다.
   * 도크에 뜨는 건 판정 근거 한 줄뿐이라, 이게 왜 후보인지 보려면 결국 카드를 봐야 한다.
   */
  onOpenTask?: (taskId: string) => void;
}

const POLL_INTERVAL_MS = 10_000;
/**
 * 판정 진행률 폴링 간격. 큐 폴링(10초)보다 짧다 — 배치 하나가 수십 초라 진행 숫자가
 * 그보다 느리게 움직이면 사람은 멈춘 줄 안다.
 */
const TRIAGE_POLL_INTERVAL_MS = 4_000;
/**
 * 이 시간을 넘게 물고 있으면 러너를 의심해야 한다. 서버의 자동 회수(90분)보다 훨씬 짧게 잡는다 —
 * 막힌 큐를 90분 동안 아무 설명 없이 두면 화면이 고장난 것처럼 보인다.
 */
const STALE_HINT_MINUTES = 30;
/** 펼침 높이. 드래그 리사이즈는 넣지 않는다 — 담을 내용이 그만큼 가변적이지 않다. */
const DOCK_HEIGHT = "min(75vh, 800px)";

/**
 * 끝난 판정 실행을 한 줄로. 화면이 결과를 볼 수 있는 유일한 순간이라 — 실행 자체는
 * 서버 백그라운드에서 돌고 응답은 시작 시점에 이미 끝났다 — 여기서 다 말해야 한다.
 */
const describeTriageRun = (run: JiraAutofixTriageRun): string => {
  if (run.status === "FAILED") {
    return run.error_message || "판정에 실패했습니다";
  }
  if (run.triaged === 0 && !run.scoped) {
    return `변경된 이슈가 없어 ${run.skipped}건 모두 건너뜀`;
  }
  const parts = [`${run.triaged}건 판정`];
  if (!run.scoped && run.skipped > 0) parts.push(`${run.skipped}건 변경 없음`);
  // 배치 실패는 조용히 넘기면 안 된다 — 판정 결과가 부분이라는 뜻이다
  if (run.failed_batches > 0) parts.push(`${run.failed_batches}개 묶음 실패`);
  return parts.join(" · ");
};

/**
 * NO_CHANGE에 실패색을 쓰지 않는다 — 테스트 없는 저장소에서는 이게 다수가 되는데,
 * 빨간 목록은 파이프라인이 고장난 것처럼 보인다. TIMED_OUT만 경고색이다(사람이 러너를 봐야 한다).
 */
const STATUS_STYLE: Record<
  JiraAutofixJobStatus,
  { chip: string; label: string }
> = {
  DISPATCHED: {
    chip: "bg-bridge-accent/15 text-bridge-accent",
    label: "진행 중",
  },
  QUEUED: { chip: "bg-foreground/10 text-slate-400", label: "대기" },
  SUCCEEDED: {
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    label: "PR 생성",
  },
  NO_CHANGE: { chip: "bg-foreground/10 text-slate-400", label: "변경 없음" },
  FAILED: {
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    label: "실패",
  },
  TIMED_OUT: {
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    label: "응답 없음",
  },
  CANCELLED: { chip: "bg-foreground/10 text-slate-400", label: "취소됨" },
};

const CATEGORY_LABEL: Record<JiraAutofixCategory, string> = {
  TEXT: "문구·오탈자",
  NULL_GUARD: "널체크·예외",
  CONSTANT: "상수·밸런스",
  LOGIC: "계산 로직",
  UI_STATE: "UI 갱신",
  ASSET: "에셋 표시",
  DESIGN_INTENT: "기획 판단",
  OTHER: "기타",
};

const TEST_INFRA_OPTIONS: {
  value: JiraAutofixTestInfra;
  label: string;
  hint: string;
}[] = [
  {
    value: "NONE",
    label: "테스트 없음",
    hint: "컴파일과 정적 대조만 검증 수단으로 인정합니다.",
  },
  {
    value: "PARTIAL",
    label: "일부 있음",
    hint: "테스트가 있는 영역 밖은 조건부 이하로 판정합니다.",
  },
  {
    value: "MATURE",
    label: "갖춰짐",
    hint: "테스트 작성을 정상 검증 수단으로 인정합니다.",
  },
];

const VERDICT_TABS: { value: JiraAutofixVerdict; label: string }[] = [
  { value: "CANDIDATE", label: "후보" },
  { value: "CONDITIONAL", label: "조건부" },
  { value: "EXCLUDED", label: "제외" },
];

/** 큐 묶음. 다 끝난 PR이 쌓여 지금 돌고 있는 한 건을 화면 밖으로 밀어내지 않게 나눈다. */
type QueueGroup = "live" | "pr" | "settled";

const QUEUE_GROUPS: { value: QueueGroup; label: string; i18nKey: string }[] = [
  { value: "live", label: "진행·대기", i18nKey: "autofixDock.groupLive" },
  { value: "pr", label: "PR", i18nKey: "autofixDock.groupPr" },
  { value: "settled", label: "그 외", i18nKey: "autofixDock.groupSettled" },
];

const chipCls = (status: JiraAutofixJobStatus) =>
  `text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[status].chip}`;

/**
 * 서버 시각은 오프셋 표기 없는 UTC 문자열이다. raw {@code new Date()}로 파싱하면
 * JS가 이를 로컬 타임존으로 해석해 KST 기준 540분이 통째로 더해진다 — parseUTCDate를 쓴다.
 */
const minutesSince = (iso: string | null): number | null => {
  const started = parseUTCDate(iso);
  if (!started) return null;
  return Math.max(0, Math.floor((Date.now() - started.getTime()) / 60_000));
};

const storageKey = (boardId: string) => `bridge-autofix-dock:${boardId}`;
/**
 * 필터 조합은 보드별로 기억한다. 보드마다 컬럼 구성도, 사람도, "여기까지 오면 손대지 않는다"는
 * 선도 달라서 서버가 정해줄 수 없다 — 한 번 고르면 계속 유지되는 것이 유일하게 쓸 만한 방식이다.
 *
 * <p>검색어는 넣지 않는다. 다음에 도크를 열었을 때 예전 검색어가 목록을 잘라 놓고 있으면
 * 항목이 사라진 것처럼 보인다.
 */
const filtersKey = (boardId: string) => `bridge-autofix-filters:${boardId}`;

/** 블록이 없는 항목(연동이 끊긴 건)도 필터 축에 있어야 한다 — 조용히 새는 칸이 생기면 안 된다. */
export const NO_BLOCK = "__none__";
/** 담당자 없음도 고를 수 있어야 한다. 미배정만 모아 보는 것이 실제로 가장 자주 하는 일이다. */
export const NO_ASSIGNEE = "__none__";

/** 사람과 외주는 id가 겹칠 수 있으므로 종류를 접두어로 붙여 가른다. */
const assigneeKey = (a: JiraAutofixAssignee) =>
  `${a.external ? "c" : "u"}:${a.id}`;

/**
 * 도크 필터. 저장 대상이라 순수 데이터로만 둔다(Set이 아니라 배열) — JSON으로 오가야 한다.
 *
 * @property hiddenBlocks null이면 사람이 아직 고른 적이 없다는 뜻이고, 그때만 자동 판단을 쓴다
 * @property minConfidence null이면 확신도 제한 없음. 서버 임계값과는 별개의 추가 조건이다
 * @property eligibleOnly 지금 담을 수 있는 것만. 후보 탭에서만 의미가 있다
 */
export interface DockFilters {
  hiddenBlocks: string[] | null;
  assignees: string[];
  categories: string[];
  minConfidence: number | null;
  eligibleOnly: boolean;
}

export const DEFAULT_FILTERS: DockFilters = {
  hiddenBlocks: null,
  assignees: [],
  categories: [],
  minConfidence: null,
  eligibleOnly: true,
};

/**
 * 저장된 값을 읽는다. 형태가 조금이라도 어긋나면 통째로 기본값으로 간다 —
 * 반쯤 복원된 필터는 "왜 이것만 보이지"의 원인이 되고, 사용자가 추적할 방법이 없다.
 */
function readFilters(boardId: string): DockFilters {
  try {
    const raw = localStorage.getItem(filtersKey(boardId));
    if (!raw) return DEFAULT_FILTERS;
    const p = JSON.parse(raw) as Partial<DockFilters>;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String) : [];
    return {
      hiddenBlocks: Array.isArray(p.hiddenBlocks)
        ? p.hiddenBlocks.map(String)
        : null,
      assignees: strings(p.assignees),
      categories: strings(p.categories),
      minConfidence:
        typeof p.minConfidence === "number" && Number.isFinite(p.minConfidence)
          ? p.minConfidence
          : null,
      eligibleOnly: p.eligibleOnly !== false,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

/** 필터가 걸러낼 대상. 컴포넌트가 만든 행에서 판정에 쓰이는 부분만 추린 모양. */
export interface FilterableRow {
  item: JiraAutofixItem;
  /** 지금 담을 수 있는지. "담을 수 있는 것만" 축이 이 값을 본다. */
  canSelect: boolean;
}

/**
 * 필터 판정 — 어느 축이든 걸리면 목록에서 빠진다.
 *
 * <p>"담을 수 있는 것만"은 <b>후보 탭에서만</b> 적용한다. 조건부·제외 탭의 항목은 애초에 담을 수
 * 없으므로, 그대로 걸면 목록이 통째로 비어 필터가 고장난 것처럼 보인다.
 *
 * <p>담당자 축은 <b>OR</b>다 — 두 사람을 고르면 "둘 중 아무나 물고 있는 것"이 나온다.
 * 한 태스크에 담당자가 여럿인 게 흔해서 AND로 걸면 거의 항상 0건이 된다.
 *
 * @param hiddenBlocks 감출 블록 키. 블록이 없는 항목은 {@link NO_BLOCK}으로 묶인다
 */
export function passesDockFilters(
  row: FilterableRow,
  opts: {
    filters: DockFilters;
    hiddenBlocks: Set<string>;
    query: string;
    verdict: JiraAutofixVerdict;
  },
): boolean {
  const { item } = row;
  const { filters, hiddenBlocks, query, verdict } = opts;

  if (hiddenBlocks.has(item.task_state?.block_id ?? NO_BLOCK)) return false;

  if (filters.eligibleOnly && verdict === "CANDIDATE" && !row.canSelect) {
    return false;
  }

  if (filters.assignees.length > 0) {
    const keys = (item.assignees ?? []).map(assigneeKey);
    const hit = filters.assignees.some((f) =>
      f === NO_ASSIGNEE ? keys.length === 0 : keys.includes(f),
    );
    if (!hit) return false;
  }

  if (
    filters.categories.length > 0 &&
    !filters.categories.includes(item.category)
  ) {
    return false;
  }

  if (
    filters.minConfidence != null &&
    (item.confidence ?? 0) < filters.minConfidence
  ) {
    return false;
  }

  if (query.trim()) {
    const needle = query.trim().toLowerCase();
    const hay = [
      item.jira_issue_key,
      item.task_title ?? "",
      item.verification ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  return true;
}

/**
 * 사람이 직접 건 필터의 수. 자동 판단으로 감춘 블록은 세지 않는다 —
 * 아무것도 안 건드렸는데 "필터 3개 적용 중"이라고 하면 사용자가 자기가 뭘 했는지 의심하게 된다.
 */
export function activeFilterCount(f: DockFilters): number {
  let n = 0;
  if (f.hiddenBlocks !== null && f.hiddenBlocks.length > 0) n += 1;
  if (f.assignees.length) n += 1;
  if (f.categories.length) n += 1;
  if (f.minConfidence != null) n += 1;
  if (!f.eligibleOnly) n += 1;
  return n;
}

/**
 * 태스크 상태 → 뱃지. 블록 이름은 보드마다 다르므로 서버가 준 이름을 그대로 쓰고,
 * 색만 "이미 끝났는가"로 가른다 — 목록에서 걸러야 할 행이 색으로 먼저 보여야 한다.
 */
function stateBadge(s: JiraAutofixTaskState): { label: string; cls: string } {
  if (s.qa_state === "REVIEW" || s.qa_state === "VERIFIED") {
    return {
      label: s.qa_state === "REVIEW" ? "QA 검토중" : "QA 완료",
      cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (s.completed || s.block_fixed_type === "DONE") {
    return {
      label: s.block_name ?? "완료",
      cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (s.qa_state === "REJECTED") {
    return {
      label: "QA 반려",
      cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    };
  }
  return {
    label: s.block_name ?? "위치 없음",
    cls: "bg-foreground/10 text-slate-400",
  };
}

/** 디스크가 이보다 적으면 경고. Library 재빌드가 반복되므로 여유가 곧 처리량이다. */
const LOW_DISK_GB = 20;

/**
 * 러너 자가진단 → 화면에 띄울 문제 목록. **정상 항목은 만들지 않는다** — 초록 체크 다섯 줄보다
 * 빨간 한 줄이 눈에 들어와야 한다.
 *
 * <p>`=== false`로만 비교한다. 확인에 실패한 항목은 null(모름)로 오는데, 그걸 문제로 그리면
 * 러너가 멀쩡한데도 화면이 고장난 것처럼 보인다.
 *
 * @param inFlight 진행 중인 작업 수. 작업 중에는 작업 트리가 더러운 것이 정상이라 그때는 감춘다.
 */
function runnerProblems(
  s: JiraAutofixRunnerStatus | null,
  inFlight: number,
  contract?: { runner: number | null; server: number },
): { text: string; blocking: boolean }[] {
  const out: { text: string; blocking: boolean }[] = [];

  /*
   * 계약 불일치를 맨 위에, 자가진단보다 먼저 본다.
   *
   * 이 상태에서는 서버가 작업을 아예 내주지 않아 나머지 진단이 전부 초록불이어도 큐가 돌지
   * 않는다. 화면이 이걸 말하지 않으면 "러너 연결됨 · 대기 N건"만 보이고 아무 일도 일어나지
   * 않는, 가장 나쁜 종류의 침묵이 된다. 러너가 한 번도 말을 걸지 않았으면(runner === null이고
   * 자가진단도 없으면) 아직 판단할 근거가 없으므로 조용히 넘어간다.
   */
  if (contract && (s || contract.runner !== null) && contract.runner !== contract.server) {
    out.push({
      text:
        `맥의 러너 스크립트가 낡았습니다 (러너 v${contract.runner ?? "?"} / 서버 v${contract.server}) — ` +
        "서버가 작업을 내주지 않습니다. tools/autofix/runner/ 를 맥에 다시 배포하세요",
      blocking: true,
    });
  }

  if (!s) return out;

  if (s.verify_ready === false) {
    out.push({
      text: "검증 클론이 준비되지 않았습니다 — 모든 작업이 PR 직전에 실패합니다",
      blocking: true,
    });
  }
  if (s.unity_version_ok === false) {
    out.push({
      text: "프로젝트가 요구하는 Unity 버전이 맥에 설치돼 있지 않습니다",
      blocking: true,
    });
  }
  if (s.gh_authenticated === false) {
    out.push({
      text: "gh 인증이 없습니다 — PR을 만들 수 없습니다",
      blocking: true,
    });
  }
  if (s.project_dirty === true && inFlight === 0) {
    out.push({
      text: "맥의 작업 트리가 더럽습니다 — 다음 작업이 시작되지 못합니다",
      blocking: true,
    });
  }
  if (typeof s.disk_free_gb === "number" && s.disk_free_gb < LOW_DISK_GB) {
    out.push({ text: `맥 디스크 여유 ${s.disk_free_gb}GB`, blocking: false });
  }
  if (s.unity_running === false) {
    out.push({
      text: "Unity Editor가 꺼져 있습니다 — 컴파일 검증은 그대로지만 MCP 진단 없이 수정합니다",
      blocking: false,
    });
  }
  return out;
}

/**
 * 사람이 맡긴 작업 표시.
 *
 * 접두사(CHK-/TASK-)가 범위를 말하고 이 뱃지가 출처를 말한다. 둘 다 필요한 이유는
 * QA 후보와 수동 위임이 같은 큐에 섞이고, 우선순위가 다르기 때문이다(수동이 앞).
 */
function ManualBadge() {
  return (
    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary whitespace-nowrap">
      수동
    </span>
  );
}

/**
 * 자동수정 하단 도크 — 접으면 한 줄, 펼치면 화면 하단 40%.
 *
 * <p>보드를 보면서 조작하는 것이 이 배치의 목적이다. 후보를 담을 때 원본 QASA 카드가
 * 바로 위에 깔려 있어 눈으로 확인하면서 고를 수 있다.
 *
 * <p>z-30을 쓴다 — 뷰 전환 버튼과 모바일 내비(z-40)가 계속 위에 떠야 한다.
 */
export function JiraAutofixDock({
  boardId,
  enabled,
  onOpenTask,
}: JiraAutofixDockProps) {
  const { t } = useTranslation();

  const [status, setStatus] = useState<JiraAutofixQueueStatus | null>(null);
  const [jobs, setJobs] = useState<JiraAutofixJob[]>([]);
  const [items, setItems] = useState<JiraAutofixItem[]>([]);
  const [verdict, setVerdict] = useState<JiraAutofixVerdict>("CANDIDATE");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  /** 큐에서 펼쳐 둘 묶음. 끝난 건은 기본으로 접어 둔다 — 돌고 있는 한 건이 맨 위에 있어야 한다. */
  const [queueGroups, setQueueGroups] = useState<Set<QueueGroup>>(
    () => new Set<QueueGroup>(["live", "pr"]),
  );
  const [filters, setFilters] = useState<DockFilters>(DEFAULT_FILTERS);
  /** 검색어는 저장하지 않는다 — 다음에 열었을 때 목록이 잘려 있으면 항목이 사라진 줄 안다. */
  const [query, setQuery] = useState("");
  /** 판정 근거를 편 행. 근거는 행마다 두 줄이라 기본으로 펴 두면 목록이 스캔되지 않는다. */
  const [openReasons, setOpenReasons] = useState<Set<string>>(new Set());
  /** 강제 회수는 두 번 눌러야 나간다 — 실제로 돌고 있는 러너를 실수로 놓칠 수 있다. */
  const [armedRelease, setArmedRelease] = useState<string | null>(null);
  /**
   * PR까지 간 건을 다시 돌릴 때도 두 번 누르게 한다. 서버는 이전 PR을 닫지 않으므로,
   * 한 번에 나가면 같은 대상에 열린 PR이 둘이 되고 리뷰어는 어느 쪽이 최신인지 모른다.
   */
  const [armedRequeue, setArmedRequeue] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testInfra, setTestInfra] = useState<JiraAutofixTestInfra>("NONE");
  /**
   * 서버에서 도는 판정의 진행 상태. 판정은 요청 스레드에서 끝나지 않는다(이슈 15건마다 AI 호출
   * 한 번이라 응답을 기다리면 게이트웨이가 504로 끊는다) — 그래서 상태는 서버에 있고 화면은
   * 그것을 폴링한다. 새로고침하거나 도크를 닫았다 열어도 이어서 보이는 이유다.
   */
  const [triageRun, setTriageRun] = useState<JiraAutofixTriageRun | null>(null);

  /** 슬랙 채널 목록은 설정을 열고 고르려 할 때만 불러온다 — 도크 폴링마다 부를 값이 아니다. */
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [showChannelPicker, setShowChannelPicker] = useState(false);

  const timerRef = useRef<number | null>(null);

  // 펼침 여부는 보드별로 기억한다 — 운영 중인 사람은 계속 열어둔다
  useEffect(() => {
    // 보드가 바뀌면 검색어는 따라가지 않는다 — 다른 보드의 검색 결과를 보고 있게 된다
    setQuery("");
    setFilters(readFilters(boardId));
    try {
      setExpanded(localStorage.getItem(storageKey(boardId)) === "1");
    } catch {
      setExpanded(false);
    }
  }, [boardId]);

  /** 필터 변경의 유일한 통로. 여기서만 저장하므로 저장을 빠뜨린 경로가 생기지 않는다. */
  const updateFilters = useCallback(
    (patch: Partial<DockFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(filtersKey(boardId), JSON.stringify(next));
        } catch {
          /* 저장 실패는 무시 — 이번 세션에서는 그대로 동작한다 */
        }
        return next;
      });
    },
    [boardId],
  );

  const resetFilters = () => {
    setQuery("");
    updateFilters(DEFAULT_FILTERS);
  };

  /** 목록형 필터(담당자·유형) 한 칸을 켜고 끈다. */
  const toggleIn = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem(storageKey(boardId), next ? "1" : "0");
    } catch {
      /* 저장 실패는 무시 */
    }
  };

  const load = useCallback(async () => {
    try {
      const [queueStatus, jobList, infra] = await Promise.all([
        jiraAutofixAPI.getQueueStatus(boardId),
        jiraAutofixAPI.getJobs(boardId, 50),
        jiraAutofixAPI.getTestInfra(boardId).catch(() => null),
      ]);
      setStatus(queueStatus);
      setJobs(jobList);
      if (infra) setTestInfra(infra.test_infra);
    } catch {
      // JIRA 미연동이면 조회 실패가 정상이다
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  const loadItems = useCallback(
    async (v: JiraAutofixVerdict) => {
      try {
        setItems(await jiraAutofixAPI.getItems(boardId, v));
      } catch {
        setItems([]);
      }
    },
    [boardId],
  );

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  // 돌고 있는 판정을 새로고침 뒤에도 이어서 본다 — 진행 상태는 화면이 아니라 서버에 있다
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    jiraAutofixAPI
      .getTriageStatus(boardId)
      .then((run) => {
        if (alive) setTriageRun(run);
      })
      .catch(() => {
        // JIRA 미연동이면 조회 실패가 정상이다
      });
    return () => {
      alive = false;
    };
  }, [enabled, boardId]);

  const triageRunning = triageRun?.status === "RUNNING";

  /**
   * 끝난 실행을 화면에 알린다. 실패는 빨간 배너로 간다 — 판정이 통째로 엎어진 것을
   * 회색 안내문으로 흘리면 사람은 성공한 줄 알고 큐에 담는다.
   */
  const reportTriageResult = useCallback((finished: JiraAutofixTriageRun) => {
    if (finished.status === "FAILED") {
      setError(describeTriageRun(finished));
      return;
    }
    setNotice(describeTriageRun(finished));
  }, []);

  /**
   * 판정 진행률 폴링. 판정은 서버 백그라운드에서 도니까, 끝나는 순간은 화면이 스스로 알아내야 한다.
   * 끝나면 결과 한 줄을 띄우고 목록을 다시 받는다 — 판정이 바뀌었는데 화면이 그대로면
   * 방금 돌린 게 아무 일도 안 한 것처럼 보인다.
   */
  useEffect(() => {
    if (!enabled || !triageRunning) return;
    const tick = async () => {
      try {
        const latest = await jiraAutofixAPI.getTriageStatus(boardId);
        setTriageRun(latest);
        if (latest.status !== "RUNNING") {
          reportTriageResult(latest);
          await Promise.all([load(), loadItems(verdict)]);
        }
      } catch {
        // 한 번의 조회 실패로 폴링을 끊지 않는다 — 다음 틱에서 만회한다
      }
    };
    const id = window.setInterval(tick, TRIAGE_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [
    enabled,
    triageRunning,
    boardId,
    load,
    loadItems,
    verdict,
    reportTriageResult,
  ]);

  useEffect(() => {
    if (expanded) loadItems(verdict);
  }, [expanded, verdict, loadItems]);

  // 접혀 있어도 폴링한다 — 바에 뜨는 경과 시간이 멈춰 있으면 안 된다.
  // 대기 건만 있을 때도 돌려야 한다 — 스케줄러가 집어가는 순간(대기 → 진행)이 화면에 나타나야 한다.
  //
  // 펼쳐져 있으면 목록도 같이 받는다. 목록에 실린 태스크 상태는 서버 스냅샷이라, 그동안 누가
  // 카드를 완료로 옮겨도 화면은 계속 "담을 수 있음"이라고 말한다 — 담기가 서버에서 조용히 걸린다.
  useEffect(() => {
    if (!enabled || (!status?.in_flight && !status?.queued)) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      load();
      if (expanded) loadItems(verdict);
    };
    timerRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [
    enabled,
    status?.in_flight,
    status?.queued,
    load,
    expanded,
    verdict,
    loadItems,
  ]);

  // 뷰 전환 버튼이 도크 위로 비켜 서도록 높이를 알린다
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--autofix-dock-h", expanded ? DOCK_HEIGHT : "0px");
    return () => root.style.removeProperty("--autofix-dock-h");
  }, [expanded]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다");
    } finally {
      setBusy(null);
    }
  };

  /**
   * 시작 응답 처리. 대개는 RUNNING이라 문구만 띄우고 물러난다 — 완료는 진행률 폴링이 잡는다.
   * 판정할 게 없어 그 자리에서 끝난 경우만 여기서 마무리한다.
   */
  const finishTriageIfDone = async (
    started: JiraAutofixTriageRun,
    runningNotice: string,
  ) => {
    if (started.status === "RUNNING") {
      setNotice(runningNotice);
      return;
    }
    reportTriageResult(started);
    await Promise.all([load(), loadItems(verdict)]);
  };

  /**
   * 시작만 하고 끝을 기다리지 않는다.
   *
   * <p>여기서 await로 붙들면 이슈가 몇십 건만 돼도 게이트웨이가 504로 끊는다. 그때도 서버는
   * 판정을 멀쩡히 계속하므로 화면만 실패로 보이고, 사람이 다시 누르면 AI 호출이 두 배가 된다.
   */
  const handleTriage = () =>
    run("triage", async () => {
      const started = await jiraAutofixAPI.runTriage(boardId, false);
      setTriageRun(started);
      await finishTriageIfDone(started, `${started.total}건 판정 중`);
    });

  /**
   * 판정 후 태스크가 바뀐 건만 다시 판정한다.
   *
   * <p>전건 재판정은 AI 호출 비용이 커서 아무도 누르지 않고, 그러면 낡은 판정이 그대로 남는다.
   * 바뀐 것만 좁혀 돌리면 누를 만한 비용이 된다.
   */
  const handleRetriageStale = (issueKeys: string[]) =>
    run("retriage", async () => {
      const started = await jiraAutofixAPI.runTriage(boardId, false, issueKeys);
      setTriageRun(started);
      await finishTriageIfDone(started, `${started.total}건 다시 판정 중`);
    });

  const handleEnqueue = (issueKeys?: string[]) =>
    run("enqueue", async () => {
      const result = await jiraAutofixAPI.enqueue(boardId, { issueKeys });
      const parts = [`${result.queued}건 담김`];
      if (result.skipped_low_confidence > 0) {
        parts.push(`확신도 미달 ${result.skipped_low_confidence}건 제외`);
      }
      if (result.skipped_already_queued > 0) {
        parts.push(`이미 처리한 이슈 ${result.skipped_already_queued}건 제외`);
      }
      if (result.skipped_already_done > 0) {
        parts.push(`이미 끝난 태스크 ${result.skipped_already_done}건 제외`);
      }
      setNotice(parts.join(" · "));
      setSelected(new Set());
      await Promise.all([load(), loadItems(verdict)]);
    });

  const handleCancel = (jobId: string) =>
    run(`cancel:${jobId}`, async () => {
      await jiraAutofixAPI.cancelJob(boardId, jobId);
      await load();
    });

  /**
   * 진행 중인 작업 강제 회수. 러너(맥)가 죽으면 콜백이 오지 않고, 직렬 보장 때문에 그 한 건이
   * 자동 회수 시각까지 보드의 큐 전체를 막는다. 그동안 사람이 할 수 있는 일이 없으면 안 된다.
   */
  const handleRelease = (jobId: string) =>
    run(`release:${jobId}`, async () => {
      await jiraAutofixAPI.cancelJob(boardId, jobId, true);
      setArmedRelease(null);
      setNotice("진행 중이던 작업을 회수했습니다. 다음 대기 건이 곧 나갑니다.");
      await Promise.all([load(), loadItems(verdict)]);
    });

  /**
   * 실패로 끝난 작업 비우기 — 같은 대상을 다시 담을 수 있게 한다.
   *
   * <p>"이슈당 1회" 가드는 CANCELLED 외의 모든 상태를 "이미 처리함"으로 세므로, 러너 쪽 사고로
   * 한 번 실패하면 그 대상은 이 버튼 없이는 자동수정에서 영구히 빠진다. 러너를 고친 뒤
   * 태워먹은 건들을 다시 태우는 유일한 경로다.
   *
   * <p>돌고 있는 작업을 놓는 강제 회수와 달리 두 번 누르게 하지 않는다 — 이미 끝난 건이라
   * 잘못 눌러도 잃을 것이 없다.
   */
  const handleDiscard = (jobId: string) =>
    run(`discard:${jobId}`, async () => {
      await jiraAutofixAPI.cancelJob(boardId, jobId, true);
      setNotice("실패한 작업을 비웠습니다. 이제 같은 대상을 다시 담을 수 있습니다.");
      await Promise.all([load(), loadItems(verdict)]);
    });

  /**
   * 끝난 작업을 같은 대상으로 다시 담는다 — 비우기와 달리 한 번에 큐까지 들어간다.
   *
   * <p>비우기는 후보 목록으로 되돌릴 뿐이라 PR까지 간 이슈에는 쓸모가 없다. 자동수정이
   * 성공했으면 태스크는 이미 QA로 넘어가 있고, 담기는 그걸 "이미 끝난 태스크"로 걸러낸다.
   *
   * <p>이전 PR은 서버가 닫지 않는다. 눌러 놓고 잊는 일이 없게 결과 문구에서 한 번 더 말한다.
   */
  const handleRequeue = (jobId: string) =>
    run(`requeue:${jobId}`, async () => {
      const job = await jiraAutofixAPI.requeueJob(boardId, jobId);
      setArmedRequeue(null);
      setNotice(
        `${job.job_key}을(를) 다시 담았습니다. 이전 PR은 직접 닫아주세요.`,
      );
      await Promise.all([load(), loadItems(verdict)]);
    });

  /**
   * 채널 목록은 한 번 받아두고 다시 열 때는 재사용한다. 슬랙 워크스페이스 채널 수가 많으면
   * 커서 페이징이 여러 번 도는데, 설정을 여닫을 때마다 그걸 반복할 이유가 없다.
   */
  const toggleChannelPicker = () => {
    if (channels) {
      setShowChannelPicker((v) => !v);
      return;
    }
    return run("channels", async () => {
      const all: SlackChannel[] = [];
      let cursor: string | undefined;
      do {
        const data = await slackAppAPI.listChannels(boardId, cursor);
        all.push(...data.channels);
        cursor = data.next_cursor ?? undefined;
      } while (cursor);
      setChannels(all.filter((c) => !c.is_archived));
      setShowChannelPicker(true);
    });
  };

  const handleChannelSelect = (channel: SlackChannel | null) =>
    run("channel", async () => {
      await jiraAutofixAPI.updateSlackChannel(
        boardId,
        channel?.id ?? null,
        channel?.name ?? null,
      );
      setShowChannelPicker(false);
      setNotice(
        channel
          ? `결과를 #${channel.name}에 게시합니다. 그 채널에 MILKYWAY(봇)를 초대해야 실제로 나갑니다.`
          : "전용 채널을 해제했습니다. 슬랙 기본 채널로 나갑니다.",
      );
      await load();
    });

  const handleInfraChange = (level: JiraAutofixTestInfra) => {
    if (level === testInfra) return;
    return run("infra", async () => {
      await jiraAutofixAPI.updateTestInfra(boardId, level);
      setTestInfra(level);
      setItems([]);
      setNotice(
        "검증 환경이 바뀌어 기존 판정을 비웠습니다. 다시 판정해주세요.",
      );
      await load();
    });
  };

  const handleToken = () =>
    run("token", async () => {
      const result = await jiraAutofixAPI.issueCallbackToken(boardId);
      await navigator.clipboard?.writeText(result.callback_token);
      setNotice(
        "러너 토큰을 복사했습니다. 맥의 runner.conf에 BRIDGE_TOKEN으로 넣어주세요.",
      );
      await load();
    });

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!enabled || isLoading || !status) return null;

  /**
   * 검증 클론이 없으면 담아봐야 전부 PR 직전에 실패한다. 그런데 실패한 작업은 이슈당 1회
   * 가드레일에 걸려 다시 담을 수 없으므로, 그냥 두면 후보를 영구히 태워버린다 — 그래서 막는다.
   * (모름=null일 때는 막지 않는다. 구버전 러너를 세우면 안 된다.)
   */
  const setupDone =
    !!status.repo_full_name &&
    !status.repo_ambiguous &&
    status.callback_token_set &&
    status.runner_online &&
    status.runner_status?.verify_ready !== false;

  const problems = runnerProblems(status.runner_status, status.in_flight, {
    runner: status.runner_contract_version,
    server: status.server_contract_version,
  });

  const active = jobs.find((j) => j.status === "DISPATCHED") ?? null;
  const waiting = jobs.filter((j) => j.status === "QUEUED");
  const succeeded = jobs.filter((j) => j.status === "SUCCEEDED");
  const settled = jobs.filter(
    (j) =>
      j.status === "NO_CHANGE" ||
      j.status === "FAILED" ||
      j.status === "TIMED_OUT",
  );
  const needsAttention = settled.some((j) => j.status === "TIMED_OUT");
  const elapsed = minutesSince(active?.dispatched_at ?? null);

  /** 이슈별 최근 작업. jobs는 담긴 순서 역순이라 먼저 나온 것이 최신이다. */
  const latestJobByIssue = new Map<string, JiraAutofixJob>();
  for (const job of jobs) {
    // 수동 위임은 이슈 키가 없다. 트리아지 목록과 짝지을 대상이 아니다.
    if (job.job_kind !== "JIRA") continue;
    if (!latestJobByIssue.has(job.job_key)) {
      latestJobByIssue.set(job.job_key, job);
    }
  }

  /**
   * 서버가 조용히 걸러낼 항목을 화면에서 미리 가른다 — 골라서 담았는데 "0건 담김"만 돌아오면
   * 무엇이 잘못됐는지 알 수 없다. 기준은 서버 가드레일과 같다(취소된 건만 다시 담을 수 있고,
   * 임계값 미만·이미 끝난 태스크는 담기지 않는다).
   */
  const decorated = items.map((item) => {
    const latest = latestJobByIssue.get(item.jira_issue_key) ?? null;
    const held = latest && latest.status !== "CANCELLED" ? latest : null;
    const belowThreshold =
      item.confidence != null && item.confidence < status.min_confidence;
    const alreadyDone = item.task_state?.already_done === true;
    return {
      item,
      held,
      belowThreshold,
      alreadyDone,
      canSelect:
        item.verdict === "CANDIDATE" &&
        !held &&
        !belowThreshold &&
        !alreadyDone,
    };
  });

  /*
   * 블록별 집계 — 필터 칩의 재료이자 기본값의 근거. 판정은 스냅샷이라 그 뒤 완료·QA로 넘어간
   * 이슈가 후보에 그대로 남는데, 그것들이 섞여 있으면 무엇을 봐야 하는지 알 수 없다.
   */
  const blockStats = new Map<
    string,
    { key: string; name: string; position: number; total: number; done: number }
  >();
  for (const d of decorated) {
    const st = d.item.task_state;
    const key = st?.block_id ?? NO_BLOCK;
    const entry = blockStats.get(key) ?? {
      key,
      name: st?.block_name ?? "위치 없음",
      // 위치가 없는 칸은 항상 끝으로 민다
      position: st?.block_position ?? Number.MAX_SAFE_INTEGER,
      total: 0,
      done: 0,
    };
    entry.total += 1;
    if (d.alreadyDone) entry.done += 1;
    blockStats.set(key, entry);
  }
  const blockList = [...blockStats.values()].sort(
    (a, b) => a.position - b.position,
  );

  /*
   * 사람이 고른 적이 없으면 "전부 끝난 블록"만 감춘다(완료·QA 검토중 등). 이름을 추측하지 않으므로
   * "작업 완료" 같은 중간 블록은 켜진 채 뜬다 — 그건 칩을 한 번 눌러 끄면 보드별로 기억된다.
   */
  const autoHiddenBlocks = blockList
    .filter((b) => b.total > 0 && b.done === b.total)
    .map((b) => b.key);
  const effectiveHidden = new Set(filters.hiddenBlocks ?? autoHiddenBlocks);

  /** 담당자 축 — 목록에 실제로 등장하는 사람만. 보드 전체 멤버를 늘어놓으면 고를 수가 없다. */
  const assigneeStats = new Map<
    string,
    { key: string; name: string; color: string | null; count: number }
  >();
  let unassignedCount = 0;
  for (const d of decorated) {
    if (d.item.assignees.length === 0) {
      unassignedCount += 1;
      continue;
    }
    for (const a of d.item.assignees) {
      const key = assigneeKey(a);
      const entry = assigneeStats.get(key) ?? {
        key,
        name: a.name,
        color: a.color,
        count: 0,
      };
      entry.count += 1;
      assigneeStats.set(key, entry);
    }
  }
  const assigneeList = [...assigneeStats.values()].sort(
    (a, b) => b.count - a.count,
  );

  /** 유형 축 — 등장하는 카테고리만, 많은 순으로. */
  const categoryStats = new Map<JiraAutofixCategory, number>();
  for (const d of decorated) {
    categoryStats.set(
      d.item.category,
      (categoryStats.get(d.item.category) ?? 0) + 1,
    );
  }
  const categoryList = [...categoryStats.entries()].sort((a, b) => b[1] - a[1]);

  const visible = decorated.filter((d) =>
    passesDockFilters(d, {
      filters,
      hiddenBlocks: effectiveHidden,
      query,
      verdict,
    }),
  );
  const hiddenCount = decorated.length - visible.length;
  const selectableCount = visible.filter((d) => d.canSelect).length;
  const activeFilters = activeFilterCount(filters);

  /*
   * 고른 뒤에 태스크가 완료되거나 다른 사람이 같은 이슈를 담으면 선택은 그대로 남는데 담기지 않는다.
   * 실제로 담길 것만 세어 버튼에 쓴다 — "선택 5건 담기"를 눌렀는데 2건만 담기면 화면이 거짓말한 것이다.
   */
  const enqueueTargets = visible
    .filter((d) => d.canSelect && selected.has(d.item.jira_issue_key))
    .map((d) => d.item.jira_issue_key);

  /** "보이는 것 전부"의 대상. 필터 밖은 절대 포함하지 않는다. */
  const visibleSelectableKeys = visible
    .filter((d) => d.canSelect)
    .map((d) => d.item.jira_issue_key);

  /**
   * 판정 후 태스크가 바뀐 건. 판정이 낡았을 수 있다는 신호라 다시 돌릴 후보다.
   * 감춰 둔 칸의 항목은 뺀다 — 안 보는 칸을 재판정에 태우면 AI 호출만 늘어난다.
   */
  const staleKeys = visible
    .filter((d) => d.item.stale_triage)
    .map((d) => d.item.jira_issue_key);

  const showLive = queueGroups.has("live");

  const toggleReason = (key: string) => {
    setOpenReasons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      className="fixed left-0 right-0 bottom-16 md:bottom-0 z-30
        bg-bridge-obsidian border-t border-bridge-border shadow-2xl"
    >
      {/* 접힘 바 — 펼치지 않아도 돌고 있는지 알 수 있어야 한다 */}
      <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
        <button
          onClick={toggleExpanded}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 text-xs font-bold text-foreground hover:text-bridge-accent transition-colors"
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          {t("autofixDock.title", "자동수정")}
        </button>

        {status.in_flight > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
            진행 {status.in_flight}
          </span>
        )}
        {waiting.length > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/10 text-slate-400">
            대기 {waiting.length}
          </span>
        )}
        {/* 수동 작업은 큐 앞자리를 차지하므로 몇 건인지 따로 보인다 */}
        {status.queued_manual > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
            수동 {status.queued_manual}
          </span>
        )}
        {succeeded.length > 0 && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            PR {succeeded.length}
          </span>
        )}
        {needsAttention && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            확인 필요
          </span>
        )}

        {active && (
          <>
            <span className="text-foreground/15 text-xs">·</span>
            <span className="text-xs text-slate-500 tabular-nums">
              {active.job_key}
              {elapsed !== null && ` · ${elapsed}분`}
            </span>
          </>
        )}

        <span className="ml-auto flex items-center gap-2">
          {/* 러너가 죽으면 큐는 그냥 조용해진다 — 접힌 상태에서도 그 사실이 보여야 한다 */}
          {!status.runner_online && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <PowerOff size={11} />
              {t("autofixDock.runnerOffline", "러너 오프라인")}
              {status.runner_seen_at &&
                ` · ${formatRelativeTime(status.runner_seen_at)}`}
            </span>
          )}
          {!setupDone && status.runner_online && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t("autofixDock.setupNeeded", "셋업 필요")}
            </span>
          )}
          {setupDone && !status.dispatch_enabled && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <PauseCircle size={11} />
              {t("autofixDock.paused", "실행 중지됨")}
            </span>
          )}
          <span className="text-xs text-slate-500 tabular-nums">
            {t("autofixDock.today", "오늘")} {status.dispatched_today}/
            {status.daily_limit}
          </span>
        </span>
      </div>

      {expanded && (
        <div
          className="border-t border-foreground/[0.08] overflow-y-auto custom-scrollbar"
          style={{ height: DOCK_HEIGHT }}
        >
          <div className="p-3 space-y-2">
            {/* 액션 줄 */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleTriage}
                disabled={busy === "triage" || triageRunning}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
              >
                {busy === "triage" || triageRunning ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {/* 진행 숫자를 버튼에 박는다 — 수 분짜리 작업이라 도는 중인지 멈춘 건지 보여야 한다 */}
                {triageRunning ? (
                  <span className="tabular-nums">
                    {t("autofixDock.triaging", "판정 중")}{" "}
                    {triageRun?.triaged ?? 0}/{triageRun?.total ?? 0}
                  </span>
                ) : (
                  t("autofixDock.triage", "판정")
                )}
              </button>
              <span className="text-xs text-slate-500">
                {t("autofixDock.threshold", "임계값")}{" "}
                <b className="text-foreground tabular-nums">
                  {status.min_confidence.toFixed(2)}
                </b>
              </span>
              <button
                onClick={() => setShowSettings(!showSettings)}
                aria-expanded={showSettings}
                className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all"
              >
                <Settings2 size={12} />
                {t("autofixDock.settings", "설정")}
              </button>
            </div>

            {showSettings && (
              <div className="px-2.5 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] space-y-2">
                <div>
                  <div className="text-xs text-slate-400 mb-1.5">
                    {t("autofixDock.testInfra", "저장소 검증 환경")}
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    {TEST_INFRA_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        onClick={() => handleInfraChange(o.value)}
                        disabled={busy === "infra"}
                        aria-pressed={testInfra === o.value}
                        className={`px-2 py-1 rounded-lg text-xs transition-colors disabled:opacity-50 ${
                          testInfra === o.value
                            ? "bg-bridge-accent/15 text-bridge-accent font-bold"
                            : "text-slate-400 hover:bg-foreground/5"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    {
                      TEST_INFRA_OPTIONS.find((o) => o.value === testInfra)
                        ?.hint
                    }
                  </div>
                </div>
                <div className="pt-2 border-t border-foreground/[0.08]">
                  <div className="text-xs text-slate-400 mb-1.5">
                    {t("autofixDock.slackChannel", "결과 게시 채널")}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-foreground">
                      {status.slack_channel_id
                        ? `#${status.slack_channel_name ?? status.slack_channel_id}`
                        : t("autofixDock.slackDefault", "슬랙 기본 채널")}
                    </span>
                    <button
                      onClick={toggleChannelPicker}
                      disabled={busy === "channels" || busy === "channel"}
                      className="text-xs text-bridge-accent hover:underline disabled:opacity-50"
                    >
                      {busy === "channels" ? (
                        <Loader2 className="w-3 h-3 animate-spin inline" />
                      ) : (
                        t("autofixDock.changeChannel", "변경")
                      )}
                    </button>
                    {status.slack_channel_id && (
                      <button
                        onClick={() => handleChannelSelect(null)}
                        disabled={busy === "channel"}
                        className="text-xs text-slate-500 hover:text-foreground disabled:opacity-50"
                      >
                        {t("autofixDock.clearChannel", "해제")}
                      </button>
                    )}
                  </div>
                  {showChannelPicker && channels && (
                    <div className="mt-1.5 max-h-40 overflow-y-auto custom-scrollbar rounded-lg border border-foreground/10">
                      {channels.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-slate-500">
                          채널을 찾지 못했습니다. 슬랙 연결을 확인하세요.
                        </div>
                      ) : (
                        channels.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleChannelSelect(c)}
                            disabled={busy === "channel"}
                            className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:bg-foreground/5 hover:text-foreground transition-colors disabled:opacity-50"
                          >
                            #{c.name}
                            {c.is_private && (
                              <span className="ml-1 text-slate-600">
                                비공개
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 leading-relaxed mt-1">
                    {!status.slack_notify_enabled
                      ? "서버에서 자동수정 슬랙 알림이 꺼져 있어 채널을 골라도 나가지 않습니다."
                      : "PR 생성 · 변경 없음 · 실패 · 시간 초과 회수를 게시합니다. 취소는 보내지 않습니다."}
                  </div>
                </div>
                {!status.callback_token_set && (
                  <button
                    onClick={handleToken}
                    disabled={busy === "token"}
                    className="text-xs text-bridge-accent hover:underline disabled:opacity-50"
                  >
                    {t("autofixDock.issueToken", "러너 토큰 발급")}
                  </button>
                )}
              </div>
            )}

            {/* 셋업 체크리스트 */}
            {!setupDone && (
              <div className="px-2.5 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] space-y-1">
                <SetupRow
                  done={!!status.repo_full_name && !status.repo_ambiguous}
                  label={
                    status.repo_ambiguous
                      ? "저장소 연결 · 여러 개가 연결돼 하나로 좁혀야 합니다"
                      : status.repo_full_name
                        ? `저장소 연결 · ${status.repo_full_name}`
                        : "저장소 연결 · 연결된 저장소가 없습니다"
                  }
                />
                <SetupRow
                  done={status.callback_token_set}
                  label="러너 토큰"
                  action={
                    !status.callback_token_set ? (
                      <button
                        onClick={handleToken}
                        className="text-xs text-bridge-accent hover:underline"
                      >
                        {t("autofixDock.issue", "발급")}
                      </button>
                    ) : undefined
                  }
                />
                <SetupRow
                  done={status.runner_online}
                  label={
                    status.runner_online
                      ? `러너 연결 · ${status.runner_name ?? "이름 없음"}`
                      : status.runner_seen_at
                        ? `러너 연결 · ${formatRelativeTime(status.runner_seen_at)}부터 응답이 없습니다`
                        : "러너 연결 · 맥에서 러너가 한 번도 접속하지 않았습니다"
                  }
                />
              </div>
            )}

            {/*
              러너 자가진단 — 셋업이 끝난 뒤에도 계속 보여야 한다. 디스크가 차거나 검증 클론이
              사라지는 건 설정 문제가 아니라 운영 중에 생기는 일이고, 그때 화면이 침묵하면
              큐가 조용히 멈춘 것처럼 보인다.
            */}
            {problems.length > 0 && (
              <div className="px-2.5 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] space-y-1">
                <div className="text-xs text-slate-400">
                  {t("autofixDock.runnerDiagnostics", "러너 상태")}
                  {status.runner_name && ` · ${status.runner_name}`}
                </div>
                {problems.map((p) => (
                  <div
                    key={p.text}
                    className={`flex items-start gap-1.5 text-xs leading-relaxed ${
                      p.blocking
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    <AlertCircle size={12} className="shrink-0 mt-0.5" />
                    <span>{p.text}</span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}
            {notice && !error && (
              <div className="text-xs text-slate-500">{notice}</div>
            )}

            {/* 2열 — 왼쪽에서 고르고 오른쪽에서 지켜본다 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <section className="rounded-lg border border-foreground/[0.08] overflow-hidden">
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-foreground/[0.04] border-b border-foreground/[0.08]">
                  <span className="text-xs font-bold text-foreground">
                    {t("autofixDock.candidates", "트리아지")}
                  </span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums">
                    {verdict === "CANDIDATE"
                      ? `선택 ${selected.size} · 담을 수 있음 ${selectableCount} / ${visible.length}건`
                      : `${visible.length}건`}
                  </span>
                </div>

                <div className="flex items-center gap-1 px-2.5 pt-2 flex-wrap">
                  {VERDICT_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => {
                        setVerdict(tab.value);
                        setSelected(new Set());
                      }}
                      className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                        verdict === tab.value
                          ? "bg-bridge-accent/15 text-bridge-accent font-bold"
                          : "text-slate-400 bg-foreground/[0.06] hover:bg-foreground/10"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}

                  {hiddenCount > 0 && (
                    <span className="ml-auto text-xs text-slate-500 tabular-nums">
                      {t("autofixDock.hiddenCount", "숨김")} {hiddenCount}
                    </span>
                  )}
                </div>

                {/*
                  필터 바 — 이 화면의 본체다. 축이 판정 3탭뿐이면 수십 건을 눈으로 훑는 수밖에 없다.
                  전부 클라이언트 필터라 칩 반응이 즉시고, 고른 조합은 보드별로 기억한다.
                */}
                <div className="px-2.5 pt-2 space-y-1.5">
                  {/* 검색 + 담을 수 있는 것만 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="relative flex-1 min-w-[10rem]">
                      <Search
                        size={12}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                      />
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t(
                          "autofixDock.searchPlaceholder",
                          "이슈 키 또는 제목",
                        )}
                        aria-label={t("autofixDock.searchLabel", "후보 검색")}
                        className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg
                          py-1 pl-7 pr-2 text-xs text-foreground placeholder-slate-500
                          focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                      />
                    </div>

                    {verdict === "CANDIDATE" && (
                      <FilterChip
                        on={filters.eligibleOnly}
                        onClick={() =>
                          updateFilters({ eligibleOnly: !filters.eligibleOnly })
                        }
                        label={t(
                          "autofixDock.eligibleOnly",
                          "담을 수 있는 것만",
                        )}
                      />
                    )}

                    {(activeFilters > 0 || query) && (
                      <button
                        onClick={resetFilters}
                        className="text-xs text-slate-500 hover:text-foreground underline underline-offset-2 transition-colors"
                      >
                        {t("autofixDock.resetFilters", "필터 초기화")}
                      </button>
                    )}
                  </div>

                  {/*
                    판정 후 카드가 움직인 건 = 판정이 낡았을 수 있는 건. 여기서만 좁혀 다시 돌린다 —
                    전건 재판정은 AI 호출 비용 때문에 아무도 안 눌러서, 낡은 판정이 그대로 남는다.
                  */}
                  {staleKeys.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-slate-500">
                        {t("autofixDock.staleNotice", "판정 후 변경됨")}{" "}
                        <span className="tabular-nums text-foreground">
                          {staleKeys.length}
                        </span>
                        {t("autofixDock.countUnit", "건")}
                      </span>
                      <button
                        onClick={() => handleRetriageStale(staleKeys)}
                        disabled={busy === "retriage" || triageRunning}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                          bg-bridge-accent/15 text-bridge-accent font-bold
                          hover:bg-bridge-accent/25 transition-colors disabled:opacity-50"
                      >
                        {busy === "retriage" || triageRunning ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Sparkles size={11} />
                        )}
                        {t("autofixDock.retriageStale", "이것만 다시 판정")}
                      </button>
                    </div>
                  )}

                  {/*
                    위치 — 판정 목록은 스냅샷이라 "이미 저 칸으로 넘어간 건"이 후보에 그대로 남는데,
                    어느 칸까지를 끝으로 볼지는 보드마다 다르다. 서버가 이름으로 추측하지 않고 여기서 고른다.
                  */}
                  {blockList.length > 1 && (
                    <FilterRow label={t("autofixDock.blockFilter", "위치")}>
                      {blockList.map((b) => (
                        <FilterChip
                          key={b.key}
                          on={!effectiveHidden.has(b.key)}
                          strikeWhenOff
                          count={b.total}
                          label={b.name}
                          onClick={() => {
                            const base =
                              filters.hiddenBlocks ?? autoHiddenBlocks;
                            updateFilters({
                              hiddenBlocks: toggleIn(base, b.key),
                            });
                          }}
                        />
                      ))}
                    </FilterRow>
                  )}

                  {(assigneeList.length > 0 || unassignedCount > 0) && (
                    <FilterRow label={t("autofixDock.assigneeFilter", "담당")}>
                      {assigneeList.map((a) => (
                        <FilterChip
                          key={a.key}
                          on={filters.assignees.includes(a.key)}
                          count={a.count}
                          label={a.name}
                          swatch={getAssigneeHex(a.name, a.color)}
                          onClick={() =>
                            updateFilters({
                              assignees: toggleIn(filters.assignees, a.key),
                            })
                          }
                        />
                      ))}
                      {unassignedCount > 0 && (
                        <FilterChip
                          on={filters.assignees.includes(NO_ASSIGNEE)}
                          count={unassignedCount}
                          label={t("autofixDock.noAssignee", "담당자 없음")}
                          onClick={() =>
                            updateFilters({
                              assignees: toggleIn(
                                filters.assignees,
                                NO_ASSIGNEE,
                              ),
                            })
                          }
                        />
                      )}
                    </FilterRow>
                  )}

                  {categoryList.length > 1 && (
                    <FilterRow label={t("autofixDock.categoryFilter", "유형")}>
                      {categoryList.map(([cat, count]) => (
                        <FilterChip
                          key={cat}
                          on={filters.categories.includes(cat)}
                          count={count}
                          label={CATEGORY_LABEL[cat] ?? cat}
                          onClick={() =>
                            updateFilters({
                              categories: toggleIn(filters.categories, cat),
                            })
                          }
                        />
                      ))}
                    </FilterRow>
                  )}

                  <FilterRow
                    label={t("autofixDock.confidenceFilter", "확신도")}
                  >
                    <input
                      type="range"
                      min={0.5}
                      max={0.95}
                      step={0.05}
                      value={filters.minConfidence ?? 0.5}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        // 최소값으로 되돌리면 조건 자체를 없앤다 — "0.50 이상"은 필터가 아니다
                        updateFilters({ minConfidence: v <= 0.5 ? null : v });
                      }}
                      aria-label={t("autofixDock.minConfidence", "최소 확신도")}
                      className="w-24 accent-bridge-accent"
                    />
                    <span className="text-xs text-slate-500 tabular-nums">
                      {filters.minConfidence == null
                        ? t("autofixDock.confidenceAll", "전체")
                        : `${filters.minConfidence.toFixed(2)} 이상`}
                    </span>
                    <span className="text-xs text-slate-600">
                      {t("autofixDock.thresholdHint", "담기 임계값")}{" "}
                      <span className="tabular-nums">
                        {status.min_confidence.toFixed(2)}
                      </span>
                    </span>
                  </FilterRow>
                </div>

                <div className="p-2 space-y-1">
                  {visible.length === 0 ? (
                    <div className="text-xs text-slate-500 px-0.5 py-2 leading-relaxed">
                      {hiddenCount > 0
                        ? t(
                            "autofixDock.allHidden",
                            "조건에 맞는 후보가 없습니다. 필터를 풀거나 초기화하세요.",
                          ) + ` (${hiddenCount}건 숨김)`
                        : t(
                            "autofixDock.noItems",
                            "판정 결과가 없습니다. 판정을 눌러 이슈를 분류하세요.",
                          )}
                    </div>
                  ) : (
                    visible.map(
                      ({
                        item,
                        held,
                        belowThreshold,
                        alreadyDone,
                        canSelect,
                      }) => {
                        const on = selected.has(item.jira_issue_key);
                        const toggle = () => toggleSelect(item.jira_issue_key);
                        const reasonOpen = openReasons.has(item.jira_issue_key);
                        const badge = item.task_state
                          ? stateBadge(item.task_state)
                          : null;
                        return (
                          // 행 어디를 눌러도 선택된다 — 체크박스만 눌리면 골랐다고 생각하고
                          // 담기를 눌렀는데 아무 일도 일어나지 않는다
                          <div
                            key={item.jira_issue_key}
                            {...(canSelect
                              ? {
                                  role: "checkbox" as const,
                                  "aria-checked": on,
                                  "aria-label": `${item.jira_issue_key} ${item.task_title ?? ""} 선택`,
                                  tabIndex: 0,
                                  onClick: toggle,
                                  onKeyDown: (e: React.KeyboardEvent) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      toggle();
                                    }
                                  },
                                }
                              : {})}
                            className={`flex items-start gap-1.5 px-2 py-1.5 rounded-lg border transition-colors ${
                              on
                                ? "border-bridge-accent/40 bg-bridge-accent/[0.07]"
                                : "border-foreground/[0.08]"
                            } ${
                              canSelect
                                ? "cursor-pointer hover:border-bridge-accent/30 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                                : held || alreadyDone
                                  ? "opacity-60"
                                  : ""
                            }`}
                          >
                            {canSelect && (
                              <span
                                aria-hidden
                                className={`mt-0.5 w-3.5 h-3.5 shrink-0 rounded border transition-colors ${
                                  on
                                    ? "bg-bridge-accent border-bridge-accent"
                                    : "border-foreground/25"
                                }`}
                              >
                                {on && (
                                  <Check
                                    size={11}
                                    className="text-white"
                                    strokeWidth={3}
                                  />
                                )}
                              </span>
                            )}
                            <div className="min-w-0 flex-1 space-y-0.5">
                              {/* 1줄 — 무슨 버그인지. 판정 근거가 아니라 제목이 먼저 온다 */}
                              <div className="flex items-center gap-1.5">
                                <IssueKey
                                  issueKey={item.jira_issue_key}
                                  taskId={item.task_id}
                                  onOpenTask={onOpenTask}
                                />
                                <span
                                  className="min-w-0 flex-1 text-xs text-foreground truncate"
                                  title={item.task_title ?? undefined}
                                >
                                  {item.task_title ??
                                    t(
                                      "autofixDock.noTitle",
                                      "연동이 끊긴 이슈",
                                    )}
                                </span>
                                {item.confidence != null && (
                                  <span className="shrink-0 flex items-center gap-1 text-xs text-slate-500 tabular-nums">
                                    <span className="w-8 h-[3px] rounded-full bg-foreground/10 overflow-hidden">
                                      <span
                                        className={`block h-full ${
                                          belowThreshold
                                            ? "bg-slate-500"
                                            : "bg-bridge-accent"
                                        }`}
                                        style={{
                                          width: `${Math.round(item.confidence * 100)}%`,
                                        }}
                                      />
                                    </span>
                                    {item.confidence.toFixed(2)}
                                  </span>
                                )}
                              </div>

                              {/* 2줄 — 지금 어디에 있고 누가 물고 있는지 */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {badge && (
                                  <span
                                    className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}
                                  >
                                    {badge.label}
                                  </span>
                                )}
                                <AssigneeChips assignees={item.assignees} />
                                <span className="text-xs text-slate-500">
                                  {CATEGORY_LABEL[item.category] ??
                                    item.category}
                                </span>
                                {/* 이미 담긴/처리된 이슈는 다시 담기지 않는다(이슈당 1회) */}
                                {held && (
                                  <span className={chipCls(held.status)}>
                                    {STATUS_STYLE[held.status].label}
                                  </span>
                                )}
                                {!held && belowThreshold && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                    {t(
                                      "autofixDock.belowThreshold",
                                      "임계값 미만",
                                    )}
                                  </span>
                                )}
                                {/* 판정 이후 태스크가 바뀌었다 — 이동일 수도, 내용 수정일 수도 있다 */}
                                {item.stale_triage && (
                                  <span className="text-xs text-slate-500">
                                    {t(
                                      "autofixDock.staleTriage",
                                      "판정 후 변경됨",
                                    )}
                                  </span>
                                )}
                                {(item.verification || item.reason) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleReason(item.jira_issue_key);
                                    }}
                                    onKeyDown={(e) => e.stopPropagation()}
                                    aria-expanded={reasonOpen}
                                    className="ml-auto text-xs text-slate-500 hover:text-bridge-accent transition-colors"
                                  >
                                    {reasonOpen
                                      ? t("autofixDock.hideReason", "근거 접기")
                                      : t("autofixDock.showReason", "근거")}
                                  </button>
                                )}
                              </div>

                              {reasonOpen && (
                                <div className="mt-1 px-2 py-1.5 rounded-lg bg-foreground/[0.04] space-y-0.5">
                                  {item.verification && (
                                    <div className="text-xs text-slate-400 leading-relaxed">
                                      {item.verification}
                                    </div>
                                  )}
                                  {item.reason && (
                                    <div className="text-xs text-slate-500 leading-relaxed">
                                      {item.reason}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      },
                    )
                  )}

                  {verdict === "CANDIDATE" && selectableCount > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        onClick={() => handleEnqueue(enqueueTargets)}
                        disabled={
                          enqueueTargets.length === 0 ||
                          !setupDone ||
                          busy === "enqueue"
                        }
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
                      >
                        {busy === "enqueue" && (
                          <Loader2 size={12} className="animate-spin" />
                        )}
                        {t("autofixDock.enqueueSelected", "선택")}{" "}
                        {enqueueTargets.length}
                        {t("autofixDock.countUnit", "건")}{" "}
                        {t("autofixDock.enqueue", "담기")}
                      </button>
                      {/*
                        필터가 걸린 목록에서 "전부"는 반드시 '보이는 것 전부'여야 한다.
                        걸러 놓고 눌렀는데 화면 밖의 건까지 담기면, 되돌릴 수 없는 방향으로 배신당한다
                        (이슈당 1회라 잘못 담긴 건은 취소해도 후보로 돌아오지 않는다).
                      */}
                      <button
                        onClick={() => handleEnqueue(visibleSelectableKeys)}
                        disabled={
                          !setupDone ||
                          busy === "enqueue" ||
                          visibleSelectableKeys.length === 0
                        }
                        className="px-2.5 py-1.5 text-xs text-slate-400 bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
                      >
                        {t("autofixDock.enqueueVisible", "보이는 것 전부")}{" "}
                        <span className="tabular-nums">
                          {visibleSelectableKeys.length}
                        </span>
                      </button>
                      {/* 버튼이 왜 안 눌리는지 화면이 말해줘야 한다 — 눌러도 아무 일이 없으면 고장으로 읽힌다 */}
                      {!setupDone ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {t(
                            "autofixDock.setupBlocksEnqueue",
                            "셋업을 마쳐야 담을 수 있습니다",
                          )}
                        </span>
                      ) : (
                        enqueueTargets.length === 0 && (
                          <span className="text-xs text-slate-500">
                            {t(
                              "autofixDock.selectHint",
                              "항목을 눌러 고르거나, 보이는 것 전부를 누르세요",
                            )}
                          </span>
                        )
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-foreground/[0.08] overflow-hidden">
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-foreground/[0.04] border-b border-foreground/[0.08]">
                  <span className="text-xs font-bold text-foreground">
                    {t("autofixDock.queue", "큐")}
                  </span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums">
                    {t("autofixDock.inFlight", "진행")} {status.in_flight} ·{" "}
                    {t("autofixDock.waiting", "대기")} {waiting.length}
                  </span>
                </div>

                {/*
                  세 갈래로 나눈다. 다 끝난 PR이 쌓이면 지금 돌고 있는 한 건을 화면 밖으로 밀어내는데,
                  이 pane에서 제일 급한 정보는 언제나 "지금 무엇이 돌고 있고 언제부터인가"다.
                */}
                {jobs.length > 0 && (
                  <div className="flex items-center gap-1 px-2.5 pt-2 flex-wrap">
                    {QUEUE_GROUPS.map((g) => {
                      const count =
                        g.value === "live"
                          ? (active ? 1 : 0) + waiting.length
                          : g.value === "pr"
                            ? succeeded.length
                            : settled.length;
                      if (count === 0) return null;
                      return (
                        <FilterChip
                          key={g.value}
                          on={queueGroups.has(g.value)}
                          count={count}
                          label={t(g.i18nKey, g.label)}
                          onClick={() =>
                            setQueueGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.value)) next.delete(g.value);
                              else next.add(g.value);
                              return next;
                            })
                          }
                        />
                      );
                    })}
                    {/* 접혀 있어도 사람이 봐야 할 것이 있다는 사실은 새어 나와야 한다 */}
                    {needsAttention && !queueGroups.has("settled") && (
                      <span className="ml-auto text-xs font-bold text-amber-600 dark:text-amber-400">
                        {t("autofixDock.attention", "확인 필요")}
                      </span>
                    )}
                  </div>
                )}

                <div className="p-2 space-y-1">
                  {jobs.length === 0 && (
                    <div className="text-xs text-slate-500 px-0.5 py-2 leading-relaxed">
                      {t(
                        "autofixDock.emptyQueue",
                        "담긴 작업이 없습니다. 후보를 담으면 한 건씩 순서대로 실행됩니다.",
                      )}
                    </div>
                  )}

                  {/* 다 접어 놓고 빈 화면을 보면 큐가 비었다고 읽는다 */}
                  {jobs.length > 0 && queueGroups.size === 0 && (
                    <div className="text-xs text-slate-500 px-0.5 py-2 leading-relaxed">
                      {t(
                        "autofixDock.allGroupsCollapsed",
                        "묶음을 모두 접었습니다. 위 칩을 눌러 펼치세요.",
                      )}
                    </div>
                  )}

                  {showLive && active && (
                    <div className="px-2 py-1.5 rounded-lg border border-bridge-accent/40 bg-bridge-accent/[0.07] space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        {active.job_kind === "MANUAL" && <ManualBadge />}
                        <IssueKey
                          issueKey={active.job_key}
                          taskId={active.task_id}
                          onOpenTask={onOpenTask}
                        />
                        {active.title && (
                          <span className="text-xs text-foreground truncate">
                            {active.title}
                          </span>
                        )}
                        <span className={chipCls(active.status)}>
                          {STATUS_STYLE[active.status].label}
                        </span>
                        {elapsed !== null && (
                          <span className="ml-auto text-xs text-slate-500 tabular-nums">
                            {elapsed}분
                          </span>
                        )}
                      </div>
                      {/*
                        항목 제목만으로는 어느 카드 일인지 알 수 없다.
                        같은 태스크에서 나온 항목들은 이 줄을 공유해 큐에서 한 덩어리로 읽힌다.
                      */}
                      {(active.parent_task_title ||
                        active.runner_name ||
                        active.created_by_name) && (
                        <div className="text-xs text-slate-500 truncate">
                          {[
                            active.parent_task_title,
                            active.runner_name,
                            active.created_by_name
                              ? `위임 ${active.created_by_name}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      {/* 지시문은 진행 중인 행에서만 펼친다 — 대기 행까지 펼치면 큐가 문단 더미가 된다 */}
                      {active.instruction && (
                        <div className="text-xs text-slate-400 leading-relaxed bg-foreground/[0.03] rounded-lg px-2 py-1.5 border-l-2 border-bridge-accent/40">
                          {active.instruction}
                        </div>
                      )}
                      {/* 한 건이 오래 물고 있으면 뒤의 대기 건이 전부 멈춘다 — 러너를 확인하거나 회수해야 한다 */}
                      {elapsed !== null && elapsed >= STALE_HINT_MINUTES && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                          {t(
                            "autofixDock.longRunningHint",
                            "러너가 오래 회신하지 않고 있습니다. 이 건이 끝나야 대기 건이 나갑니다.",
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            armedRelease === active.id
                              ? handleRelease(active.id)
                              : setArmedRelease(active.id)
                          }
                          disabled={busy === `release:${active.id}`}
                          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-500 transition-colors disabled:opacity-50"
                        >
                          {busy === `release:${active.id}` && (
                            <Loader2 size={11} className="animate-spin" />
                          )}
                          {armedRelease === active.id
                            ? t(
                                "autofixDock.releaseConfirm",
                                "정말 회수할까요?",
                              )
                            : t("autofixDock.release", "강제 회수")}
                        </button>
                        {armedRelease === active.id && (
                          <button
                            onClick={() => setArmedRelease(null)}
                            className="text-xs text-slate-500 hover:text-foreground transition-colors"
                          >
                            {t("autofixDock.cancelAction", "취소")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 대기 건이 왜 그대로인지 설명 — 직렬 실행이라 앞 건이 끝나야 나간다 */}
                  {showLive && active && waiting.length > 0 && (
                    <div className="text-xs text-slate-500 px-0.5 leading-relaxed">
                      {t(
                        "autofixDock.serialHint",
                        "한 번에 한 건씩 실행합니다. 진행 중인 작업이 끝나야 아래 대기 건이 나갑니다.",
                      )}
                    </div>
                  )}

                  {(showLive ? waiting : []).map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-foreground/[0.08]"
                    >
                      {job.job_kind === "MANUAL" && <ManualBadge />}
                      <IssueKey
                        issueKey={job.job_key}
                        taskId={job.task_id}
                        onOpenTask={onOpenTask}
                      />
                      {job.title && (
                        <span
                          className="text-xs text-foreground truncate"
                          title={job.parent_task_title ?? undefined}
                        >
                          {job.title}
                        </span>
                      )}
                      <span className={chipCls(job.status)}>
                        {STATUS_STYLE[job.status].label}
                      </span>
                      {job.confidence != null && (
                        <span className="ml-auto text-xs text-slate-500 tabular-nums">
                          {job.confidence.toFixed(2)}
                        </span>
                      )}
                      <button
                        onClick={() => handleCancel(job.id)}
                        disabled={busy === `cancel:${job.id}`}
                        aria-label={`${job.job_key} 취소`}
                        className="text-slate-500 hover:text-rose-500 transition-colors disabled:opacity-50"
                      >
                        {busy === `cancel:${job.id}` ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <X size={12} />
                        )}
                      </button>
                    </div>
                  ))}

                  {(queueGroups.has("pr") ? succeeded : []).map((job) => (
                    <div
                      key={job.id}
                      className="px-2 py-1.5 rounded-lg border border-foreground/[0.08] space-y-0.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <IssueKey
                          issueKey={job.job_key}
                          taskId={job.task_id}
                          onOpenTask={onOpenTask}
                        />
                        <span className={chipCls(job.status)}>
                          {STATUS_STYLE[job.status].label}
                        </span>
                        {/*
                          대체된 시도는 같은 키의 새 행과 나란히 보인다. 표시가 없으면 리뷰어가
                          어느 PR이 최신 시도의 것인지 알 수 없다.
                        */}
                        {job.superseded && (
                          <span className="text-xs text-slate-500">
                            {t("autofixDock.superseded", "다시 담김")}
                          </span>
                        )}
                        {!job.superseded && (
                          <RequeueButton
                            /* PR이 열려 있는 건이라 두 번 눌러야 나간다 */
                            needsConfirm
                            armed={armedRequeue === job.id}
                            busy={busy === `requeue:${job.id}`}
                            onArm={() => setArmedRequeue(job.id)}
                            onDisarm={() => setArmedRequeue(null)}
                            onRequeue={() => handleRequeue(job.id)}
                            t={t}
                          />
                        )}
                      </div>
                      {job.pr_url && (
                        <a
                          href={job.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-bridge-accent hover:underline break-all"
                        >
                          {job.pr_url.replace(/^https:\/\/github\.com\//, "")}
                          <ExternalLink size={10} className="shrink-0" />
                        </a>
                      )}
                      <div className="text-xs text-slate-600 leading-relaxed">
                        {armedRequeue === job.id
                          ? t(
                              "autofixDock.requeueWarning",
                              "이전 PR은 자동으로 닫히지 않습니다. 먼저 닫은 뒤 다시 돌리세요.",
                            )
                          : t(
                              "autofixDock.reviewWarning",
                              "컴파일 통과까지만 검증됨 · 리뷰 필요",
                            )}
                      </div>
                    </div>
                  ))}

                  {queueGroups.has("settled") && settled.length > 0 && (
                    <div className="rounded-lg border border-foreground/[0.08] overflow-hidden">
                      {settled.map((job) => (
                        <div
                          key={job.id}
                          className="px-2 py-1.5 border-t border-foreground/[0.06] first:border-t-0 space-y-0.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <IssueKey
                              issueKey={job.job_key}
                              taskId={job.task_id}
                              onOpenTask={onOpenTask}
                            />
                            <span className={chipCls(job.status)}>
                              {STATUS_STYLE[job.status].label}
                            </span>
                            {job.superseded && (
                              <span className="ml-auto text-xs text-slate-500">
                                {t("autofixDock.superseded", "다시 담김")}
                              </span>
                            )}
                            {/*
                              끝난 건은 결과가 무엇이든 사람이 한 번 더 돌릴 수 있다. 여기서는
                              PR이 열려 있지 않아(변경 없음·실패) 한 번에 나간다.
                            */}
                            {!job.superseded && (
                              <span className="ml-auto">
                                <RequeueButton
                                  armed={false}
                                  busy={busy === `requeue:${job.id}`}
                                  onRequeue={() => handleRequeue(job.id)}
                                  t={t}
                                />
                              </span>
                            )}
                            {/*
                              비우기는 다시 담기와 목적이 다르다 — 후보 목록으로 되돌려
                              트리아지를 다시 보고 담고 싶을 때의 길이라 실패 계열에만 남긴다.
                            */}
                            {(job.status === "FAILED" ||
                              job.status === "TIMED_OUT") && (
                              <button
                                onClick={() => handleDiscard(job.id)}
                                disabled={busy === `discard:${job.id}`}
                                className="text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 px-1.5 py-0.5 rounded-lg transition-colors disabled:opacity-50"
                                title={t(
                                  "autofixDock.discardHint",
                                  "이 작업을 비워 같은 대상을 다시 담을 수 있게 합니다",
                                )}
                              >
                                {busy === `discard:${job.id}` ? (
                                  <Loader2
                                    size={12}
                                    className="animate-spin text-bridge-accent"
                                  />
                                ) : (
                                  t("autofixDock.discard", "다시 담기 허용")
                                )}
                              </button>
                            )}
                          </div>
                          {job.status === "TIMED_OUT" ? (
                            <div className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                              {t(
                                "autofixDock.timedOutHint",
                                "러너가 회신하지 않았습니다. 맥 상태를 확인하세요",
                              )}
                            </div>
                          ) : (
                            job.failure_reason && (
                              <div className="text-xs text-slate-500 leading-relaxed">
                                {job.failure_reason}
                              </div>
                            )
                          )}
                          {/* Actions 실행 로그 링크가 없으므로, 원인을 볼 수 있는 곳은 여기뿐이다 */}
                          {job.log_excerpt && (
                            <details className="text-xs text-slate-500">
                              <summary className="cursor-pointer hover:text-foreground transition-colors">
                                {t("autofixDock.agentLog", "에이전트 로그")}
                              </summary>
                              <pre className="mt-1 p-2 rounded-lg bg-foreground/[0.04] overflow-x-auto custom-scrollbar text-xs text-slate-400 whitespace-pre-wrap break-all max-h-48">
                                {job.log_excerpt}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 끝난 작업을 같은 대상으로 다시 담는 버튼.
 *
 * <p>PR까지 간 건({@code needsConfirm})은 두 번 눌러야 나간다. 서버는 이전 PR을 닫지 않으므로
 * 한 번에 나가면 같은 대상에 열린 PR이 둘이 되고, 그때부터 리뷰어는 어느 쪽이 최신 시도인지
 * 모른다. 변경 없음·실패로 끝난 건은 닫을 PR이 없어 한 번에 나간다 — 잘못 눌러도 큐에 한 건이
 * 더 들어갈 뿐이고, 그건 취소 버튼으로 바로 되돌릴 수 있다.
 */
function RequeueButton({
  needsConfirm = false,
  armed,
  busy,
  onArm,
  onDisarm,
  onRequeue,
  t,
}: {
  needsConfirm?: boolean;
  armed: boolean;
  busy: boolean;
  /** needsConfirm일 때만 쓴다 — 확인이 없는 자리에서는 첫 클릭이 곧 실행이다. */
  onArm?: () => void;
  onDisarm?: () => void;
  onRequeue: () => void;
  t: (key: string, fallback: string) => string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => (!needsConfirm || armed ? onRequeue() : onArm?.())}
        disabled={busy}
        title={t(
          "autofixDock.requeueHint",
          "같은 대상을 큐에 다시 담습니다. 이전 결과는 이력으로 남습니다",
        )}
        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-foreground
          hover:bg-foreground/5 px-1.5 py-0.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {busy && (
          <Loader2 size={11} className="animate-spin text-bridge-accent" />
        )}
        {armed
          ? t("autofixDock.requeueConfirm", "정말 다시 돌릴까요?")
          : t("autofixDock.requeue", "다시 돌리기")}
      </button>
      {armed && onDisarm && (
        <button
          type="button"
          onClick={onDisarm}
          className="text-xs text-slate-500 hover:text-foreground transition-colors"
        >
          {t("autofixDock.cancelAction", "취소")}
        </button>
      )}
    </span>
  );
}

/**
 * 이슈 키 = 원본 태스크로 가는 문. 도크가 보여주는 건 판정 근거 한 줄이 전부라, 왜 이게
 * 후보인지 / 왜 실패했는지 판단하려면 결국 원본 카드를 봐야 한다 — 보드에서 눈으로 찾게 두지 않는다.
 *
 * <p>점선 밑줄로 상시 표시한다. 호버해야 눌린다는 걸 알 수 있으면 아무도 누르지 않는다.
 *
 * <p>트리아지 행은 행 전체가 선택 토글이므로 클릭/키다운을 반드시 여기서 멈춘다 —
 * 카드를 열려고 눌렀는데 선택까지 바뀌면 담기 대상이 조용히 어긋난다.
 */
function IssueKey({
  issueKey,
  taskId,
  onOpenTask,
}: {
  issueKey: string;
  taskId?: string | null;
  onOpenTask?: (taskId: string) => void;
}) {
  if (!taskId || !onOpenTask) {
    return (
      <span className="text-xs font-bold text-bridge-accent">{issueKey}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenTask(taskId);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      title={`${issueKey} 태스크 열기`}
      className="text-xs font-bold text-bridge-accent underline decoration-dotted
        decoration-bridge-accent/40 underline-offset-2 rounded
        hover:decoration-solid focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
    >
      {issueKey}
    </button>
  );
}

/** 필터 한 줄. 라벨 폭을 고정해 축들이 세로로 정렬된다 — 들쭉날쭉하면 훑어지지 않는다. */
function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="w-9 shrink-0 text-xs text-slate-500">{label}</span>
      {children}
    </div>
  );
}

/**
 * 필터 칩. 두 가지 방식이 섞여 있어 표현을 나눈다 —
 * 담당자·유형은 <b>고른 것만 보기</b>(켜면 강조), 위치는 <b>끈 것을 감추기</b>(끄면 취소선)다.
 * 같은 모양으로 그리면 위치 칩이 전부 꺼져 있는 것처럼 읽힌다.
 */
function FilterChip({
  on,
  label,
  count,
  swatch,
  strikeWhenOff,
  onClick,
}: {
  on: boolean;
  label: string;
  count?: number;
  swatch?: string;
  strikeWhenOff?: boolean;
  onClick: () => void;
}) {
  const base =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors " +
    "focus:outline-none focus:ring-2 focus:ring-bridge-accent/50";
  const tone = on
    ? strikeWhenOff
      ? "text-slate-400 bg-foreground/[0.06] hover:bg-foreground/10"
      : "bg-bridge-accent/15 text-bridge-accent font-bold"
    : strikeWhenOff
      ? "text-slate-500 bg-foreground/[0.03] line-through"
      : "text-slate-400 bg-foreground/[0.06] hover:bg-foreground/10";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`${base} ${tone}`}
    >
      {swatch && (
        <span
          aria-hidden
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: swatch }}
        />
      )}
      {label}
      {count != null && (
        <span className="tabular-nums opacity-70 font-normal">{count}</span>
      )}
    </button>
  );
}

/**
 * 체크리스트 담당자. 자동수정이 건드릴 코드를 지금 누가 만지고 있는지 알아야
 * "이건 내가 하고 있는 건데"를 판단할 수 있다.
 *
 * <p>미배정을 빈칸으로 두지 않는다 — 담당자 열이 비면 데이터가 없는 건지 아무도 안 맡은 건지
 * 구분되지 않는다.
 *
 * <p>아바타는 두 명까지. 셋 이상이면 첫 두 명 + 남은 수로 줄인다.
 */
function AssigneeChips({ assignees }: { assignees: JiraAutofixAssignee[] }) {
  const { t } = useTranslation();

  if (!assignees || assignees.length === 0) {
    return (
      <span className="text-xs text-amber-600 dark:text-amber-400">
        {t("autofixDock.noAssignee", "담당자 없음")}
      </span>
    );
  }

  const shown = assignees.slice(0, 2);
  const rest = assignees.length - shown.length;
  const label =
    rest > 0
      ? `${assignees[0].name} 외 ${assignees.length - 1}`
      : assignees.map((a) => a.name).join(", ");

  return (
    <span
      className="flex items-center gap-1 text-xs text-slate-400"
      title={assignees.map((a) => a.name).join(", ")}
    >
      {shown.map((a) => (
        <span
          key={`${a.external ? "c" : "u"}:${a.id}`}
          aria-hidden
          className="w-[18px] h-[18px] shrink-0 rounded-full grid place-items-center
            text-xs font-bold leading-none text-white"
          style={{ backgroundColor: getAssigneeHex(a.name, a.color) }}
        >
          {getInitials(a.name).slice(0, 1)}
        </span>
      ))}
      <span className="truncate max-w-[7rem]">{label}</span>
    </span>
  );
}

function SetupRow({
  done,
  label,
  action,
}: {
  done: boolean;
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-1.5">
      {done ? (
        <Check
          size={12}
          className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400"
        />
      ) : (
        <X size={12} className="shrink-0 mt-0.5 text-rose-500" />
      )}
      <span className="text-xs text-slate-400 leading-relaxed flex-1">
        {label}
      </span>
      {action}
    </div>
  );
}
