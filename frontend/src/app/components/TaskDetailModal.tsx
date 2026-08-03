import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Task,
  Tag,
  ChecklistItem,
  User,
  Block,
  Feature,
  Milestone,
  BoardWebSocketEvent,
  BoardContractor,
  ContractorInfo,
} from "../types";
import {
  checklistAPI,
  taskAPI,
  scheduleAPI,
  ScheduleBlockDetailResponse,
  trashAPI,
} from "../utils/api";
import { toast } from "sonner";
import { BoardMember } from "./ShareBoardModal";
import { MotionModal } from "./ui/MotionModal";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Badge } from "./ui/badge";
import { Calendar } from "./ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  X,
  Plus,
  Trash2,
  Clock,
  CheckSquare,
  CalendarIcon,
  FileText,
  Tags,
  Users,
  Layers,
  Pencil,
  CheckCircle2,
  Undo2,
  ChevronDown,
  ChevronRight,
  Target,
  Loader2,
  MessageSquare,
  Lightbulb,
  ArrowRightLeft,
  GitMerge,
  History,
  MoreVertical,
  GripVertical,
  ArrowRight,
  Copy,
  Sparkles,
  AlertCircle,
  Link,
  Check,
  Wrench,
  List,
  LayoutGrid,
  Search,
} from "lucide-react";
import { TaskMoveModal } from "./TaskMoveModal";
import { TaskAIChecklistModal } from "./TaskAIChecklistModal";
import { ChecklistHistoryModal } from "./ChecklistHistoryModal";
import { TaskHeaderActionsMenu } from "./TaskHeaderActionsMenu";
import { BlockStatusPicker } from "./BlockStatusPicker";
import { CommentPanel } from "./CommentPanel";
import { TagPickerPopover } from "./TagPickerPopover";
import { getAssigneeClasses, getInitials } from "../utils/assigneeColor";
import { ChecklistStatusBoard } from "./ChecklistStatusBoard";
import {
  resolveChecklistColumn,
  type ChecklistColumn,
} from "../utils/checklistStatus";
import { useAuth } from "../contexts/AuthContext";
import { Progress } from "./ui/progress";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { getTodayDateString } from "../utils/dateUtils";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Task>) => void;
  onDelete: (taskId: string) => void;
  onMoveToDone?: (taskId: string) => void;
  onMoveToBlock?: (taskId: string, blockId: string) => void;
  onMoveToFeature?: (taskId: string, featureId: string) => void;
  onMoveChecklistToTask?: (
    checklistItemId: string,
    sourceTaskId: string,
    targetTaskId: string,
  ) => void;
  blocks?: Block[];
  features?: Feature[];
  allTasks?: Task[];
  milestones?: Milestone[];
  currentMilestoneId?: string;
  availableTags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<string | undefined>;
  onUpdateTag: (
    tagId: string,
    data: { name?: string; color?: string },
  ) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  boardMembers: BoardMember[];
  contractors?: BoardContractor[];
  currentUser: User | null;
  boardId: string | null;
  canEdit?: boolean;
  isAdminOrOwner?: boolean;
  isPersonal?: boolean;
  wsCommentEvent?: BoardWebSocketEvent | null;
  wsChecklistEvent?: BoardWebSocketEvent | null;
  onOpenFeature?: (featureId: string) => void;
  onChecklistSync?: (taskId: string, items: ChecklistItem[]) => void;
  highlightChecklistItemId?: string | null;
}

export function TaskDetailModal({
  task,
  open,
  onClose,
  onUpdate,
  onDelete,
  onMoveToDone,
  onMoveToBlock,
  onMoveToFeature,
  onMoveChecklistToTask,
  blocks = [],
  features = [],
  allTasks = [],
  milestones = [],
  currentMilestoneId,
  availableTags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  boardMembers,
  contractors = [],
  currentUser,
  boardId,
  canEdit = true,
  isAdminOrOwner = false,
  isPersonal = false,
  wsCommentEvent,
  wsChecklistEvent,
  onOpenFeature,
  onChecklistSync,
  highlightChecklistItemId,
}: TaskDetailModalProps) {
  const { t } = useTranslation();
  const { isRestricted } = useAuth();

  // 변경사항 추적
  const [initialTask, setInitialTask] = useState<Task | null>(null);
  const [editedTask, setEditedTask] = useState<Task | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [checklistCopied, setChecklistCopied] = useState(false);
  const [showDoneDialog, setShowDoneDialog] = useState(false);
  const [showMoveFeatureDialog, setShowMoveFeatureDialog] = useState(false);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(
    null,
  );
  // Feature 이동: 대상 마일스톤 선택 (기본값 = "all" 전체)
  const [moveFeatureMilestoneId, setMoveFeatureMilestoneId] = useState<
    string | null
  >(null);
  // Feature 이동: 이름 검색어
  const [moveFeatureSearch, setMoveFeatureSearch] = useState("");
  const [showMoveChecklistDialog, setShowMoveChecklistDialog] = useState(false);
  const [moveChecklistItemId, setMoveChecklistItemId] = useState<string | null>(
    null,
  );
  const [selectedTargetTaskId, setSelectedTargetTaskId] = useState<
    string | null
  >(null);
  // 체크리스트 이동: 좌측 피처 선택 (기본값 = 현재 항목이 속한 피처)
  const [selectedTargetFeatureId, setSelectedTargetFeatureId] = useState<
    string | null
  >(null);
  // 체크리스트 병합: 대표 항목(시작점) + 흡수할 소스 항목 선택
  const [mergeTargetItemId, setMergeTargetItemId] = useState<string | null>(
    null,
  );
  const [mergeSelectedIds, setMergeSelectedIds] = useState<Set<string>>(
    new Set(),
  );
  const [mergeTitle, setMergeTitle] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  // 체크리스트 이동: 대상 마일스톤 선택 (기본값 = 현재 마일스톤)
  const [moveTargetMilestoneId, setMoveTargetMilestoneId] = useState<
    string | null
  >(null);
  const [moveMilestoneTasks, setMoveMilestoneTasks] = useState<
    {
      id: string;
      title: string;
      feature_id: string;
      feature_title: string;
      feature_color: string;
      completed: boolean;
      completed_at?: string | null;
    }[]
  >([]);
  const [loadingMoveMilestoneTasks, setLoadingMoveMilestoneTasks] =
    useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [moveCopyMode, setMoveCopyMode] = useState<"move" | "copy" | null>(
    null,
  );
  const [showAIConfirm, setShowAIConfirm] = useState(false);
  const [showAIChecklist, setShowAIChecklist] = useState(false);

  // 체크리스트 상태
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistItemToDelete, setChecklistItemToDelete] = useState<
    string | null
  >(null);
  const [checklistTimeBlocksMap, setChecklistTimeBlocksMap] = useState<
    Record<string, ScheduleBlockDetailResponse[]>
  >({});
  // 체크리스트 담당자 필터 (모달 로컬, 임시) — 빈 배열이면 필터 미적용
  // '__no_assignee__' 토큰은 미할당 항목을 의미
  const [filterAssigneeIds, setFilterAssigneeIds] = useState<string[]>([]);
  const [milestonePickerOpen, setMilestonePickerOpen] = useState(false);
  const highlightChecklistRef = useRef<HTMLDivElement>(null);
  const hasScrolledToHighlightRef = useRef(false);

  useEffect(() => {
    // 모달이 닫히면 다음 열림에서 다시 스크롤되도록 플래그 리셋
    if (!open) {
      hasScrolledToHighlightRef.current = false;
      return;
    }
    // 열림 세션당 1회만 '(현재)' 항목으로 스크롤 — 이후 체크리스트 변경 시 강제 재정렬 안 함
    if (
      !hasScrolledToHighlightRef.current &&
      highlightChecklistItemId &&
      highlightChecklistRef.current
    ) {
      hasScrolledToHighlightRef.current = true;
      highlightChecklistRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [highlightChecklistItemId, checklistItems, open]);

  useEffect(() => {
    if (task && open) {
      setInitialTask(JSON.parse(JSON.stringify(task)));
      setEditedTask(JSON.parse(JSON.stringify(task)));
      setIsEditingTitle(false);
      setChecklistItems([]); // 체크리스트 초기화
      setFilterAssigneeIds([]); // 담당자 필터 초기화

      // 체크리스트 API 로드
      if (boardId) {
        setChecklistTimeBlocksMap({});
        checklistAPI
          .getChecklist(boardId, task.id)
          .then((response) => {
            const rawItems = response.items || [];
            const items: ChecklistItem[] = rawItems.map((item) => ({
              id: item.id,
              title: item.title,
              completed: item.completed,
              position: item.position,
              start_date: item.start_date,
              due_date: item.due_date,
              done_date: item.done_date,
              assignee: item.assignee
                ? {
                    id: item.assignee.id,
                    name: item.assignee.name,
                    profile_image: item.assignee.profile_image,
                  }
                : null,
              contractor: item.contractor ?? null,
            }));
            setChecklistItems(items);

            // 벌크로 스케줄 블록 로드 (N+1 → 1회 호출)
            if (items.length > 0) {
              const itemIds = items.map((i) => i.id);
              scheduleAPI
                .getByChecklistItems(boardId!, itemIds)
                .then((result) => {
                  // 모든 아이템에 대해 키가 존재하도록 보장 (undefined 방지)
                  const fullMap: Record<string, ScheduleBlockDetailResponse[]> =
                    {};
                  for (const id of itemIds) {
                    fullMap[id] = result[id] || [];
                  }
                  setChecklistTimeBlocksMap(fullMap);
                })
                .catch(() => {
                  // 실패 시에도 빈 배열로 초기화하여 스피너 해제
                  const emptyMap: Record<
                    string,
                    ScheduleBlockDetailResponse[]
                  > = {};
                  for (const id of itemIds) {
                    emptyMap[id] = [];
                  }
                  setChecklistTimeBlocksMap(emptyMap);
                });
            } else {
              // 체크리스트 아이템이 없으면 빈 맵으로 로딩 완료 표시
              setChecklistTimeBlocksMap({});
            }
          })
          .catch((error) => {
            console.error("Failed to load checklist:", error);
            setChecklistTimeBlocksMap({});
          });
      }
    }
  }, [task, open, boardId]);

  // WebSocket 체크리스트 이벤트 처리
  useEffect(() => {
    if (!wsChecklistEvent || !task || !open) return;
    const { type, data } = wsChecklistEvent;
    const payload = data as Record<string, unknown>;
    const taskId = payload.task_id as string;
    if (taskId !== task.id) return;

    switch (type) {
      case "CHECKLIST_TOGGLED":
      case "CHECKLIST_UPDATED": {
        const item = payload.item as ChecklistItem;
        setChecklistItems((prev) => {
          const newItems = prev.map((ci) =>
            ci.id === item.id ? { ...ci, ...item } : ci,
          );
          const completed = newItems.filter((ci) => ci.completed).length;
          onUpdate({
            checklist_total: newItems.length,
            checklist_completed: completed,
            checklist_version: Date.now(),
          });
          return newItems;
        });
        break;
      }
      case "CHECKLIST_CREATED": {
        const item = payload.item as ChecklistItem;
        setChecklistItems((prev) => {
          if (prev.some((ci) => ci.id === item.id)) return prev;
          const newItems = [...prev, item];
          const completed = newItems.filter((ci) => ci.completed).length;
          onUpdate({
            checklist_total: newItems.length,
            checklist_completed: completed,
            checklist_version: Date.now(),
          });
          return newItems;
        });
        break;
      }
      case "CHECKLIST_DELETED": {
        const deletedId = payload.id as string;
        setChecklistItems((prev) => {
          const newItems = prev.filter((ci) => ci.id !== deletedId);
          const completed = newItems.filter((ci) => ci.completed).length;
          onUpdate({
            checklist_total: newItems.length,
            checklist_completed: completed,
            checklist_version: Date.now(),
          });
          return newItems;
        });
        break;
      }
    }
  }, [wsChecklistEvent, task, open, onUpdate]);

  // Auto-save: 설명 debounce + 기간 즉시 저장
  const descriptionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const autoSaveFields = useCallback(
    (updates: Partial<Task>) => {
      onUpdate(updates);
      setInitialTask((prev) => (prev ? { ...prev, ...updates } : null));
    },
    [onUpdate],
  );

  // 태스크 마일스톤 배정 (""=해제). 피처가 미연결 마일스톤이면 백엔드가 자동 연결.
  const handleAssignMilestone = useCallback(
    (milestoneId: string) => {
      setMilestonePickerOpen(false);
      const nextId = milestoneId === "" ? null : milestoneId;
      setEditedTask((prev) =>
        prev ? { ...prev, milestone_id: nextId } : prev,
      );
      onUpdate({ milestone_id: milestoneId === "" ? "" : milestoneId });
    },
    [onUpdate],
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setEditedTask((prev) => (prev ? { ...prev, description: value } : null));
      if (descriptionTimerRef.current)
        clearTimeout(descriptionTimerRef.current);
      descriptionTimerRef.current = setTimeout(() => {
        autoSaveFields({ description: value });
      }, 800);
    },
    [autoSaveFields],
  );

  useEffect(() => {
    return () => {
      if (descriptionTimerRef.current) {
        clearTimeout(descriptionTimerRef.current);
      }
    };
  }, []);

  const handleDateRangeChange = useCallback(
    (range: DateRange | undefined) => {
      const updates = {
        start_date: range?.from ? format(range.from, "yyyy-MM-dd") : null,
        due_date: range?.to ? format(range.to, "yyyy-MM-dd") : null,
      };
      setEditedTask((prev) => (prev ? { ...prev, ...updates } : null));
      autoSaveFields(updates);
    },
    [autoSaveFields],
  );

  const handleDateRangeClear = useCallback(() => {
    const updates = { start_date: null, due_date: null };
    setEditedTask((prev) => (prev ? { ...prev, ...updates } : null));
    autoSaveFields(updates);
  }, [autoSaveFields]);

  // 체크리스트 뷰 모드 (리스트 ↔ 상태 보드) — 전역 선호값 유지
  const [checklistViewMode, setChecklistViewMode] = useState<"list" | "board">(
    () => {
      const saved =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("checklistViewMode")
          : null;
      return saved === "board" ? "board" : "list";
    },
  );
  const handleChecklistViewModeChange = useCallback(
    (mode: "list" | "board") => {
      setChecklistViewMode(mode);
      try {
        localStorage.setItem("checklistViewMode", mode);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // 체크리스트 드래그 앤 드롭 (hooks must be before early return)
  const checklistSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortedChecklistItems = useMemo(
    () => [...checklistItems].sort((a, b) => a.position - b.position),
    [checklistItems],
  );

  const visibleChecklistItems = useMemo(() => {
    if (filterAssigneeIds.length === 0) return sortedChecklistItems;
    const includesUnassigned = filterAssigneeIds.includes("__no_assignee__");
    const realIds = filterAssigneeIds.filter((id) => id !== "__no_assignee__");
    return sortedChecklistItems.filter(
      (item) =>
        (includesUnassigned && !item.assignee) ||
        (item.assignee && realIds.includes(item.assignee.id)),
    );
  }, [sortedChecklistItems, filterAssigneeIds]);

  const isChecklistFilterActive = filterAssigneeIds.length > 0;

  // 담당자 칩 레일용 집계 — 담당 건수 내림차순, 동수는 이름순
  const checklistAssigneeStats = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        profile_image: string | null;
        count: number;
      }
    >();
    let unassignedCount = 0;
    checklistItems.forEach((item) => {
      if (!item.assignee) {
        unassignedCount += 1;
        return;
      }
      const existing = map.get(item.assignee.id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(item.assignee.id, { ...item.assignee, count: 1 });
      }
    });
    const assignees = [...map.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"),
    );
    return { assignees, unassignedCount };
  }, [checklistItems]);

  const toggleAssigneeFilter = useCallback((id: string) => {
    setFilterAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleCopyTaskLink = useCallback(async () => {
    if (!boardId || !task) return;
    // 사람이 읽는 키가 있으면 짧은 키 링크(/t/STORY-42), 없으면 기존 딥링크로 폴백
    const url = task.task_key
      ? `${window.location.origin}/t/${task.task_key}`
      : `${window.location.origin}/boards/${boardId}?task=${task.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setLinkCopied(true);
    toast.success(t("share.linkCopied"));
    setTimeout(() => setLinkCopied(false), 2000);
  }, [boardId, task, t]);

  // 체크리스트를 메타데이터 포함 텍스트로 복사 (현재 보이는 항목, 표시 순서)
  const handleCopyChecklistText = useCallback(async () => {
    const fmtDate = (item: ChecklistItem): string | null => {
      const endDate =
        item.completed && item.done_date ? item.done_date : item.due_date;
      if (item.start_date && endDate)
        return `${format(new Date(item.start_date), "M/d", { locale: ko })} - ${format(new Date(endDate), "M/d", { locale: ko })}`;
      if (item.start_date)
        return `${format(new Date(item.start_date), "M/d", { locale: ko })} ~`;
      if (endDate)
        return `~ ${format(new Date(endDate), "M/d", { locale: ko })}`;
      return null;
    };
    const fmtTime = (itemId: string): string | null => {
      const blocks = checklistTimeBlocksMap[itemId] || [];
      const total = blocks.reduce(
        (sum, b) =>
          sum +
          Math.round(
            (new Date(`2000-01-01T${b.end_time}`).getTime() -
              new Date(`2000-01-01T${b.start_time}`).getTime()) /
              60000,
          ),
        0,
      );
      if (total <= 0) return null;
      const h = Math.floor(total / 60);
      const m = total % 60;
      return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${total}m`;
    };

    const text = visibleChecklistItems
      .map((item) => {
        const meta: string[] = [];
        const d = fmtDate(item);
        if (d) meta.push(d);
        const who = item.contractor?.name || item.assignee?.name;
        if (who) meta.push(who);
        const tm = fmtTime(item.id);
        if (tm) meta.push(tm);
        return meta.length
          ? `- ${item.title} (${meta.join(", ")})`
          : `- ${item.title}`;
      })
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setChecklistCopied(true);
    toast.success(
      t("task.checklistCopied", {
        defaultValue: "체크리스트가 복사되었습니다",
      }),
    );
    setTimeout(() => setChecklistCopied(false), 2000);
  }, [visibleChecklistItems, checklistTimeBlocksMap, t]);

  const handleTitleCommit = useCallback(() => {
    if (!editedTask || !initialTask) {
      setIsEditingTitle(false);
      return;
    }
    const trimmed = editedTask.title.trim();
    if (!trimmed) {
      setEditedTask((prev) =>
        prev ? { ...prev, title: initialTask.title } : null,
      );
      setIsEditingTitle(false);
      return;
    }
    if (trimmed !== initialTask.title) {
      autoSaveFields({ title: trimmed });
      if (trimmed !== editedTask.title) {
        setEditedTask((prev) => (prev ? { ...prev, title: trimmed } : null));
      }
    }
    setIsEditingTitle(false);
  }, [editedTask, initialTask, autoSaveFields]);

  const handleTitleCancel = useCallback(() => {
    if (initialTask) {
      setEditedTask((prev) =>
        prev ? { ...prev, title: initialTask.title } : null,
      );
    }
    setIsEditingTitle(false);
  }, [initialTask]);

  // 체크리스트 이동 다이얼로그: 현재 마일스톤 기본값 계산
  const defaultMoveMilestoneId = useMemo(() => {
    if (milestones.length === 0) return null;
    if (
      currentMilestoneId &&
      currentMilestoneId !== "all" &&
      milestones.some((m) => m.id === currentMilestoneId)
    ) {
      return currentMilestoneId;
    }
    const containing = milestones.find((m) =>
      m.features?.some((f) => f.id === task?.feature_id),
    );
    return containing?.id ?? milestones[0].id;
  }, [milestones, currentMilestoneId, task?.feature_id]);

  // 이동 다이얼로그가 열릴 때 기본 마일스톤 설정
  useEffect(() => {
    if (showMoveChecklistDialog) {
      setMoveTargetMilestoneId((prev) => prev ?? defaultMoveMilestoneId);
    }
  }, [showMoveChecklistDialog, defaultMoveMilestoneId]);

  // Feature 이동 후보: 전체 Feature 단일 목록 + 각 Feature의 소속 마일스톤(역참조)
  // 탭/검색 필터는 렌더 단에서 적용한다.
  const moveFeatureCandidates = useMemo<
    {
      id: string;
      title: string;
      color: string;
      milestones: { id: string; title: string }[];
    }[]
  >(() => {
    if (milestones.length > 0) {
      const map = new Map<
        string,
        {
          id: string;
          title: string;
          color: string;
          milestones: { id: string; title: string }[];
        }
      >();
      milestones.forEach((m) => {
        (m.features ?? []).forEach((f) => {
          const existing = map.get(f.id);
          if (existing) {
            existing.milestones.push({ id: m.id, title: m.title });
          } else {
            map.set(f.id, {
              id: f.id,
              title: f.title,
              color: f.color,
              milestones: [{ id: m.id, title: m.title }],
            });
          }
        });
      });
      // 마일스톤에 속하지 않은 Feature도 이동 대상으로 포함(배지는 없음)
      features.forEach((f) => {
        if (!map.has(f.id)) {
          map.set(f.id, {
            id: f.id,
            title: f.title,
            color: f.color,
            milestones: [],
          });
        }
      });
      return Array.from(map.values());
    }
    return features.map((f) => ({
      id: f.id,
      title: f.title,
      color: f.color,
      milestones: [],
    }));
  }, [milestones, features]);

  // 현재 Task가 속한 Feature 정보 ("지금" 칩 + 기본 마일스톤 선택용)
  const currentFeatureInfo = useMemo(
    () => moveFeatureCandidates.find((f) => f.id === task?.feature_id) ?? null,
    [moveFeatureCandidates, task?.feature_id],
  );

  // Feature 이동 다이얼로그가 열릴 때 기본값 = 현재 Feature가 속한 마일스톤(없으면 전체)
  useEffect(() => {
    if (showMoveFeatureDialog) {
      const preferred = currentFeatureInfo?.milestones[0]?.id ?? "all";
      setMoveFeatureMilestoneId((prev) => prev ?? preferred);
    }
  }, [showMoveFeatureDialog, currentFeatureInfo]);

  // 선택된 마일스톤의 Task 목록 로드 (현재 마일스톤은 이미 로드된 allTasks 재사용)
  useEffect(() => {
    if (!showMoveChecklistDialog || !boardId) return;
    const targetMilestoneId = moveTargetMilestoneId;
    if (
      !targetMilestoneId ||
      (targetMilestoneId === currentMilestoneId && allTasks.length > 0)
    ) {
      setMoveMilestoneTasks(
        allTasks.map((tk) => ({
          id: tk.id,
          title: tk.title,
          feature_id: tk.feature_id,
          feature_title: tk.feature_title,
          feature_color: tk.feature_color,
          completed: tk.completed,
          completed_at: tk.completed_at,
        })),
      );
      return;
    }
    let cancelled = false;
    setLoadingMoveMilestoneTasks(true);
    taskAPI
      .getTasks(boardId, { milestone_id: targetMilestoneId })
      .then((res) => {
        if (cancelled) return;
        setMoveMilestoneTasks(
          (res.tasks ?? []).map((tk) => ({
            id: tk.id,
            title: tk.title,
            feature_id: tk.feature_id,
            feature_title: tk.feature_title,
            feature_color: tk.feature_color,
            completed: tk.completed,
            completed_at: tk.completed_at,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setMoveMilestoneTasks([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMoveMilestoneTasks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    showMoveChecklistDialog,
    boardId,
    moveTargetMilestoneId,
    currentMilestoneId,
    allTasks,
  ]);

  // 이동 대상 Task를 피처 단위로 그룹핑 (2단 드릴다운 좌측 컬럼)
  const moveTargetFeatures = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        title: string;
        color: string;
        tasks: typeof moveMilestoneTasks;
      }
    >();
    for (const mt of moveMilestoneTasks) {
      let group = map.get(mt.feature_id);
      if (!group) {
        group = {
          id: mt.feature_id,
          title: mt.feature_title,
          color: mt.feature_color,
          tasks: [],
        };
        map.set(mt.feature_id, group);
      }
      group.tasks.push(mt);
    }
    return Array.from(map.values());
  }, [moveMilestoneTasks]);

  // 기본 선택: 현재 항목이 속한 피처를 자동 선택 (없으면 첫 피처)
  useEffect(() => {
    if (!showMoveChecklistDialog || moveTargetFeatures.length === 0) return;
    setSelectedTargetFeatureId((prev) => {
      if (prev && moveTargetFeatures.some((f) => f.id === prev)) return prev;
      const current = moveTargetFeatures.find((f) => f.id === task?.feature_id);
      return (current ?? moveTargetFeatures[0]).id;
    });
  }, [showMoveChecklistDialog, moveTargetFeatures, task?.feature_id]);

  if (!task || !editedTask) return null;

  const handleClose = () => {
    // pending description 저장 flush
    if (descriptionTimerRef.current && editedTask) {
      clearTimeout(descriptionTimerRef.current);
      descriptionTimerRef.current = null;
      autoSaveFields({ description: editedTask.description });
    }
    onClose();
  };

  const updateEditedTask = (updates: Partial<Task>) => {
    setEditedTask((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleAddTag = async (tagId: string) => {
    if (!boardId || !task) return;

    const currentTags = editedTask.tags || [];
    const tagToAdd = availableTags.find((t) => t.id === tagId);
    if (tagToAdd && !currentTags.some((t) => t.id === tagId)) {
      // 낙관적 업데이트
      updateEditedTask({ tags: [...currentTags, tagToAdd] });

      try {
        // API 호출: POST /boards/{boardId}/tasks/{taskId}/tags
        await taskAPI.addTag(boardId, task.id, tagId);
      } catch (error) {
        console.error("Failed to add tag:", error);
        // 롤백
        updateEditedTask({ tags: currentTags });
      }
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!boardId || !task) return;

    const currentTags = editedTask.tags || [];
    // 낙관적 업데이트
    updateEditedTask({ tags: currentTags.filter((t) => t.id !== tagId) });

    try {
      // API 호출: DELETE /boards/{boardId}/tasks/{taskId}/tags/{tagId}
      await taskAPI.removeTag(boardId, task.id, tagId);
    } catch (error) {
      console.error("Failed to remove tag:", error);
      // 롤백
      updateEditedTask({ tags: currentTags });
    }
  };

  const handleToggleTag = (tagId: string) => {
    const currentTags = editedTask.tags || [];
    const isSelected = currentTags.some((t) => t.id === tagId);
    if (isSelected) {
      handleRemoveTag(tagId);
    } else {
      handleAddTag(tagId);
    }
  };

  // 체크리스트 관련 함수
  const handleAddChecklistItem = async (data: {
    title: string;
    start_date?: string;
    due_date?: string;
    assignee_id?: string;
  }) => {
    if (!data.title.trim() || !boardId || !task) return;

    try {
      const response = await checklistAPI.addItem(boardId, task.id, {
        title: data.title.trim(),
        assignee_id: data.assignee_id,
        start_date: data.start_date,
        due_date: data.due_date,
      });

      const newItem: ChecklistItem = {
        id: response.id,
        title: response.title,
        completed: response.completed,
        position: response.position,
        start_date: response.start_date,
        due_date: response.due_date,
        done_date: response.done_date,
        assignee: response.assignee
          ? {
              id: response.assignee.id,
              name: response.assignee.name,
              profile_image: response.assignee.profile_image,
            }
          : null,
        contractor: response.contractor ?? null,
      };

      const newItems = [...checklistItems, newItem];
      setChecklistItems(newItems);

      // 새 아이템에 대한 타임블록 맵 초기화 (스피너 방지)
      setChecklistTimeBlocksMap((prev) => ({ ...prev, [newItem.id]: [] }));

      // 부모 상태 업데이트 (카드에 반영)
      const newTotal = newItems.length;
      const newCompleted = newItems.filter((item) => item.completed).length;
      onUpdate({
        checklist_total: newTotal,
        checklist_completed: newCompleted,
        checklist_version: Date.now(),
      });
      onChecklistSync?.(task.id, newItems);
    } catch (error) {
      console.error("Failed to add checklist item:", error);
    }
  };

  const handleToggleChecklistItem = async (itemId: string) => {
    if (!boardId || !task) return;

    const prevItems = [...checklistItems];
    const targetItem = checklistItems.find((item) => item.id === itemId);
    if (!targetItem) return;

    const newCompleted = !targetItem.completed;
    const today = getTodayDateString();

    // 낙관적 업데이트 - done_date도 함께 업데이트
    const newItems = checklistItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            completed: newCompleted,
            done_date: newCompleted ? today : null, // 완료시 오늘 날짜, 미완료시 null
          }
        : item,
    );
    setChecklistItems(newItems);

    try {
      await checklistAPI.toggleItem(boardId, task.id, itemId);
      // API 성공 후 부모 상태 업데이트 (카드 + 스케줄 뷰 반영)
      const completedCount = newItems.filter((item) => item.completed).length;
      onUpdate({
        checklist_total: newItems.length,
        checklist_completed: completedCount,
        checklist_version: Date.now(),
      });
      onChecklistSync?.(task.id, newItems);
    } catch (error) {
      console.error("Failed to toggle checklist item:", error);
      // 롤백
      setChecklistItems(prevItems);
    }
  };

  const handleUpdateChecklistItem = async (
    itemId: string,
    updates: Partial<ChecklistItem>,
  ) => {
    if (!boardId || !task) return;

    // 낙관적 업데이트
    setChecklistItems(
      checklistItems.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item,
      ),
    );

    const updatedItems = checklistItems.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item,
    );

    // 호출자가 명시적으로 보낸 키만 PATCH payload에 포함.
    // 키 자체가 없으면 서버가 기존 값을 보존, 값이 null이면 명시적 클리어.
    const payload: {
      title?: string;
      assignee_id?: string | null;
      contractor_id?: string | null;
      start_date?: string | null;
      due_date?: string | null;
    } = {};
    if ("title" in updates && updates.title !== undefined) {
      payload.title = updates.title;
    }
    if ("assignee" in updates) {
      payload.assignee_id = updates.assignee?.id ?? null;
    }
    if ("contractor" in updates) {
      payload.contractor_id = updates.contractor?.id ?? null;
    }
    if ("start_date" in updates) {
      payload.start_date = updates.start_date ?? null;
    }
    if ("due_date" in updates) {
      payload.due_date = updates.due_date ?? null;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    try {
      await checklistAPI.patchItem(boardId, task.id, itemId, payload);
      // 체크리스트 버전 업데이트하여 카드에 변경 알림
      onUpdate({ checklist_version: Date.now() });
      onChecklistSync?.(task.id, updatedItems);
    } catch (error) {
      console.error("Failed to update checklist item:", error);
    }
  };

  // 상태 보드 열 이동 — 완료 토글 + start_date 패치를 한 번에 원자적으로 처리
  // (개별 핸들러 2회 호출 시 낙관적 setState 충돌 방지)
  const handleMoveChecklistColumn = async (
    item: ChecklistItem,
    target: ChecklistColumn,
  ) => {
    if (!boardId || !task || !canEdit) return;
    const today = getTodayDateString();
    if (resolveChecklistColumn(item, today) === target) return;

    const prevItems = [...checklistItems];
    let newCompleted = item.completed;
    let newStart = item.start_date;
    let newDone = item.done_date;
    const apiCalls: Promise<unknown>[] = [];

    if (target === "done") {
      if (!item.completed) {
        newCompleted = true;
        newDone = today;
        apiCalls.push(checklistAPI.toggleItem(boardId, task.id, item.id));
      }
    } else {
      // todo / doing 공통: 완료 상태면 해제
      if (item.completed) {
        newCompleted = false;
        newDone = null;
        apiCalls.push(checklistAPI.toggleItem(boardId, task.id, item.id));
      }
      const targetStart = target === "doing" ? today : null;
      if (item.start_date !== targetStart) {
        newStart = targetStart;
        apiCalls.push(
          checklistAPI.patchItem(boardId, task.id, item.id, {
            start_date: targetStart,
          }),
        );
      }
    }

    if (apiCalls.length === 0) return;

    // 낙관적 업데이트
    const newItems = checklistItems.map((ci) =>
      ci.id === item.id
        ? {
            ...ci,
            completed: newCompleted,
            done_date: newDone,
            start_date: newStart,
          }
        : ci,
    );
    setChecklistItems(newItems);
    const completedCount = newItems.filter((i) => i.completed).length;
    onUpdate({
      checklist_total: newItems.length,
      checklist_completed: completedCount,
      checklist_version: Date.now(),
    });
    onChecklistSync?.(task.id, newItems);

    try {
      await Promise.all(apiCalls);
    } catch (error) {
      console.error("Failed to move checklist item column:", error);
      // 롤백
      setChecklistItems(prevItems);
      const rolledBack = prevItems.filter((i) => i.completed).length;
      onUpdate({
        checklist_total: prevItems.length,
        checklist_completed: rolledBack,
        checklist_version: Date.now(),
      });
      onChecklistSync?.(task.id, prevItems);
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    if (!boardId || !task) return;

    const originalItems = [...checklistItems];
    const deletedItem = originalItems.find((item) => item.id === itemId);
    // 낙관적 업데이트
    const newItems = checklistItems.filter((item) => item.id !== itemId);
    setChecklistItems(newItems);

    // 부모 task 상태 업데이트
    const newCompleted = newItems.filter((item) => item.completed).length;
    onUpdate({
      checklist_total: newItems.length,
      checklist_completed: newCompleted,
      checklist_version: Date.now(),
    });
    onChecklistSync?.(task.id, newItems);

    const rollback = () => {
      setChecklistItems(originalItems);
      const rolledBackCompleted = originalItems.filter(
        (item) => item.completed,
      ).length;
      onUpdate({
        checklist_total: originalItems.length,
        checklist_completed: rolledBackCompleted,
        checklist_version: Date.now(),
      });
      onChecklistSync?.(task.id, originalItems);
    };

    try {
      await checklistAPI.deleteItem(boardId, task.id, itemId);
      toast(
        t(
          "trash.toast.checklistDeleted",
          '"{{title}}" 체크리스트 항목을 삭제했습니다',
          {
            title: deletedItem?.title || "",
          },
        ),
        {
          duration: 8000,
          action: {
            label: t("trash.toast.undo", "되돌리기"),
            onClick: async () => {
              try {
                await trashAPI.restoreChecklistItem(boardId, itemId);
                rollback();
                toast.success(t("trash.toast.restored", "복구되었습니다"));
              } catch (e) {
                console.error("Failed to restore checklist item:", e);
                toast.error(
                  t("trash.toast.restoreFailed", "복구에 실패했습니다"),
                );
              }
            },
          },
        },
      );
    } catch (error) {
      console.error("Failed to delete checklist item:", error);
      rollback();
    }
  };

  const openMergeChecklistDialog = (itemId: string) => {
    const target = checklistItems.find((ci) => ci.id === itemId);
    setMergeTargetItemId(itemId);
    setMergeSelectedIds(new Set());
    setMergeTitle(target?.title || "");
  };

  const closeMergeChecklistDialog = () => {
    setMergeTargetItemId(null);
    setMergeSelectedIds(new Set());
    setMergeTitle("");
  };

  const toggleMergeSource = (itemId: string) => {
    setMergeSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleMergeChecklistItems = async () => {
    if (!boardId || !task || !mergeTargetItemId) return;
    const targetId = mergeTargetItemId;
    const sourceIds = Array.from(mergeSelectedIds).filter(
      (id) => id !== targetId,
    );
    if (sourceIds.length === 0) return;

    setMergeBusy(true);
    const originalItems = [...checklistItems];
    const originalBlocks = checklistTimeBlocksMap;
    try {
      const merged = await checklistAPI.mergeItems(boardId, task.id, {
        target_id: targetId,
        source_ids: sourceIds,
        title: mergeTitle.trim() || undefined,
      });

      const mappedTarget = {
        ...merged,
        assignee: merged.assignee
          ? {
              id: merged.assignee.id,
              name: merged.assignee.name,
              profile_image: merged.assignee.profile_image,
            }
          : null,
        contractor: merged.contractor ?? null,
      };

      const newItems = originalItems
        .filter((ci) => !sourceIds.includes(ci.id))
        .map((ci) => (ci.id === targetId ? { ...ci, ...mappedTarget } : ci));
      setChecklistItems(newItems);

      // 소스 타임블록을 대표 항목으로 이관
      setChecklistTimeBlocksMap((prev) => {
        const next = { ...prev };
        const targetBlocks = [
          ...(next[targetId] || []),
          ...sourceIds.flatMap((sid) => next[sid] || []),
        ].sort((a, b) => {
          const d = a.scheduled_date.localeCompare(b.scheduled_date);
          return d !== 0 ? d : a.start_time.localeCompare(b.start_time);
        });
        next[targetId] = targetBlocks;
        sourceIds.forEach((sid) => delete next[sid]);
        return next;
      });

      const completedCount = newItems.filter((ci) => ci.completed).length;
      onUpdate({
        checklist_total: newItems.length,
        checklist_completed: completedCount,
        checklist_version: Date.now(),
      });
      onChecklistSync?.(task.id, newItems);

      toast.success(
        t("task.mergeChecklist.success", "{{count}}개 항목을 병합했습니다", {
          count: sourceIds.length + 1,
        }),
      );
      closeMergeChecklistDialog();
    } catch (error) {
      console.error("Failed to merge checklist items:", error);
      setChecklistItems(originalItems);
      setChecklistTimeBlocksMap(originalBlocks);
      toast.error(t("task.mergeChecklist.failed", "병합에 실패했습니다"));
    } finally {
      setMergeBusy(false);
    }
  };

  const handleReassignTimeBlock = async (
    blockId: string,
    fromItemId: string,
    targetItemId: string,
  ) => {
    if (!boardId || fromItemId === targetItemId) return;
    const original = checklistTimeBlocksMap;
    const movingBlock = (original[fromItemId] || []).find(
      (b) => b.id === blockId,
    );
    if (!movingBlock) return;

    // 낙관적 업데이트: 소스 → 대상으로 블록 이동
    setChecklistTimeBlocksMap((prev) => {
      const next = { ...prev };
      next[fromItemId] = (next[fromItemId] || []).filter(
        (b) => b.id !== blockId,
      );
      next[targetItemId] = [...(next[targetItemId] || []), movingBlock].sort(
        (a, b) => {
          const d = a.scheduled_date.localeCompare(b.scheduled_date);
          return d !== 0 ? d : a.start_time.localeCompare(b.start_time);
        },
      );
      return next;
    });

    try {
      await scheduleAPI.reassignBlockChecklistItem(boardId, blockId, {
        checklist_item_id: targetItemId,
      });
      toast.success(t("task.reassignBlock.success", "타임블록을 이동했습니다"));
    } catch (error) {
      console.error("Failed to reassign time block:", error);
      setChecklistTimeBlocksMap(original);
      toast.error(
        t("task.reassignBlock.failed", "타임블록 이동에 실패했습니다"),
      );
    }
  };

  const handleChecklistDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !boardId || !task) return;
    // 필터 적용 중에는 reorder 비활성 (가시 항목과 전체 인덱스 불일치 위험)
    if (isChecklistFilterActive) return;

    const oldIndex = sortedChecklistItems.findIndex(
      (item) => item.id === active.id,
    );
    const newIndex = sortedChecklistItems.findIndex(
      (item) => item.id === over.id,
    );
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedChecklistItems, oldIndex, newIndex);
    const updatedItems = reordered.map((item, idx) => ({
      ...item,
      position: idx,
    }));

    // 낙관적 업데이트
    setChecklistItems(updatedItems);
    onChecklistSync?.(task.id, updatedItems);

    try {
      await checklistAPI.reorderItems(boardId, task.id, {
        item_ids: reordered.map((item) => item.id),
      });
    } catch (error) {
      console.error("Failed to reorder checklist items:", error);
      // 롤백
      setChecklistItems(checklistItems);
      onChecklistSync?.(task.id, checklistItems);
    }
  };

  // 체크리스트 진행률 계산
  const completedChecklistCount = checklistItems.filter(
    (item) => item.completed,
  ).length;
  const checklistProgress =
    checklistItems.length > 0
      ? Math.round((completedChecklistCount / checklistItems.length) * 100)
      : 0;

  const taskTags = editedTask.tags || [];

  return (
    <>
      <MotionModal
        open={open}
        onClose={handleClose}
        overlayClose={true}
        className="sm:max-w-[640px] md:max-w-[900px] lg:max-w-[1100px] xl:max-w-[1280px] 2xl:max-w-[1400px] max-h-[calc(var(--visual-viewport-height,100vh)*0.85)] flex flex-col overflow-hidden bg-bridge-surface p-0"
      >
        {/* Feature color accent line */}
        <div
          className="h-[3px] w-full flex-shrink-0 rounded-t-lg"
          style={{ backgroundColor: task.feature_color }}
        />
        <div className="flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_clamp(360px,40%,560px)] flex-1 min-h-0">
          {/* 왼쪽: 기존 태스크 상세 */}
          <div className="flex-1 md:flex-none flex flex-col min-h-0 min-w-0 relative">
            {/* 모바일 닫기 버튼 */}
            <button
              onClick={handleClose}
              className="md:hidden absolute top-3 right-3 z-10 p-1 rounded-sm opacity-70 hover:opacity-100 transition-opacity text-foreground"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex-shrink-0 p-4 md:p-6 pb-0 pr-[calc(1rem+5px)] md:pr-[calc(1.5rem+5px)]">
              {/* 경로: 피처 › 마일스톤 › 블록 (넓은 개념 → 현재 태스크) */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {/* 피처 뱃지 (경로 루트) */}
                <button
                  onClick={() => {
                    if (onOpenFeature) {
                      onClose();
                      onOpenFeature(task.feature_id);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${onOpenFeature ? "cursor-pointer hover:brightness-110 hover:shadow-sm" : "cursor-default"}`}
                  style={{
                    backgroundColor: `${task.feature_color}20`,
                    color: task.feature_color,
                    border: `1px solid ${task.feature_color}40`,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: task.feature_color }}
                  />
                  {task.feature_title}
                </button>
                {/* 마일스톤 배정 (피처 하위) */}
                {milestones.length > 0 &&
                  (() => {
                    const currentMs = milestones.find(
                      (m) => m.id === editedTask.milestone_id,
                    );
                    return (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <Popover
                          open={milestonePickerOpen}
                          onOpenChange={setMilestonePickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <button
                              disabled={!canEdit}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-foreground/10 bg-foreground/5 text-foreground hover:bg-foreground/10 transition-colors disabled:cursor-default disabled:hover:bg-foreground/5"
                            >
                              <Target className="w-3 h-3 text-bridge-accent" />
                              {currentMs
                                ? currentMs.title
                                : t("milestone.none", "마일스톤 없음")}
                              {canEdit && (
                                <ChevronDown className="w-3 h-3 opacity-60" />
                              )}
                            </button>
                          </PopoverTrigger>
                          {canEdit && (
                            <PopoverContent
                              align="start"
                              className="w-56 p-1 max-h-72 overflow-y-auto custom-scrollbar"
                            >
                              <button
                                onClick={() => handleAssignMilestone("")}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-foreground/10 ${
                                  !editedTask.milestone_id
                                    ? "text-bridge-accent font-bold"
                                    : "text-foreground"
                                }`}
                              >
                                {t("milestone.none", "마일스톤 없음")}
                              </button>
                              {milestones.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={() => handleAssignMilestone(m.id)}
                                  className={`w-full flex items-center gap-1.5 text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-foreground/10 ${
                                    editedTask.milestone_id === m.id
                                      ? "text-bridge-accent font-bold"
                                      : "text-foreground"
                                  }`}
                                >
                                  <Target className="w-3 h-3 flex-shrink-0 text-bridge-accent" />
                                  <span className="truncate">{m.title}</span>
                                </button>
                              ))}
                            </PopoverContent>
                          )}
                        </Popover>
                      </>
                    );
                  })()}
                {/* 현재 블록 상태 (마일스톤 하위) */}
                {task.block_id && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <BlockStatusPicker
                      blocks={blocks}
                      currentBlockId={task.block_id}
                      currentBlockName={task.block_name}
                      canEdit={!!canEdit && (!!onMoveToBlock || !!onMoveToDone)}
                      onSelectBlock={(blockId) => {
                        if (task && onMoveToBlock) {
                          onMoveToBlock(task.id, blockId);
                        }
                      }}
                      onSelectDone={() => setShowDoneDialog(true)}
                    />
                  </>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 group">
                    {task.task_key && (
                      <span
                        className="shrink-0 text-xs font-bold font-mono px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent"
                        title={t("share.taskKey", "태스크 키")}
                      >
                        {task.task_key}
                      </span>
                    )}
                    {canEdit && isEditingTitle ? (
                      <Input
                        value={editedTask.title}
                        onChange={(e) =>
                          updateEditedTask({ title: e.target.value })
                        }
                        onBlur={handleTitleCommit}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleTitleCommit();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            handleTitleCancel();
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
                          {editedTask.title}
                        </span>
                        {canEdit && (
                          <Pencil className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyTaskLink}
                      className="text-slate-400 hover:text-foreground hover:bg-foreground/10"
                      title={t("share.copyLink")}
                      aria-label={t("share.copyLink")}
                    >
                      {linkCopied ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Link className="h-4 w-4" />
                      )}
                    </Button>
                    <TaskHeaderActionsMenu
                      canEdit={!!canEdit}
                      hasMultipleFeatures={
                        !!onMoveToFeature &&
                        (features.length > 1 || milestones.length > 1)
                      }
                      onMoveFeature={() => setShowMoveFeatureDialog(true)}
                      onMoveToBoard={() => setMoveCopyMode("move")}
                      onCopyToBoard={() => setMoveCopyMode("copy")}
                      onDelete={() => setShowDeleteDialog(true)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 본문 스크롤 영역 — 메타 · 설명 · 체크리스트를 단일 스크롤 컨테이너로 통합 */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              <div className="space-y-3 px-8 md:px-10 pt-2">
                {/* 인라인 메타바: 기간 · 담당자 · 태그 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 기간 칩 */}
                  {(() => {
                    const hasDate = !!(
                      editedTask.start_date || editedTask.due_date
                    );
                    const dateLabel = hasDate ? (
                      <>
                        {editedTask.start_date
                          ? format(new Date(editedTask.start_date), "M.d", {
                              locale: ko,
                            })
                          : t("task.startDateTbd")}
                        {" ~ "}
                        {editedTask.due_date
                          ? format(new Date(editedTask.due_date), "M.d", {
                              locale: ko,
                            })
                          : t("task.endDateTbd")}
                      </>
                    ) : (
                      t("task.selectDate")
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
                        <span>{dateLabel}</span>
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
                      <Popover>
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
                            selected={{
                              from: editedTask.start_date
                                ? new Date(editedTask.start_date)
                                : undefined,
                              to: editedTask.due_date
                                ? new Date(editedTask.due_date)
                                : undefined,
                            }}
                            defaultMonth={
                              editedTask.start_date
                                ? new Date(editedTask.start_date)
                                : editedTask.due_date
                                  ? new Date(editedTask.due_date)
                                  : undefined
                            }
                            onSelect={handleDateRangeChange}
                            numberOfMonths={2}
                            locale={ko}
                            className="bg-bridge-obsidian text-foreground"
                          />
                          {hasDate && (
                            <div className="p-2 border-t border-foreground/10">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={handleDateRangeClear}
                              >
                                {t("task.deleteDate")}
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    );
                  })()}

                  {/* 담당자 안내 칩 — 체크리스트 담당자가 없을 때만 노출 */}
                  {!isPersonal &&
                    checklistAssigneeStats.assignees.length === 0 && (
                      <div
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-foreground/[0.04] border border-foreground/10 text-slate-400 cursor-default"
                        title={t("task.addAssigneeToChecklist")}
                      >
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span>{t("task.assignee")}</span>
                      </div>
                    )}

                  {/* 태그 칩 */}
                  {taskTags.map((tag) => (
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
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit && (
                    <TagPickerPopover
                      selectedTagIds={taskTags.map((t) => t.id)}
                      availableTags={availableTags}
                      onToggleTag={handleToggleTag}
                      onCreateTag={onCreateTag}
                      onUpdateTag={onUpdateTag}
                      onDeleteTag={onDeleteTag}
                    />
                  )}
                </div>

                {/* 담당자 칩 레일 (체크리스트 담당자 집계 + 필터) — Personal Board에서는 숨김 */}
                {!isPersonal && checklistAssigneeStats.assignees.length > 0 && (
                  <div className="-mx-8 md:-mx-10 pt-1">
                    <div className="flex items-baseline justify-between gap-3 px-8 md:px-10 pb-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        {t("task.assignee")}
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {isChecklistFilterActive
                          ? t("task.checklistFilter.railSelected", {
                              count: filterAssigneeIds.length,
                              visible: visibleChecklistItems.length,
                              defaultValue:
                                "{{count}}명 선택 · {{visible}}개 항목",
                            })
                          : t("task.checklistFilter.railAll", {
                              total: checklistItems.length,
                              defaultValue: "전체 {{total}}개 항목",
                            })}
                      </span>
                    </div>
                    <div
                      role="group"
                      aria-label={t("task.checklistFilter.groupLabel", {
                        defaultValue: "담당자 필터",
                      })}
                      className="flex items-center gap-2 overflow-x-auto custom-scrollbar px-8 md:px-10 pb-2"
                      style={{
                        maskImage:
                          "linear-gradient(90deg, transparent 0px, #000 24px, #000 calc(100% - 24px), transparent 100%)",
                        WebkitMaskImage:
                          "linear-gradient(90deg, transparent 0px, #000 24px, #000 calc(100% - 24px), transparent 100%)",
                      }}
                    >
                      {/* 전체 칩 — 필터 초기화 겸 현재 상태 표시 */}
                      <button
                        type="button"
                        onClick={() => setFilterAssigneeIds([])}
                        aria-pressed={!isChecklistFilterActive}
                        className={`flex-shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                          !isChecklistFilterActive
                            ? "bg-foreground/10 border-foreground/15 text-foreground font-bold"
                            : "bg-foreground/[0.04] border-foreground/10 text-slate-400 hover:bg-foreground/10"
                        }`}
                      >
                        <span>
                          {t("task.checklistFilter.all", {
                            defaultValue: "전체",
                          })}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {checklistItems.length}
                        </span>
                      </button>

                      {checklistAssigneeStats.assignees.map((assignee) => {
                        const memberData = boardMembers.find(
                          (m) => m.userId === assignee.id,
                        );
                        const color = getAssigneeClasses(
                          assignee.name,
                          memberData?.assigneeColor,
                        );
                        const isActive = filterAssigneeIds.includes(
                          assignee.id,
                        );
                        return (
                          <button
                            key={assignee.id}
                            type="button"
                            onClick={() => toggleAssigneeFilter(assignee.id)}
                            aria-pressed={isActive}
                            className={`flex-shrink-0 flex items-center gap-1.5 h-8 pl-1 pr-3 rounded-full border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                              isActive
                                ? "bg-bridge-accent/15 border-bridge-accent/45"
                                : "bg-foreground/[0.04] border-foreground/10 hover:bg-foreground/10"
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-full ${color.bg} flex items-center justify-center text-xs text-white leading-none overflow-hidden whitespace-nowrap`}
                              style={
                                !color.bg
                                  ? { backgroundColor: color.hex }
                                  : undefined
                              }
                            >
                              {getInitials(assignee.name)}
                            </span>
                            <span
                              className={`whitespace-nowrap ${
                                isActive
                                  ? "text-bridge-accent font-bold"
                                  : "text-foreground"
                              }`}
                            >
                              {assignee.name}
                            </span>
                            <span
                              className={`tabular-nums ${
                                isActive
                                  ? "text-bridge-accent/70"
                                  : "text-slate-500"
                              }`}
                            >
                              {assignee.count}
                            </span>
                          </button>
                        );
                      })}

                      {checklistAssigneeStats.unassignedCount > 0 && (
                        <>
                          <span
                            aria-hidden="true"
                            className="flex-shrink-0 w-px h-5 bg-foreground/10"
                          />
                          {(() => {
                            const isActive =
                              filterAssigneeIds.includes("__no_assignee__");
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleAssigneeFilter("__no_assignee__")
                                }
                                aria-pressed={isActive}
                                className={`flex-shrink-0 flex items-center gap-1.5 h-8 pl-1 pr-3 rounded-full border text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                                  isActive
                                    ? "bg-bridge-accent/15 border-bridge-accent/45"
                                    : "bg-foreground/[0.04] border-foreground/10 hover:bg-foreground/10"
                                }`}
                              >
                                <span className="w-6 h-6 rounded-full border border-dashed border-foreground/20 flex items-center justify-center text-xs text-slate-500 leading-none">
                                  ?
                                </span>
                                <span
                                  className={`whitespace-nowrap ${
                                    isActive
                                      ? "text-bridge-accent font-bold"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {t(
                                    "task.checklistFilter.unassigned",
                                    "미할당",
                                  )}
                                </span>
                                <span
                                  className={`tabular-nums ${
                                    isActive
                                      ? "text-bridge-accent/70"
                                      : "text-slate-500"
                                  }`}
                                >
                                  {checklistAssigneeStats.unassignedCount}
                                </span>
                              </button>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 설명 섹션 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {t("task.description")}
                    </Label>
                  </div>
                  <Textarea
                    value={editedTask.description || ""}
                    onChange={(e) =>
                      canEdit && handleDescriptionChange(e.target.value)
                    }
                    placeholder={t("task.noDescription")}
                    rows={7}
                    readOnly={!canEdit}
                    className={`max-h-[240px] overflow-y-auto custom-scrollbar bg-bridge-dark/50 border-bridge-border/30 text-foreground placeholder:text-slate-500 focus:ring-bridge-accent/50 focus:border-bridge-accent ${!canEdit ? "cursor-default" : ""}`}
                  />
                </div>
              </div>

              {/* 체크리스트 섹션 */}
              <div className="px-4 md:px-6 pb-10">
                <div className="mt-6 pt-6 border-t border-foreground/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CheckSquare
                        className="h-5 w-5"
                        style={{ color: task.feature_color || "#6366F1" }}
                      />
                      <Label className="text-base font-bold text-foreground">
                        CheckList
                      </Label>
                      {canEdit && boardId && !isRestricted && (
                        <button
                          onClick={() => setShowAIConfirm(true)}
                          className="ml-1 flex items-center gap-1 px-2 py-0.5 text-xs font-bold text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-md hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all"
                        >
                          <Sparkles className="h-3 w-3" />
                          AI
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {visibleChecklistItems.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyChecklistText}
                          className="h-7 px-2 text-slate-400 hover:text-foreground hover:bg-foreground/10"
                          title={t("task.copyChecklist", {
                            defaultValue: "체크리스트 복사",
                          })}
                          aria-label={t("task.copyChecklist", {
                            defaultValue: "체크리스트 복사",
                          })}
                        >
                          {checklistCopied ? (
                            <Check className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      {isChecklistFilterActive && (
                        <span className="text-xs text-slate-500">
                          {t("task.checklistFilter.showingCount", {
                            visible: visibleChecklistItems.length,
                            total: checklistItems.length,
                            defaultValue: "{{visible}} / {{total}} 표시 중",
                          })}
                        </span>
                      )}
                      {/* 리스트 ↔ 상태 보드 모드 전환 */}
                      {checklistItems.length > 0 && (
                        <div className="flex items-center gap-0.5 bg-foreground/5 rounded-lg p-0.5">
                          {(
                            [
                              {
                                mode: "list" as const,
                                icon: List,
                                label: t("task.checklistView.list", {
                                  defaultValue: "리스트",
                                }),
                              },
                              {
                                mode: "board" as const,
                                icon: LayoutGrid,
                                label: t("task.checklistView.board", {
                                  defaultValue: "보드",
                                }),
                              },
                            ] as const
                          ).map(({ mode, icon: Icon, label }) => (
                            <button
                              key={mode}
                              onClick={() =>
                                handleChecklistViewModeChange(mode)
                              }
                              aria-label={label}
                              aria-pressed={checklistViewMode === mode}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold transition-colors ${
                                checklistViewMode === mode
                                  ? "bg-foreground/10 text-foreground"
                                  : "text-slate-400 hover:text-foreground"
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">{label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="w-24 h-2 bg-foreground/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${checklistProgress}%`,
                            backgroundColor: task.feature_color || "#6366F1",
                          }}
                        />
                      </div>
                      <span
                        className="text-sm font-medium"
                        style={{ color: task.feature_color || "#6366F1" }}
                      >
                        {checklistProgress}%
                      </span>
                    </div>
                  </div>

                  {/* 체크리스트 항목들 */}
                  <div className="space-y-2">
                    {checklistItems.length === 0 && (
                      <div className="flex items-start gap-3 px-1 py-3">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{
                            backgroundColor: `${task.feature_color || "#6366F1"}15`,
                          }}
                        >
                          <Lightbulb
                            size={14}
                            style={{ color: task.feature_color || "#6366F1" }}
                          />
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground/80 mb-1">
                            {t("task.addChecklistHint")}
                          </p>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {t("task.addChecklistDesc")}
                          </p>
                        </div>
                      </div>
                    )}
                    {isChecklistFilterActive &&
                    visibleChecklistItems.length === 0 ? (
                      <div className="py-10 text-center">
                        <p className="text-xs text-slate-500">
                          {t("task.checklistFilter.empty", {
                            defaultValue:
                              "선택한 담당자의 체크리스트 항목이 없습니다.",
                          })}
                        </p>
                        <button
                          type="button"
                          onClick={() => setFilterAssigneeIds([])}
                          className="mt-2 text-xs font-bold text-bridge-accent hover:underline"
                        >
                          {t("task.clearFilter", "필터 해제")}
                        </button>
                      </div>
                    ) : checklistViewMode === "board" ? (
                      <ChecklistStatusBoard
                        items={visibleChecklistItems}
                        canEdit={canEdit}
                        boardMembers={boardMembers}
                        contractors={contractors}
                        timeBlocksMap={checklistTimeBlocksMap}
                        featureColor={task.feature_color}
                        isPersonal={isPersonal}
                        onToggle={handleToggleChecklistItem}
                        onMoveColumn={handleMoveChecklistColumn}
                        onUpdateItem={handleUpdateChecklistItem}
                        onDelete={setChecklistItemToDelete}
                        onMoveToTask={
                          onMoveChecklistToTask &&
                          (allTasks.length > 1 || milestones.length > 1)
                            ? (itemId) => {
                                setMoveChecklistItemId(itemId);
                                setShowMoveChecklistDialog(true);
                              }
                            : undefined
                        }
                        onQuickAdd={(title) =>
                          handleAddChecklistItem({ title })
                        }
                      />
                    ) : (
                      <DndContext
                        sensors={checklistSensors}
                        collisionDetection={closestCenter}
                        modifiers={[
                          restrictToVerticalAxis,
                          restrictToParentElement,
                        ]}
                        onDragEnd={handleChecklistDragEnd}
                      >
                        <SortableContext
                          items={visibleChecklistItems.map((item) => item.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {visibleChecklistItems.map((item) => (
                            <SortableChecklistItemRow
                              key={item.id}
                              item={item}
                              onToggle={() =>
                                handleToggleChecklistItem(item.id)
                              }
                              onUpdate={(updates) =>
                                handleUpdateChecklistItem(item.id, updates)
                              }
                              onDelete={() => setChecklistItemToDelete(item.id)}
                              onMoveToTask={
                                onMoveChecklistToTask &&
                                (allTasks.length > 1 || milestones.length > 1)
                                  ? () => {
                                      setMoveChecklistItemId(item.id);
                                      setShowMoveChecklistDialog(true);
                                    }
                                  : undefined
                              }
                              onMerge={
                                checklistItems.length > 1
                                  ? () => openMergeChecklistDialog(item.id)
                                  : undefined
                              }
                              siblingItems={checklistItems
                                .filter((ci) => ci.id !== item.id)
                                .map((ci) => ({
                                  id: ci.id,
                                  title: ci.title,
                                  completed: ci.completed,
                                }))}
                              onReassignBlock={(blockId, targetItemId) =>
                                handleReassignTimeBlock(
                                  blockId,
                                  item.id,
                                  targetItemId,
                                )
                              }
                              boardMembers={boardMembers}
                              contractors={contractors}
                              boardId={boardId}
                              canEdit={canEdit}
                              dragDisabled={isChecklistFilterActive}
                              isPersonal={isPersonal}
                              preloadedTimeBlocks={
                                checklistTimeBlocksMap[item.id]
                              }
                              isHighlighted={
                                highlightChecklistItemId === item.id
                              }
                              highlightRef={
                                highlightChecklistItemId === item.id
                                  ? highlightChecklistRef
                                  : undefined
                              }
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    )}

                    {/* 새 항목 추가 - Viewer는 추가 불가 */}
                    {canEdit && (
                      <AddChecklistItemInput
                        onAdd={handleAddChecklistItem}
                        boardMembers={boardMembers}
                        currentUser={currentUser}
                        isPersonal={isPersonal}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 오른쪽: 댓글 패널 + 닫기 버튼 */}
          {boardId && (
            <div className="w-full md:w-auto flex-1 md:flex-none border-t md:border-t-0 md:border-l border-bridge-border/30 relative z-10 bg-bridge-dark/30 min-h-0 min-w-0">
              <CommentPanel
                taskId={task.id}
                boardId={boardId}
                boardMembers={boardMembers}
                currentUser={currentUser}
                canEdit={canEdit}
                isAdminOrOwner={isAdminOrOwner}
                wsCommentEvent={wsCommentEvent}
                onClose={handleClose}
              />
            </div>
          )}
        </div>
      </MotionModal>

      {/* 삭제 다이얼로그 */}
      <MotionModal
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        className="sm:max-w-sm p-6"
      >
        <h3 className="text-lg font-bold text-foreground">
          {t("task.deleteTitle")}
        </h3>
        <p className="text-sm text-slate-400 mt-1">{t("task.deleteDesc")}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
          <button
            onClick={() => setShowDeleteDialog(false)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => {
              if (task) {
                onDelete(task.id);
              }
              setShowDeleteDialog(false);
              onClose();
            }}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-red-500 hover:bg-red-600 text-white"
          >
            {t("common.delete")}
          </button>
        </div>
      </MotionModal>

      {/* 완료 처리 다이얼로그 */}
      <MotionModal
        open={showDoneDialog}
        onClose={() => setShowDoneDialog(false)}
        className="sm:max-w-sm p-6"
      >
        <h3 className="text-lg font-bold text-foreground">
          {t("task.completeTitle")}
        </h3>
        <p className="text-sm text-slate-400 mt-1">{t("task.completeDesc")}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
          <button
            onClick={() => setShowDoneDialog(false)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => {
              if (task && onMoveToDone) {
                onMoveToDone(task.id);
              }
              setShowDoneDialog(false);
              onClose();
            }}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {t("task.markComplete")}
          </button>
        </div>
      </MotionModal>

      {/* Feature 이동 다이얼로그 */}
      <MotionModal
        open={showMoveFeatureDialog}
        onClose={() => {
          setShowMoveFeatureDialog(false);
          setSelectedFeatureId(null);
          setMoveFeatureMilestoneId(null);
          setMoveFeatureSearch("");
        }}
        className="sm:max-w-2xl p-6"
      >
        <h3 className="text-lg font-bold text-foreground">
          {t("task.moveFeatureTitle")}
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          {t("task.moveFeatureDesc")}
        </p>
        {/* 지금: 현재 Task가 속한 Feature */}
        {currentFeatureInfo && (
          <div className="mt-3 flex items-center gap-2.5 flex-wrap bg-bridge-surface border border-foreground/[0.08] rounded-xl px-3.5 py-2.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 flex-shrink-0">
              {t("task.moveFeatureCurrentLabel", "지금")}
            </span>
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: currentFeatureInfo.color }}
            />
            <span className="text-sm font-medium text-foreground truncate">
              {currentFeatureInfo.title}
            </span>
            {currentFeatureInfo.milestones.slice(0, 2).map((ms) => (
              <span
                key={ms.id}
                title={ms.title}
                className="max-w-[84px] truncate text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent"
              >
                {ms.title}
              </span>
            ))}
          </div>
        )}
        {/* Feature 이름 검색 */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={moveFeatureSearch}
            onChange={(e) => {
              const v = e.target.value;
              setMoveFeatureSearch(v);
              setSelectedFeatureId(null);
              // 입력 시 전체 마일스톤으로 넓혀 검색
              if (v.trim()) setMoveFeatureMilestoneId("all");
            }}
            placeholder={t(
              "task.moveFeatureSearchPlaceholder",
              "Feature 이름으로 검색",
            )}
            className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 pl-9 pr-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
          />
        </div>
        {/* 2단 드릴다운: 마일스톤 → Feature */}
        {(() => {
          const query = moveFeatureSearch.trim().toLowerCase();
          const base = moveFeatureCandidates.filter(
            (f) => f.id !== task?.feature_id,
          );
          const countFor = (mid: string) =>
            mid === "all"
              ? base.length
              : base.filter((f) => f.milestones.some((ms) => ms.id === mid))
                  .length;
          const featureList = base.filter((f) => {
            if (
              moveFeatureMilestoneId &&
              moveFeatureMilestoneId !== "all" &&
              !f.milestones.some((ms) => ms.id === moveFeatureMilestoneId)
            ) {
              return false;
            }
            if (query && !f.title.toLowerCase().includes(query)) return false;
            return true;
          });
          const milestoneOptions = [
            { id: "all", title: t("task.moveFeatureAllMilestones", "전체") },
            ...milestones.map((m) => ({ id: m.id, title: m.title })),
          ];
          return (
            <div className="mt-3 grid grid-cols-[0.8fr_1.35fr] rounded-2xl border border-foreground/[0.08] overflow-hidden">
              {/* 마일스톤 컬럼 */}
              <div className="min-h-[300px] max-h-[340px] overflow-y-auto custom-scrollbar border-r border-foreground/[0.08] bg-foreground/[0.015]">
                <div className="sticky top-0 z-10 bg-bridge-obsidian px-4 pt-3 pb-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("task.moveChecklistMilestoneLabel", "마일스톤")}
                  </span>
                </div>
                {milestoneOptions.map((m) => {
                  const on =
                    moveFeatureMilestoneId === m.id ||
                    (!moveFeatureMilestoneId && m.id === "all");
                  const isCurrent =
                    m.id !== "all" &&
                    !!currentFeatureInfo?.milestones.some(
                      (ms) => ms.id === m.id,
                    );
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMoveFeatureMilestoneId(m.id);
                        setSelectedFeatureId(null);
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-3 text-left border-l-2 transition-colors ${
                        on
                          ? "bg-bridge-accent/15 border-bridge-accent"
                          : "border-transparent hover:bg-foreground/5"
                      }`}
                    >
                      <span className="flex-1 truncate text-sm font-medium text-slate-300">
                        {m.title}
                      </span>
                      {isCurrent && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-bridge-secondary/15 text-bridge-secondary flex-shrink-0">
                          {t("task.moveCurrentBadge", "현재")}
                        </span>
                      )}
                      <span className="text-xs text-slate-500 tabular-nums bg-foreground/5 px-2 py-0.5 rounded-full flex-shrink-0">
                        {countFor(m.id)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {/* Feature 컬럼 */}
              <div className="min-h-[300px] max-h-[340px] overflow-y-auto custom-scrollbar">
                <div className="sticky top-0 z-10 bg-bridge-obsidian px-4 pt-3 pb-2 flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Feature
                  </span>
                  <span className="ml-auto text-xs text-slate-500 tabular-nums">
                    {featureList.length}
                  </span>
                </div>
                {featureList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 h-[240px] px-4 text-center text-slate-500">
                    <Search className="w-8 h-8 opacity-40" />
                    <p className="text-sm">
                      {query
                        ? t(
                            "task.moveFeatureSearchEmpty",
                            "검색 결과가 없습니다",
                          )
                        : t(
                            "task.moveFeatureEmpty",
                            "이동할 Feature가 없습니다",
                          )}
                    </p>
                  </div>
                ) : (
                  featureList.map((feature) => {
                    const idx = query
                      ? feature.title.toLowerCase().indexOf(query)
                      : -1;
                    const titleNode =
                      idx >= 0 ? (
                        <>
                          {feature.title.slice(0, idx)}
                          <mark className="bg-bridge-accent/30 text-foreground rounded-sm px-0.5">
                            {feature.title.slice(idx, idx + query.length)}
                          </mark>
                          {feature.title.slice(idx + query.length)}
                        </>
                      ) : (
                        feature.title
                      );
                    const sel = selectedFeatureId === feature.id;
                    return (
                      <button
                        key={feature.id}
                        onClick={() => setSelectedFeatureId(feature.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          sel ? "bg-bridge-accent/15" : "hover:bg-foreground/5"
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: feature.color }}
                        />
                        <span className="flex-1 min-w-0 text-foreground text-sm font-medium truncate">
                          {titleNode}
                        </span>
                        {feature.milestones.length > 0 && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {feature.milestones.slice(0, 2).map((ms) => (
                              <span
                                key={ms.id}
                                title={ms.title}
                                className="max-w-[84px] truncate text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent"
                              >
                                {ms.title}
                              </span>
                            ))}
                            {feature.milestones.length > 2 && (
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-foreground/10 text-slate-400">
                                +{feature.milestones.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                        <span
                          className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            sel
                              ? "bg-bridge-accent border-bridge-accent"
                              : "border-foreground/20"
                          }`}
                        >
                          {sel && <Check className="w-3 h-3 text-white" />}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}
        {/* 이동 대상 미리보기 */}
        {(() => {
          const selFeature = moveFeatureCandidates.find(
            (f) => f.id === selectedFeatureId,
          );
          const ready = !!selFeature;
          return (
            <div
              className={`mt-3 flex items-center gap-2 flex-wrap px-4 py-3 rounded-xl border text-sm ${
                ready
                  ? "border-bridge-accent/40 bg-bridge-accent/10"
                  : "border-dashed border-foreground/10 bg-foreground/[0.03]"
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500 flex-shrink-0">
                {t("task.moveDestLabel", "이동 대상")}
              </span>
              {selFeature ? (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: selFeature.color }}
                  />
                  <span className="text-foreground font-bold">
                    {selFeature.title}
                  </span>
                  {selFeature.milestones.slice(0, 2).map((ms) => (
                    <span
                      key={ms.id}
                      title={ms.title}
                      className="max-w-[84px] truncate text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent"
                    >
                      {ms.title}
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-slate-500">
                  {t("task.moveNoDest", "아직 선택 안 됨")}
                </span>
              )}
            </div>
          );
        })()}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowMoveFeatureDialog(false);
              setSelectedFeatureId(null);
              setMoveFeatureMilestoneId(null);
              setMoveFeatureSearch("");
            }}
            className="bg-foreground/5 border-foreground/10 text-foreground hover:bg-foreground/10"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              if (task && onMoveToFeature && selectedFeatureId) {
                onMoveToFeature(task.id, selectedFeatureId);
              }
              setShowMoveFeatureDialog(false);
              setSelectedFeatureId(null);
              setMoveFeatureMilestoneId(null);
              setMoveFeatureSearch("");
              onClose();
            }}
            disabled={!selectedFeatureId}
            className="bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 max-w-[260px] truncate"
          >
            {selectedFeatureId
              ? `${t("task.move")} → ${
                  moveFeatureCandidates.find((f) => f.id === selectedFeatureId)
                    ?.title ?? ""
                }`
              : t("task.move")}
          </Button>
        </div>
      </MotionModal>

      {/* 체크리스트 항목 Task 이동 다이얼로그 */}
      <MotionModal
        open={showMoveChecklistDialog}
        onClose={() => {
          setShowMoveChecklistDialog(false);
          setMoveChecklistItemId(null);
          setSelectedTargetTaskId(null);
          setSelectedTargetFeatureId(null);
          setMoveTargetMilestoneId(null);
        }}
        className="sm:max-w-2xl p-6"
      >
        <h3 className="text-lg font-bold text-foreground">
          {t("task.moveChecklistToTaskTitle")}
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          {t("task.moveChecklistToTaskDesc")}
        </p>
        {/* 마일스톤 선택 */}
        {milestones.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              {t("task.moveChecklistMilestoneLabel", "마일스톤")}
            </div>
            <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">
              {milestones.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    if (m.id === moveTargetMilestoneId) return;
                    setMoveTargetMilestoneId(m.id);
                    setSelectedTargetTaskId(null);
                    setSelectedTargetFeatureId(null);
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    moveTargetMilestoneId === m.id
                      ? "bg-bridge-accent text-white"
                      : "bg-foreground/5 text-slate-400 hover:bg-foreground/10"
                  }`}
                >
                  {m.title}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 2단 드릴다운: 피처 → Task */}
        <div className="mt-3 grid grid-cols-[1fr_1.15fr] rounded-2xl border border-foreground/[0.08] overflow-hidden">
          {/* 피처 컬럼 */}
          <div className="min-h-[300px] max-h-[340px] overflow-y-auto custom-scrollbar border-r border-foreground/[0.08] bg-foreground/[0.015]">
            <div className="sticky top-0 z-10 bg-bridge-obsidian px-4 pt-3 pb-2 flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {t("task.moveFeatureColLabel", "피처")}
              </span>
              {!loadingMoveMilestoneTasks && moveTargetFeatures.length > 0 && (
                <span className="ml-auto text-xs text-slate-500 tabular-nums">
                  {moveTargetFeatures.length}
                </span>
              )}
            </div>
            {loadingMoveMilestoneTasks ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
              </div>
            ) : moveTargetFeatures.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10">
                {t("schedule.moveToTask.noTasks", "태스크가 없습니다")}
              </p>
            ) : (
              moveTargetFeatures.map((f) => {
                const on = selectedTargetFeatureId === f.id;
                const isCurrent = f.id === task?.feature_id;
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      setSelectedTargetFeatureId(f.id);
                      setSelectedTargetTaskId(null);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-l-2 transition-colors ${
                      on
                        ? "bg-bridge-accent/15 border-bridge-accent"
                        : "border-transparent hover:bg-foreground/5"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: f.color }}
                    />
                    <span className="flex-1 truncate text-sm font-medium text-foreground">
                      {f.title}
                    </span>
                    {isCurrent && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-bridge-secondary/15 text-bridge-secondary flex-shrink-0">
                        {t("task.moveCurrentBadge", "현재")}
                      </span>
                    )}
                    <span className="text-xs text-slate-500 tabular-nums bg-foreground/5 px-2 py-0.5 rounded-full flex-shrink-0">
                      {f.tasks.length}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  </button>
                );
              })
            )}
          </div>
          {/* Task 컬럼 */}
          <div className="min-h-[300px] max-h-[340px] overflow-y-auto custom-scrollbar">
            <div className="sticky top-0 z-10 bg-bridge-obsidian px-4 pt-3 pb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Task
              </span>
            </div>
            {(() => {
              const selFeat = moveTargetFeatures.find(
                (f) => f.id === selectedTargetFeatureId,
              );
              if (!selFeat) {
                return (
                  <div className="flex flex-col items-center justify-center gap-3 h-[240px] px-4 text-center text-slate-500">
                    <ChevronRight className="w-8 h-8 opacity-40" />
                    <p className="text-sm">
                      {t(
                        "task.movePickFeatureFirst",
                        "왼쪽에서 피처를 먼저 선택하세요",
                      )}
                    </p>
                  </div>
                );
              }
              const tasks = [...selFeat.tasks].sort(
                (a, b) => Number(a.completed) - Number(b.completed),
              );
              return tasks.map((mt) => {
                const isSource = mt.id === task?.id;
                const sel = selectedTargetTaskId === mt.id;
                return (
                  <button
                    key={mt.id}
                    disabled={isSource}
                    onClick={() => setSelectedTargetTaskId(mt.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      sel ? "bg-bridge-accent/15" : "hover:bg-foreground/5"
                    } ${isSource ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`flex-1 truncate text-sm font-medium text-foreground ${
                        mt.completed ? "line-through text-slate-400" : ""
                      }`}
                    >
                      {mt.title}
                      {isSource && (
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          · {t("task.moveCurrentLocation", "현재 위치")}
                        </span>
                      )}
                    </span>
                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        sel
                          ? "bg-bridge-accent border-bridge-accent"
                          : "border-foreground/20"
                      }`}
                    >
                      {sel && <Check className="w-3 h-3 text-white" />}
                    </span>
                  </button>
                );
              });
            })()}
          </div>
        </div>
        {/* 이동 대상 경로 미리보기 */}
        {(() => {
          const selFeat = moveTargetFeatures.find(
            (f) => f.id === selectedTargetFeatureId,
          );
          const selTask = selFeat?.tasks.find(
            (tk) => tk.id === selectedTargetTaskId,
          );
          const ms = milestones.find((m) => m.id === moveTargetMilestoneId);
          const ready = !!selTask;
          return (
            <div
              className={`mt-3 flex items-center gap-2 flex-wrap px-4 py-3 rounded-xl border text-sm ${
                ready
                  ? "border-bridge-accent/40 bg-bridge-accent/10"
                  : "border-dashed border-foreground/10 bg-foreground/[0.03]"
              }`}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500 flex-shrink-0">
                {t("task.moveDestLabel", "이동 대상")}
              </span>
              {selFeat ? (
                <>
                  {ms && (
                    <>
                      <span className="text-slate-400">{ms.title}</span>
                      <span className="text-slate-600">›</span>
                    </>
                  )}
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: selFeat.color }}
                  />
                  <span className="text-slate-300">{selFeat.title}</span>
                  <span className="text-slate-600">›</span>
                  {selTask ? (
                    <span className="text-foreground font-bold">
                      {selTask.title}
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      {t("task.movePickTask", "Task 선택")}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-500">
                  {t("task.moveNoDest", "아직 선택 안 됨")}
                </span>
              )}
            </div>
          );
        })()}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowMoveChecklistDialog(false);
              setMoveChecklistItemId(null);
              setSelectedTargetTaskId(null);
              setSelectedTargetFeatureId(null);
              setMoveTargetMilestoneId(null);
            }}
            className="bg-foreground/5 border-foreground/10 text-foreground hover:bg-foreground/10"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => {
              if (
                task &&
                onMoveChecklistToTask &&
                moveChecklistItemId &&
                selectedTargetTaskId
              ) {
                onMoveChecklistToTask(
                  moveChecklistItemId,
                  task.id,
                  selectedTargetTaskId,
                );
                // UI에서 항목 제거
                setChecklistItems((prev) =>
                  prev.filter((ci) => ci.id !== moveChecklistItemId),
                );
                const remaining = checklistItems.filter(
                  (ci) => ci.id !== moveChecklistItemId,
                );
                const completedCount = remaining.filter(
                  (ci) => ci.completed,
                ).length;
                onUpdate({
                  checklist_total: remaining.length,
                  checklist_completed: completedCount,
                  checklist_version: (task.checklist_version || 0) + 1,
                });
              }
              setShowMoveChecklistDialog(false);
              setMoveChecklistItemId(null);
              setSelectedTargetTaskId(null);
              setSelectedTargetFeatureId(null);
              setMoveTargetMilestoneId(null);
            }}
            disabled={!selectedTargetTaskId}
            className="bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50"
          >
            {selectedTargetTaskId
              ? `${t("task.move")} → ${
                  moveMilestoneTasks.find((x) => x.id === selectedTargetTaskId)
                    ?.title ?? ""
                }`
              : t("task.move")}
          </Button>
        </div>
      </MotionModal>

      {/* 체크리스트 병합 다이얼로그 */}
      <MotionModal
        open={!!mergeTargetItemId}
        onClose={closeMergeChecklistDialog}
        className="sm:max-w-md p-0 overflow-hidden"
      >
        {(() => {
          const target = checklistItems.find(
            (ci) => ci.id === mergeTargetItemId,
          );
          if (!target) return null;
          const candidates = checklistItems.filter((ci) => ci.id !== target.id);
          const selected = candidates.filter((ci) =>
            mergeSelectedIds.has(ci.id),
          );
          const mergeAll = [target, ...selected];

          const blockMinutes = (b: ScheduleBlockDetailResponse) =>
            Math.round(
              (new Date(`2000-01-01T${b.end_time}`).getTime() -
                new Date(`2000-01-01T${b.start_time}`).getTime()) /
                60000,
            );

          let spanStart: string | null = null;
          let spanEnd: string | null = null;
          let totalBlocks = 0;
          let totalMinutes = 0;
          const bumpDate = (d: string | null | undefined) => {
            if (!d) return;
            if (!spanStart || d < spanStart) spanStart = d;
            if (!spanEnd || d > spanEnd) spanEnd = d;
          };
          for (const it of mergeAll) {
            bumpDate(it.start_date);
            bumpDate(it.due_date);
            const blocks = checklistTimeBlocksMap[it.id] || [];
            totalBlocks += blocks.length;
            for (const b of blocks) {
              bumpDate(b.scheduled_date);
              totalMinutes += blockMinutes(b);
            }
          }
          const hasCompletedSelected = selected.some((ci) => ci.completed);
          const fmtDur = (min: number) => {
            const h = Math.floor(min / 60);
            const m = min % 60;
            if (h > 0 && m > 0) return `${h}h ${m}m`;
            if (h > 0) return `${h}h`;
            return `${m}m`;
          };
          const fmtDate = (d: string | null) =>
            d ? format(new Date(d), "M/d", { locale: ko }) : "—";
          const fmtRange = (s: string | null, e: string | null) =>
            s || e ? `${fmtDate(s)} → ${fmtDate(e)}` : "—";

          const todayStr = getTodayDateString();
          const statusMeta = (item: ChecklistItem) => {
            const col = resolveChecklistColumn(item, todayStr);
            if (col === "done")
              return {
                label: t("task.mergeChecklist.statusDone", "완료"),
                cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
              };
            if (col === "doing")
              return {
                label: t("task.mergeChecklist.statusDoing", "진행중"),
                cls: "bg-bridge-accent/15 text-bridge-accent",
              };
            return {
              label: t("task.mergeChecklist.statusTodo", "예정"),
              cls: "bg-slate-500/15 text-slate-400",
            };
          };

          // 병합에 참여하는 담당자(대표 + 선택) 이름 목록
          const assigneeNames = Array.from(
            new Set(
              mergeAll
                .map((it) => it.assignee?.name)
                .filter((n): n is string => !!n),
            ),
          );

          // 대표/후보 행의 공통 본문 (제목·상태·담당자·기간·블록 + 아바타)
          const rowInner = (ci: ChecklistItem) => {
            const blocks = checklistTimeBlocksMap[ci.id] || [];
            const mins = blocks.reduce((s, b) => s + blockMinutes(b), 0);
            const st = statusMeta(ci);
            const memberData = ci.assignee
              ? boardMembers.find((m) => m.userId === ci.assignee!.id)
              : undefined;
            const aColor = ci.assignee
              ? getAssigneeClasses(ci.assignee.name, memberData?.assigneeColor)
              : null;
            return (
              <>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium truncate ${
                        ci.completed
                          ? "line-through text-slate-500"
                          : "text-foreground"
                      }`}
                    >
                      {ci.title}
                    </span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded-full flex-none ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    {ci.assignee && (
                      <>
                        <span className="truncate max-w-[7rem]">
                          {ci.assignee.name}
                        </span>
                        <span className="w-px h-2.5 bg-foreground/15 flex-none" />
                      </>
                    )}
                    <span className="inline-flex items-center gap-1 font-mono">
                      <CalendarIcon className="h-3 w-3 opacity-70" />
                      {fmtRange(ci.start_date, ci.due_date)}
                    </span>
                    <span className="w-px h-2.5 bg-foreground/15 flex-none" />
                    <span
                      className={`inline-flex items-center gap-1 font-mono ${
                        blocks.length === 0 ? "text-slate-600" : ""
                      }`}
                    >
                      <Layers className="h-3 w-3 opacity-70" />
                      {blocks.length > 0
                        ? t(
                            "task.mergeChecklist.blockInfo",
                            "블록 {{n}} · {{dur}}",
                            { n: blocks.length, dur: fmtDur(mins) },
                          )
                        : t("task.mergeChecklist.noBlocks", "블록 없음")}
                    </span>
                  </div>
                </div>
                {ci.assignee && aColor && (
                  <div
                    className={`w-7 h-7 rounded-full ${aColor.bg} flex items-center justify-center text-xs text-white flex-none`}
                    style={
                      !aColor.bg ? { backgroundColor: aColor.hex } : undefined
                    }
                  >
                    {getInitials(ci.assignee.name)}
                  </div>
                )}
              </>
            );
          };

          return (
            <div>
              <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
              <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
                <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 grid place-items-center flex-none">
                  <GitMerge className="h-4 w-4 text-bridge-accent" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-foreground">
                    {t(
                      "task.mergeChecklist.title",
                      "{{count}}개 항목을 하나로 병합",
                      { count: selected.length + 1 },
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {t(
                      "task.mergeChecklist.subtitle",
                      "선택한 항목의 타임블록을 대표 항목으로 모읍니다",
                    )}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5 pt-4 space-y-4">
                {/* 소속 피처 › 태스크 컨텍스트 — 후보는 모두 같은 태스크 소속 */}
                <div className="flex items-center gap-2 flex-wrap bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-[3px] flex-none"
                      style={{
                        backgroundColor: task.feature_color || "#6366F1",
                      }}
                    />
                    <span className="text-slate-400 flex-none">
                      {t("task.mergeChecklist.featureLabel", "피처")}
                    </span>
                    <b className="font-bold text-foreground truncate">
                      {task.feature_title}
                    </b>
                  </span>
                  <ChevronRight className="h-3 w-3 text-slate-600 flex-none" />
                  <span className="inline-flex items-center gap-1.5 text-xs min-w-0">
                    <span className="text-slate-400 flex-none">
                      {t("task.mergeChecklist.taskLabel", "태스크")}
                    </span>
                    <b className="font-bold text-foreground truncate">
                      {task.title}
                    </b>
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("task.mergeChecklist.titleField", "통합 제목")}
                  </label>
                  <input
                    value={mergeTitle}
                    onChange={(e) => setMergeTitle(e.target.value)}
                    className="mt-2 w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2.5 px-3 text-sm text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                    placeholder={target.title}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {t("task.mergeChecklist.selectField", "합칠 항목 선택")}
                  </label>

                  {/* 대표 항목 — 나머지 항목이 여기로 모임 */}
                  <div className="mt-2 relative flex items-center gap-3 px-3 py-2.5 rounded-xl border border-bridge-secondary/40 bg-bridge-secondary/[0.06] overflow-hidden">
                    <span
                      className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{
                        backgroundColor: target.assignee
                          ? getAssigneeClasses(
                              target.assignee.name,
                              boardMembers.find(
                                (m) => m.userId === target.assignee!.id,
                              )?.assigneeColor,
                            ).hex
                          : "#2DD4BF",
                      }}
                    />
                    <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-md bg-bridge-secondary/15 text-bridge-secondary flex-none">
                      {t("task.mergeChecklist.representative", "대표")}
                    </span>
                    {rowInner(target)}
                  </div>

                  {candidates.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500 py-3">
                      {t(
                        "task.mergeChecklist.noCandidates",
                        "병합할 다른 항목이 없습니다",
                      )}
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                      {candidates.map((ci) => {
                        const isSel = mergeSelectedIds.has(ci.id);
                        const memberData = ci.assignee
                          ? boardMembers.find(
                              (m) => m.userId === ci.assignee!.id,
                            )
                          : undefined;
                        const stripeHex = ci.assignee
                          ? getAssigneeClasses(
                              ci.assignee.name,
                              memberData?.assigneeColor,
                            ).hex
                          : "#475569";
                        return (
                          <button
                            key={ci.id}
                            onClick={() => toggleMergeSource(ci.id)}
                            className={`relative w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-xl border text-left transition-all overflow-hidden ${
                              isSel
                                ? "border-bridge-accent bg-bridge-accent/[0.08]"
                                : "border-foreground/10 hover:border-foreground/[0.18] hover:bg-foreground/[0.02]"
                            }`}
                          >
                            <span
                              className="absolute left-0 top-0 bottom-0 w-[3px]"
                              style={{ backgroundColor: stripeHex }}
                            />
                            <span
                              className={`ml-1 w-[18px] h-[18px] rounded-[5px] flex-none grid place-items-center border ${
                                isSel
                                  ? "bg-bridge-accent border-bridge-accent"
                                  : "border-slate-500"
                              }`}
                            >
                              {isSel && (
                                <Check className="h-3 w-3 text-white" />
                              )}
                            </span>
                            {rowInner(ci)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selected.length > 0 && (
                  <div className="rounded-xl border border-dashed border-foreground/20 bg-foreground/[0.03] p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        {t("task.mergeChecklist.previewPeriod", "기간")}
                      </span>
                      <span className="font-mono text-foreground">
                        {fmtDate(spanStart)} → {fmtDate(spanEnd)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        {t("task.mergeChecklist.previewBlocks", "타임블록")}
                      </span>
                      <span className="font-mono text-foreground">
                        {t(
                          "task.mergeChecklist.previewBlocksValue",
                          "{{n}}개 · {{dur}}",
                          { n: totalBlocks, dur: fmtDur(totalMinutes) },
                        )}
                      </span>
                    </div>
                    {assigneeNames.length > 0 && (
                      <div className="flex items-center justify-between text-xs gap-3">
                        <span className="text-slate-500 flex-none">
                          {t("task.mergeChecklist.previewAssignees", "담당자")}
                        </span>
                        <span className="text-foreground text-right truncate">
                          {t(
                            "task.mergeChecklist.previewAssigneesValue",
                            "{{names}} ({{n}}명)",
                            {
                              names: assigneeNames.join("·"),
                              n: assigneeNames.length,
                            },
                          )}
                        </span>
                      </div>
                    )}
                    {hasCompletedSelected && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-500 pt-1">
                        <AlertCircle className="h-3.5 w-3.5 flex-none mt-0.5" />
                        <span>
                          {t(
                            "task.mergeChecklist.completedWarn",
                            "완료 처리된 항목이 포함됩니다",
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
                <span className="text-xs text-slate-500">
                  {selected.length > 0
                    ? t(
                        "task.mergeChecklist.deleteHint",
                        "선택한 {{n}}개 항목은 삭제됩니다",
                        { n: selected.length },
                      )
                    : t(
                        "task.mergeChecklist.selectHint",
                        "합칠 항목을 선택하세요",
                      )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={closeMergeChecklistDialog}
                    disabled={mergeBusy}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 disabled:opacity-50"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleMergeChecklistItems}
                    disabled={selected.length === 0 || mergeBusy}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {mergeBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <GitMerge className="h-3.5 w-3.5" />
                    )}
                    {t("task.mergeChecklist.confirm", "병합")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </MotionModal>

      {/* 체크리스트 아이템 삭제 확인 다이얼로그 */}
      <MotionModal
        open={!!checklistItemToDelete}
        onClose={() => setChecklistItemToDelete(null)}
        className="sm:max-w-sm p-6"
      >
        <h3 className="text-lg font-bold text-foreground">
          {t("task.deleteChecklistTitle")}
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          {t("task.deleteChecklistDesc")}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-4">
          <button
            onClick={() => setChecklistItemToDelete(null)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => {
              if (checklistItemToDelete) {
                handleDeleteChecklistItem(checklistItemToDelete);
              }
              setChecklistItemToDelete(null);
            }}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 bg-red-500 hover:bg-red-600 text-white"
          >
            {t("common.delete")}
          </button>
        </div>
      </MotionModal>

      {/* Task 이동/복사 모달 */}
      {task && moveCopyMode && boardId && (
        <TaskMoveModal
          open={!!moveCopyMode}
          onClose={() => setMoveCopyMode(null)}
          taskId={task.id}
          taskTitle={task.title}
          currentBoardId={boardId}
          mode={moveCopyMode}
          onSuccess={() => {
            setMoveCopyMode(null);
            if (moveCopyMode === "move") {
              onClose();
            }
          }}
        />
      )}

      {/* AI Checklist Confirm Modal */}
      {showAIConfirm &&
        task &&
        editedTask &&
        boardId &&
        (() => {
          const parentFeature = features.find((f) => f.id === task.feature_id);
          return (
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
                    {t("task.aiChecklistTitle")}
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
              <div className="px-5 py-4 space-y-3 max-h-[60dvh] overflow-y-auto">
                <p className="text-xs text-slate-400">
                  {t("task.aiChecklistConfirmDesc")}
                </p>

                {/* Feature group */}
                <div className="rounded-xl border border-foreground/5 bg-white/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      {t("task.aiChecklistConfirmFeatureLabel")}
                    </span>
                    {onOpenFeature && (
                      <button
                        onClick={() => {
                          setShowAIConfirm(false);
                          onClose();
                          onOpenFeature(task.feature_id);
                        }}
                        className="flex items-center gap-1 text-xs text-bridge-accent hover:text-bridge-accent/80 transition-colors"
                      >
                        <ArrowRight className="h-3 w-3" />
                        {t("task.aiChecklistGoToFeature")}
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {parentFeature?.title || task.feature_title}
                  </p>
                  {parentFeature?.description ? (
                    <p className="text-xs text-slate-400 whitespace-pre-wrap line-clamp-2">
                      {parentFeature.description}
                    </p>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3 text-amber-400 flex-shrink-0" />
                      <p className="text-xs text-amber-400/70">
                        {t("task.aiChecklistConfirmNoDesc")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Task group */}
                <div className="rounded-xl border border-foreground/5 bg-white/[0.02] p-3 space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                    {t("task.aiChecklistConfirmTaskLabel")}
                  </span>
                  <input
                    type="text"
                    value={editedTask.title}
                    onChange={(e) =>
                      updateEditedTask({ title: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white/5 rounded-lg border border-foreground/5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
                  />
                  <textarea
                    value={editedTask.description || ""}
                    onChange={(e) =>
                      updateEditedTask({ description: e.target.value })
                    }
                    placeholder={t("task.aiChecklistConfirmNoDesc")}
                    rows={3}
                    className="w-full px-3 py-2 bg-white/5 rounded-lg border border-foreground/5 text-sm text-slate-300 placeholder-amber-400/60 resize-none focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 focus:border-bridge-accent transition-all"
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
                    setShowAIConfirm(false);
                    setShowAIChecklist(true);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-bridge-secondary to-bridge-accent rounded-lg hover:shadow-[0_0_20px_rgba(45,212,191,0.3)] transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("task.aiChecklistConfirmStart")}
                </button>
              </div>
            </MotionModal>
          );
        })()}

      {/* AI Checklist Decompose Modal */}
      {showAIChecklist && task && boardId && (
        <TaskAIChecklistModal
          boardId={boardId}
          taskId={task.id}
          taskTitle={editedTask?.title || task.title}
          existingChecklistTitles={checklistItems.map((item) => item.title)}
          onClose={() => setShowAIChecklist(false)}
          onApplied={() => {
            setShowAIChecklist(false);
            // Reload checklist items
            if (boardId && task) {
              checklistAPI
                .getChecklist(boardId, task.id)
                .then((response) => {
                  const rawItems = response.items || [];
                  const items: ChecklistItem[] = rawItems.map((item) => ({
                    id: item.id,
                    title: item.title,
                    completed: item.completed,
                    position: item.position,
                    start_date: item.start_date,
                    due_date: item.due_date,
                    done_date: item.done_date,
                    assignee: item.assignee
                      ? {
                          id: item.assignee.id,
                          name: item.assignee.name,
                          profile_image: item.assignee.profile_image,
                        }
                      : null,
                    contractor: item.contractor ?? null,
                  }));
                  setChecklistItems(items);
                })
                .catch((error) => {
                  console.error("Failed to reload checklist:", error);
                });
            }
          }}
        />
      )}
    </>
  );
}

// 정렬 가능한 체크리스트 항목 래퍼
function SortableChecklistItemRow(props: {
  item: ChecklistItem;
  onToggle: () => void;
  onUpdate: (updates: Partial<ChecklistItem>) => void;
  onDelete: () => void;
  onMoveToTask?: () => void;
  onMerge?: () => void;
  siblingItems?: { id: string; title: string; completed: boolean }[];
  onReassignBlock?: (blockId: string, targetItemId: string) => void;
  boardMembers: BoardMember[];
  contractors?: BoardContractor[];
  boardId: string | null;
  canEdit?: boolean;
  dragDisabled?: boolean;
  isPersonal?: boolean;
  preloadedTimeBlocks?: ScheduleBlockDetailResponse[];
  isHighlighted?: boolean;
  highlightRef?: React.Ref<HTMLDivElement>;
}) {
  const dragEnabled = !!props.canEdit && !props.dragDisabled;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.item.id,
    disabled: !dragEnabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const mergedRef = (node: HTMLDivElement) => {
    setNodeRef(node);
    if (
      props.highlightRef &&
      typeof props.highlightRef === "object" &&
      props.highlightRef !== null
    ) {
      (
        props.highlightRef as React.MutableRefObject<HTMLDivElement | null>
      ).current = node;
    }
  };

  return (
    <div ref={mergedRef} style={style} {...attributes}>
      <ChecklistItemRow
        {...props}
        dragHandleProps={dragEnabled ? listeners : undefined}
      />
    </div>
  );
}

// 체크리스트 항목 컴포넌트
function ChecklistItemRow({
  item,
  onToggle,
  onUpdate,
  onDelete,
  onMoveToTask,
  onMerge,
  siblingItems = [],
  onReassignBlock,
  boardMembers,
  contractors = [],
  boardId,
  canEdit = true,
  isPersonal = false,
  dragHandleProps,
  preloadedTimeBlocks,
  isHighlighted = false,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onUpdate: (updates: Partial<ChecklistItem>) => void;
  onDelete: () => void;
  onMoveToTask?: () => void;
  onMerge?: () => void;
  siblingItems?: { id: string; title: string; completed: boolean }[];
  onReassignBlock?: (blockId: string, targetItemId: string) => void;
  boardMembers: BoardMember[];
  contractors?: BoardContractor[];
  boardId: string | null;
  canEdit?: boolean;
  isPersonal?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  preloadedTimeBlocks?: ScheduleBlockDetailResponse[];
  isHighlighted?: boolean;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(item.title);
  const [showOptions, setShowOptions] = useState(false);
  const [showTimeBlocks, setShowTimeBlocks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // 부모에서 벌크로 로드된 타임블록 사용 (최근 날짜·늦은 시간 순 정렬)
  const timeBlocks = [...(preloadedTimeBlocks || [])].sort((a, b) => {
    const d = b.scheduled_date.localeCompare(a.scheduled_date);
    return d !== 0 ? d : b.start_time.localeCompare(a.start_time);
  });

  // 담당자 색상
  const memberData = item.assignee
    ? boardMembers.find((m) => m.userId === item.assignee!.id)
    : null;
  const assigneeColor = item.assignee
    ? getAssigneeClasses(item.assignee.name, memberData?.assigneeColor)
    : null;

  // 외주 담당자 (BRIDGE accent fallback)
  const contractorColor = item.contractor?.color || "#6366F1";

  // 타임블록 총합 시간 (분)
  const totalTimeMinutes = timeBlocks.reduce((sum, block) => {
    return (
      sum +
      Math.round(
        (new Date(`2000-01-01T${block.end_time}`).getTime() -
          new Date(`2000-01-01T${block.start_time}`).getTime()) /
          60000,
      )
    );
  }, 0);

  // 타임블록 토글
  const handleToggleTimeBlocks = () => {
    setShowTimeBlocks(!showTimeBlocks);
  };

  const handleSaveTitle = () => {
    if (editedTitle.trim() && editedTitle !== item.title) {
      onUpdate({ title: editedTitle.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      handleSaveTitle();
    } else if (e.key === "Escape") {
      setEditedTitle(item.title);
      setIsEditing(false);
    }
  };

  // 마감일 상태 확인
  const isOverdue =
    item.due_date && new Date(item.due_date) < new Date() && !item.completed;
  const isDueSoon =
    item.due_date &&
    new Date(item.due_date).getTime() - new Date().getTime() < 86400000 &&
    !item.completed;

  // 진행중(DOING) 상태 파생 — 미완료 & 시작일이 오늘 이하
  const todayStr = getTodayDateString();
  const isDoing = resolveChecklistColumn(item, todayStr) === "doing";
  // 오늘 타임블록에 실제로 배정됐는지 (진행 중) vs 기간 안이지만 오늘 미배정 (기간 중)
  const inTodaysTimeblock = timeBlocks.some(
    (block) => block.scheduled_date === todayStr,
  );
  const isActiveToday = isDoing && inTodaysTimeblock;
  const isInPeriod = isDoing && !inTodaysTimeblock;

  return (
    <>
      <div
        className={`group flex items-center gap-2 p-2 rounded hover:bg-foreground/5 border ${
          isHighlighted
            ? "bg-purple-500/20 border-purple-500/50"
            : isActiveToday
              ? "bg-gradient-to-r from-bridge-accent/10 to-transparent border-bridge-accent/20 hover:border-bridge-accent/30"
              : "border-transparent hover:border-foreground/10"
        }`}
      >
        {/* 드래그 핸들 */}
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        {/* 체크박스 */}
        <button
          onClick={canEdit ? onToggle : undefined}
          disabled={!canEdit}
          className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
            item.completed
              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
              : "border-2 border-slate-500 hover:border-slate-300 bg-transparent"
          } ${!canEdit ? "cursor-default" : ""}`}
        >
          {item.completed && (
            <svg
              className="w-3.5 h-3.5 text-white"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M5 13l4 4L19 7"></path>
            </svg>
          )}
        </button>

        {/* 제목 - 왼쪽 정렬 */}
        <div className="flex-1 min-w-0">
          {canEdit && isEditing ? (
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={handleKeyDown}
              className="text-xs h-6 bg-foreground/5 border-foreground/10 text-foreground"
              autoFocus
            />
          ) : (
            <div
              className={`text-xs truncate ${
                item.completed
                  ? "line-through text-slate-400"
                  : "text-foreground"
              } ${canEdit ? "cursor-pointer" : ""}`}
              onClick={() => canEdit && setIsEditing(true)}
            >
              {item.title}
              {isHighlighted && (
                <span className="ml-2 text-xs text-purple-400 inline-block">
                  ({t("scheduleDetail.current")})
                </span>
              )}
            </div>
          )}
        </div>

        {/* 진행 중 — 오늘 타임블록에 배정됨 (라이브 인디케이터) */}
        {isActiveToday && (
          <span className="flex items-center gap-1.5 flex-shrink-0 text-xs font-bold text-bridge-accent">
            <span className="relative flex h-1.5 w-1.5">
              {!reducedMotion && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-bridge-accent opacity-75 animate-ping" />
              )}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-bridge-accent" />
            </span>
            <span className="hidden sm:inline">
              {t("task.checklistView.doingBadge", { defaultValue: "진행 중" })}
            </span>
          </span>
        )}

        {/* 기간 중 — 기간 안이지만 오늘 타임블록엔 미배정 (차분한 스카이, 정적) */}
        {isInPeriod && (
          <span className="flex items-center gap-1.5 flex-shrink-0 text-xs font-bold text-sky-600 dark:text-sky-400">
            <span className="inline-flex h-1.5 w-1.5 rounded-full border border-sky-600 dark:border-sky-400" />
            <span className="hidden sm:inline">
              {t("task.checklistView.periodBadge", { defaultValue: "기간 중" })}
            </span>
          </span>
        )}

        {/* 오른쪽 정렬: 기간 + 담당자 (클릭해서 수정) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 기간 - 클릭하면 수정 (Viewer는 읽기 전용) */}
          {canEdit ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded hover:bg-foreground/10 transition-colors ${
                    isOverdue
                      ? "text-red-400"
                      : isDueSoon
                        ? "text-orange-400"
                        : "text-slate-400"
                  }`}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {(() => {
                    const endDate =
                      item.completed && item.done_date
                        ? item.done_date
                        : item.due_date;
                    if (item.start_date || endDate) {
                      if (item.start_date && endDate) {
                        return (
                          <>
                            {format(new Date(item.start_date), "M/d", {
                              locale: ko,
                            })}{" "}
                            - {format(new Date(endDate), "M/d", { locale: ko })}
                          </>
                        );
                      } else if (item.start_date) {
                        return (
                          <>
                            {format(new Date(item.start_date), "M/d", {
                              locale: ko,
                            })}{" "}
                            ~
                          </>
                        );
                      } else {
                        return (
                          <>
                            ~{" "}
                            {format(new Date(endDate!), "M/d", { locale: ko })}
                          </>
                        );
                      }
                    }
                    return (
                      <span className="text-slate-400">{t("task.date")}</span>
                    );
                  })()}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 bg-bridge-obsidian border-foreground/10"
                align="end"
              >
                <Calendar
                  mode="range"
                  selected={{
                    from: item.start_date
                      ? new Date(item.start_date)
                      : undefined,
                    to: item.due_date ? new Date(item.due_date) : undefined,
                  }}
                  defaultMonth={
                    item.start_date
                      ? new Date(item.start_date)
                      : item.due_date
                        ? new Date(item.due_date)
                        : item.done_date
                          ? new Date(item.done_date)
                          : undefined
                  }
                  onSelect={(range) => {
                    onUpdate({
                      start_date: range?.from
                        ? format(range.from, "yyyy-MM-dd")
                        : null,
                      due_date: range?.to
                        ? format(range.to, "yyyy-MM-dd")
                        : null,
                    });
                  }}
                  numberOfMonths={1}
                  locale={ko}
                  className="bg-bridge-obsidian text-foreground"
                />
                {(item.start_date || item.due_date) && (
                  <div className="p-2 border-t border-foreground/10">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() =>
                        onUpdate({ start_date: null, due_date: null })
                      }
                    >
                      {t("task.deleteDate")}
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          ) : (
            <div
              className={`flex items-center gap-1 text-xs px-1.5 py-0.5 ${
                isOverdue
                  ? "text-red-400"
                  : isDueSoon
                    ? "text-orange-400"
                    : "text-slate-400"
              }`}
            >
              <CalendarIcon className="h-3 w-3" />
              {(() => {
                const endDate =
                  item.completed && item.done_date
                    ? item.done_date
                    : item.due_date;
                if (item.start_date || endDate) {
                  if (item.start_date && endDate) {
                    return (
                      <>
                        {format(new Date(item.start_date), "M/d", {
                          locale: ko,
                        })}{" "}
                        - {format(new Date(endDate), "M/d", { locale: ko })}
                      </>
                    );
                  } else if (item.start_date) {
                    return (
                      <>
                        {format(new Date(item.start_date), "M/d", {
                          locale: ko,
                        })}{" "}
                        ~
                      </>
                    );
                  } else {
                    return (
                      <>~ {format(new Date(endDate!), "M/d", { locale: ko })}</>
                    );
                  }
                }
                return <span className="text-slate-400">-</span>;
              })()}
            </div>
          )}

          {/* 담당자 - Personal Board에서는 숨김 */}
          {!isPersonal &&
            (canEdit ? (
              <Popover>
                <PopoverTrigger asChild>
                  {item.contractor ? (
                    <button
                      className="flex items-center gap-1 rounded-full px-1.5 py-0.5 border border-dashed hover:opacity-80 transition-opacity"
                      style={{
                        backgroundColor: contractorColor + "15",
                        borderColor: contractorColor + "66",
                      }}
                    >
                      <Wrench
                        className="w-3 h-3"
                        style={{ color: contractorColor }}
                      />
                      <span
                        className="text-xs font-medium"
                        style={{ color: contractorColor }}
                      >
                        {item.contractor.name}
                      </span>
                      <span
                        className="text-xs opacity-60"
                        style={{ color: contractorColor }}
                      >
                        · {t("task.checklistContractorBadge", "외주")}
                      </span>
                    </button>
                  ) : item.assignee && assigneeColor ? (
                    <button
                      className={`flex items-center gap-1 ${assigneeColor.bgLight} rounded-full px-1.5 py-0.5 hover:opacity-80 transition-opacity`}
                      style={
                        !assigneeColor.bgLight
                          ? { backgroundColor: assigneeColor.hex + "20" }
                          : undefined
                      }
                    >
                      <div
                        className={`w-4 h-4 rounded-full ${assigneeColor.bg} flex items-center justify-center text-xs font-bold text-white whitespace-nowrap overflow-hidden`}
                        style={
                          !assigneeColor.bg
                            ? { backgroundColor: assigneeColor.hex }
                            : undefined
                        }
                      >
                        {getInitials(item.assignee.name)}
                      </div>
                      <span
                        className={`text-xs font-medium ${assigneeColor.text}`}
                        style={
                          !assigneeColor.text
                            ? { color: assigneeColor.hex }
                            : undefined
                        }
                      >
                        {item.assignee.name}
                      </span>
                    </button>
                  ) : (
                    <button className="flex items-center gap-1 text-xs text-slate-400 px-1.5 py-0.5 rounded hover:bg-foreground/10 transition-colors">
                      <div className="w-4 h-4 rounded-full bg-slate-600 flex items-center justify-center text-xs text-slate-400">
                        ?
                      </div>
                    </button>
                  )}
                </PopoverTrigger>
                <PopoverContent
                  className="w-48 p-1 bg-bridge-obsidian border-foreground/10 max-h-72 overflow-y-auto custom-scrollbar"
                  align="end"
                >
                  <div className="space-y-0.5">
                    <button
                      onClick={() =>
                        onUpdate({ assignee: null, contractor: null })
                      }
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-foreground/10 transition-colors ${
                        !item.assignee && !item.contractor
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {t("common.none")}
                    </button>
                    {boardMembers.map((member) => {
                      const memberColor = getAssigneeClasses(
                        member.name,
                        member.assigneeColor,
                      );
                      return (
                        <button
                          key={member.userId}
                          onClick={() =>
                            onUpdate({
                              assignee: {
                                id: member.userId,
                                name: member.name,
                                profile_image: member.avatar || null,
                              },
                              contractor: null,
                            })
                          }
                          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-foreground/10 transition-colors ${
                            item.assignee?.id === member.userId
                              ? "bg-foreground/10 text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full ${memberColor.bg} flex items-center justify-center text-xs font-bold text-white whitespace-nowrap overflow-hidden`}
                            style={
                              !memberColor.bg
                                ? { backgroundColor: memberColor.hex }
                                : undefined
                            }
                          >
                            {getInitials(member.name)}
                          </div>
                          {member.name}
                        </button>
                      );
                    })}
                    {contractors.length > 0 && (
                      <>
                        <div className="my-1 border-t border-foreground/[0.08]" />
                        <div className="px-2 py-1 text-xs font-bold uppercase tracking-widest text-slate-400">
                          {t("task.contractorSection", "외주 작업자")}
                        </div>
                        {contractors.map((c) => {
                          const color = c.color || "#6366F1";
                          const isSelected = item.contractor?.id === c.id;
                          return (
                            <button
                              key={c.id}
                              onClick={() =>
                                onUpdate({
                                  assignee: null,
                                  contractor: {
                                    id: c.id,
                                    name: c.name,
                                    color: c.color,
                                  } as ContractorInfo,
                                })
                              }
                              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-foreground/10 transition-colors ${
                                isSelected
                                  ? "bg-foreground/10 text-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              <div
                                className="w-4 h-4 rounded-full border border-dashed flex items-center justify-center"
                                style={{
                                  backgroundColor: color + "15",
                                  borderColor: color + "66",
                                }}
                              >
                                <Wrench
                                  className="w-2.5 h-2.5"
                                  style={{ color }}
                                />
                              </div>
                              {c.name}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            ) : // Viewer: 읽기 전용 담당자 표시
            item.contractor ? (
              <div
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5 border border-dashed"
                style={{
                  backgroundColor: contractorColor + "15",
                  borderColor: contractorColor + "66",
                }}
              >
                <Wrench
                  className="w-3 h-3"
                  style={{ color: contractorColor }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: contractorColor }}
                >
                  {item.contractor.name}
                </span>
                <span
                  className="text-xs opacity-60"
                  style={{ color: contractorColor }}
                >
                  · {t("task.checklistContractorBadge", "외주")}
                </span>
              </div>
            ) : item.assignee && assigneeColor ? (
              <div
                className={`flex items-center gap-1 ${assigneeColor.bgLight} rounded-full px-1.5 py-0.5`}
                style={
                  !assigneeColor.bgLight
                    ? { backgroundColor: assigneeColor.hex + "20" }
                    : undefined
                }
              >
                <div
                  className={`w-4 h-4 rounded-full ${assigneeColor.bg} flex items-center justify-center text-xs font-bold text-white whitespace-nowrap overflow-hidden`}
                  style={
                    !assigneeColor.bg
                      ? { backgroundColor: assigneeColor.hex }
                      : undefined
                  }
                >
                  {getInitials(item.assignee.name)}
                </div>
                <span
                  className={`text-xs font-medium ${assigneeColor.text}`}
                  style={
                    !assigneeColor.text
                      ? { color: assigneeColor.hex }
                      : undefined
                  }
                >
                  {item.assignee.name}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-slate-400 px-1.5 py-0.5">
                <div className="w-4 h-4 rounded-full bg-slate-600 flex items-center justify-center text-xs text-slate-400">
                  ?
                </div>
              </div>
            ))}
        </div>

        {/* 타임블록 총합 시간 + 토글 버튼 */}
        {totalTimeMinutes > 0 && (
          <span className="text-xs text-bridge-accent font-medium whitespace-nowrap">
            {(() => {
              const h = Math.floor(totalTimeMinutes / 60);
              const m = totalTimeMinutes % 60;
              return h > 0
                ? `${h}h ${m > 0 ? `${m}m` : ""}`
                : `${totalTimeMinutes}m`;
            })()}
          </span>
        )}
        <button
          onClick={handleToggleTimeBlocks}
          className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
            showTimeBlocks || timeBlocks.length > 0
              ? "text-bridge-accent bg-bridge-accent/10"
              : "text-slate-400 hover:text-slate-400 hover:bg-foreground/5"
          }`}
          title={t("task.viewTimeBlocks")}
        >
          {preloadedTimeBlocks === undefined ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : showTimeBlocks ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
        </button>

        {/* 항목 액션 메뉴 - Viewer는 불가 */}
        {canEdit && (
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-slate-400 hover:text-foreground hover:bg-foreground/10 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-foreground/10 data-[state=open]:text-foreground transition-opacity"
                  title={t("common.more", "더보기")}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-bridge-surface border-bridge-border"
              >
                {boardId && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setShowHistory(true)}
                      className="text-bridge-accent hover:bg-bridge-surface-hover hover:text-bridge-accent focus:text-bridge-accent text-xs"
                    >
                      <History className="h-3.5 w-3.5 mr-2" />
                      {t("checklistHistory.menu", "이력")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-bridge-border" />
                  </>
                )}
                {onMerge && (
                  <DropdownMenuItem
                    onClick={onMerge}
                    className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs"
                  >
                    <GitMerge className="h-3.5 w-3.5 mr-2" />
                    {t("task.mergeChecklist.action", "다른 항목과 병합")}
                  </DropdownMenuItem>
                )}
                {onMoveToTask && (
                  <DropdownMenuItem
                    onClick={onMoveToTask}
                    className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                    {t("task.moveChecklistToTask")}
                  </DropdownMenuItem>
                )}
                {(onMerge || onMoveToTask) && (
                  <DropdownMenuSeparator className="bg-bridge-border" />
                )}
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-red-400 hover:bg-red-500/10 hover:text-red-300 focus:bg-red-500/10 focus:text-red-300 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* 변경 이력 모달 */}
      {boardId && (
        <ChecklistHistoryModal
          open={showHistory}
          onClose={() => setShowHistory(false)}
          boardId={boardId}
          itemId={item.id}
          itemTitle={item.title}
        />
      )}

      {/* 타임블록 리스트 */}
      {showTimeBlocks && (
        <div className="ml-6 mt-1 mb-2 space-y-1">
          {timeBlocks.length === 0 ? (
            <div className="text-xs text-slate-400 py-1 px-2">
              {t("task.noTimeBlocks")}
            </div>
          ) : (
            <>
              {timeBlocks.map((block) => (
                <div
                  key={block.id}
                  className="group/tb flex items-center gap-2 text-xs py-1 px-2 rounded bg-white/[0.02] border border-bridge-border"
                >
                  <CalendarIcon className="h-3 w-3 text-slate-400" />
                  <span className="text-slate-400">
                    {format(new Date(block.scheduled_date), "M/d (E)", {
                      locale: ko,
                    })}
                  </span>
                  <Clock className="h-3 w-3 text-slate-400" />
                  <span className="text-foreground font-medium">
                    {block.start_time.slice(0, 5)} -{" "}
                    {block.end_time.slice(0, 5)}
                  </span>
                  <span className="text-slate-400">
                    (
                    {Math.round(
                      (new Date(`2000-01-01T${block.end_time}`).getTime() -
                        new Date(`2000-01-01T${block.start_time}`).getTime()) /
                        60000,
                    )}
                    분)
                  </span>
                  {canEdit && onReassignBlock && siblingItems.length > 0 && (
                    <div className="ml-auto">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="h-5 w-5 grid place-items-center rounded text-slate-400 hover:text-foreground hover:bg-foreground/10 opacity-0 group-hover/tb:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-foreground/10 transition-opacity"
                            title={t(
                              "task.reassignBlock.action",
                              "다른 항목으로 이동",
                            )}
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-bridge-surface border-bridge-border max-h-64 overflow-y-auto custom-scrollbar"
                        >
                          <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                            {t("task.reassignBlock.menuTitle", "이동할 항목")}
                          </div>
                          {siblingItems.map((sib) => (
                            <DropdownMenuItem
                              key={sib.id}
                              onClick={() => onReassignBlock(block.id, sib.id)}
                              className="text-muted-foreground hover:bg-bridge-surface-hover hover:text-foreground text-xs max-w-[240px]"
                            >
                              <span
                                className={`truncate ${sib.completed ? "line-through text-slate-500" : ""}`}
                              >
                                {sib.title}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}

// 체크리스트 항목 추가 입력
function AddChecklistItemInput({
  onAdd,
  boardMembers,
  currentUser,
  isPersonal = false,
}: {
  onAdd: (data: {
    title: string;
    start_date?: string;
    due_date?: string;
    assignee_id?: string;
  }) => void;
  boardMembers: BoardMember[];
  currentUser: User | null;
  isPersonal?: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [assigneeId, setAssigneeId] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // 기본값 설정: 현재 사용자를 담당자로, 오늘 날짜를 시작일로
  const handleStartAdding = () => {
    setIsAdding(true);
    // 시작일을 오늘로 설정
    setDateRange({ from: new Date(), to: undefined });
    // 현재 사용자가 보드 멤버인지 확인하고 기본값으로 설정
    if (currentUser) {
      const currentMember = boardMembers.find(
        (m) => m.userId === currentUser.id,
      );
      if (currentMember) {
        setAssigneeId(currentUser.id);
      }
    }
  };

  const handleAdd = () => {
    if (value.trim()) {
      onAdd({
        title: value,
        start_date: dateRange?.from
          ? format(dateRange.from, "yyyy-MM-dd")
          : undefined,
        due_date: dateRange?.to
          ? format(dateRange.to, "yyyy-MM-dd")
          : undefined,
        assignee_id: assigneeId || undefined,
      });
      setValue("");
      setDateRange(undefined);
      setAssigneeId("");
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      handleAdd();
    } else if (e.key === "Escape") {
      setValue("");
      setDateRange(undefined);
      setAssigneeId("");
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    setValue("");
    setDateRange(undefined);
    setAssigneeId("");
    setIsAdding(false);
  };

  // 선택된 담당자 정보 가져오기
  const selectedMember = assigneeId
    ? boardMembers.find((m) => m.userId === assigneeId)
    : null;

  if (!isAdding) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-slate-400 hover:text-foreground hover:bg-foreground/5"
        onClick={handleStartAdding}
      >
        <Plus className="h-4 w-4 mr-2" />
        {t("task.addChecklistItem")}
      </Button>
    );
  }

  return (
    <div className="p-3 border border-foreground/10 rounded-lg bg-foreground/5">
      <div className="flex gap-2 items-start">
        <div className="w-4 h-4 rounded bg-slate-600 flex-shrink-0 mt-1.5" />
        <div className="flex-1 space-y-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("task.checklistItemPlaceholder")}
            className="text-xs h-7 bg-foreground/5 border-foreground/10 text-foreground placeholder:text-slate-500"
            autoFocus
          />

          {/* 옵션 필드들 */}
          <div className="flex gap-2 pt-2 border-t border-foreground/10">
            {/* 날짜 범위 선택 */}
            <div className="flex-1">
              <label className="text-xs text-slate-400 block mb-1">
                {t("task.period")}
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full h-7 text-xs justify-start text-left font-normal bg-foreground/5 border-foreground/10 text-foreground hover:bg-foreground/10"
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "MM/dd", { locale: ko })} -{" "}
                          {format(dateRange.to, "MM/dd", { locale: ko })}
                        </>
                      ) : (
                        format(dateRange.from, "MM/dd", { locale: ko })
                      )
                    ) : (
                      <span className="text-slate-400">
                        {t("task.selectDate")}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0 bg-bridge-obsidian border-foreground/10"
                  align="start"
                >
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    defaultMonth={dateRange?.from ?? dateRange?.to ?? undefined}
                    onSelect={setDateRange}
                    numberOfMonths={1}
                    locale={ko}
                    className="bg-bridge-obsidian text-foreground"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* 담당자 — Personal Board에서는 숨김 */}
            {!isPersonal && (
              <div className="flex-1">
                <label className="text-xs text-slate-400 block mb-1">
                  {t("task.assignee")}
                </label>
                <Select
                  value={assigneeId || "none"}
                  onValueChange={(val) =>
                    setAssigneeId(val === "none" ? "" : val)
                  }
                >
                  <SelectTrigger className="h-7 text-xs bg-foreground/5 border-foreground/10 text-foreground">
                    {selectedMember ? (
                      (() => {
                        const selColor = getAssigneeClasses(
                          selectedMember.name,
                          selectedMember.assigneeColor,
                        );
                        return (
                          <div className="flex items-center gap-1">
                            <div
                              className={`w-4 h-4 rounded-full ${selColor.bg} flex items-center justify-center text-xs text-white flex-shrink-0 whitespace-nowrap overflow-hidden`}
                              style={
                                !selColor.bg
                                  ? { backgroundColor: selColor.hex }
                                  : undefined
                              }
                            >
                              {getInitials(selectedMember.name)}
                            </div>
                            <span>{selectedMember.name}</span>
                          </div>
                        );
                      })()
                    ) : (
                      <SelectValue placeholder={t("common.none")} />
                    )}
                  </SelectTrigger>
                  <SelectContent className="bg-bridge-obsidian border-foreground/10">
                    <SelectItem
                      value="none"
                      className="text-foreground hover:bg-foreground/10"
                    >
                      <span className="text-xs">{t("common.none")}</span>
                    </SelectItem>
                    {boardMembers.map((member) => {
                      const memberColor = getAssigneeClasses(
                        member.name,
                        member.assigneeColor,
                      );
                      return (
                        <SelectItem
                          key={member.userId}
                          value={member.userId}
                          className="text-foreground hover:bg-foreground/10"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded-full ${memberColor.bg} flex items-center justify-center text-xs text-white flex-shrink-0 whitespace-nowrap overflow-hidden`}
                              style={
                                !memberColor.bg
                                  ? { backgroundColor: memberColor.hex }
                                  : undefined
                              }
                            >
                              {getInitials(member.name)}
                            </div>
                            <span className="text-xs">{member.name}</span>
                            {member.userId === currentUser?.id && (
                              <span className="text-xs text-slate-400">
                                (나)
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 버튼 영역 */}
      <div className="flex justify-end gap-2 mt-2">
        <Button
          size="sm"
          onClick={handleAdd}
          className="h-7 bg-bridge-accent hover:bg-bridge-accent/90"
        >
          {t("common.add")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          className="h-7 text-slate-400 hover:text-foreground hover:bg-foreground/10"
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
