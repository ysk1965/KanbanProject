import { useMemo, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Check,
  FileText,
  GitCommit,
} from "lucide-react";

import type {
  AutoReport,
  AutoReportCommitCategory,
  AutoReportFeature,
  AutoReportFeatureCommit,
  AutoReportSourceStatus,
  AutoReportSprint,
} from "../utils/api";
import { formatDate, formatRelativeTime } from "../utils/dateUtils";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
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

/** 수집 원본에서 Confluence 주간보고 페이지를 꺼낸다. 원문은 요약하지 않고 그대로 보여준다. */
interface ConfluencePage {
  title: string;
  space?: string | null;
  url?: string | null;
  last_updated?: string | null;
  body?: string | null;
}

function parseConfluencePages(rawData: string | null): ConfluencePage[] {
  if (!rawData) return [];
  try {
    const parsed = JSON.parse(rawData);
    const pages = parsed?.confluence?.pages;
    return Array.isArray(pages) ? (pages as ConfluencePage[]) : [];
  } catch {
    return [];
  }
}

const SOURCE_LABEL: Record<string, string> = {
  GITHUB: "GitHub",
  KANBAN: "칸반",
  CONFLUENCE: "Confluence",
  SLACK: "슬랙",
};

const SOURCE_CHIP: Record<string, string> = {
  GITHUB: "bg-slate-500/15 text-slate-400",
  KANBAN: "bg-bridge-accent/15 text-bridge-accent",
  CONFLUENCE: "bg-bridge-secondary/15 text-bridge-secondary",
  SLACK: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
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

/* ── 기능 상태 표기 ── */
const FEATURE_STATUS: Record<string, { label: string; chip: string }> = {
  DONE: {
    label: "완료",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  IN_PROGRESS: {
    label: "진행 중",
    chip: "bg-bridge-accent/15 text-bridge-accent",
  },
};

function pct(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((value / total) * 100);
}

/* ── 담당자 아바타 ── */
function AssigneeAvatars({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <span className="flex">
      {names.slice(0, 4).map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-bridge-obsidian"
          style={{
            backgroundColor: getAssigneeHex(name),
            marginLeft: i === 0 ? 0 : -6,
          }}
          title={name}
        >
          {getInitials(name)}
        </span>
      ))}
    </span>
  );
}

/* ── 스프린트 진행바 ── */
function SprintBar({ sprint }: { sprint: AutoReportSprint }) {
  const { done, total, in_progress, delayed } = sprint;
  const remaining = Math.max(0, total - done - in_progress - delayed);
  const segments = [
    { key: "done", value: done, cls: "bg-bridge-accent" },
    { key: "prog", value: in_progress, cls: "bg-bridge-secondary" },
    { key: "delayed", value: delayed, cls: "bg-amber-500" },
  ];
  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3">
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
        <span className="text-sm font-bold text-foreground">{sprint.name}</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-bridge-secondary">
          <span className="w-1.5 h-1.5 rounded-full bg-bridge-secondary" />
          진행중
        </span>
        <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
          {sprint.percentage}
          <span className="text-sm ml-0.5">%</span>
        </span>
        <span className="text-xs text-slate-500 tabular-nums">
          {done} / {total} 항목
        </span>
      </div>
      <div className="h-2 rounded-full bg-foreground/10 overflow-hidden flex">
        {segments.map((s) =>
          s.value > 0 ? (
            <span
              key={s.key}
              className={`${s.cls} h-full`}
              style={{ width: `${pct(s.value, total)}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-400">
        <Legend cls="bg-bridge-accent" label="완료" n={done} />
        <Legend cls="bg-bridge-secondary" label="진행 중" n={in_progress} />
        <Legend cls="bg-amber-500" label="지연" n={delayed} />
        <Legend cls="bg-foreground/20" label="남은" n={remaining} />
      </div>
    </div>
  );
}

function Legend({ cls, label, n }: { cls: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} />
      {label} {n}
    </span>
  );
}

/* ── 태스크 상태 마커 ── */
function TaskMark({ status }: { status: string }) {
  if (status === "DONE") {
    return (
      <span className="w-[15px] h-[15px] rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
        <Check
          className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400"
          strokeWidth={3}
        />
      </span>
    );
  }
  const ring =
    status === "IN_PROGRESS" ? "border-bridge-accent" : "border-foreground/20";
  return (
    <span
      className={`w-[15px] h-[15px] rounded-full border-2 ${ring} shrink-0`}
    />
  );
}

/* ── 커밋 목록 (레포별 그룹) ── */
function CommitList({ commits }: { commits: AutoReportFeatureCommit[] }) {
  if (commits.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-1">연결된 커밋이 없습니다.</p>
    );
  }
  const byRepo = new Map<string, AutoReportFeatureCommit[]>();
  for (const c of commits) {
    const repo = c.repo ?? "기타";
    if (!byRepo.has(repo)) byRepo.set(repo, []);
    byRepo.get(repo)!.push(c);
  }
  return (
    <div className="flex flex-col gap-1">
      {[...byRepo.entries()].map(([repo, list]) => (
        <div key={repo} className="flex flex-col">
          <span className="text-xs text-slate-600 uppercase tracking-widest pt-2 first:pt-0">
            {repo}
          </span>
          {list.map((c, i) => (
            <div
              key={`${c.sha}-${i}`}
              className="flex flex-col gap-0.5 py-2 border-t border-foreground/[0.06]"
            >
              <div className="flex items-center gap-2">
                {c.sha && (
                  <span className="text-xs font-mono text-bridge-accent">
                    {c.sha}
                  </span>
                )}
                {c.estimated && (
                  <span
                    className="text-xs font-bold px-1.5 rounded-full bg-amber-500/15 text-amber-500 ml-auto"
                    title="담당자 확정이 아닌 키워드 기반 추정 연결"
                  >
                    추정
                  </span>
                )}
              </div>
              {c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-foreground hover:text-bridge-accent leading-snug inline-flex items-start gap-1"
                >
                  <span>{c.subject}</span>
                  <ArrowUpRight className="w-3 h-3 shrink-0 mt-1" />
                </a>
              ) : (
                <span className="text-sm text-foreground leading-snug">
                  {c.subject}
                </span>
              )}
              <div className="text-xs text-slate-500 tabular-nums flex gap-2 flex-wrap">
                {c.author && <span>{c.author}</span>}
                {c.at && <span>· {c.at}</span>}
                {c.changed_files != null && (
                  <span>· {c.changed_files} files</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── 기능 상세 (헤더 + 보드 태스크 + GitHub 커밋 근거) ── */
function FeatureDetail({ feature }: { feature: AutoReportFeature }) {
  const status = FEATURE_STATUS[feature.status] ?? FEATURE_STATUS.IN_PROGRESS;
  const barColor =
    feature.status === "DONE" ? "bg-emerald-500" : "bg-bridge-accent";
  const assignees = (feature.assignees ?? []).filter(Boolean);
  const tasks = feature.tasks ?? [];
  const commits = feature.commits ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-foreground flex-1">
            {feature.name}
          </h3>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${status.chip}`}
          >
            {status.label}
          </span>
        </div>
        {feature.description && (
          <p className="text-sm text-slate-400 leading-relaxed">
            {feature.description}
          </p>
        )}
        <div className="flex items-center gap-2.5">
          <span className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
            <span
              className={`block h-full ${barColor}`}
              style={{
                width: `${pct(feature.task_done, feature.task_total)}%`,
              }}
            />
          </span>
          <span className="text-xs font-bold text-slate-400 tabular-nums whitespace-nowrap">
            {feature.task_done} / {feature.task_total} 태스크
          </span>
        </div>
        {(assignees.length > 0 || feature.last_activity) && (
          <div className="flex items-center gap-2 pt-1.5 border-t border-foreground/[0.06]">
            <AssigneeAvatars names={assignees} />
            {feature.last_activity && (
              <span className="text-xs text-slate-500 ml-auto">
                {formatRelativeTime(feature.last_activity)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 근거: 보드 태스크 + GitHub 커밋 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
            보드 태스크
            <span className="ml-auto text-xs font-bold px-1.5 rounded-full bg-bridge-accent/15 text-bridge-accent normal-case tracking-normal">
              {tasks.length}
            </span>
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-500 py-1">태스크가 없습니다.</p>
          ) : (
            <div className="flex flex-col">
              {tasks.map((task, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 py-1.5 text-sm border-t border-foreground/[0.06] first:border-t-0"
                >
                  <TaskMark status={task.status} />
                  <span
                    className={
                      task.status === "DONE"
                        ? "text-slate-400"
                        : "text-foreground"
                    }
                  >
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
            <GitCommit className="w-3.5 h-3.5" /> GitHub 커밋
            <span className="ml-auto text-xs font-bold px-1.5 rounded-full bg-slate-500/15 text-slate-400 normal-case tracking-normal">
              {commits.length}
            </span>
          </div>
          <CommitList commits={commits} />
        </div>
      </div>
    </div>
  );
}

type FeatureTabItem =
  | { id: string; kind: "feature"; feature: AutoReportFeature }
  | { id: string; kind: "category"; category: AutoReportCommitCategory };

/* ── 기능별 진행 현황: 기능 탭 + 미매핑 커밋 카테고리 탭 ── */
function FeatureProgressTabs({
  features,
  categories,
}: {
  features: AutoReportFeature[];
  categories: AutoReportCommitCategory[];
}) {
  const items = useMemo<FeatureTabItem[]>(() => {
    const fx: FeatureTabItem[] = features.map((f, i) => ({
      id: `f${i}`,
      kind: "feature",
      feature: f,
    }));
    const cx: FeatureTabItem[] = categories
      .filter((c) => (c.commits?.length ?? 0) > 0)
      .map((c, i) => ({ id: `c${i}`, kind: "category", category: c }));
    return [...fx, ...cx];
  }, [features, categories]);

  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  const activeItem = items.find((it) => it.id === active) ?? items[0];
  if (!activeItem) return null;

  const featureItems = items.filter((it) => it.kind === "feature");
  const categoryItems = items.filter((it) => it.kind === "category");

  const tabClass = (selected: boolean) =>
    `flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
      selected
        ? "bg-bridge-obsidian text-foreground shadow"
        : "text-slate-400 hover:text-foreground"
    }`;
  const countClass = (selected: boolean, accent: boolean) =>
    `text-xs font-bold px-1.5 rounded-full tabular-nums ${
      selected
        ? accent
          ? "bg-bridge-accent/15 text-bridge-accent"
          : "bg-slate-500/15 text-slate-400"
        : "bg-foreground/[0.06] text-slate-500"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs md:text-sm font-bold text-foreground">
        기능별 진행 현황
      </h2>

      <div
        role="tablist"
        aria-label="기능 및 커밋 카테고리"
        className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08]"
      >
        {featureItems.map((it) => {
          if (it.kind !== "feature") return null;
          const selected = it.id === activeItem.id;
          const done = it.feature.status === "DONE";
          return (
            <button
              key={it.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setActive(it.id)}
              className={tabClass(selected)}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${done ? "bg-emerald-500" : "bg-bridge-accent"}`}
              />
              {it.feature.name}
              <span className={countClass(selected, true)}>
                {it.feature.task_done}/{it.feature.task_total}
              </span>
            </button>
          );
        })}

        {categoryItems.length > 0 && (
          <span className="basis-full text-xs font-bold uppercase tracking-widest text-slate-600 px-1.5 pt-1.5 mt-1 border-t border-dashed border-foreground/[0.08]">
            기타 커밋 · 기능 미매핑
          </span>
        )}

        {categoryItems.map((it) => {
          if (it.kind !== "category") return null;
          const selected = it.id === activeItem.id;
          return (
            <button
              key={it.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setActive(it.id)}
              className={tabClass(selected)}
            >
              {it.category.label}
              <span className={countClass(selected, false)}>
                {it.category.commits?.length ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {activeItem.kind === "feature" ? (
        <FeatureDetail feature={activeItem.feature} />
      ) : (
        <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">
              {activeItem.category.label}
            </h3>
            <span className="text-xs text-slate-500 ml-auto tabular-nums">
              커밋 {activeItem.category.commits?.length ?? 0}건
            </span>
          </div>
          <p className="text-xs text-slate-500">
            어느 기능에도 연결되지 않은 커밋입니다.
          </p>
          <CommitList commits={activeItem.category.commits ?? []} />
        </div>
      )}
    </div>
  );
}

type TabKey = "summary" | "github" | "confluence";

/**
 * 자동 보고서 본문 렌더러. 발행된 공유 페이지({@link AutoReportPage})와 설정 화면의
 * 렌더링 미리보기 모달이 <b>같은 컴포넌트</b>를 써서 발송본과 미리보기가 어긋나지 않게 한다.
 *
 * <p>내용은 세 갈래로 나뉜다: <b>요약</b>(스프린트·기능별 진행·리드·지표·확인 필요),
 * <b>GitHub</b>(수집한 커밋), <b>Confluence</b>(주간보고 원문).
 */
export function AutoReportView({
  report,
  className,
}: {
  report: AutoReport;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<TabKey>("summary");

  const commitsByRepo = useMemo(
    () => parseCommits(report.raw_data ?? null),
    [report],
  );
  const confluencePages = useMemo(
    () => parseConfluencePages(report.raw_data ?? null),
    [report],
  );

  const failedSources = useMemo(
    () => (report.source_status ?? []).filter((s) => !s.success),
    [report],
  );

  const content = report.content;
  const isWeekly = report.report_type === "WEEKLY_INTEGRATED";
  const usedSources = (report.source_status ?? [])
    .filter((s) => s.has_data)
    .map((s) => s.source);

  const commitCount = useMemo(
    () =>
      Object.values(commitsByRepo).reduce((sum, list) => sum + list.length, 0),
    [commitsByRepo],
  );

  const tabs = useMemo(() => {
    const list: Array<{ key: TabKey; label: string; count?: number }> = [
      { key: "summary", label: "요약" },
    ];
    if (commitCount > 0)
      list.push({ key: "github", label: "GitHub", count: commitCount });
    if (confluencePages.length > 0)
      list.push({
        key: "confluence",
        label: "Confluence",
        count: confluencePages.length,
      });
    return list;
  }, [commitCount, confluencePages.length]);

  const activeTab = tabs.some((t) => t.key === tab) ? tab : "summary";

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
    setTab(tabs[next].key);
  };

  const fade = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <div
      className={
        className ?? "max-w-3xl mx-auto px-5 py-8 md:py-12 flex flex-col gap-6"
      }
    >
      {/* 헤더 (탭 위 고정) */}
      <header className="flex flex-col gap-2">
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
      </header>

      {/* 탭 바 */}
      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label="보고서 섹션"
          className="flex gap-1 p-1 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08]"
        >
          {tabs.map((t, index) => {
            const selected = t.key === activeTab;
            return (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.key)}
                onKeyDown={(e) => onTabKeyDown(e, index)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs md:text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                  selected
                    ? "bg-bridge-obsidian text-foreground shadow"
                    : "text-slate-400 hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count != null && (
                  <span
                    className={`text-xs font-bold px-1.5 rounded-full tabular-nums ${
                      selected
                        ? "bg-bridge-accent/15 text-bridge-accent"
                        : "bg-foreground/[0.06] text-slate-500"
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── 요약 탭 ── */}
      {activeTab === "summary" && (
        <motion.div key="summary" {...fade} className="flex flex-col gap-6">
          {/* 수집 실패 경고 — 조용히 빠진 소스가 있는 보고서가 가장 위험하다 */}
          {failedSources.length > 0 && (
            <div className="bg-bridge-obsidian rounded-2xl border border-amber-500/30 p-4 flex gap-3">
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
            </div>
          )}

          {/* 스프린트 진행 현황 */}
          {content?.sprint && <SprintBar sprint={content.sprint} />}

          {/* 리드 */}
          {content?.lede && (
            <p className="text-base font-normal leading-relaxed text-foreground border-l-2 border-bridge-accent pl-4">
              {content.lede}
            </p>
          )}

          {/* 지표 */}
          {content?.metrics && content.metrics.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                    <span className="text-xs text-slate-500">
                      {metric.delta}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 기능별 진행 현황 (탭 + 보드·커밋 근거) */}
          {content?.features && content.features.length > 0 && (
            <FeatureProgressTabs
              features={content.features}
              categories={content.commit_categories ?? []}
            />
          )}

          {/* 주요 변화 (기능 카드가 없을 때 폴백) */}
          {(!content?.features || content.features.length === 0) &&
            content?.highlights &&
            content.highlights.length > 0 && (
              <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3">
                <h2 className="text-xs md:text-sm font-bold text-foreground">
                  주요 변화
                </h2>
                <ul className="flex flex-col gap-2">
                  {content.highlights.map((item, index) => (
                    <li
                      key={index}
                      className="flex gap-2 text-sm text-foreground"
                    >
                      <span className="text-bridge-accent">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

          {/* 섹션 */}
          {content?.sections?.map((section) => (
            <section
              key={section.title}
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
            </section>
          ))}

          {/* 공유된 자료 (슬랙 이미지·영상) */}
          {content?.attachments && content.attachments.length > 0 && (
            <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs md:text-sm font-bold text-foreground">
                  공유된 자료
                </h2>
                <SourceChip source="SLACK" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {content.attachments.map((att, index) => (
                  <figure
                    key={index}
                    className="flex flex-col gap-1.5 rounded-xl overflow-hidden border border-foreground/[0.08] bg-bridge-dark"
                  >
                    {att.type === "video" ? (
                      <video
                        src={att.url}
                        controls
                        className="w-full aspect-video object-cover bg-black"
                      />
                    ) : (
                      <a href={att.url} target="_blank" rel="noreferrer">
                        <img
                          src={att.url}
                          alt={att.title ?? "공유된 이미지"}
                          loading="lazy"
                          className="w-full aspect-video object-cover hover:opacity-90 transition-opacity"
                        />
                      </a>
                    )}
                    {att.title && (
                      <figcaption className="px-2 pb-1.5 text-xs text-slate-500 truncate">
                        {att.title}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* 확인 필요 */}
          {content?.risks && content.risks.length > 0 && (
            <section className="bg-bridge-obsidian rounded-2xl border border-amber-500/25 p-5 flex flex-col gap-3">
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
            </section>
          )}

          {/* 구조화 본문이 없으면 마크다운 원문이라도 보여준다 */}
          {!content && report.markdown && (
            <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {report.markdown}
              </p>
            </section>
          )}
        </motion.div>
      )}

      {/* ── GitHub 탭 ── */}
      {activeTab === "github" && (
        <motion.div key="github" {...fade} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs md:text-sm font-bold text-foreground">
              커밋
            </h2>
          </div>
          {Object.entries(commitsByRepo).map(([repo, commits]) => (
            <div
              key={repo}
              className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                  {repo}
                </span>
                <span className="text-xs text-slate-500 ml-auto tabular-nums">
                  {commits.length} 커밋
                </span>
              </div>
              <div className="flex flex-col">
                {commits.map((commit) => (
                  <div
                    key={commit.sha}
                    className="py-2 border-t border-foreground/[0.06] flex flex-col gap-0.5"
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
        </motion.div>
      )}

      {/* ── Confluence 탭 ── */}
      {activeTab === "confluence" && (
        <motion.div key="confluence" {...fade} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-bridge-secondary" />
            <h2 className="text-xs md:text-sm font-bold text-foreground">
              주간보고 원문
            </h2>
            <span className="text-xs text-slate-500">요약하지 않음</span>
          </div>
          {confluencePages.map((page, i) => (
            <article
              key={`${page.title}-${i}`}
              className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-bridge-secondary shrink-0" />
                <h3 className="text-sm font-bold text-foreground">
                  {page.title}
                </h3>
              </div>
              {(page.space || page.last_updated) && (
                <div className="text-xs text-slate-500">
                  {[
                    page.space,
                    page.last_updated ? formatDate(page.last_updated) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {page.body && (
                <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed">
                  {page.body}
                </p>
              )}
              {page.url && (
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs font-bold text-bridge-secondary hover:underline"
                >
                  Confluence에서 열기
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              )}
            </article>
          ))}
        </motion.div>
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
