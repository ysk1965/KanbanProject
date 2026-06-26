import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  ArrowRightLeft,
  Check,
  Loader2,
  Filter,
  ChevronDown,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { MotionModal } from "../ui/MotionModal";
import { checklistAPI, taskAPI, type TaskResponse } from "../../utils/api";
import type { Feature, Milestone } from "../../types";
import { getTodayDateString } from "../../utils/dateUtils";

interface MoveToTaskModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  item: {
    id: string;
    title: string;
    taskId: string;
    taskTitle: string;
  };
  features: Feature[];
  /** Board milestones (with feature lists) for the milestone filter. */
  milestones?: Milestone[];
  onMoved: () => void;
}

interface FeatureTaskGroup {
  feature: Feature;
  tasks: TaskResponse[];
}

export function MoveToTaskModal({
  open,
  onClose,
  boardId,
  item,
  features,
  milestones = [],
  onMoved,
}: MoveToTaskModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<FeatureTaskGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Milestone filter (narrows visible features to those in selected milestone) ──
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(
    null,
  );
  const [showMilestoneDropdown, setShowMilestoneDropdown] = useState(false);
  const milestoneDropdownRef = useRef<HTMLDivElement>(null);

  // Only milestones that have features are selectable.
  const milestoneOptions = useMemo(() => {
    return milestones
      .filter((m) => (m.features?.length ?? 0) > 0)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [milestones]);

  // Default to the milestone covering today each time the modal opens.
  useEffect(() => {
    if (!open) return;
    if (milestoneOptions.length === 0) {
      setSelectedMilestoneId(null);
      return;
    }
    const today = getTodayDateString();
    const current = milestoneOptions.find(
      (m) =>
        m.start_date &&
        m.end_date &&
        m.start_date <= today &&
        today <= m.end_date,
    );
    setSelectedMilestoneId(current?.id ?? null);
  }, [open, milestoneOptions]);

  // Feature ids belonging to the selected milestone (null = no filter).
  const selectedMilestoneFeatureIds = useMemo(() => {
    if (!selectedMilestoneId) return null;
    const milestone = milestones.find((m) => m.id === selectedMilestoneId);
    if (!milestone?.features) return new Set<string>();
    return new Set(milestone.features.map((f) => f.id));
  }, [milestones, selectedMilestoneId]);

  // Close milestone dropdown on outside click.
  useEffect(() => {
    if (!showMilestoneDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (
        milestoneDropdownRef.current &&
        !milestoneDropdownRef.current.contains(e.target as Node)
      ) {
        setShowMilestoneDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMilestoneDropdown]);

  // Fetch tasks for all features on mount
  useEffect(() => {
    if (!open || features.length === 0) return;

    let cancelled = false;
    setLoading(true);

    const fetchAllTasks = async () => {
      try {
        const results = await Promise.all(
          features.map(async (feature) => {
            try {
              const res = await taskAPI.getTasks(boardId, {
                feature_id: feature.id,
              });
              return { feature, tasks: res.tasks ?? [] };
            } catch {
              return { feature, tasks: [] };
            }
          }),
        );
        if (!cancelled) {
          // Filter out features with no tasks
          setGroups(results.filter((g) => g.tasks.length > 0));
        }
      } catch {
        // Ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAllTasks();
    return () => {
      cancelled = true;
    };
  }, [open, boardId, features]);

  // Reset query when modal opens
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // Auto-focus search input
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const filteredGroups = useMemo(() => {
    // 1) Narrow by selected milestone (if any).
    let result = groups;
    if (selectedMilestoneFeatureIds) {
      result = result.filter((group) =>
        selectedMilestoneFeatureIds.has(group.feature.id),
      );
    }

    // 2) Narrow by search query.
    const q = query.trim().toLowerCase();
    if (!q) return result;

    return result
      .map((group) => ({
        ...group,
        tasks: group.tasks.filter(
          (task) =>
            task.title.toLowerCase().includes(q) ||
            group.feature.title.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.tasks.length > 0);
  }, [groups, query, selectedMilestoneFeatureIds]);

  const handleSelect = useCallback(
    async (targetTaskId: string) => {
      if (targetTaskId === item.taskId || moving) return;
      setMoving(true);
      try {
        await checklistAPI.moveToTask(boardId, item.taskId, item.id, {
          target_task_id: targetTaskId,
        });
        toast.success(t("schedule.moveToTask.success", "이동 완료"));
        onMoved();
        onClose();
      } catch {
        toast.error(t("common.error", "오류가 발생했습니다"));
      } finally {
        setMoving(false);
      }
    },
    [boardId, item, moving, onMoved, onClose, t],
  );

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={t("schedule.moveToTask.title", "태스크 이동")}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <ArrowRightLeft className="w-4 h-4 text-bridge-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground">
            {t("schedule.moveToTask.title", "태스크 이동")}
          </h3>
          <p className="text-xs text-slate-500 truncate mt-0.5">{item.title}</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 pt-4 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "schedule.moveToTask.searchPlaceholder",
              "태스크 검색...",
            )}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 pl-9 pr-3
              text-sm text-foreground placeholder-slate-500
              focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
      </div>

      {/* Milestone filter */}
      {milestoneOptions.length > 0 && (
        <div className="px-5 pb-1" ref={milestoneDropdownRef}>
          {selectedMilestoneId ? (
            // Active filter chip
            <button
              onClick={() => setSelectedMilestoneId(null)}
              className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-lg
                bg-bridge-accent/10 text-bridge-accent text-xs font-medium
                hover:bg-bridge-accent/15 transition-colors"
            >
              {(() => {
                const ms = milestoneOptions.find(
                  (m) => m.id === selectedMilestoneId,
                );
                return ms ? <span className="truncate">{ms.title}</span> : null;
              })()}
              <X size={12} className="shrink-0 ml-0.5" />
            </button>
          ) : (
            // Filter toggle button
            <div className="relative">
              <button
                onClick={() => setShowMilestoneDropdown((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg
                  text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                <Filter size={12} />
                <span>
                  {t("schedule.panel.filterMilestone", "마일스톤별 필터")}
                </span>
                <ChevronDown
                  size={10}
                  className={`transition-transform ${showMilestoneDropdown ? "rotate-180" : ""}`}
                />
              </button>

              {/* Dropdown */}
              {showMilestoneDropdown && (
                <div
                  className="absolute top-full left-0 mt-1 z-30 min-w-[200px]
                    bg-bridge-obsidian border border-foreground/[0.08] rounded-lg shadow-xl
                    max-h-[200px] overflow-y-auto custom-scrollbar py-1"
                >
                  {milestoneOptions.map((milestone) => (
                    <button
                      key={milestone.id}
                      onClick={() => {
                        setSelectedMilestoneId(milestone.id);
                        setShowMilestoneDropdown(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs
                        text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <span className="truncate">{milestone.title}</span>
                      <span className="ml-auto text-xs text-slate-500 shrink-0">
                        {milestone.features?.length ?? 0}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Task list */}
      <div className="px-5 pb-5 pt-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-12">
            {t("schedule.moveToTask.noTasks", "태스크가 없습니다")}
          </p>
        ) : (
          filteredGroups.map((group, gIdx) => (
            <motion.div
              key={group.feature.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gIdx * 0.04 }}
              className="mb-3"
            >
              {/* Feature header */}
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.feature.color }}
                />
                <span className="text-xs font-bold text-slate-400 truncate">
                  {group.feature.inbox
                    ? t("common.uncategorized", "미분류")
                    : group.feature.title}
                </span>
              </div>

              {/* Tasks */}
              {group.tasks.map((task) => {
                const isCurrent = task.id === item.taskId;
                return (
                  <button
                    key={task.id}
                    type="button"
                    disabled={isCurrent || moving}
                    onClick={() => handleSelect(task.id)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors
                      ${
                        isCurrent
                          ? "bg-bridge-accent/10 text-bridge-accent cursor-default"
                          : "text-foreground hover:bg-foreground/5 disabled:opacity-50"
                      }`}
                  >
                    <span className="flex-1 truncate">{task.title}</span>
                    {isCurrent && (
                      <span className="flex items-center gap-1 text-bridge-accent shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">
                          {t("schedule.moveToTask.currentTask", "현재 태스크")}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </motion.div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-500">
          Esc {t("common.close", "닫기")}
        </span>
        {moving && (
          <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
        )}
      </div>
    </MotionModal>
  );
}

MoveToTaskModal.displayName = "MoveToTaskModal";
