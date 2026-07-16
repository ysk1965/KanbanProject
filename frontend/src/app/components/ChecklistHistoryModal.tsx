import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  History,
  X,
  Plus,
  Check,
  Pencil,
  UserCog,
  Calendar,
  GitMerge,
  ArrowRightLeft,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { activityAPI, type ActivityLogResponse } from "../utils/api";
import {
  parseUTCDate,
  formatDateShort,
  formatRelativeTime,
} from "../utils/dateUtils";

interface ChecklistHistoryModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  itemId: string;
  itemTitle: string;
}

type FilterKey = "all" | "REASSIGNED" | "RESCHEDULED" | "CHECKED" | "RENAMED";

// 액션 → 카테고리(필터) 매핑
const ACTION_CATEGORY: Record<string, FilterKey | undefined> = {
  CHECKLIST_REASSIGNED: "REASSIGNED",
  CHECKLIST_RESCHEDULED: "RESCHEDULED",
  CHECKLIST_CHECKED: "CHECKED",
  CHECKLIST_RENAMED: "RENAMED",
};

// 액션 → 아이콘 + 색상 (Tailwind text-* 클래스)
function actionVisual(action: string): { Icon: typeof Plus; color: string } {
  switch (action) {
    case "CHECKLIST_CREATED":
      return { Icon: Plus, color: "text-bridge-secondary" };
    case "CHECKLIST_CHECKED":
      return { Icon: Check, color: "text-emerald-400" };
    case "CHECKLIST_RENAMED":
      return { Icon: Pencil, color: "text-sky-400" };
    case "CHECKLIST_REASSIGNED":
      return { Icon: UserCog, color: "text-purple-400" };
    case "CHECKLIST_RESCHEDULED":
      return { Icon: Calendar, color: "text-bridge-accent" };
    case "CHECKLIST_MOVED":
      return { Icon: ArrowRightLeft, color: "text-orange-400" };
    case "CHECKLIST_MERGED":
      return { Icon: GitMerge, color: "text-amber-400" };
    case "CHECKLIST_DELETED":
      return { Icon: Trash2, color: "text-red-400" };
    default:
      return { Icon: History, color: "text-slate-400" };
  }
}

// 'YYYY-MM-DD' → 'M/D' (date-only 필드는 타임존 변환 없이 문자열로 표시)
function fmtDateOnly(s: unknown): string {
  if (typeof s !== "string" || !s) return "—";
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

// 로컬 기준 날짜 키 (같은 날 그룹핑용)
function dayKey(iso: string): string {
  const d = parseUTCDate(iso);
  if (!d) return "unknown";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function ChecklistHistoryModal({
  open,
  onClose,
  boardId,
  itemId,
  itemTitle,
}: ChecklistHistoryModalProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<ActivityLogResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setFilter("all");
    activityAPI
      .getTargetActivities(boardId, "CHECKLIST", itemId)
      .then((data) => {
        if (!cancelled) setLogs(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, boardId, itemId]);

  // 필터별 카운트
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: logs.length,
      REASSIGNED: 0,
      RESCHEDULED: 0,
      CHECKED: 0,
      RENAMED: 0,
    };
    for (const l of logs) {
      const cat = ACTION_CATEGORY[l.action];
      if (cat) c[cat] += 1;
    }
    return c;
  }, [logs]);

  const filtered = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((l) => ACTION_CATEGORY[l.action] === filter);
  }, [logs, filter]);

  // 날짜별 그룹핑 (최신순 유지)
  const groups = useMemo(() => {
    const map: { key: string; label: string; items: ActivityLogResponse[] }[] =
      [];
    for (const l of filtered) {
      const k = dayKey(l.created_at);
      let g = map.find((m) => m.key === k);
      if (!g) {
        g = { key: k, label: formatDateShort(l.created_at), items: [] };
        map.push(g);
      }
      g.items.push(l);
    }
    return map;
  }, [filtered]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("checklistHistory.filterAll", "전체") },
    {
      key: "REASSIGNED",
      label: t("checklistHistory.filterAssignee", "담당자"),
    },
    { key: "RESCHEDULED", label: t("checklistHistory.filterDate", "기간") },
    { key: "CHECKED", label: t("checklistHistory.filterStatus", "상태") },
    { key: "RENAMED", label: t("checklistHistory.filterName", "이름") },
  ];

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={t("checklistHistory.title", "변경 이력")}
      className="sm:max-w-lg"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <div className="w-9 h-9 rounded-xl grid place-items-center bg-bridge-accent/15 text-bridge-accent flex-none">
          <History className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-foreground">
            {t("checklistHistory.title", "변경 이력")}
          </div>
          <div className="text-xs text-slate-500 truncate">
            <span className="font-bold text-slate-400">{itemTitle}</span>
            {!loading && !error && (
              <>
                {" · "}
                {t("checklistHistory.subtitle", "총 {{count}}건의 변경", {
                  count: logs.length,
                })}
              </>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label={t("common.close", "닫기")}
          className="ml-auto w-8 h-8 rounded-lg grid place-items-center text-slate-400 hover:bg-foreground/5 hover:text-foreground transition-colors flex-none"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Filters */}
      {!loading && !error && logs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-foreground/[0.08]">
          {FILTERS.map((f) => {
            const n = counts[f.key];
            if (f.key !== "all" && n === 0) return null;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${
                  active
                    ? "bg-bridge-accent/15 text-bridge-accent"
                    : "border border-foreground/10 text-slate-400 hover:bg-foreground/5"
                }`}
              >
                {f.label}
                <span className="ml-1 opacity-60 tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="px-5 pb-5 pt-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
            <AlertCircle className="w-8 h-8 text-red-400/70" />
            <p className="text-xs text-slate-500">
              {t("checklistHistory.error", "이력을 불러오지 못했습니다")}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
            <History className="w-8 h-8 text-slate-600" />
            <p className="text-xs text-slate-500">
              {t("checklistHistory.empty", "아직 기록된 변경이 없습니다")}
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="sticky top-0 z-[1] py-2 text-xs font-bold tracking-widest uppercase text-slate-600 bg-bridge-obsidian">
                {g.label}
              </div>
              <div className="relative pl-[30px] before:content-[''] before:absolute before:left-[11px] before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-foreground/[0.12]">
                {g.items.map((l) => (
                  <HistoryRow key={l.id} log={l} t={t} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </MotionModal>
  );
}

// ── 개별 이벤트 행 ──
function HistoryRow({
  log,
  t,
}: {
  log: ActivityLogResponse;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const { Icon, color } = actionVisual(log.action);
  const meta = log.metadata || {};
  const actor = log.user?.name || t("common.unknownUser", "알 수 없음");

  const verb = (() => {
    switch (log.action) {
      case "CHECKLIST_CREATED":
        return t("checklistHistory.verb.created", "이 항목을 만들었습니다");
      case "CHECKLIST_CHECKED":
        return meta.isCompleted
          ? t("checklistHistory.verb.checkedDone", "완료로 표시했습니다")
          : t("checklistHistory.verb.checkedUndone", "미완료로 되돌렸습니다");
      case "CHECKLIST_RENAMED":
        return t("checklistHistory.verb.renamed", "이름을 변경했습니다");
      case "CHECKLIST_REASSIGNED":
        return t("checklistHistory.verb.reassigned", "담당자를 변경했습니다");
      case "CHECKLIST_RESCHEDULED":
        return t("checklistHistory.verb.rescheduled", "기간을 변경했습니다");
      case "CHECKLIST_MOVED":
        return t("checklistHistory.verb.moved", "다른 Task로 이동했습니다");
      case "CHECKLIST_MERGED":
        return t("checklistHistory.verb.merged", "항목을 병합했습니다");
      case "CHECKLIST_DELETED":
        return t("checklistHistory.verb.deleted", "항목을 삭제했습니다");
      default:
        return t("checklistHistory.verb.changed", "변경했습니다");
    }
  })();

  const none = t("checklistHistory.none", "없음");

  return (
    <div className="relative py-2.5">
      <span
        className={`absolute -left-[30px] top-3 w-6 h-6 rounded-full grid place-items-center bg-bridge-obsidian border-2 ${color}`}
        style={{ borderColor: "currentColor" }}
      >
        <Icon className="w-3 h-3" />
      </span>
      <div className="text-sm leading-snug text-foreground">
        <span className="font-bold">{actor}</span>{" "}
        <span className="text-slate-400">{verb}</span>
      </div>

      {/* diff */}
      {log.action === "CHECKLIST_RENAMED" && (
        <DiffPills
          oldEl={<PillOld>{String(meta.oldTitle ?? none)}</PillOld>}
          newEl={<PillNew>{String(meta.newTitle ?? none)}</PillNew>}
        />
      )}
      {log.action === "CHECKLIST_REASSIGNED" && (
        <DiffPills
          oldEl={<PillOld>{String(meta.oldAssignee ?? none)}</PillOld>}
          newEl={<PillNew>{String(meta.newAssignee ?? none)}</PillNew>}
        />
      )}
      {log.action === "CHECKLIST_RESCHEDULED" && (
        <DiffPills
          oldEl={
            <PillOld>
              {fmtDateOnly(meta.oldStart)} – {fmtDateOnly(meta.oldDue)}
            </PillOld>
          }
          newEl={
            <PillNew>
              {fmtDateOnly(meta.newStart)} – {fmtDateOnly(meta.newDue)}
            </PillNew>
          }
        />
      )}
      {log.action === "CHECKLIST_MOVED" && (
        <DiffPills
          oldEl={<PillOld>{String(meta.fromTask ?? none)}</PillOld>}
          newEl={<PillNew>{String(meta.toTask ?? none)}</PillNew>}
        />
      )}
      {log.action === "CHECKLIST_MERGED" &&
        Array.isArray(meta.mergedTitles) &&
        (meta.mergedTitles as unknown[]).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(meta.mergedTitles as unknown[]).map((title, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300"
              >
                {String(title)}
              </span>
            ))}
          </div>
        )}

      <div className="text-xs text-slate-600 mt-1 tabular-nums">
        {formatRelativeTime(log.created_at)}
      </div>
    </div>
  );
}

function DiffPills({
  oldEl,
  newEl,
}: {
  oldEl: React.ReactNode;
  newEl: React.ReactNode;
}) {
  return (
    <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs px-1.5 py-1 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08]">
      {oldEl}
      <span className="text-slate-600">→</span>
      {newEl}
    </div>
  );
}

function PillOld({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-md font-bold text-xs bg-red-500/12 text-red-300 line-through decoration-red-400/50">
      {children}
    </span>
  );
}

function PillNew({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-md font-bold text-xs bg-emerald-500/14 text-emerald-300">
      {children}
    </span>
  );
}
