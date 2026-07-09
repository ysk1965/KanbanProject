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
  NodeResizer,
  Position,
  SelectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Eye,
  EyeOff,
  Flag,
  Hand,
  Loader2,
  Lock,
  Maximize2,
  MousePointer2,
  Plus,
  Search,
  StickyNote,
  Unlock,
  X,
} from "lucide-react";
import type { Feature, Milestone, MindMapDocument, Task } from "../types";
import { mindMapAPI } from "../utils/api";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { MILESTONE_PALETTE } from "../utils/milestoneColor";
import { compareFeatureOrder } from "../utils/taskOrder";
import { AddFeatureModal } from "../components/AddFeatureModal";

// 피쳐가 속한 마일스톤 정보 (마인드맵 노드 칩 표시용)
export interface FeatureMilestoneRef {
  id: string;
  title: string;
  idx: number;
}

interface MindMapViewProps {
  boardId: string;
  features: Feature[];
  tasks: Task[];
  /** feature_id → 마일스톤 목록 (태스크 milestone_id 기준 파생, 배정 없으면 멤버십 폴백. 없으면 칩 미표시) */
  featureMilestonesMap?: Record<string, FeatureMilestoneRef[]>;
  canEdit: boolean;
  memberColorMap: Record<string, string | null>;
  /** 보드 마일스톤 목록 (피처 추가 시 선택용) */
  milestones?: Milestone[];
  onFeatureClick: (feature: Feature) => void;
  onTaskClick: (task: Task) => void;
  /** 마인드맵에서 새 피처 생성 (생성된 Feature 반환 시 캔버스에 노드 배치) */
  onCreateFeature?: (data: {
    title: string;
    description?: string;
    startDate?: string;
    dueDate?: string;
    milestoneId?: string;
  }) => Promise<Feature | null>;
}

// 메모 노드 기본 색상 팔레트
const MEMO_COLORS = [
  "#6366F1",
  "#2DD4BF",
  "#f43f5e",
  "#f59e0b",
  "#a855f7",
  "#10b981",
];

// 마일스톤 칩 색상 팔레트 (마일스톤 순서 idx 기준 — 일관된 색상 매핑)
// 단일 소스: utils/milestoneColor.ts (12색, 인접 대비 최적화)
const MILESTONE_COLORS = MILESTONE_PALETTE.map((c) => c.hex);

// 마일스톤 필터에서 "미배정"(마일스톤 없는 태스크/피처)을 가리키는 키
const UNASSIGNED_MS = "__none__";

const HANDLE_SIDES: Position[] = [
  Position.Top,
  Position.Right,
  Position.Bottom,
  Position.Left,
];

// Feature 노드 폭 (접힘/펼침 공용)
const FEATURE_NODE_WIDTH = 220;

// ────────────────────────────────────────────────────────────
// Context: 노드가 live 데이터(featuresById)와 핸들러를 읽는다.
// (featuresById는 node.data에 넣지 않아 autosave 트리거에서 분리)
// ────────────────────────────────────────────────────────────
interface MindMapCtx {
  featuresById: Map<string, Feature>;
  featureMilestonesMap: Record<string, FeatureMilestoneRef[]>;
  tasksByFeature: Map<string, Task[]>;
  /** 숨김(off) 처리된 마일스톤 id 집합. UNASSIGNED_MS 포함 가능. dim 처리에 사용 */
  hiddenMilestones: Set<string>;
  expandedFeatures: Set<string>;
  memberColorMap: Record<string, string | null>;
  canEdit: boolean;
  onFeatureClick: (feature: Feature) => void;
  onTaskClick: (task: Task) => void;
  toggleExpand: (featureId: string) => void;
  toggleLock: (id: string) => void;
  renameMemo: (id: string, label: string) => void;
  recolorMemo: (id: string) => void;
  deleteNode: (id: string) => void;
  openNodeMenu: (
    e: React.MouseEvent,
    args: {
      nodeId: string;
      nodeType: "feature" | "memo";
      title: string;
      locked: boolean;
    },
  ) => void;
}
const MindMapContext = createContext<MindMapCtx | null>(null);
const useMindMap = () => {
  const ctx = useContext(MindMapContext);
  if (!ctx) throw new Error("MindMapContext missing");
  return ctx;
};

// 연결 핸들 (4면, source+target 동시) — canEdit일 때만 연결 가능
function NodeHandles({ canEdit }: { canEdit: boolean }) {
  return (
    <>
      {HANDLE_SIDES.map((pos) => (
        <span key={pos}>
          <Handle
            type="target"
            position={pos}
            id={`t-${pos}`}
            isConnectable={canEdit}
            className="mm-handle"
          />
          <Handle
            type="source"
            position={pos}
            id={`s-${pos}`}
            isConnectable={canEdit}
            className="mm-handle"
          />
        </span>
      ))}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Feature 노드 — feature_id로 live 조회
// ────────────────────────────────────────────────────────────
// 태스크 행 (FeatureNode 내 공용)
function TaskRow({
  task,
  onTaskClick,
}: {
  task: Task;
  onTaskClick: (task: Task) => void;
}) {
  const clTotal = task.checklist_total ?? 0;
  const clDone = task.checklist_completed ?? 0;
  return (
    <div
      key={task.id}
      className="flex items-center gap-2 px-2 py-[5px] rounded-lg hover:bg-foreground/[0.04] transition-colors"
      onClick={(e) => {
        if (e.shiftKey || e.metaKey) return; // 전파 → 부모 노드 선택
        e.stopPropagation();
        onTaskClick(task);
      }}
    >
      {task.completed ? (
        <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
      ) : (
        <Circle className="w-3 h-3 shrink-0 text-slate-500" />
      )}
      <span
        className={`flex-1 text-[11px] font-medium leading-tight line-clamp-1 ${
          task.completed ? "text-slate-500 line-through" : "text-foreground"
        }`}
      >
        {task.title}
      </span>
      {clTotal > 0 && (
        <span
          className={`text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded ${
            clDone === clTotal
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-foreground/[0.05] text-slate-500"
          }`}
        >
          {clDone}/{clTotal}
        </span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
const FeatureNode = memo(function FeatureNode({ id, data }: NodeProps) {
  const { t } = useTranslation();
  const {
    featuresById,
    featureMilestonesMap,
    tasksByFeature,
    hiddenMilestones,
    expandedFeatures,
    memberColorMap,
    canEdit,
    onFeatureClick,
    onTaskClick,
    toggleExpand,
    openNodeMenu,
  } = useMindMap();
  const featureId = (data as { feature_id: string }).feature_id;
  const locked = !!(data as { locked?: boolean }).locked;
  const feature = featuresById.get(featureId);
  const milestones = featureMilestonesMap[featureId] || [];
  const featureTasks = tasksByFeature.get(featureId) ?? [];

  // 마일스톤 필터 dim: 피처가 걸친 마일스톤(+ 미배정 태스크 보유 시 UNASSIGNED_MS)이
  // 전부 숨김이면 노드 전체를 흐림. 일부만 숨김이면 해당 그룹/칩만 흐림.
  const hasHiddenMs = hiddenMilestones.size > 0;
  const nodeDim = useMemo(() => {
    if (!hasHiddenMs) return false;
    const ids = milestones.map((m) => m.id);
    const hasUnassigned = featureTasks.some((t) => !t.milestone_id);
    const relevant = ids.length
      ? hasUnassigned
        ? [...ids, UNASSIGNED_MS]
        : ids
      : [UNASSIGNED_MS];
    return relevant.every((id) => hiddenMilestones.has(id));
  }, [hasHiddenMs, milestones, featureTasks, hiddenMilestones]);
  const taskCount = featureTasks.length;
  const doneCount = featureTasks.filter((t) => t.completed).length;
  const expanded = expandedFeatures.has(featureId);

  // 마일스톤 2개 이상이면 milestone_id 기준 그루핑
  const taskGroups = useMemo(() => {
    if (milestones.length < 2) return null;
    const msMap = new Map(milestones.map((ms) => [ms.id, ms]));
    const grouped: {
      ms: FeatureMilestoneRef | null;
      tasks: Task[];
    }[] = [];
    const byMs = new Map<string | null, Task[]>();
    for (const t of featureTasks) {
      const key = t.milestone_id ?? null;
      const arr = byMs.get(key);
      if (arr) arr.push(t);
      else byMs.set(key, [t]);
    }
    for (const ms of milestones) {
      const tasks = byMs.get(ms.id);
      if (tasks?.length) grouped.push({ ms, tasks });
    }
    const unassigned = byMs.get(null);
    if (unassigned?.length) grouped.push({ ms: null, tasks: unassigned });
    // milestone_id가 있지만 이 피처의 마일스톤 목록에 없는 태스크
    for (const [key, tasks] of byMs) {
      if (key !== null && !msMap.has(key) && tasks.length) {
        grouped.push({ ms: null, tasks });
      }
    }
    return grouped;
  }, [milestones, featureTasks]);

  if (!feature) {
    return (
      <div className="px-3 py-2 rounded-xl border border-foreground/10 bg-bridge-obsidian text-xs text-slate-500">
        <NodeHandles canEdit={canEdit} />
        삭제된 피쳐
      </div>
    );
  }

  const color = feature.color || "#6366F1";
  const pct = taskCount > 0 ? Math.round((doneCount * 100) / taskCount) : 0;
  const assignee = feature.assignee;

  return (
    <div
      className="group relative rounded-2xl border border-foreground/10 bg-bridge-obsidian shadow-lg cursor-pointer hover:border-bridge-accent/60"
      style={{
        width: FEATURE_NODE_WIDTH,
        opacity: nodeDim ? 0.2 : 1,
        filter: nodeDim ? "grayscale(0.85)" : undefined,
        transition: "opacity .3s ease, filter .3s ease, border-color .15s ease",
      }}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey) return; // 다중 선택 중 — 모달 열지 않음
        onFeatureClick(feature);
      }}
      onContextMenu={(e) =>
        openNodeMenu(e, {
          nodeId: id,
          nodeType: "feature",
          title: feature.title,
          locked,
        })
      }
    >
      <NodeHandles canEdit={canEdit} />
      {locked && (
        <span
          className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-bridge-obsidian border border-foreground/15 flex items-center justify-center shadow-md"
          title={t("mindmap.locked", "위치 잠김")}
        >
          <Lock className="w-2.5 h-2.5 text-amber-400" />
        </span>
      )}
      <span
        className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
        style={{ backgroundColor: color }}
      />
      {/* Header */}
      <div className="px-3 pt-2.5 pb-2 pl-4">
        <div className="text-[13px] font-bold text-foreground leading-snug line-clamp-2">
          {feature.title}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg,#6366F1,#2DD4BF)",
              }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-400">{pct}%</span>
          {assignee && (
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{
                backgroundColor: getAssigneeHex(
                  assignee.name,
                  memberColorMap[assignee.id],
                ),
              }}
              title={assignee.name}
            >
              {getInitials(assignee.name)}
            </span>
          )}
        </div>
        {milestones.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {milestones.map((ms) => {
              const msColor =
                MILESTONE_COLORS[ms.idx % MILESTONE_COLORS.length];
              const msDim = hiddenMilestones.has(ms.id);
              return (
                <span
                  key={ms.id}
                  className="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    color: msColor,
                    backgroundColor: `${msColor}26`,
                    opacity: msDim ? 0.35 : 1,
                    textDecoration: msDim ? "line-through" : undefined,
                    transition: "opacity .3s ease",
                  }}
                  title={ms.title}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: msColor }}
                  />
                  <span className="truncate">{ms.title}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      {/* Inline task list (Card-Embedded) */}
      {taskCount > 0 && (
        <>
          <div className="mx-3 h-px bg-foreground/[0.06]" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(featureId);
            }}
            className="w-full flex items-center gap-1 px-4 py-1.5 text-[10px] font-bold text-slate-400 hover:text-bridge-accent transition-colors"
            title={expanded ? "Task 접기" : "Task 펼치기"}
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>
              Tasks · {doneCount}/{taskCount}
            </span>
          </button>
          {expanded && (
            <div className="px-2.5 pb-2.5">
              {taskGroups
                ? // 마일스톤 2개 이상: 컴팩트 디바이더로 그루핑
                  taskGroups.map((group, gi) => {
                    const msColor = group.ms
                      ? MILESTONE_COLORS[group.ms.idx % MILESTONE_COLORS.length]
                      : "#64748b";
                    const groupDone = group.tasks.filter(
                      (t) => t.completed,
                    ).length;
                    const groupDim = hiddenMilestones.has(
                      group.ms?.id ?? UNASSIGNED_MS,
                    );
                    return (
                      <div
                        key={group.ms?.id ?? `unassigned-${gi}`}
                        style={{
                          opacity: groupDim ? 0.3 : 1,
                          filter: groupDim ? "grayscale(0.75)" : undefined,
                          transition: "opacity .3s ease, filter .3s ease",
                        }}
                      >
                        <div className="flex items-center gap-1.5 px-2 py-1">
                          <span
                            className="flex-1 h-px"
                            style={{
                              background: `${msColor}4D`,
                            }}
                          />
                          <span
                            className="text-[9px] font-bold whitespace-nowrap"
                            style={{ color: msColor }}
                          >
                            {group.ms?.title ?? "미배정"}
                          </span>
                          <span
                            className="text-[9px] font-bold"
                            style={{ color: `${msColor}99` }}
                          >
                            {groupDone}/{group.tasks.length}
                          </span>
                          <span
                            className="flex-1 h-px"
                            style={{
                              background: `${msColor}26`,
                            }}
                          />
                        </div>
                        {group.tasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            onTaskClick={onTaskClick}
                          />
                        ))}
                      </div>
                    );
                  })
                : // 마일스톤 0~1개: 기존 플랫 리스트
                  featureTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onTaskClick={onTaskClick}
                    />
                  ))}
            </div>
          )}
        </>
      )}
    </div>
  );
});

// ────────────────────────────────────────────────────────────
// 메모 노드 — label/color 자체 저장, 더블클릭 rename
// ────────────────────────────────────────────────────────────
const MEMO_BASE_W = 180;
const MEMO_BASE_H = 64;
const MEMO_BASE_FONT = 12;

const MemoNode = memo(function MemoNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps) {
  const { t } = useTranslation();
  const { canEdit, renameMemo, recolorMemo, deleteNode, openNodeMenu } =
    useMindMap();
  const label = (data as { label?: string }).label || "";
  const color = (data as { color?: string }).color || "#6366F1";
  const locked = !!(data as { locked?: boolean }).locked;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  // 노드 크기에 비례해 폰트 스케일 — 작은 축 기준(넘침 방지), 12px 미만으로는 축소하지 않음
  const w = width ?? MEMO_BASE_W;
  const h = height ?? MEMO_BASE_H;
  const scale = Math.max(1, Math.min(w / MEMO_BASE_W, h / MEMO_BASE_H));
  const fontSize = Math.round(MEMO_BASE_FONT * scale);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== label) renameMemo(id, next);
    else setDraft(label);
  };

  return (
    <div
      className="group relative w-full h-full rounded-xl border-[1.5px] border-dashed px-3.5 py-2.5 text-xs font-bold shadow-md"
      style={{ borderColor: color, color, background: "rgba(30,42,66,0.55)" }}
      onDoubleClick={() => {
        if (!canEdit) return;
        setDraft(label);
        setEditing(true);
      }}
      onContextMenu={(e) =>
        openNodeMenu(e, {
          nodeId: id,
          nodeType: "memo",
          title: label || t("mindmap.memo", "메모"),
          locked,
        })
      }
    >
      {locked && (
        <span
          className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full bg-bridge-obsidian border border-foreground/15 flex items-center justify-center shadow-md"
          title={t("mindmap.locked", "위치 잠김")}
        >
          <Lock className="w-2.5 h-2.5 text-amber-400" />
        </span>
      )}
      <NodeResizer
        isVisible={canEdit && !locked && !!selected}
        minWidth={120}
        minHeight={44}
        color={color}
        handleClassName="!w-2 !h-2 !rounded-sm"
      />
      <NodeHandles canEdit={canEdit} />
      {/* 색상 변경 점 — 좌상단 코너 */}
      <button
        type="button"
        className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-[3px] shrink-0 z-10"
        style={{ backgroundColor: color }}
        onClick={(e) => {
          e.stopPropagation();
          if (canEdit) recolorMemo(id);
        }}
        title="색상 변경"
      />
      {/* 삭제 X — 우상단 코너 */}
      {canEdit && !editing && (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            deleteNode(id);
          }}
          title="삭제"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      <div className="flex items-center justify-center w-full h-full text-center">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(label);
                setEditing(false);
              }
            }}
            style={{ fontSize }}
            className="bg-transparent outline-none text-foreground w-full text-center"
          />
        ) : (
          <span
            className="text-foreground break-words whitespace-pre-wrap leading-snug"
            style={{ fontSize }}
          >
            {label || "메모"}
          </span>
        )}
      </div>
    </div>
  );
});

const nodeTypes = { feature: FeatureNode, memo: MemoNode };

// 직렬화: RF nodes/edges → 저장 문서
// nodes/edges에는 저장 대상(feature/memo)만 전달한다 (파생 Task 노드 제외).
function serialize(
  nodes: Node[],
  edges: Edge[],
  expandedFeatures: Set<string>,
): MindMapDocument {
  return {
    expanded_features: [...expandedFeatures],
    nodes: nodes.map((n) => {
      const base = {
        id: n.id,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        ...((n.data as { locked?: boolean }).locked ? { locked: true } : {}),
      };
      if (n.type === "memo") {
        return {
          ...base,
          kind: "memo" as const,
          label: (n.data as { label?: string }).label || "",
          color: (n.data as { color?: string }).color || "#6366F1",
          ...(n.width ? { width: Math.round(n.width) } : {}),
          ...(n.height ? { height: Math.round(n.height) } : {}),
        };
      }
      return {
        ...base,
        kind: "feature" as const,
        feature_id: (n.data as { feature_id: string }).feature_id,
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      source_handle: e.sourceHandle ?? null,
      target_handle: e.targetHandle ?? null,
    })),
  };
}

// 역직렬화 + orphan prune
function deserialize(
  doc: MindMapDocument,
  featuresById: Map<string, Feature>,
): { nodes: Node[]; edges: Edge[]; expandedFeatures: Set<string> } {
  const validNodes: Node[] = [];
  const keptIds = new Set<string>();
  for (const n of doc.nodes || []) {
    const locked = !!n.locked;
    if (n.kind === "feature") {
      if (!n.feature_id || !featuresById.has(n.feature_id)) continue; // 삭제된 피쳐 prune
      validNodes.push({
        id: n.id,
        type: "feature",
        position: { x: n.x, y: n.y },
        ...(locked ? { draggable: false } : {}),
        data: { feature_id: n.feature_id, locked },
      });
    } else {
      validNodes.push({
        id: n.id,
        type: "memo",
        position: { x: n.x, y: n.y },
        ...(n.width ? { width: n.width } : {}),
        ...(n.height ? { height: n.height } : {}),
        ...(locked ? { draggable: false } : {}),
        data: { label: n.label || "", color: n.color || "#6366F1", locked },
      });
    }
    keptIds.add(n.id);
  }
  const validEdges: Edge[] = (doc.edges || [])
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.source_handle ?? undefined,
      targetHandle: e.target_handle ?? undefined,
    }));
  // 펼침 상태: 존재하는 Feature id만 유지 (삭제된 피쳐 prune)
  const expandedFeatures = new Set<string>(
    (doc.expanded_features || []).filter((fid) => featuresById.has(fid)),
  );
  return { nodes: validNodes, edges: validEdges, expandedFeatures };
}

// ────────────────────────────────────────────────────────────
// 내부 캔버스 (ReactFlowProvider 내부 — useReactFlow 사용)
// ────────────────────────────────────────────────────────────
function MindMapCanvas({
  boardId,
  features,
  tasks,
  featureMilestonesMap,
  canEdit,
  memberColorMap,
  milestones,
  onFeatureClick,
  onTaskClick,
  onCreateFeature,
}: MindMapViewProps) {
  const { t } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const [addFeatureOpen, setAddFeatureOpen] = useState(false);
  // 캔버스 상호작용 모드: hand=좌드래그로 팬(기본), pointer=좌드래그로 박스 다중선택
  const [interactionMode, setInteractionMode] = useState<"hand" | "pointer">(
    "hand",
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  // 미배치 트레이 마일스톤 필터. null=전체, "__none__"=마일스톤 미배정
  const [milestoneFilter, setMilestoneFilter] = useState<string | null>(null);
  const [traySearch, setTraySearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  // 캔버스 마일스톤 on/off 필터 (dim 처리). hiddenMs = 숨김(off) 마일스톤 id 집합.
  // UNASSIGNED_MS 포함 가능. 신규 마일스톤은 집합에 없으므로 기본 표시.
  const [hiddenMs, setHiddenMs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`mindmapHiddenMs_${boardId}`);
      if (raw) return new Set<string>(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set();
  });
  const [msPanelOpen, setMsPanelOpen] = useState(false);
  const msPanelRef = useRef<HTMLDivElement>(null);
  // 노드 우클릭 컨텍스트 메뉴 (Feature/메모/다중 공용)
  const [nodeMenu, setNodeMenu] = useState<{
    nodeIds: string[];
    nodeType: "feature" | "memo" | "mixed";
    title: string; // 단일=노드 제목, 다중="N개 노드"
    allLocked: boolean; // 선택 전체가 잠금 상태인지 → 잠금/해제 라벨 결정
    x: number;
    y: number;
  } | null>(null);

  const loadedRef = useRef(false);
  const lastSavedRef = useRef<string>("");
  const latestDocRef = useRef<string>("");

  const featuresById = useMemo(() => {
    const map = new Map<string, Feature>();
    features.forEach((f) => map.set(f.id, f));
    return map;
  }, [features]);

  // feature_id → Task[] (피처 내 표시 순서 정렬 — 피처 모달 DnD 순서와 동일)
  const tasksByFeature = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((task) => {
      const arr = map.get(task.feature_id);
      if (arr) arr.push(task);
      else map.set(task.feature_id, [task]);
    });
    map.forEach((arr) => arr.sort(compareFeatureOrder));
    return map;
  }, [tasks]);

  // 최초 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadedRef.current = false;
    mindMapAPI
      .get(boardId)
      .then((doc) => {
        if (cancelled) return;
        const {
          nodes: n,
          edges: e,
          expandedFeatures: exp,
        } = deserialize(doc || { nodes: [], edges: [] }, featuresById);
        setNodes(n);
        setEdges(e);
        setExpandedFeatures(exp);
        const json = JSON.stringify(serialize(n, e, exp));
        lastSavedRef.current = json;
        latestDocRef.current = json;
      })
      .catch(() => {
        if (!cancelled) {
          setNodes([]);
          setEdges([]);
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
    // featuresById 변경 시 재조회하지 않음 — live 데이터는 context로 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // 디바운스 autosave
  useEffect(() => {
    if (!loadedRef.current || !canEdit) return;
    const doc = serialize(nodes, edges, expandedFeatures);
    const json = JSON.stringify(doc);
    latestDocRef.current = json;
    if (json === lastSavedRef.current) return;
    const timer = setTimeout(() => {
      mindMapAPI
        .save(boardId, doc)
        .then(() => {
          lastSavedRef.current = json;
        })
        .catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [nodes, edges, expandedFeatures, canEdit, boardId]);

  // 언마운트 시 미저장분 flush
  useEffect(() => {
    return () => {
      if (
        canEdit &&
        loadedRef.current &&
        latestDocRef.current !== lastSavedRef.current
      ) {
        const doc = JSON.parse(latestDocRef.current) as MindMapDocument;
        mindMapAPI.save(boardId, doc).catch(() => {});
      }
    };
  }, [boardId, canEdit]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!canEdit) return;
      setEdges((eds) => addEdge({ ...conn, id: crypto.randomUUID() }, eds));
    },
    [canEdit, setEdges],
  );

  // 메모 노드 추가 (뷰포트 중앙)
  const addMemo = useCallback(() => {
    if (!canEdit) return;
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const id = crypto.randomUUID();
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "memo",
        position: pos,
        width: 180,
        height: 64,
        data: { label: t("mindmap.newMemo", "새 메모"), color: "#6366F1" },
      },
    ]);
  }, [canEdit, screenToFlowPosition, setNodes, t]);

  // 새 피처 생성 후 뷰포트 중앙에 노드 배치
  const handleCreateFeature = useCallback(
    async (data: {
      title: string;
      description?: string;
      startDate?: string;
      dueDate?: string;
      milestoneId?: string;
    }) => {
      if (!onCreateFeature) return;
      const feature = await onCreateFeature(data);
      if (!feature) return;
      const pos = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      setNodes((nds) => [
        ...nds,
        {
          id: crypto.randomUUID(),
          type: "feature",
          position: pos,
          data: { feature_id: feature.id },
        },
      ]);
    },
    [onCreateFeature, screenToFlowPosition, setNodes],
  );

  const renameMemo = useCallback(
    (id: string, label: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, label } } : n,
        ),
      );
    },
    [setNodes],
  );

  const recolorMemo = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const cur = (n.data as { color?: string }).color || MEMO_COLORS[0];
          const next =
            MEMO_COLORS[(MEMO_COLORS.indexOf(cur) + 1) % MEMO_COLORS.length];
          return { ...n, data: { ...n.data, color: next } };
        }),
      );
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );

  // 여러 노드 일괄 제거 (선택 전체 삭제/제외)
  const deleteNodes = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      setNodes((nds) => nds.filter((n) => !set.has(n.id)));
      setEdges((eds) =>
        eds.filter((e) => !set.has(e.source) && !set.has(e.target)),
      );
    },
    [setNodes, setEdges],
  );

  // 위치 이동 잠금 토글 (드래그 비활성 + 문서 저장)
  const toggleLock = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const locked = !(n.data as { locked?: boolean }).locked;
          return {
            ...n,
            draggable: locked ? false : undefined,
            data: { ...n.data, locked },
          };
        }),
      );
    },
    [setNodes],
  );

  // 여러 노드 일괄 잠금/해제 (선택 전체)
  const toggleLockMany = useCallback(
    (ids: string[], lock: boolean) => {
      const set = new Set(ids);
      setNodes((nds) =>
        nds.map((n) =>
          set.has(n.id)
            ? {
                ...n,
                draggable: lock ? false : undefined,
                data: { ...n.data, locked: lock },
              }
            : n,
        ),
      );
    },
    [setNodes],
  );

  // 우클릭 좌표 → 뷰포트 경계 보정된 메뉴 위치
  const clampMenuPos = useCallback((e: React.MouseEvent) => {
    const menuW = 200;
    const menuH = 100;
    const x =
      e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX;
    const y =
      e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY;
    return { x, y };
  }, []);

  // 단일 노드 우클릭 → 컨텍스트 메뉴 오픈 (노드별 div 핸들러에서 호출)
  const openNodeMenu = useCallback(
    (
      e: React.MouseEvent,
      args: {
        nodeId: string;
        nodeType: "feature" | "memo";
        title: string;
        locked: boolean;
      },
    ) => {
      if (!canEdit) return;
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = clampMenuPos(e);
      setNodeMenu({
        nodeIds: [args.nodeId],
        nodeType: args.nodeType,
        title: args.title,
        allLocked: args.locked,
        x,
        y,
      });
    },
    [canEdit, clampMenuPos],
  );

  // 다중 선택 오버레이 우클릭 → 선택 전체 대상 컨텍스트 메뉴 오픈
  const openSelectionMenu = useCallback(
    (e: React.MouseEvent, selNodes: Node[]) => {
      if (!canEdit || selNodes.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = clampMenuPos(e);
      const nodeIds = selNodes.map((n) => n.id);
      const allFeature = selNodes.every((n) => n.type === "feature");
      const allMemo = selNodes.every((n) => n.type === "memo");
      setNodeMenu({
        nodeIds,
        nodeType: allFeature ? "feature" : allMemo ? "memo" : "mixed",
        title: t("mindmap.nNodes", "{{count}}개 노드", {
          count: nodeIds.length,
        }),
        allLocked: selNodes.every(
          (n) => (n.data as { locked?: boolean }).locked,
        ),
        x,
        y,
      });
    },
    [canEdit, clampMenuPos, t],
  );

  // 컨텍스트 메뉴 외부 클릭/스크롤 시 닫기
  useEffect(() => {
    if (!nodeMenu) return;
    const close = () => setNodeMenu(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("wheel", close);
    };
  }, [nodeMenu]);

  // 단축키: h=손 도구(팬), v=선택 도구(박스 다중선택). 입력/편집 중엔 무시.
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

  // Feature 펼치기/접기 (펼침 상태는 문서에 저장 — canEdit일 때 autosave)
  const toggleExpand = useCallback((featureId: string) => {
    setExpandedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) next.delete(featureId);
      else next.add(featureId);
      return next;
    });
  }, []);

  // 미배치 피쳐 = features − 캔버스에 올라간 feature_id
  const placedFeatureIds = useMemo(() => {
    const s = new Set<string>();
    nodes.forEach((n) => {
      if (n.type === "feature")
        s.add((n.data as { feature_id: string }).feature_id);
    });
    return s;
  }, [nodes]);

  const unplaced = useMemo(
    () => features.filter((f) => !placedFeatureIds.has(f.id)),
    [features, placedFeatureIds],
  );

  // 미배치 트레이 마일스톤 필터 옵션 = 보드 전체 마일스톤 (배치 여부와 무관하게 항상 노출)
  // idx는 milestones 배열 순서 = featureMilestonesMap/노드 칩의 색상 매핑과 동일
  const msMap = featureMilestonesMap ?? {};
  const milestoneOptions = useMemo<FeatureMilestoneRef[]>(
    () =>
      (milestones ?? []).map((ms, idx) => ({
        id: ms.id,
        title: ms.title,
        idx,
      })),
    [milestones],
  );
  // "마일스톤 없음"은 미배정 미배치 피처가 있을 때만 노출
  const hasNoMilestone = useMemo(
    () => unplaced.some((f) => !msMap[f.id]?.length),
    [unplaced, msMap],
  );

  // 선택된 필터가 더 이상 유효하지 않으면 전체로 리셋
  useEffect(() => {
    if (milestoneFilter === null || milestoneFilter === "__none__") return;
    if (!milestoneOptions.some((m) => m.id === milestoneFilter))
      setMilestoneFilter(null);
  }, [milestoneFilter, milestoneOptions]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  const filterActive = milestoneOptions.length > 0 || hasNoMilestone;

  // ── 캔버스 마일스톤 필터 (dim) ──
  // hiddenMs 영속화 (보드별 localStorage)
  useEffect(() => {
    try {
      localStorage.setItem(
        `mindmapHiddenMs_${boardId}`,
        JSON.stringify([...hiddenMs]),
      );
    } catch {
      /* ignore */
    }
  }, [hiddenMs, boardId]);

  // 필터 패널 외부 클릭 시 닫기
  useEffect(() => {
    if (!msPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (msPanelRef.current && !msPanelRef.current.contains(e.target as Node))
        setMsPanelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [msPanelOpen]);

  // 마일스톤별 진행도 (task.milestone_id + completed 기준, 미배정 포함)
  const milestoneProgress = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    let noneDone = 0;
    let noneTotal = 0;
    tasks.forEach((task) => {
      if (task.milestone_id) {
        const entry = map.get(task.milestone_id) ?? { done: 0, total: 0 };
        entry.total += 1;
        if (task.completed) entry.done += 1;
        map.set(task.milestone_id, entry);
      } else {
        noneTotal += 1;
        if (task.completed) noneDone += 1;
      }
    });
    return { map, none: { done: noneDone, total: noneTotal } };
  }, [tasks]);

  const showNoneRow = milestoneProgress.none.total > 0;
  const totalMsCount = milestoneOptions.length + (showNoneRow ? 1 : 0);
  const visibleMsCount =
    milestoneOptions.filter((m) => !hiddenMs.has(m.id)).length +
    (showNoneRow && !hiddenMs.has(UNASSIGNED_MS) ? 1 : 0);

  // 표시 중인 마일스톤 종합 진행도 (task 가중 합산)
  const overallVisiblePct = useMemo(() => {
    let done = 0;
    let total = 0;
    milestoneOptions.forEach((m) => {
      if (hiddenMs.has(m.id)) return;
      const p = milestoneProgress.map.get(m.id);
      if (p) {
        done += p.done;
        total += p.total;
      }
    });
    if (showNoneRow && !hiddenMs.has(UNASSIGNED_MS)) {
      done += milestoneProgress.none.done;
      total += milestoneProgress.none.total;
    }
    return total > 0 ? Math.round((done * 100) / total) : 0;
  }, [milestoneOptions, hiddenMs, milestoneProgress, showNoneRow]);

  const toggleMsVisible = useCallback((id: string) => {
    setHiddenMs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const showAllMs = useCallback(() => setHiddenMs(new Set()), []);
  const hideAllMs = useCallback(() => {
    const all = milestoneOptions.map((m) => m.id);
    if (showNoneRow) all.push(UNASSIGNED_MS);
    setHiddenMs(new Set(all));
  }, [milestoneOptions, showNoneRow]);

  // 걸친 마일스톤이 전부 숨김인 피처 노드 → 연결 엣지도 함께 흐림
  const dimmedNodeIds = useMemo(() => {
    const s = new Set<string>();
    if (hiddenMs.size === 0) return s;
    const map = featureMilestonesMap ?? {};
    nodes.forEach((n) => {
      if (n.type !== "feature") return;
      const fid = (n.data as { feature_id?: string }).feature_id;
      if (!fid) return;
      const ids = (map[fid] || []).map((m) => m.id);
      const ftasks = tasksByFeature.get(fid) ?? [];
      const hasUnassigned = ftasks.some((t) => !t.milestone_id);
      const relevant = ids.length
        ? hasUnassigned
          ? [...ids, UNASSIGNED_MS]
          : ids
        : [UNASSIGNED_MS];
      if (relevant.every((id) => hiddenMs.has(id))) s.add(n.id);
    });
    return s;
  }, [nodes, hiddenMs, featureMilestonesMap, tasksByFeature]);

  const displayEdges = useMemo(() => {
    if (dimmedNodeIds.size === 0) return edges;
    return edges.map((e) =>
      dimmedNodeIds.has(e.source) || dimmedNodeIds.has(e.target)
        ? { ...e, style: { ...(e.style || {}), opacity: 0.15 } }
        : e,
    );
  }, [edges, dimmedNodeIds]);

  const visibleUnplaced = useMemo(() => {
    let list = unplaced;
    if (milestoneFilter === "__none__")
      list = list.filter((f) => !msMap[f.id]?.length);
    else if (milestoneFilter !== null)
      list = list.filter((f) =>
        msMap[f.id]?.some((m) => m.id === milestoneFilter),
      );
    const query = traySearch.trim().toLowerCase();
    if (query) list = list.filter((f) => f.title.toLowerCase().includes(query));
    return list;
  }, [unplaced, milestoneFilter, msMap, traySearch]);

  // 트레이 → 캔버스 드롭
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!canEdit) return;
      const featureId = event.dataTransfer.getData(
        "application/mindmap-feature",
      );
      if (!featureId || placedFeatureIds.has(featureId)) return;
      const pos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setNodes((nds) => [
        ...nds,
        {
          id: crypto.randomUUID(),
          type: "feature",
          position: pos,
          data: { feature_id: featureId },
        },
      ]);
    },
    [canEdit, placedFeatureIds, screenToFlowPosition, setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const ctxValue = useMemo<MindMapCtx>(
    () => ({
      featuresById,
      featureMilestonesMap: featureMilestonesMap ?? {},
      tasksByFeature,
      hiddenMilestones: hiddenMs,
      expandedFeatures,
      memberColorMap,
      canEdit,
      onFeatureClick,
      onTaskClick,
      toggleExpand,
      toggleLock,
      renameMemo,
      recolorMemo,
      deleteNode,
      openNodeMenu,
    }),
    [
      featuresById,
      featureMilestonesMap,
      tasksByFeature,
      hiddenMs,
      expandedFeatures,
      memberColorMap,
      canEdit,
      onFeatureClick,
      onTaskClick,
      toggleExpand,
      toggleLock,
      renameMemo,
      recolorMemo,
      deleteNode,
      openNodeMenu,
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
    <MindMapContext.Provider value={ctxValue}>
      <div className="flex-1 flex overflow-hidden" style={{ height: "100%" }}>
        {/* 미배치 피쳐 트레이 */}
        {canEdit && (
          <div className="w-[210px] shrink-0 flex flex-col border-r border-foreground/[0.08] bg-bridge-obsidian/60">
            <div className="px-3.5 pt-3 pb-2.5 border-b border-foreground/[0.06]">
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                {t("mindmap.unplacedFeatures", "미배치 피쳐")}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {t("mindmap.dragToPlace", "캔버스로 드래그해 배치")}
              </div>
            </div>
            <div className="px-2.5 pt-2 pb-0.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={traySearch}
                  onChange={(e) => setTraySearch(e.target.value)}
                  placeholder={t("mindmap.searchFeatures", "피쳐 검색")}
                  className="w-full bg-foreground/[0.04] border border-foreground/10 rounded-lg py-1.5 pl-8 pr-7 text-xs text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
                />
                {traySearch && (
                  <button
                    type="button"
                    onClick={() => setTraySearch("")}
                    aria-label={t("mindmap.clearSearch", "검색 지우기")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {filterActive &&
              (() => {
                // 현재 선택된 필터의 표시 라벨/색상 계산
                const selected =
                  milestoneFilter && milestoneFilter !== "__none__"
                    ? milestoneOptions.find((m) => m.id === milestoneFilter)
                    : null;
                const selectedColor = selected
                  ? MILESTONE_COLORS[selected.idx % MILESTONE_COLORS.length]
                  : null;
                const label =
                  milestoneFilter === null
                    ? t("mindmap.filterAll", "전체")
                    : milestoneFilter === "__none__"
                      ? t("mindmap.filterNoMilestone", "마일스톤 없음")
                      : (selected?.title ?? t("mindmap.filterAll", "전체"));
                return (
                  <div className="px-2.5 py-2 border-b border-foreground/[0.06]">
                    <div className="relative" ref={filterRef}>
                      <button
                        type="button"
                        onClick={() => setFilterOpen((o) => !o)}
                        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-foreground/[0.04] border border-foreground/10 text-[11px] font-bold text-foreground hover:bg-foreground/[0.07] transition-colors"
                      >
                        {selectedColor && (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: selectedColor }}
                          />
                        )}
                        <span className="truncate flex-1 text-left">
                          {label}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${
                            filterOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {filterOpen && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 py-1 rounded-lg bg-bridge-obsidian border border-foreground/10 shadow-2xl max-h-64 overflow-y-auto custom-scrollbar">
                          <button
                            type="button"
                            onClick={() => {
                              setMilestoneFilter(null);
                              setFilterOpen(false);
                            }}
                            className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-left transition-colors hover:bg-foreground/[0.06] ${
                              milestoneFilter === null
                                ? "text-bridge-accent"
                                : "text-slate-400"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 shrink-0" />
                            <span className="truncate">
                              {t("mindmap.filterAll", "전체")}
                            </span>
                          </button>
                          {milestoneOptions.map((ms) => {
                            const msColor =
                              MILESTONE_COLORS[
                                ms.idx % MILESTONE_COLORS.length
                              ];
                            const active = milestoneFilter === ms.id;
                            return (
                              <button
                                key={ms.id}
                                type="button"
                                onClick={() => {
                                  setMilestoneFilter(ms.id);
                                  setFilterOpen(false);
                                }}
                                title={ms.title}
                                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-left transition-colors hover:bg-foreground/[0.06]"
                                style={{ color: active ? msColor : undefined }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: msColor }}
                                />
                                <span
                                  className={`truncate ${active ? "" : "text-slate-400"}`}
                                >
                                  {ms.title}
                                </span>
                              </button>
                            );
                          })}
                          {hasNoMilestone && (
                            <button
                              type="button"
                              onClick={() => {
                                setMilestoneFilter("__none__");
                                setFilterOpen(false);
                              }}
                              className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-left transition-colors hover:bg-foreground/[0.06] ${
                                milestoneFilter === "__none__"
                                  ? "text-slate-200"
                                  : "text-slate-400"
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-500" />
                              <span className="truncate">
                                {t(
                                  "mindmap.filterNoMilestone",
                                  "마일스톤 없음",
                                )}
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 flex flex-col gap-2">
              {visibleUnplaced.length === 0 ? (
                <div className="text-[11px] text-slate-600 text-center py-6">
                  {unplaced.length === 0
                    ? t("mindmap.allPlaced", "모든 피쳐가 배치됨")
                    : traySearch.trim()
                      ? t("mindmap.noSearchResults", "검색 결과 없음")
                      : t(
                          "mindmap.noFilteredFeatures",
                          "해당 마일스톤의 미배치 피쳐 없음",
                        )}
                </div>
              ) : (
                visibleUnplaced.map((f) => (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "application/mindmap-feature",
                        f.id,
                      )
                    }
                    className="group flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-foreground/[0.03] border border-foreground/[0.07] cursor-grab hover:border-bridge-accent/50 hover:bg-bridge-accent/[0.06] transition-colors"
                  >
                    <span
                      className="w-1 self-stretch rounded-full"
                      style={{ backgroundColor: f.color || "#6366F1" }}
                    />
                    <span className="flex-1 min-w-0 text-xs font-medium text-foreground line-clamp-1">
                      {f.title}
                    </span>
                    <button
                      type="button"
                      draggable={false}
                      aria-label={t("mindmap.viewDetail", "상세 보기")}
                      title={t("mindmap.viewDetail", "상세 보기")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFeatureClick(f);
                      }}
                      className="shrink-0 p-1 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-foreground/10 transition-all"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 캔버스 */}
        <div
          className={`flex-1 relative ${
            interactionMode === "pointer" ? "mm-pointer" : ""
          }`}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          {/* 툴바 */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-bridge-obsidian/85 backdrop-blur-md border border-foreground/[0.08] rounded-2xl px-2.5 py-1.5 shadow-2xl">
            <span className="text-xs font-bold text-foreground px-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gradient-to-br from-bridge-accent to-bridge-secondary" />
              {t("kanban.viewBoardMindMap", "마인드맵")}
            </span>
            {canEdit ? (
              <>
                {/* 손/선택 도구 토글 (H / V) */}
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
                {onCreateFeature && (
                  <button
                    type="button"
                    onClick={() => setAddFeatureOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground hover:bg-foreground/10 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t("mindmap.addFeature", "피처 추가")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={addMemo}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-colors"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  {t("mindmap.addMemo", "메모 추가")}
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-500 px-2">
                {t("mindmap.readOnly", "읽기 전용")}
              </span>
            )}
          </div>

          {/* 마일스톤 필터 패널 (우상단, dim 토글) */}
          {milestoneOptions.length > 0 && (
            <div
              ref={msPanelRef}
              className="absolute top-3 right-3 z-30 w-[236px]"
            >
              <button
                type="button"
                onClick={() => setMsPanelOpen((o) => !o)}
                className="w-full flex items-center gap-2 bg-bridge-obsidian/85 backdrop-blur-md border border-foreground/[0.08] rounded-2xl px-3 py-2 shadow-2xl hover:border-foreground/[0.12] transition-colors"
              >
                <Flag className="w-3.5 h-3.5 text-bridge-secondary shrink-0" />
                <span className="text-xs font-bold text-foreground">
                  {t("mindmap.milestoneFilter", "마일스톤 필터")}
                </span>
                <span className="text-[10px] font-bold text-slate-400 font-mono">
                  {visibleMsCount}/{totalMsCount}
                </span>
                {hiddenMs.size > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-bridge-secondary shrink-0" />
                )}
                {msPanelOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />
                )}
              </button>

              {msPanelOpen && (
                <div className="mt-1.5 bg-bridge-obsidian/95 backdrop-blur-md border border-foreground/[0.08] rounded-2xl shadow-2xl overflow-hidden">
                  <div className="flex items-center gap-1 px-2.5 py-2 border-b border-foreground/[0.06]">
                    <span className="flex-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {t("mindmap.milestoneVisibility", "표시할 마일스톤")}
                    </span>
                    <button
                      type="button"
                      onClick={showAllMs}
                      className="text-[10px] font-bold text-slate-400 hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                    >
                      {t("mindmap.showAll", "전체")}
                    </button>
                    <button
                      type="button"
                      onClick={hideAllMs}
                      className="text-[10px] font-bold text-slate-400 hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
                    >
                      {t("mindmap.hideAll", "숨김")}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-foreground/[0.06]">
                    <span className="text-[10px] font-bold text-slate-500 shrink-0">
                      {t("mindmap.overallProgress", "종합")}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${overallVisiblePct}%`,
                          background: "linear-gradient(90deg,#6366F1,#2DD4BF)",
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 font-mono shrink-0">
                      {overallVisiblePct}%
                    </span>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto py-1 custom-scrollbar">
                    {milestoneOptions.map((ms) => {
                      const color =
                        MILESTONE_COLORS[ms.idx % MILESTONE_COLORS.length];
                      const prog = milestoneProgress.map.get(ms.id);
                      const done = prog?.done ?? 0;
                      const total = prog?.total ?? 0;
                      const pct =
                        total > 0 ? Math.round((done * 100) / total) : 0;
                      const on = !hiddenMs.has(ms.id);
                      return (
                        <button
                          key={ms.id}
                          type="button"
                          onClick={() => toggleMsVisible(ms.id)}
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-foreground/[0.04] transition-colors"
                          style={{ opacity: on ? 1 : 0.5 }}
                          title={ms.title}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="flex-1 min-w-0 text-left">
                            <span className="block text-xs font-bold text-foreground truncate">
                              {ms.title}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-mono">
                              {done}/{total} · {pct}%
                            </span>
                          </span>
                          {on ? (
                            <Eye
                              className="w-3.5 h-3.5 shrink-0"
                              style={{ color }}
                            />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                    {showNoneRow &&
                      (() => {
                        const on = !hiddenMs.has(UNASSIGNED_MS);
                        const { done, total } = milestoneProgress.none;
                        const pct =
                          total > 0 ? Math.round((done * 100) / total) : 0;
                        return (
                          <button
                            type="button"
                            onClick={() => toggleMsVisible(UNASSIGNED_MS)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-foreground/[0.04] transition-colors"
                            style={{ opacity: on ? 1 : 0.5 }}
                          >
                            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0 bg-slate-500" />
                            <span className="flex-1 min-w-0 text-left">
                              <span className="block text-xs font-bold text-foreground truncate">
                                {t("mindmap.unassigned", "미배정")}
                              </span>
                              <span className="block text-[10px] text-slate-500 font-mono">
                                {done}/{total} · {pct}%
                              </span>
                            </span>
                            {on ? (
                              <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            )}
                          </button>
                        );
                      })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center text-slate-500">
                <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <div className="text-sm">
                  {canEdit
                    ? t(
                        "mindmap.empty",
                        "왼쪽 피쳐를 드래그하거나 메모를 추가해 시작하세요",
                      )
                    : t("mindmap.emptyReadOnly", "아직 마인드맵이 없습니다")}
                </div>
              </div>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionContextMenu={openSelectionMenu}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={canEdit}
            panOnDrag={interactionMode === "hand" ? true : [1, 2]}
            selectionOnDrag={canEdit && interactionMode === "pointer"}
            selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode={["Shift", "Meta"]}
            deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            defaultEdgeOptions={{
              style: { stroke: "rgba(148,163,184,0.5)", strokeWidth: 2 },
              interactionWidth: 20,
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} color="rgba(255,255,255,0.07)" />
            <Controls
              showInteractive={false}
              className="!bg-bridge-obsidian/90 !border !border-foreground/[0.08] !rounded-lg"
            />
            <MiniMap
              pannable
              zoomable
              className="!bg-bridge-dark/90 !border !border-foreground/[0.08] !rounded-lg"
              nodeColor={(n) =>
                n.type === "memo"
                  ? (n.data as { color?: string }).color || "#6366F1"
                  : featuresById.get(
                      (n.data as { feature_id?: string }).feature_id || "",
                    )?.color || "#6366F1"
              }
              maskColor="rgba(13,17,26,0.6)"
            />
          </ReactFlow>
        </div>
      </div>
      {/* 핸들: 노드 hover 시에만 표시 */}
      <style>{`
        .react-flow__handle.mm-handle{
          width:9px;height:9px;background:#6366F1;border:2px solid #151B28;opacity:0;transition:opacity .15s;
        }
        .react-flow .react-flow__node:hover .mm-handle{opacity:1}
        /* 선택 도구(pointer) 모드 — 빈 캔버스에서 crosshair 커서 */
        .mm-pointer .react-flow__pane{cursor:crosshair}
        /* 엣지 호버 — 선택 가능 힌트 */
        .react-flow__edge:hover .react-flow__edge-path{
          stroke:rgba(99,102,241,0.7)!important;cursor:pointer;
        }
        /* 선택된 엣지 — bridge-accent 강조 + 굵기 + 글로우 + 흐르는 대시 */
        .react-flow__edge.selected .react-flow__edge-path,
        .react-flow__edge:focus .react-flow__edge-path,
        .react-flow__edge:focus-visible .react-flow__edge-path{
          stroke:#6366F1!important;stroke-width:3!important;
          filter:drop-shadow(0 0 5px rgba(99,102,241,0.75));
          stroke-dasharray:6 4;animation:mm-edge-dash .6s linear infinite;
        }
        @keyframes mm-edge-dash{to{stroke-dashoffset:-10}}
      `}</style>
      {/* 노드 우클릭 컨텍스트 메뉴 (Feature/메모 공용) */}
      {nodeMenu && (
        <div
          className="fixed z-50 min-w-[200px] py-1 rounded-xl bg-bridge-obsidian border border-foreground/10 shadow-2xl"
          style={{ left: nodeMenu.x, top: nodeMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-3 pt-2 pb-1.5 border-b border-foreground/[0.06]">
            <div className="text-xs font-bold text-foreground line-clamp-1">
              {nodeMenu.title}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              toggleLockMany(nodeMenu.nodeIds, !nodeMenu.allLocked);
              setNodeMenu(null);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
          >
            {nodeMenu.allLocked ? (
              <>
                <Unlock className="w-3.5 h-3.5 shrink-0" />
                <span>{t("mindmap.unlockPosition", "위치 잠금 해제")}</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>{t("mindmap.lockPosition", "위치 잠금")}</span>
              </>
            )}
          </button>
          {nodeMenu.nodeType === "memo" ? (
            <button
              type="button"
              onClick={() => {
                deleteNodes(nodeMenu.nodeIds);
                setNodeMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-foreground/[0.05] transition-colors"
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              <span>{t("mindmap.deleteMemo", "메모 삭제")}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                deleteNodes(nodeMenu.nodeIds);
                setNodeMenu(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-foreground/[0.05] transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5 shrink-0" />
              <span>{t("mindmap.excludeFeature", "마인드맵에서 제외")}</span>
            </button>
          )}
        </div>
      )}
      {onCreateFeature && (
        <AddFeatureModal
          open={addFeatureOpen}
          onClose={() => setAddFeatureOpen(false)}
          onAdd={handleCreateFeature}
          milestones={milestones}
        />
      )}
    </MindMapContext.Provider>
  );
}

export function MindMapView(props: MindMapViewProps) {
  return (
    <ReactFlowProvider>
      <MindMapCanvas {...props} />
    </ReactFlowProvider>
  );
}

export default MindMapView;
