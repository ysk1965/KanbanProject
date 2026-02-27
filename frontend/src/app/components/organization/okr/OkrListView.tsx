import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Building2,
  Layers,
  User,
  BarChart3,
  PlusCircle,
  Plus,
  Target,
} from "lucide-react";
import type { OkrObjective, OkrKeyResult } from "../../../types";
import { OkrProgressBar } from "./OkrProgressBar";
import { OkrConfidenceBadge } from "./OkrConfidenceBadge";

interface OkrListViewProps {
  objectives: OkrObjective[];
  onObjectiveClick: (id: string) => void;
  onCheckIn: (krId: string) => void;
  onAddChild: (parentId: string) => void;
  isAdmin: boolean;
}

const LEVEL_ICONS: Record<string, typeof Building2> = {
  COMPANY: Building2,
  DEPARTMENT: Layers,
  INDIVIDUAL: User,
};

export function OkrListView({
  objectives,
  onObjectiveClick,
  onCheckIn,
  onAddChild,
  isAdmin,
}: OkrListViewProps) {
  const { t } = useTranslation();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (objectives.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        {t("okr.allObjectives", "All Objectives")} - {t("common.noData", "No data")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {objectives.map((objective, index) => (
        <ObjectiveRow
          key={objective.id}
          objective={objective}
          depth={0}
          index={index}
          collapsedIds={collapsedIds}
          onToggleCollapse={toggleCollapse}
          onObjectiveClick={onObjectiveClick}
          onCheckIn={onCheckIn}
          onAddChild={onAddChild}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  );
}

// ─── Objective Row (recursive) ───

function ObjectiveRow({
  objective,
  depth,
  index,
  collapsedIds,
  onToggleCollapse,
  onObjectiveClick,
  onCheckIn,
  onAddChild,
  isAdmin,
}: {
  objective: OkrObjective;
  depth: number;
  index: number;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onObjectiveClick: (id: string) => void;
  onCheckIn: (krId: string) => void;
  onAddChild: (parentId: string) => void;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const isCollapsed = collapsedIds.has(objective.id);
  const hasContent = objective.key_results.length > 0 || objective.children.length > 0;
  const LevelIcon = LEVEL_ICONS[objective.level] || Target;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      style={{ marginLeft: `${depth * 24}px` }}
    >
      {/* Objective Header */}
      <div className="bg-bridge-obsidian rounded-2xl border border-foreground/[0.08] hover:border-foreground/[0.12] transition-colors overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 group">
          {/* Collapse toggle */}
          <button
            onClick={() => hasContent && onToggleCollapse(objective.id)}
            className={`shrink-0 p-0.5 rounded-md transition-colors ${
              hasContent
                ? "text-slate-400 hover:text-foreground hover:bg-foreground/5 cursor-pointer"
                : "text-transparent cursor-default"
            }`}
          >
            {hasContent ? (
              isCollapsed ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )
            ) : (
              <ChevronRight size={14} className="opacity-0" />
            )}
          </button>

          {/* Level icon */}
          <div className="w-6 h-6 rounded-lg bg-bridge-accent/15 flex items-center justify-center shrink-0">
            <LevelIcon size={12} className="text-bridge-accent" />
          </div>

          {/* Title + click handler */}
          <button
            onClick={() => onObjectiveClick(objective.id)}
            className="flex-1 min-w-0 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground truncate">
                {objective.title}
              </span>
              {objective.level === "DEPARTMENT" && objective.department_name && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent shrink-0 hidden sm:inline">
                  {objective.department_name}
                </span>
              )}
            </div>
          </button>

          {/* Progress */}
          <div className="flex items-center gap-2 shrink-0">
            <OkrProgressBar
              progress={objective.progress}
              size="sm"
              className="w-16 hidden sm:block"
              animated={false}
            />
            <span className="text-[11px] font-bold text-foreground w-10 text-right">
              {Math.round(objective.progress)}%
            </span>
            <OkrConfidenceBadge confidence={objective.confidence} />
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(objective.id);
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-foreground hover:bg-foreground/5 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
              title={t("okr.addObjective", "Add Objective")}
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        {/* Key Results (collapsible) */}
        <AnimatePresence>
          {!isCollapsed && objective.key_results.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-2 space-y-0.5">
                {objective.key_results.map((kr) => (
                  <KeyResultRow
                    key={kr.id}
                    kr={kr}
                    onCheckIn={onCheckIn}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Children objectives (collapsible, recursive) */}
      <AnimatePresence>
        {!isCollapsed && objective.children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-2 space-y-2 overflow-hidden"
          >
            {objective.children.map((child, childIndex) => (
              <ObjectiveRow
                key={child.id}
                objective={child}
                depth={depth + 1}
                index={childIndex}
                collapsedIds={collapsedIds}
                onToggleCollapse={onToggleCollapse}
                onObjectiveClick={onObjectiveClick}
                onCheckIn={onCheckIn}
                onAddChild={onAddChild}
                isAdmin={isAdmin}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Key Result Row ───

function KeyResultRow({
  kr,
  onCheckIn,
  isAdmin,
}: {
  kr: OkrKeyResult;
  onCheckIn: (krId: string) => void;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();

  const progress =
    kr.target_value === kr.start_value
      ? 0
      : Math.min(
          100,
          Math.max(
            0,
            ((kr.current_value - kr.start_value) / (kr.target_value - kr.start_value)) * 100,
          ),
        );

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-foreground/5 transition-colors group/kr ml-8">
      <BarChart3 size={12} className="text-bridge-secondary shrink-0" />

      <span className="text-xs text-foreground truncate flex-1 min-w-0">
        {kr.title}
      </span>

      {/* Current / Target */}
      <span className="text-[10px] text-slate-500 shrink-0 hidden sm:inline">
        {kr.current_value}
        {kr.unit ? ` ${kr.unit}` : ""} / {kr.target_value}
        {kr.unit ? ` ${kr.unit}` : ""}
      </span>

      {/* Mini progress */}
      <OkrProgressBar
        progress={progress}
        size="sm"
        className="w-12 shrink-0"
        animated={false}
      />

      <span className="text-[10px] font-bold text-foreground w-8 text-right shrink-0">
        {Math.round(progress)}%
      </span>

      {/* Check-in button */}
      {isAdmin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheckIn(kr.id);
          }}
          className="p-1 rounded-md text-slate-500 hover:text-bridge-accent hover:bg-bridge-accent/10 transition-colors shrink-0 opacity-0 group-hover/kr:opacity-100"
          title={t("okr.addCheckin", "Check-in")}
        >
          <PlusCircle size={12} />
        </button>
      )}
    </div>
  );
}
