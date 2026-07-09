import { memo, useMemo } from "react";
import { Flag, Pencil, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { Feature, Milestone } from "../types";
import { getMilestoneColorByIndex } from "../utils/milestoneColor";

interface MilestoneTabBarProps {
  milestones: Milestone[];
  allFeatures: Feature[];
  selectedMilestoneId: string;
  canAccessMilestone: boolean;
  onSelect: (milestoneId: string) => void;
  onOpenMilestone: (milestone?: Milestone) => void;
}

// 보드 서브뷰 상단 마일스톤 필터 탭 바
export const MilestoneTabBar = memo(function MilestoneTabBar({
  milestones,
  allFeatures,
  selectedMilestoneId,
  canAccessMilestone,
  onSelect,
  onOpenMilestone,
}: MilestoneTabBarProps) {
  const { t } = useTranslation();

  const hasUnassignedFeatures = useMemo(() => {
    const allMilestoneFeatureIds = new Set(
      milestones.flatMap((m) => m.features?.map((f) => f.id) || []),
    );
    return allFeatures.some((f) => !allMilestoneFeatureIds.has(f.id));
  }, [milestones, allFeatures]);

  return (
    <div className="flex items-center px-3 md:px-6 py-1.5 bg-bridge-dark border-b border-bridge-border gap-2 overflow-x-auto shrink-0">
      <Flag size={13} className="text-bridge-secondary shrink-0" />
      <div className="flex items-center gap-1">
        <button
          onClick={() => onSelect("all")}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
            selectedMilestoneId === "all"
              ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
              : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
          }`}
        >
          {t("common.all")}
        </button>
        {hasUnassignedFeatures && (
          <button
            onClick={() => onSelect("none")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              selectedMilestoneId === "none"
                ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
            }`}
          >
            {t("kanban.unassigned", "미지정")}
          </button>
        )}
        {milestones.map((milestone, index) => {
          const startDate = format(parseISO(milestone.start_date), "M/d");
          const endDate = format(parseISO(milestone.end_date), "M/d");
          const milestoneColor = getMilestoneColorByIndex(index).hex;
          return (
            <button
              key={milestone.id}
              onClick={() => onSelect(milestone.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                selectedMilestoneId === milestone.id
                  ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
                  : "text-zinc-400 hover:text-foreground hover:bg-bridge-surface-hover"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: milestoneColor }}
              />
              <span>{milestone.title}</span>
              <span
                className={`text-xs font-normal ${selectedMilestoneId === milestone.id ? "text-white/70" : "text-zinc-500"}`}
              >
                {startDate} ~ {endDate}
              </span>
            </button>
          );
        })}
      </div>
      {selectedMilestoneId !== "all" && selectedMilestoneId !== "none" && (
        <button
          onClick={() => {
            const milestone = milestones.find(
              (m) => m.id === selectedMilestoneId,
            );
            if (milestone) onOpenMilestone(milestone);
          }}
          className="p-1 text-zinc-400 hover:text-foreground transition-colors shrink-0"
          title={t("kanban.editMilestone")}
        >
          <Pencil size={13} />
        </button>
      )}
      <button
        onClick={() => onOpenMilestone()}
        className={`p-1 transition-colors shrink-0 ${
          !canAccessMilestone
            ? "text-zinc-600 hover:text-zinc-500"
            : "text-zinc-400 hover:text-foreground"
        }`}
      >
        <Plus size={16} />
      </button>
    </div>
  );
});
