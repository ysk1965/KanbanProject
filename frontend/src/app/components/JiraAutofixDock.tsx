import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  AlertCircle,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  PauseCircle,
  PowerOff,
  Settings2,
  Sparkles,
} from "lucide-react";
import {
  jiraAutofixAPI,
  JiraAutofixQueueStatus,
  JiraAutofixJob,
  JiraAutofixJobStatus,
  JiraAutofixItem,
  JiraAutofixVerdict,
  JiraAutofixCategory,
  JiraAutofixTestInfra,
  JiraAutofixRunnerStatus,
} from "../utils/api";
import { parseUTCDate, formatRelativeTime } from "../utils/dateUtils";

interface JiraAutofixDockProps {
  boardId: string;
  /** JIRA 연동 보드에서만 렌더한다. 쓸 수 없는 기능이 화면 하단을 차지하지 않게. */
  enabled: boolean;
}

const POLL_INTERVAL_MS = 10_000;
/**
 * 이 시간을 넘게 물고 있으면 러너를 의심해야 한다. 서버의 자동 회수(90분)보다 훨씬 짧게 잡는다 —
 * 막힌 큐를 90분 동안 아무 설명 없이 두면 화면이 고장난 것처럼 보인다.
 */
const STALE_HINT_MINUTES = 30;
/** 펼침 높이. 드래그 리사이즈는 넣지 않는다 — 담을 내용이 그만큼 가변적이지 않다. */
const DOCK_HEIGHT = "min(40vh, 420px)";

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
): { text: string; blocking: boolean }[] {
  if (!s) return [];
  const out: { text: string; blocking: boolean }[] = [];

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
 * 자동수정 하단 도크 — 접으면 한 줄, 펼치면 화면 하단 40%.
 *
 * <p>보드를 보면서 조작하는 것이 이 배치의 목적이다. 후보를 담을 때 원본 QASA 카드가
 * 바로 위에 깔려 있어 눈으로 확인하면서 고를 수 있다.
 *
 * <p>z-30을 쓴다 — 뷰 전환 버튼과 모바일 내비(z-40)가 계속 위에 떠야 한다.
 */
export function JiraAutofixDock({ boardId, enabled }: JiraAutofixDockProps) {
  const { t } = useTranslation();

  const [status, setStatus] = useState<JiraAutofixQueueStatus | null>(null);
  const [jobs, setJobs] = useState<JiraAutofixJob[]>([]);
  const [items, setItems] = useState<JiraAutofixItem[]>([]);
  const [verdict, setVerdict] = useState<JiraAutofixVerdict>("CANDIDATE");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  /** 강제 회수는 두 번 눌러야 나간다 — 실제로 돌고 있는 러너를 실수로 놓칠 수 있다. */
  const [armedRelease, setArmedRelease] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testInfra, setTestInfra] = useState<JiraAutofixTestInfra>("NONE");

  const timerRef = useRef<number | null>(null);

  // 펼침 여부는 보드별로 기억한다 — 운영 중인 사람은 계속 열어둔다
  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(storageKey(boardId)) === "1");
    } catch {
      setExpanded(false);
    }
  }, [boardId]);

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

  useEffect(() => {
    if (expanded) loadItems(verdict);
  }, [expanded, verdict, loadItems]);

  // 접혀 있어도 폴링한다 — 바에 뜨는 경과 시간이 멈춰 있으면 안 된다.
  // 대기 건만 있을 때도 돌려야 한다 — 스케줄러가 집어가는 순간(대기 → 진행)이 화면에 나타나야 한다.
  useEffect(() => {
    if (!enabled || (!status?.in_flight && !status?.queued)) return;
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    timerRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [enabled, status?.in_flight, status?.queued, load]);

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

  const handleTriage = () =>
    run("triage", async () => {
      const result = await jiraAutofixAPI.runTriage(boardId, false);
      setNotice(
        result.triaged > 0
          ? `${result.triaged}건 판정 · ${result.skipped}건 변경 없음`
          : `변경된 이슈가 없어 ${result.skipped}건 모두 건너뜀`,
      );
      await Promise.all([load(), loadItems(verdict)]);
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

  const problems = runnerProblems(status.runner_status, status.in_flight);

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
    if (!latestJobByIssue.has(job.jira_issue_key)) {
      latestJobByIssue.set(job.jira_issue_key, job);
    }
  }

  /**
   * 서버가 조용히 걸러낼 항목을 화면에서 미리 가른다 — 골라서 담았는데 "0건 담김"만 돌아오면
   * 무엇이 잘못됐는지 알 수 없다. 기준은 서버 가드레일과 같다(취소된 건만 다시 담을 수 있고,
   * 임계값 미만은 담기지 않는다).
   */
  const decorated = items.map((item) => {
    const latest = latestJobByIssue.get(item.jira_issue_key) ?? null;
    const held = latest && latest.status !== "CANCELLED" ? latest : null;
    const belowThreshold =
      item.confidence != null && item.confidence < status.min_confidence;
    return {
      item,
      held,
      belowThreshold,
      canSelect: item.verdict === "CANDIDATE" && !held && !belowThreshold,
    };
  });
  const selectableCount = decorated.filter((d) => d.canSelect).length;

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
              {active.jira_issue_key}
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
                disabled={busy === "triage"}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
              >
                {busy === "triage" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                {t("autofixDock.triage", "판정")}
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
                      ? `선택 ${selected.size} · 담을 수 있음 ${selectableCount} / ${items.length}건`
                      : `${items.length}건`}
                  </span>
                </div>

                <div className="flex gap-1 px-2.5 pt-2">
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
                </div>

                <div className="p-2 space-y-1">
                  {items.length === 0 ? (
                    <div className="text-xs text-slate-500 px-0.5 py-2 leading-relaxed">
                      {t(
                        "autofixDock.noItems",
                        "판정 결과가 없습니다. 판정을 눌러 이슈를 분류하세요.",
                      )}
                    </div>
                  ) : (
                    decorated.map(
                      ({ item, held, belowThreshold, canSelect }) => {
                        const on = selected.has(item.jira_issue_key);
                        const toggle = () => toggleSelect(item.jira_issue_key);
                        return (
                          // 행 어디를 눌러도 선택된다 — 체크박스만 눌리면 골랐다고 생각하고
                          // 담기를 눌렀는데 아무 일도 일어나지 않는다
                          <div
                            key={item.jira_issue_key}
                            {...(canSelect
                              ? {
                                  role: "checkbox" as const,
                                  "aria-checked": on,
                                  "aria-label": `${item.jira_issue_key} 선택`,
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
                                : held
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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-bridge-accent">
                                  {item.jira_issue_key}
                                </span>
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-foreground/10 text-slate-400">
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
                                {item.confidence != null && (
                                  <span className="ml-auto text-xs text-slate-500 tabular-nums">
                                    {item.confidence.toFixed(2)}
                                  </span>
                                )}
                              </div>
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
                          </div>
                        );
                      },
                    )
                  )}

                  {verdict === "CANDIDATE" && selectableCount > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        onClick={() => handleEnqueue([...selected])}
                        disabled={
                          selected.size === 0 ||
                          !setupDone ||
                          busy === "enqueue"
                        }
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
                      >
                        {busy === "enqueue" && (
                          <Loader2 size={12} className="animate-spin" />
                        )}
                        {t("autofixDock.enqueueSelected", "선택")}{" "}
                        {selected.size}
                        {t("autofixDock.countUnit", "건")}{" "}
                        {t("autofixDock.enqueue", "담기")}
                      </button>
                      <button
                        onClick={() => handleEnqueue()}
                        disabled={!setupDone || busy === "enqueue"}
                        className="px-2.5 py-1.5 text-xs text-slate-400 bg-foreground/5 border border-foreground/10 rounded-lg hover:bg-foreground/10 transition-all disabled:opacity-50"
                      >
                        {t("autofixDock.enqueueAll", "조건 만족 전부")}
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
                        selected.size === 0 && (
                          <span className="text-xs text-slate-500">
                            {t(
                              "autofixDock.selectHint",
                              "항목을 눌러 고르거나, 조건 만족 전부를 누르세요",
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

                <div className="p-2 space-y-1">
                  {jobs.length === 0 && (
                    <div className="text-xs text-slate-500 px-0.5 py-2 leading-relaxed">
                      {t(
                        "autofixDock.emptyQueue",
                        "담긴 작업이 없습니다. 후보를 담으면 한 건씩 순서대로 실행됩니다.",
                      )}
                    </div>
                  )}

                  {active && (
                    <div className="px-2 py-1.5 rounded-lg border border-bridge-accent/40 bg-bridge-accent/[0.07] space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-bridge-accent">
                          {active.jira_issue_key}
                        </span>
                        <span className={chipCls(active.status)}>
                          {STATUS_STYLE[active.status].label}
                        </span>
                        {elapsed !== null && (
                          <span className="ml-auto text-xs text-slate-500 tabular-nums">
                            {elapsed}분
                          </span>
                        )}
                      </div>
                      {active.runner_name && (
                        <div className="text-xs text-slate-500">
                          {t("autofixDock.runningOn", "실행 중")} ·{" "}
                          {active.runner_name}
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
                  {active && waiting.length > 0 && (
                    <div className="text-xs text-slate-500 px-0.5 leading-relaxed">
                      {t(
                        "autofixDock.serialHint",
                        "한 번에 한 건씩 실행합니다. 진행 중인 작업이 끝나야 아래 대기 건이 나갑니다.",
                      )}
                    </div>
                  )}

                  {waiting.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-foreground/[0.08]"
                    >
                      <span className="text-xs font-bold text-bridge-accent">
                        {job.jira_issue_key}
                      </span>
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
                        aria-label={`${job.jira_issue_key} 취소`}
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

                  {succeeded.map((job) => (
                    <div
                      key={job.id}
                      className="px-2 py-1.5 rounded-lg border border-foreground/[0.08] space-y-0.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-bridge-accent">
                          {job.jira_issue_key}
                        </span>
                        <span className={chipCls(job.status)}>
                          {STATUS_STYLE[job.status].label}
                        </span>
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
                        {t(
                          "autofixDock.reviewWarning",
                          "컴파일 통과까지만 검증됨 · 리뷰 필요",
                        )}
                      </div>
                    </div>
                  ))}

                  {settled.length > 0 && (
                    <div className="rounded-lg border border-foreground/[0.08] overflow-hidden">
                      <button
                        onClick={() => setShowSettled(!showSettled)}
                        aria-expanded={showSettled}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-400 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors"
                      >
                        {showSettled ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )}
                        {t("autofixDock.settled", "그 외")} · {settled.length}
                        {t("autofixDock.countUnit", "건")}
                        {needsAttention && (
                          <span className="ml-auto font-bold text-amber-600 dark:text-amber-400">
                            {t("autofixDock.attention", "확인 필요")}
                          </span>
                        )}
                      </button>
                      {showSettled &&
                        settled.map((job) => (
                          <div
                            key={job.id}
                            className="px-2 py-1.5 border-t border-foreground/[0.06] space-y-0.5"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-bridge-accent">
                                {job.jira_issue_key}
                              </span>
                              <span className={chipCls(job.status)}>
                                {STATUS_STYLE[job.status].label}
                              </span>
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
