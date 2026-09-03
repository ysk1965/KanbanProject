import {
  Fragment,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronDown,
  Download,
  GripVertical,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ChecklistItem,
  ChecklistPreset,
  Feature,
  Milestone,
  SprintInfo,
  Task,
} from "../types";
import {
  checklistPresetService,
  checklistService,
  memberService,
  taskService,
} from "../utils/services";
import { checklistAPI } from "../utils/api";
import {
  SprintChip,
  toShortDate,
  daysUntil,
  type TaskSprintInfo,
} from "./MilestoneDetailView";
import { ChecklistPresetPopover } from "./ChecklistPresetPopover";
import { ChecklistPresetManageModal } from "./ChecklistPresetManageModal";

// ========================================
// Types
// ========================================

interface MilestoneTableViewProps {
  boardId: string;
  milestone: Milestone;
  /** 이 마일스톤 스코프의 태스크 (진실 = task.milestone_id) */
  tasks: Task[];
  featureById: Map<string, Feature>;
  /** featureId → 홈 마일스톤 id — "기본 마일스톤" 태그 표시용 */
  homeByFeature: Map<string, string>;
  sprintInfoByTask: Map<string, TaskSprintInfo>;
  /** 마일스톤 기간을 N등분한 버킷 전체 — 담을 곳을 고르는 메뉴의 재료 */
  sprints: SprintInfo[];
  currentSeq: number | null;
  sprintEnabled: boolean;
  canEdit: boolean;
  onTaskClick?: (task: Task) => void;
  onFeatureClick?: (feature: Feature) => void;
  /** 태스크 생성 후 보드 데이터 리로드 */
  onRefresh?: () => void;
  /** 스프린트 담기/옮기기 — toSprintId가 null이면 백로그로 빼기 */
  onMoveSprint?: (taskId: string, toSprintId: string | null) => void;
}

type StatusFilter = "all" | "doing" | "open";
type TaskStatus = "done" | "doing" | "todo";

interface ChecklistState {
  items: ChecklistItem[];
  loaded: boolean;
}

/** CSV 필드 이스케이프 — 항상 따옴표로 감싼다 */
function csvField(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

/**
 * batch 응답 정규화 — 서비스 타입 선언과 달리 실제 응답은
 * { checklists: [{ task_id, items }] } 배열이다 (useBoardDataLoader의
 * parseChecklistBatch와 동일 처리). 맵 형태가 와도 동작하도록 겸용.
 */
function parseBatchChecklists(res: unknown): {
  [taskId: string]: ChecklistItem[];
} {
  const map: { [taskId: string]: ChecklistItem[] } = {};
  const groups = (res as { checklists?: unknown } | null)?.checklists;
  if (Array.isArray(groups)) {
    for (const g of groups as Array<{
      task_id?: string;
      taskId?: string;
      items?: ChecklistItem[];
    }>) {
      const taskId = g.task_id ?? g.taskId;
      if (taskId && Array.isArray(g.items)) map[taskId] = g.items;
    }
    return map;
  }
  // 폴백: {[taskId]: {items}} 맵 형태
  if (res && typeof res === "object") {
    for (const [taskId, group] of Object.entries(
      res as { [taskId: string]: { items?: ChecklistItem[] } },
    )) {
      if (Array.isArray(group?.items)) map[taskId] = group.items;
    }
  }
  return map;
}

// ========================================
// Main
// ========================================

/**
 * 마일스톤 상세 테이블 뷰 — 피처(세로 병합) | 태스크 | 체크리스트(항목별 담당자).
 * 체크리스트는 batch API로 일괄 로드, 인라인 추가/토글은 기존 엔드포인트 재사용.
 */
export function MilestoneTableView({
  boardId,
  milestone,
  tasks,
  featureById,
  homeByFeature,
  sprintInfoByTask,
  sprints,
  currentSeq,
  sprintEnabled,
  canEdit,
  onTaskClick,
  onFeatureClick,
  onRefresh,
  onMoveSprint,
}: MilestoneTableViewProps) {
  const { t } = useTranslation();
  const mid = milestone.id;

  const [checklists, setChecklists] = useState<{
    [taskId: string]: ChecklistState;
  }>({});
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  /** 스프린트 필터 — sprint id, "none" = 미배정(백로그), null = 전체 */
  const [sprintFilter, setSprintFilter] = useState<string | null>(null);
  const [sprintOpen, setSprintOpen] = useState(false);
  /** 인라인 입력 활성 위치 — 태스크 추가(featureId) / 항목 추가(taskId) */
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [addingItemFor, setAddingItemFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** 담당자 피커용 보드 멤버 (user id 기준) — 편집 가능할 때만 로드 */
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  /** 보드 공용 체크리스트 프리셋 — 칩 이름 표시에도 쓰므로 항상 로드 */
  const [presets, setPresets] = useState<ChecklistPreset[]>([]);
  const [presetManageOpen, setPresetManageOpen] = useState(false);
  /**
   * 적용/해제 직후의 로컬 preset_id 오버라이드 — 부모 리프레시가 돌아오기 전에
   * 칩을 즉시 갱신한다. undefined = 서버값(task.preset_id) 그대로.
   */
  const [presetOverrides, setPresetOverrides] = useState<{
    [taskId: string]: string | null;
  }>({});
  const addInputRef = useRef<HTMLInputElement | null>(null);
  /**
   * 세션 고정 정렬 스냅샷 — 체크 항목 추가/기간 수정으로 완료율·행 수가 변해도
   * 그룹/항목이 좌우·상하로 재배치되지 않게 최초 순서를 고정한다.
   * 새로고침(리마운트)·마일스톤 전환 시 초기화되어 다시 완료율/기간순으로 정렬된다.
   */
  const frozenGroupOrder = useRef<Map<string, number>>(new Map());
  const frozenItemOrder = useRef<Map<string, Map<string, number>>>(new Map());
  const frozenItemCount = useRef<Map<string, number>>(new Map());

  // 마일스톤 전환 시 필터·입력·고정 정렬 초기화
  useEffect(() => {
    frozenGroupOrder.current = new Map();
    frozenItemOrder.current = new Map();
    frozenItemCount.current = new Map();
    setStatusFilter("all");
    setAssigneeFilter(null);
    setAssigneeOpen(false);
    setSprintFilter(null);
    setSprintOpen(false);
    setAddingTaskFor(null);
    setAddingItemFor(null);
  }, [mid]);

  // 체크리스트 일괄 로드 — 새 태스크(미로드)만 추가 요청
  useEffect(() => {
    const missing = tasks.filter((tk) => !checklists[tk.id]).map((tk) => tk.id);
    if (missing.length === 0) return;
    let cancelled = false;
    setChecklistsLoading(true);
    checklistService
      .getBatchChecklists(boardId, missing)
      .then((res) => {
        if (cancelled) return;
        const byTask = parseBatchChecklists(res);
        setChecklists((prev) => {
          const next = { ...prev };
          for (const id of missing) {
            next[id] = { items: byTask[id] ?? [], loaded: true };
          }
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setChecklists((prev) => {
          const next = { ...prev };
          for (const id of missing) {
            next[id] = next[id] ?? { items: [], loaded: false };
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setChecklistsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // checklists를 deps에 넣으면 setChecklists 직후 재실행되므로 tasks 기준으로만 감지한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, mid, tasks]);

  // 인라인 입력 포커스
  useEffect(() => {
    if (addingTaskFor || addingItemFor) addInputRef.current?.focus();
  }, [addingTaskFor, addingItemFor]);

  // 보드 멤버 로드 — 체크리스트 담당자 배정/교체 드롭다운용
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    memberService
      .getMembers(boardId)
      .then((res) => {
        if (cancelled) return;
        setMembers(
          res.members.map((m) => ({ id: m.user.id, name: m.user.name })),
        );
      })
      .catch(() => {
        /* 실패 시 피커만 비활성 */
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, canEdit]);

  // 체크리스트 프리셋 로드 — 실패해도 칩만 빈 상태로 동작
  useEffect(() => {
    let cancelled = false;
    checklistPresetService
      .getPresets(boardId)
      .then((list) => {
        if (!cancelled) setPresets(list);
      })
      .catch(() => {
        /* 미지원/실패 → 빈 목록 */
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  // 체크 항목 크로스 태스크 드래그 센서
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  // ── 파생값 ──
  /**
   * 기간 기준 자동 정렬 — 시작일(없으면 마감일) 오름차순, 기간 없는 항목은 맨 아래.
   * 단, 최초 로드 시점의 순서를 세션 동안 고정하고 이후 추가된 항목은 맨 아래에
   * 붙인다 — 기간 입력 즉시 항목이 날짜 위치로 점프하지 않게.
   */
  const itemsOf = useCallback(
    (taskId: string): ChecklistItem[] => {
      const cached = frozenItemOrder.current.get(taskId);
      const order = cached ?? new Map<string, number>();
      if (!cached) frozenItemOrder.current.set(taskId, order);
      const byPeriod = [...(checklists[taskId]?.items ?? [])].sort((a, b) => {
        const ka = a.start_date ?? a.due_date;
        const kb = b.start_date ?? b.due_date;
        if (ka && kb) {
          if (ka !== kb) return ka < kb ? -1 : 1;
          const da = a.due_date ?? "";
          const db = b.due_date ?? "";
          if (da !== db) return da < db ? -1 : 1;
          return a.position - b.position;
        }
        if (ka) return -1;
        if (kb) return 1;
        return a.position - b.position;
      });
      for (const item of byPeriod) {
        if (!order.has(item.id)) order.set(item.id, order.size);
      }
      return byPeriod.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    },
    [checklists],
  );

  const statusOf = useCallback(
    (tk: Task): TaskStatus => {
      if (tk.completed) return "done";
      const state = checklists[tk.id];
      const done = state?.loaded
        ? state.items.filter((i) => i.completed).length
        : (tk.checklist_completed ?? 0);
      return done > 0 ? "doing" : "todo";
    },
    [checklists],
  );

  /** 담당자 필터 후보 — 태스크 담당자 합집합 + 체크리스트 담당자 */
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const tk of tasks) {
      for (const a of tk.assignees ?? []) map.set(a.id, a.name);
      for (const item of checklists[tk.id]?.items ?? []) {
        if (item.assignee) map.set(item.assignee.id, item.assignee.name);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, checklists]);

  const taskMatches = useCallback(
    (tk: Task): boolean => {
      if (statusFilter === "doing" && statusOf(tk) !== "doing") return false;
      if (statusFilter === "open" && tk.completed) return false;
      if (sprintFilter) {
        const sprintId = sprintInfoByTask.get(tk.id)?.sprintId ?? null;
        if (
          sprintFilter === "none"
            ? sprintId !== null
            : sprintId !== sprintFilter
        )
          return false;
      }
      if (assigneeFilter) {
        const inTask = (tk.assignees ?? []).some(
          (a) => a.id === assigneeFilter,
        );
        const inChecklist = (checklists[tk.id]?.items ?? []).some(
          (i) => i.assignee?.id === assigneeFilter,
        );
        if (!inTask && !inChecklist) return false;
      }
      return true;
    },
    [
      statusFilter,
      assigneeFilter,
      sprintFilter,
      statusOf,
      sprintInfoByTask,
      checklists,
    ],
  );

  /** 피처 그룹 — 완료율 높은 순 (보드 컬럼과 동일 규칙) */
  const groups = useMemo(() => {
    const byFeature = new Map<string, Task[]>();
    for (const tk of tasks) {
      if (!byFeature.has(tk.feature_id)) byFeature.set(tk.feature_id, []);
      byFeature.get(tk.feature_id)!.push(tk);
    }
    const result = [...byFeature.entries()].map(([featureId, list]) => {
      const sorted = [...list].sort((a, b) => {
        if (a.completed !== b.completed)
          return Number(a.completed) - Number(b.completed);
        return (
          (a.feature_position ?? a.position) -
          (b.feature_position ?? b.position)
        );
      });
      const completed = list.filter((tk) => tk.completed).length;
      // 게이지 = 체크리스트 완료 합계 기준 (마일스톤 헤더와 동일 규칙, 없으면 태스크 폴백)
      let clDone = 0;
      let clTotal = 0;
      for (const tk of list) {
        const state = checklists[tk.id];
        if (state?.loaded) {
          clDone += state.items.filter((i) => i.completed).length;
          clTotal += state.items.length;
        } else {
          clDone += tk.checklist_completed ?? 0;
          clTotal += tk.checklist_total ?? 0;
        }
      }
      const progressDone = clTotal > 0 ? clDone : completed;
      const progressTotal = clTotal > 0 ? clTotal : list.length;
      return {
        featureId,
        feature: featureById.get(featureId),
        title:
          featureById.get(featureId)?.title ?? list[0]?.feature_title ?? "",
        color:
          featureById.get(featureId)?.color ?? list[0]?.feature_color ?? null,
        tasks: sorted,
        visibleTasks: sorted.filter(taskMatches),
        completed,
        total: list.length,
        progressDone,
        progressTotal,
      };
    });
    result.sort((a, b) => {
      const pa = a.progressTotal > 0 ? a.progressDone / a.progressTotal : 0;
      const pb = b.progressTotal > 0 ? b.progressDone / b.progressTotal : 0;
      return pb - pa || b.total - a.total;
    });
    // 최초 계산된 순서를 세션 동안 고정 — 항목 추가/토글로 완료율이 변해도
    // 그룹이 위아래로 재배치되지 않는다 (새 피처는 맨 뒤에 등록)
    const order = frozenGroupOrder.current;
    for (const g of result) {
      if (!order.has(g.featureId)) order.set(g.featureId, order.size);
    }
    result.sort((a, b) => order.get(a.featureId)! - order.get(b.featureId)!);
    return result;
  }, [tasks, featureById, taskMatches, checklists]);

  const isFiltered =
    statusFilter !== "all" || assigneeFilter !== null || sprintFilter !== null;
  const visibleGroups = isFiltered
    ? groups.filter((g) => g.visibleTasks.length > 0)
    : groups;

  /**
   * 신문형 2단 분배 — 행 수(체크 항목 포함) 가중치로 순서 유지한 채 절반 분할.
   * 항목 수는 로드 완료 시점 값으로 고정 — 항목을 추가할 때마다 좌/우 분할
   * 경계가 밀려 그룹이 컬럼을 넘나드는 것 방지.
   */
  const groupWeight = (g: (typeof visibleGroups)[number]) =>
    1 +
    g.visibleTasks.reduce((acc, tk) => {
      const counts = frozenItemCount.current;
      if (!counts.has(tk.id) && checklists[tk.id]?.loaded) {
        counts.set(tk.id, checklists[tk.id].items.length);
      }
      return acc + Math.max(2, counts.get(tk.id) ?? itemsOf(tk.id).length);
    }, 0);
  const totalWeight = visibleGroups.reduce((acc, g) => acc + groupWeight(g), 0);
  const groupColumns: (typeof visibleGroups)[] = (() => {
    if (visibleGroups.length < 2) return [visibleGroups];
    const left: typeof visibleGroups = [];
    const right: typeof visibleGroups = [];
    let acc = 0;
    for (const g of visibleGroups) {
      if (acc < totalWeight / 2) {
        left.push(g);
        acc += groupWeight(g);
      } else {
        right.push(g);
      }
    }
    return right.length > 0 ? [left, right] : [left];
  })();

  // ── 상호작용 ──
  /** 항목 로컬 부분 갱신 (낙관적 업데이트/롤백 공용) */
  const patchLocalItem = useCallback(
    (taskId: string, itemId: string, patch: Partial<ChecklistItem>) => {
      setChecklists((prev) => {
        const state = prev[taskId];
        if (!state) return prev;
        return {
          ...prev,
          [taskId]: {
            ...state,
            items: state.items.map((i) =>
              i.id === itemId ? { ...i, ...patch } : i,
            ),
          },
        };
      });
    },
    [],
  );

  /** 제목 인라인 수정 — 낙관적 갱신 후 실패 롤백 */
  const handleRenameItem = useCallback(
    (taskId: string, item: ChecklistItem, title: string) => {
      patchLocalItem(taskId, item.id, { title });
      checklistAPI.patchItem(boardId, taskId, item.id, { title }).catch(() => {
        patchLocalItem(taskId, item.id, { title: item.title });
      });
    },
    [boardId, patchLocalItem],
  );

  /** 담당자 배정/교체/해제 — 낙관적 갱신 후 실패 롤백 */
  const handleAssignItem = useCallback(
    (
      taskId: string,
      item: ChecklistItem,
      member: { id: string; name: string } | null,
    ) => {
      const prev = item.assignee ?? null;
      patchLocalItem(taskId, item.id, {
        assignee: member
          ? { id: member.id, name: member.name, profile_image: null }
          : null,
      });
      checklistAPI
        .patchItem(boardId, taskId, item.id, {
          assignee_id: member?.id ?? null,
        })
        .catch(() => {
          patchLocalItem(taskId, item.id, { assignee: prev });
        });
    },
    [boardId, patchLocalItem],
  );

  /** 기간(시작/마감) 수정 — 낙관적 갱신 후 실패 롤백 */
  const handleDatesItem = useCallback(
    (
      taskId: string,
      item: ChecklistItem,
      patch: { start_date?: string | null; due_date?: string | null },
    ) => {
      const prev = { start_date: item.start_date, due_date: item.due_date };
      patchLocalItem(taskId, item.id, patch as Partial<ChecklistItem>);
      checklistAPI.patchItem(boardId, taskId, item.id, patch).catch(() => {
        patchLocalItem(taskId, item.id, prev);
      });
    },
    [boardId, patchLocalItem],
  );

  const handleToggleItem = useCallback(
    (taskId: string, item: ChecklistItem) => {
      if (!canEdit) return;
      // 낙관적 갱신 → 실패 시 되돌림
      const flip = (completed: boolean) =>
        setChecklists((prev) => {
          const state = prev[taskId];
          if (!state) return prev;
          return {
            ...prev,
            [taskId]: {
              ...state,
              items: state.items.map((i) =>
                i.id === item.id ? { ...i, completed } : i,
              ),
            },
          };
        });
      flip(!item.completed);
      checklistService.toggleItem(boardId, taskId, item.id).catch(() => {
        flip(item.completed);
      });
    },
    [boardId, canEdit],
  );

  const handleAddTask = useCallback(
    async (featureId: string, title: string) => {
      if (!title.trim() || saving) return;
      setSaving(true);
      try {
        const created = await taskService.createTask(boardId, featureId, {
          title: title.trim(),
          milestone_id: mid,
        });
        setChecklists((prev) => ({
          ...prev,
          [created.id]: { items: [], loaded: true },
        }));
        setAddingTaskFor(null);
        onRefresh?.();
      } catch {
        /* 실패 시 입력 유지 */
      } finally {
        setSaving(false);
      }
    },
    [boardId, mid, saving, onRefresh],
  );

  const handleAddItem = useCallback(
    async (taskId: string, title: string) => {
      if (!title.trim() || saving) return;
      setSaving(true);
      try {
        const item = await checklistService.addItem(boardId, taskId, {
          title: title.trim(),
        });
        setChecklists((prev) => {
          const state = prev[taskId] ?? { items: [], loaded: true };
          return {
            ...prev,
            [taskId]: { ...state, items: [...state.items, item] },
          };
        });
        setAddingItemFor(null);
      } catch {
        /* 실패 시 입력 유지 */
      } finally {
        setSaving(false);
      }
    },
    [boardId, saving],
  );

  // ── 프리셋 적용/해제/저장 ──
  /** 프리셋 적용 — 응답 체크리스트로 즉시 교체, 중복 스킵은 토스트 안내 */
  const handleApplyPreset = useCallback(
    async (taskId: string, presetId: string) => {
      try {
        const res = await checklistPresetService.applyPreset(
          boardId,
          taskId,
          presetId,
        );
        setChecklists((prev) => ({
          ...prev,
          [taskId]: { items: res.checklists, loaded: true },
        }));
        setPresetOverrides((prev) => ({ ...prev, [taskId]: presetId }));
        if (res.skipped_duplicates > 0) {
          toast(
            t("milestone.preset.skippedToast", {
              count: res.skipped_duplicates,
              defaultValue: "{{count}}개는 이미 있어 건너뛰었습니다",
            }),
          );
        }
        onRefresh?.();
      } catch (error) {
        toast.error(
          t("milestone.preset.applyFailed", {
            defaultValue: "프리셋 적용에 실패했습니다",
          }),
        );
        throw error;
      }
    },
    [boardId, onRefresh, t],
  );

  /** 지정 해제 — 프리셋 연결만 끊고 항목은 유지 */
  const handleClearPreset = useCallback(
    async (taskId: string) => {
      try {
        await checklistPresetService.clearPreset(boardId, taskId);
        setPresetOverrides((prev) => ({ ...prev, [taskId]: null }));
        onRefresh?.();
      } catch (error) {
        toast.error(
          t("milestone.preset.clearFailed", {
            defaultValue: "지정 해제에 실패했습니다",
          }),
        );
        throw error;
      }
    },
    [boardId, onRefresh, t],
  );

  /** 현재 체크 항목들을 새 프리셋으로 저장 */
  const handleSavePreset = useCallback(
    async (name: string, itemTitles: string[]) => {
      try {
        const preset = await checklistPresetService.createPreset(boardId, {
          name,
          items: itemTitles.map((title) => ({ title })),
        });
        setPresets((prev) => [...prev, preset]);
      } catch (error) {
        toast.error(
          t("milestone.preset.saveFailed", {
            defaultValue: "프리셋 저장에 실패했습니다",
          }),
        );
        throw error;
      }
    },
    [boardId, t],
  );

  /** 드래그 중인 항목 (DragOverlay 고스트용) */
  const [dragItem, setDragItem] = useState<ChecklistItem | null>(null);

  const handleItemDragStart = useCallback(
    (event: DragStartEvent) => {
      const taskId = event.active.data.current?.taskId as string | undefined;
      if (!taskId) return;
      const item = checklists[taskId]?.items.find(
        (i) => i.id === event.active.id,
      );
      setDragItem(item ?? null);
    },
    [checklists],
  );

  /** 체크 항목 드래그 = 다른 태스크로 이동 전용 (moveToTask, 낙관적 이동/롤백) */
  const handleItemDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragItem(null);
      const { active, over } = event;
      if (!over) return;
      const sourceTaskId = active.data.current?.taskId as string | undefined;
      const overId = String(over.id);
      if (!sourceTaskId || !overId.startsWith("cl-")) return;
      const targetTaskId = overId.slice(3);
      if (targetTaskId === sourceTaskId) return;
      const item = checklists[sourceTaskId]?.items.find(
        (i) => i.id === active.id,
      );
      if (!item) return;
      const applyMove = (fromId: string, toId: string, moved: ChecklistItem) =>
        setChecklists((prev) => {
          const from = prev[fromId];
          const to = prev[toId] ?? { items: [], loaded: true };
          if (!from) return prev;
          return {
            ...prev,
            [fromId]: {
              ...from,
              items: from.items.filter((i) => i.id !== moved.id),
            },
            [toId]: {
              ...to,
              items: [...to.items.filter((i) => i.id !== moved.id), moved],
            },
          };
        });
      applyMove(sourceTaskId, targetTaskId, item);
      checklistAPI
        .moveToTask(boardId, sourceTaskId, item.id, {
          target_task_id: targetTaskId,
        })
        .then((moved) => {
          // 서버가 매긴 position 반영 (기간순 정렬이라 표시엔 영향 없음)
          setChecklists((prev) => {
            const to = prev[targetTaskId];
            if (!to) return prev;
            return {
              ...prev,
              [targetTaskId]: {
                ...to,
                items: to.items.map((i) => (i.id === moved.id ? moved : i)),
              },
            };
          });
        })
        .catch(() => {
          applyMove(targetTaskId, sourceTaskId, item);
        });
    },
    [boardId, checklists],
  );

  // ── CSV 내보내기 (UTF-8 BOM — 엑셀 한글 호환) ──
  const handleExport = useCallback(() => {
    const statusLabel: Record<TaskStatus, string> = {
      done: t("milestone.table.statusDone", { defaultValue: "완료" }),
      doing: t("milestone.table.statusDoing", { defaultValue: "진행중" }),
      todo: t("milestone.table.statusTodo", { defaultValue: "대기" }),
    };
    const header = [
      t("milestone.table.colFeature", { defaultValue: "피처" }),
      t("milestone.table.csvFeatureProgress", { defaultValue: "피처 진행" }),
      t("milestone.table.colTask", { defaultValue: "태스크" }),
      t("milestone.table.csvStatus", { defaultValue: "상태" }),
      t("milestone.table.csvSprint", { defaultValue: "스프린트" }),
      t("milestone.table.csvDue", { defaultValue: "마감" }),
      t("milestone.table.colChecklist", { defaultValue: "체크리스트" }),
      t("milestone.table.csvItemPeriod", { defaultValue: "항목 기간" }),
      t("milestone.table.csvChecked", { defaultValue: "완료" }),
      t("milestone.table.csvAssignee", { defaultValue: "담당자" }),
    ];
    const rows: string[][] = [header];
    for (const g of visibleGroups) {
      const pct =
        g.progressTotal > 0
          ? Math.round((g.progressDone / g.progressTotal) * 100)
          : 0;
      const progress = `${g.progressDone}/${g.progressTotal} (${pct}%)`;
      for (const tk of g.visibleTasks) {
        const info = sprintInfoByTask.get(tk.id);
        // 담긴 버킷의 회차만 남긴다 — 지남/진행 중 구분은 CSV에서 의미가 없다.
        const sprint = info?.sprintId ? `S${info.seq ?? currentSeq ?? ""}` : "";
        const base = [
          g.title,
          progress,
          tk.title,
          statusLabel[statusOf(tk)],
          sprint,
          tk.due_date ?? "",
        ];
        const items = itemsOf(tk.id);
        if (items.length === 0) {
          rows.push([...base, "", "", "", ""]);
        } else {
          for (const item of items) {
            const period =
              item.start_date || item.due_date
                ? `${item.start_date ?? ""}~${item.due_date ?? ""}`
                : "";
            rows.push([
              ...base,
              item.title,
              period,
              item.completed ? "O" : "X",
              item.assignee?.name ?? "",
            ]);
          }
        }
      }
    }
    const csv =
      "\uFEFF" + rows.map((r) => r.map(csvField).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${milestone.title}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [
    visibleGroups,
    sprintInfoByTask,
    currentSeq,
    statusOf,
    itemsOf,
    milestone.title,
    t,
  ]);

  // ── 렌더 ──
  const filterChips: { key: StatusFilter; label: string }[] = [
    {
      key: "all",
      label: t("milestone.table.filterAll", { defaultValue: "전체" }),
    },
    {
      key: "doing",
      label: t("milestone.table.filterDoing", { defaultValue: "진행중만" }),
    },
    {
      key: "open",
      label: t("milestone.table.filterOpen", { defaultValue: "미완료만" }),
    },
  ];

  const inlineInput = (
    placeholder: string,
    onCommit: (value: string) => void,
    onCancel: () => void,
  ) => (
    <input
      ref={addInputRef}
      type="text"
      placeholder={placeholder}
      disabled={saving}
      className="w-full max-w-[240px] bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5 py-1 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value);
        else if (e.key === "Escape") onCancel();
      }}
      onBlur={(e) => {
        if (!e.target.value.trim()) onCancel();
      }}
    />
  );

  const assigneeFilterName = assigneeFilter
    ? (assigneeOptions.find((a) => a.id === assigneeFilter)?.name ?? "")
    : null;

  const sprintFilterLabel =
    sprintFilter === "none"
      ? t("milestone.table.sprintUnassigned", { defaultValue: "미배정" })
      : sprintFilter
        ? (sprints.find((s) => s.id === sprintFilter)?.name ?? "")
        : null;

  const sprintStateLabel = (state: SprintInfo["state"]) =>
    state === "CURRENT"
      ? t("milestone.table.sprintCurrentMark", { defaultValue: "진행 중" })
      : state === "PAST"
        ? t("milestone.table.sprintPastMark", { defaultValue: "지남" })
        : t("milestone.table.sprintUpcoming", { defaultValue: "예정" });

  return (
    <div>
      {/* ── 필터 툴바 ── */}
      <div className="flex items-center gap-1.5 flex-wrap px-3 py-2 border-b border-foreground/[0.06]">
        {filterChips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setStatusFilter(chip.key)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              statusFilter === chip.key
                ? "bg-bridge-accent/15 border-bridge-accent/40 text-bridge-accent font-bold"
                : "bg-foreground/[0.03] border-foreground/10 text-slate-400 hover:text-foreground"
            }`}
          >
            {chip.label}
          </button>
        ))}

        {/* 스프린트 필터 — 버킷 단위로 걸러 본다 (미배정 포함) */}
        {sprintEnabled && sprints.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setSprintOpen((v) => !v)}
              aria-expanded={sprintOpen}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                sprintFilter
                  ? "bg-bridge-accent/15 border-bridge-accent/40 text-bridge-accent font-bold"
                  : "bg-foreground/[0.03] border-foreground/10 text-slate-400 hover:text-foreground"
              }`}
            >
              {sprintFilterLabel ??
                t("milestone.table.filterSprint", { defaultValue: "스프린트" })}
              <ChevronDown className="h-3 w-3" />
            </button>
            {sprintOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setSprintOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1.5 z-40 w-52 max-h-56 overflow-y-auto custom-scrollbar bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1.5">
                  <button
                    onClick={() => {
                      setSprintFilter(null);
                      setSprintOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                      sprintFilter === null
                        ? "text-bridge-accent font-bold bg-bridge-accent/10"
                        : "text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {t("milestone.table.filterAll", { defaultValue: "전체" })}
                  </button>
                  {sprints.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSprintFilter(s.id);
                        setSprintOpen(false);
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs truncate transition-colors flex items-center gap-2 ${
                        sprintFilter === s.id
                          ? "text-bridge-accent font-bold bg-bridge-accent/10"
                          : "text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          s.state === "CURRENT"
                            ? "bg-bridge-accent"
                            : s.state === "PAST"
                              ? "bg-emerald-500"
                              : "bg-slate-600"
                        }`}
                      />
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto text-slate-500 shrink-0">
                        {sprintStateLabel(s.state)}
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setSprintFilter("none");
                      setSprintOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors border-t border-foreground/[0.06] mt-1 pt-2 ${
                      sprintFilter === "none"
                        ? "text-bridge-accent font-bold bg-bridge-accent/10"
                        : "text-slate-400 hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    {t("milestone.table.sprintUnassigned", {
                      defaultValue: "미배정",
                    })}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 담당자 필터 */}
        <div className="relative">
          <button
            onClick={() => setAssigneeOpen((v) => !v)}
            aria-expanded={assigneeOpen}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              assigneeFilter
                ? "bg-bridge-accent/15 border-bridge-accent/40 text-bridge-accent font-bold"
                : "bg-foreground/[0.03] border-foreground/10 text-slate-400 hover:text-foreground"
            }`}
          >
            {assigneeFilterName ??
              t("milestone.table.filterAssignee", { defaultValue: "담당자" })}
            <ChevronDown className="h-3 w-3" />
          </button>
          {assigneeOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setAssigneeOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1.5 z-40 w-44 max-h-56 overflow-y-auto custom-scrollbar bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1.5">
                <button
                  onClick={() => {
                    setAssigneeFilter(null);
                    setAssigneeOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                    assigneeFilter === null
                      ? "text-bridge-accent font-bold bg-bridge-accent/10"
                      : "text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {t("milestone.table.filterAll", { defaultValue: "전체" })}
                </button>
                {assigneeOptions.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAssigneeFilter(a.id);
                      setAssigneeOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs truncate transition-colors ${
                      assigneeFilter === a.id
                        ? "text-bridge-accent font-bold bg-bridge-accent/10"
                        : "text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {checklistsLoading && (
            <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
          )}
          <button
            onClick={handleExport}
            disabled={checklistsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-bridge-accent rounded-lg hover:bg-bridge-accent/90 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <Download className="h-3.5 w-3.5" />
            {t("milestone.table.exportExcel", {
              defaultValue: "엑셀 내보내기",
            })}
          </button>
        </div>
      </div>

      {/* ── 테이블 ── */}
      {visibleGroups.length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-10">
          {isFiltered
            ? t("milestone.table.noMatch", {
                defaultValue: "조건에 맞는 태스크가 없습니다",
              })
            : t("milestone.detail.noTasks", {
                defaultValue: "이 마일스톤에 배정된 태스크가 없습니다",
              })}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleItemDragStart}
          onDragEnd={handleItemDragEnd}
        >
          <div
            className={`grid grid-cols-1 gap-x-4 ${
              groupColumns.length === 2 ? "2xl:grid-cols-2" : ""
            }`}
          >
            {groupColumns.map((colGroups, colIdx) => (
              <div key={colIdx} className="overflow-x-auto custom-scrollbar">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead
                    className={
                      colIdx === 1 ? "hidden 2xl:table-header-group" : undefined
                    }
                  >
                    <tr className="border-b border-bridge-border">
                      <th className="w-[21%] px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400">
                        {t("milestone.table.colFeature", {
                          defaultValue: "피처",
                        })}
                      </th>
                      <th className="w-[25%] px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400">
                        {t("milestone.table.colTask", {
                          defaultValue: "태스크",
                        })}
                      </th>
                      <th className="w-[54%] px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-slate-400">
                        {t("milestone.table.colChecklist", {
                          defaultValue: "체크리스트",
                        })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {colGroups.map((g) => {
                      const pct =
                        g.progressTotal > 0
                          ? Math.round((g.progressDone / g.progressTotal) * 100)
                          : 0;
                      const showAddRow = canEdit;
                      const span =
                        g.visibleTasks.length + (showAddRow ? 1 : 0) || 1;
                      const isHome = homeByFeature.get(g.featureId) === mid;

                      const featureCell = (
                        <td
                          rowSpan={span}
                          className="align-top px-4 py-3 bg-foreground/[0.03] border-r border-foreground/[0.08]"
                        >
                          <div
                            className={`flex items-center gap-2${
                              g.feature && onFeatureClick
                                ? " cursor-pointer group/f"
                                : ""
                            }`}
                            onClick={
                              g.feature && onFeatureClick
                                ? () => onFeatureClick(g.feature!)
                                : undefined
                            }
                          >
                            {g.color && (
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: g.color }}
                              />
                            )}
                            <span className="text-xs font-bold text-foreground group-hover/f:text-bridge-accent transition-colors break-words">
                              {g.title}
                            </span>
                          </div>
                          {isHome && (
                            <span className="inline-block mt-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
                              {t("milestone.table.homeMilestone", {
                                defaultValue: "기본 마일스톤",
                              })}
                            </span>
                          )}
                          <div className="flex items-center gap-2 mt-2.5">
                            <div className="flex-1 max-w-[110px] h-1 rounded-full bg-foreground/10 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  pct === 100
                                    ? "bg-emerald-500"
                                    : "bg-bridge-accent"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                              <b className="text-foreground font-bold">
                                {g.progressDone}/{g.progressTotal}
                              </b>{" "}
                              · {pct}%
                            </span>
                          </div>
                        </td>
                      );

                      const rows = g.visibleTasks.map((tk, i) => {
                        const items = itemsOf(tk.id);
                        const state = checklists[tk.id];
                        const dueOver =
                          !tk.completed &&
                          !!tk.due_date &&
                          daysUntil(tk.due_date) < 0;
                        return (
                          <tr
                            key={tk.id}
                            className={`border-b border-foreground/[0.05]${
                              i === 0
                                ? " border-t border-t-foreground/[0.12]"
                                : ""
                            }`}
                          >
                            {i === 0 && featureCell}
                            {/* 태스크 셀 */}
                            <td className="align-top px-4 py-3 border-r border-foreground/[0.08]">
                              <div className="flex items-baseline gap-1.5">
                                <span
                                  className={`text-xs flex-shrink-0 ${
                                    tk.completed
                                      ? "text-emerald-500"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {tk.completed
                                    ? "✓"
                                    : statusOf(tk) === "doing"
                                      ? "◐"
                                      : "○"}
                                </span>
                                <span
                                  onClick={
                                    onTaskClick
                                      ? () => onTaskClick(tk)
                                      : undefined
                                  }
                                  className={`text-xs font-medium break-words ${
                                    tk.completed
                                      ? "text-slate-500 line-through"
                                      : "text-foreground"
                                  }${
                                    onTaskClick
                                      ? " cursor-pointer hover:text-bridge-accent hover:underline"
                                      : ""
                                  }`}
                                >
                                  {tk.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {sprintEnabled && (
                                  <SprintChipMenu
                                    taskId={tk.id}
                                    info={sprintInfoByTask.get(tk.id)}
                                    sprints={sprints}
                                    currentSeq={currentSeq}
                                    canMove={canEdit}
                                    onMove={onMoveSprint}
                                  />
                                )}
                                <ChecklistPresetPopover
                                  presets={presets}
                                  presetId={
                                    presetOverrides[tk.id] !== undefined
                                      ? presetOverrides[tk.id]
                                      : (tk.preset_id ?? null)
                                  }
                                  taskItemTitles={items.map((i) => i.title)}
                                  defaultSaveName={g.title}
                                  canEdit={canEdit}
                                  onApply={(pid) =>
                                    handleApplyPreset(tk.id, pid)
                                  }
                                  onClear={() => handleClearPreset(tk.id)}
                                  onSaveCurrent={(name) =>
                                    handleSavePreset(
                                      name,
                                      items.map((i) => i.title),
                                    )
                                  }
                                  onManage={() => setPresetManageOpen(true)}
                                />
                                {tk.due_date && (
                                  <span
                                    className={`text-xs tabular-nums ml-auto whitespace-nowrap ${
                                      dueOver
                                        ? "font-bold text-red-500"
                                        : "text-slate-500"
                                    }`}
                                  >
                                    {tk.completed
                                      ? `${toShortDate(tk.due_date)} ✓`
                                      : `~${toShortDate(tk.due_date)}`}
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* 체크리스트 셀 */}
                            <td className="align-top px-4 py-3">
                              <ItemsDropArea taskId={tk.id} enabled={canEdit}>
                                {state && !state.loaded ? (
                                  <span className="text-xs text-slate-600">
                                    —
                                  </span>
                                ) : items.length === 0 &&
                                  addingItemFor !== tk.id ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-600">
                                      —
                                    </span>
                                    {canEdit && (
                                      <button
                                        onClick={() => setAddingItemFor(tk.id)}
                                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-bridge-secondary transition-colors"
                                      >
                                        <Plus className="h-3 w-3" />
                                        {t("milestone.table.addItem", {
                                          defaultValue: "항목 추가",
                                        })}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    {items.map((item) => (
                                      <SortableChecklistLine
                                        key={item.id}
                                        item={item}
                                        taskId={tk.id}
                                        canEdit={canEdit}
                                        members={members}
                                        onToggle={() =>
                                          handleToggleItem(tk.id, item)
                                        }
                                        onRename={(title) =>
                                          handleRenameItem(tk.id, item, title)
                                        }
                                        onAssign={(m) =>
                                          handleAssignItem(tk.id, item, m)
                                        }
                                        onDates={(patch) =>
                                          handleDatesItem(tk.id, item, patch)
                                        }
                                        unassignedLabel={t(
                                          "milestone.detail.unassigned",
                                          { defaultValue: "미배정" },
                                        )}
                                        delayedLabel={t(
                                          "milestone.table.delayed",
                                          {
                                            defaultValue: "지연",
                                          },
                                        )}
                                      />
                                    ))}
                                    {canEdit &&
                                      (addingItemFor === tk.id ? (
                                        inlineInput(
                                          t(
                                            "milestone.table.addItemPlaceholder",
                                            {
                                              defaultValue:
                                                "체크 항목 입력 후 Enter",
                                            },
                                          ),
                                          (v) => void handleAddItem(tk.id, v),
                                          () => setAddingItemFor(null),
                                        )
                                      ) : (
                                        <button
                                          onClick={() =>
                                            setAddingItemFor(tk.id)
                                          }
                                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-bridge-secondary transition-colors pt-0.5"
                                        >
                                          <Plus className="h-3 w-3" />
                                          {t("milestone.table.addItem", {
                                            defaultValue: "항목 추가",
                                          })}
                                        </button>
                                      ))}
                                  </div>
                                )}
                              </ItemsDropArea>
                            </td>
                          </tr>
                        );
                      });

                      return (
                        <Fragment key={g.featureId}>
                          {rows}
                          {showAddRow && (
                            <tr
                              className={`border-b border-foreground/[0.05]${
                                g.visibleTasks.length === 0
                                  ? " border-t border-t-foreground/[0.12]"
                                  : ""
                              }`}
                            >
                              {g.visibleTasks.length === 0 && featureCell}
                              <td colSpan={2} className="px-4 py-2">
                                {addingTaskFor === g.featureId ? (
                                  inlineInput(
                                    t("milestone.table.addTaskPlaceholder", {
                                      defaultValue: "태스크 이름 입력 후 Enter",
                                    }),
                                    (v) => void handleAddTask(g.featureId, v),
                                    () => setAddingTaskFor(null),
                                  )
                                ) : (
                                  <button
                                    onClick={() => {
                                      setAddingItemFor(null);
                                      setAddingTaskFor(g.featureId);
                                    }}
                                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-bridge-accent transition-colors"
                                  >
                                    <Plus className="h-3 w-3" />
                                    {t("milestone.table.addTask", {
                                      defaultValue: "태스크 추가",
                                    })}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {dragItem ? (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-bridge-obsidian border border-bridge-secondary/40 shadow-2xl text-xs text-foreground">
                <GripVertical className="h-3 w-3 text-slate-500" />
                {dragItem.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <ChecklistPresetManageModal
        open={presetManageOpen}
        boardId={boardId}
        presets={presets}
        onClose={() => setPresetManageOpen(false)}
        onPresetsChange={setPresets}
      />
    </div>
  );
}

// ========================================
// Sortable checklist line
// ========================================

/** 체크리스트 항목 한 줄 — 그립 드래그 = 다른 태스크로 이동 (canEdit일 때만) */
function SortableChecklistLine({
  item,
  taskId,
  canEdit,
  members,
  onToggle,
  onRename,
  onAssign,
  onDates,
  unassignedLabel,
  delayedLabel,
}: {
  item: ChecklistItem;
  taskId: string;
  canEdit: boolean;
  members: { id: string; name: string }[];
  onToggle: () => void;
  onRename: (title: string) => void;
  onAssign: (member: { id: string; name: string } | null) => void;
  onDates: (patch: {
    start_date?: string | null;
    due_date?: string | null;
  }) => void;
  unassignedLabel: string;
  delayedLabel: string;
}) {
  const { t } = useTranslation();
  const datesLabel = t("milestone.table.setDates", { defaultValue: "기간" });
  const startLabel = t("milestone.table.dateStart", { defaultValue: "시작" });
  const endLabel = t("milestone.table.dateEnd", { defaultValue: "마감" });
  const clearDatesLabel = t("milestone.table.clearDates", {
    defaultValue: "기간 지우기",
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { taskId },
    disabled: !canEdit || editing,
  });

  const style = { opacity: isDragging ? 0.35 : 1 };

  const commitRename = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== item.title) onRename(v);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 group/cl"
      {...attributes}
    >
      {canEdit && (
        <span
          {...listeners}
          aria-label={item.title}
          className="cursor-grab active:cursor-grabbing text-slate-600 opacity-0 group-hover/cl:opacity-100 transition-opacity flex-shrink-0 touch-none"
        >
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      <button
        onClick={onToggle}
        disabled={!canEdit}
        aria-label={item.title}
        className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center text-xs leading-none transition-colors ${
          item.completed
            ? "bg-bridge-secondary/20 border-bridge-secondary text-bridge-secondary"
            : "border-foreground/25"
        }${canEdit ? " cursor-pointer hover:border-bridge-secondary" : ""}`}
      >
        {item.completed ? "✓" : ""}
      </button>

      {/* 제목 — 클릭 시 인라인 수정 (Enter 저장 · Esc 취소 · 블러 저장) */}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") commitRename();
            else if (e.key === "Escape") {
              setDraft(item.title);
              setEditing(false);
            }
          }}
          onBlur={commitRename}
          className="flex-1 min-w-0 bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
        />
      ) : (
        <span
          onClick={
            canEdit
              ? () => {
                  setDraft(item.title);
                  setEditing(true);
                }
              : undefined
          }
          className={`text-xs min-w-0 flex-1 break-words ${
            item.completed
              ? "text-slate-500 line-through"
              : "text-foreground/80"
          }${canEdit ? " cursor-text hover:text-foreground" : ""}`}
        >
          {item.title}
        </span>
      )}

      {/* 기간 (시작~마감) — 클릭 시 편집, 마감 지남 + 미완료면 빨강 */}
      {(item.start_date || item.due_date || canEdit) && (
        <div className="relative flex-shrink-0">
          <button
            onClick={canEdit ? () => setDateOpen((v) => !v) : undefined}
            disabled={!canEdit}
            className={`text-xs tabular-nums whitespace-nowrap ${
              !item.completed && item.due_date && daysUntil(item.due_date) < 0
                ? "font-bold text-red-500"
                : "text-slate-600"
            }${canEdit ? " cursor-pointer hover:text-foreground hover:underline" : ""}`}
          >
            {item.start_date || item.due_date ? (
              <>
                {item.start_date ? toShortDate(item.start_date) : ""}~
                {item.due_date ? toShortDate(item.due_date) : ""}
                {!item.completed &&
                item.due_date &&
                daysUntil(item.due_date) < 0
                  ? ` ${delayedLabel}`
                  : ""}
              </>
            ) : (
              <span className="opacity-0 group-hover/cl:opacity-100 transition-opacity">
                ＋{datesLabel}
              </span>
            )}
          </button>
          {dateOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setDateOpen(false)}
              />
              <div className="absolute top-full right-0 mt-1 z-40 w-52 bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl p-3 space-y-2">
                <label className="block">
                  <span className="block text-xs text-slate-500 mb-1">
                    {startLabel}
                  </span>
                  <input
                    type="date"
                    value={item.start_date?.slice(0, 10) ?? ""}
                    max={item.due_date?.slice(0, 10) || undefined}
                    onChange={(e) =>
                      onDates({ start_date: e.target.value || null })
                    }
                    className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-slate-500 mb-1">
                    {endLabel}
                  </span>
                  <input
                    type="date"
                    value={item.due_date?.slice(0, 10) ?? ""}
                    min={item.start_date?.slice(0, 10) || undefined}
                    onChange={(e) =>
                      onDates({ due_date: e.target.value || null })
                    }
                    className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                  />
                </label>
                {(item.start_date || item.due_date) && (
                  <button
                    onClick={() => {
                      onDates({ start_date: null, due_date: null });
                      setDateOpen(false);
                    }}
                    className="w-full text-left text-xs text-slate-500 hover:text-red-500 transition-colors pt-0.5"
                  >
                    {clearDatesLabel}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 담당자 — 클릭 시 배정/교체/해제 드롭다운 */}
      <div className="relative flex-shrink-0">
        <button
          onClick={canEdit ? () => setPickerOpen((v) => !v) : undefined}
          disabled={!canEdit}
          className={`text-xs ${
            item.assignee
              ? "text-slate-500"
              : "text-amber-600 dark:text-amber-400"
          }${canEdit ? " cursor-pointer hover:text-foreground hover:underline" : ""}`}
        >
          {item.assignee?.name ?? unassignedLabel}
        </button>
        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setPickerOpen(false)}
            />
            <div className="absolute top-full right-0 mt-1 z-40 w-40 max-h-48 overflow-y-auto custom-scrollbar bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1.5">
              <button
                onClick={() => {
                  onAssign(null);
                  setPickerOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                  !item.assignee
                    ? "text-bridge-accent font-bold bg-bridge-accent/10"
                    : "text-slate-400 hover:bg-foreground/5"
                }`}
              >
                {unassignedLabel}
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onAssign(m);
                    setPickerOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs truncate transition-colors ${
                    item.assignee?.id === m.id
                      ? "text-bridge-accent font-bold bg-bridge-accent/10"
                      : "text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ========================================
// Cross-task drop zone / Sprint chip menu
// ========================================

/** 체크 항목 드롭 존 — 다른 태스크에서 끌어온 항목을 받는다 */
function ItemsDropArea({
  taskId,
  enabled,
  children,
}: {
  taskId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `cl-${taskId}`,
    disabled: !enabled,
  });
  const highlight = isOver && active?.data.current?.taskId !== taskId;
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg transition-shadow ${
        highlight
          ? "ring-1 ring-bridge-secondary/60 bg-bridge-secondary/[0.06]"
          : ""
      }`}
    >
      {children}
    </div>
  );
}

/**
 * 스프린트 칩 + 버킷 선택 메뉴 — S1..Sn 중 어디에 담을지 고르거나 백로그로 뺀다.
 * 버킷은 마일스톤 기간을 등분한 상자일 뿐이라 지난 회차로 옮기는 것도 막지 않는다.
 */
function SprintChipMenu({
  taskId,
  info,
  sprints,
  currentSeq,
  canMove,
  onMove,
}: {
  taskId: string;
  info: TaskSprintInfo | undefined;
  sprints: SprintInfo[];
  currentSeq: number | null;
  canMove: boolean;
  onMove?: (taskId: string, toSprintId: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const interactive = canMove && !!onMove && sprints.length > 0;

  if (!interactive) {
    return <SprintChip info={info} currentSeq={currentSeq} />;
  }

  const pick = (toSprintId: string | null) => {
    onMove!(taskId, toSprintId);
    setOpen(false);
  };
  const rowClass = (on: boolean) =>
    `w-full px-3 py-1.5 text-left text-xs block transition-colors ${
      on
        ? "text-bridge-accent font-bold bg-bridge-accent/10"
        : "text-foreground hover:bg-foreground/5"
    }`;

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="cursor-pointer hover:opacity-80 transition-opacity"
      >
        <SprintChip info={info} currentSeq={currentSeq} />
      </button>
      {open && (
        <>
          <span
            className="fixed inset-0 z-30 block"
            onClick={() => setOpen(false)}
          />
          <span className="absolute top-full left-0 mt-1 z-40 w-52 max-h-64 overflow-y-auto custom-scrollbar bg-bridge-obsidian border border-foreground/10 rounded-xl shadow-2xl py-1.5 block">
            {sprints.map((sp) => {
              const on = info?.sprintId === sp.id;
              return (
                <button
                  key={sp.id}
                  onClick={() => pick(sp.id)}
                  className={rowClass(on)}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums">S{sp.sequence_no}</span>
                    {sp.state === "CURRENT" && (
                      <span className="text-bridge-secondary">
                        {t("milestone.detail.sprintActive", {
                          defaultValue: "진행 중",
                        })}
                      </span>
                    )}
                    {sp.state === "PAST" && (
                      <span className="text-slate-500">✓</span>
                    )}
                    {/* 어느 상자인지는 회차보다 기간으로 더 빨리 읽힌다 */}
                    <span className="ml-auto text-slate-500 tabular-nums">
                      {toShortDate(sp.start_date)}~{toShortDate(sp.end_date)}
                    </span>
                  </span>
                </button>
              );
            })}
            <span className="block border-t border-foreground/[0.08] my-1.5" />
            <button
              onClick={() => pick(null)}
              className={rowClass(!info?.sprintId)}
            >
              {t("milestone.detail.backlog", { defaultValue: "백로그" })}
            </button>
          </span>
        </>
      )}
    </span>
  );
}
