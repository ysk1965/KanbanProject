import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { differenceInCalendarDays, isValid, parseISO } from "date-fns";
import type { DailyChecklistSource } from "../types";

/**
 * "이 항목이 왜 오늘 목록에 있는가"를 한 눈에 보여주는 뱃지.
 *
 * 데일리 뷰 레일과 타임블록 모달이 같은 근거를 같은 모양으로 보여주도록
 * 판정 로직을 여기 한 곳에 둔다.
 */

export type DailyBadgeKind = "overdue" | "dday" | "range" | "pinned";

export interface DailyBadgeInput {
  source?: DailyChecklistSource;
  start_date?: string | null;
  due_date?: string | null;
  pinned?: boolean;
  completed?: boolean;
}

interface Resolved {
  kind: DailyBadgeKind;
  /** overdue일 때 며칠 지났는지 */
  days: number;
}

const toDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
};

const shortDate = (value?: string | null) => {
  const parsed = toDate(value);
  return parsed ? `${parsed.getMonth() + 1}/${parsed.getDate()}` : "";
};

/** 항목과 기준 날짜로 뱃지 종류를 판정한다. 표시할 게 없으면 null. */
export function resolveDailyBadge(
  item: DailyBadgeInput,
  referenceDate: string,
): Resolved | null {
  const ref = toDate(referenceDate);
  const due = toDate(item.due_date);
  const start = toDate(item.start_date);
  if (!ref) return null;

  if (due && !item.completed && differenceInCalendarDays(due, ref) < 0) {
    return {
      kind: "overdue",
      days: Math.abs(differenceInCalendarDays(due, ref)),
    };
  }
  if (due && differenceInCalendarDays(due, ref) === 0) {
    return { kind: "dday", days: 0 };
  }
  if (item.source === "PINNED" || (item.pinned && !start && !due)) {
    return { kind: "pinned", days: 0 };
  }
  if (start && due) {
    return { kind: "range", days: 0 };
  }
  return null;
}

interface Props {
  item: DailyBadgeInput;
  /** 기준 날짜 (yyyy-MM-dd) — 데일리 뷰에서 보고 있는 그 날짜 */
  referenceDate: string;
  /** 레일처럼 좁은 곳에서는 기간 뱃지를 생략하고 아이콘만 쓴다 */
  compact?: boolean;
}

export function DailyChecklistBadge({ item, referenceDate, compact }: Props) {
  const { t } = useTranslation();
  const resolved = resolveDailyBadge(item, referenceDate);
  if (!resolved) return null;

  const base =
    "inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap";

  if (resolved.kind === "overdue") {
    return (
      <span
        className={`${base} bg-rose-500/15 text-rose-600 dark:text-rose-400`}
      >
        {t("dailySchedule.badgeOverdue", { count: resolved.days })}
      </span>
    );
  }

  if (resolved.kind === "dday") {
    return (
      <span
        className={`${base} bg-amber-500/15 text-amber-600 dark:text-amber-400`}
      >
        {t("dailySchedule.badgeDDay")}
      </span>
    );
  }

  if (resolved.kind === "pinned") {
    return (
      <span className={`${base} bg-slate-500/15 text-slate-400`}>
        <Pin className="w-3 h-3" />
        {!compact && t("dailySchedule.badgePinned")}
      </span>
    );
  }

  // 기간 뱃지는 좁은 레일에서 제목을 밀어내므로 생략한다
  if (compact) return null;

  return (
    <span className={`${base} bg-bridge-accent/15 text-bridge-accent`}>
      {shortDate(item.start_date)}–{shortDate(item.due_date)}
    </span>
  );
}
