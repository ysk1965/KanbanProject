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
import { Loader2, StickyNote, Trash2, X } from "lucide-react";
import type { Feature, MindMapDocument, MindMapNode } from "../types";
import { mindMapAPI } from "../utils/api";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";

interface MindMapViewProps {
  boardId: string;
  features: Feature[];
  canEdit: boolean;
  memberColorMap: Record<string, string | null>;
  onFeatureClick: (feature: Feature) => void;
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

const HANDLE_SIDES: Position[] = [
  Position.Top,
  Position.Right,
  Position.Bottom,
  Position.Left,
];

// ────────────────────────────────────────────────────────────
// Context: 노드가 live 데이터(featuresById)와 핸들러를 읽는다.
// (featuresById는 node.data에 넣지 않아 autosave 트리거에서 분리)
// ────────────────────────────────────────────────────────────
interface MindMapCtx {
  featuresById: Map<string, Feature>;
  memberColorMap: Record<string, string | null>;
  canEdit: boolean;
  onFeatureClick: (feature: Feature) => void;
  renameMemo: (id: string, label: string) => void;
  recolorMemo: (id: string) => void;
  deleteNode: (id: string) => void;
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
const FeatureNode = memo(function FeatureNode({ data }: NodeProps) {
  const { featuresById, memberColorMap, canEdit, onFeatureClick } =
    useMindMap();
  const featureId = (data as { feature_id: string }).feature_id;
  const feature = featuresById.get(featureId);

  if (!feature) {
    return (
      <div className="px-3 py-2 rounded-xl border border-foreground/10 bg-bridge-obsidian text-xs text-slate-500">
        <NodeHandles canEdit={canEdit} />
        삭제된 피쳐
      </div>
    );
  }

  const color = feature.color || "#6366F1";
  const pct = feature.progress_percentage ?? 0;
  const assignee = feature.assignee;

  return (
    <div
      className="group relative w-[180px] rounded-2xl border border-foreground/10 bg-bridge-obsidian px-3 py-2.5 shadow-lg cursor-pointer transition-colors hover:border-bridge-accent/60"
      onClick={() => onFeatureClick(feature)}
    >
      <NodeHandles canEdit={canEdit} />
      <span
        className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="pl-2.5">
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
      </div>
    </div>
  );
});

// ────────────────────────────────────────────────────────────
// 메모 노드 — label/color 자체 저장, 더블클릭 rename
// ────────────────────────────────────────────────────────────
const MemoNode = memo(function MemoNode({ id, data }: NodeProps) {
  const { canEdit, renameMemo, recolorMemo, deleteNode } = useMindMap();
  const label = (data as { label?: string }).label || "";
  const color = (data as { color?: string }).color || "#6366F1";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== label) renameMemo(id, next);
    else setDraft(label);
  };

  return (
    <div
      className="group relative rounded-xl border-[1.5px] border-dashed px-3.5 py-2.5 text-xs font-bold shadow-md"
      style={{ borderColor: color, color, background: "rgba(30,42,66,0.55)" }}
      onDoubleClick={() => {
        if (!canEdit) return;
        setDraft(label);
        setEditing(true);
      }}
    >
      <NodeHandles canEdit={canEdit} />
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
          className="bg-transparent outline-none text-foreground w-32"
        />
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-2.5 h-2.5 rounded-[3px] shrink-0"
            style={{ backgroundColor: color }}
            onClick={(e) => {
              e.stopPropagation();
              if (canEdit) recolorMemo(id);
            }}
            title="색상 변경"
          />
          <span className="text-foreground">{label || "메모"}</span>
          {canEdit && (
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(id);
              }}
              title="삭제"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});

const nodeTypes = { feature: FeatureNode, memo: MemoNode };

// 직렬화: RF nodes/edges → 저장 문서
function serialize(nodes: Node[], edges: Edge[]): MindMapDocument {
  return {
    nodes: nodes.map((n) => {
      const base = {
        id: n.id,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
      };
      if (n.type === "memo") {
        return {
          ...base,
          kind: "memo" as const,
          label: (n.data as { label?: string }).label || "",
          color: (n.data as { color?: string }).color || "#6366F1",
        };
      }
      return {
        ...base,
        kind: "feature" as const,
        feature_id: (n.data as { feature_id: string }).feature_id,
      };
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

// 역직렬화 + orphan prune
function deserialize(
  doc: MindMapDocument,
  featuresById: Map<string, Feature>,
): { nodes: Node[]; edges: Edge[] } {
  const validNodes: Node[] = [];
  const keptIds = new Set<string>();
  for (const n of doc.nodes || []) {
    if (n.kind === "feature") {
      if (!n.feature_id || !featuresById.has(n.feature_id)) continue; // 삭제된 피쳐 prune
      validNodes.push({
        id: n.id,
        type: "feature",
        position: { x: n.x, y: n.y },
        data: { feature_id: n.feature_id },
      });
    } else {
      validNodes.push({
        id: n.id,
        type: "memo",
        position: { x: n.x, y: n.y },
        data: { label: n.label || "", color: n.color || "#6366F1" },
      });
    }
    keptIds.add(n.id);
  }
  const validEdges: Edge[] = (doc.edges || [])
    .filter((e) => keptIds.has(e.source) && keptIds.has(e.target))
    .map((e) => ({ id: e.id, source: e.source, target: e.target }));
  return { nodes: validNodes, edges: validEdges };
}

// ────────────────────────────────────────────────────────────
// 내부 캔버스 (ReactFlowProvider 내부 — useReactFlow 사용)
// ────────────────────────────────────────────────────────────
function MindMapCanvas({
  boardId,
  features,
  canEdit,
  memberColorMap,
  onFeatureClick,
}: MindMapViewProps) {
  const { t } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);

  const loadedRef = useRef(false);
  const lastSavedRef = useRef<string>("");
  const latestDocRef = useRef<string>("");

  const featuresById = useMemo(() => {
    const map = new Map<string, Feature>();
    features.forEach((f) => map.set(f.id, f));
    return map;
  }, [features]);

  // 최초 로드
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadedRef.current = false;
    mindMapAPI
      .get(boardId)
      .then((doc) => {
        if (cancelled) return;
        const { nodes: n, edges: e } = deserialize(
          doc || { nodes: [], edges: [] },
          featuresById,
        );
        setNodes(n);
        setEdges(e);
        const json = JSON.stringify(serialize(n, e));
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
    const doc = serialize(nodes, edges);
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
  }, [nodes, edges, canEdit, boardId]);

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
        data: { label: t("mindmap.newMemo", "새 메모"), color: "#6366F1" },
      },
    ]);
  }, [canEdit, screenToFlowPosition, setNodes, t]);

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
      memberColorMap,
      canEdit,
      onFeatureClick,
      renameMemo,
      recolorMemo,
      deleteNode,
    }),
    [
      featuresById,
      memberColorMap,
      canEdit,
      onFeatureClick,
      renameMemo,
      recolorMemo,
      deleteNode,
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
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 flex flex-col gap-2">
              {unplaced.length === 0 ? (
                <div className="text-[11px] text-slate-600 text-center py-6">
                  {t("mindmap.allPlaced", "모든 피쳐가 배치됨")}
                </div>
              ) : (
                unplaced.map((f) => (
                  <div
                    key={f.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "application/mindmap-feature",
                        f.id,
                      )
                    }
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-foreground/[0.03] border border-foreground/[0.07] cursor-grab hover:border-bridge-accent/50 hover:bg-bridge-accent/[0.06] transition-colors"
                  >
                    <span
                      className="w-1 self-stretch rounded-full"
                      style={{ backgroundColor: f.color || "#6366F1" }}
                    />
                    <span className="text-xs font-medium text-foreground line-clamp-1">
                      {f.title}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 캔버스 */}
        <div
          className="flex-1 relative"
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
              <button
                type="button"
                onClick={addMemo}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-colors"
              >
                <StickyNote className="w-3.5 h-3.5" />
                {t("mindmap.addMemo", "메모 추가")}
              </button>
            ) : (
              <span className="text-xs text-slate-500 px-2">
                {t("mindmap.readOnly", "읽기 전용")}
              </span>
            )}
          </div>

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
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            elementsSelectable={canEdit}
            deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
            defaultEdgeOptions={{
              style: { stroke: "rgba(148,163,184,0.5)", strokeWidth: 2 },
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
      `}</style>
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
