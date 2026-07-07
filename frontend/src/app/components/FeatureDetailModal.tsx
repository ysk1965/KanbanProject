import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Feature, Task, Tag, Milestone } from "../types";
import { FEATURE_COLORS } from "../constants";
import { sortByFeatureOrder } from "../utils/taskOrder";
import {
  X,
  Trash2,
  ClipboardList,
  Lightbulb,
  ArrowRight,
  ArrowRightLeft,
  FileText,
  CalendarIcon,
  Tags,
  Sparkles,
  Pencil,
  AlertTriangle,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { ColorPickerPopover } from "./ui/ColorPickerPopover";
import { TagPickerPopover } from "./TagPickerPopover";
import { featureAPI, taskAPI } from "../utils/api";
import { getTodayDateString } from "../utils/dateUtils";
import { FeatureAIDecomposeModal } from "./FeatureAIDecomposeModal";
import { useAuth } from "../contexts/AuthContext";
import { getAssigneeClasses, getInitials } from "../utils/assigneeColor";

// 마일스톤 색상 팔레트 — 마인드맵(MindMapView)의 MILESTONE_COLORS와 동일.
// 보드 milestones 배열의 인덱스로 색상을 파생해 두 화면의 마일스톤 색상을 일치시킨다.
const MILESTONE_COLORS = [
  "#6366F1", // indigo
  "#2DD4BF", // teal
  "#f59e0b", // amber
  "#a855f7", // purple
  "#f43f5e", // red/rose
  "#10b981",
  "#0ea5e9",
  "#ec4899",
];
const MILESTONE_UNASSIGNED_COLOR = "#64748b"; // slate — 미배치 그룹

interface FeatureDetailModalProps {
  feature: Feature | null;
  tasks: Task[];
  blocks: Array<{ id: string; name: string }>;
  /** 마일스톤 필터와 무관한 전체 블록 (타 마일스톤 태스크의 블록명 해석용). 미전달 시 blocks로 폴백. */
  allBlocks?: Array<{ id: string; name: string }>;
  milestones: Milestone[];
  open: boolean;
  onClose: () => void;
  onAddSubtask: (title: string, milestoneId: string | null) => void;
  onRenameSubtask?: (taskId: string, newTitle: string) => void;
  onReorderSubtasks?: (taskIds: string[]) => void;
  onUpdateFeature: (feature: Partial<Feature>) => void;
  onDelete: (
    featureId: string,
    taskMigrations?: Array<{ task_id: string; target_feature_id: string }>,
  ) => void;
  allFeatures: Feature[];
  availableTags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (
    tagId: string,
    data: { name?: string; color?: string },
  ) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  boardId: string;
  canEdit?: boolean;
  isOnboarding?: boolean;
  onTaskClick?: (task: Task) => void;
}

export function FeatureDetailModal({
  feature,
  tasks,
  blocks,
  allBlocks,
  milestones,
  open,
  onClose,
  onAddSubtask,
  onRenameSubtask,
  onReorderSubtasks,
  onUpdateFeature,
  onDelete,
  allFeatures,
  availableTags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  boardId,
  canEdit = true,
  isOnboarding = false,
  onTaskClick,
}: FeatureDetailModalProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newSubtaskMilestoneId, setNewSubtaskMilestoneId] = useState<
    string | null
  >(null);
  const [milestoneDropdownOpen, setMilestoneDropdownOpen] = useState(false);
  const [initialFeature, setInitialFeature] = useState<Feature | null>(null);
  const [editedFeature, setEditedFeature] = useState<Feature | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [taskMigrationMap, setTaskMigrationMap] = useState<
    Record<string, string>
  >({});
  const [bulkTargetFeatureId, setBulkTargetFeatureId] = useState<string>("");
  const [flyingTask, setFlyingTask] = useState<{
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showAIConfirm, setShowAIConfirm] = useState(false);
  const [showAIDecompose, setShowAIDecompose] = useState(false);
  const [dateCalendarOpen, setDateCalendarOpen] = useState(false);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const { isRestricted } = useAuth();

  useEffect(() => {
    if (feature && open) {
      setInitialFeature(JSON.parse(JSON.stringify(feature)));
      setEditedFeature(JSON.parse(JSON.stringify(feature)));
      setHasChanges(false);
      setIsEditingTitle(false);
      setShowDeleteDialog(false);
      setShowConfirmDialog(false);
    }
  }, [feature, open]);

  useEffect(() => {
    if (initialFeature && editedFeature) {
      const changed =
        JSON.stringify(initialFeature) !== JSON.stringify(editedFeature);
      setHasChanges(changed);
    }
  }, [initialFeature, editedFeature]);

  // 서브태스크 DnD 정렬 (hook은 early return 위에 선언 — React #310 방지)
  const subtaskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const sortedTasks = useMemo(() => sortByFeatureOrder(tasks), [tasks]);

  // 새 서브태스크의 마일스톤 선택 — 이 피처에 연결된 마일스톤 + '미배치'.
  // Feature에는 milestone 링크가 없어 milestones의 features에서 역참조(primaryMilestone과 동일 패턴).
  const featureMilestones = useMemo(
    () =>
      feature
        ? milestones.filter((m) =>
            (m.features ?? []).some((f) => f.id === feature.id),
          )
        : [],
    [feature, milestones],
  );
  // 기본값: 오늘 날짜가 포함되는 연결 마일스톤, 없으면 null(미배치).
  const defaultSubtaskMilestoneId = useMemo(() => {
    const today = getTodayDateString();
    const match = featureMilestones.find(
      (m) =>
        (m.start_date?.slice(0, 10) ?? "") <= today &&
        today <= (m.end_date?.slice(0, 10) ?? ""),
    );
    return match?.id ?? null;
  }, [featureMilestones]);

  useEffect(() => {
    if (feature && open) setNewSubtaskMilestoneId(defaultSubtaskMilestoneId);
  }, [feature, open, defaultSubtaskMilestoneId]);

  if (!open || !feature || !editedFeature) return null;

  const progressPercent = feature.progress_percentage;
  const completedCount = feature.completed_tasks;
  const totalCount = feature.total_tasks;

  // 이 피처가 (primary로) 속한 마일스톤 — 있으면 기간은 마일스톤을 따름(편집 불가).
  // Feature에는 milestone 링크가 없어 milestones의 로드된 features에서 역참조.
  // 로드 안 됐으면 undefined → 기존처럼 편집 가능(안전 폴백).
  const primaryMilestone = milestones.find((m) =>
    (m.features ?? []).some((f) => f.id === feature.id && f.is_primary),
  );

  const handleClose = () => {
    if (hasChanges) {
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  };

  const handleSave = () => {
    if (hasChanges && editedFeature) {
      onUpdateFeature(editedFeature);
      setInitialFeature(JSON.parse(JSON.stringify(editedFeature)));
      setHasChanges(false);
    }
  };

  const handleDiscardAndClose = () => {
    setShowConfirmDialog(false);
    onClose();
  };

  const handleSaveAndClose = () => {
    if (editedFeature) {
      onUpdateFeature(editedFeature);
    }
    setShowConfirmDialog(false);
    onClose();
  };

  const updateEditedFeature = (updates: Partial<Feature>) => {
    setEditedFeature((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleStartEditTask = (task: Task) => {
    if (!canEdit) return;
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleSaveTaskTitle = async () => {
    if (!editingTaskId || !editingTaskTitle.trim()) {
      setEditingTaskId(null);
      return;
    }
    const newTitle = editingTaskTitle.trim();
    const originalTask = tasks.find((t) => t.id === editingTaskId);
    if (originalTask && originalTask.title !== newTitle) {
      try {
        await taskAPI.updateTask(boardId, editingTaskId, { title: newTitle });
        onRenameSubtask?.(editingTaskId, newTitle);
      } catch (error) {
        console.error("Failed to rename subtask:", error);
      }
    }
    setEditingTaskId(null);
  };

  const handleSubtaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedTasks.findIndex((t) => t.id === active.id);
    const newIndex = orderedTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(orderedTasks, oldIndex, newIndex);
    onReorderSubtasks?.(reordered.map((t) => t.id));
  };

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      if (addBtnRef.current) {
        const rect = addBtnRef.current.getBoundingClientRect();
        setFlyingTask({
          title: newSubtaskTitle.trim(),
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
        setTimeout(() => setFlyingTask(null), 800);
      }
      onAddSubtask(newSubtaskTitle.trim(), newSubtaskMilestoneId);
      setNewSubtaskTitle("");
      setNewSubtaskMilestoneId(defaultSubtaskMilestoneId);
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!feature) return;
    const currentTags = editedFeature.tags || [];
    const tagToAdd = availableTags.find((t) => t.id === tagId);
    if (tagToAdd && !currentTags.some((t) => t.id === tagId)) {
      updateEditedFeature({ tags: [...currentTags, tagToAdd] });
      try {
        await featureAPI.addTag(boardId, feature.id, tagId);
      } catch (error) {
        console.error("Failed to add tag:", error);
        updateEditedFeature({ tags: currentTags });
      }
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!feature) return;
    const currentTags = editedFeature.tags || [];
    updateEditedFeature({ tags: currentTags.filter((t) => t.id !== tagId) });
    try {
      await featureAPI.removeTag(boardId, feature.id, tagId);
    } catch (error) {
      console.error("Failed to remove tag:", error);
      updateEditedFeature({ tags: currentTags });
    }
  };

  const handleToggleTag = (tagId: string) => {
    const currentTags = editedFeature.tags || [];
    const isSelected = currentTags.some((t) => t.id === tagId);
    if (isSelected) {
      handleRemoveTag(tagId);
    } else {
      handleAddTag(tagId);
    }
  };

  const getBlockName = (blockId: string) => {
    // 마일스톤 필터로 blocks가 축소되어도 타 마일스톤 태스크의 블록명을 해석하려면 전체 블록(allBlocks)을 우선 조회
    const blockPool = allBlocks && allBlocks.length > 0 ? allBlocks : blocks;
    return blockPool.find((b) => b.id === blockId)?.name || blockId;
  };

  const getTaskMilestoneTitle = (milestoneId?: string | null) =>
    milestoneId
      ? milestones.find((m) => m.id === milestoneId)?.title
      : undefined;

  // 마일스톤 색상 — 보드 milestones 배열 내 인덱스로 파생(마인드맵과 일치). 미배치는 slate.
  const getMilestoneColor = (milestoneId?: string | null) => {
    if (!milestoneId) return MILESTONE_UNASSIGNED_COLOR;
    const idx = milestones.findIndex((m) => m.id === milestoneId);
    return idx >= 0
      ? MILESTONE_COLORS[idx % MILESTONE_COLORS.length]
      : MILESTONE_UNASSIGNED_COLOR;
  };

  // 서브태스크를 마일스톤별로 그룹핑(마인드맵 taskGroups 규칙 재사용).
  // 보드 milestones 순서(=색상 idx 순) → 미배치 → 고아 마일스톤 순. 버킷 내 순서는 sortedTasks 유지(안정).
  const taskGroups = useMemo(() => {
    const byMs = new Map<string | null, Task[]>();
    for (const t of sortedTasks) {
      const key = t.milestone_id ?? null;
      if (!byMs.has(key)) byMs.set(key, []);
      byMs.get(key)!.push(t);
    }
    const groups: {
      key: string;
      milestoneId: string | null;
      title: string;
      color: string;
      tasks: Task[];
    }[] = [];
    const consumed = new Set<string | null>();
    for (const m of milestones) {
      const ts = byMs.get(m.id);
      if (ts?.length) {
        groups.push({
          key: m.id,
          milestoneId: m.id,
          title: m.title,
          color: getMilestoneColor(m.id),
          tasks: ts,
        });
        consumed.add(m.id);
      }
    }
    // milestones에 없는 마일스톤 id를 가진 태스크(고아) 처리
    for (const [key, ts] of byMs) {
      if (key !== null && !consumed.has(key) && ts.length) {
        groups.push({
          key,
          milestoneId: key,
          title: getTaskMilestoneTitle(key) ?? key,
          color: getMilestoneColor(key),
          tasks: ts,
        });
      }
    }
    const unassigned = byMs.get(null);
    if (unassigned?.length) {
      groups.push({
        key: "__unassigned__",
        milestoneId: null,
        title: t("featureDetail.milestoneUnassigned"),
        color: MILESTONE_UNASSIGNED_COLOR,
        tasks: unassigned,
      });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedTasks, milestones, t]);

  // 마일스톤이 2개 이상으로 나뉠 때만 그룹 뷰로 전환(그 외엔 기존 평면 리스트).
  const grouped = taskGroups.length > 1;
  // 그룹 뷰의 시각 순서와 DnD/재정렬 기준을 일치시키기 위한 평탄화 목록.
  const orderedTasks = useMemo(
    () => (grouped ? taskGroups.flatMap((g) => g.tasks) : sortedTasks),
    [grouped, taskGroups, sortedTasks],
  );

  const featureTags = editedFeature.tags || [];
  const selectedColor = editedFeature.color || "#8B5CF6";

  // 서브태스크 한 행 렌더링. grouped일 때 점 색상은 마일스톤 색을 따르고,
  // 우측 라벨의 마일스톤명은 그룹 헤더로 승격되어 중복 표기하지 않는다(블록명만 표시).
  const renderSubtaskRow = (task: Task) => {
    const dotColor = grouped
      ? getMilestoneColor(task.milestone_id)
      : selectedColor;
    const milestoneTitle = getTaskMilestoneTitle(task.milestone_id);
    return (
      <SortableSubtaskRow
        key={task.id}
        taskId={task.id}
        dragEnabled={canEdit && !!onReorderSubtasks && orderedTasks.length > 1}
        className={`flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors group ${onTaskClick ? "cursor-pointer" : ""}`}
        onClick={() => {
          if (onTaskClick && editingTaskId !== task.id) {
            onTaskClick(task);
          }
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: dotColor,
              boxShadow: `0 0 8px ${dotColor}44`,
            }}
          />
          {editingTaskId === task.id ? (
            <input
              ref={editInputRef}
              type="text"
              value={editingTaskTitle}
              onChange={(e) => setEditingTaskTitle(e.target.value)}
              onBlur={handleSaveTaskTitle}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") handleSaveTaskTitle();
                if (e.key === "Escape") setEditingTaskId(null);
              }}
              className="flex-1 text-xs font-medium bg-foreground/5 border border-bridge-accent/50 rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
            />
          ) : (
            <span
              className={`text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors truncate ${canEdit ? "cursor-text hover:bg-foreground/5 rounded px-1 -mx-1" : ""}`}
              onClick={(e) => {
                if (canEdit) {
                  e.stopPropagation();
                  handleStartEditTask(task);
                }
              }}
            >
              {task.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 flex-shrink-0 ml-2">
          <span className="tracking-widest transition-colors">
            →{" "}
            {!grouped && milestoneTitle && (
              <span className="text-bridge-accent">{milestoneTitle} · </span>
            )}
            {getBlockName(task.block_id).toUpperCase()}
          </span>
        </div>
      </SortableSubtaskRow>
    );
  };

  // 마일스톤 그룹 구분선(마인드맵 divider 언어 재사용: 색상 라인 + 제목 + done/total).
  const renderMilestoneDivider = (group: (typeof taskGroups)[number]) => {
    const c = group.color;
    const done = group.tasks.filter((tk) => tk.completed).length;
    return (
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <span className="flex-1 h-px" style={{ background: `${c}4D` }} />
        <span
          className="text-xs font-bold whitespace-nowrap"
          style={{ color: c }}
        >
          {group.title}
        </span>
        <span
          className="text-xs font-bold whitespace-nowrap tabular-nums"
          style={{ color: `${c}99` }}
        >
          {done}/{group.tasks.length}
        </span>
        <span className="flex-1 h-px" style={{ background: `${c}26` }} />
      </div>
    );
  };

  return (
    <>
      <MotionModal
        open={open}
        onClose={handleClose}
        overlayClose={!hasChanges}
        className="sm:max-w-xl max-h-[85dvh] flex flex-col overflow-hidden bg-bridge-surface p-0"
      >
        {/* Feature color accent line */}
        <div
          className="h-[3px] w-full flex-shrink-0 rounded-t-lg"
          style={{ backgroundColor: selectedColor }}
        />

        {/* Top Control Bar */}
        <div className="px-6 py-4 border-b border-bridge-border/30 flex-shrink-0">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 group">
                {/* Color Picker */}
                <ColorPickerPopover
                  colors={FEATURE_COLORS}
                  selectedColor={selectedColor}
                  onColorChange={(color) => updateEditedFeature({ color })}
                  disabled={!canEdit}
                  customColorLabel={t("featureDetail.customColor")}
                />

                {/* Title - hover to edit */}
                {canEdit && isEditingTitle ? (
                  <Input
                    value={editedFeature.title}
                    onChange={(e) =>
                      updateEditedFeature({ title: e.target.value })
                    }
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter" || e.key === "Escape") {
                        setIsEditingTitle(false);
                      }
                    }}
                    className="text-lg font-bold border border-foreground/10 px-2 py-1 rounded-lg focus-visible:ring-1 focus-visible:ring-bridge-accent bg-foreground/5 text-foreground"
                    autoFocus
                  />
                ) : (
                  <div
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${canEdit ? "cursor-pointer hover:bg-foreground/5" : ""}`}
                    onClick={() => canEdit && setIsEditingTitle(true)}
                  >
                    <span className="text-lg font-bold text-foreground">
                      {editedFeature.title}
                    </span>
                    {canEdit && (
                      <Pencil className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <button
                  onClick={handleClose}
                  className="p-2 text-slate-400 hover:text-foreground transition-colors"
                  aria-label="닫기"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-10 custom-scrollbar">
          <div className="space-y-3">
            {/* 인라인 메타바: 기간 · 담당자(서브태스크 집계) · 태그 */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 기간 칩 */}
              {(() => {
                // 마일스톤에 속하면 기간은 마일스톤을 따름 — 읽기 전용 표시
                if (primaryMilestone) {
                  const parseYmd = (s: string) => {
                    const [y, m, d] = s.split("-").map(Number);
                    return new Date(y, m - 1, d);
                  };
                  return (
                    <div
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border bg-bridge-accent/[0.12] border-bridge-accent/35 text-foreground cursor-default"
                      title={t(
                        "feature.periodFollowsMilestone",
                        "마일스톤 기간을 따릅니다",
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 text-bridge-accent" />
                      <span>
                        {format(parseYmd(primaryMilestone.start_date), "M.d", {
                          locale: ko,
                        })}
                        {" ~ "}
                        {format(parseYmd(primaryMilestone.end_date), "M.d", {
                          locale: ko,
                        })}
                      </span>
                    </div>
                  );
                }
                const hasDate = !!(
                  editedFeature.start_date || editedFeature.due_date
                );
                const dateLabel = hasDate ? (
                  <span>
                    {editedFeature.start_date
                      ? format(new Date(editedFeature.start_date), "M.d", {
                          locale: ko,
                        })
                      : "?"}
                    {" ~ "}
                    {editedFeature.due_date
                      ? format(new Date(editedFeature.due_date), "M.d", {
                          locale: ko,
                        })
                      : "?"}
                  </span>
                ) : (
                  <span>{t("featureDetail.selectDateRange")}</span>
                );
                const chipClass = `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  hasDate
                    ? "bg-bridge-accent/[0.12] border-bridge-accent/35 text-foreground hover:bg-bridge-accent/20"
                    : "bg-foreground/[0.04] border-foreground/10 text-slate-400 hover:bg-foreground/10"
                }`;
                const chipInner = (
                  <>
                    <CalendarIcon
                      className={`h-3.5 w-3.5 ${hasDate ? "text-bridge-accent" : "text-slate-400"}`}
                    />
                    {dateLabel}
                  </>
                );
                if (!canEdit) {
                  return (
                    <div className={`${chipClass} cursor-default`}>
                      {chipInner}
                    </div>
                  );
                }
                return (
                  <Popover
                    open={dateCalendarOpen}
                    onOpenChange={setDateCalendarOpen}
                  >
                    <PopoverTrigger asChild>
                      <button type="button" className={chipClass}>
                        {chipInner}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 bg-bridge-obsidian border-foreground/10"
                      align="start"
                    >
                      <Calendar
                        mode="range"
                        selected={
                          editedFeature.start_date || editedFeature.due_date
                            ? {
                                from: editedFeature.start_date
                                  ? new Date(editedFeature.start_date)
                                  : undefined,
                                to: editedFeature.due_date
                                  ? new Date(editedFeature.due_date)
                                  : undefined,
                              }
                            : undefined
                        }
                        onSelect={(range: DateRange | undefined) => {
                          updateEditedFeature({
                            start_date: range?.from
                              ? format(range.from, "yyyy-MM-dd")
                              : null,
                            due_date: range?.to
                              ? format(range.to, "yyyy-MM-dd")
                              : null,
                          });
                        }}
                        numberOfMonths={2}
                        locale={ko}
                        className="bg-bridge-obsidian text-foreground"
                      />
                      {hasDate && (
                        <div className="p-2 border-t border-foreground/10 flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() =>
                              updateEditedFeature({
                                start_date: null,
                                due_date: null,
                              })
                            }
                          >
                            {t("featureDetail.removeDate")}
                          </Button>
                          {editedFeature.start_date &&
                            editedFeature.due_date && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 font-bold"
                                onClick={() => setDateCalendarOpen(false)}
                              >
                                {t("common.confirm", "확인")}
                              </Button>
                            )}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                );
              })()}

              {/* 담당자 칩 (서브태스크 담당자 집계, 읽기 전용) */}
              {(() => {
                const uniqueAssignees = tasks
                  .flatMap((tk) => tk.assignees || [])
                  .reduce(
                    (acc, a) => {
                      if (a && !acc.find((x) => x.id === a.id)) acc.push(a);
                      return acc;
                    },
                    [] as Array<{ id: string; name: string }>,
                  );

                if (uniqueAssignees.length === 0) return null;

                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border bg-foreground/[0.04] border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors"
                      >
                        <div className="flex items-center">
                          {uniqueAssignees.slice(0, 4).map((a, i) => {
                            const color = getAssigneeClasses(a.name);
                            return (
                              <div
                                key={a.id}
                                className={`w-6 h-6 rounded-full ${color.bg} flex items-center justify-center text-xs text-white border-2 border-bridge-obsidian whitespace-nowrap overflow-hidden leading-none ${i > 0 ? "-ml-2" : ""}`}
                                style={
                                  !color.bg
                                    ? { backgroundColor: color.hex }
                                    : undefined
                                }
                              >
                                {getInitials(a.name)}
                              </div>
                            );
                          })}
                        </div>
                        <span className="text-slate-400">
                          {t("task.assigneeCount", {
                            count: uniqueAssignees.length,
                            defaultValue: "담당 {{count}}명",
                          })}
                        </span>
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-64 p-2 bg-bridge-obsidian border-foreground/10"
                    >
                      <div className="px-1 pb-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                        {t("task.assignee")}
                      </div>
                      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto custom-scrollbar">
                        {uniqueAssignees.map((a) => {
                          const color = getAssigneeClasses(a.name);
                          return (
                            <div
                              key={a.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                            >
                              <div
                                className={`w-6 h-6 rounded-full ${color.bg} flex items-center justify-center text-xs text-white whitespace-nowrap overflow-hidden leading-none`}
                                style={
                                  !color.bg
                                    ? { backgroundColor: color.hex }
                                    : undefined
                                }
                              >
                                {getInitials(a.name)}
                              </div>
                              <span className="text-sm text-foreground truncate">
                                {a.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })()}

              {/* 태그 칩 */}
              {featureTags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5"
                  style={{
                    backgroundColor: `${tag.color}15`,
                    borderColor: `${tag.color}44`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  {canEdit && (
                    <button
                      onClick={() => handleRemoveTag(tag.id)}
                      className="hover:opacity-80"
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {canEdit && (
                <TagPickerPopover
                  selectedTagIds={featureTags.map((t) => t.id)}
                  availableTags={availableTags}
                  onToggleTag={handleToggleTag}
                  onCreateTag={onCreateTag}
                  onUpdateTag={onUpdateTag}
                  onDeleteTag={onDeleteTag}
                />
              )}
            </div>

            {/* Description Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" />
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  {t("featureDetail.description")}
                </Label>
              </div>
              <Textarea
                placeholder={t("featureDetail.descriptionPlaceholder")}
                value={editedFeature.description || ""}
                onChange={(e) =>
                  canEdit &&
                  updateEditedFeature({ description: e.target.value })
                }
                readOnly={!canEdit}
                rows={7}
                className={`bg-bridge-dark/50 border-bridge-border/30 text-foreground placeholder:text-slate-500 focus:ring-bridge-accent/50 focus:border-bridge-accent ${!canEdit ? "cursor-default" : ""}`}
              />
            </div>

            {/* Subtask Module */}
            <div
              className={`mt-6 pt-6 border-t border-foreground/10 relative ${isOnboarding && tasks.length === 0 ? "z-10" : ""}`}
            >
              <div className="flex items-center justify-between mb-4 relative">
                <div className="flex items-center gap-2">
                  <ClipboardList
                    className="h-5 w-5"
                    style={{ color: selectedColor }}
                  />
                  <Label className="text-base font-bold text-foreground">
                    {t("featureDetail.subtaskList")}
                  </Label>
                  {canEdit && !isRestricted && (
                    <button
                      onClick={() => setShowAIConfirm(true)}
                      className="ml-1 flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-lg hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all"
                    >
                      <Sparkles className="h-3 w-3" />
                      AI
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-foreground/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${progressPercent}%`,
                        backgroundColor: selectedColor,
                      }}
                    />
                  </div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: selectedColor }}
                  >
                    {Math.round(progressPercent)}%
                  </span>
                </div>
              </div>

              <div
                className={`relative bg-bridge-dark/40 rounded-xl overflow-hidden transition-all duration-500 ${isOnboarding && tasks.length === 0 ? "border-2 border-bridge-accent/50" : "border border-bridge-border/30"}`}
              >
                {/* 온보딩 펄스 글로우 */}
                {isOnboarding && tasks.length === 0 && (
                  <motion.div
                    className="absolute inset-0 rounded-xl pointer-events-none z-0"
                    animate={{
                      boxShadow: [
                        "0 0 0 2px rgba(99,102,241,0.2), 0 0 15px rgba(99,102,241,0.08)",
                        "0 0 0 3px rgba(99,102,241,0.5), 0 0 40px rgba(99,102,241,0.2), 0 0 80px rgba(99,102,241,0.08)",
                        "0 0 0 2px rgba(99,102,241,0.2), 0 0 15px rgba(99,102,241,0.08)",
                      ],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )}
                {/* Task Entries */}
                <div className="divide-y divide-white/5 relative z-[1]">
                  {tasks.length === 0 && (
                    <div className="relative">
                      {isOnboarding ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{
                            delay: 0.3,
                            type: "spring",
                            stiffness: 260,
                            damping: 22,
                          }}
                          className="m-4 p-4 rounded-xl bg-gradient-to-r from-bridge-accent/15 via-purple-500/10 to-bridge-accent/15 border border-bridge-accent/30"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <motion.div
                              animate={{
                                scale: [1, 1.2, 1],
                                boxShadow: [
                                  "0 0 0 0 rgba(99,102,241,0)",
                                  "0 0 0 8px rgba(99,102,241,0.2)",
                                  "0 0 0 0 rgba(99,102,241,0)",
                                ],
                              }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="px-2.5 h-8 rounded-lg bg-gradient-to-br from-bridge-accent to-purple-500 flex items-center justify-center flex-shrink-0"
                            >
                              <span className="text-xs font-bold text-white tracking-widest uppercase">
                                Step 2
                              </span>
                            </motion.div>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-white">
                                {t("featureDetail.onboardingStep2")}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {t("featureDetail.subtaskDescription")}
                              </p>
                            </div>
                          </div>
                          {/* 포인팅 화살표 */}
                          <motion.div
                            animate={{ y: [0, 4, 0] }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                            className="flex items-center justify-center gap-1.5 text-bridge-accent/70"
                          >
                            <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                            <span className="text-xs font-bold tracking-wider uppercase">
                              {t("featureDetail.addSubtaskGuide")}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                          </motion.div>
                        </motion.div>
                      ) : (
                        <>
                          <div className="px-5 pt-5 pb-3 flex items-start gap-3">
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ backgroundColor: `${selectedColor}15` }}
                            >
                              <Lightbulb
                                size={14}
                                style={{ color: selectedColor }}
                              />
                            </div>
                            <div>
                              <p className="text-xs font-medium text-foreground mb-1">
                                {t("featureDetail.addSubtaskGuide")}
                              </p>
                              <p className="text-xs text-slate-500 leading-relaxed">
                                {t("featureDetail.subtaskDescription")}
                              </p>
                            </div>
                          </div>
                        </>
                      )}
                      {/* Example subtasks (visual guide) */}
                      <div className="mx-4 mb-4 rounded-lg border border-dashed border-foreground/10 overflow-hidden opacity-40 pointer-events-none select-none">
                        <div className="px-3 py-1.5 bg-white/[0.02]">
                          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            예시
                          </span>
                        </div>
                        <div className="divide-y divide-white/5">
                          {[
                            "API 엔드포인트 설계",
                            "화면 UI 구현",
                            "테스트 코드 작성",
                          ].map((title, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between px-4 py-3"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor: selectedColor,
                                    boxShadow: `0 0 8px ${selectedColor}44`,
                                  }}
                                />
                                <span className="text-xs font-medium text-slate-400">
                                  {title}
                                </span>
                              </div>
                              <span className="text-xs font-bold tracking-widest text-slate-500">
                                →{" "}
                                {i === 0
                                  ? "TASK"
                                  : i === 1
                                    ? "IN PROGRESS"
                                    : "DONE ✓"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <DndContext
                    sensors={subtaskSensors}
                    collisionDetection={closestCenter}
                    modifiers={[
                      restrictToVerticalAxis,
                      restrictToParentElement,
                    ]}
                    onDragEnd={handleSubtaskDragEnd}
                  >
                    <SortableContext
                      items={orderedTasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {grouped
                        ? taskGroups.map((group) => (
                            <div key={group.key}>
                              {renderMilestoneDivider(group)}
                              {group.tasks.map((task) =>
                                renderSubtaskRow(task),
                              )}
                            </div>
                          ))
                        : orderedTasks.map((task) => renderSubtaskRow(task))}
                    </SortableContext>
                  </DndContext>
                </div>

                {/* Quick Add Dock */}
                {canEdit && (
                  <motion.div
                    className={`relative z-[1] p-2 flex gap-2 border-t transition-all ${isOnboarding && tasks.length === 0 ? "bg-bridge-accent/5 border-bridge-accent/20" : "bg-bridge-dark/30 border-bridge-border/20"}`}
                    animate={
                      isOnboarding && tasks.length === 0
                        ? {
                            backgroundColor: [
                              "rgba(99,102,241,0.03)",
                              "rgba(99,102,241,0.08)",
                              "rgba(99,102,241,0.03)",
                            ],
                          }
                        : {}
                    }
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <Popover
                      open={milestoneDropdownOpen}
                      onOpenChange={setMilestoneDropdownOpen}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          title={t("featureDetail.selectMilestone")}
                          className="flex items-center gap-1 flex-shrink-0 rounded-lg px-2.5 py-2.5 text-xs text-foreground bg-bridge-dark/50 border border-bridge-border/30 hover:border-bridge-accent/50 transition-all max-w-[130px]"
                        >
                          <span className="truncate">
                            {featureMilestones.find(
                              (m) => m.id === newSubtaskMilestoneId,
                            )?.title ?? t("featureDetail.milestoneUnassigned")}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-52 p-1">
                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                          <button
                            type="button"
                            onClick={() => {
                              setNewSubtaskMilestoneId(null);
                              setMilestoneDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                              newSubtaskMilestoneId === null
                                ? "bg-bridge-accent/15 text-bridge-accent font-bold"
                                : "text-foreground hover:bg-foreground/5"
                            }`}
                          >
                            {t("featureDetail.milestoneUnassigned")}
                          </button>
                          {featureMilestones.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setNewSubtaskMilestoneId(m.id);
                                setMilestoneDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-colors ${
                                newSubtaskMilestoneId === m.id
                                  ? "bg-bridge-accent/15 text-bridge-accent font-bold"
                                  : "text-foreground hover:bg-foreground/5"
                              }`}
                            >
                              {m.title}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <input
                      type="text"
                      placeholder={t("featureDetail.newSubtaskPlaceholder")}
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === "Enter") handleAddSubtask();
                      }}
                      className={`flex-1 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent text-foreground transition-all ${isOnboarding && tasks.length === 0 ? "bg-bridge-dark/70 border-2 border-bridge-accent/40 placeholder-slate-500 shadow-[0_0_12px_rgba(99,102,241,0.15)]" : "bg-bridge-dark/50 border border-bridge-border/30 placeholder-slate-500"}`}
                      autoFocus={isOnboarding && tasks.length === 0}
                    />
                    <motion.button
                      ref={addBtnRef}
                      onClick={handleAddSubtask}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg border transition-all active:scale-95"
                      style={{
                        backgroundColor:
                          isOnboarding && tasks.length === 0
                            ? `${selectedColor}25`
                            : `${selectedColor}15`,
                        color: selectedColor,
                        borderColor: `${selectedColor}33`,
                      }}
                      animate={
                        isOnboarding && tasks.length === 0
                          ? { scale: [1, 1.05, 1] }
                          : {}
                      }
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      ADD
                    </motion.button>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Save/Cancel - shown only with changes */}
            {canEdit && hasChanges && (
              <div className="flex justify-end gap-2 pt-4 border-t border-foreground/10">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditedFeature(
                      JSON.parse(JSON.stringify(initialFeature)),
                    );
                    setHasChanges(false);
                  }}
                  className="bg-foreground/5 border-foreground/10 text-foreground hover:bg-foreground/10"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-bridge-accent hover:bg-bridge-accent/90"
                >
                  {t("common.save")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </MotionModal>

      {/* Confirm Dialog */}
      <MotionModal
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        className="sm:max-w-sm p-6"
      >
        <h3 className="text-lg font-bold text-foreground">
          {t("featureDetail.saveChangesTitle")}
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          {t("featureDetail.saveChangesDesc")}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
          <button
            onClick={handleDiscardAndClose}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
          >
            {t("featureDetail.discard")}
          </button>
          <button
            onClick={handleSaveAndClose}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-bridge-accent text-white hover:bg-bridge-accent/90"
          >
            {t("common.save")}
          </button>
        </div>
      </MotionModal>

      {/* Delete Dialog - 태스크 이관 모달 */}
      <MotionModal
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setTaskMigrationMap({});
          setBulkTargetFeatureId("");
        }}
        className={`${tasks.length > 0 ? "sm:max-w-lg" : "sm:max-w-sm"} p-0 max-h-[80dvh] flex flex-col overflow-hidden`}
      >
        {tasks.length > 0 ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-foreground/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <ArrowRightLeft className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {t("featureDetail.deleteTitle")}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t("featureDetail.taskMigrationDesc", {
                      count: tasks.length,
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Bulk migration */}
            <div className="px-6 py-3 border-b border-foreground/5 bg-foreground/[0.02] flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                  {t("featureDetail.bulkMigrate", "일괄 이관")}
                </span>
                <div className="relative flex-1">
                  <select
                    value={bulkTargetFeatureId}
                    onChange={(e) => {
                      const targetId = e.target.value;
                      setBulkTargetFeatureId(targetId);
                      if (targetId) {
                        const newMap: Record<string, string> = {};
                        tasks.forEach((t) => {
                          newMap[t.id] = targetId;
                        });
                        setTaskMigrationMap(newMap);
                      } else {
                        setTaskMigrationMap({});
                      }
                    }}
                    className="w-full appearance-none bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 pr-8 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-bridge-accent/50"
                  >
                    <option value="">
                      {t("featureDetail.selectFeature", "이관할 피처 선택...")}
                    </option>
                    {allFeatures
                      .filter((f) => f.id !== feature.id)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.title}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Task list with individual migration selectors */}
            <div className="flex-1 overflow-y-auto px-6 py-3 custom-scrollbar">
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-foreground/[0.03] border border-foreground/5"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: feature.color,
                        boxShadow: `0 0 6px ${feature.color}44`,
                      }}
                    />
                    <span
                      className="text-xs font-medium text-foreground truncate flex-1 min-w-0"
                      title={task.title}
                    >
                      {task.title}
                    </span>
                    <div className="relative flex-shrink-0">
                      <select
                        value={taskMigrationMap[task.id] || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTaskMigrationMap((prev) => {
                            const next = { ...prev };
                            if (val) {
                              next[task.id] = val;
                            } else {
                              delete next[task.id];
                            }
                            return next;
                          });
                          setBulkTargetFeatureId("");
                        }}
                        className="appearance-none bg-foreground/5 border border-foreground/10 rounded-md px-2.5 py-1.5 pr-7 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-bridge-accent/50 max-w-[160px]"
                      >
                        <option value="">
                          {t("featureDetail.deleteWithFeature", "삭제")}
                        </option>
                        {allFeatures
                          .filter((f) => f.id !== feature.id)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.title}
                            </option>
                          ))}
                      </select>
                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-foreground/10 flex-shrink-0">
              {/* Warning for tasks to be deleted */}
              {(() => {
                const deleteCount = tasks.filter(
                  (t) => !taskMigrationMap[t.id],
                ).length;
                const migrateCount = tasks.filter(
                  (t) => !!taskMigrationMap[t.id],
                ).length;
                return (
                  <>
                    {deleteCount > 0 && (
                      <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-300">
                          {t("featureDetail.deleteWarning", {
                            deleteCount,
                            defaultValue: `${deleteCount}개 태스크가 피처와 함께 삭제됩니다.`,
                          })}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowDeleteDialog(false);
                          setTaskMigrationMap({});
                          setBulkTargetFeatureId("");
                        }}
                        className="flex-1 inline-flex items-center justify-center rounded-lg text-sm font-medium h-10 px-4 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        onClick={() => {
                          const migrations = Object.entries(taskMigrationMap)
                            .filter(([, targetId]) => targetId)
                            .map(([taskId, targetId]) => ({
                              task_id: taskId,
                              target_feature_id: targetId,
                            }));
                          onDelete(
                            feature.id,
                            migrations.length > 0 ? migrations : undefined,
                          );
                          onClose();
                        }}
                        className={`flex-1 inline-flex items-center justify-center rounded-lg text-sm font-bold h-10 px-4 text-white transition-all ${
                          migrateCount > 0
                            ? "bg-bridge-accent hover:bg-bridge-accent/90"
                            : "bg-red-500 hover:bg-red-600"
                        }`}
                      >
                        {migrateCount > 0
                          ? t("featureDetail.migrateAndDelete", {
                              migrateCount,
                              defaultValue: `${migrateCount}개 이관 후 삭제`,
                            })
                          : t("featureDetail.deleteAll", "전체 삭제")}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          /* 태스크 없을 때: 간단 확인 모달 */
          <div className="p-6">
            <h3 className="text-lg font-bold text-foreground">
              {t("featureDetail.deleteTitle")}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {t("featureDetail.deleteDesc")}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  onDelete(feature.id);
                  onClose();
                }}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-red-500 hover:bg-red-600 text-white"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        )}
      </MotionModal>

      {/* AI Confirm Modal */}
      {showAIConfirm && feature && (
        <MotionModal
          open={true}
          onClose={() => setShowAIConfirm(false)}
          className="sm:max-w-md p-0 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-bridge-secondary to-bridge-accent flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                {t("featureDetail.aiConfirmTitle")}
              </h3>
            </div>
            <button
              onClick={() => setShowAIConfirm(false)}
              className="text-slate-400 hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-4">
            <p className="text-xs text-slate-400">
              {t("featureDetail.aiConfirmDesc")}
            </p>

            {/* Feature title */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {t("featureDetail.aiConfirmFeatureTitle")}
              </label>
              <input
                type="text"
                value={editedFeature.title}
                onChange={(e) => updateEditedFeature({ title: e.target.value })}
                className="w-full px-3 py-2.5 bg-white/5 rounded-lg border border-foreground/5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>

            {/* Feature description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
                {t("featureDetail.aiConfirmFeatureDesc")}
              </label>
              <textarea
                value={editedFeature.description || ""}
                onChange={(e) =>
                  updateEditedFeature({ description: e.target.value })
                }
                placeholder={t("featureDetail.aiConfirmNoDesc")}
                rows={3}
                className="w-full px-3 py-2.5 bg-white/5 rounded-lg border border-foreground/5 text-sm text-slate-300 placeholder-amber-400/60 resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-foreground/5 flex justify-end gap-2">
            <button
              onClick={() => setShowAIConfirm(false)}
              className="px-4 py-2 text-sm text-slate-400 hover:text-foreground transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => {
                if (hasChanges && editedFeature) {
                  onUpdateFeature(editedFeature);
                  setInitialFeature(JSON.parse(JSON.stringify(editedFeature)));
                  setHasChanges(false);
                }
                setShowAIConfirm(false);
                setShowAIDecompose(true);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-lg hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all flex items-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("featureDetail.aiConfirmStart")}
            </button>
          </div>
        </MotionModal>
      )}

      {/* AI Decompose Modal */}
      {showAIDecompose && feature && (
        <FeatureAIDecomposeModal
          boardId={boardId}
          featureId={feature.id}
          featureTitle={editedFeature.title}
          existingTaskTitles={tasks.map((t) => t.title)}
          onClose={() => setShowAIDecompose(false)}
          onApplied={() => {
            setShowAIDecompose(false);
          }}
        />
      )}

      {/* Flying task animation (portal) */}
      {flyingTask &&
        createPortal(
          <AnimatePresence>
            <motion.div
              key="flying-task"
              initial={{
                x: flyingTask.x,
                y: flyingTask.y,
                opacity: 1,
                scale: 1,
              }}
              animate={{
                x: window.innerWidth * 0.15,
                y: flyingTask.y - 120,
                opacity: 0,
                scale: 0.7,
              }}
              transition={{ duration: 0.65, ease: [0.32, 0.72, 0, 1] }}
              className="fixed z-[100] pointer-events-none"
              style={{ top: 0, left: 0 }}
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg shadow-[0_0_20px_rgba(99,102,241,0.5)]">
                <ArrowRight size={12} className="text-white" />
                <span className="text-xs font-bold text-white whitespace-nowrap">
                  TASK
                </span>
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

// 서브태스크 DnD 정렬 행 (드래그 핸들은 hover 시 노출)
function SortableSubtaskRow({
  taskId,
  dragEnabled,
  className,
  onClick,
  children,
}: {
  taskId: string;
  dragEnabled: boolean;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: taskId, disabled: !dragEnabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={className}
      onClick={onClick}
    >
      {dragEnabled && (
        <span
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 -ml-2 mr-2 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      {children}
    </div>
  );
}
