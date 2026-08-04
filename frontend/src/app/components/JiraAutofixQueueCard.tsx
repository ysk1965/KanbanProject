import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  AlertCircle,
  Check,
  X,
  PauseCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Play,
} from "lucide-react";
import {
  jiraAutofixAPI,
  JiraAutofixQueueStatus,
  JiraAutofixJob,
  JiraAutofixJobStatus,
} from "../utils/api";

interface JiraAutofixQueueCardProps {
  boardId: string;
}

/** 진행 중 작업이 있을 때만 폴링한다 — 하루 20건짜리 기능이 상시 트래픽을 만들 이유가 없다. */
const POLL_INTERVAL_MS = 10_000;

/**
 * 상태 표시 규칙.
 *
 * NO_CHANGE는 실패색을 쓰지 않는다 — 테스트가 없는 저장소에서는 이게 다수가 되는데,
 * 빨간 목록은 파이프라인이 고장난 것처럼 보인다. 실제로는 에이전트가 옳게 판단한 결과다.
 * 반대로 TIMED_OUT은 경고색이다 — 사람이 러너를 보러 가야 하는 유일한 상태다.
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

const chipCls = (status: JiraAutofixJobStatus) =>
  `text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[status].chip}`;

/** 경과 시간을 "N분"으로. 러너가 멈춘 건지 도는 건지 판단하는 유일한 단서다. */
const minutesSince = (iso: string | null): number | null => {
  if (!iso) return null;
  const started = new Date(iso).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.floor((Date.now() - started) / 60_000));
};

export function JiraAutofixQueueCard({ boardId }: JiraAutofixQueueCardProps) {
  const { t } = useTranslation();

  const [status, setStatus] = useState<JiraAutofixQueueStatus | null>(null);
  const [jobs, setJobs] = useState<JiraAutofixJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnqueuing, setIsEnqueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [queueStatus, jobList] = await Promise.all([
        jiraAutofixAPI.getQueueStatus(boardId),
        jiraAutofixAPI.getJobs(boardId, 50),
      ]);
      setStatus(queueStatus);
      setJobs(jobList);
    } catch {
      // JIRA 미연동 보드에서는 조회가 실패하는 게 정상이라 에러로 띄우지 않는다
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  // 진행 중 작업이 있을 때만 폴링. 탭이 백그라운드면 멈춘다.
  useEffect(() => {
    const inFlight = status?.in_flight ?? 0;
    if (inFlight === 0) return;

    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    timerRef.current = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [status?.in_flight, load]);

  const handleEnqueue = async () => {
    setIsEnqueuing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await jiraAutofixAPI.enqueue(boardId);
      const parts = [`${result.queued}건 담김`];
      if (result.skipped_low_confidence > 0) {
        parts.push(`확신도 미달 ${result.skipped_low_confidence}건 제외`);
      }
      if (result.skipped_already_queued > 0) {
        parts.push(`이미 처리한 이슈 ${result.skipped_already_queued}건 제외`);
      }
      setNotice(parts.join(" · "));
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("jiraAutofixQueue.enqueueFailed", "큐 투입에 실패했습니다"),
      );
    } finally {
      setIsEnqueuing(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    setCancellingId(jobId);
    setError(null);
    try {
      await jiraAutofixAPI.cancelJob(boardId, jobId);
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("jiraAutofixQueue.cancelFailed", "취소에 실패했습니다"),
      );
    } finally {
      setCancellingId(null);
    }
  };

  const handleIssueToken = async () => {
    setError(null);
    try {
      const result = await jiraAutofixAPI.issueCallbackToken(boardId);
      await navigator.clipboard?.writeText(result.callback_token);
      setNotice(
        t(
          "jiraAutofixQueue.tokenIssued",
          "콜백 토큰을 복사했습니다. 저장소 시크릿 BRIDGE_CALLBACK_TOKEN에 넣어주세요.",
        ),
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("jiraAutofixQueue.tokenFailed", "토큰 발급에 실패했습니다"),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="border-t border-foreground/[0.08] pt-3 flex justify-center py-4">
        <Loader2 size={16} className="animate-spin text-bridge-accent" />
      </div>
    );
  }

  if (!status) return null;

  const setupDone =
    !!status.repo_full_name &&
    !status.repo_ambiguous &&
    status.workflow_ready === true &&
    status.callback_token_set;

  const active = jobs.filter((j) => j.status === "DISPATCHED");
  const waiting = jobs.filter((j) => j.status === "QUEUED");
  // 이 화면에서 사람이 할 일은 리뷰뿐이라 PR 생성 건만 펼치고 나머지는 접는다
  const succeeded = jobs.filter((j) => j.status === "SUCCEEDED");
  const settled = jobs.filter(
    (j) =>
      j.status === "NO_CHANGE" ||
      j.status === "FAILED" ||
      j.status === "TIMED_OUT",
  );
  const needsAttention = settled.some((j) => j.status === "TIMED_OUT");

  return (
    <div className="border-t border-foreground/[0.08] pt-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs text-foreground font-medium mb-1">
            {t("jiraAutofixQueue.title", "자동수정 큐")}
          </div>
          <div className="text-xs text-slate-500 leading-relaxed">
            {status.in_flight > 0 || waiting.length > 0
              ? `진행 중 ${status.in_flight} · 대기 ${waiting.length}`
              : `후보 ${status.total_candidates}건 중 ${status.eligible_candidates}건이 조건을 만족합니다`}
          </div>
        </div>
        <button
          onClick={handleEnqueue}
          disabled={
            isEnqueuing || !setupDone || status.eligible_candidates === 0
          }
          className={`flex items-center gap-1 shrink-0 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all disabled:opacity-50 ${
            setupDone
              ? "text-white bg-bridge-accent hover:bg-bridge-accent/90"
              : "text-slate-400 bg-foreground/5 border border-foreground/10"
          }`}
        >
          {isEnqueuing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Play size={12} />
          )}
          {t("jiraAutofixQueue.enqueue", "큐에 담기")}
        </button>
      </div>

      {/* 셋업 체크리스트 — 하나만 빠져도 큐가 조용히 멈춘 것처럼 보인다 */}
      {!setupDone && (
        <div className="mb-2 px-2.5 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] space-y-1">
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
            done={status.workflow_ready === true}
            label={
              status.workflow_ready === null
                ? "워크플로 배치 · 확인할 수 없습니다 (권한 또는 일시적 오류)"
                : status.workflow_ready
                  ? "워크플로 배치 · autofix.yaml 확인됨"
                  : "워크플로 배치 · 기본 브랜치에 autofix.yaml이 없습니다"
            }
          />
          <SetupRow
            done={status.callback_token_set}
            label="콜백 토큰"
            action={
              !status.callback_token_set ? (
                <button
                  onClick={handleIssueToken}
                  className="text-xs text-bridge-accent hover:underline"
                >
                  {t("jiraAutofixQueue.issueToken", "발급")}
                </button>
              ) : undefined
            }
          />
          <div className="text-xs text-amber-600 dark:text-amber-400 pt-1">
            {t(
              "jiraAutofixQueue.setupIncomplete",
              "셋업을 마쳐야 큐를 시작할 수 있습니다",
            )}
          </div>
        </div>
      )}

      {/* 자동 실행 꺼짐 — 이 안내가 없으면 큐가 고장난 것처럼 보인다 */}
      {setupDone && !status.scheduler_enabled && (
        <div className="flex items-start gap-1.5 px-2.5 py-1.5 mb-2 rounded-lg text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <PauseCircle size={12} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            {t(
              "jiraAutofixQueue.schedulerOff",
              "자동 실행이 꺼져 있습니다. 큐에 담아도 러너로 넘어가지 않습니다.",
            )}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 px-2.5 py-1.5 mb-2 rounded-lg text-xs bg-red-500/10 text-red-400">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {notice && !error && (
        <div className="text-xs text-slate-500 mb-2 leading-relaxed">
          {notice}
        </div>
      )}

      {/* 현황 스트립 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 mb-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] text-xs text-slate-500">
        <span>
          {t("jiraAutofixQueue.threshold", "임계값")}{" "}
          <b className="text-foreground tabular-nums font-bold">
            {status.min_confidence.toFixed(2)}
          </b>
        </span>
        <span className="text-foreground/15">·</span>
        <span>
          {t("jiraAutofixQueue.today", "오늘")}{" "}
          <b className="text-foreground tabular-nums font-bold">
            {status.dispatched_today}/{status.daily_limit}
          </b>
        </span>
        <span className="text-foreground/15">·</span>
        <span>
          {t("jiraAutofixQueue.concurrency", "동시")}{" "}
          <b className="text-foreground tabular-nums font-bold">1</b>
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="text-xs text-slate-500 leading-relaxed">
          {t(
            "jiraAutofixQueue.empty",
            "담긴 작업이 없습니다. 후보를 큐에 담으면 한 건씩 순서대로 실행됩니다.",
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* 진행 중 — 직렬이라는 사실이 보여야 한다 */}
          {active.map((job) => {
            const elapsed = minutesSince(job.dispatched_at);
            return (
              <div
                key={job.id}
                className="px-2.5 py-2 rounded-lg border border-bridge-accent/35 bg-bridge-accent/[0.06] space-y-1"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-bridge-accent">
                    {job.jira_issue_key}
                  </span>
                  <span className={chipCls(job.status)}>
                    {STATUS_STYLE[job.status].label}
                  </span>
                  {elapsed !== null && (
                    <span className="text-xs text-slate-500 tabular-nums ml-auto">
                      {elapsed}분 경과
                    </span>
                  )}
                </div>
                {job.run_url && (
                  <a
                    href={job.run_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-bridge-accent hover:underline"
                  >
                    {t("jiraAutofixQueue.runLog", "실행 로그")}
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            );
          })}

          {/* 대기열 — 취소는 여기서만 노출한다 */}
          {waiting.length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">
                {t("jiraAutofixQueue.waiting", "대기열")}
              </div>
              <div className="space-y-1">
                {waiting.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-foreground/[0.08]"
                  >
                    <span className="text-xs font-bold text-bridge-accent">
                      {job.jira_issue_key}
                    </span>
                    <span className={chipCls(job.status)}>
                      {STATUS_STYLE[job.status].label}
                    </span>
                    {job.confidence != null && (
                      <span className="text-xs text-slate-500 tabular-nums ml-auto">
                        {job.confidence.toFixed(2)}
                      </span>
                    )}
                    <button
                      onClick={() => handleCancel(job.id)}
                      disabled={cancellingId === job.id}
                      aria-label={`${job.jira_issue_key} ${t("jiraAutofixQueue.cancel", "취소")}`}
                      className="text-slate-500 hover:text-rose-500 transition-colors disabled:opacity-50"
                    >
                      {cancellingId === job.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <X size={12} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PR 생성 — 이 화면의 산출물이라 항상 펼친다 */}
          {succeeded.map((job) => (
            <div
              key={job.id}
              className="px-2.5 py-2 rounded-lg border border-foreground/[0.08] space-y-1"
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
                  "jiraAutofixQueue.reviewWarning",
                  "컴파일 통과까지만 검증됨 · 리뷰 필요",
                )}
              </div>
            </div>
          ))}

          {/* 나머지는 접는다. 단 응답 없음이 섞여 있으면 티를 낸다 */}
          {settled.length > 0 && (
            <div className="rounded-lg border border-foreground/[0.08] overflow-hidden">
              <button
                onClick={() => setShowSettled(!showSettled)}
                aria-expanded={showSettled}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors"
              >
                {showSettled ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                {t("jiraAutofixQueue.settled", "그 외")} · {settled.length}
                {t("jiraAutofixQueue.countUnit", "건")}
                {needsAttention && (
                  <span className="ml-auto text-xs font-bold text-amber-600 dark:text-amber-400">
                    {t("jiraAutofixQueue.attention", "확인 필요")}
                  </span>
                )}
              </button>

              {showSettled && (
                <div className="max-h-56 overflow-y-auto custom-scrollbar">
                  {settled.map((job) => (
                    <div
                      key={job.id}
                      className="px-2.5 py-2 border-t border-foreground/[0.06] space-y-1"
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
                            "jiraAutofixQueue.timedOutHint",
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
                      {job.run_url && (
                        <a
                          href={job.run_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-foreground transition-colors"
                        >
                          {t("jiraAutofixQueue.runLog", "실행 로그")}
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
