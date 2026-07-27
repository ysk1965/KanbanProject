import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns3,
  Database,
  FileDiff,
  FileText,
  GitCommit,
  Images,
  ListChecks,
  type LucideIcon,
  MessagesSquare,
  Paperclip,
  Play,
  Sparkles,
  X,
} from "lucide-react";

import type {
  AutoReport,
  AutoReportAttachment,
  AutoReportCluster,
  AutoReportClusterSignal,
  AutoReportCommitCategory,
  AutoReportConfluenceDoc,
  AutoReportFeature,
  AutoReportFeatureCommit,
  AutoReportFeatureTask,
  AutoReportMember,
  AutoReportMemberChecklistChange,
  AutoReportMemberCommit,
  AutoReportMemberSlackMessage,
  AutoReportMetric,
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

/**
 * 수집 원본에서 Confluence 소스를 꺼낸다. 두 갈래를 모두 보여준다:
 * <b>pages</b>(주간보고 원문, 요약하지 않음)와 <b>changelogs</b>(부모 문서 하위에서
 * 그 기간에 추가/수정/삭제된 실제 문서들).
 */
interface ConfluencePage {
  title: string;
  space?: string | null;
  url?: string | null;
  last_updated?: string | null;
  body?: string | null;
}

/** 변경내역의 문서 한 건 — 추가/수정은 본문·링크까지, 삭제는 제목만 온다. */
interface ConfluenceDoc {
  id?: string | null;
  title: string;
  url?: string | null;
  author_id?: string | null;
  updated_at?: string | null;
  body?: string | null;
  version?: number | null;
}

interface ConfluenceChangelog {
  space?: string | null;
  parent_page_id?: string | null;
  period?: string | null;
  added?: ConfluenceDoc[];
  modified?: ConfluenceDoc[];
  deleted?: ConfluenceDoc[];
  truncated?: boolean;
}

interface ConfluenceData {
  pages: ConfluencePage[];
  changelogs: ConfluenceChangelog[];
}

function parseConfluence(rawData: string | null): ConfluenceData {
  const empty: ConfluenceData = { pages: [], changelogs: [] };
  if (!rawData) return empty;
  try {
    const c = JSON.parse(rawData)?.confluence;
    if (!c || typeof c !== "object") return empty;
    return {
      pages: Array.isArray(c.pages) ? c.pages : [],
      changelogs: Array.isArray(c.changelogs) ? c.changelogs : [],
    };
  } catch {
    return empty;
  }
}

/** 변경내역 그룹 표기 — 추가/수정/삭제. 상태 텍스트만 dark: 분기(디자인 가이드). */
const CONFLUENCE_CHANGE_META: Array<{
  key: "added" | "modified" | "deleted";
  label: string;
  pill: string;
}> = [
  {
    key: "added",
    label: "추가된 문서",
    pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "modified",
    label: "수정된 문서",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  {
    key: "deleted",
    label: "삭제된 문서",
    pill: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
];

/** 변경내역 문서 한 장 — 삭제 문서는 제목만 취소선으로 남긴다. */
function ConfluenceDocCard({
  doc,
  deleted,
}: {
  doc: ConfluenceDoc;
  deleted?: boolean;
}) {
  return (
    <article className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-bridge-secondary shrink-0" />
        <h3
          className={`text-sm font-bold break-words ${
            deleted ? "text-slate-500 line-through" : "text-foreground"
          }`}
        >
          {doc.title}
        </h3>
      </div>
      {!deleted && (doc.author_id || doc.updated_at) && (
        <div className="text-xs text-slate-500">
          {[doc.author_id, doc.updated_at ? formatDate(doc.updated_at) : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
      {!deleted && doc.body && (
        <p className="text-sm text-slate-400 whitespace-pre-wrap leading-relaxed break-words">
          {doc.body}
        </p>
      )}
      {!deleted && doc.url && (
        <a
          href={doc.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs font-bold text-bridge-secondary hover:underline"
        >
          Confluence에서 열기
          <ArrowUpRight className="w-3 h-3" />
        </a>
      )}
    </article>
  );
}

/** 수집 원본에서 칸반 태스크를 완료/진행 중/지연 그룹으로 꺼낸다. 체크리스트 항목까지 그대로 보여준다. */
interface KanbanChecklistItem {
  title: string;
  done: boolean;
  assignee?: string | null;
}

interface KanbanTask {
  title: string;
  key?: string | null;
  feature?: string | null;
  column?: string | null;
  description?: string | null;
  checklist_done?: number;
  checklist_total?: number;
  checklist?: KanbanChecklistItem[];
  assignees?: string[];
  blocked_by?: string[];
  qa_state?: string | null;
  due_date?: string | null;
  days_overdue?: number;
  completed_at?: string | null;
}

interface KanbanGroups {
  completed: KanbanTask[];
  in_progress: KanbanTask[];
  overdue: KanbanTask[];
}

function parseKanban(rawData: string | null): KanbanGroups {
  const empty: KanbanGroups = { completed: [], in_progress: [], overdue: [] };
  if (!rawData) return empty;
  try {
    const k = JSON.parse(rawData)?.kanban;
    if (!k || typeof k !== "object") return empty;
    return {
      completed: Array.isArray(k.completed) ? k.completed : [],
      in_progress: Array.isArray(k.in_progress) ? k.in_progress : [],
      overdue: Array.isArray(k.overdue) ? k.overdue : [],
    };
  } catch {
    return empty;
  }
}

/** 수집 원본에서 슬랙 채널 대화를 꺼낸다. 스레드 답글(replies)까지 중첩 구조 그대로 유지한다. */
interface SlackFile {
  title?: string | null;
  type?: string | null;
  url?: string | null;
  /** 영상 재생을 위한 슬랙 원문(permalink). */
  link?: string | null;
}

interface SlackMessage {
  user?: string | null;
  author?: string | null;
  at?: string | null;
  text?: string | null;
  reactions?: string[];
  files?: SlackFile[];
  replies?: SlackMessage[];
}

interface SlackChannel {
  channel?: string | null;
  channel_name?: string | null;
  message_count?: number;
  messages: SlackMessage[];
}

function parseSlack(rawData: string | null): SlackChannel | null {
  if (!rawData) return null;
  try {
    const s = JSON.parse(rawData)?.slack;
    if (!s || typeof s !== "object" || !Array.isArray(s.messages)) return null;
    return s as SlackChannel;
  } catch {
    return null;
  }
}

/** 칸반 그룹 표기 — 상태 뱃지 텍스트만 dark: 분기(디자인 가이드). */
const KANBAN_GROUP_META: Array<{
  key: keyof KanbanGroups;
  label: string;
  pill: string;
}> = [
  {
    key: "completed",
    label: "완료",
    pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "in_progress",
    label: "진행 중",
    pill: "bg-bridge-accent/15 text-bridge-accent",
  },
  {
    key: "overdue",
    label: "지연",
    pill: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
];

/** 태스크 한 장 — 체크리스트 항목으로 "무슨 작업인지"와 커밋 매칭 단서를 드러낸다. */
function KanbanTaskCard({
  task,
  overdue,
}: {
  task: KanbanTask;
  overdue?: boolean;
}) {
  const done = task.checklist_done ?? 0;
  const total = task.checklist_total ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <article
      className={`bg-bridge-obsidian rounded-2xl border p-5 flex flex-col gap-2.5 ${
        overdue ? "border-rose-500/25" : "border-foreground/[0.08]"
      }`}
    >
      <h3 className="text-sm font-bold text-foreground break-words">
        {task.title}
      </h3>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {task.key && (
          <span className="font-mono text-slate-400">{task.key}</span>
        )}
        {task.feature && (
          <span className="px-1.5 py-0.5 rounded bg-foreground/[0.06] text-slate-400">
            {task.feature}
          </span>
        )}
        {task.column && (
          <span className="px-1.5 py-0.5 rounded bg-foreground/[0.06] text-slate-400">
            {task.column}
          </span>
        )}
        {task.assignees?.length ? (
          <span>{task.assignees.join(", ")}</span>
        ) : null}
        {overdue && task.due_date && (
          <span className="text-rose-600 dark:text-rose-400">
            마감 {formatDate(task.due_date)}
            {task.days_overdue ? ` · ${task.days_overdue}일 지연` : ""}
          </span>
        )}
        {!overdue && task.completed_at && (
          <span>완료 {formatDate(task.completed_at)}</span>
        )}
      </div>
      {task.description && (
        <p className="text-xs text-slate-400 leading-relaxed break-words">
          {task.description}
        </p>
      )}
      {total > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="tabular-nums">
            체크리스트 {done}/{total}
          </span>
          <span className="flex-1 max-w-[120px] h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
            <span
              className="block h-full bg-emerald-500 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </span>
        </div>
      )}
      {task.checklist?.length ? (
        <ul className="flex flex-col gap-1.5 mt-0.5">
          {task.checklist.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span
                className={`shrink-0 w-4 h-4 rounded flex items-center justify-center border ${
                  item.done
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-slate-600"
                }`}
              >
                {item.done && (
                  <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                )}
              </span>
              <span
                className={
                  item.done ? "text-slate-500 line-through" : "text-foreground"
                }
              >
                {item.title}
              </span>
              {item.assignee && (
                <span className="ml-auto shrink-0 text-xs text-slate-500">
                  {item.assignee}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {task.blocked_by?.length ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
          <Ban className="w-3.5 h-3.5 shrink-0" />
          {task.blocked_by.join(", ")}에 막힘
        </span>
      ) : null}
    </article>
  );
}

/** 슬랙 메시지 한 줄 — 답글(replies)은 자기 자신을 재귀 렌더해 스레드 결론까지 보여준다. */
function SlackMessageItem({ msg }: { msg: SlackMessage }) {
  const name = msg.author || msg.user || "알 수 없음";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-foreground">{name}</span>
        {msg.at && (
          <span className="text-xs text-slate-500 tabular-nums">{msg.at}</span>
        )}
      </div>
      {msg.text && (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {msg.text}
        </p>
      )}
      {msg.reactions?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {msg.reactions.map((r, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-full bg-foreground/[0.06] text-slate-400"
            >
              {r}
            </span>
          ))}
        </div>
      ) : null}
      {msg.files?.length ? (
        <div className="flex flex-col gap-1.5">
          {msg.files.map((f, i) => (
            <a
              key={i}
              href={f.link ?? f.url ?? undefined}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 bg-foreground/[0.03] border border-foreground/[0.08] rounded-lg px-2.5 py-1.5 w-fit hover:text-foreground transition-colors"
            >
              {f.type === "video" ? (
                <Play className="w-3 h-3 text-bridge-secondary shrink-0" />
              ) : (
                <Paperclip className="w-3 h-3 text-bridge-secondary shrink-0" />
              )}
              {f.title || f.type || "첨부"}
            </a>
          ))}
        </div>
      ) : null}
      {msg.replies?.length ? (
        <div className="mt-1 pl-3.5 border-l-2 border-foreground/[0.08] flex flex-col gap-3">
          {msg.replies.map((rep, i) => (
            <SlackMessageItem key={i} msg={rep} />
          ))}
        </div>
      ) : null}
    </div>
  );
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
/* 스프린트 상태 → 라벨·색·펄스 여부 */
function sprintStatusMeta(status: string): {
  label: string;
  cls: string;
  pulse: boolean;
} {
  switch (status) {
    case "DONE":
    case "COMPLETED":
      return {
        label: "완료",
        cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15",
        pulse: false,
      };
    case "PLANNED":
    case "NOT_STARTED":
      return {
        label: "예정",
        cls: "text-slate-400 bg-foreground/[0.06]",
        pulse: false,
      };
    case "IN_PROGRESS":
    default:
      return {
        label: "진행중",
        cls: "text-bridge-secondary bg-bridge-secondary/15",
        pulse: true,
      };
  }
}

function SprintBar({ sprint }: { sprint: AutoReportSprint }) {
  const { done, total, in_progress, delayed } = sprint;
  const remaining = Math.max(0, total - done - in_progress - delayed);
  const status = sprintStatusMeta(sprint.status);
  const segments = [
    { key: "done", value: done, cls: "bg-bridge-accent" },
    { key: "prog", value: in_progress, cls: "bg-bridge-secondary" },
    { key: "delayed", value: delayed, cls: "bg-amber-500" },
    { key: "rem", value: remaining, cls: "bg-foreground/15" },
  ];
  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-bold text-foreground">
            {sprint.name}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full ${status.cls}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full bg-current ${status.pulse ? "animate-pulse" : ""}`}
            />
            {status.label}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
            {sprint.percentage}
            <span className="text-sm ml-0.5 text-slate-500">%</span>
          </span>
          <span className="text-xs text-slate-500 tabular-nums">
            {done} / {total} 항목
          </span>
        </div>
      </div>
      <div className="flex h-2.5 gap-0.5">
        {segments.map((s) =>
          s.value > 0 ? (
            <span
              key={s.key}
              className={`${s.cls} h-full first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${pct(s.value, total)}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Legend cls="bg-bridge-accent" label="완료" n={done} />
        <Legend cls="bg-bridge-secondary" label="진행 중" n={in_progress} />
        <Legend cls="bg-amber-500" label="지연" n={delayed} />
        <Legend cls="bg-foreground/20" label="남은" n={remaining} />
      </div>
    </div>
  );
}

/* 스프린트 범례 — 값을 품은 카운트 칩(카드 하단 시그널 칩과 동일 언어) */
function Legend({ cls, label, n }: { cls: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 bg-foreground/[0.04] border border-foreground/10 rounded-lg px-2 py-1 tabular-nums">
      <span className={`w-2 h-2 rounded-sm ${cls}`} />
      {label}
      <b className="text-foreground font-bold">{n}</b>
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

/* ── 커밋 레포 그룹 (드롭다운, 기본 펼침) ── */
function CommitRepoGroup({
  repo,
  list,
}: {
  repo: string;
  list: AutoReportFeatureCommit[];
}) {
  const [open, setOpen] = useState(true);
  const latest = list[0]?.subject ?? ""; // 헤더 요약 = 최근 커밋 제목
  return (
    <div className="border-t border-foreground/[0.06] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50 rounded-lg"
      >
        <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-slate-400">
          {repo}
        </span>
        <span className="shrink-0 text-xs font-bold px-1.5 rounded-full bg-slate-500/15 text-slate-400 tabular-nums">
          {list.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
          {latest}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="flex flex-col pb-1">
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
      )}
    </div>
  );
}

/* ── 커밋 목록 (레포별 드롭다운) ── */
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
    <div className="flex flex-col">
      {[...byRepo.entries()].map(([repo, list]) => (
        <CommitRepoGroup key={repo} repo={repo} list={list} />
      ))}
    </div>
  );
}

/* ── 근거 그룹 헤더 (연결된 태스크 / 커밋 / 문서 공통) ── */
/* ── 근거 섹션: 헤더 클릭으로 섹션 전체를 접고 펼치는 드롭다운 (기본 펼침) ── */
function EvidenceSection({
  icon,
  label,
  count,
  countClass,
  isNew,
  defaultOpen = true,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  countClass: string;
  isNew?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`w-full flex items-center gap-1.5 px-4 py-3 bg-foreground/[0.03] text-left transition-colors hover:bg-foreground/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50 ${
          open ? "border-b border-foreground/[0.06]" : ""
        }`}
      >
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        {isNew && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-secondary/15 text-bridge-secondary">
            신규
          </span>
        )}
        <span
          className={`ml-auto text-xs font-bold px-1.5 rounded-full tabular-nums ${countClass}`}
        >
          {count}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open && children}
    </div>
  );
}

/* ── 태스크 그룹 (드롭다운, 기본 접힘) + 체크리스트 (기능 근거) ── */
function FeatureTaskRow({ task }: { task: AutoReportFeatureTask }) {
  const checklist = task.checklist ?? [];
  const [open, setOpen] = useState(false);

  const total = checklist.length;
  const done = checklist.filter((c) => c.done).length;
  const people = [
    ...new Set(checklist.map((c) => c.assignee).filter(Boolean) as string[]),
  ];
  // 헤더 요약 한 줄: "2/4 완료 · 정소연 외 2명"
  const summary =
    total > 0
      ? `${done}/${total} 완료` +
        (people.length
          ? ` · ${people[0]}${people.length > 1 ? ` 외 ${people.length - 1}명` : ""}`
          : "")
      : null;

  return (
    <div className="border-t border-foreground/[0.06] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={total === 0}
        className="w-full flex items-center gap-2.5 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50 rounded-lg disabled:cursor-default"
      >
        <TaskMark status={task.status} />
        <span
          className={`text-sm font-medium truncate ${
            task.status === "DONE" ? "text-slate-400" : "text-foreground"
          }`}
        >
          {task.title}
        </span>
        {summary && (
          <span className="ml-auto shrink-0 text-xs text-slate-500 tabular-nums">
            {summary}
          </span>
        )}
        {total > 0 && (
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${
              open ? "rotate-180" : ""
            } ${summary ? "" : "ml-auto"}`}
          />
        )}
      </button>
      {open && total > 0 && (
        <ul className="flex flex-col gap-1.5 pb-3 pl-[26px]">
          {checklist.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span
                className={`shrink-0 w-4 h-4 rounded flex items-center justify-center border ${
                  item.done
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-slate-600"
                }`}
              >
                {item.done && (
                  <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                )}
              </span>
              <span
                className={
                  item.done ? "text-slate-500 line-through" : "text-foreground"
                }
              >
                {item.title}
              </span>
              {item.assignee && (
                <span className="ml-auto shrink-0 text-xs text-slate-500">
                  {item.assignee}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── 연관 문서 한 줄 (Confluence, 기능 근거용 컴팩트 뷰) ── */
function FeatureConfluenceRow({ doc }: { doc: AutoReportConfluenceDoc }) {
  const meta =
    CONFLUENCE_CHANGE_META.find((m) => m.key === doc.change_type) ??
    CONFLUENCE_CHANGE_META[1];
  const deleted = doc.change_type === "deleted";
  const label =
    doc.change_type === "added"
      ? "추가"
      : doc.change_type === "deleted"
        ? "삭제"
        : "수정";
  return (
    <div className="py-3 border-t border-foreground/[0.06] first:border-t-0 flex items-start gap-2.5">
      <span
        className={`shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${meta.pill}`}
      >
        {label}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span
          className={`text-sm font-medium break-words ${
            deleted ? "text-slate-500 line-through" : "text-foreground"
          }`}
        >
          {doc.title}
        </span>
        {(doc.author || doc.updated_at) && (
          <span className="text-xs text-slate-500">
            {[doc.author, doc.updated_at ? formatDate(doc.updated_at) : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        {!deleted && doc.url && (
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-bold text-bridge-secondary hover:underline w-fit"
          >
            Confluence에서 열기
            <ArrowUpRight className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

/* ── 기능 상세 (헤더 + 요약 + 근거: 태스크·체크리스트 / 커밋 / 연관 문서) ── */
function FeatureDetail({ feature }: { feature: AutoReportFeature }) {
  const status = FEATURE_STATUS[feature.status] ?? FEATURE_STATUS.IN_PROGRESS;
  const barColor =
    feature.status === "DONE" ? "bg-emerald-500" : "bg-bridge-accent";
  const assignees = (feature.assignees ?? []).filter(Boolean);
  const tasks = feature.tasks ?? [];
  const commits = feature.commits ?? [];
  const docs = feature.confluence_docs ?? [];

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 + 요약 */}
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

        {/* 기능 요약 — 이 기능에서 그 기간에 실제로 무엇이 만들어졌는지 */}
        {feature.summary && (
          <div className="rounded-xl bg-bridge-accent/[0.06] border border-bridge-accent/20 p-4 flex flex-col gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-bridge-accent">
              <Sparkles className="w-3.5 h-3.5" />
              요약
            </span>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {feature.summary}
            </p>
          </div>
        )}
      </div>

      {/* 근거 1: 연결된 태스크 + 체크리스트 */}
      <EvidenceSection
        icon={<ListChecks className="w-3.5 h-3.5 text-bridge-accent" />}
        label="연결된 태스크"
        count={tasks.length}
        countClass="bg-bridge-accent/15 text-bridge-accent"
      >
        <div className="px-4 pb-2">
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">태스크가 없습니다.</p>
          ) : (
            tasks.map((task, i) => <FeatureTaskRow key={i} task={task} />)
          )}
        </div>
      </EvidenceSection>

      {/* 근거 2: 연결된 커밋 */}
      <EvidenceSection
        icon={<GitCommit className="w-3.5 h-3.5 text-slate-400" />}
        label="연결된 커밋"
        count={commits.length}
        countClass="bg-slate-500/15 text-slate-400"
      >
        <div className="px-4 pb-3 pt-1">
          <CommitList commits={commits} />
        </div>
      </EvidenceSection>

      {/* 근거 3: 연관 문서 (Confluence) — 매칭된 게 있을 때만 */}
      {docs.length > 0 && (
        <EvidenceSection
          icon={<FileText className="w-3.5 h-3.5 text-bridge-secondary" />}
          label="연관 문서"
          count={docs.length}
          countClass="bg-bridge-secondary/15 text-bridge-secondary"
          isNew
        >
          <div className="px-4 pb-2">
            {docs.map((doc, i) => (
              <FeatureConfluenceRow key={i} doc={doc} />
            ))}
          </div>
        </EvidenceSection>
      )}
    </div>
  );
}

/** 그 기간에 변경/추가된 근거가 있는 기능인지 — 백엔드 요약 생성 기준과 동일(커밋·연관 문서·완료 태스크). */
function featureHasEvidence(f: AutoReportFeature): boolean {
  return (
    (f.commits?.length ?? 0) > 0 ||
    (f.confluence_docs?.length ?? 0) > 0 ||
    (f.task_done ?? 0) > 0
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
    // 근거(커밋·문서·완료 태스크) 있는 기능을 앞으로, 미착수 기능은 뒤로. id는 원본 인덱스 기준이라 정렬해도 안정적.
    const indexed = features.map((f, i) => ({
      f,
      i,
      ev: featureHasEvidence(f),
    }));
    const ordered = [
      ...indexed.filter((x) => x.ev),
      ...indexed.filter((x) => !x.ev),
    ];
    const fx: FeatureTabItem[] = ordered.map((x) => ({
      id: `f${x.i}`,
      kind: "feature",
      feature: x.f,
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
  const evidencedItems = featureItems.filter(
    (it) => it.kind === "feature" && featureHasEvidence(it.feature),
  );
  const idleItems = featureItems.filter(
    (it) => it.kind === "feature" && !featureHasEvidence(it.feature),
  );

  const tabClass = (selected: boolean) =>
    `shrink-0 whitespace-nowrap flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
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

  const renderFeatureTab = (it: FeatureTabItem, idle: boolean) => {
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
        className={`${tabClass(selected)}${idle ? " opacity-50" : ""}`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            idle ? "bg-slate-500" : done ? "bg-emerald-500" : "bg-bridge-accent"
          }`}
        />
        {it.feature.name}
        <span className={countClass(selected, true)}>
          {it.feature.task_done}/{it.feature.task_total}
        </span>
      </button>
    );
  };

  const tabDivider = (key: string) => (
    <span
      key={key}
      aria-hidden="true"
      className="shrink-0 w-px self-stretch bg-foreground/[0.08] mx-1.5"
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs md:text-sm font-bold text-foreground">
        기능별 진행 현황
      </h2>

      {/* 가로 스크롤 한 줄 — 근거 있는 기능 앞, 구분선 뒤로 미착수·미매핑 */}
      <div
        role="tablist"
        aria-label="기능 및 커밋 카테고리"
        className="flex items-stretch gap-1 p-1 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] overflow-x-auto custom-scrollbar"
      >
        {evidencedItems.map((it) => renderFeatureTab(it, false))}

        {evidencedItems.length > 0 &&
          idleItems.length > 0 &&
          tabDivider("d-idle")}
        {idleItems.map((it) => renderFeatureTab(it, true))}

        {categoryItems.length > 0 && (
          <>
            {tabDivider("d-cat")}
            <span className="shrink-0 self-center whitespace-nowrap text-xs font-bold uppercase tracking-widest text-slate-600 px-1">
              미매핑 커밋
            </span>
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
          </>
        )}
      </div>

      {/* 선택된 탭의 내용을 하나의 트레이로 묶어 "이 탭의 결과"임을 드러낸다 */}
      <div className="rounded-[18px] border border-foreground/[0.08] bg-foreground/[0.03] p-3">
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
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   커밋-우선 개편: 클러스터 탭 + 구성원 탭
   ══════════════════════════════════════════════════════════════════════ */

/* ── 클러스터가 어떤 신호로 묶였는지 칩 ── */
function ClusterSignalChips({
  signals,
}: {
  signals: AutoReportClusterSignal[];
}) {
  if (signals.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-lg border border-foreground/10 text-slate-400"
        >
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600">
            {s.kind}
          </span>
          <span className="font-mono text-foreground">{s.value}</span>
        </span>
      ))}
    </div>
  );
}

/* ── 클러스터 신뢰도 뱃지 ── */
function ConfidenceBadge({
  confidence,
  kind,
}: {
  confidence: string | null;
  kind: string | null;
}) {
  if (kind === "infra") {
    return (
      <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400">
        귀속 안 함
      </span>
    );
  }
  const high = confidence === "HIGH";
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full ${
        high
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${high ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      신뢰도 {high ? "높음" : "보통"}
    </span>
  );
}

/* ── 클러스터 상세 (헤더 + 요약 + 신호칩 + 근거: 커밋 / 태스크 / 문서) ── */
function ClusterDetail({ cluster }: { cluster: AutoReportCluster }) {
  const commits = cluster.commits ?? [];
  const tasks = cluster.tasks ?? [];
  const docs = cluster.confluence_docs ?? [];
  const signals = cluster.signals ?? [];
  const isInfra = cluster.kind === "infra";

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 + 요약 + 신호 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <h3 className="text-base font-bold text-foreground flex-1">
            {cluster.title}
          </h3>
          <ConfidenceBadge
            confidence={cluster.confidence}
            kind={cluster.kind}
          />
        </div>
        {cluster.summary && (
          <div
            className={
              isInfra
                ? "text-sm text-slate-400 leading-relaxed"
                : "rounded-xl bg-bridge-accent/[0.06] border border-bridge-accent/20 p-4 flex flex-col gap-1.5"
            }
          >
            {!isInfra && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-bridge-accent">
                <Sparkles className="w-3.5 h-3.5" />
                요약
              </span>
            )}
            <p
              className={
                isInfra
                  ? ""
                  : "text-sm text-foreground leading-relaxed whitespace-pre-wrap"
              }
            >
              {cluster.summary}
            </p>
          </div>
        )}
        {!isInfra && signals.length > 0 && (
          <div className="pt-1 border-t border-foreground/[0.06]">
            <ClusterSignalChips signals={signals} />
          </div>
        )}
      </div>

      {/* 근거 1: 커밋 */}
      <EvidenceSection
        icon={<GitCommit className="w-3.5 h-3.5 text-slate-400" />}
        label="커밋"
        count={commits.length}
        countClass="bg-slate-500/15 text-slate-400"
      >
        <div className="px-4 pb-3 pt-1">
          <CommitList commits={commits} />
        </div>
      </EvidenceSection>

      {/* 근거 2: 부착된 태스크 — 있을 때만 */}
      {!isInfra && tasks.length > 0 && (
        <EvidenceSection
          icon={<ListChecks className="w-3.5 h-3.5 text-bridge-accent" />}
          label="연결된 태스크"
          count={tasks.length}
          countClass="bg-bridge-accent/15 text-bridge-accent"
        >
          <div className="px-4 pb-2">
            {tasks.map((task, i) => (
              <FeatureTaskRow key={i} task={task} />
            ))}
          </div>
        </EvidenceSection>
      )}

      {/* 근거 3: 연관 문서 — 있을 때만 */}
      {!isInfra && docs.length > 0 && (
        <EvidenceSection
          icon={<FileText className="w-3.5 h-3.5 text-bridge-secondary" />}
          label="연관 문서"
          count={docs.length}
          countClass="bg-bridge-secondary/15 text-bridge-secondary"
          isNew
        >
          <div className="px-4 pb-2">
            {docs.map((doc, i) => (
              <FeatureConfluenceRow key={i} doc={doc} />
            ))}
          </div>
        </EvidenceSection>
      )}
    </div>
  );
}

/* ── 구성원 뷰: 커밋 한 줄 (소속 클러스터 태그) ── */
function MemberCommitRow({ commit }: { commit: AutoReportMemberCommit }) {
  const type = commit.type ?? "other";
  const typeClass =
    type === "fix"
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      : type === "refactor" || type === "perf"
        ? "bg-bridge-secondary/15 text-bridge-secondary"
        : type === "chore" || type === "ci" || type === "build"
          ? "bg-slate-500/15 text-slate-400"
          : "bg-bridge-accent/15 text-bridge-accent";
  return (
    <div className="py-2.5 border-t border-foreground/[0.06] first:border-t-0 flex items-start gap-2.5">
      <span
        className={`shrink-0 mt-0.5 font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${typeClass}`}
      >
        {type}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {commit.url ? (
          <a
            href={commit.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm text-foreground hover:text-bridge-accent break-words"
          >
            {commit.subject}
          </a>
        ) : (
          <span className="text-sm text-foreground break-words">
            {commit.subject}
          </span>
        )}
        <span className="text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-0.5">
          {commit.sha && (
            <span className="font-mono text-bridge-accent">
              {commit.sha.slice(0, 8)}
            </span>
          )}
          {commit.at && <span>{formatDate(commit.at)}</span>}
          {commit.cluster_title && (
            <span className="text-slate-600">→ {commit.cluster_title}</span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ── 구성원 뷰: 슬랙 메시지 한 줄 (미디어는 상단 "리소스"로 일괄 노출) ── */
function MemberSlackRow({ msg }: { msg: AutoReportMemberSlackMessage }) {
  return (
    <div className="py-2.5 border-t border-foreground/[0.06] first:border-t-0 flex flex-col gap-2">
      <div className="text-sm text-foreground">
        {msg.channel && (
          <span className="font-mono text-xs text-bridge-secondary mr-1.5">
            #{msg.channel}
          </span>
        )}
        {msg.text}
      </div>
    </div>
  );
}

function MemberMediaThumb({ media }: { media: AutoReportAttachment }) {
  const isVideo = media.type === "video";
  const href = isVideo
    ? (media.link ?? media.url ?? undefined)
    : (media.url ?? undefined);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={media.title ?? undefined}
      className="group relative block w-24 aspect-[4/3] rounded-lg overflow-hidden border border-foreground/[0.08] bg-bridge-dark"
    >
      {media.url ? (
        <img
          src={media.url}
          alt={media.title ?? "공유 자료"}
          loading="lazy"
          className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-slate-600">
          <Paperclip className="w-4 h-4" />
        </span>
      )}
      {isVideo && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-black/60">
            <Play
              className="w-3.5 h-3.5 text-white translate-x-[1px]"
              fill="currentColor"
            />
          </span>
        </span>
      )}
    </a>
  );
}

/* ── 담당자 체크리스트 버킷(지연/진행중/오늘 완료) ── */
type ChecklistBucket = "late" | "progress" | "done";

const CHECKLIST_BUCKET_META: Record<
  ChecklistBucket,
  { label: string; text: string; box: string }
> = {
  late: {
    label: "지연",
    text: "text-rose-600 dark:text-rose-400",
    box: "border-rose-500/60",
  },
  progress: {
    label: "진행중",
    text: "text-amber-600 dark:text-amber-400",
    box: "border-amber-500/60",
  },
  done: {
    label: "오늘 완료",
    text: "text-emerald-600 dark:text-emerald-400",
    box: "border-emerald-500",
  },
};

function bucketOf(item: AutoReportMemberChecklistChange): ChecklistBucket {
  const s = item.status;
  if (s === "late" || s === "progress" || s === "done") return s;
  return item.done ? "done" : "progress";
}

function ChecklistBucketRow({
  item,
  bucket,
}: {
  item: AutoReportMemberChecklistChange;
  bucket: ChecklistBucket;
}) {
  const done = bucket === "done";
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? (
        <span className="mt-0.5 shrink-0 w-4 h-4 rounded flex items-center justify-center bg-emerald-500 border border-emerald-500">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
        </span>
      ) : (
        <span
          className={`mt-0.5 shrink-0 w-4 h-4 rounded border ${CHECKLIST_BUCKET_META[bucket].box}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div
          className={done ? "text-slate-400 line-through" : "text-foreground"}
        >
          {item.title}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {item.context && (
            <span className="text-xs text-slate-500 truncate max-w-[60%]">
              {item.context}
            </span>
          )}
          {bucket === "late" && item.due_date && (
            <span className="text-xs text-slate-500">
              마감 {formatDate(item.due_date)}
              {(item.overdue_days ?? 0) > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  {" "}
                  · {item.overdue_days}일 지남
                </span>
              )}
            </span>
          )}
          {bucket === "progress" && item.due_date && (
            <span className="text-xs text-slate-500">
              마감 {formatDate(item.due_date)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

/* ── 구성원 상세 (헤더 + 소스별 활동) ── */
function MemberDetail({ member }: { member: AutoReportMember }) {
  const commits = member.commits ?? [];
  const slack = member.slack_messages ?? [];
  const docs = member.confluence_docs ?? [];
  const checklist = member.checklist_changes ?? [];
  const hex = getAssigneeHex(member.name);
  // 슬랙에 올린 이미지·영상을 한곳에 모아 상단 "리소스"로 일괄 노출한다.
  const resources = slack.flatMap((m) => m.media ?? []);

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 */}
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex items-center gap-3">
        <span
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ backgroundColor: `${hex}33`, color: hex }}
        >
          {getInitials(member.name)}
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-base font-bold text-foreground truncate">
            {member.name}
          </span>
          {member.login && (
            <span className="text-xs text-slate-500 font-mono">
              @{member.login}
            </span>
          )}
        </div>
        <div className="flex gap-3 shrink-0">
          {[
            { n: member.commit_count, c: "커밋" },
            { n: member.slack_count, c: "슬랙" },
            { n: member.checklist_count, c: "체크리스트" },
          ].map((t) => (
            <div key={t.c} className="text-center">
              <div className="text-base font-bold text-foreground tabular-nums">
                {t.n}
              </div>
              <div className="text-[10px] text-slate-500">{t.c}</div>
            </div>
          ))}
        </div>
      </div>

      {/* GitHub 커밋 */}
      <EvidenceSection
        icon={<GitCommit className="w-3.5 h-3.5 text-slate-400" />}
        label="GitHub 커밋"
        count={commits.length}
        countClass="bg-slate-500/15 text-slate-400"
      >
        <div className="px-4 pb-2 pt-1">
          {commits.length === 0 ? (
            <p className="text-xs text-slate-500 py-3">커밋이 없습니다.</p>
          ) : (
            commits.map((c, i) => <MemberCommitRow key={i} commit={c} />)
          )}
        </div>
      </EvidenceSection>

      {/* 리소스 — 슬랙에 올린 이미지·영상 일괄 노출 */}
      {resources.length > 0 && (
        <EvidenceSection
          icon={<Images className="w-3.5 h-3.5 text-bridge-secondary" />}
          label="리소스"
          count={resources.length}
          countClass="bg-bridge-secondary/15 text-bridge-secondary"
        >
          <div className="px-4 py-3 flex flex-wrap gap-2">
            {resources.map((m, i) => (
              <MemberMediaThumb key={i} media={m} />
            ))}
          </div>
        </EvidenceSection>
      )}

      {/* 슬랙 */}
      {slack.length > 0 && (
        <EvidenceSection
          icon={
            <MessagesSquare className="w-3.5 h-3.5 text-bridge-secondary" />
          }
          label="슬랙"
          count={slack.length}
          countClass="bg-bridge-secondary/15 text-bridge-secondary"
        >
          <div className="px-4 pb-2 pt-1">
            {slack.map((m, i) => (
              <MemberSlackRow key={i} msg={m} />
            ))}
          </div>
        </EvidenceSection>
      )}

      {/* Confluence 작성 — 매핑되면 표시(현재는 클러스터 단위에만 붙음) */}
      {docs.length > 0 && (
        <EvidenceSection
          icon={<FileText className="w-3.5 h-3.5 text-bridge-secondary" />}
          label="Confluence"
          count={docs.length}
          countClass="bg-bridge-secondary/15 text-bridge-secondary"
        >
          <div className="px-4 pb-2">
            {docs.map((doc, i) => (
              <FeatureConfluenceRow key={i} doc={doc} />
            ))}
          </div>
        </EvidenceSection>
      )}

      {/* 칸반 체크리스트 — 지연 · 진행중 · 오늘 완료 (이전 완료분은 숨김) */}
      {checklist.length > 0 && (
        <EvidenceSection
          icon={<ListChecks className="w-3.5 h-3.5 text-bridge-accent" />}
          label="칸반 체크리스트"
          count={checklist.length}
          countClass="bg-bridge-accent/15 text-bridge-accent"
        >
          <div className="px-4 py-3 flex flex-col gap-3">
            {(["late", "progress", "done"] as const).map((bucket) => {
              const items = checklist.filter((c) => bucketOf(c) === bucket);
              if (items.length === 0) return null;
              const meta = CHECKLIST_BUCKET_META[bucket];
              return (
                <div key={bucket} className="flex flex-col gap-1.5">
                  <div
                    className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${meta.text}`}
                  >
                    {bucket === "late" && <AlertTriangle className="w-3 h-3" />}
                    {bucket === "progress" && <Clock className="w-3 h-3" />}
                    {bucket === "done" && (
                      <Check className="w-3 h-3" strokeWidth={3} />
                    )}
                    <span>{meta.label}</span>
                    <span className="text-slate-500 tabular-nums">
                      {items.length}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {items.map((item, i) => (
                      <ChecklistBucketRow key={i} item={item} bucket={bucket} />
                    ))}
                  </ul>
                </div>
              );
            })}
            {(member.hidden_completed_count ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 pt-2 border-t border-foreground/[0.06] text-xs text-slate-500">
                <Ban className="w-3 h-3 shrink-0" />
                이전에 완료한 {member.hidden_completed_count}건은 숨김
              </div>
            )}
          </div>
        </EvidenceSection>
      )}
    </div>
  );
}

/** 구성원 탭 식별 키 — 로그인/이름이 겹칠 수 있어 인덱스를 함께 쓴다. */
function memberKey(m: AutoReportMember, i: number): string {
  return `${m.login ?? m.name}#${i}`;
}

/* ══════════════════════════════════════════════════════════════════════
   구조 개편: 탭은 기능별/구성원별 둘로, 원본 소스는 "데이터 출처" 드로어로 분리.
   ══════════════════════════════════════════════════════════════════════ */

/* ── 우측 슬라이드 드로어 — 원본 소스 및 기능/구성원 상세를 같은 껍데기로 보여준다 ── */
function ReportDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-[90] bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed top-0 right-0 bottom-0 z-[100] w-full sm:max-w-md bg-bridge-dark border-l border-foreground/10 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-foreground/[0.08]">
          <h2 className="text-sm font-bold text-foreground truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 w-9 h-9 grid place-items-center rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 flex flex-col gap-4">
          {open && children}
        </div>
      </aside>
    </>,
    document.body,
  );
}

/* ── 원본 소스 패널: GitHub 커밋 ── */
function GithubSourcePanel({
  commitsByRepo,
}: {
  commitsByRepo: Record<string, CommitRow[]>;
}) {
  return (
    <>
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
    </>
  );
}

/* ── 원본 소스 패널: 보드 태스크 ── */
function KanbanSourcePanel({ groups }: { groups: KanbanGroups }) {
  return (
    <>
      {KANBAN_GROUP_META.map(({ key, label, pill }) => {
        const tasks = groups[key];
        if (tasks.length === 0) return null;
        return (
          <div key={key} className="flex flex-col gap-2">
            <span
              className={`self-start text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${pill}`}
            >
              {label} {tasks.length}
            </span>
            {tasks.map((task, i) => (
              <KanbanTaskCard
                key={task.key ?? `${key}-${i}`}
                task={task}
                overdue={key === "overdue"}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

/* ── 원본 소스 패널: Confluence ── */
function ConfluenceSourcePanel({ confluence }: { confluence: ConfluenceData }) {
  return (
    <>
      {confluence.changelogs.map((cl, ci) => {
        const groups = CONFLUENCE_CHANGE_META.filter(
          (g) => (cl[g.key]?.length ?? 0) > 0,
        );
        if (groups.length === 0) return null;
        return (
          <div key={ci} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-bridge-secondary" />
              <h3 className="text-xs md:text-sm font-bold text-foreground">
                문서 변경내역
              </h3>
              {cl.space && (
                <span className="text-xs text-slate-500">{cl.space}</span>
              )}
            </div>
            {groups.map((g) => {
              const docs = cl[g.key] ?? [];
              return (
                <div key={g.key} className="flex flex-col gap-2">
                  <span
                    className={`self-start text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${g.pill}`}
                  >
                    {g.label} {docs.length}
                  </span>
                  {docs.map((doc, di) => (
                    <ConfluenceDocCard
                      key={doc.id ?? `${doc.title}-${di}`}
                      doc={doc}
                      deleted={g.key === "deleted"}
                    />
                  ))}
                </div>
              );
            })}
            {cl.truncated && (
              <span className="text-xs text-slate-600">
                일부 문서는 분량 제한으로 생략됨
              </span>
            )}
          </div>
        );
      })}

      {confluence.pages.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-bridge-secondary" />
            <h3 className="text-xs md:text-sm font-bold text-foreground">
              주간보고 원문
            </h3>
            <span className="text-xs text-slate-500">요약하지 않음</span>
          </div>
          {confluence.pages.map((page, i) => (
            <article
              key={`${page.title}-${i}`}
              className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-bridge-secondary shrink-0" />
                <h4 className="text-sm font-bold text-foreground">
                  {page.title}
                </h4>
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
        </>
      )}
    </>
  );
}

/* ── 원본 소스 패널: 채널 대화(슬랙) ── */
function SlackSourcePanel({ channel }: { channel: SlackChannel }) {
  return (
    <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-4">
      {channel.messages.map((msg, i) => (
        <div
          key={i}
          className={
            i > 0 ? "pt-4 border-t border-foreground/[0.06]" : undefined
          }
        >
          <SlackMessageItem msg={msg} />
        </div>
      ))}
    </div>
  );
}

/* ── 데이터 출처 바: 소스 칩(누르면 드로어) + 원본 소스 볼륨 ── */
function DataSourceBar({
  chips,
  metrics,
}: {
  chips: Array<{
    key: string;
    label: string;
    count: number;
    Icon: LucideIcon;
    onOpen: () => void;
  }>;
  metrics: AutoReportMetric[];
}) {
  if (chips.length === 0 && metrics.length === 0) return null;
  return (
    <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">
        <Database className="w-3.5 h-3.5" />
        데이터 출처
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onOpen}
            className="group inline-flex items-center gap-2 text-xs font-bold text-slate-300 bg-foreground/[0.04] border border-foreground/10 rounded-lg px-2.5 py-1.5 hover:border-bridge-accent hover:text-foreground hover:bg-bridge-accent/10 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            <c.Icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-bridge-accent transition-colors" />
            {c.label}
            <span className="text-xs font-bold px-1.5 rounded-full tabular-nums bg-foreground/[0.06] text-slate-400">
              {c.count}
            </span>
            <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-foreground transition-colors" />
          </button>
        ))}
      </div>
      {metrics.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto pl-1">
          {metrics.map((m) => (
            <span key={m.label} className="inline-flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-slate-500">
                {m.label}
              </span>
              <span className="text-sm font-bold text-slate-300 tabular-nums">
                {m.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── 활동 강도 칩(게이지 X, 상대 강도만) ── */
function ActivityChip({ level }: { level: "hot" | "warm" | "mild" }) {
  const meta =
    level === "hot"
      ? {
          cls: "text-bridge-secondary bg-bridge-secondary/15",
          label: "매우 활발",
        }
      : level === "warm"
        ? {
            cls: "text-teal-600 dark:text-teal-300 bg-foreground/[0.06]",
            label: "활발",
          }
        : { cls: "text-slate-400 bg-foreground/[0.06]", label: "보통" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full ${meta.cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

/* 기능/구성원 공통 카드 껍데기 — 누르면 상세 드로어 */
const ENTRY_CARD_CLASS =
  "group w-full text-left flex items-start gap-3 bg-foreground/[0.03] border border-foreground/[0.08] rounded-2xl p-4 hover:border-foreground/[0.12] hover:bg-foreground/[0.05] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-bridge-accent/50";

/* 카드 하단 수치 칩 (커밋/파일/문서 등) */
function SignalChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-foreground/[0.04] border border-foreground/10 rounded-lg px-2 py-0.5">
      {label}
      <b className="text-slate-300 font-bold tabular-nums">{value}</b>
    </span>
  );
}

/* ── 기능별 진행 현황: 활동 강도 순 카드 목록 ── */
function ClusterCards({
  clusters,
  onOpen,
}: {
  clusters: AutoReportCluster[];
  onOpen: (c: AutoReportCluster) => void;
}) {
  const ordered = useMemo(() => {
    const feature = clusters
      .filter((c) => c.kind !== "infra")
      .sort((a, b) => (b.commits?.length ?? 0) - (a.commits?.length ?? 0));
    const infra = clusters.filter((c) => c.kind === "infra");
    return [...feature, ...infra];
  }, [clusters]);
  const maxCommits = Math.max(1, ...ordered.map((c) => c.commits?.length ?? 0));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-xs md:text-sm font-bold text-foreground">
          기능별 진행 현황
        </h2>
        <span className="text-xs text-slate-500">
          커밋을 {clusters.length}개 기능군으로 분류 · 활동 강도 순
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {ordered.map((cluster, i) => {
          const commits = cluster.commits ?? [];
          const tasks = cluster.tasks ?? [];
          const docs = cluster.confluence_docs ?? [];
          const isInfra = cluster.kind === "infra";
          const ratio = commits.length / maxCommits;
          const level = ratio >= 0.66 ? "hot" : ratio >= 0.33 ? "warm" : "mild";
          return (
            <button
              key={cluster.key}
              type="button"
              onClick={() => onOpen(cluster)}
              className={ENTRY_CARD_CLASS}
            >
              <span className="shrink-0 w-6 h-6 grid place-items-center rounded-lg text-xs font-bold tabular-nums text-slate-400 bg-foreground/[0.06] border border-foreground/[0.08]">
                {isInfra ? "·" : i + 1}
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground">
                      {cluster.title}
                    </div>
                    {cluster.summary && (
                      <div className="text-xs text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {cluster.summary}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 mt-0.5 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {!isInfra && (
                    <ActivityChip level={level as "hot" | "warm" | "mild"} />
                  )}
                  <ConfidenceBadge
                    confidence={cluster.confidence}
                    kind={cluster.kind}
                  />
                  <span className="w-px h-3 bg-foreground/10 mx-0.5" />
                  <SignalChip label="커밋" value={commits.length} />
                  {tasks.length > 0 && (
                    <SignalChip label="태스크" value={tasks.length} />
                  )}
                  {docs.length > 0 && (
                    <SignalChip label="문서" value={docs.length} />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 구성원별 활동: 활동량 순 카드 목록 ── */
/* 구성원 상태 칩 — 완료/진행/지연을 색으로 인코딩(지연=주의). 커밋 시각 분포보다 훨씬 행동가능한 신호 */
function StatusChip({
  tone,
  label,
  n,
}: {
  tone: "done" | "progress" | "late";
  label: string;
  n: number;
}) {
  const cls =
    tone === "done"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15"
      : tone === "progress"
        ? "text-bridge-secondary bg-bridge-secondary/15"
        : "text-amber-600 dark:text-amber-400 bg-amber-500/15";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label} {n}
    </span>
  );
}

function MemberCards({
  members,
  onOpen,
}: {
  members: AutoReportMember[];
  onOpen: (m: AutoReportMember) => void;
}) {
  const ordered = useMemo(
    () => [...members].sort((a, b) => b.activity - a.activity),
    [members],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-xs md:text-sm font-bold text-foreground">
          구성원별 활동
        </h2>
        <span className="text-xs text-slate-500">
          깃 · 슬랙 · 칸반을 사람 기준으로 · 활동량 순
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {ordered.map((member, i) => (
          <MemberCard
            key={memberKey(member, i)}
            member={member}
            onOpen={() => onOpen(member)}
          />
        ))}
      </div>
    </div>
  );
}

function MemberCard({
  member,
  onOpen,
}: {
  member: AutoReportMember;
  onOpen: () => void;
}) {
  const hex = getAssigneeHex(member.name);
  const doneToday = member.done_today_count ?? 0;
  const progress = member.progress_count ?? 0;
  const late = member.late_count ?? 0;
  const hasStatus = doneToday > 0 || progress > 0 || late > 0;
  const topCluster = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of member.commits ?? []) {
      if (c.cluster_title)
        freq.set(c.cluster_title, (freq.get(c.cluster_title) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [title, n] of freq) {
      if (n > bestN) {
        best = title;
        bestN = n;
      }
    }
    return best;
  }, [member]);

  return (
    <button type="button" onClick={onOpen} className={ENTRY_CARD_CLASS}>
      <span
        className="shrink-0 w-9 h-9 rounded-xl grid place-items-center text-xs font-bold"
        style={{ backgroundColor: `${hex}33`, color: hex }}
      >
        {getInitials(member.name)}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-baseline gap-2">
            <span className="text-sm font-bold text-foreground truncate shrink-0 max-w-[50%]">
              {member.name}
            </span>
            {topCluster && (
              <span className="text-xs text-slate-400 truncate min-w-0">
                주력: {topCluster}
              </span>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 상태 — 이 사람이 지금 어디 서 있나(가장 행동가능한 신호) */}
          {hasStatus ? (
            <>
              {doneToday > 0 && (
                <StatusChip tone="done" label="완료" n={doneToday} />
              )}
              {progress > 0 && (
                <StatusChip tone="progress" label="진행" n={progress} />
              )}
              {late > 0 && <StatusChip tone="late" label="지연" n={late} />}
              <span className="w-px h-3 bg-foreground/10 mx-0.5" />
            </>
          ) : null}
          <SignalChip label="커밋" value={member.commit_count} />
          <SignalChip label="슬랙" value={member.slack_count} />
          {member.doc_count > 0 && (
            <SignalChip label="문서" value={member.doc_count} />
          )}
        </div>
      </div>
    </button>
  );
}

type TabKey = "changes" | "features" | "members";

/**
 * 자동 보고서 본문 렌더러. 발행된 공유 페이지({@link AutoReportPage})와 설정 화면의
 * 렌더링 미리보기 모달이 <b>같은 컴포넌트</b>를 써서 발송본과 미리보기가 어긋나지 않게 한다.
 *
 * <p>내용은 요약과 소스별 탭으로 나뉜다: <b>요약</b>(스프린트·기능별 진행·리드·지표·확인 필요),
 * <b>GitHub</b>(수집한 커밋), <b>보드 태스크</b>(칸반 완료/진행/지연 + 체크리스트),
 * <b>Confluence</b>(주간보고 원문), <b>채널 대화</b>(슬랙 스레드·리액션·첨부). 각 소스는
 * 데이터가 있을 때만 탭으로 노출된다.
 */
export function AutoReportView({
  report,
  className,
}: {
  report: AutoReport;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<TabKey>("changes");
  const [drawer, setDrawer] = useState<{
    title: string;
    body: ReactNode;
  } | null>(null);

  const commitsByRepo = useMemo(
    () => parseCommits(report.raw_data ?? null),
    [report],
  );
  const kanbanGroups = useMemo(
    () => parseKanban(report.raw_data ?? null),
    [report],
  );
  const confluence = useMemo(
    () => parseConfluence(report.raw_data ?? null),
    [report],
  );
  const slackChannel = useMemo(
    () => parseSlack(report.raw_data ?? null),
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
  const kanbanCount = useMemo(
    () =>
      kanbanGroups.completed.length +
      kanbanGroups.in_progress.length +
      kanbanGroups.overdue.length,
    [kanbanGroups],
  );
  const slackCount = slackChannel
    ? (slackChannel.message_count ?? slackChannel.messages.length)
    : 0;
  const confluenceCount = useMemo(
    () =>
      confluence.pages.length +
      confluence.changelogs.reduce(
        (sum, cl) =>
          sum +
          (cl.added?.length ?? 0) +
          (cl.modified?.length ?? 0) +
          (cl.deleted?.length ?? 0),
        0,
      ),
    [confluence],
  );

  const clusters = content?.clusters ?? [];
  const features = content?.features ?? [];
  const members = content?.members ?? [];
  const highlights = content?.highlights ?? [];
  const risks = content?.risks ?? [];
  const hasFeatures = clusters.length > 0 || features.length > 0;
  const hasMembers = members.length > 0;
  const hasChanges = highlights.length > 0 || risks.length > 0;

  const tabs = useMemo(() => {
    const list: Array<{ key: TabKey; label: string; count: number }> = [];
    if (hasChanges)
      list.push({
        key: "changes",
        label: "주요 변화",
        count: highlights.length || risks.length,
      });
    if (hasFeatures)
      list.push({
        key: "features",
        label: "기능별 진행 현황",
        count: clusters.length > 0 ? clusters.length : features.length,
      });
    if (hasMembers)
      list.push({
        key: "members",
        label: "구성원별 활동",
        count: members.length,
      });
    return list;
  }, [
    hasChanges,
    hasFeatures,
    hasMembers,
    highlights.length,
    risks.length,
    clusters.length,
    features.length,
    members.length,
  ]);

  const activeTab = tabs.some((t) => t.key === tab)
    ? tab
    : (tabs[0]?.key ?? "features");

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
    setTab(tabs[next].key);
  };

  // 원본 소스 칩 — 누르면 우측 드로어로 해당 소스 원본을 연다.
  const sourceChips: Array<{
    key: string;
    label: string;
    count: number;
    Icon: LucideIcon;
    onOpen: () => void;
  }> = [];
  if (commitCount > 0)
    sourceChips.push({
      key: "github",
      label: "GitHub",
      count: commitCount,
      Icon: GitCommit,
      onOpen: () =>
        setDrawer({
          title: "GitHub 커밋",
          body: <GithubSourcePanel commitsByRepo={commitsByRepo} />,
        }),
    });
  if (kanbanCount > 0)
    sourceChips.push({
      key: "kanban",
      label: "보드 태스크",
      count: kanbanCount,
      Icon: Columns3,
      onOpen: () =>
        setDrawer({
          title: "보드 태스크",
          body: <KanbanSourcePanel groups={kanbanGroups} />,
        }),
    });
  if (confluenceCount > 0)
    sourceChips.push({
      key: "confluence",
      label: "Confluence",
      count: confluenceCount,
      Icon: FileText,
      onOpen: () =>
        setDrawer({
          title: "Confluence",
          body: <ConfluenceSourcePanel confluence={confluence} />,
        }),
    });
  if (slackCount > 0 && slackChannel)
    sourceChips.push({
      key: "slack",
      label: "채널 대화",
      count: slackCount,
      Icon: MessagesSquare,
      onOpen: () =>
        setDrawer({
          title: slackChannel.channel_name
            ? `채널 대화 · #${slackChannel.channel_name}`
            : "채널 대화",
          body: <SlackSourcePanel channel={slackChannel} />,
        }),
    });

  const openCluster = (c: AutoReportCluster) =>
    setDrawer({ title: c.title, body: <ClusterDetail cluster={c} /> });
  const openMember = (m: AutoReportMember) =>
    setDrawer({ title: m.name, body: <MemberDetail member={m} /> });

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

      {/* 데이터 출처 (원본 소스 분리) */}
      <DataSourceBar chips={sourceChips} metrics={content?.metrics ?? []} />

      {/* 종합 개요 (탭 위 상시 노출) */}
      <div className="flex flex-col gap-6">
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

        {/* 스프린트 진행 현황 — 진짜 분모가 있는 유일한 진행률 게이지 */}
        {content?.sprint && <SprintBar sprint={content.sprint} />}

        {/* 리드 */}
        {content?.lede && (
          <p className="text-base font-normal leading-relaxed text-foreground border-l-2 border-bridge-accent pl-4">
            {content.lede}
          </p>
        )}
      </div>

      {/* 탭 바 (기능별 / 구성원별) */}
      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label="보고서 섹션"
          className="flex gap-1 p-1 rounded-xl bg-foreground/[0.03] border border-foreground/[0.08] overflow-x-auto"
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
                <span
                  className={`text-xs font-bold px-1.5 rounded-full tabular-nums ${
                    selected
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "bg-foreground/[0.06] text-slate-500"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 탭 내용 — 주요 변화 */}
      {activeTab === "changes" && hasChanges && (
        <motion.div key="changes" {...fade} className="flex flex-col gap-6">
          {highlights.length > 0 && (
            <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5 flex flex-col gap-3">
              <h2 className="text-xs md:text-sm font-bold text-foreground">
                주요 변화
              </h2>
              <ul className="flex flex-col gap-2">
                {highlights.map((item, index) => (
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

          {risks.length > 0 && (
            <section className="bg-bridge-obsidian rounded-2xl border border-amber-500/25 p-5 flex flex-col gap-3">
              <h2 className="text-xs md:text-sm font-bold text-amber-500 uppercase tracking-widest">
                확인 필요
              </h2>
              <ul className="flex flex-col gap-2">
                {risks.map((risk, index) => (
                  <li key={index} className="flex gap-2 text-sm text-slate-400">
                    <span className="text-amber-500">•</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </motion.div>
      )}

      {/* 탭 내용 — 기능별 */}
      {activeTab === "features" && hasFeatures && (
        <motion.div key="features" {...fade}>
          {clusters.length > 0 ? (
            <ClusterCards clusters={clusters} onOpen={openCluster} />
          ) : (
            <FeatureProgressTabs
              features={features}
              categories={content?.commit_categories ?? []}
            />
          )}
        </motion.div>
      )}

      {/* 탭 내용 — 구성원별 */}
      {activeTab === "members" && hasMembers && (
        <motion.div key="members" {...fade}>
          <MemberCards members={members} onOpen={openMember} />
        </motion.div>
      )}

      {/* 구조화 콘텐츠가 없는 옛 보고서: 섹션·공유자료·마크다운 폴백 */}
      {clusters.length === 0 && (
        <motion.div key="legacy" {...fade} className="flex flex-col gap-6">
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
                      <a
                        href={att.link ?? att.url ?? undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="슬랙에서 영상 보기"
                        className="group relative block w-full aspect-video bg-black"
                      >
                        {att.url ? (
                          <img
                            src={att.url}
                            alt={att.title ?? "공유된 영상"}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                          />
                        ) : null}
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm">
                            <Play
                              className="w-5 h-5 text-white translate-x-[1px]"
                              fill="currentColor"
                            />
                          </span>
                        </span>
                      </a>
                    ) : (
                      <a
                        href={att.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={att.url ?? undefined}
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

          {!content && report.markdown && (
            <section className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-5">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {report.markdown}
              </p>
            </section>
          )}
        </motion.div>
      )}

      {/* 원본 소스 · 상세 드로어 */}
      <ReportDrawer
        open={drawer !== null}
        title={drawer?.title ?? ""}
        onClose={() => setDrawer(null)}
      >
        {drawer?.body}
      </ReportDrawer>

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
