import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, CalendarDays, GitCommit } from "lucide-react";

import type { AutoReport, AutoReportSourceStatus } from "../utils/api";
import { formatDate } from "../utils/dateUtils";
import { useReducedMotion } from "../hooks/useReducedMotion";

/** 수집 원본에서 커밋 목록만 꺼낸다. 형태가 다르면 조용히 비운다 — 화면이 깨지면 안 된다. */
interface CommitRow {
  sha: string;
  subject: string;
  author: string | null;
  at: string | null;
  changed_files?: number;
  url: string | null;
}

function parseCommits(rawData: string | null): Record<string, CommitRow[]> {
  if (!rawData) return {};
  try {
    const parsed = JSON.parse(rawData);
    const github = parsed?.github ?? parsed;
    const byRepo = github?.commits_by_repo;
    if (!byRepo || typeof byRepo !== "object") return {};
    return byRepo as Record<string, CommitRow[]>;
  } catch {
    return {};
  }
}

const SOURCE_LABEL: Record<string, string> = {
  GITHUB: "GitHub",
  KANBAN: "칸반",
  CONFLUENCE: "Confluence",
};

const SOURCE_CHIP: Record<string, string> = {
  GITHUB: "bg-slate-500/15 text-slate-400",
  KANBAN: "bg-bridge-accent/15 text-bridge-accent",
  CONFLUENCE: "bg-bridge-secondary/15 text-bridge-secondary",
};

function SourceChip({ source }: { source: string }) {
  return (
    <span
      className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
        SOURCE_CHIP[source] ?? "bg-foreground/10 text-slate-400"
      }`}
    >
      {SOURCE_LABEL[source] ?? source}
    </span>
  );
}

/**
 * 자동 보고서 본문 렌더러. 발행된 공유 페이지({@link AutoReportPage})와 설정 화면의
 * 렌더링 미리보기 모달이 <b>같은 컴포넌트</b>를 써서 발송본과 미리보기가 어긋나지 않게 한다.
 */
export function AutoReportView({
  report,
  className,
}: {
  report: AutoReport;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  const commitsByRepo = useMemo(
    () => parseCommits(report.raw_data ?? null),
    [report],
  );

  const failedSources = useMemo(
    () => (report.source_status ?? []).filter((s) => !s.success),
    [report],
  );

  const enter = (index: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: index * 0.04 },
        };

  const content = report.content;
  const isWeekly = report.report_type === "WEEKLY_INTEGRATED";
  const usedSources = (report.source_status ?? [])
    .filter((s) => s.has_data)
    .map((s) => s.source);

  return (
    <div
      className={
        className ?? "max-w-3xl mx-auto px-5 py-8 md:py-12 flex flex-col gap-6"
      }
    >
      {/* 헤더 */}
      <motion.header {...enter(0)} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {isWeekly ? "주간 보고서" : "일일 개발 보고서"}
          </span>
          {usedSources.map((source) => (
            <SourceChip key={source} source={source} />
          ))}
        </div>
        <h1 className="text-sm md:text-lg font-bold text-foreground tracking-tight">
          {content?.headline ?? `${report.board_name} 보고서`}
        </h1>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDays className="w-4 h-4" />
          <span>
            {report.board_name} · {formatDate(report.period_start)} ~{" "}
            {formatDate(report.period_end)}
          </span>
        </div>
      </motion.header>

      {/* 수집 실패 경고 — 조용히 빠진 소스가 있는 보고서가 가장 위험하다 */}
      {failedSources.length > 0 && (
        <motion.div
          {...enter(1)}
          className="bg-bridge-obsidian rounded-2xl border border-amber-500/30 p-4 flex gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">
              일부 소스 수집 실패
            </span>
            {failedSources.map((s: AutoReportSourceStatus) => (
              <p key={s.source} className="text-xs text-slate-400">
                {SOURCE_LABEL[s.source] ?? s.source} —{" "}
                {s.error ?? "연결 확인 필요"}
              </p>
            ))}
          </div>
        </motion.div>
      )}

      {/* 리드 */}
      {content?.lede && (
        <motion.p
          {...enter(2)}
          className="text-base font-normal leading-relaxed text-foreground border-l-2 border-bridge-accent pl-4"
        >
          {content.lede}
        </motion.p>
      )}

      {/* 지표 */}
      {content?.metrics && content.metrics.length > 0 && (
        <motion.div
          {...enter(3)}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {content.metrics.map((metric) => (
            <div
              key={metric.label}
              className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 flex flex-col gap-0.5"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {metric.label}
              </span>
              <span className="text-xl font-bold text-foreground tabular-nums">
                {metric.value}
              </span>
              {metric.delta && (
                <span className="text-xs text-slate-500">{metric.delta}</span>
              )}
            </div>
          ))}
        </motion.div>
      )}

      {/* 주요 변화 */}
      {content?.highlights && content.highlights.length > 0 && (
        <motion.section
          {...enter(4)}
          className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3"
        >
          <h2 className="text-xs md:text-sm font-bold text-foreground">
            주요 변화
          </h2>
          <ul className="flex flex-col gap-2">
            {content.highlights.map((item, index) => (
              <li key={index} className="flex gap-2 text-sm text-foreground">
                <span className="text-bridge-accent">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* 섹션 */}
      {content?.sections?.map((section, index) => (
        <motion.section
          key={section.title}
          {...enter(5 + index)}
          className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs md:text-sm font-bold text-foreground">
              {section.title}
            </h2>
            {section.sources?.map((source) => (
              <SourceChip key={source} source={source} />
            ))}
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {section.body}
          </p>
        </motion.section>
      ))}

      {/* 확인 필요 */}
      {content?.risks && content.risks.length > 0 && (
        <motion.section
          {...enter(9)}
          className="bg-bridge-obsidian rounded-2xl border border-amber-500/25 p-5 flex flex-col gap-3"
        >
          <h2 className="text-xs md:text-sm font-bold text-amber-500 uppercase tracking-widest">
            확인 필요
          </h2>
          <ul className="flex flex-col gap-2">
            {content.risks.map((risk, index) => (
              <li key={index} className="flex gap-2 text-sm text-slate-400">
                <span className="text-amber-500">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* 구조화 본문이 없으면 마크다운 원문이라도 보여준다 */}
      {!content && report.markdown && (
        <motion.section
          {...enter(5)}
          className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5"
        >
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
            {report.markdown}
          </p>
        </motion.section>
      )}

      {/* 커밋 목록 */}
      {Object.keys(commitsByRepo).length > 0 && (
        <motion.section
          {...enter(10)}
          className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-4"
        >
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs md:text-sm font-bold text-foreground">
              커밋 목록
            </h2>
          </div>
          {Object.entries(commitsByRepo).map(([repo, commits]) => (
            <div key={repo} className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {repo}
              </span>
              <div className="flex flex-col">
                {commits.map((commit) => (
                  <div
                    key={commit.sha}
                    className="py-2 border-b border-foreground/[0.06] last:border-b-0 flex flex-col gap-0.5"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono text-bridge-accent shrink-0 pt-0.5">
                        {commit.sha}
                      </span>
                      {commit.url ? (
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-sm text-foreground hover:text-bridge-accent transition-colors break-words inline-flex items-start gap-1"
                        >
                          {commit.subject}
                          <ArrowUpRight className="w-3 h-3 shrink-0 mt-1" />
                        </a>
                      ) : (
                        <span className="text-sm text-foreground break-words">
                          {commit.subject}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {[commit.author, commit.at].filter(Boolean).join(" · ")}
                      {commit.changed_files
                        ? ` · ${commit.changed_files} files`
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </motion.section>
      )}

      <footer className="pt-4 border-t border-foreground/[0.08] flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-xs text-slate-600">BRIDGE 자동 생성 보고서</span>
        {report.created_at && (
          <span className="text-xs text-slate-600">
            {formatDate(report.created_at)}
          </span>
        )}
      </footer>
    </div>
  );
}
