import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  ChevronRight,
  Target,
  CheckCircle2,
  Calendar,
  Layers,
  FileText,
  Clock,
  Flag,
  User,
  Plus,
  Pencil,
  Trash2,
  ChevronsUpDown,
  ChevronsDownUp,
} from "lucide-react";
import type { Feature, Task, Milestone, MilestoneFeatureInfo } from "../types";
import { milestoneService } from "../utils/services";
import { formatDateShort } from "../utils/dateUtils";
import { MilestoneTimeline } from "./MilestoneTimeline";

// ========================================
// Types
// ========================================

interface MilestoneViewProps {
  boardId: string;
  features: Feature[];
  tasks: Task[];
  milestones: Milestone[];
  onRefresh?: () => void;
  onFeatureClick?: (feature: Feature) => void;
  onCreateMilestone?: () => void;
  onEditMilestone?: (milestone: Milestone) => void;
  onDeleteMilestone?: (milestoneId: string) => void;
  /** 있으면 타임라인 막대 드래그로 기간 조정 가능 (편집 권한) */
  onUpdateMilestoneDates?: (id: string, start: string, end: string) => void;
}

interface MilestoneDetailCache {
  [milestoneId: string]: {
    features: MilestoneFeatureInfo[];
    loading: boolean;
  };
}

// ========================================
// Sub-components
// ========================================

function ProgressBar({
  percentage,
  height = "h-2",
  className = "",
}: {
  percentage: number;
  height?: string;
  className?: string;
}) {
  const clampedPercentage = Math.min(100, Math.max(0, percentage));
  return (
    <div
      className={`w-full bg-foreground/10 rounded-full ${height} ${className}`}
    >
      <div
        className={`bg-bridge-accent ${height} rounded-full transition-all duration-300`}
        style={{ width: `${clampedPercentage}%` }}
      />
    </div>
  );
}

export type MilestoneStatusKey =
  "completed" | "waiting" | "overdue" | "inProgress";

/**
 * 마일스톤 상태(완료/대기/초과/진행중)와 배지·막대 색상을 한 곳에서 결정.
 * 배지(MilestoneStatusBadge)와 타임라인 막대(MilestoneTimeline)가 공유한다.
 */
export function getMilestoneStatus(
  startDate: string,
  endDate: string,
  progress: number,
): { key: MilestoneStatusKey; barColor: string; badgeClasses: string } {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (progress >= 100) {
    return {
      key: "completed",
      barColor: "bg-green-500",
      badgeClasses:
        "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30",
    };
  }
  if (now < start) {
    return {
      key: "waiting",
      barColor: "bg-slate-400",
      badgeClasses:
        "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30",
    };
  }
  if (now > end) {
    return {
      key: "overdue",
      barColor: "bg-red-500",
      badgeClasses:
        "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30",
    };
  }
  return {
    key: "inProgress",
    barColor: "bg-bridge-accent",
    badgeClasses:
      "bg-bridge-accent/20 text-bridge-accent border-bridge-accent/30",
  };
}

function MilestoneStatusBadge({
  startDate,
  endDate,
  progress,
}: {
  startDate: string;
  endDate: string;
  progress: number;
}) {
  const { t } = useTranslation();
  const { key, badgeClasses } = getMilestoneStatus(
    startDate,
    endDate,
    progress,
  );

  const label =
    key === "completed"
      ? t("milestone.statusCompleted")
      : key === "waiting"
        ? t("milestone.statusWaiting")
        : key === "overdue"
          ? t("schedule.overdue", { defaultValue: "Overdue" })
          : t("milestone.statusInProgress");

  return (
    <span
      className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeClasses}`}
    >
      {label}
    </span>
  );
}

/** Compact task row inside a feature card */
function TaskRow({ task }: { task: Task }) {
  return (
    <div className="flex items-center gap-2 py-1.5 group">
      <div className="flex-shrink-0">
        {task.completed ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <div className="h-3.5 w-3.5 rounded-full border border-foreground/20" />
        )}
      </div>

      <span
        className={`text-xs flex-1 truncate ${
          task.completed
            ? "text-muted-foreground line-through"
            : "text-foreground/70"
        }`}
      >
        {task.title}
      </span>

      {/* Assignees - compact */}
      {task.assignees && task.assignees.length > 0 && (
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
          {task.assignees.slice(0, 1).map((a) => (
            <span
              key={a.id}
              className="text-xs text-muted-foreground bg-foreground/5 px-1 py-0.5 rounded"
            >
              {a.name}
            </span>
          ))}
          {task.assignees.length > 1 && (
            <span className="text-xs text-muted-foreground">
              +{task.assignees.length - 1}
            </span>
          )}
        </div>
      )}

      {/* Block name */}
      {task.block_name && (
        <span className="text-xs text-muted-foreground bg-foreground/5 px-1 py-0.5 rounded flex-shrink-0">
          {task.block_name}
        </span>
      )}
    </div>
  );
}

/** Feature card - horizontal layout inside milestone */
function FeatureCard({
  featureInfo,
  tasks,
  milestoneId,
  onClick,
  milestoneCount,
}: {
  featureInfo: MilestoneFeatureInfo;
  tasks: Task[];
  milestoneId: string;
  onClick?: () => void;
  milestoneCount?: number;
}) {
  const { t } = useTranslation();

  // 이 마일스톤에 배정된 이 피처의 태스크만 표시 (피처가 여러 마일스톤에 걸쳐도 분리)
  const featureTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.feature_id === featureInfo.id &&
            task.milestone_id === milestoneId,
        )
        .sort((a, b) => Number(a.completed) - Number(b.completed)),
    [tasks, featureInfo.id, milestoneId],
  );

  const progressPct = Math.round(featureInfo.progress_percentage);

  return (
    <div
      onClick={onClick}
      className={`flex-shrink-0 w-72 bg-foreground/[0.03] border border-foreground/5 rounded-xl overflow-hidden hover:border-foreground/10 transition-colors${onClick ? " cursor-pointer" : ""}`}
    >
      {/* Color top bar */}
      <div className="h-1" style={{ backgroundColor: featureInfo.color }} />

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
              style={{ backgroundColor: featureInfo.color }}
            />
            <h4 className="text-sm font-medium text-foreground leading-snug line-clamp-2 flex-1">
              {featureInfo.title}
            </h4>
            {milestoneCount && milestoneCount >= 2 && (
              <span
                className="flex-shrink-0 flex items-center gap-0.5 text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                title={t("milestone.sharedFeature", {
                  count: milestoneCount,
                  defaultValue: "Shared across {{count}} milestones",
                })}
              >
                <Layers className="h-2.5 w-2.5" />
                {milestoneCount}
              </span>
            )}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2">
            <ProgressBar
              percentage={featureInfo.progress_percentage}
              height="h-1.5"
              className="flex-1"
            />
            <span className="text-xs font-medium text-muted-foreground flex-shrink-0 tabular-nums">
              {featureInfo.completed_tasks}/{featureInfo.total_tasks}
            </span>
            <span
              className={`text-xs font-bold flex-shrink-0 tabular-nums ${
                progressPct >= 100 ? "text-green-500" : "text-muted-foreground"
              }`}
            >
              {progressPct}%
            </span>
          </div>
        </div>

        {/* Task list (max 3 visible) */}
        {featureTasks.length > 0 ? (
          <div className="space-y-0 border-t border-foreground/5 pt-2">
            {featureTasks.slice(0, 3).map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
            {featureTasks.length > 3 && (
              <div className="pt-1">
                <span className="text-xs text-muted-foreground hover:text-foreground/70 transition-colors">
                  +{featureTasks.length - 3}{" "}
                  {t("common.more", { defaultValue: "more" })}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-foreground/5 pt-2">
            <span className="text-xs text-muted-foreground">
              {featureInfo.total_tasks}{" "}
              {t("common.tasks", { defaultValue: "tasks" })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// Main Component
// ========================================

export function MilestoneView({
  boardId,
  features,
  tasks,
  milestones,
  onRefresh,
  onFeatureClick,
  onCreateMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onUpdateMilestoneDates,
}: MilestoneViewProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();

  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(
    new Set(),
  );
  const [detailCache, setDetailCache] = useState<MilestoneDetailCache>({});

  const toggleMilestone = useCallback(
    async (milestoneId: string) => {
      setExpandedMilestones((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(milestoneId)) {
          newSet.delete(milestoneId);
        } else {
          newSet.add(milestoneId);
        }
        return newSet;
      });

      if (!detailCache[milestoneId] && !expandedMilestones.has(milestoneId)) {
        setDetailCache((prev) => ({
          ...prev,
          [milestoneId]: { features: [], loading: true },
        }));

        try {
          const detail = await milestoneService.getMilestone(
            boardId,
            milestoneId,
          );
          setDetailCache((prev) => ({
            ...prev,
            [milestoneId]: {
              features: detail.features || [],
              loading: false,
            },
          }));
        } catch (error) {
          console.warn("Failed to load milestone detail:", error);
          setDetailCache((prev) => ({
            ...prev,
            [milestoneId]: { features: [], loading: false },
          }));
        }
      }
    },
    [boardId, detailCache, expandedMilestones],
  );

  const handleExpandAll = useCallback(() => {
    const allIds = new Set(milestones.map((m) => m.id));
    setExpandedMilestones(allIds);
    // Load details for any that haven't been loaded
    milestones.forEach(async (milestone) => {
      if (detailCache[milestone.id]) return;
      setDetailCache((prev) => ({
        ...prev,
        [milestone.id]: { features: [], loading: true },
      }));
      try {
        const detail = await milestoneService.getMilestone(
          boardId,
          milestone.id,
        );
        setDetailCache((prev) => ({
          ...prev,
          [milestone.id]: { features: detail.features || [], loading: false },
        }));
      } catch (error) {
        setDetailCache((prev) => ({
          ...prev,
          [milestone.id]: { features: [], loading: false },
        }));
      }
    });
  }, [boardId, milestones, detailCache]);

  const handleCollapseAll = useCallback(() => {
    setExpandedMilestones(new Set());
  }, []);

  const allExpanded =
    expandedMilestones.size === milestones.length && milestones.length > 0;

  // W 단축키: bridge:toggleExpandCollapse 이벤트 리스너
  useEffect(() => {
    const handler = () => {
      if (allExpanded) {
        handleCollapseAll();
      } else {
        handleExpandAll();
      }
    };
    window.addEventListener("bridge:toggleExpandCollapse", handler);
    return () =>
      window.removeEventListener("bridge:toggleExpandCollapse", handler);
  }, [allExpanded, handleExpandAll, handleCollapseAll]);

  // 여러 마일스톤에 걸쳐 있는 피쳐 ID → 등장 횟수
  const multiMilestoneFeatureMap = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const ms of milestones) {
      const msFeatures = detailCache[ms.id]?.features || ms.features || [];
      for (const f of msFeatures) {
        countMap.set(f.id, (countMap.get(f.id) || 0) + 1);
      }
    }
    // 2개 이상 마일스톤에 등장하는 것만 남김
    const result = new Map<string, number>();
    countMap.forEach((count, id) => {
      if (count >= 2) result.set(id, count);
    });
    return result;
  }, [milestones, detailCache]);

  const sortedMilestones = useMemo(() => {
    return [...milestones].sort((a, b) => {
      return (
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );
    });
  }, [milestones]);

  // ========================================
  // Empty State
  // ========================================

  if (milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="w-16 h-16 rounded-2xl bg-foreground/5 flex items-center justify-center mb-4">
          <Flag className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">
          {t("milestone.onboardingTitle", {
            defaultValue: "Manage your project with milestones",
          })}
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          {t("milestone.onboardingDesc", {
            defaultValue:
              "Group features into milestones to track schedules and progress at a glance.",
          })}
        </p>
        {onCreateMilestone && (
          <button
            onClick={onCreateMilestone}
            className="flex items-center gap-2 px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold text-sm hover:bg-bridge-accent/90 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all"
          >
            <Plus className="h-4 w-4" />
            {t("milestone.createFirst", { defaultValue: "마일스톤 만들기" })}
          </button>
        )}
      </div>
    );
  }

  // ========================================
  // Render
  // ========================================

  const handleDeleteClick = (e: React.MouseEvent, milestoneId: string) => {
    e.stopPropagation();
    if (
      onDeleteMilestone &&
      confirm(
        t("milestone.deleteConfirm", {
          defaultValue: "이 마일스톤을 삭제하시겠습니까?",
        }),
      )
    ) {
      onDeleteMilestone(milestoneId);
    }
  };

  const handleEditClick = (e: React.MouseEvent, milestone: Milestone) => {
    e.stopPropagation();
    onEditMilestone?.(milestone);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
      {/* Header with create button */}
      {onCreateMilestone && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flag className="h-4 w-4" />
            <span>
              {milestones.length}{" "}
              {t("milestone.count", { defaultValue: "개 마일스톤" })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 모두 펼치기/닫기 */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleExpandAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                title={t("kanban.expandAll", { defaultValue: "모두 펼치기" })}
              >
                <ChevronsUpDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {t("kanban.expand", { defaultValue: "펼치기" })}
                </span>
              </button>
              <button
                onClick={handleCollapseAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
                title={t("kanban.collapseAll", { defaultValue: "모두 닫기" })}
              >
                <ChevronsDownUp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {t("kanban.collapse", { defaultValue: "닫기" })}
                </span>
              </button>
            </div>
            <button
              onClick={onCreateMilestone}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("milestone.create", { defaultValue: "마일스톤 추가" })}
            </button>
          </div>
        </div>
      )}

      {/* 주단위 가로 타임라인 (펼침 상태를 리스트와 공유) */}
      <MilestoneTimeline
        milestones={sortedMilestones}
        features={features}
        expandedMilestones={expandedMilestones}
        detailCache={detailCache}
        onToggle={toggleMilestone}
        onMilestoneClick={onEditMilestone}
        onUpdateDates={onUpdateMilestoneDates}
      />

      {sortedMilestones.map((milestone) => {
        const isExpanded = expandedMilestones.has(milestone.id);
        const cached = detailCache[milestone.id];
        const milestoneFeatures = cached?.features || milestone.features || [];
        const isLoading = cached?.loading || false;

        return (
          <motion.div
            key={milestone.id}
            layout
            className="bg-bridge-obsidian rounded-2xl border border-foreground/5 overflow-hidden"
          >
            {/* Milestone Header */}
            <button
              onClick={() => toggleMilestone(milestone.id)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] transition-colors text-left group/row"
            >
              {/* Expand icon */}
              <div className="flex-shrink-0">
                <motion.div
                  animate={{ rotate: isExpanded ? 90 : 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.15 }}
                >
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </motion.div>
              </div>

              {/* Title + status */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Target className="h-4 w-4 text-bridge-accent flex-shrink-0" />
                <h3 className="text-sm font-bold text-foreground truncate">
                  {milestone.title}
                </h3>
                <MilestoneStatusBadge
                  startDate={milestone.start_date}
                  endDate={milestone.end_date}
                  progress={milestone.progress_percentage}
                />
              </div>

              {/* Meta right */}
              <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDateShort(milestone.start_date)} ~{" "}
                  {formatDateShort(milestone.end_date)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  {milestone.feature_count}
                </span>
              </div>

              {/* Progress right */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="w-24 hidden sm:block">
                  <ProgressBar
                    percentage={milestone.progress_percentage}
                    height="h-1.5"
                  />
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums w-10 text-right">
                  {Math.round(milestone.progress_percentage)}%
                </span>
              </div>

              {/* Edit/Delete buttons */}
              {(onEditMilestone || onDeleteMilestone) && (
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                  {onEditMilestone && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleEditClick(e, milestone)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          handleEditClick(
                            e as unknown as React.MouseEvent,
                            milestone,
                          );
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                      title={t("common.edit", { defaultValue: "수정" })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </div>
                  )}
                  {onDeleteMilestone && (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleDeleteClick(e, milestone.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          handleDeleteClick(
                            e as unknown as React.MouseEvent,
                            milestone.id,
                          );
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title={t("common.delete", { defaultValue: "삭제" })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              )}
            </button>

            {/* Expanded: Feature Cards (horizontal scroll) */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-foreground/5 px-5 pb-5 pt-4">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-5 w-5 border-2 border-bridge-accent/30 border-t-bridge-accent rounded-full animate-spin" />
                        <span className="ml-3 text-sm text-muted-foreground">
                          {t("common.loading", { defaultValue: "Loading..." })}
                        </span>
                      </div>
                    ) : milestoneFeatures.length > 0 ? (
                      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                        {[...milestoneFeatures]
                          .sort(
                            (a, b) =>
                              (multiMilestoneFeatureMap.get(b.id) || 0) -
                              (multiMilestoneFeatureMap.get(a.id) || 0),
                          )
                          .map((featureInfo) => (
                            <FeatureCard
                              key={featureInfo.id}
                              featureInfo={featureInfo}
                              tasks={tasks}
                              milestoneId={milestone.id}
                              milestoneCount={multiMilestoneFeatureMap.get(
                                featureInfo.id,
                              )}
                              onClick={
                                onFeatureClick
                                  ? () => {
                                      const feature = features.find(
                                        (f) => f.id === featureInfo.id,
                                      );
                                      if (feature) onFeatureClick(feature);
                                    }
                                  : undefined
                              }
                            />
                          ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-8 text-muted-foreground">
                        <FileText className="h-6 w-6 mb-2" />
                        <span className="text-sm">
                          {t("milestone.noFeatures", {
                            defaultValue: "No linked features",
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
