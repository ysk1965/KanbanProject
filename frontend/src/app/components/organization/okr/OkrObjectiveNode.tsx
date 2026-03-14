import { motion } from "framer-motion";
import {
  Target,
  Building2,
  Layers,
  User,
  ChevronDown,
  Plus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OkrObjective } from "../../../types";
import { OkrConfidenceBadge } from "./OkrConfidenceBadge";
import { OkrKeyResultRow } from "./OkrKeyResultRow";

const levelIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  COMPANY: Building2,
  DEPARTMENT: Layers,
  INDIVIDUAL: User,
};

interface OkrObjectiveNodeProps {
  objective: OkrObjective;
  isCollapsed: boolean;
  onToggle: () => void;
  onObjectiveClick: (id: string) => void;
  onCheckIn: (krId: string) => void;
  onAddChild: (parentId: string) => void;
  isAdmin: boolean;
}

export function OkrObjectiveNode({
  objective,
  isCollapsed,
  onToggle,
  onObjectiveClick,
  onCheckIn,
  onAddChild,
  isAdmin,
}: OkrObjectiveNodeProps) {
  const { t } = useTranslation();
  const LevelIcon = levelIcons[objective.level] || Target;
  const hasChildren = objective.children && objective.children.length > 0;
  const hasKRs = objective.key_results && objective.key_results.length > 0;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="relative bg-bridge-obsidian rounded-2xl border border-foreground/[0.08]
        min-w-[200px] max-w-[260px] shadow-sm hover:border-foreground/[0.12]
        transition-colors group cursor-pointer"
      onClick={() => onObjectiveClick(objective.id)}
    >
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-bridge-accent/15 flex items-center justify-center shrink-0">
            <LevelIcon size={14} className="text-bridge-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-foreground truncate">
              {objective.title}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {objective.department_name ||
                objective.owner?.user_name ||
                t(`okr.level.${objective.level.toLowerCase()}`, objective.level)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-foreground">
              {objective.progress}%
            </span>
            <OkrConfidenceBadge confidence={objective.confidence} size="sm" />
          </div>
          <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-bridge-accent"
              initial={{ width: 0 }}
              animate={{ width: `${objective.progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      {/* Key Results (card bottom section) */}
      {hasKRs && (
        <div
          className="px-3 pb-2.5 border-t border-foreground/[0.06] space-y-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {objective.key_results.map((kr) => (
            <OkrKeyResultRow key={kr.id} kr={kr} onCheckIn={onCheckIn} compact />
          ))}
        </div>
      )}

      {/* Child Objective Count Badge */}
      {hasChildren && (
        <div
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <span
            className="inline-flex items-center gap-0.5 text-xs font-bold
              px-2 py-0.5 rounded-full bg-bridge-accent/90 text-white shadow-sm cursor-pointer
              hover:bg-bridge-accent transition-colors"
          >
            {objective.children.length}
            <ChevronDown
              size={10}
              className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
            />
          </span>
        </div>
      )}

      {/* Add child button (admin, hover) */}
      {isAdmin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(objective.id);
          }}
          className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100
            w-5 h-5 rounded-full bg-bridge-accent text-white flex items-center justify-center
            shadow-sm hover:bg-bridge-accent/90 transition-all"
        >
          <Plus size={10} />
        </button>
      )}
    </motion.div>
  );
}
