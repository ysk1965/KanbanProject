import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, History, Loader2 } from "lucide-react";

import {
  autoReportAPI,
  type ReportDeliveryLog,
  type ReportDeliveryLogPage,
} from "../../utils/api";
import { formatDateTimeShort, formatRelativeTime } from "../../utils/dateUtils";

const PAGE_SIZE = 5;
/** 진행 상황(발송 중)을 따라잡기 위한 폴링 간격 — 패널이 열려 있을 때만 돈다 */
const POLL_MS = 5000;

const SOURCE_LABEL: Record<string, string> = {
  GITHUB: "GitHub",
  KANBAN: "칸반",
  CONFLUENCE: "Confluence",
  SLACK: "Slack",
};

type StatusMeta = { label: string; cls: string };

const STATUS_META: Record<string, StatusMeta> = {
  RUNNING: { label: "발송 중", cls: "bg-bridge-accent/15 text-bridge-accent" },
  SUCCESS: {
    label: "성공",
    cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  PARTIAL: {
    label: "부분",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  FAILED: {
    label: "실패",
    cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  },
  SKIPPED: { label: "건너뜀", cls: "bg-foreground/[0.06] text-slate-400" },
};

function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status,
      cls: "bg-foreground/[0.06] text-slate-400",
    }
  );
}

interface DeliveryHistoryPanelProps {
  boardId: string;
}

/**
 * 발송 이력 드롭다운 — 크론이 언제 돌아 성공·실패·건너뜀·진행 중 어느 상태로 끝났는지.
 * 기본은 닫혀 있고, 접힌 헤더에 마지막 발송 상태를 요약해 보여준다. 펼치면 최근순
 * 페이지네이션 목록. 열려 있는 동안 폴링해 "발송 중"이 최종 상태로 바뀌는 것을 따라간다.
 * 관리자에게만 보이도록 상위(ReportGallery)에서 렌더를 제어한다.
 */
export function DeliveryHistoryPanel({ boardId }: DeliveryHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ReportDeliveryLogPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: number, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await autoReportAPI.listDeliveryLogs(boardId, p, PAGE_SIZE);
        setData(res);
        setError(null);
      } catch {
        setError("발송 이력을 불러오지 못했습니다.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [boardId],
  );

  // 마운트 시 + 페이지 이동 시 로드 (마운트에서 page=0 → 접힌 헤더 요약도 채워진다)
  useEffect(() => {
    void load(page);
  }, [load, page]);

  // 열려 있는 동안만 폴링 — 발송 중 → 최종 상태 전환, 새로 시작된 발송을 따라잡는다
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void load(page, true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, page, load]);

  const latest = data?.items?.[0] ?? null;
  const totalPages = data?.total_pages ?? 0;

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, i) => i),
    [totalPages],
  );

  return (
    <div className="relative overflow-hidden rounded-2xl bg-bridge-obsidian border border-foreground/[0.08]">
      {/* Top Accent Line */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

      {/* 헤더 (클릭으로 펼치기) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-bridge-accent/15 text-bridge-accent">
          <History className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">
            발송 이력
          </span>
          <span className="block text-xs text-slate-500 mt-0.5">
            크론이 매분 스케줄을 확인해 발송합니다 · 성공·실패·진행 상황을
            확인하세요.
          </span>
        </span>

        {/* 접힌 상태 요약: 마지막 발송 */}
        <span className="hidden sm:flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">마지막 발송</span>
          {latest ? (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full ${statusMeta(latest.status).cls}`}
            >
              {latest.status === "RUNNING" && (
                <Loader2 className="w-3 h-3 animate-spin" />
              )}
              {statusMeta(latest.status).label}
              <span className="font-normal opacity-70">
                · {formatRelativeTime(latest.created_at)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-slate-500">기록 없음</span>
          )}
        </span>

        <ChevronDown
          className={`w-[18px] h-[18px] text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* 펼친 본문 */}
      {open && (
        <div className="border-t border-foreground/[0.06]">
          {loading && !data ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 m-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="text-xs text-rose-500">{error}</span>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <History className="w-8 h-8 text-slate-600" />
              <p className="text-xs text-slate-500">아직 발송 시도가 없어요.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col">
                {data.items.map((log) => (
                  <DeliveryRow key={log.id} log={log} />
                ))}
              </div>

              {/* 페이저 */}
              <div className="flex items-center gap-2 px-4 py-3 border-t border-foreground/[0.06]">
                <span className="text-xs text-slate-500 mr-auto tabular-nums">
                  총 {data.total_elements}건 · {data.page * PAGE_SIZE + 1}–
                  {data.page * PAGE_SIZE + data.items.length} 표시
                </span>
                <div className="inline-flex gap-1 items-center">
                  <PagerButton
                    disabled={data.page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    aria-label="이전 페이지"
                  >
                    ‹
                  </PagerButton>
                  {pageNumbers.map((n) => (
                    <PagerButton
                      key={n}
                      active={n === data.page}
                      onClick={() => setPage(n)}
                    >
                      {n + 1}
                    </PagerButton>
                  ))}
                  <PagerButton
                    disabled={!data.has_next}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="다음 페이지"
                  >
                    ›
                  </PagerButton>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DeliveryRow({ log }: { log: ReportDeliveryLog }) {
  const meta = statusMeta(log.status);
  const isWeekly = log.report_type === "WEEKLY_INTEGRATED";
  const sources = log.source_status ?? [];
  const running = log.status === "RUNNING";

  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-4 py-3 border-t border-foreground/[0.06] first:border-t-0">
      <span
        className={`inline-flex items-center gap-1.5 justify-center text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${meta.cls}`}
      >
        {running && <Loader2 className="w-3 h-3 animate-spin" />}
        {meta.label}
      </span>
      <span
        className={`text-xs font-bold px-2 py-0.5 rounded-full text-center ${
          isWeekly
            ? "bg-bridge-secondary/15 text-bridge-secondary"
            : "bg-bridge-accent/15 text-bridge-accent"
        }`}
      >
        {isWeekly ? "주간" : "일일"}
      </span>

      <div className="min-w-0">
        <div className="text-sm text-foreground">{rowMessage(log)}</div>
        {sources.length > 0 && (
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1">
            {sources.map((s, i) => (
              <span
                key={`${s.source}-${i}`}
                className="inline-flex items-center gap-1 text-xs text-slate-500"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${s.success ? "bg-emerald-400" : "bg-rose-400"}`}
                />
                {SOURCE_LABEL[s.source] ?? s.source}
                {!s.success && s.error ? ` (${s.error})` : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 text-right whitespace-nowrap">
        <span className="block text-slate-400 font-medium tabular-nums">
          {formatDateTimeShort(log.created_at)}
        </span>
        {formatRelativeTime(log.created_at)}
      </div>
    </div>
  );
}

/** 상태에 맞는 한 줄 설명 — 실패면 사유를, 성공/건너뜀이면 담백한 문구를 보여준다. */
function rowMessage(log: ReportDeliveryLog): string {
  if (log.status === "RUNNING") {
    return "보고서를 수집·작성·게시하는 중입니다…";
  }
  if (log.error_message) {
    return log.error_message;
  }
  const kind =
    log.report_type === "WEEKLY_INTEGRATED" ? "주간 통합" : "일일 개발";
  if (log.status === "SKIPPED") {
    return "기간 내 활동이 없어 이번 발송을 건너뛰었습니다.";
  }
  return `${kind} 보고서 발송 완료`;
}

export function PagerButton({
  children,
  active,
  disabled,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-w-[30px] h-[30px] px-2 grid place-items-center rounded-lg text-xs font-bold tabular-nums transition-colors disabled:opacity-40 disabled:cursor-default ${
        active
          ? "bg-bridge-accent/15 border border-bridge-accent/40 text-bridge-accent"
          : "bg-foreground/5 border border-foreground/10 text-slate-400 hover:text-foreground hover:bg-foreground/10"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
