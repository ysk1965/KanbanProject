import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  CornerUpLeft,
  GripVertical,
  Flag,
  ChevronLeft,
  Eye,
  EyeOff,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { sprintAPI, checklistAPI } from "../utils/api";
import type {
  SprintBoard as SprintBoardData,
  SprintColumn,
  SprintInfo,
  SprintItemCard,
} from "../types";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { formatDate } from "../utils/dateUtils";
import { MotionModal } from "./ui/MotionModal";

interface SprintBoardProps {
  boardId: string;
  milestones: { id: string; title: string }[];
  canEdit: boolean;
  isAdminOrOwner: boolean;
  /** 지정 시 이 마일스톤으로 고정(칸반 탭 연동). 미지정이면 자체 드롭다운으로 선택 */
  milestoneId?: string;
  /** 좌측 트리에서 체크리스트 행 클릭 → 태스크 모달(+ 해당 항목 하이라이트) */
  onOpenChecklistItem?: (taskId: string, checklistItemId?: string) => void;
  /** 담당자 필터(칸반 탭 필터바 연동). 이름 배열(+ '__no_members__'). 빈 배열이면 전체 */
  memberFilter?: string[];
}

/** Feature ▸ Task ▸ 체크리스트 소스 트리 노드 */
interface TreeTask {
  taskId: string;
  taskTitle: string;
  items: SprintItemCard[];
}
interface TreeFeature {
  featureId: string;
  featureTitle: string;
  featureColor: string | null;
  tasks: TreeTask[];
  total: number;
  taken: number;
}

const DRAG_ITEM = "application/bridge-sprint-item";
const DRAG_SOURCE = "application/bridge-sprint-source";
/** 좌측 트리 "담긴 항목 보임 필터" 상태 저장 키(새로고침해도 유지) */
const SPRINT_TREE_SHOW_TAKEN_KEY = "bridge:sprint-tree:show-taken";

/** apiClient는 ApiError 객체({code,message})를 throw하므로 message를 우선 추출 */
function errMessage(e: unknown, fallback: string): string {
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message?: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  return e instanceof Error ? e.message : fallback;
}

export function SprintBoard({
  boardId,
  milestones,
  canEdit,
  isAdminOrOwner,
  milestoneId: controlledMilestoneId,
  onOpenChecklistItem,
  memberFilter,
}: SprintBoardProps) {
  const controlled = !!controlledMilestoneId;
  const [internalMid, setInternalMid] = useState<string>(
    controlledMilestoneId ?? milestones[0]?.id ?? "",
  );
  const milestoneId = controlledMilestoneId ?? internalMid;
  const [board, setBoard] = useState<SprintBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collapsedFeatures, setCollapsedFeatures] = useState<Set<string>>(
    new Set(),
  );
  // 보드: Feature 컬럼 안 Task 소그룹 접기 상태 (key = `${featureId}:${taskId}`)
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(new Set());
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editColName, setEditColName] = useState("");
  const busyRef = useRef(false);

  // 과거 스프린트 미리보기 — 클릭 시 읽기 전용 스냅샷 열람(백엔드 무변경).
  // 재활성화는 배너의 명시적 버튼 → 확인 모달로만 진입한다.
  const [previewSprintId, setPreviewSprintId] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<SprintItemCard[] | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  // 재활성화 확인 모달 대상 스프린트(null이면 닫힘)
  const [reactivateTarget, setReactivateTarget] = useState<SprintInfo | null>(
    null,
  );

  // 좌측 트리 "보임 필터": 스프린트에 담긴(Sprint·Done 배지) 체크리스트 항목 숨김 토글.
  // 초기값은 localStorage에서 복원(기본 = 보임), 변경 시 저장하여 새로고침해도 유지.
  const [showTakenInTree, setShowTakenInTree] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SPRINT_TREE_SHOW_TAKEN_KEY) !== "false";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SPRINT_TREE_SHOW_TAKEN_KEY, String(showTakenInTree));
    } catch {
      /* 프라이빗 모드 등 localStorage 접근 불가 시 무시 */
    }
  }, [showTakenInTree]);

  const load = useCallback(async () => {
    if (!milestoneId) {
      setLoading(false);
      setBoard(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await sprintAPI.getSprintBoard(boardId, milestoneId);
      setBoard(data);
    } catch (e: unknown) {
      setError(errMessage(e, "스프린트를 불러오지 못했습니다"));
    } finally {
      setLoading(false);
    }
  }, [boardId, milestoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!controlled && !internalMid && milestones[0]?.id) {
      setInternalMid(milestones[0].id);
    }
  }, [controlled, milestones, internalMid]);

  // 마일스톤 전환 시 미리보기 상태 초기화(다른 마일스톤의 스프린트를 이어보지 않도록)
  useEffect(() => {
    setPreviewSprintId(null);
    setPreviewItems(null);
    setReactivateTarget(null);
  }, [milestoneId]);

  // 미리보기 대상 스프린트의 담긴 카드 조회(읽기 전용). 백엔드 상태는 변경하지 않는다.
  useEffect(() => {
    if (!previewSprintId) {
      setPreviewItems(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewItems(null);
    sprintAPI
      .getSprintItems(boardId, previewSprintId)
      .then((items) => {
        if (!cancelled) setPreviewItems(items);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(errMessage(e, "스프린트를 불러오지 못했습니다"));
          setPreviewSprintId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, previewSprintId]);

  // 뮤테이션 헬퍼 — 반환된 최신 보드로 즉시 교체
  const run = useCallback(async (fn: () => Promise<SprintBoardData>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    try {
      const data = await fn();
      setBoard(data);
    } catch (e: unknown) {
      setError(errMessage(e, "작업에 실패했습니다"));
    } finally {
      busyRef.current = false;
    }
  }, []);

  // 담당자 필터 — 칸반 탭 필터바(filterOptions.members)와 동일 규칙으로 카드 걸러내기.
  // 컬럼/백로그/좌측 트리 및 게이지가 모두 filteredBoard에서 파생되어 필터를 반영한다.
  const filteredBoard = useMemo<SprintBoardData | null>(() => {
    if (!board) return null;
    const members = memberFilter ?? [];
    if (members.length === 0) return board;
    const hasNoAssignee = members.includes("__no_members__");
    const names = new Set(members.filter((m) => m !== "__no_members__"));
    const matches = (it: SprintItemCard) => {
      const name = it.assignee?.name;
      if (!name) return hasNoAssignee;
      return names.has(name);
    };
    const filteredColumns = board.columns.map((c) => ({
      ...c,
      items: c.items.filter(matches),
    }));
    // 게이지 재계산: 담긴 항목(sprint_column_id) 중 완료/Done 컬럼 도달분
    const endColIds = new Set(
      board.columns.filter((c) => c.kind === "END").map((c) => c.id),
    );
    let done = 0;
    let total = 0;
    for (const c of filteredColumns) {
      for (const it of c.items) {
        if (!it.sprint_column_id) continue;
        total += 1;
        if (it.completed || endColIds.has(it.sprint_column_id)) done += 1;
      }
    }
    return {
      ...board,
      backlog: board.backlog.filter(matches),
      columns: filteredColumns,
      gauge: {
        done,
        total,
        percentage: total > 0 ? Math.round((done / total) * 100) : 0,
      },
    };
  }, [board, memberFilter]);

  const activeSprint = filteredBoard?.active_sprint ?? null;
  const columns = useMemo(
    () =>
      (filteredBoard?.columns ?? [])
        .slice()
        .sort((a, b) => a.position - b.position),
    [filteredBoard],
  );

  // 소스 트리: backlog + 모든 컬럼 아이템을 합쳐 Feature ▸ Task ▸ 체크리스트로 재구성
  const tree = useMemo<TreeFeature[]>(() => {
    if (!filteredBoard) return [];
    const all: SprintItemCard[] = [
      ...filteredBoard.backlog,
      ...filteredBoard.columns.flatMap((c) => c.items),
    ];
    const featMap = new Map<string, TreeFeature>();
    for (const it of all) {
      const fid = it.feature_id ?? "__none__";
      let feat = featMap.get(fid);
      if (!feat) {
        feat = {
          featureId: fid,
          featureTitle: it.feature_title ?? "기타",
          featureColor: it.feature_color ?? null,
          tasks: [],
          total: 0,
          taken: 0,
        };
        featMap.set(fid, feat);
      }
      const tid = it.task_id ?? "__none__";
      let task = feat.tasks.find((t) => t.taskId === tid);
      if (!task) {
        task = { taskId: tid, taskTitle: it.task_title ?? "기타", items: [] };
        feat.tasks.push(task);
      }
      task.items.push(it);
      feat.total += 1;
      if (it.sprint_column_id) feat.taken += 1;
    }
    return Array.from(featMap.values());
  }, [filteredBoard]);

  // 보임 필터 적용 후 트리에 표시할 항목이 하나라도 남는지(빈 상태 안내용)
  const treeHasVisible = useMemo(() => {
    if (showTakenInTree) return tree.length > 0;
    return tree.some((f) =>
      f.tasks.some((t) => t.items.some((it) => !it.sprint_column_id)),
    );
  }, [tree, showTakenInTree]);

  const toggleFeature = (fid: string) => {
    setCollapsedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };
  const toggleTask = (key: string) => {
    setCollapsedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 담긴 항목의 소속 컬럼 조회(칩 표시용)
  const columnById = useMemo(() => {
    const m = new Map<string, SprintColumn>();
    for (const c of columns) m.set(c.id, c);
    return m;
  }, [columns]);
  const columnAccent = (c: SprintColumn) =>
    c.kind === "START"
      ? "#6366F1"
      : c.kind === "END"
        ? "#34d399"
        : (c.color ?? "#f59e0b");

  // START("Sprint") 컬럼 — Task 단위 컬럼으로 쪼개기 위한 앵커
  const startColumn = useMemo(
    () => columns.find((c) => c.kind === "START") ?? null,
    [columns],
  );

  // 스프린트에 담긴 각 Feature = 하나의 컬럼. 컬럼 안은 Task 소그룹으로 나뉜다.
  // 존재 조건(컬럼·소그룹 공통): "아직 Done이 아닌 담긴 항목"이 1개 이상 →
  //   In Review로 옮겨도 유지되고, 전부 Done에 도달하면(= Done 컬럼에 모임) 사라진다.
  // 소그룹 안 카드로 표시되는 건 START(Sprint) 단계에 남은 항목뿐. 순서는 좌측 트리와 일치.
  interface TaskGroup {
    taskId: string;
    taskTitle: string;
    items: SprintItemCard[]; // START 단계에 남은 카드
    doneTotal: number; // 담긴 항목 중 완료 수
    total: number; // 담긴 항목 전체 수
  }
  const featureColumns = useMemo(() => {
    if (!startColumn) return [];
    const result: {
      featureId: string;
      featureTitle: string;
      featureColor: string | null;
      tasks: TaskGroup[];
      doneTotal: number;
      total: number;
    }[] = [];
    for (const feat of tree) {
      const taskGroups: TaskGroup[] = [];
      let fDone = 0;
      let fTotal = 0;
      for (const task of feat.tasks) {
        const taken = task.items.filter((it) => it.sprint_column_id);
        if (taken.length === 0) continue;

        let doneTotal = 0;
        let notInDoneColumn = 0;
        for (const it of taken) {
          const kind = it.sprint_column_id
            ? columnById.get(it.sprint_column_id)?.kind
            : undefined;
          if (it.completed || kind === "END") doneTotal += 1;
          if (kind !== "END") notInDoneColumn += 1;
        }
        // Feature 진척도에는 완료된 Task도 포함
        fDone += doneTotal;
        fTotal += taken.length;
        // 전부 Done인 Task 소그룹은 숨김(Done 컬럼에 모임)
        if (notInDoneColumn === 0) continue;

        const startItems = taken.filter(
          (it) => it.sprint_column_id === startColumn.id,
        );
        taskGroups.push({
          taskId: task.taskId,
          taskTitle: task.taskTitle,
          items: startItems,
          doneTotal,
          total: taken.length,
        });
      }
      // 활성 Task 소그룹이 없으면(전부 Done/미담김) Feature 컬럼 숨김
      if (taskGroups.length === 0) continue;
      result.push({
        featureId: feat.featureId,
        featureTitle: feat.featureTitle,
        featureColor: feat.featureColor,
        tasks: taskGroups,
        doneTotal: fDone,
        total: fTotal,
      });
    }
    return result;
  }, [tree, startColumn, columnById]);

  // 좌측 행: 체크박스 → 완료 토글(체크리스트 API 재사용 후 보드 갱신)
  const toggleDone = (it: SprintItemCard) => {
    if (!canEdit || !it.task_id) return;
    void run(async () => {
      await checklistAPI.toggleItem(boardId, it.task_id!, it.id);
      return sprintAPI.getSprintBoard(boardId, milestoneId);
    });
  };
  // 본문 클릭 → 태스크 모달 + 해당 체크리스트 하이라이트
  const openItem = (it: SprintItemCard) => {
    if (it.task_id) onOpenChecklistItem?.(it.task_id, it.id);
  };
  const openTask = (taskId: string) => {
    if (taskId !== "__none__") onOpenChecklistItem?.(taskId);
  };

  // ==================== 드래그 앤 드롭 ====================
  const onDragStartItem = (
    e: React.DragEvent,
    item: SprintItemCard,
    source: "backlog" | "sprint",
  ) => {
    if (!canEdit) return;
    e.dataTransfer.setData(DRAG_ITEM, item.id);
    e.dataTransfer.setData(DRAG_SOURCE, source);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDropColumn = async (e: React.DragEvent, col: SprintColumn) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!canEdit || !activeSprint) return;
    const itemId = e.dataTransfer.getData(DRAG_ITEM);
    const source = e.dataTransfer.getData(DRAG_SOURCE);
    if (!itemId) return;
    if (source === "backlog") {
      // 담기(START로) 후 목표 컬럼이 START가 아니면 이동
      await run(async () => {
        await sprintAPI.addItem(boardId, activeSprint.id, itemId);
        if (col.kind !== "START") {
          return sprintAPI.moveToColumn(boardId, itemId, col.id);
        }
        return sprintAPI.getSprintBoard(boardId, milestoneId);
      });
    } else {
      await run(() => sprintAPI.moveToColumn(boardId, itemId, col.id));
    }
  };

  const removeCard = (item: SprintItemCard) => {
    if (!activeSprint) return;
    void run(() => sprintAPI.removeItem(boardId, activeSprint.id, item.id));
  };

  // ==================== 컬럼 CRUD ====================
  const submitNewColumn = () => {
    const name = newColName.trim();
    if (!name) return;
    setNewColName("");
    setAddingColumn(false);
    void run(() => sprintAPI.createColumn(boardId, milestoneId, name));
  };
  const submitRename = (col: SprintColumn) => {
    const name = editColName.trim();
    setEditingCol(null);
    if (!name || name === col.name) return;
    void run(() => sprintAPI.updateColumn(boardId, col.id, { name }));
  };
  const removeColumn = (col: SprintColumn) => {
    if (
      !window.confirm(
        `"${col.name}" 컬럼을 삭제할까요? 담긴 카드는 앞 컬럼으로 이동합니다.`,
      )
    )
      return;
    void run(() => sprintAPI.deleteColumn(boardId, col.id));
  };
  const moveColumn = (col: SprintColumn, dir: -1 | 1) => {
    const middles = columns.filter((c) => c.kind === "MIDDLE");
    const idx = middles.findIndex((c) => c.id === col.id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= middles.length) return;
    const reordered = middles.slice();
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    void run(() =>
      sprintAPI.reorderColumns(
        boardId,
        milestoneId,
        reordered.map((c) => c.id),
      ),
    );
  };

  // ==================== 라이프사이클 ====================
  const closeSprint = () => {
    if (!activeSprint) return;
    if (
      !window.confirm(
        `${activeSprint.name}을(를) 종료하고 다음 스프린트를 시작할까요?`,
      )
    )
      return;
    void run(() => sprintAPI.closeSprint(boardId, activeSprint.id));
  };

  const gauge = filteredBoard?.gauge; // 표시용(담당자 필터 반영)
  // 스프린트 종료는 전체 진척 기준(필터로 100%처럼 보여도 조기 종료 방지)
  const fullGauge = board?.gauge;
  const canClose =
    isAdminOrOwner &&
    !!fullGauge &&
    fullGauge.total > 0 &&
    fullGauge.percentage === 100;

  // 재활성화 상태: 현재 활성 스프린트가 최신(max seq)이 아니면 과거 스프린트를 재활성화한 상태.
  // 이때 최신 스프린트는 뒤로 보관(parked)되어 있고, "재활성화 취소"로만 복귀 가능.
  const maxSeq = (board?.sprints ?? []).reduce(
    (m, s) => Math.max(m, s.sequence_no),
    0,
  );
  const inReactivation = !!activeSprint && activeSprint.sequence_no < maxSeq;

  const cancelReactivation = () => {
    if (!activeSprint) return;
    if (!window.confirm("재활성화를 취소하고 최신 스프린트로 되돌릴까요?"))
      return;
    void run(() => sprintAPI.cancelReactivation(boardId, activeSprint.id));
  };

  // ==================== 미리보기(읽기 전용 스냅샷) ====================
  const previewSprint =
    (previewSprintId && (board?.sprints ?? []).find((s) => s.id === previewSprintId)) ||
    null;
  // 미리보기 카드를 마일스톤 컬럼(Sprint/In Review/Done)에 최종 위치대로 배치.
  // 컬럼 정의는 마일스톤 소속이라 스프린트 간 공유 → 활성 보드의 columns를 그대로 재사용.
  const previewColumns = useMemo(() => {
    if (!previewSprintId || !previewItems) return null;
    const members = memberFilter ?? [];
    const hasNoAssignee = members.includes("__no_members__");
    const names = new Set(members.filter((m) => m !== "__no_members__"));
    const matches = (it: SprintItemCard) => {
      if (members.length === 0) return true;
      const name = it.assignee?.name;
      return name ? names.has(name) : hasNoAssignee;
    };
    const items = previewItems.filter(
      (it) => it.sprint_column_id && matches(it),
    );
    return columns.map((col) => ({
      ...col,
      items: items
        .filter((it) => it.sprint_column_id === col.id)
        .sort((a, b) => a.position - b.position),
    }));
  }, [previewSprintId, previewItems, columns, memberFilter]);

  const openReactivateModal = (target: SprintInfo) => {
    setReactivateTarget(target);
  };
  const confirmReactivate = () => {
    if (!reactivateTarget) return;
    const id = reactivateTarget.id;
    setReactivateTarget(null);
    setPreviewSprintId(null);
    void run(() => sprintAPI.reactivateSprint(boardId, id));
  };

  // ==================== 렌더 ====================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }
  if (!milestoneId || milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
        <Flag className="w-8 h-8 opacity-40" />
        <p className="text-sm">
          마일스톤을 먼저 만들면 스프린트가 자동으로 시작됩니다.
        </p>
      </div>
    );
  }

  // 스프린트 카드 (Task 컬럼 · In Review · Done 공통). readOnly 시 드래그·빼기 비활성(미리보기).
  const renderCard = (it: SprintItemCard, readOnly = false) => (
    <div
      key={it.id}
      draggable={canEdit && !readOnly}
      onDragStart={(e) => !readOnly && onDragStartItem(e, it, "sprint")}
      className={`group rounded-xl border border-foreground/[0.08] bg-bridge-dark p-2.5 space-y-2 transition-colors ${
        readOnly ? "cursor-default" : "hover:border-bridge-border cursor-grab"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{
            background: `${it.feature_color ?? "#6366F1"}22`,
            color: it.feature_color ?? "#93c5fd",
          }}
        >
          {it.feature_title ?? "기타"}
        </span>
        {canEdit && !readOnly && (
          <button
            onClick={() => removeCard(it)}
            className="ml-auto p-0.5 rounded text-slate-600 opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-opacity shrink-0"
            aria-label="스프린트에서 빼기"
            title="스프린트에서 빼기"
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div
        className={`text-xs font-medium leading-snug ${
          it.completed ? "line-through text-slate-500" : "text-foreground"
        }`}
      >
        {it.title}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        {it.task_title && <span className="truncate">{it.task_title}</span>}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {it.due_date && (
            <span className="tabular-nums">{formatDate(it.due_date)}</span>
          )}
          {it.completed ? (
            <span className="inline-flex items-center gap-0.5 text-bridge-secondary font-bold">
              <Check className="w-3 h-3" /> 완료
            </span>
          ) : it.assignee ? (
            <span
              className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold text-white"
              style={{ background: getAssigneeHex(it.assignee.name) }}
            >
              {getInitials(it.assignee.name)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  // Feature 단위 컬럼 (기존 "Sprint" 컬럼을 Feature별로 쪼갠 것).
  // 컬럼 안은 Task 소그룹으로 나뉘고, 소그룹은 접기/펼치기 가능.
  // 드롭 목적지는 START 컬럼 — 담기면 각 항목이 자신의 Feature/Task로 자동 배치된다.
  const renderFeatureColumn = (fc: (typeof featureColumns)[number]) => {
    const accent = fc.featureColor ?? "#6366F1";
    const key = `feat-${fc.featureId}`;
    const pct = fc.total > 0 ? Math.round((fc.doneTotal / fc.total) * 100) : 0;
    return (
      <div
        key={key}
        onDragOver={(e) => {
          if (canEdit) {
            e.preventDefault();
            setDragOverCol(key);
          }
        }}
        onDragLeave={() => setDragOverCol((c) => (c === key ? null : c))}
        onDrop={(e) => {
          if (startColumn) void onDropColumn(e, startColumn);
        }}
        className={`w-[270px] shrink-0 flex flex-col rounded-2xl border bg-bridge-obsidian transition-colors ${
          dragOverCol === key
            ? "border-bridge-accent/60"
            : "border-foreground/[0.08]"
        }`}
      >
        {/* Feature 컬럼 헤더 + 진척 바 */}
        <div className="px-3 pt-2.5 pb-2 border-b border-foreground/[0.06]">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: accent }}
            />
            <span
              className="text-xs font-bold text-foreground truncate flex-1"
              title={fc.featureTitle}
            >
              {fc.featureTitle}
            </span>
            <span className="text-[9px] font-bold text-slate-500 tracking-wide shrink-0">
              FEATURE
            </span>
            <span className="text-[10px] font-bold text-slate-500 tabular-nums bg-bridge-dark rounded-full px-1.5 shrink-0">
              {fc.doneTotal}/{fc.total}
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Task 소그룹 스택 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
          {fc.tasks.map((task) => {
            const tkey = `${fc.featureId}:${task.taskId}`;
            const collapsed = collapsedTasks.has(tkey);
            const clickable = task.taskId !== "__none__" && !!onOpenChecklistItem;
            return (
              <div key={task.taskId}>
                {/* Task 소그룹 헤더 (클릭 = 접기/펼치기, 호버 시 열기) */}
                <div className="group/task flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-bridge-dark border border-foreground/[0.06]">
                  <button
                    type="button"
                    onClick={() => toggleTask(tkey)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    aria-label={collapsed ? "펼치기" : "접기"}
                  >
                    {collapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide text-slate-300 truncate"
                      title={task.taskTitle}
                    >
                      {task.taskTitle}
                    </span>
                  </button>
                  {clickable && (
                    <button
                      type="button"
                      onClick={() => openTask(task.taskId)}
                      className="text-[10px] font-bold text-bridge-accent opacity-0 group-hover/task:opacity-100 transition-opacity shrink-0"
                      title="태스크 열기"
                    >
                      열기 ↗
                    </button>
                  )}
                  <span className="text-[10px] font-bold text-slate-500 tabular-nums shrink-0">
                    {task.doneTotal}/{task.total}
                  </span>
                </div>

                {/* 카드 (펼침 시) */}
                {!collapsed && (
                  <div className="mt-1.5 space-y-1.5 pl-1">
                    {task.items.length === 0 ? (
                      <div className="py-2 px-1 text-[10px] text-slate-600">
                        In Review로 이동됨 · 끌어와 되돌리기
                      </div>
                    ) : (
                      task.items.map(renderCard)
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 상단 컨트롤 바 */}
      <div className="shrink-0 px-4 md:px-6 py-3 border-b border-foreground/[0.08] bg-bridge-obsidian">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 마일스톤 드롭다운 (칸반 탭 연동 시 숨김) */}
          {!controlled && (
            <div className="relative">
              <select
                value={internalMid}
                onChange={(e) => setInternalMid(e.target.value)}
                className="appearance-none bg-foreground/[0.04] border border-foreground/10 rounded-lg py-1.5 pl-3 pr-8 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 cursor-pointer"
              >
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}

          {/* 스프린트 타임라인 칩 — 과거 칩 클릭 = 읽기 전용 미리보기(재활성화 아님) */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(board?.sprints ?? []).map((s) => {
              const isActive = s.status === "ACTIVE";
              const isPreviewing = s.id === previewSprintId;
              // 활성 칩: 미리보기 중이면 클릭 시 진행중으로 복귀, 아니면 no-op.
              // 과거 칩: 항상 미리보기 진입(전원, 백엔드 무변경).
              const handleClick = isActive
                ? previewSprintId
                  ? () => setPreviewSprintId(null)
                  : undefined
                : () => setPreviewSprintId(s.id);
              return (
                <button
                  key={s.id}
                  onClick={handleClick}
                  disabled={!handleClick}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors inline-flex items-center gap-1 ${
                    isPreviewing
                      ? "bg-bridge-secondary/15 text-bridge-secondary ring-1 ring-bridge-secondary/50"
                      : isActive
                        ? "bg-bridge-accent/15 text-bridge-accent " +
                          (handleClick
                            ? "cursor-pointer hover:bg-bridge-accent/25"
                            : "cursor-default")
                        : "bg-foreground/[0.05] text-slate-400 hover:bg-foreground/10 cursor-pointer"
                  }`}
                  title={
                    isPreviewing
                      ? "미리보기 중 · 읽기 전용"
                      : isActive
                        ? previewSprintId
                          ? "클릭해서 진행중으로 돌아가기"
                          : "진행 중"
                        : "클릭해서 미리보기 (읽기 전용)"
                  }
                >
                  {isPreviewing && <Eye className="w-3 h-3" />}
                  {s.name}
                  {isActive && (
                    <span className="ml-0.5 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-bridge-secondary animate-pulse" />
                      진행중
                    </span>
                  )}
                  {!isActive && !isPreviewing && ` ${s.progress_percentage}%`}
                </button>
              );
            })}
          </div>

          {/* 라이프사이클 버튼 (미리보기 중에는 숨김 — 진행중 스프린트 대상 액션) */}
          {activeSprint && isAdminOrOwner && !previewSprintId && (
            <div className="ml-auto flex items-center gap-2">
              {inReactivation && (
                <button
                  onClick={cancelReactivation}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-bridge-secondary bg-bridge-secondary/15 hover:bg-bridge-secondary/25 transition-colors"
                  title="재활성화를 취소하고 최신 스프린트로 되돌립니다"
                >
                  재활성화 취소
                </button>
              )}
              <button
                onClick={closeSprint}
                disabled={!canClose}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  canClose
                    ? "bg-bridge-accent text-white hover:bg-bridge-accent/90"
                    : "bg-foreground/[0.05] text-slate-500 cursor-not-allowed"
                }`}
                title={
                  canClose
                    ? "스프린트 종료"
                    : "모든 카드가 Done이어야 종료할 수 있습니다"
                }
              >
                {inReactivation ? "재동결" : "스프린트 종료"}
              </button>
            </div>
          )}
        </div>

        {/* 스코프 게이지 (미리보기 중에는 배너가 진척을 대신 표시) */}
        {activeSprint && gauge && !previewSprintId && (
          <div className="mt-3">
            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl font-bold text-foreground tabular-nums">
                {gauge.percentage}
                <span className="text-sm text-slate-400">%</span>
              </span>
              <span className="text-xs text-slate-400 tabular-nums">
                {gauge.done} / {gauge.total} 항목 완료
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-bridge-dark overflow-hidden border border-foreground/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all"
                style={{ width: `${gauge.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* 미리보기 배너 — 과거 스프린트 읽기 전용 열람 + 재활성화 진입점 */}
        {previewSprint && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-bridge-secondary/25 bg-gradient-to-r from-bridge-secondary/[0.12] to-transparent px-3.5 py-2.5">
            <span className="w-7 h-7 rounded-lg bg-bridge-secondary/15 text-bridge-secondary grid place-items-center shrink-0">
              <Eye className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-foreground truncate">
                  {previewSprint.name}
                </span>
                <span className="text-slate-500">미리보기 ·</span>
                <span className="font-bold text-bridge-secondary">
                  읽기 전용
                </span>
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums truncate">
                {previewSprint.start_date &&
                  `${formatDate(previewSprint.start_date)} ~ ${
                    previewSprint.end_date
                      ? formatDate(previewSprint.end_date)
                      : "진행"
                  } · `}
                {previewSprint.completed_count}/{previewSprint.total_count} 완료
                ({previewSprint.progress_percentage}%)
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {isAdminOrOwner &&
                (inReactivation ? (
                  <span className="text-[11px] text-slate-500">
                    재활성화 취소 후 이용 가능
                  </span>
                ) : (
                  <button
                    onClick={() => openReactivateModal(previewSprint)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-bridge-secondary bg-bridge-secondary/15 hover:bg-bridge-secondary/25 transition-colors"
                    title="이 스프린트를 다시 진행중으로 되살립니다"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />이 스프린트 재활성화
                  </button>
                ))}
              <button
                onClick={() => setPreviewSprintId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors"
              >
                진행중으로 돌아가기
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </div>

      {/* 스플릿: 좌 소스 트리 / 우 스프린트 보드 (미리보기 중엔 트리 숨김 → 스냅샷 풀폭) */}
      <div className="flex-1 min-h-0 flex">
        {/* 좌: 소스 트리 — Feature 섹션 ▸ Task 라벨 ▸ 체크리스트 행(클릭 진입 + 인라인 완료) */}
        {!previewSprintId && (
        <aside className="w-[300px] shrink-0 border-r border-foreground/[0.08] flex flex-col bg-bridge-dark">
          <div className="px-4 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 truncate flex-1">
              Feature ▸ Task ▸ 체크리스트
            </span>
            {/* 보임 필터 — 담긴(Sprint·Done) 항목 숨기기/보이기 (상태 유지) */}
            <button
              type="button"
              onClick={() => setShowTakenInTree((v) => !v)}
              aria-pressed={!showTakenInTree}
              title={
                showTakenInTree
                  ? "담긴(Sprint·Done) 항목 숨기기"
                  : "담긴(Sprint·Done) 항목 보이기"
              }
              className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                showTakenInTree
                  ? "bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30"
                  : "bg-foreground/[0.03] text-slate-400 border-foreground/10 hover:border-foreground/20"
              }`}
            >
              {showTakenInTree ? (
                <Eye className="w-3 h-3" />
              ) : (
                <EyeOff className="w-3 h-3" />
              )}
              {showTakenInTree ? "담긴 항목" : "담긴 항목 숨김"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {tree.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-8">
                항목이 없습니다.
              </p>
            )}
            {tree.length > 0 && !treeHasVisible && (
              <p className="text-xs text-slate-500 text-center py-8 leading-relaxed">
                담긴 항목만 있어 모두 숨겨졌어요.
                <br />
                <button
                  type="button"
                  onClick={() => setShowTakenInTree(true)}
                  className="mt-1 text-bridge-accent font-bold hover:underline"
                >
                  담긴 항목 보이기
                </button>
              </p>
            )}
            {tree.map((feat) => {
              // 보임 필터: 담김 항목 숨김 시, 표시할 항목이 남은 Task만 유지
              const visibleTasks = feat.tasks
                .map((task) => ({
                  task,
                  items: showTakenInTree
                    ? task.items
                    : task.items.filter((it) => !it.sprint_column_id),
                }))
                .filter((t) => t.items.length > 0);
              // 표시할 항목이 하나도 없으면 Feature 섹션 자체를 숨김
              if (visibleTasks.length === 0) return null;
              const collapsed = collapsedFeatures.has(feat.featureId);
              const pct =
                feat.total > 0
                  ? Math.round((feat.taken / feat.total) * 100)
                  : 0;
              return (
                <div key={feat.featureId} className="space-y-0.5">
                  {/* Feature 섹션 헤더 */}
                  <button
                    onClick={() => toggleFeature(feat.featureId)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-foreground/5 transition-colors"
                  >
                    {collapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    )}
                    <span
                      className="w-1 h-4 rounded-full shrink-0"
                      style={{ background: feat.featureColor ?? "#6366F1" }}
                    />
                    <span
                      className="text-xs font-bold text-foreground truncate flex-1 text-left"
                      title={feat.featureTitle}
                    >
                      {feat.featureTitle}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="w-8 h-1 rounded-full bg-foreground/10 overflow-hidden">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {feat.taken}/{feat.total}
                      </span>
                    </span>
                  </button>

                  {!collapsed && (
                    <div className="space-y-1.5 pb-1">
                      {visibleTasks.map(({ task, items }) => {
                        const hasTask =
                          task.taskId !== "__none__" && !!onOpenChecklistItem;
                        return (
                          <div key={task.taskId}>
                            {/* Task 라벨 (구분자 + 태스크 진입) */}
                            <button
                              type="button"
                              onClick={() => openTask(task.taskId)}
                              disabled={!hasTask}
                              className={`group/task w-full flex items-center gap-1.5 pl-7 pr-2 py-1 rounded-md text-left transition-colors ${
                                hasTask
                                  ? "hover:bg-foreground/[0.03] cursor-pointer"
                                  : "cursor-default"
                              }`}
                              title={task.taskTitle}
                            >
                              <span className="text-xs font-medium uppercase tracking-wide text-slate-400 truncate flex-1">
                                {task.taskTitle}
                              </span>
                              {hasTask && (
                                <span className="text-[11px] font-bold text-bridge-accent opacity-0 group-hover/task:opacity-100 transition-opacity shrink-0">
                                  열기 ↗
                                </span>
                              )}
                            </button>

                            {/* 체크리스트 행 (보임 필터 적용된 items) */}
                            <div className="pl-7 mt-0.5 space-y-0.5">
                              {items.map((it) => {
                                const taken = !!it.sprint_column_id;
                                const col = it.sprint_column_id
                                  ? columnById.get(it.sprint_column_id)
                                  : undefined;
                                const canDrag = canEdit && !taken;
                                const clickable =
                                  !!it.task_id && !!onOpenChecklistItem;
                                return (
                                  <div
                                    key={it.id}
                                    className={`group flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg border border-transparent transition-colors ${
                                      taken
                                        ? "bg-bridge-secondary/[0.05] hover:bg-bridge-secondary/[0.08]"
                                        : "hover:bg-bridge-surface hover:border-foreground/10"
                                    }`}
                                  >
                                    {/* A. grip — 드래그 전용 (hover 시 노출) */}
                                    <span
                                      draggable={canDrag}
                                      onDragStart={(e) =>
                                        canDrag &&
                                        onDragStartItem(e, it, "backlog")
                                      }
                                      className={`w-4 grid place-items-center shrink-0 rounded transition-all ${
                                        canDrag
                                          ? "text-slate-600 opacity-0 group-hover:opacity-100 cursor-grab hover:bg-bridge-accent/15 hover:text-bridge-accent"
                                          : "opacity-0 pointer-events-none"
                                      }`}
                                      aria-label={
                                        canDrag
                                          ? "스프린트로 끌어 담기"
                                          : undefined
                                      }
                                      title={
                                        canDrag
                                          ? "끌어서 스프린트에 담기"
                                          : undefined
                                      }
                                    >
                                      <GripVertical className="w-3 h-3" />
                                    </span>

                                    {/* B. 체크박스 — 완료 토글 */}
                                    <button
                                      type="button"
                                      onClick={() => toggleDone(it)}
                                      disabled={!canEdit || !it.task_id}
                                      aria-label={
                                        it.completed ? "완료 해제" : "완료 표시"
                                      }
                                      className={`w-4 h-4 rounded-[5px] shrink-0 border grid place-items-center transition-colors ${
                                        it.completed
                                          ? "bg-bridge-secondary border-bridge-secondary"
                                          : "border-slate-500 hover:border-bridge-secondary"
                                      } ${
                                        canEdit && it.task_id
                                          ? "cursor-pointer"
                                          : "cursor-default"
                                      }`}
                                    >
                                      {it.completed && (
                                        <Check
                                          className="w-2.5 h-2.5 text-bridge-dark"
                                          strokeWidth={3.5}
                                        />
                                      )}
                                    </button>

                                    {/* C. 본문 — 클릭 진입 */}
                                    <button
                                      type="button"
                                      onClick={() => openItem(it)}
                                      disabled={!clickable}
                                      className={`flex-1 min-w-0 text-left ${
                                        clickable
                                          ? "cursor-pointer"
                                          : "cursor-default"
                                      }`}
                                      title={it.title}
                                    >
                                      <span
                                        className={`block text-xs truncate ${
                                          it.completed
                                            ? "line-through text-slate-500"
                                            : "text-foreground"
                                        }`}
                                      >
                                        {it.title}
                                      </span>
                                    </button>

                                    {/* D. 메타 — 담긴 컬럼 칩 · 담당자 · 진입 힌트 */}
                                    <span className="flex items-center gap-1 shrink-0">
                                      {taken && col && (
                                        <span
                                          className="inline-flex items-center gap-1 text-[10px] font-bold rounded px-1.5 py-0.5 max-w-[76px]"
                                          style={{
                                            background: `${columnAccent(col)}26`,
                                            color: columnAccent(col),
                                          }}
                                          title={`담김 · ${col.name}`}
                                        >
                                          <span
                                            className="w-1 h-1 rounded-full shrink-0"
                                            style={{
                                              background: columnAccent(col),
                                            }}
                                          />
                                          <span className="truncate">
                                            {col.name}
                                          </span>
                                        </span>
                                      )}
                                      {it.assignee && (
                                        <span
                                          className="w-4 h-4 rounded-full grid place-items-center text-[9px] font-bold text-white shrink-0"
                                          style={{
                                            background: getAssigneeHex(
                                              it.assignee.name,
                                            ),
                                          }}
                                          title={it.assignee.name}
                                        >
                                          {getInitials(it.assignee.name)}
                                        </span>
                                      )}
                                      {clickable && (
                                        <ChevronRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
        )}

        {/* 우: 동적 컬럼 보드 (미리보기 중엔 읽기 전용 스냅샷) */}
        <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
          {previewColumns ? (
            <div className="flex gap-3 p-3 md:p-4 h-full min-w-max">
              {previewColumns.map((col) => {
                const accent =
                  col.kind === "START"
                    ? "#6366F1"
                    : col.kind === "END"
                      ? "#34d399"
                      : (col.color ?? "#f59e0b");
                return (
                  <div
                    key={col.id}
                    className="w-[260px] shrink-0 flex flex-col rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian"
                  >
                    <div className="px-3 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: accent }}
                      />
                      <span className="text-xs font-bold text-foreground truncate flex-1">
                        {col.name}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 tabular-nums bg-bridge-dark rounded-full px-1.5 shrink-0">
                        {col.items.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
                      {col.items.length === 0 ? (
                        <div className="h-full min-h-[80px] grid place-items-center text-[11px] text-slate-600">
                          비어 있음
                        </div>
                      ) : (
                        col.items.map((it) => renderCard(it, true))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : previewLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
            </div>
          ) : !activeSprint ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              진행 중인 스프린트가 없습니다.
            </div>
          ) : (
            <div className="flex gap-3 p-3 md:p-4 h-full min-w-max">
              {columns.map((col) => {
                // START("Sprint") 컬럼은 Feature 단위 컬럼들로 확장 (활성 항목이 있을 때).
                // In Review / Done 등 나머지 컬럼은 그대로 유지.
                if (col.kind === "START" && featureColumns.length > 0) {
                  return (
                    <Fragment key={col.id}>
                      {featureColumns.map((fc) => renderFeatureColumn(fc))}
                    </Fragment>
                  );
                }
                const isAnchor = col.kind !== "MIDDLE";
                const accent =
                  col.kind === "START"
                    ? "#6366F1"
                    : col.kind === "END"
                      ? "#34d399"
                      : (col.color ?? "#f59e0b");
                return (
                  <div
                    key={col.id}
                    onDragOver={(e) => {
                      if (canEdit) {
                        e.preventDefault();
                        setDragOverCol(col.id);
                      }
                    }}
                    onDragLeave={() =>
                      setDragOverCol((c) => (c === col.id ? null : c))
                    }
                    onDrop={(e) => onDropColumn(e, col)}
                    className={`w-[260px] shrink-0 flex flex-col rounded-2xl border bg-bridge-obsidian transition-colors ${
                      dragOverCol === col.id
                        ? "border-bridge-accent/60"
                        : "border-foreground/[0.08]"
                    }`}
                  >
                    {/* 컬럼 헤더 */}
                    <div className="px-3 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: accent }}
                      />
                      {editingCol === col.id ? (
                        <input
                          autoFocus
                          value={editColName}
                          onChange={(e) => setEditColName(e.target.value)}
                          onBlur={() => submitRename(col)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitRename(col);
                            if (e.key === "Escape") setEditingCol(null);
                          }}
                          className="flex-1 min-w-0 bg-foreground/[0.05] border border-foreground/10 rounded px-2 py-0.5 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                        />
                      ) : (
                        <span className="text-xs font-bold text-foreground truncate flex-1">
                          {col.name}
                        </span>
                      )}
                      {isAnchor && (
                        <span className="text-[9px] font-bold text-slate-500 tracking-wide shrink-0">
                          고정
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-slate-500 tabular-nums bg-bridge-dark rounded-full px-1.5 shrink-0">
                        {col.items.length}
                      </span>
                      {/* MIDDLE 컬럼 편집 (관리자) */}
                      {col.kind === "MIDDLE" &&
                        isAdminOrOwner &&
                        editingCol !== col.id && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => moveColumn(col, -1)}
                              className="p-1 rounded text-slate-500 hover:text-foreground hover:bg-foreground/5"
                              aria-label="왼쪽으로"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => moveColumn(col, 1)}
                              className="p-1 rounded text-slate-500 hover:text-foreground hover:bg-foreground/5"
                              aria-label="오른쪽으로"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingCol(col.id);
                                setEditColName(col.name);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-foreground hover:bg-foreground/5"
                              aria-label="이름 변경"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => removeColumn(col)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-foreground/5"
                              aria-label="삭제"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                    </div>

                    {/* 카드 스택 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[120px]">
                      {col.items.length === 0 && (
                        <div className="h-full min-h-[80px] grid place-items-center text-[11px] text-slate-600">
                          {col.kind === "START"
                            ? "← 왼쪽에서 끌어다 담기"
                            : "비어 있음"}
                        </div>
                      )}
                      {col.items.map(renderCard)}
                    </div>
                  </div>
                );
              })}

              {/* 컬럼 추가 (관리자) — END 앞에 삽입되지만 UI는 맨 뒤 버튼 */}
              {isAdminOrOwner && (
                <div className="w-[200px] shrink-0 pt-1">
                  {addingColumn ? (
                    <div className="rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian p-2.5 flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={newColName}
                        onChange={(e) => setNewColName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitNewColumn();
                          if (e.key === "Escape") {
                            setAddingColumn(false);
                            setNewColName("");
                          }
                        }}
                        placeholder="컬럼 이름"
                        className="flex-1 min-w-0 bg-foreground/[0.04] border border-foreground/10 rounded-lg px-2 py-1.5 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                      />
                      <button
                        onClick={submitNewColumn}
                        className="p-1.5 rounded-lg bg-bridge-accent text-white"
                        aria-label="추가"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setAddingColumn(false);
                          setNewColName("");
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-foreground/5"
                        aria-label="취소"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingColumn(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-dashed border-foreground/15 text-slate-400 hover:text-foreground hover:border-bridge-border transition-colors text-xs font-bold"
                    >
                      <Plus className="w-4 h-4" /> 컬럼 추가
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 재활성화 확인 모달 — 파괴적 액션(진행중 스프린트 park) 영향 고지 */}
      <MotionModal
        open={!!reactivateTarget}
        onClose={() => setReactivateTarget(null)}
        accentColor
        aria-labelledby="reactivate-title"
        className="w-full sm:max-w-md"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <span className="w-8 h-8 rounded-lg bg-bridge-accent/15 text-bridge-accent grid place-items-center shrink-0">
            <RotateCcw className="w-4 h-4" />
          </span>
          <h4
            id="reactivate-title"
            className="text-sm font-bold text-foreground"
          >
            {reactivateTarget?.name}을(를) 재활성화할까요?
          </h4>
        </div>
        <div className="px-5 pb-5 pt-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            이 스프린트를 다시{" "}
            <span className="font-bold text-foreground">진행중</span>으로
            되살립니다. 종료했던 항목을 이어서 작업할 수 있어요.
          </p>
          {activeSprint && activeSprint.id !== reactivateTarget?.id && (
            <div className="mt-3 flex gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                현재 진행중인{" "}
                <span className="font-bold">{activeSprint.name}</span>은(는) 뒤로
                보관됩니다. 언제든 &lsquo;재활성화 취소&rsquo;로 되돌릴 수 있어요.
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-600">Esc 닫기</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReactivateTarget(null)}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors"
            >
              그냥 볼게요
            </button>
            <button
              onClick={confirmReactivate}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
            >
              재활성화
            </button>
          </div>
        </div>
      </MotionModal>
    </div>
  );
}
