import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  FileText,
  Loader2,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";

import {
  autoReportAPI,
  type AutoReport,
  type ReportConfig,
} from "../../utils/api";
import { formatDate, formatRelativeTime } from "../../utils/dateUtils";
import { AutoReportView } from "../AutoReportView";
import { IconButton } from "../ui/IconButton";
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

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const pad2 = (n: number) => String(n).padStart(2, "0");

interface ReportGalleryProps {
  boardId: string;
  /** 관리자만 보고서를 삭제할 수 있다 */
  canManage?: boolean;
  /** 상단 설정 배너에 발송·소스 연결 현황을 채우는 설정값 */
  config?: ReportConfig | null;
  /** 설정 배너의 '설정 열기'가 상위(BoardReportSpace)의 설정 모달을 연다 */
  onOpenSettings?: () => void;
  /** 목록 로드 후 상위(BoardReportSpace)가 보관 건수를 표시하도록 알린다 */
  onLoaded?: (reports: AutoReport[]) => void;
}

/**
 * 스토리지 보고서 탭의 본체 — 발행된 HTML 보고서를 카드 갤러리로 모아 보여준다.
 * 카드 썸네일은 실제 본문을 축소 렌더하고, 카드를 열면 전체 본문을 모달로 띄운다.
 */
export function ReportGallery({
  boardId,
  canManage = false,
  config,
  onOpenSettings,
  onLoaded,
}: ReportGalleryProps) {
  const [reports, setReports] = useState<AutoReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<AutoReport | null>(null);
  const [detail, setDetail] = useState<AutoReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<AutoReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await autoReportAPI.remove(boardId, pendingDelete.id);
      setReports((prev) => {
        const next = (prev ?? []).filter((r) => r.id !== pendingDelete.id);
        onLoaded?.(next);
        return next;
      });
      // 삭제한 보고서가 열려 있으면 상세 모달도 닫는다
      setSelected((cur) => (cur?.id === pendingDelete.id ? null : cur));
      setPendingDelete(null);
    } catch {
      setDeleteError("보고서를 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, boardId, onLoaded]);

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

  return (
    <div className="flex flex-col gap-4">
      {onOpenSettings && (
        <SettingsBanner
          config={config ?? null}
          onOpenSettings={onOpenSettings}
        />
      )}

      {reports === null && (
        <div className="flex items-center justify-center min-h-[240px]">
          <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
        </div>
      )}

      {reports !== null && (
        <>
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
                  canManage={canManage}
                  onOpen={() => openReport(report)}
                  onDelete={() => {
                    setDeleteError(null);
                    setPendingDelete(report);
                  }}
                />
              ))}
            </div>
          )}
        </>
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

      {/* 삭제 확인 모달 */}
      <MotionModal
        open={pendingDelete !== null}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        className="sm:max-w-sm"
        aria-label="보고서 삭제 확인"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <Trash2 className="w-4 h-4 text-rose-500" />
          <span className="text-sm font-bold text-foreground flex-1">
            보고서 삭제
          </span>
        </div>
        <div className="px-5 pb-5 pt-4 flex flex-col gap-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            이 보고서를 삭제하면 되돌릴 수 없어요. 보관된 HTML 본문이 영구
            삭제됩니다.
          </p>
          {deleteError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="text-xs text-rose-500">{deleteError}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-all disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-500 hover:bg-rose-500/90 transition-all disabled:opacity-50"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              삭제
            </button>
          </div>
        </div>
      </MotionModal>
    </div>
  );
}

/**
 * 검색 툴바 위에 항상 떠 있는 설정 숏컷 배너.
 * 발송 스케줄(일일·주간)과 소스 연결(칸반·GitHub·Confluence·Slack) 현황을
 * 상태 칩으로 한 줄에 담아, '설정 열기' 전에도 현황을 한눈에 보여준다.
 */
function SettingsBanner({
  config,
  onOpenSettings,
}: {
  config: ReportConfig | null;
  onOpenSettings: () => void;
}) {
  const sources: Array<{ label: string; on: boolean }> = [
    { label: "칸반", on: config?.source_kanban_enabled ?? false },
    { label: "GitHub", on: config?.source_github_enabled ?? false },
    { label: "Confluence", on: config?.source_confluence_enabled ?? false },
    { label: "Slack", on: config?.source_slack_enabled ?? false },
  ];

  const dailyLabel = config?.daily_enabled
    ? `${pad2(config.daily_hour)}:${pad2(config.daily_minute)}`
    : "꺼짐";
  const weeklyLabel = config?.weekly_enabled
    ? `${DAY_LABELS[(config.weekly_day_of_week - 1 + 7) % 7]} ${pad2(
        config.weekly_hour,
      )}:${pad2(config.weekly_minute)}`
    : "꺼짐";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-bridge-obsidian border border-foreground/[0.08]">
      {/* Top Accent Line */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
      <div className="flex items-center gap-4 px-4 py-3.5">
        <div className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-bridge-accent/15 text-bridge-accent">
          <Settings className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground">
            보고서 발송 · 소스 연결 설정
          </div>
          {config ? (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {sources.map((s) => (
                <SourceChip key={s.label} label={s.label} on={s.on} />
              ))}
              <span className="w-px h-4 bg-foreground/10 mx-0.5" />
              <ScheduleChip label="일일" value={dailyLabel} />
              <ScheduleChip label="주간" value={weeklyLabel} />
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate-500">
              스케줄, GitHub · Confluence · Slack 연결을 한 곳에서 관리합니다.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-haspopup="dialog"
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 hover:shadow-[0_0_22px_rgba(99,102,241,0.3)] transition-all"
        >
          설정 열기
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/** 소스 연결 칩 — 켜짐(포함) emerald, 꺼짐(제외) amber 점으로 상태 표시 */
function SourceChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-xs font-bold text-slate-300 bg-foreground/[0.06] border border-foreground/[0.08]">
      <span
        className={`w-1.5 h-1.5 rounded-full ${on ? "bg-emerald-400" : "bg-amber-400"}`}
      />
      {label}
    </span>
  );
}

/** 발송 스케줄 칩 — 라벨(일일/주간) + 발송 시각 또는 '꺼짐' */
function ScheduleChip({ label, value }: { label: string; value: string }) {
  const off = value === "꺼짐";
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-slate-400 border border-foreground/10">
      <span
        className={`w-1.5 h-1.5 rounded-full ${off ? "bg-slate-500" : "bg-emerald-400"}`}
      />
      <span className="text-slate-500">{label}</span>
      {value}
    </span>
  );
}

function ReportCard({
  boardId,
  report,
  index,
  canManage,
  onOpen,
  onDelete,
}: {
  boardId: string;
  report: AutoReport;
  index: number;
  canManage: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isWeekly = report.report_type === "WEEKLY_INTEGRATED";
  const sources = (report.source_status ?? []).filter((s) => s.has_data);
  const hasFailure = (report.source_status ?? []).some((s) => !s.success);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      className="group relative bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] hover:border-bridge-border overflow-hidden transition-colors"
    >
      {canManage && (
        <IconButton
          size="sm"
          aria-label="보고서 삭제"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1.5 right-1.5 z-10 bg-bridge-obsidian/80 backdrop-blur text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </IconButton>
      )}
      <button type="button" onClick={onOpen} className="w-full text-left">
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
      </button>
    </motion.div>
  );
}
