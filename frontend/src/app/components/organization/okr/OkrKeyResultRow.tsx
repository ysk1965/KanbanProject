import { BarChart3, CheckCircle, Hash, DollarSign, Flag, PlusCircle } from "lucide-react";
import type { OkrKeyResult } from "../../../types";

const metricIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  PERCENTAGE: BarChart3,
  NUMBER: Hash,
  CURRENCY: DollarSign,
  BOOLEAN: CheckCircle,
  MILESTONE: Flag,
};

interface OkrKeyResultRowProps {
  kr: OkrKeyResult;
  onCheckIn: (krId: string) => void;
  compact?: boolean;
}

export function OkrKeyResultRow({ kr, onCheckIn, compact }: OkrKeyResultRowProps) {
  const MetricIcon = metricIcons[kr.metric_type] || BarChart3;
  const progress =
    kr.target_value > kr.start_value
      ? Math.min(
          100,
          Math.max(
            0,
            ((kr.current_value - kr.start_value) / (kr.target_value - kr.start_value)) * 100,
          ),
        )
      : 0;

  return (
    <div
      className={`flex items-center gap-2 ${compact ? "py-1 px-1" : "py-1.5 px-2"} rounded-lg hover:bg-foreground/5 group/kr transition-colors`}
    >
      <MetricIcon size={compact ? 10 : 12} className="text-slate-400 shrink-0" />
      <span
        className={`${compact ? "text-[9px]" : "text-[10px]"} text-foreground truncate flex-1`}
      >
        {kr.title}
      </span>
      <span
        className={`${compact ? "text-[9px]" : "text-[10px]"} font-bold text-bridge-accent shrink-0`}
      >
        {formatValue(kr.current_value)}/{formatValue(kr.target_value)}
        {kr.unit || ""}
      </span>
      <div
        className={`${compact ? "w-8" : "w-12"} h-1 rounded-full bg-foreground/[0.06] shrink-0`}
      >
        <div
          className="h-full rounded-full bg-bridge-accent"
          style={{ width: `${progress}%` }}
        />
      </div>
      {!compact && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheckIn(kr.id);
          }}
          className="opacity-0 group-hover/kr:opacity-100 p-0.5 text-slate-400 hover:text-bridge-accent transition-all"
        >
          <PlusCircle size={12} />
        </button>
      )}
    </div>
  );
}

function formatValue(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(0)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}
