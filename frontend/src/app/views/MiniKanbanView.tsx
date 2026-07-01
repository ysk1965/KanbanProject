import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns3,
  Hand,
  Loader2,
  MousePointer2,
} from "lucide-react";
import type { Block, ChecklistItem, Task } from "../types";
import { miniKanbanAPI } from "../utils/api";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { getTodayDateString } from "../utils/dateUtils";

interface MiniKanbanViewProps {
  boardId: string;
  blocks: Block[];
  tasks: Task[];
  checklistByTask: Record<string, ChecklistItem[]>;
  canEdit: boolean;
  memberColorMap: Record<string, string | null>;
  onTaskClick: (task: Task) => void;
  /** 태스크를 다른 블록으로 이동 (실제 보드 block_id 변경) */
  onMoveTask: (taskId: string, targetBlockId: string) => void;
  /** 체크리스트 항목 날짜 패치 (start_date 조정) */
  onPatchChecklist: (
    taskId: string,
    itemId: string,
    patch: { start_date?: string | null },
  ) => void;
  /** 체크리스트 완료 토글 */
  onToggleChecklist: (taskId: string, itemId: string) => void;
}

// ────────────────────────────────────────────────────────────
// 열 파생 규칙 (저장값 아님 — 오늘 날짜로 매 렌더 계산)
// ────────────────────────────────────────────────────────────
type Col = "todo" | "doing" | "done";

function resolveColumn(item: ChecklistItem, today: string): Col {
  if (item.completed) return "done";
  if (item.start_date && item.start_date <= today) return "doing"; // 지난 due도 미완료면 DOING 유지
  return "todo";
}

// DOING 내 "지연"(마감일 초과) 강조
function isOverdue(item: ChecklistItem, today: string): boolean {
  return !item.completed && item.due_date != null && item.due_date < today;
}

// 레이아웃 상수 (블록 = 세로 레인, 태스크는 레인 아래로 스택)
const LANE_W = 680;
const TASK_NODE_W = 620;
const HUB_Y = 0;
const FIRST_TASK_Y = 150;
const TASK_GAP_Y = 420;
// 블록 이동 판정 (실수 방지: 최소 드래그 + 타깃 근접 + 히스테리시스)
const MOVE_SNAP_THRESHOLD = 150; // 타깃 hub x에 이만큼 근접해야 이동 후보
const MIN_DRAG_DISTANCE = 160; // 드래그 시작점에서 이만큼 이동해야 재배정 판정 시작
const MOVE_HYSTERESIS = 140; // 타깃 hub가 현재 블록 hub보다 x기준 최소 이만큼 더 가까워야 이동

// ────────────────────────────────────────────────────────────
// Context: 노드가 live 데이터를 읽는다 (node.data엔 참조 id만)
// ────────────────────────────────────────────────────────────
interface MiniKanbanCtx {
  blocksById: Map<string, Block>;
  tasksById: Map<string, Task>;
  tasksByBlock: Map<string, Task[]>;
  checklistByTask: Record<string, ChecklistItem[]>;
  collapsedBlocks: Set<string>;
  dropTargetBlockId: string | null;
  memberColorMap: Record<string, string | null>;
  today: string;
  canEdit: boolean;
  onTaskClick: (task: Task) => void;
  toggleCollapse: (blockId: string) => void;
  moveItemToColumn: (taskId: string, item: ChecklistItem, target: Col) => void;
}
const MiniKanbanContext = createContext<MiniKanbanCtx | null>(null);
const useMiniKanban = () => {
  const ctx = useContext(MiniKanbanContext);
  if (!ctx) throw new Error("MiniKanbanContext missing");
  return ctx;
};

// ────────────────────────────────────────────────────────────
// 블록 hub 노드
// ────────────────────────────────────────────────────────────
const BlockHubNode = memo(function BlockHubNode({ data }: NodeProps) {
  const {
    blocksById,
    tasksByBlock,
    collapsedBlocks,
    dropTargetBlockId,
    toggleCollapse,
  } = useMiniKanban();
  const blockId = (data as { block_id: string }).block_id;
  const block = blocksById.get(blockId);
  const count = tasksByBlock.get(blockId)?.length ?? 0;
  const collapsed = collapsedBlocks.has(blockId);
  const isDropTarget = dropTargetBlockId === blockId;

  if (!block) {
    return (
      <div className="px-3 py-2 rounded-xl border border-foreground/10 bg-bridge-obsidian text-xs text-slate-500">
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={false}
          className="!opacity-0"
        />
        삭제된 블록
      </div>
    );
  }

  const color = block.color || "#6366F1";

  return (
    <div
      className={`rounded-2xl border bg-bridge-obsidian shadow-lg transition-shadow ${
        isDropTarget
          ? "border-bridge-accent ring-2 ring-bridge-accent shadow-[0_0_24px_rgba(99,102,241,0.35)]"
          : "border-bridge-border"
      }`}
      style={{ width: 200 }}
    >
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!opacity-0"
      />
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!opacity-0"
      />
      <div className="flex items-center gap-2 px-3.5 py-3">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="flex-1 text-sm font-bold text-foreground line-clamp-1">
          {block.name}
        </span>
        {block.fixed_type && (
          <span className="text-[9px] font-bold tracking-wide text-slate-500 bg-foreground/[0.06] rounded px-1.5 py-0.5">
            FIXED
          </span>
        )}
        <span className="text-[11px] font-bold text-slate-400 bg-foreground/[0.06] rounded-md px-1.5 py-0.5">
          {count}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse(blockId);
          }}
          className="nodrag text-slate-400 hover:text-bridge-accent transition-colors"
          title={collapsed ? "펼치기" : "접기"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
});

// ────────────────────────────────────────────────────────────
// 미니 칸반 열 (TODO / DOING / DONE)
// ────────────────────────────────────────────────────────────
const COLS: {
  key: Col;
  label: string;
  dot: string;
  text: string;
  bg: string;
}[] = [
  {
    key: "todo",
    label: "TODO",
    dot: "bg-slate-500",
    text: "text-slate-400",
    bg: "",
  },
  {
    key: "doing",
    label: "DOING",
    dot: "bg-amber-500",
    text: "text-amber-500",
    bg: "bg-amber-500/[0.04]",
  },
  {
    key: "done",
    label: "DONE",
    dot: "bg-emerald-500",
    text: "text-emerald-500",
    bg: "bg-emerald-500/[0.04]",
  },
];

function ChecklistCard({
  taskId,
  item,
  col,
  canEdit,
  today,
  memberColorMap,
  onDragStartCard,
}: {
  taskId: string;
  item: ChecklistItem;
  col: Col;
  canEdit: boolean;
  today: string;
  memberColorMap: Record<string, string | null>;
  onDragStartCard: (itemId: string) => void;
}) {
  const done = item.completed;
  const overdue = col === "doing" && isOverdue(item, today);
  const dateChip =
    col === "done"
      ? item.done_date
        ? `✓ ${item.done_date.slice(5)}`
        : "✓ 완료"
      : col === "doing"
        ? overdue
          ? `지연 ~${item.due_date?.slice(5) ?? ""}`
          : item.due_date
            ? `~${item.due_date.slice(5)}`
            : "진행 중"
        : item.start_date
          ? `${item.start_date.slice(5)} 시작`
          : "일정 미정";

  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/mini-cl", item.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStartCard(item.id);
      }}
      className={`nodrag mb-2 rounded-lg border px-3 py-2 ${
        canEdit ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        done
          ? "bg-emerald-500/[0.06] border-emerald-500/20"
          : "bg-bridge-surface border-foreground/[0.08]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {done ? (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
        ) : overdue ? (
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
        ) : null}
        <span
          className={`text-sm font-medium leading-snug line-clamp-2 ${
            done ? "text-slate-500 line-through" : "text-foreground"
          }`}
        >
          {item.title}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            col === "done"
              ? "bg-emerald-500/15 text-emerald-500"
              : overdue
                ? "bg-rose-500/15 text-rose-400"
                : col === "doing"
                  ? "bg-amber-500/15 text-amber-500"
                  : "bg-foreground/[0.06] text-slate-500"
          }`}
        >
          {dateChip}
        </span>
        {item.assignee && (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
            style={{
              backgroundColor: getAssigneeHex(
                item.assignee.name,
                memberColorMap[item.assignee.id],
              ),
            }}
            title={item.assignee.name}
          >
            {getInitials(item.assignee.name)}
          </span>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 태스크 노드 (3열 미니 칸반)
// ────────────────────────────────────────────────────────────
const TaskNode = memo(function TaskNode({ data }: NodeProps) {
  const {
    tasksById,
    checklistByTask,
    memberColorMap,
    today,
    canEdit,
    onTaskClick,
    moveItemToColumn,
  } = useMiniKanban();
  const taskId = (data as { task_id: string }).task_id;
  const task = tasksById.get(taskId);
  const dragItemRef = useRef<string | null>(null);

  if (!task) {
    return (
      <div className="px-3 py-2 rounded-xl border border-foreground/10 bg-bridge-obsidian text-xs text-slate-500">
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={false}
          className="!opacity-0"
        />
        삭제된 태스크
      </div>
    );
  }

  const items = checklistByTask[taskId] ?? [];
  const grouped: Record<Col, ChecklistItem[]> = {
    todo: [],
    doing: [],
    done: [],
  };
  items.forEach((it) => grouped[resolveColumn(it, today)].push(it));
  const total = items.length;
  const doneCount = grouped.done.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const featureColor = task.feature_color || "#6366F1";
  const firstAssignee = task.assignees?.[0];

  const handleDrop = (col: Col) => {
    const id = dragItemRef.current;
    dragItemRef.current = null;
    if (!id) return;
    const it = items.find((x) => x.id === id);
    if (it) moveItemToColumn(taskId, it, col);
  };

  return (
    <div
      className="rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian shadow-xl overflow-hidden"
      style={{ width: TASK_NODE_W }}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!opacity-0"
      />
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-foreground/[0.08] relative cursor-pointer"
        onClick={() => onTaskClick(task)}
      >
        <span
          className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
          style={{ backgroundColor: featureColor }}
        />
        <span className="flex-1 text-sm font-bold text-foreground line-clamp-1 pl-1.5">
          {task.title}
        </span>
        {task.feature_title && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 max-w-[110px] truncate"
            style={{
              color: featureColor,
              backgroundColor: `${featureColor}26`,
            }}
            title={task.feature_title}
          >
            {task.feature_title}
          </span>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg,#6366F1,#2DD4BF)",
              }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            {doneCount}/{total}
          </span>
          {firstAssignee && (
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{
                backgroundColor: getAssigneeHex(
                  firstAssignee.name,
                  memberColorMap[firstAssignee.id],
                ),
              }}
              title={firstAssignee.name}
            >
              {getInitials(firstAssignee.name)}
            </span>
          )}
        </div>
      </div>
      {/* 3 columns */}
      <div className="nodrag nopan nowheel grid grid-cols-3">
        {COLS.map((c, idx) => (
          <div
            key={c.key}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              handleDrop(c.key);
            }}
            className={`min-h-[200px] p-2.5 ${idx < 2 ? "border-r border-foreground/[0.06]" : ""} ${c.bg}`}
          >
            <div className="flex items-center gap-1.5 mb-2.5 px-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              <span className={`text-[11px] font-bold ${c.text}`}>
                {c.label}
              </span>
              <span className="ml-auto text-[10px] font-bold text-slate-400 bg-foreground/[0.06] rounded px-1.5">
                {grouped[c.key].length}
              </span>
            </div>
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
              {grouped[c.key].map((it) => (
                <ChecklistCard
                  key={it.id}
                  taskId={taskId}
                  item={it}
                  col={c.key}
                  canEdit={canEdit}
                  today={today}
                  memberColorMap={memberColorMap}
                  onDragStartCard={(id) => (dragItemRef.current = id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

const nodeTypes = { blockHub: BlockHubNode, taskNode: TaskNode };

// ────────────────────────────────────────────────────────────
// 직렬화 / 역직렬화 (참조 id + 좌표만)
// ────────────────────────────────────────────────────────────
type PosMap = Record<string, { x: number; y: number }>;

function serialize(
  positions: PosMap,
  collapsedBlocks: Set<string>,
  blockIds: Set<string>,
  taskIds: Set<string>,
) {
  const nodes = [];
  for (const [id, pos] of Object.entries(positions)) {
    if (id.startsWith("block__")) {
      const bid = id.slice(7);
      if (!blockIds.has(bid)) continue;
      nodes.push({
        id,
        kind: "block" as const,
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        block_id: bid,
      });
    } else if (id.startsWith("task__")) {
      const tid = id.slice(6);
      if (!taskIds.has(tid)) continue;
      nodes.push({
        id,
        kind: "task" as const,
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        task_id: tid,
      });
    }
  }
  return {
    nodes,
    collapsed_blocks: [...collapsedBlocks].filter((b) => blockIds.has(b)),
  };
}

// ────────────────────────────────────────────────────────────
// 내부 캔버스
// ────────────────────────────────────────────────────────────
function MiniKanbanCanvas({
  boardId,
  blocks,
  tasks,
  checklistByTask,
  canEdit,
  memberColorMap,
  onTaskClick,
  onMoveTask,
  onPatchChecklist,
  onToggleChecklist,
}: MiniKanbanViewProps) {
  const { t } = useTranslation();
  const today = useMemo(() => getTodayDateString(), []);
  const [positions, setPositions] = useState<PosMap>({});
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  // 캔버스 상호작용 모드: hand=좌드래그로 팬(기본), pointer=좌드래그로 박스 다중선택
  const [interactionMode, setInteractionMode] = useState<"hand" | "pointer">(
    "hand",
  );
  // 드래그 중 이동 대상 블록 (하이라이트용, 직렬화 대상 아님)
  const [dropTargetBlockId, setDropTargetBlockId] = useState<string | null>(
    null,
  );

  const loadedRef = useRef(false);
  const lastSavedRef = useRef<string>("");
  const latestDocRef = useRef<string>("");
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // 키보드 단축키: H=손 도구(팬), V=선택 도구
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      // 물리 키 기준(e.code)으로 판별 — 한글 IME 상태에서도 동작 (e.key는 'ㅗ'/'ㅍ'로 들어옴)
      if (e.code === "KeyH") setInteractionMode("hand");
      else if (e.code === "KeyV") setInteractionMode("pointer");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canEdit]);

  // 태스크 hub 대상 블록 (FEATURE·TASK 고정 블록 제외)
  const hubBlocks = useMemo(
    () =>
      blocks.filter(
        (b) => b.fixed_type !== "FEATURE" && b.fixed_type !== "TASK",
      ),
    [blocks],
  );

  const blocksById = useMemo(() => {
    const m = new Map<string, Block>();
    hubBlocks.forEach((b) => m.set(b.id, b));
    return m;
  }, [hubBlocks]);

  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    tasks.forEach((tk) => m.set(tk.id, tk));
    return m;
  }, [tasks]);

  const tasksByBlock = useMemo(() => {
    const m = new Map<string, Task[]>();
    tasks.forEach((tk) => {
      const arr = m.get(tk.block_id);
      if (arr) arr.push(tk);
      else m.set(tk.block_id, [tk]);
    });
    m.forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return m;
  }, [tasks]);

  const blockIdSet = useMemo(
    () => new Set(hubBlocks.map((b) => b.id)),
    [hubBlocks],
  );
  const taskIdSet = useMemo(() => new Set(tasks.map((tk) => tk.id)), [tasks]);

  // 최초 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadedRef.current = false;
    miniKanbanAPI
      .get(boardId)
      .then((doc) => {
        if (cancelled) return;
        const pos: PosMap = {};
        (doc?.nodes || []).forEach((n) => {
          if (n.kind === "block" && n.block_id)
            pos[`block__${n.block_id}`] = { x: n.x, y: n.y };
          else if (n.kind === "task" && n.task_id)
            pos[`task__${n.task_id}`] = { x: n.x, y: n.y };
        });
        const collapsed = new Set(doc?.collapsed_blocks || []);
        setPositions(pos);
        setCollapsedBlocks(collapsed);
        const json = JSON.stringify(
          serialize(pos, collapsed, blockIdSet, taskIdSet),
        );
        lastSavedRef.current = json;
        latestDocRef.current = json;
      })
      .catch(() => {
        if (!cancelled) {
          setPositions({});
          setCollapsedBlocks(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          loadedRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // 디바운스 autosave (레이아웃 변경 시에만)
  useEffect(() => {
    if (!loadedRef.current || !canEdit) return;
    const doc = serialize(positions, collapsedBlocks, blockIdSet, taskIdSet);
    const json = JSON.stringify(doc);
    latestDocRef.current = json;
    if (json === lastSavedRef.current) return;
    const timer = setTimeout(() => {
      miniKanbanAPI
        .save(boardId, doc)
        .then(() => {
          lastSavedRef.current = json;
        })
        .catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [positions, collapsedBlocks, blockIdSet, taskIdSet, canEdit, boardId]);

  // 언마운트 시 미저장분 flush
  useEffect(() => {
    return () => {
      if (
        canEdit &&
        loadedRef.current &&
        latestDocRef.current !== lastSavedRef.current
      ) {
        try {
          const doc = JSON.parse(latestDocRef.current);
          miniKanbanAPI.save(boardId, doc).catch(() => {});
        } catch {
          /* noop */
        }
      }
    };
  }, [boardId, canEdit]);

  // 노드 파생 (블록 hub + 태스크 노드)
  const nodes = useMemo<Node[]>(() => {
    const result: Node[] = [];
    hubBlocks.forEach((block, bIdx) => {
      const hubId = `block__${block.id}`;
      result.push({
        id: hubId,
        type: "blockHub",
        position: positions[hubId] ?? { x: bIdx * LANE_W, y: HUB_Y },
        data: { block_id: block.id },
        draggable: canEdit,
      });
      if (collapsedBlocks.has(block.id)) return;
      const blockTasks = tasksByBlock.get(block.id) ?? [];
      blockTasks.forEach((task, tIdx) => {
        const tId = `task__${task.id}`;
        result.push({
          id: tId,
          type: "taskNode",
          position: positions[tId] ?? {
            x: bIdx * LANE_W,
            y: FIRST_TASK_Y + tIdx * TASK_GAP_Y,
          },
          data: { task_id: task.id },
          draggable: canEdit,
        });
      });
    });
    return result;
  }, [hubBlocks, tasksByBlock, positions, collapsedBlocks, canEdit]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];
    hubBlocks.forEach((block) => {
      if (collapsedBlocks.has(block.id)) return;
      const hubId = `block__${block.id}`;
      (tasksByBlock.get(block.id) ?? []).forEach((task) => {
        result.push({
          id: `e__${block.id}__${task.id}`,
          source: hubId,
          target: `task__${task.id}`,
          type: "smoothstep",
        });
      });
    });
    return result;
  }, [hubBlocks, tasksByBlock, collapsedBlocks]);

  // 위치 변경 캡처 (controlled)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setPositions((prev) => {
      let next = prev;
      for (const ch of changes) {
        if (ch.type === "position" && ch.position) {
          next = { ...next, [ch.id]: ch.position };
        }
      }
      return next;
    });
  }, []);

  // 드래그 중/종료 시 이동 대상 블록 판정 (실수 방지: 최소 드래그 + 근접 + 히스테리시스)
  const computeDropTarget = useCallback(
    (node: Node): string | null => {
      if (!node.id.startsWith("task__")) return null;
      const start = dragStartRef.current;
      if (!start) return null;
      // 시작점 대비 충분히 이동해야 재배정 후보
      const dragDist = Math.hypot(
        node.position.x - start.x,
        node.position.y - start.y,
      );
      if (dragDist < MIN_DRAG_DISTANCE) return null;
      const task = tasksById.get(node.id.slice(6));
      if (!task) return null;
      // 현재 블록 hub까지 x거리
      const curIdx = hubBlocks.findIndex((b) => b.id === task.block_id);
      const curHubX =
        positions[`block__${task.block_id}`]?.x ??
        (curIdx >= 0 ? curIdx * LANE_W : node.position.x);
      const curDist = Math.abs(node.position.x - curHubX);
      // 자기 블록 제외 최근접 hub
      let bestId: string | null = null;
      let bestDist = Infinity;
      hubBlocks.forEach((block, bIdx) => {
        if (block.id === task.block_id) return;
        const hubX = positions[`block__${block.id}`]?.x ?? bIdx * LANE_W;
        const dist = Math.abs(node.position.x - hubX);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = block.id;
        }
      });
      if (
        bestId &&
        bestDist < MOVE_SNAP_THRESHOLD &&
        bestDist + MOVE_HYSTERESIS < curDist
      ) {
        return bestId;
      }
      return null;
    },
    [hubBlocks, positions, tasksById],
  );

  const onNodeDragStart = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (!canEdit || !node.id.startsWith("task__")) return;
      dragStartRef.current = { x: node.position.x, y: node.position.y };
    },
    [canEdit],
  );

  const onNodeDrag = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (!canEdit || !node.id.startsWith("task__")) return;
      const target = computeDropTarget(node);
      setDropTargetBlockId((prev) => (prev === target ? prev : target));
    },
    [canEdit, computeDropTarget],
  );

  // 태스크 노드를 다른 블록 레인으로 옮기면 실제 이동
  const onNodeDragStop = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (!canEdit || !node.id.startsWith("task__")) {
        dragStartRef.current = null;
        setDropTargetBlockId(null);
        return;
      }
      const taskId = node.id.slice(6);
      const target = computeDropTarget(node);
      if (target) {
        // 새 레인에서 자동 재배치되도록 저장 좌표 제거
        setPositions((prev) => {
          const n = { ...prev };
          delete n[`task__${taskId}`];
          return n;
        });
        onMoveTask(taskId, target);
      }
      dragStartRef.current = null;
      setDropTargetBlockId(null);
    },
    [canEdit, computeDropTarget, onMoveTask],
  );

  const toggleCollapse = useCallback((blockId: string) => {
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  }, []);

  // 체크리스트 항목을 목표 열로 이동 → 실제 데이터 변경
  const moveItemToColumn = useCallback(
    (taskId: string, item: ChecklistItem, target: Col) => {
      if (!canEdit) return;
      const cur = resolveColumn(item, today);
      if (cur === target) return;
      if (target === "done") {
        if (!item.completed) onToggleChecklist(taskId, item.id);
      } else if (target === "todo") {
        if (item.completed) onToggleChecklist(taskId, item.id);
        onPatchChecklist(taskId, item.id, { start_date: null });
      } else {
        // doing
        if (item.completed) onToggleChecklist(taskId, item.id);
        onPatchChecklist(taskId, item.id, { start_date: today });
      }
    },
    [canEdit, today, onToggleChecklist, onPatchChecklist],
  );

  const ctxValue = useMemo<MiniKanbanCtx>(
    () => ({
      blocksById,
      tasksById,
      tasksByBlock,
      checklistByTask,
      collapsedBlocks,
      dropTargetBlockId,
      memberColorMap,
      today,
      canEdit,
      onTaskClick,
      toggleCollapse,
      moveItemToColumn,
    }),
    [
      blocksById,
      tasksById,
      tasksByBlock,
      checklistByTask,
      collapsedBlocks,
      dropTargetBlockId,
      memberColorMap,
      today,
      canEdit,
      onTaskClick,
      toggleCollapse,
      moveItemToColumn,
    ],
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <MiniKanbanContext.Provider value={ctxValue}>
      <div
        className={`flex-1 relative ${
          interactionMode === "pointer" ? "mk-pointer" : ""
        }`}
        style={{ height: "100%" }}
      >
        {/* 툴바 */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-bridge-obsidian/85 backdrop-blur-md border border-foreground/[0.08] rounded-2xl px-3 py-1.5 shadow-2xl">
          <span className="text-xs font-bold text-foreground px-1 flex items-center gap-2">
            <Columns3 className="w-3.5 h-3.5 text-bridge-accent" />
            {t("kanban.viewBoardMiniKanban", "미니 칸반")}
          </span>
          {canEdit && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/5 border border-foreground/10">
              <button
                type="button"
                onClick={() => setInteractionMode("hand")}
                aria-label={t("mindmap.handTool", "손 도구") + " (H)"}
                title={t("mindmap.handTool", "손 도구") + " (H)"}
                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                  interactionMode === "hand"
                    ? "bg-bridge-accent text-white"
                    : "text-slate-400 hover:text-foreground hover:bg-foreground/10"
                }`}
              >
                <Hand className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode("pointer")}
                aria-label={t("mindmap.pointerTool", "선택 도구") + " (V)"}
                title={t("mindmap.pointerTool", "선택 도구") + " (V)"}
                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                  interactionMode === "pointer"
                    ? "bg-bridge-accent text-white"
                    : "text-slate-400 hover:text-foreground hover:bg-foreground/10"
                }`}
              >
                <MousePointer2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <span className="text-[11px] text-slate-500">
            {canEdit
              ? t(
                  "minikanban.hint",
                  "카드를 TODO·DOING·DONE으로 드래그, 태스크를 다른 블록으로 이동",
                )
              : t("mindmap.readOnly", "읽기 전용")}
          </span>
        </div>

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center text-slate-500">
              <Columns3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <div className="text-sm">
                {t("minikanban.empty", "표시할 블록/태스크가 없습니다")}
              </div>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeDragThreshold={8}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          minZoom={0.2}
          nodesDraggable={canEdit}
          nodesConnectable={false}
          elementsSelectable
          panOnDrag={interactionMode === "hand" ? true : [1, 2]}
          selectionOnDrag={canEdit && interactionMode === "pointer"}
          deleteKeyCode={null}
          defaultEdgeOptions={{
            style: { stroke: "rgba(148,163,184,0.4)", strokeWidth: 1.5 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color="rgba(255,255,255,0.06)" />
          <Controls
            showInteractive={false}
            className="!bg-bridge-obsidian/90 !border !border-foreground/[0.08] !rounded-lg"
          />
          <MiniMap
            pannable
            zoomable
            className="!bg-bridge-dark/90 !border !border-foreground/[0.08] !rounded-lg"
            nodeColor={(n) =>
              n.type === "blockHub"
                ? blocksById.get(
                    (n.data as { block_id?: string }).block_id || "",
                  )?.color || "#6366F1"
                : tasksById.get((n.data as { task_id?: string }).task_id || "")
                    ?.feature_color || "#2DD4BF"
            }
            maskColor="rgba(13,17,26,0.6)"
          />
        </ReactFlow>
        <style>{`.mk-pointer .react-flow__pane{cursor:crosshair}`}</style>
      </div>
    </MiniKanbanContext.Provider>
  );
}

export function MiniKanbanView(props: MiniKanbanViewProps) {
  return (
    <ReactFlowProvider>
      <MiniKanbanCanvas {...props} />
    </ReactFlowProvider>
  );
}

export default MiniKanbanView;
