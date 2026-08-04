import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Loader2,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  jiraAutofixAPI,
  JiraAutofixSummary,
  JiraAutofixItem,
  JiraAutofixVerdict,
  JiraAutofixCategory,
  JiraAutofixTestInfra,
} from "../utils/api";
import { formatRelativeTime } from "../utils/dateUtils";

interface JiraAutofixTriageCardProps {
  boardId: string;
}

/** 판정별 표시색. EXCLUDED는 오류가 아니라 "정상적으로 걸러진 것"이라 경고색을 쓰지 않는다. */
const VERDICT_STYLE: Record<
  JiraAutofixVerdict,
  { chip: string; label: string }
> = {
  CANDIDATE: {
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    label: "후보",
  },
  CONDITIONAL: {
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    label: "조건부",
  },
  EXCLUDED: {
    chip: "bg-foreground/10 text-slate-400",
    label: "제외",
  },
};

/** 저장소에 실제로 어떤 검증 수단이 있는지. 이 값이 판정 기준을 통째로 바꾼다. */
const TEST_INFRA_OPTIONS: {
  value: JiraAutofixTestInfra;
  label: string;
  hint: string;
}[] = [
  {
    value: "NONE",
    label: "테스트 없음",
    hint: "저장소에 자동 테스트 코드가 없습니다. 컴파일과 정적 대조만 검증 수단으로 인정합니다.",
  },
  {
    value: "PARTIAL",
    label: "일부 있음",
    hint: "일부 영역에만 테스트가 있습니다. 그 영역 밖은 조건부 이하로 판정합니다.",
  },
  {
    value: "MATURE",
    label: "갖춰짐",
    hint: "CI에서 EditMode/PlayMode 테스트가 돕니다. 테스트 작성을 정상 검증 수단으로 인정합니다.",
  },
];

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

/**
 * 자동수정 트리아지 — 연동 이슈 중 "자동 검증 가능한" 건이 몇 개인지 센다.
 *
 * <p>파이프라인 1단계. 여기 나오는 후보 비율로 실제 자동수정 파이프라인을 지을지 판단하므로,
 * 이 카드는 판정 결과 조회와 실행까지만 한다.
 */
export function JiraAutofixTriageCard({ boardId }: JiraAutofixTriageCardProps) {
  const { t } = useTranslation();

  const [summary, setSummary] = useState<JiraAutofixSummary | null>(null);
  const [candidates, setCandidates] = useState<JiraAutofixItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [testInfra, setTestInfra] = useState<JiraAutofixTestInfra>("NONE");
  const [isSavingInfra, setIsSavingInfra] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const [result, infra] = await Promise.all([
        jiraAutofixAPI.getSummary(boardId),
        jiraAutofixAPI.getTestInfra(boardId).catch(() => null),
      ]);
      setSummary(result);
      if (infra) setTestInfra(infra.test_infra);
    } catch {
      // 아직 한 번도 안 돌린 보드는 빈 집계가 정상이라 에러로 취급하지 않는다
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleInfraChange = async (level: JiraAutofixTestInfra) => {
    if (level === testInfra || isSavingInfra) return;
    const previous = testInfra;
    setTestInfra(level);
    setIsSavingInfra(true);
    setError(null);
    try {
      await jiraAutofixAPI.updateTestInfra(boardId, level);
      // 서버가 기존 판정을 비우므로 화면도 같이 비운다
      setSummary(null);
      setCandidates([]);
      setLastRun(null);
    } catch (e) {
      setTestInfra(previous);
      setError(
        e instanceof Error
          ? e.message
          : t("jiraAutofix.infraSaveFailed", "검증 환경 저장에 실패했습니다"),
      );
    } finally {
      setIsSavingInfra(false);
    }
  };

  const loadCandidates = useCallback(async () => {
    try {
      setCandidates(await jiraAutofixAPI.getItems(boardId, "CANDIDATE"));
    } catch {
      setCandidates([]);
    }
  }, [boardId]);

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && candidates.length === 0) {
      await loadCandidates();
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const run = await jiraAutofixAPI.runTriage(boardId, false);
      setSummary(run.summary);
      setLastRun(
        run.triaged > 0
          ? `${run.triaged}건 판정 · ${run.skipped}건 변경 없음`
          : `변경된 이슈가 없어 ${run.skipped}건 모두 건너뜀`,
      );
      if (run.failed_batches > 0) {
        setError(
          t(
            "jiraAutofix.partialFailure",
            `${run.failed_batches}개 배치가 실패해 결과가 일부만 반영됐습니다. 다시 실행하면 실패분만 재시도합니다.`,
          ),
        );
      }
      if (expanded) await loadCandidates();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("jiraAutofix.runFailed", "트리아지 실행에 실패했습니다"),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const hasResult = summary !== null && summary.total > 0;

  return (
    <div className="border-t border-foreground/[0.08] pt-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs text-foreground font-medium mb-1">
            {t("jiraAutofix.title", "자동수정 트리아지")}
          </div>
          <div className="text-xs text-slate-500 leading-relaxed">
            {t(
              "jiraAutofix.desc",
              "고쳐졌음을 자동으로 검증할 수 있는 이슈만 골라냅니다. AI가 고칠 수 있는지가 아니라 검증 가능한지가 기준입니다.",
            )}
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="flex items-center gap-1 shrink-0 px-2.5 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 transition-all disabled:opacity-50"
        >
          {isRunning ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          {t("jiraAutofix.run", "판정")}
        </button>
      </div>

      {/* 저장소 검증 환경 — 판정 기준을 통째로 바꾸므로 실행 전에 정해야 한다 */}
      <div className="mb-2 px-2.5 py-2 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08]">
        <div className="text-xs text-slate-400 mb-1.5">
          {t("jiraAutofix.testInfraLabel", "저장소 검증 환경")}
        </div>
        <div className="flex items-center gap-1 mb-1.5">
          {TEST_INFRA_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleInfraChange(option.value)}
              disabled={isSavingInfra}
              aria-pressed={testInfra === option.value}
              className={`flex-1 px-2 py-1 rounded-lg text-xs transition-colors disabled:opacity-50 ${
                testInfra === option.value
                  ? "bg-bridge-accent/15 text-bridge-accent font-bold"
                  : "text-slate-400 hover:bg-foreground/5"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 leading-relaxed">
          {TEST_INFRA_OPTIONS.find((o) => o.value === testInfra)?.hint}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 px-2.5 py-1.5 mb-2 rounded-lg text-xs bg-red-500/10 text-red-400">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {lastRun && !error && (
        <div className="text-xs text-slate-500 mb-2">{lastRun}</div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={16} className="animate-spin text-bridge-accent" />
        </div>
      ) : !hasResult ? (
        <div className="px-2.5 py-3 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] text-xs text-slate-500 leading-relaxed">
          {t(
            "jiraAutofix.empty",
            "아직 판정 결과가 없습니다. 판정을 누르면 가져온 JIRA 이슈를 15건씩 나눠 분류합니다.",
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* 후보 비율 — 2단계 투자 판단의 핵심 숫자 */}
          <div className="flex items-end gap-3 px-3 py-2.5 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08]">
            <div>
              <div className="text-2xl font-bold text-foreground tabular-nums leading-none">
                {summary.candidate_ratio}%
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {t("jiraAutofix.candidateRatio", "자동수정 후보 비율")}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1 ml-auto">
              {(
                [
                  ["CANDIDATE", summary.candidate],
                  ["CONDITIONAL", summary.conditional],
                  ["EXCLUDED", summary.excluded],
                ] as [JiraAutofixVerdict, number][]
              ).map(([verdict, count]) => (
                <span
                  key={verdict}
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${VERDICT_STYLE[verdict].chip}`}
                >
                  {VERDICT_STYLE[verdict].label} {count}
                </span>
              ))}
            </div>
          </div>

          {/* 유형별 분포 — 어떤 종류가 자동화 가치를 만드는지 */}
          <div className="rounded-lg border border-foreground/[0.08] overflow-hidden">
            {summary.categories.map((row, index) => (
              <motion.div
                key={row.category}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="flex items-center gap-2 px-2.5 py-1.5 border-b border-foreground/[0.06] last:border-b-0"
              >
                <span className="text-xs text-foreground w-20 shrink-0 truncate">
                  {CATEGORY_LABEL[row.category] ?? row.category}
                </span>
                <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-foreground/[0.06]">
                  {row.candidate > 0 && (
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${(row.candidate / row.total) * 100}%` }}
                    />
                  )}
                  {row.conditional > 0 && (
                    <div
                      className="bg-amber-500"
                      style={{
                        width: `${(row.conditional / row.total) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <span className="text-xs text-slate-500 tabular-nums w-6 text-right shrink-0">
                  {row.total}
                </span>
              </motion.div>
            ))}
          </div>

          {/* 후보 목록 */}
          {summary.candidate > 0 && (
            <div className="rounded-lg border border-foreground/[0.08] overflow-hidden">
              <button
                onClick={handleToggle}
                aria-expanded={expanded}
                className="w-full flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors"
              >
                {expanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                {t("jiraAutofix.candidateList", "후보 이슈")} ·{" "}
                {summary.candidate}
                {t("jiraAutofix.issuesUnit", "건")}
              </button>

              {expanded && (
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {candidates.length === 0 ? (
                    <div className="px-2.5 py-3 text-xs text-slate-500">
                      {t("jiraAutofix.loadingItems", "불러오는 중...")}
                    </div>
                  ) : (
                    candidates.map((item) => (
                      <div
                        key={item.jira_issue_key}
                        className="px-2.5 py-2 border-t border-foreground/[0.06] space-y-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-bridge-accent">
                            {item.jira_issue_key}
                          </span>
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-foreground/10 text-slate-400">
                            {CATEGORY_LABEL[item.category] ?? item.category}
                          </span>
                          <span className="text-xs text-slate-500 tabular-nums ml-auto">
                            {Math.round(item.confidence * 100)}%
                          </span>
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
                        {item.triaged_at && (
                          <div className="text-xs text-slate-600">
                            {formatRelativeTime(item.triaged_at)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
