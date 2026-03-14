import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Target, BarChart3, Clock } from "lucide-react";
import type { OkrTreeData } from "../../../types";
import { OkrProgressBar } from "./OkrProgressBar";

interface OkrSummaryCardProps {
  treeData: OkrTreeData;
  daysRemaining: number;
}

export function OkrSummaryCard({ treeData, daysRemaining }: OkrSummaryCardProps) {
  const { t } = useTranslation();

  const stats = [
    {
      icon: Target,
      label: t("okr.objective", "Objective"),
      value: treeData.total_objectives,
      color: "text-bridge-accent",
    },
    {
      icon: BarChart3,
      label: t("okr.keyResult", "Key Result"),
      value: treeData.total_key_results,
      color: "text-bridge-secondary",
    },
    {
      icon: Clock,
      label: t("okr.daysRemaining", { days: daysRemaining }),
      value: null,
      color: "text-slate-400",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] p-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Overall progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {t("okr.overallProgress", "Overall Progress")}
            </span>
            <span className="text-sm font-bold text-foreground">
              {Math.round(treeData.overall_progress)}%
            </span>
          </div>
          <OkrProgressBar progress={treeData.overall_progress} size="lg" animated />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 sm:gap-6 shrink-0">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className="flex items-center gap-1.5">
                <Icon size={14} className={stat.color} />
                {stat.value !== null ? (
                  <span className="text-sm font-bold text-foreground">{stat.value}</span>
                ) : null}
                <span className="text-xs text-slate-500 hidden sm:inline">{stat.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
