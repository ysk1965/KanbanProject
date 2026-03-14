import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Plus, Calendar } from "lucide-react";
import type { OkrCycle } from "../../../types";

interface OkrCycleSelectorProps {
  cycles: OkrCycle[];
  selectedCycleId: string | null;
  onSelect: (cycleId: string) => void;
  onCreateCycle?: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  PLANNING: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  ACTIVE: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  REVIEW: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  CLOSED: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const STATUS_KEYS: Record<string, string> = {
  PLANNING: "okr.cycle_status.planning",
  ACTIVE: "okr.cycle_status.active",
  REVIEW: "okr.cycle_status.review",
  CLOSED: "okr.cycle_status.closed",
};

export function OkrCycleSelector({
  cycles,
  selectedCycleId,
  onSelect,
  onCreateCycle,
}: OkrCycleSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-bridge-obsidian rounded-xl border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors"
      >
        <Calendar size={14} className="text-bridge-accent shrink-0" />
        <span className="text-sm font-bold text-foreground truncate max-w-[200px]">
          {selectedCycle?.name || t("okr.cycle", "Cycle")}
        </span>
        {selectedCycle && (
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              STATUS_STYLES[selectedCycle.status] || STATUS_STYLES.PLANNING
            }`}
          >
            {t(
              STATUS_KEYS[selectedCycle.status] || STATUS_KEYS.PLANNING,
              selectedCycle.status,
            )}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-bridge-obsidian rounded-xl border border-foreground/[0.08] shadow-2xl z-50 overflow-hidden">
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {cycles.map((cycle) => (
              <button
                key={cycle.id}
                onClick={() => {
                  onSelect(cycle.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-foreground/5 transition-colors ${
                  cycle.id === selectedCycleId ? "bg-foreground/[0.03]" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-foreground truncate">
                    {cycle.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {cycle.start_date} ~ {cycle.end_date}
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                    STATUS_STYLES[cycle.status] || STATUS_STYLES.PLANNING
                  }`}
                >
                  {t(
                    STATUS_KEYS[cycle.status] || STATUS_KEYS.PLANNING,
                    cycle.status,
                  )}
                </span>
              </button>
            ))}
          </div>
          {onCreateCycle && (
            <button
              onClick={() => {
                setOpen(false);
                onCreateCycle();
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-foreground/[0.06] text-bridge-accent hover:bg-foreground/5 transition-colors"
            >
              <Plus size={14} />
              <span className="text-xs font-bold">{t("okr.createCycle", "Create Cycle")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
