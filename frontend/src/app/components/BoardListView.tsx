import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  CheckCircle2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  ListFilter,
} from "lucide-react";
import { IconButton } from './ui/IconButton';
import type { Feature, Task, Block, ChecklistItem } from "../types";
import { BoardMember as ShareBoardMember } from "./ShareBoardModal";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { formatDate, getDDay } from "../utils/dateUtils";

// ========================================
// Types
// ========================================

type GroupBy = "feature" | "block" | "assignee" | "status" | "none";
type SortBy = "title" | "due_date" | "status" | "created";
type SortDir = "asc" | "desc";

interface BoardListViewProps {
  boardId: string;
  features: Feature[];
  tasks: Task[];
  blocks: Block[];
  checklistDataMap: { [taskId: string]: ChecklistItem[] };
  boardMembersData: ShareBoardMember[];
  memberColorMap: Record<string, string | null>;
  onViewFeature: (featureId: string) => void;
  onViewTask: (taskId: string) => void;
}

interface TaskGroup {
  key: string;
  label: string;
  color: string | null;
  tasks: Task[];
  featureId?: string;
}

// ========================================
// Constants
// ========================================

const GROUP_OPTIONS: { value: GroupBy; labelKey: string }[] = [
  { value: "feature", labelKey: "listViewGroupFeature" },
  { value: "block", labelKey: "listViewGroupBlock" },
  { value: "assignee", labelKey: "listViewGroupAssignee" },
  { value: "status", labelKey: "listViewGroupStatus" },
  { value: "none", labelKey: "listViewGroupNone" },
];

const SORT_OPTIONS: { value: SortBy; labelKey: string }[] = [
  { value: "title", labelKey: "listViewSortTitle" },
  { value: "due_date", labelKey: "listViewSortDueDate" },
  { value: "status", labelKey: "listViewSortStatus" },
  { value: "created", labelKey: "listViewSortCreated" },
];

// ========================================
// Helpers
// ========================================

function isDoneBlock(block: Block | undefined): boolean {
  return block?.fixed_type === "DONE";
}

function getChecklistProgress(
  task: Task,
  checklistDataMap: { [taskId: string]: ChecklistItem[] },
): { total: number; checked: number } | null {
  const items = checklistDataMap[task.id];
  if (items && items.length > 0) {
    return {
      total: items.length,
      checked: items.filter((i) => i.completed).length,
    };
  }
  if ((task.checklist_total ?? 0) > 0) {
    return {
      total: task.checklist_total ?? 0,
      checked: task.checklist_completed ?? 0,
    };
  }
  return null;
}

function sortTasks(tasks: Task[], sortBy: SortBy, sortDir: SortDir): Task[] {
  const sorted = [...tasks].sort((a, b) => {
    switch (sortBy) {
      case "title":
        return a.title.localeCompare(b.title);
      case "due_date": {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      }
      case "status": {
        const aCompleted = a.completed ? 1 : 0;
        const bCompleted = b.completed ? 1 : 0;
        return aCompleted - bCompleted;
      }
      case "created": {
        const aDate = a.created_at ?? "";
        const bDate = b.created_at ?? "";
        return aDate.localeCompare(bDate);
      }
      default:
        return 0;
    }
  });
  return sortDir === "desc" ? sorted.reverse() : sorted;
}

// ========================================
// Sub-components
// ========================================

function DueDateBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return <span className="text-xs text-slate-400">-</span>;

  const dday = getDDay(dueDate);
  const formatted = formatDate(dueDate, "MM/dd");

  let colorClass = "text-slate-400";
  if (dday.urgency === "overdue") colorClass = "text-red-400";
  else if (dday.urgency === "today" || dday.urgency === "soon")
    colorClass = "text-amber-400";

  return (
    <span className={`text-xs whitespace-nowrap ${colorClass}`}>
      {formatted}
    </span>
  );
}
DueDateBadge.displayName = "DueDateBadge";

function AssigneeAvatars({
  assignees,
  memberColorMap,
}: {
  assignees: { id: string; name: string }[];
  memberColorMap: Record<string, string | null>;
}) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-xs text-slate-400">-</span>;
  }

  const displayed = assignees.slice(0, 2);
  const remaining = assignees.length - 2;

  return (
    <div className="flex items-center -space-x-1.5">
      {displayed.map((a) => {
        const hex = getAssigneeHex(a.name, memberColorMap[a.id] ?? undefined);
        return (
          <div
            key={a.id}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ring-1 ring-bridge-dark shrink-0 overflow-hidden"
            style={{ backgroundColor: hex }}
            title={a.name}
          >
            {getInitials(a.name)}
          </div>
        );
      })}
      {remaining > 0 && (
        <span className="text-xs text-slate-400 ml-1.5">+{remaining}</span>
      )}
    </div>
  );
}
AssigneeAvatars.displayName = "AssigneeAvatars";

// ========================================
// Main Component
// ========================================

export function BoardListView({
  features,
  tasks,
  blocks,
  checklistDataMap,
  boardMembersData,
  memberColorMap,
  onViewFeature,
  onViewTask,
}: BoardListViewProps) {
  const { t } = useTranslation();

  // State
  const [groupBy, setGroupBy] = useState<GroupBy>("feature");
  const [sortBy, setSortBy] = useState<SortBy>("due_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const needsCollapseRef = useRef(true);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Build feature map for quick lookup
  const featureMap = useMemo(() => {
    const map = new Map<string, Feature>();
    features.forEach((f) => map.set(f.id, f));
    return map;
  }, [features]);

  // Build block map
  const blockMap = useMemo(() => {
    const map = new Map<string, Block>();
    blocks.forEach((b) => map.set(b.id, b));
    return map;
  }, [blocks]);

  // Build member name map for assignee grouping
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    boardMembersData.forEach((m) => {
      map.set(m.userId, m.name);
    });
    return map;
  }, [boardMembersData]);

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      const titleMatch = task.title.toLowerCase().includes(q);
      const featureMatch = task.feature_title?.toLowerCase().includes(q);
      const blockName = blockMap.get(task.block_id)?.name ?? "";
      const blockMatch = blockName.toLowerCase().includes(q);
      const assigneeMatch = task.assignees?.some((a) =>
        a.name.toLowerCase().includes(q),
      );
      return titleMatch || featureMatch || blockMatch || assigneeMatch;
    });
  }, [tasks, searchQuery, blockMap]);

  // Sort
  const sortedTasks = useMemo(
    () => sortTasks(filteredTasks, sortBy, sortDir),
    [filteredTasks, sortBy, sortDir],
  );

  // Group tasks
  const groups = useMemo((): TaskGroup[] => {
    if (groupBy === "none") {
      return [
        {
          key: "__all__",
          label: "",
          color: null,
          tasks: sortedTasks,
        },
      ];
    }

    const groupMap = new Map<string, TaskGroup>();

    sortedTasks.forEach((task) => {
      let key: string;
      let label: string;
      let color: string | null = null;
      let featureId: string | undefined;

      switch (groupBy) {
        case "feature": {
          const feature = featureMap.get(task.feature_id);
          key = task.feature_id;
          label =
            feature?.title ?? task.feature_title ?? t("listViewGroupNone");
          color = feature?.color ?? task.feature_color ?? null;
          featureId = task.feature_id;
          break;
        }
        case "block": {
          const block = blockMap.get(task.block_id);
          key = task.block_id;
          label = block?.name ?? task.block_name ?? t("listViewGroupNone");
          color = block?.color ?? null;
          break;
        }
        case "assignee": {
          const assignees = task.assignees ?? [];
          if (assignees.length === 0) {
            key = "__unassigned__";
            label = t("listViewGroupNone");
            color = null;
          } else {
            // Group by first assignee
            key = assignees[0].id;
            label = assignees[0].name;
            color = getAssigneeHex(
              assignees[0].name,
              memberColorMap[assignees[0].id] ?? undefined,
            );
          }
          break;
        }
        case "status": {
          const block = blockMap.get(task.block_id);
          const done = isDoneBlock(block);
          key = done ? "completed" : "in_progress";
          label = done
            ? t("listViewGroupStatus") + " - " + t("completed", "Done")
            : t("listViewGroupStatus") + " - " + t("inProgress", "In Progress");
          color = done ? "#10B981" : "#6366F1";
          break;
        }
        default:
          key = "__all__";
          label = "";
          color = null;
      }

      const existing = groupMap.get(key);
      if (existing) {
        existing.tasks.push(task);
      } else {
        groupMap.set(key, { key, label, color, tasks: [task], featureId });
      }
    });

    // Sort groups: for feature grouping, maintain feature position order
    const result = Array.from(groupMap.values());
    if (groupBy === "feature") {
      result.sort((a, b) => {
        const fa = featureMap.get(a.key);
        const fb = featureMap.get(b.key);
        return (fa?.position ?? 999) - (fb?.position ?? 999);
      });
    }

    // Within each group, push completed tasks to the bottom
    result.forEach((group) => {
      group.tasks.sort((a, b) => {
        const aBlock = blockMap.get(a.block_id);
        const bBlock = blockMap.get(b.block_id);
        const aDone = isDoneBlock(aBlock) || a.completed ? 1 : 0;
        const bDone = isDoneBlock(bBlock) || b.completed ? 1 : 0;
        return aDone - bDone;
      });
    });

    return result;
  }, [sortedTasks, groupBy, featureMap, blockMap, memberColorMap, t]);

  // 기본값: 모든 그룹 닫힌 상태 (초기 + groupBy 변경 시)
  useEffect(() => {
    if (needsCollapseRef.current && groups.length > 0 && groupBy !== "none") {
      needsCollapseRef.current = false;
      setCollapsedGroups(new Set(groups.map((g) => g.key)));
    }
  }, [groups, groupBy]);

  // Toggle group collapse
  const handleToggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  // W 단축키: bridge:toggleExpandCollapse 이벤트 리스너
  useEffect(() => {
    const handler = () => {
      if (groupBy === "none") return;
      setCollapsedGroups((prev) => {
        const allGroupKeys = groups.map((g) => g.key);
        const allCollapsed =
          allGroupKeys.length > 0 && allGroupKeys.every((k) => prev.has(k));
        if (allCollapsed) {
          return new Set<string>();
        } else {
          return new Set(allGroupKeys);
        }
      });
    };
    window.addEventListener("bridge:toggleExpandCollapse", handler);
    return () =>
      window.removeEventListener("bridge:toggleExpandCollapse", handler);
  }, [groupBy, groups]);

  // Toggle sort direction
  const handleToggleSortDir = useCallback(() => {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  // Handle search input
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [],
  );

  // Close dropdowns on outside click
  const handleDropdownBlur = useCallback(
    (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
      // Small delay to allow click events on dropdown items
      setTimeout(() => setter(false), 150);
    },
    [],
  );

  // ========================================
  // Render
  // ========================================

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 border-b border-foreground/[0.08] shrink-0">
        {/* Group by dropdown */}
        <div className="relative">
          <button
            className="flex items-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            onClick={() => setShowGroupDropdown((v) => !v)}
            onBlur={() => handleDropdownBlur(setShowGroupDropdown)}
            aria-haspopup="listbox"
            aria-expanded={showGroupDropdown}
            aria-label={t("listViewGroupBy")}
          >
            <Layers size={14} />
            <span className="hidden md:inline">{t("listViewGroupBy")}</span>
            <span className="text-foreground font-bold">
              {t(
                GROUP_OPTIONS.find((o) => o.value === groupBy)?.labelKey ?? "",
              )}
            </span>
          </button>
          {showGroupDropdown && (
            <div
              className="absolute left-0 top-full mt-1 z-20 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg shadow-xl py-1 min-w-[120px]"
              role="listbox"
              aria-label={t("listViewGroupBy")}
            >
              {GROUP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  role="option"
                  aria-selected={groupBy === opt.value}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    groupBy === opt.value
                      ? "text-bridge-accent font-bold bg-bridge-accent/10"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setGroupBy(opt.value);
                    needsCollapseRef.current = true;
                    setShowGroupDropdown(false);
                  }}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort by dropdown */}
        <div className="relative">
          <button
            className="flex items-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            onClick={() => setShowSortDropdown((v) => !v)}
            onBlur={() => handleDropdownBlur(setShowSortDropdown)}
            aria-haspopup="listbox"
            aria-expanded={showSortDropdown}
            aria-label={t("listViewSortBy")}
          >
            <ListFilter size={14} />
            <span className="hidden md:inline">{t("listViewSortBy")}</span>
            <span className="text-foreground font-bold">
              {t(SORT_OPTIONS.find((o) => o.value === sortBy)?.labelKey ?? "")}
            </span>
          </button>
          {showSortDropdown && (
            <div
              className="absolute left-0 top-full mt-1 z-20 bg-bridge-obsidian border border-foreground/[0.08] rounded-lg shadow-xl py-1 min-w-[120px]"
              role="listbox"
              aria-label={t("listViewSortBy")}
            >
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  role="option"
                  aria-selected={sortBy === opt.value}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    sortBy === opt.value
                      ? "text-bridge-accent font-bold bg-bridge-accent/10"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSortBy(opt.value);
                    setShowSortDropdown(false);
                  }}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort direction toggle */}
        <IconButton
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          onClick={handleToggleSortDir}
        >
          {sortDir === "asc" ? <ArrowUp /> : <ArrowDown />}
        </IconButton>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="relative w-36 md:w-48">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={t("search", "Search...")}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg py-1.5 pl-8 pr-3 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
            aria-label={t("search", "Search")}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {sortedTasks.length === 0 ? (
          /* Empty state */
          <motion.div
            className="flex flex-col items-center justify-center py-20 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <ArrowUpDown size={32} className="text-slate-500 mb-3" />
            <p className="text-sm text-slate-400">{t("listViewNoTasks")}</p>
          </motion.div>
        ) : (
          <div>
            {groups.map((group, groupIdx) => {
              const isCollapsed = collapsedGroups.has(group.key);
              const showHeader = groupBy !== "none";
              const completedCount = group.tasks.filter((task) => {
                const block = blockMap.get(task.block_id);
                return isDoneBlock(block) || task.completed;
              }).length;
              const allCompleted = completedCount === group.tasks.length && group.tasks.length > 0;

              return (
                <motion.div
                  key={group.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: groupIdx * 0.04 }}
                >
                  {/* Group header */}
                  {showHeader && (
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 bg-foreground/[0.03] border-b border-foreground/[0.08] cursor-pointer select-none"
                      onClick={() => handleToggleGroup(group.key)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={!isCollapsed}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleToggleGroup(group.key);
                        }
                      }}
                    >
                      <ChevronRight
                        size={14}
                        className={`text-slate-400 transition-transform duration-200 shrink-0 ${
                          !isCollapsed ? "rotate-90" : ""
                        }`}
                      />
                      {group.color && (
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                      )}
                      {group.featureId ? (
                        <span
                          className="text-[13px] font-bold text-foreground hover:text-bridge-accent transition-colors cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewFeature(group.featureId!);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              onViewFeature(group.featureId!);
                            }
                          }}
                          role="link"
                          tabIndex={0}
                        >
                          {group.label}
                        </span>
                      ) : (
                        <span className="text-[13px] font-bold text-foreground">
                          {group.label}
                        </span>
                      )}
                      <div className="flex items-center gap-1 ml-auto shrink-0">
                        <CheckCircle2
                          size={12}
                          className={allCompleted ? "text-emerald-500" : "text-slate-400"}
                          aria-hidden="true"
                        />
                        <span className={`text-xs font-medium ${allCompleted ? "text-emerald-500" : "text-slate-500"}`}>
                          {completedCount}/{group.tasks.length}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Task rows */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: "hidden" }}
                      >
                        {group.tasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            blocks={blocks}
                            blockMap={blockMap}
                            checklistDataMap={checklistDataMap}
                            memberColorMap={memberColorMap}
                            onViewTask={onViewTask}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
BoardListView.displayName = "BoardListView";

// ========================================
// TaskRow Component
// ========================================

function TaskRow({
  task,
  blockMap,
  checklistDataMap,
  memberColorMap,
  onViewTask,
}: {
  task: Task;
  blocks: Block[];
  blockMap: Map<string, Block>;
  checklistDataMap: { [taskId: string]: ChecklistItem[] };
  memberColorMap: Record<string, string | null>;
  onViewTask: (taskId: string) => void;
}) {
  const block = blockMap.get(task.block_id);
  const isCompleted = isDoneBlock(block) || task.completed;
  const featureColor = task.feature_color || "#6366F1";
  const checkProgress = getChecklistProgress(task, checklistDataMap);
  const assignees = task.assignees ?? [];

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b border-foreground/[0.08] hover:bg-foreground/[0.03] transition-colors cursor-pointer group"
      onClick={() => onViewTask(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onViewTask(task.id);
        }
      }}
      aria-label={task.title}
    >
      {/* Desktop layout */}
      <div className="hidden md:contents">
        {/* Completed check icon */}
        <CheckCircle2
          size={16}
          className={`shrink-0 ${isCompleted ? "text-emerald-500" : "text-slate-400"}`}
          aria-hidden="true"
        />

        {/* Feature color bar */}
        <div
          className="w-1 h-5 rounded-full shrink-0"
          style={{ backgroundColor: featureColor }}
          aria-hidden="true"
        />

        {/* Title */}
        <span
          className={`flex-1 text-sm truncate ${
            isCompleted ? "line-through text-slate-500" : "text-foreground"
          }`}
        >
          {task.title}
        </span>

        {/* Block badge */}
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/5 text-slate-400 shrink-0 w-[60px] text-center truncate">
          {block?.name ?? task.block_name ?? "-"}
        </span>

        {/* Assignees */}
        <div className="w-[80px] flex justify-center shrink-0">
          <AssigneeAvatars
            assignees={assignees}
            memberColorMap={memberColorMap}
          />
        </div>

        {/* Due date */}
        <div className="w-[60px] text-right shrink-0">
          <DueDateBadge dueDate={task.due_date} />
        </div>

        {/* Checklist progress */}
        <div className="w-[40px] text-right shrink-0">
          {checkProgress ? (
            <span className="text-xs text-slate-400">
              {checkProgress.checked}/{checkProgress.total}
            </span>
          ) : (
            <span className="text-xs text-slate-400">-</span>
          )}
        </div>
      </div>

      {/* Mobile card layout */}
      <div className="flex md:hidden flex-col gap-1 w-full min-w-0">
        <div className="flex items-center gap-2">
          <CheckCircle2
            size={16}
            className={`shrink-0 ${isCompleted ? "text-emerald-500" : "text-slate-400"}`}
            aria-hidden="true"
          />
          <div
            className="w-1 self-stretch rounded-full shrink-0"
            style={{ backgroundColor: featureColor }}
            aria-hidden="true"
          />
          <span
            className={`flex-1 text-sm truncate ${
              isCompleted ? "line-through text-slate-500" : "text-foreground"
            }`}
          >
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-7 text-xs text-slate-400">
          {assignees.length > 0 && (
            <span>{assignees.map((a) => a.name).join(", ")}</span>
          )}
          {task.due_date && (
            <>
              <span aria-hidden="true">&middot;</span>
              <DueDateBadge dueDate={task.due_date} />
            </>
          )}
          {checkProgress && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>
                {checkProgress.checked}/{checkProgress.total}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
TaskRow.displayName = "TaskRow";
