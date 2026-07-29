import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";

export interface KpiItem {
  key: string;
  label: string;
  value: string;
  /** 값 뒤에 작게 붙는 단위/분모 (예: "/ 45") */
  suffix?: string;
  /** 0~100 */
  percent: number;
  tone: "accent" | "danger" | "warn" | "ok" | "teal";
}

const VALUE_TONE: Record<KpiItem["tone"], string> = {
  accent: "text-foreground",
  danger: "text-rose-600 dark:text-rose-400",
  warn: "text-amber-600 dark:text-amber-400",
  ok: "text-foreground",
  teal: "text-foreground",
};

const BAR_TONE: Record<KpiItem["tone"], string> = {
  accent: "bg-bridge-accent",
  danger: "bg-rose-500",
  warn: "bg-amber-500",
  ok: "bg-emerald-500",
  teal: "bg-bridge-secondary",
};

const BORDER_TONE: Record<KpiItem["tone"], string> = {
  accent: "border-foreground/[0.08]",
  danger: "border-rose-500/40",
  warn: "border-amber-500/40",
  ok: "border-foreground/[0.08]",
  teal: "border-foreground/[0.08]",
};

interface KpiStripProps {
  userName: string;
  /** "2026년 7월 29일 수요일" 형태의 이미 포맷된 문자열 */
  dateLabel: string;
  /** 스프린트/마일스톤 등 오늘의 맥락 한 줄 (없으면 미표시) */
  contextLabel?: string | null;
  items: KpiItem[];
}

/** 인사 + KPI 5칸. 지연·마감만 색으로 튀게 하고 나머지는 조용히 둔다. */
export function KpiStrip({
  userName,
  dateLabel,
  contextLabel,
  items,
}: KpiStripProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
      <div className="flex-none lg:pr-5 lg:border-r lg:border-foreground/[0.08]">
        <p className="text-sm md:text-lg font-bold text-foreground tracking-tight">
          {t("boardDashboard.greeting", { name: userName })}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {dateLabel}
          {contextLabel ? ` · ${contextLabel}` : ""}
        </p>
      </div>

      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {items.map((item, index) => (
          <motion.div
            key={item.key}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : index * 0.04 }}
            className={`bg-bridge-obsidian rounded-2xl border ${BORDER_TONE[item.tone]} px-3.5 py-3 flex flex-col gap-2 min-w-0`}
          >
            <span className="text-xs text-slate-400 truncate">
              {item.label}
            </span>
            <span
              className={`text-xl md:text-2xl font-bold tracking-tight leading-none ${VALUE_TONE[item.tone]}`}
            >
              {item.value}
              {item.suffix && (
                <span className="text-xs font-medium text-slate-500 ml-1">
                  {item.suffix}
                </span>
              )}
            </span>
            <span className="h-1 rounded-full bg-foreground/[0.08] overflow-hidden">
              <span
                className={`block h-full rounded-full ${BAR_TONE[item.tone]}`}
                style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
              />
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
