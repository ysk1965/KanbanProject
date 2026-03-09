import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Target, ChevronRight, BarChart3, ClipboardCheck } from "lucide-react";
import { okrService, organizationService } from "../../../utils/services";
import type {
  OkrCycle,
  OkrTreeData,
  OnboardingInstanceSummary,
} from "../../../types";
import { OkrProgressBar } from "./OkrProgressBar";
import { OnboardingDetailModal } from "../OnboardingDetailModal";

interface OkrDashboardWidgetProps {
  orgId: string;
  onNavigateOkr: () => void;
  onNavigateOnboarding: () => void;
  hrSystemEnabled?: boolean;
}

export function OkrDashboardWidget({
  orgId,
  onNavigateOkr,
  onNavigateOnboarding,
  hrSystemEnabled,
}: OkrDashboardWidgetProps) {
  const { t } = useTranslation();
  const [treeData, setTreeData] = useState<OkrTreeData | null>(null);
  const [onboardingInstances, setOnboardingInstances] = useState<
    OnboardingInstanceSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cycles, instances] = await Promise.all([
          okrService.getCycles(orgId).catch(() => [] as OkrCycle[]),
          organizationService
            .getOnboardingInstances(orgId, { status: "IN_PROGRESS" })
            .catch(() => [] as OnboardingInstanceSummary[]),
        ]);

        const active = cycles.find((c: OkrCycle) => c.status === "ACTIVE");
        if (active) {
          try {
            const tree = await okrService.getTree(orgId, active.id);
            setTreeData(tree);
          } catch {
            /* optional */
          }
        }
        setOnboardingInstances(instances);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [orgId]);

  if (loading) return null;

  const hasOkr = !!treeData;
  const hasOnboarding = !hrSystemEnabled && onboardingInstances.length > 0;

  // Nothing to show
  if (!hasOkr && !hasOnboarding) return null;

  const progress = treeData ? Math.round(treeData.overall_progress) : 0;

  // Onboarding: compute aggregate progress
  const onboardingTotal = onboardingInstances.length;
  const onboardingAvgProgress =
    onboardingTotal > 0
      ? Math.round(
          onboardingInstances.reduce((sum, i) => sum + i.progress_percent, 0) /
            onboardingTotal,
        )
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className={`grid gap-3 ${hasOkr && hasOnboarding ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
    >
      {/* OKR Card */}
      {hasOkr && treeData && (
        <div
          onClick={onNavigateOkr}
          className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08]
            hover:border-foreground/[0.12] cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                <Target size={14} className="text-violet-500" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                OKR
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold text-foreground truncate">
                  {treeData.cycle.name}
                </span>
                <span className="text-[11px] font-bold text-bridge-accent">
                  {progress}%
                </span>
              </div>
              <OkrProgressBar
                progress={treeData.overall_progress}
                size="sm"
                animated
              />
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1">
                <Target size={11} className="text-slate-500" />
                <span className="text-[10px] font-bold text-slate-400">
                  {treeData.total_objectives}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 size={11} className="text-slate-500" />
                <span className="text-[10px] font-bold text-slate-400">
                  {treeData.total_key_results}
                </span>
              </div>
            </div>

            <ChevronRight
              size={14}
              className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            />
          </div>
        </div>
      )}

      {/* Onboarding Card */}
      {hasOnboarding && (
        <div
          onClick={() => setShowOnboardingModal(true)}
          className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08]
            hover:border-foreground/[0.12] cursor-pointer transition-colors group"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <ClipboardCheck size={14} className="text-emerald-500" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                {t("organization.dashboard.onboarding", "Onboarding")}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold text-foreground">
                  {t("organization.dashboard.onboardingInProgress", {
                    count: onboardingTotal,
                    defaultValue: "{{count}} in progress",
                  })}
                </span>
                <span className="text-[11px] font-bold text-emerald-500">
                  {onboardingAvgProgress}%
                </span>
              </div>
              <div className="w-full h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${onboardingAvgProgress}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>

            <ChevronRight
              size={14}
              className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            />
          </div>
        </div>
      )}

      {/* Onboarding Detail Modal */}
      <OnboardingDetailModal
        open={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
        orgId={orgId}
        instances={onboardingInstances}
      />
    </motion.div>
  );
}
