import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, FileText, Loader2, Search, X } from "lucide-react";

import { autoReportAPI, type AutoReport } from "../../utils/api";
import { formatDate, formatRelativeTime } from "../../utils/dateUtils";
import { AutoReportView } from "../AutoReportView";
import { MotionModal } from "../ui/MotionModal";
import { ReportThumbnail, fetchReportBody } from "./ReportThumbnail";

type Filter = "all" | "daily" | "weekly";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "daily", label: "일일" },
  { key: "weekly", label: "주간" },
];

const SOURCE_LABEL: Record<string, string> = {
  GITHUB: "GitHub",
  KANBAN: "칸반",
  CONFLUENCE: "Confluence",
};

interface ReportGalleryProps {
  boardId: string;
  /** 목록 로드 후 상위(BoardReportSpace)가 보관 건수를 표시하도록 알린다 */
  onLoaded?: (reports: AutoReport[]) => void;
}

/**
 * 스토리지 보고서 탭의 본체 — 발행된 HTML 보고서를 카드 갤러리로 모아 보여준다.
 * 카드 썸네일은 실제 본문을 축소 렌더하고, 카드를 열면 전체 본문을 모달로 띄운다.
 */
export function ReportGallery({ boardId, onLoaded }: ReportGalleryProps) {
  const [reports, setReports] = useState<AutoReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<AutoReport | null>(null);
  const [detail, setDetail] = useState<AutoReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await autoReportAPI.list(boardId, 50);
      setReports(list);
      onLoaded?.(list);
    } catch {
      setError("보고서 목록을 불러오지 못했습니다.");
      setReports([]);
      onLoaded?.([]);
    }
  }, [boardId, onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReport = useCallback(
    async (report: AutoReport) => {
      setSelected(report);
      setDetail(null);
      setDetailError(null);
      setDetailLoading(true);
      try {
        setDetail(await fetchReportBody(boardId, report.id));
      } catch {
        setDetailError("보고서를 불러오지 못했습니다.");
      } finally {
        setDetailLoading(false);
      }
    },
    [boardId],
  );

  const filtered = useMemo(() => {
    if (!reports) return [];
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      const isWeekly = r.report_type === "WEEKLY_INTEGRATED";
      if (filter === "daily" && isWeekly) return false;
      if (filter === "weekly" && !isWeekly) return false;
      if (!q) return true;
      const haystack = [
        isWeekly ? "주간 통합 보고서" : "일일 개발 보고서",
        r.period_start,
        r.period_end,
        r.board_name,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [reports, filter, query]);

  if (reports === null) {
    return (
      <div className="flex items-center justify-center min-h-[240px]">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 툴바: 필터 + 검색 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex gap-0.5 p-0.5 rounded-xl bg-bridge-obsidian border border-foreground/[0.08]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filter === f.key
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-slate-400 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="보고서 검색"
            className="w-full sm:w-56 bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 pl-9 pr-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="text-xs text-rose-500">{error}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center min-h-[240px] text-center gap-3"
        >
          <FileText className="w-12 h-12 text-slate-600" />
          <div>
            <p className="text-sm font-bold text-foreground">
              {reports.length === 0
                ? "아직 발행된 보고서가 없어요"
                : "조건에 맞는 보고서가 없어요"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {reports.length === 0
                ? "일일·주간 보고서가 발행되면 여기에 HTML로 쌓입니다."
                : "필터나 검색어를 바꿔 보세요."}
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((report, index) => (
            <ReportCard
              key={report.id}
              boardId={boardId}
              report={report}
              index={index}
              onOpen={() => openReport(report)}
            />
          ))}
        </div>
      )}

      {/* 상세 모달 */}
      <MotionModal
        open={selected !== null}
        onClose={() => setSelected(null)}
        className="sm:max-w-3xl"
        accentColor
        aria-label="보고서 자세히 보기"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <FileText className="w-4 h-4 text-bridge-accent" />
          <span className="text-sm font-bold text-foreground flex-1">
            {selected?.report_type === "WEEKLY_INTEGRATED"
              ? "주간 통합 보고서"
              : "일일 개발 보고서"}
          </span>
          <button
            onClick={() => setSelected(null)}
            aria-label="닫기"
            className="text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-bridge-dark max-h-[70vh] overflow-y-auto custom-scrollbar">
          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
            </div>
          ) : detailError ? (
            <div className="flex flex-col items-center gap-2 py-16 px-5 text-center">
              <AlertCircle className="w-6 h-6 text-rose-500" />
              <span className="text-xs text-slate-400">{detailError}</span>
            </div>
          ) : detail ? (
            <AutoReportView
              report={detail}
              className="px-5 py-6 flex flex-col gap-5"
            />
          ) : null}
        </div>
      </MotionModal>
    </div>
  );
}

function ReportCard({
  boardId,
  report,
  index,
  onOpen,
}: {
  boardId: string;
  report: AutoReport;
  index: number;
  onOpen: () => void;
}) {
  const isWeekly = report.report_type === "WEEKLY_INTEGRATED";
  const sources = (report.source_status ?? []).filter((s) => s.has_data);
  const hasFailure = (report.source_status ?? []).some((s) => !s.success);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="text-left bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] hover:border-bridge-border overflow-hidden transition-colors"
    >
      <ReportThumbnail boardId={boardId} report={report} />
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              isWeekly
                ? "bg-bridge-secondary/15 text-bridge-secondary"
                : "bg-bridge-accent/15 text-bridge-accent"
            }`}
          >
            {isWeekly ? "주간" : "일일"}
          </span>
          {report.created_at && (
            <span className="ml-auto text-xs text-slate-500">
              {formatRelativeTime(report.created_at)}
            </span>
          )}
        </div>
        <div className="text-sm font-bold text-foreground truncate">
          {isWeekly ? "주간 통합 보고서" : "일일 개발 보고서"}
        </div>
        <div className="text-xs text-slate-500">
          {formatDate(report.period_start)} ~ {formatDate(report.period_end)}
        </div>
        {(sources.length > 0 || hasFailure) && (
          <div className="flex items-center gap-1 flex-wrap">
            {sources.map((s) => (
              <span
                key={s.source}
                className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-foreground/[0.06] text-slate-400"
              >
                {SOURCE_LABEL[s.source] ?? s.source}
              </span>
            ))}
            {hasFailure && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                일부 실패
              </span>
            )}
          </div>
        )}
      </div>
    </motion.button>
  );
}
