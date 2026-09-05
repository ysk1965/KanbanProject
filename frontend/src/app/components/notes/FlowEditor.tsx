import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
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
  Clock,
  Film,
  Hand,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  Pause,
  Pencil,
  Save,
  Play,
  Square,
  StickyNote,
  Type,
  Video as VideoIcon,
  Eye,
  DoorOpen,
  MessageSquare,
  MessageCircle,
  ChevronDown,
  Tag as TagIcon,
  Users,
  X,
  Lock,
  Unlock,
  BringToFront,
  SendToBack,
  Copy,
  ClipboardPaste,
  Trash2,
  Undo2,
  Redo2,
  type LucideIcon,
} from "lucide-react";
import * as Y from "yjs";
import { toast } from "sonner";
import { NoteShareButton } from "./NoteShareButton";
import { NoteVersionHistory } from "./NoteVersionHistory";
import { NoteTagManager } from "./NoteTagManager";
import { NoteBottomComments } from "./NoteBottomComments";
import { CollabPresence } from "./CollabPresence";
import { IconButton } from "../ui/IconButton";
import { useAuth } from "../../contexts/AuthContext";
import { formatDateTime } from "../../utils/dateUtils";
import { fileAPI } from "../../utils/api";
import type { NoteDetail, NoteTagInfo } from "../../utils/api";
import type { CollaborationState } from "../../hooks/useCollaboration";

// ────────────────────────────────────────────────────────────
// 저장 스키마 (note.content JSON)
//   { type: "bridge-flow", version: 1, nodes: [...], edges: [...] }
// 노드 kind: text | sticky | shape | image | video | sprite
//   sprite = 여러 이미지를 GIF처럼 순환 재생하는 애니메이션 노드
// ────────────────────────────────────────────────────────────
type FlowNodeKind = "text" | "sticky" | "shape" | "image" | "video" | "sprite";

interface StoredFlowNode {
  id: string;
  kind: FlowNodeKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  locked?: boolean; // 잠금 (이동·리사이즈·삭제 차단)
  z?: number; // 스택 순서 (zIndex)
  data: Record<string, unknown>;
}
interface StoredFlowEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string | null;
  target_handle?: string | null;
  label?: string | null;
}
interface FlowDocument {
  type?: string;
  version?: number;
  nodes: StoredFlowNode[];
  edges: StoredFlowEdge[];
}

// 삽입 미디어 원본 크기 기준 (긴 변 상한 / 짧은 변 하한)
const MEDIA_MAX = 560;
const MEDIA_MIN = 120;

function getImageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function getVideoSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth, height: v.videoHeight });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    v.src = url;
  });
}

// 원본 비율 유지하며 상·하한에 맞춘 노드 크기 계산
function fitMediaSize(
  nat: { width: number; height: number } | null,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  if (!nat || !nat.width || !nat.height) return fallback;
  let w = nat.width;
  let h = nat.height;
  const longest = Math.max(w, h);
  if (longest > MEDIA_MAX) {
    const s = MEDIA_MAX / longest;
    w *= s;
    h *= s;
  }
  const shortest = Math.min(w, h);
  if (shortest < MEDIA_MIN) {
    const s = MEDIA_MIN / shortest;
    w *= s;
    h *= s;
  }
  return { width: Math.round(w), height: Math.round(h) };
}

const NODE_COLORS = [
  "#6366F1",
  "#2DD4BF",
  "#f43f5e",
  "#f59e0b",
  "#a855f7",
  "#10b981",
];

const SHAPE_CYCLE = ["rectangle", "ellipse", "diamond"] as const;
type ShapeKind = (typeof SHAPE_CYCLE)[number];

const HANDLE_SIDES: Position[] = [
  Position.Top,
  Position.Right,
  Position.Bottom,
  Position.Left,
];

// ────────────────────────────────────────────────────────────
// Context — 노드가 편집 핸들러/권한을 읽는다
// ────────────────────────────────────────────────────────────
interface FlowCtx {
  canEdit: boolean;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  recolorNode: (id: string) => void;
  cycleShape: (id: string) => void;
  deleteNode: (id: string) => void;
  // 컨텍스트 메뉴 "코멘트 달기" → 해당 노드의 코멘트 에디터 자동 오픈
  commentTargetId: string | null;
  clearCommentTarget: () => void;
}
const FlowContext = createContext<FlowCtx | null>(null);
const useFlow = () => {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("FlowContext missing");
  return ctx;
};

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
            className="fl-handle"
          />
          <Handle
            type="source"
            position={pos}
            id={`s-${pos}`}
            isConnectable={canEdit}
            className="fl-handle"
          />
        </span>
      ))}
    </>
  );
}

// 삭제 X 버튼 (hover 시 노출) — 잠긴 노드에서는 숨김
function DeleteBtn({ id, locked }: { id: string; locked?: boolean }) {
  const { canEdit, deleteNode } = useFlow();
  if (!canEdit || locked) return null;
  return (
    <button
      type="button"
      className="absolute -top-2.5 -right-2.5 z-20 w-6 h-6 rounded-full bg-rose-500 text-white border-2 border-bridge-obsidian shadow-lg shadow-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-rose-600 transition-opacity"
      onClick={(e) => {
        e.stopPropagation();
        deleteNode(id);
      }}
      title="삭제"
    >
      <X className="w-3.5 h-3.5" strokeWidth={3} />
    </button>
  );
}

// 잠금 배지 (좌상단) — 잠긴 노드에 상시 노출
function LockBadge({ locked }: { locked?: boolean }) {
  if (!locked) return null;
  return (
    <div
      className="absolute -top-2 -left-2 z-20 w-5 h-5 rounded-md bg-amber-500 text-white border-2 border-bridge-obsidian shadow-md flex items-center justify-center pointer-events-none"
      title="잠김"
    >
      <Lock className="w-2.5 h-2.5" strokeWidth={2.5} />
    </div>
  );
}

// 컨텍스트 메뉴 항목
function MenuItem({
  icon: Icon,
  label,
  kbd,
  danger,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        danger
          ? "text-rose-300 hover:bg-rose-500/15"
          : "text-foreground hover:bg-bridge-accent/15"
      }`}
    >
      <Icon
        className={`w-4 h-4 flex-shrink-0 ${danger ? "text-rose-300" : "text-slate-400"}`}
      />
      <span className="flex-1 text-left">{label}</span>
      {kbd && (
        <span className="text-[10px] font-mono text-slate-500 tracking-wide">
          {kbd}
        </span>
      )}
    </button>
  );
}

// 노드 코멘트 (우하단 배지 + 팝오버) — data.comment에 저장, Yjs로 동기화
const NodeComment = memo(function NodeComment({
  id,
  comment,
}: {
  id: string;
  comment?: string;
}) {
  const { canEdit, updateNodeData, commentTargetId, clearCommentTarget } =
    useFlow();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment ?? "");

  // 컨텍스트 메뉴에서 이 노드가 지정되면 에디터 자동 오픈
  useEffect(() => {
    if (commentTargetId !== id) return;
    setDraft(comment ?? "");
    setOpen(true);
    setEditing(true);
    clearCommentTarget();
  }, [commentTargetId, id, comment, clearCommentTarget]);

  const hasComment = !!(comment && comment.trim());
  if (!hasComment && !open) return null;

  const commit = () => {
    updateNodeData(id, { comment: draft.trim() });
    setEditing(false);
    if (!draft.trim()) setOpen(false);
  };

  return (
    <div
      className="absolute -bottom-2 -right-2 z-30"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="w-5 h-5 rounded-md bg-teal-500 text-white border-2 border-bridge-obsidian shadow-md flex items-center justify-center hover:bg-teal-400 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="코멘트"
      >
        <MessageCircle className="w-2.5 h-2.5" strokeWidth={2.5} />
      </button>
      {open && (
        <div
          className="absolute bottom-7 right-0 w-44 bg-bridge-surface border border-foreground/10 rounded-lg p-2 shadow-2xl shadow-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          {editing && canEdit ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              rows={3}
              placeholder="코멘트 입력…"
              className="w-full bg-transparent text-xs text-foreground placeholder-slate-500 outline-none resize-none custom-scrollbar"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditing(false);
                  if (!hasComment) setOpen(false);
                }
              }}
            />
          ) : (
            <div
              className="text-xs text-slate-300 whitespace-pre-wrap break-words leading-relaxed cursor-text"
              onClick={() => {
                if (!canEdit) return;
                setDraft(comment ?? "");
                setEditing(true);
              }}
            >
              {comment}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── 텍스트 노드 ────────────────────────────────────────────
const TextNode = memo(function TextNode({ id, data, selected }: NodeProps) {
  const { canEdit, updateNodeData, recolorNode } = useFlow();
  const title = (data as { title?: string }).title || "";
  const body = (data as { body?: string }).body || "";
  const color = (data as { color?: string }).color || "#6366F1";
  const locked = (data as { locked?: boolean }).locked;
  const comment = (data as { comment?: string }).comment;
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);

  const commit = () => {
    setEditing(false);
    updateNodeData(id, { title: draftTitle.trim(), body: draftBody.trim() });
  };

  return (
    <div
      className="group relative w-full h-full rounded-xl border border-foreground/10 bg-bridge-obsidian shadow-lg px-3.5 py-3"
      style={{ minWidth: 180 }}
      onDoubleClick={() => {
        if (!canEdit) return;
        setDraftTitle(title);
        setDraftBody(body);
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={canEdit && !!selected && !locked}
        minWidth={160}
        minHeight={70}
        color={color}
        handleClassName="!w-2 !h-2 !rounded-sm"
      />
      <NodeHandles canEdit={canEdit} />
      <DeleteBtn id={id} locked={locked} />
      <LockBadge locked={locked} />
      <NodeComment id={id} comment={comment} />
      <span
        className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
        style={{ backgroundColor: color }}
      />
      {canEdit && (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-[3px] z-10"
          style={{ backgroundColor: color }}
          onClick={(e) => {
            e.stopPropagation();
            recolorNode(id);
          }}
          title="색상 변경"
        />
      )}
      {editing ? (
        <div className="pl-2 flex flex-col gap-1.5">
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="제목"
            className="bg-transparent outline-none text-[13px] font-bold text-foreground"
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            placeholder="내용"
            rows={3}
            className="bg-transparent outline-none resize-none text-xs text-slate-300 custom-scrollbar"
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
        </div>
      ) : (
        <div className="pl-2">
          <div className="text-[13px] font-bold text-foreground leading-snug">
            {title || (canEdit ? "더블클릭해 편집" : "제목 없음")}
          </div>
          {body && (
            <div className="mt-1 text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">
              {body}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── 스티키 노드 ────────────────────────────────────────────
const StickyNode = memo(function StickyNode({ id, data, selected }: NodeProps) {
  const { canEdit, updateNodeData, recolorNode } = useFlow();
  const body = (data as { body?: string }).body || "";
  const color = (data as { color?: string }).color || "#f59e0b";
  const locked = (data as { locked?: boolean }).locked;
  const comment = (data as { comment?: string }).comment;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);

  const commit = () => {
    setEditing(false);
    updateNodeData(id, { body: draft.trim() });
  };

  return (
    <div
      className="group relative w-full h-full rounded-xl border-[1.5px] px-3 py-2.5 shadow-md"
      style={{
        borderColor: `${color}80`,
        background: `${color}1f`,
        minWidth: 140,
        minHeight: 60,
      }}
      onDoubleClick={() => {
        if (!canEdit) return;
        setDraft(body);
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={canEdit && !!selected && !locked}
        minWidth={120}
        minHeight={52}
        color={color}
        handleClassName="!w-2 !h-2 !rounded-sm"
      />
      <NodeHandles canEdit={canEdit} />
      <DeleteBtn id={id} locked={locked} />
      <LockBadge locked={locked} />
      <NodeComment id={id} comment={comment} />
      <button
        type="button"
        className="absolute top-1.5 left-1.5 w-2.5 h-2.5 rounded-full z-10"
        style={{ backgroundColor: color }}
        onClick={(e) => {
          e.stopPropagation();
          if (canEdit) recolorNode(id);
        }}
        title="색상 변경"
      />
      <div className="flex items-center justify-center w-full h-full pt-2">
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            rows={2}
            className="bg-transparent outline-none resize-none text-xs font-medium text-center w-full text-foreground"
            style={{ color }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span
            className="text-xs font-medium text-center whitespace-pre-wrap break-words leading-snug"
            style={{ color }}
          >
            {body || "메모"}
          </span>
        )}
      </div>
    </div>
  );
});

// ── 도형 노드 ──────────────────────────────────────────────
const ShapeNode = memo(function ShapeNode({ id, data, selected }: NodeProps) {
  const { canEdit, updateNodeData, recolorNode, cycleShape } = useFlow();
  const shape = ((data as { shape?: ShapeKind }).shape ||
    "rectangle") as ShapeKind;
  const label = (data as { label?: string }).label || "";
  const color = (data as { color?: string }).color || "#6366F1";
  const locked = (data as { locked?: boolean }).locked;
  const comment = (data as { comment?: string }).comment;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  const commit = () => {
    setEditing(false);
    updateNodeData(id, { label: draft.trim() });
  };

  const radius =
    shape === "ellipse" ? "9999px" : shape === "diamond" ? "8px" : "10px";
  const rotate = shape === "diamond" ? "rotate(45deg)" : "none";

  return (
    <div
      className="group relative w-full h-full"
      style={{ minWidth: 120, minHeight: 80 }}
      onDoubleClick={() => {
        if (!canEdit) return;
        setDraft(label);
        setEditing(true);
      }}
    >
      <NodeResizer
        isVisible={canEdit && !!selected && !locked}
        minWidth={80}
        minHeight={60}
        color={color}
        handleClassName="!w-2 !h-2 !rounded-sm"
      />
      <NodeHandles canEdit={canEdit} />
      <DeleteBtn id={id} locked={locked} />
      <LockBadge locked={locked} />
      <NodeComment id={id} comment={comment} />
      {/* 도형 배경 */}
      <div
        className="absolute inset-0 border-2"
        style={{
          borderColor: color,
          background: `${color}1a`,
          borderRadius: radius,
          transform: rotate,
        }}
      />
      {canEdit && (
        <>
          <button
            type="button"
            className="absolute top-1 left-1 w-2.5 h-2.5 rounded-[3px] z-10"
            style={{ backgroundColor: color }}
            onClick={(e) => {
              e.stopPropagation();
              recolorNode(id);
            }}
            title="색상 변경"
          />
          <button
            type="button"
            className="absolute top-1 right-1 z-10 text-[9px] font-bold px-1 rounded bg-foreground/10 text-slate-300 hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              cycleShape(id);
            }}
            title="도형 변경"
          >
            ◇
          </button>
        </>
      )}
      {/* 라벨 */}
      <div className="absolute inset-0 flex items-center justify-center px-3">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            className="bg-transparent outline-none text-xs font-bold text-center w-full text-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <span className="text-xs font-bold text-center text-foreground break-words leading-snug">
            {label}
          </span>
        )}
      </div>
    </div>
  );
});

// 미디어 캡션 편집 인풋 (이미지·영상 공용) — 더블클릭 진입, 중앙정렬
function MediaCaptionEditor({
  id,
  caption,
  variant,
  onDone,
}: {
  id: string;
  caption: string;
  variant: "image" | "video";
  onDone: () => void;
}) {
  const { updateNodeData } = useFlow();
  const [draft, setDraft] = useState(caption);
  useEffect(() => setDraft(caption), [caption]);
  const commit = () => {
    updateNodeData(id, { caption: draft.trim() });
    onDone();
  };
  const base =
    variant === "image"
      ? "text-[11px] text-white"
      : "text-[11px] text-slate-200";
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
        }
        if (e.key === "Escape") {
          setDraft(caption);
          onDone();
        }
      }}
      placeholder="이름 입력"
      className={`w-full bg-transparent outline-none text-center placeholder-slate-400 ${base}`}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

// ── 이미지 노드 ────────────────────────────────────────────
const ImageNode = memo(function ImageNode({ id, data, selected }: NodeProps) {
  const { canEdit } = useFlow();
  const url = (data as { url?: string }).url || "";
  const caption = (data as { caption?: string }).caption || "";
  const locked = (data as { locked?: boolean }).locked;
  const comment = (data as { comment?: string }).comment;
  const [editingCaption, setEditingCaption] = useState(false);
  return (
    <div
      className="group relative w-full h-full"
      style={{ minWidth: 120, minHeight: 90 }}
      onDoubleClick={() => {
        if (canEdit) setEditingCaption(true);
      }}
    >
      <NodeResizer
        isVisible={canEdit && !!selected && !locked}
        minWidth={100}
        minHeight={80}
        keepAspectRatio
        color="#6366F1"
        handleClassName="!w-2 !h-2 !rounded-sm"
      />
      <NodeHandles canEdit={canEdit} />
      <DeleteBtn id={id} locked={locked} />
      <LockBadge locked={locked} />
      <NodeComment id={id} comment={comment} />
      {/* 미디어 프레임 — 클리핑은 여기서만 (X 버튼은 바깥에 남아 잘리지 않음) */}
      <div className="relative w-full h-full rounded-xl border border-foreground/10 bg-bridge-obsidian shadow-lg overflow-hidden">
        {url ? (
          <img
            src={url}
            alt={caption || "image"}
            className="w-full h-full object-contain bg-black pointer-events-none select-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            <ImageIcon className="w-6 h-6" />
          </div>
        )}
        {(caption || (canEdit && editingCaption)) && (
          <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-black/50">
            {canEdit && editingCaption ? (
              <MediaCaptionEditor
                id={id}
                caption={caption}
                variant="image"
                onDone={() => setEditingCaption(false)}
              />
            ) : (
              <div className="text-[11px] text-white text-center truncate">
                {caption}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ── 영상 노드 ──────────────────────────────────────────────
const VideoNode = memo(function VideoNode({ id, data, selected }: NodeProps) {
  const { canEdit } = useFlow();
  const url = (data as { url?: string }).url || "";
  const caption = (data as { caption?: string }).caption || "";
  const locked = (data as { locked?: boolean }).locked;
  const comment = (data as { comment?: string }).comment;
  const [editingCaption, setEditingCaption] = useState(false);
  return (
    <div
      className="group relative w-full h-full"
      style={{ minWidth: 160, minHeight: 100 }}
      onDoubleClick={() => {
        if (canEdit) setEditingCaption(true);
      }}
    >
      <NodeResizer
        isVisible={canEdit && !!selected && !locked}
        minWidth={140}
        minHeight={90}
        color="#f472b6"
        handleClassName="!w-2 !h-2 !rounded-sm"
      />
      <NodeHandles canEdit={canEdit} />
      <DeleteBtn id={id} locked={locked} />
      <LockBadge locked={locked} />
      <NodeComment id={id} comment={comment} />
      {/* 미디어 프레임 — 클리핑은 여기서만 (X 버튼은 바깥에 남아 잘리지 않음) */}
      <div className="relative w-full h-full rounded-xl border border-foreground/10 bg-bridge-obsidian shadow-lg overflow-hidden flex flex-col">
        {url ? (
          <video
            src={url}
            controls
            className="w-full flex-1 min-h-0 object-contain bg-black"
          />
        ) : (
          <div className="w-full flex-1 flex items-center justify-center text-slate-500">
            <Play className="w-6 h-6" />
          </div>
        )}
        {(caption || (canEdit && editingCaption)) && (
          <div className="px-2 py-1 flex-shrink-0">
            {canEdit && editingCaption ? (
              <MediaCaptionEditor
                id={id}
                caption={caption}
                variant="video"
                onDone={() => setEditingCaption(false)}
              />
            ) : (
              <div className="text-[11px] text-slate-400 text-center truncate">
                {caption}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ── 스프라이트(애니메이션) 노드 ────────────────────────────
//   frames: string[] 을 fps 속도로 순환 재생 (GIF처럼)
const SpriteNode = memo(function SpriteNode({ id, data, selected }: NodeProps) {
  const { canEdit, updateNodeData } = useFlow();
  const frames = ((data as { frames?: string[] }).frames || []).filter(Boolean);
  const caption = (data as { caption?: string }).caption || "";
  const fps = (data as { fps?: number }).fps || 8;
  const locked = (data as { locked?: boolean }).locked;
  const comment = (data as { comment?: string }).comment;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [editingCaption, setEditingCaption] = useState(false);

  // 프레임 순환 재생
  useEffect(() => {
    if (!playing || frames.length <= 1) return;
    const interval = setInterval(
      () => setIdx((i) => (i + 1) % frames.length),
      Math.max(40, Math.round(1000 / Math.max(1, fps))),
    );
    return () => clearInterval(interval);
  }, [playing, frames.length, fps]);

  // 프레임 수 변동 시 인덱스 보정
  useEffect(() => {
    setIdx((i) => (frames.length ? i % frames.length : 0));
  }, [frames.length]);

  const setFps = (v: number) =>
    updateNodeData(id, { fps: Math.min(30, Math.max(1, v)) });

  return (
    <div
      className="group relative w-full h-full"
      style={{ minWidth: 120, minHeight: 90 }}
      onDoubleClick={() => {
        if (canEdit) setEditingCaption(true);
      }}
    >
      <NodeResizer
        isVisible={canEdit && !!selected && !locked}
        minWidth={100}
        minHeight={80}
        keepAspectRatio
        color="#2DD4BF"
        handleClassName="!w-2 !h-2 !rounded-sm"
      />
      <NodeHandles canEdit={canEdit} />
      <DeleteBtn id={id} locked={locked} />
      <LockBadge locked={locked} />
      <NodeComment id={id} comment={comment} />
      {/* 미디어 프레임 — 클리핑은 여기서만 (X 버튼은 바깥에 남아 잘리지 않음) */}
      <div className="relative w-full h-full rounded-xl border border-foreground/10 bg-bridge-obsidian shadow-lg overflow-hidden">
        {frames.length > 0 ? (
          // 모든 프레임을 한 번씩만 로드·디코드해두고 보이기/숨기기만 토글한다.
          // (프레임마다 src를 바꾸면 네트워크 로드 지연으로 첫 프레임에 멈춤)
          frames.map((src, i) => (
            <img
              key={`${i}-${src}`}
              src={src}
              alt={caption || "sprite"}
              className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none select-none"
              style={{ visibility: i === idx ? "visible" : "hidden" }}
              draggable={false}
            />
          ))
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500">
            <Film className="w-6 h-6" />
          </div>
        )}

        {/* 프레임 뱃지 — 전체 프레임 수만 정적 표시 (재생 중 숫자가 튀지 않도록) */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/55 text-[11px] font-bold text-bridge-secondary pointer-events-none">
          <Film className="w-3 h-3" />
          {frames.length > 0 ? `${frames.length}F` : "0"}
        </div>

        {/* 재생 진행 바 — hover 시에만 노출, 현재 프레임 위치 표시 */}
        {frames.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div
              className="h-full bg-gradient-to-r from-bridge-secondary to-teal-300 transition-[width] duration-100 ease-linear"
              style={{ width: `${((idx + 1) / frames.length) * 100}%` }}
            />
          </div>
        )}

        {/* 재생 컨트롤 (hover 시 노출) */}
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPlaying((p) => !p);
            }}
            className="w-6 h-6 rounded-md bg-black/55 text-white flex items-center justify-center hover:bg-black/75"
            title={playing ? "일시정지" : "재생"}
          >
            {playing ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
          {canEdit && (
            <div
              className="flex items-center gap-0.5 px-1 h-6 rounded-md bg-black/55 text-white text-[11px] font-bold"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setFps(fps - 1)}
                className="px-1 hover:text-bridge-secondary"
                title="느리게"
              >
                −
              </button>
              <span className="tabular-nums">{fps}fps</span>
              <button
                type="button"
                onClick={() => setFps(fps + 1)}
                className="px-1 hover:text-bridge-secondary"
                title="빠르게"
              >
                +
              </button>
            </div>
          )}
        </div>

        {(caption || (canEdit && editingCaption)) && (
          <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-black/50">
            {canEdit && editingCaption ? (
              <MediaCaptionEditor
                id={id}
                caption={caption}
                variant="image"
                onDone={() => setEditingCaption(false)}
              />
            ) : (
              <div className="text-[11px] text-white text-center truncate">
                {caption}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const nodeTypes = {
  text: TextNode,
  sticky: StickyNode,
  shape: ShapeNode,
  image: ImageNode,
  video: VideoNode,
  sprite: SpriteNode,
};

// ── (de)serialize ──────────────────────────────────────────
function rfNodeToStored(n: Node): StoredFlowNode {
  // locked·z 는 top-level 필드로 추출 (data 에는 남기지 않음)
  const { locked, z, ...restData } = n.data as {
    locked?: boolean;
    z?: number;
  } & Record<string, unknown>;
  return {
    id: n.id,
    kind: (n.type as FlowNodeKind) || "text",
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
    ...(n.width ? { width: Math.round(n.width) } : {}),
    ...(n.height ? { height: Math.round(n.height) } : {}),
    ...(locked ? { locked: true } : {}),
    ...(typeof z === "number" ? { z } : {}),
    data: restData,
  };
}

function storedToRFNode(s: StoredFlowNode): Node {
  return {
    id: s.id,
    type: s.kind,
    position: { x: s.x, y: s.y },
    ...(s.width ? { width: s.width } : {}),
    ...(s.height ? { height: s.height } : {}),
    ...(typeof s.z === "number" ? { zIndex: s.z } : {}),
    ...(s.locked ? { draggable: false } : {}),
    // 런타임 노드는 locked·z 를 data 에서 읽는다 (노드 컴포넌트/렌더용)
    data: {
      ...(s.data || {}),
      ...(s.locked ? { locked: true } : {}),
      ...(typeof s.z === "number" ? { z: s.z } : {}),
    },
  };
}

function rfEdgeToStored(e: Edge): StoredFlowEdge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    source_handle: e.sourceHandle ?? null,
    target_handle: e.targetHandle ?? null,
    label: typeof e.label === "string" ? e.label : null,
  };
}

function storedToRFEdge(s: StoredFlowEdge): Edge {
  return {
    id: s.id,
    source: s.source,
    target: s.target,
    sourceHandle: s.source_handle ?? undefined,
    targetHandle: s.target_handle ?? undefined,
    ...(s.label ? { label: s.label } : {}),
  };
}

function serialize(nodes: Node[], edges: Edge[]): FlowDocument {
  return {
    type: "bridge-flow",
    version: 1,
    nodes: nodes.map(rfNodeToStored),
    edges: edges.map(rfEdgeToStored),
  };
}

// Y.Map(flow-nodes/flow-edges) → RF nodes/edges (orphan edge prune 포함)
function fromYMaps(
  yNodes: Y.Map<unknown>,
  yEdges: Y.Map<unknown>,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  yNodes.forEach((v) => {
    if (v) nodes.push(storedToRFNode(v as StoredFlowNode));
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = [];
  yEdges.forEach((v) => {
    const se = v as StoredFlowEdge;
    if (se && ids.has(se.source) && ids.has(se.target))
      edges.push(storedToRFEdge(se));
  });
  return { nodes, edges };
}

function deserialize(content: string | null): { nodes: Node[]; edges: Edge[] } {
  if (!content?.trim()) return { nodes: [], edges: [] };
  let doc: FlowDocument;
  try {
    doc = JSON.parse(content);
  } catch {
    return { nodes: [], edges: [] };
  }
  const nodes: Node[] = (doc.nodes || []).map(storedToRFNode);
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = (doc.edges || [])
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map(storedToRFEdge);
  return { nodes, edges };
}

interface FlowEditorProps {
  boardId?: string;
  orgId?: string;
  personal?: boolean;
  note: NoteDetail;
  tags: NoteTagInfo[];
  canEdit: boolean;
  onSave: (
    noteId: string,
    data: { title?: string; content?: string; tagIds?: string[] },
    createVersion?: boolean,
  ) => void;
  onTagsChange: () => void;
  onNoteUpdate?: (note: NoteDetail) => void;
  collaboration: CollaborationState | null;
  currentUserName: string;
  currentUserColor: string;
}

// ────────────────────────────────────────────────────────────
// 되돌리기/다시 실행 (per-user, 상태 diff 기반)
//   - 캔버스 전체 롤백이 아니라 "내가 만진 노드/엣지 id"만 되돌린다.
//   - rfNodeToStored/rfEdgeToStored 로 정규화하므로 selected/dragging 은 무시.
//   - undo/redo 결과는 기존 로컬→Yjs diff 이펙트를 타고 협업에 그대로 전파.
//   - 협업 중 상대가 그새 바꾼 노드는 diff 대상이 아니므로 보존된다(best-effort).
// ────────────────────────────────────────────────────────────
type StoredNodeMap = Map<string, StoredFlowNode>;
type StoredEdgeMap = Map<string, StoredFlowEdge>;
interface HistorySlice {
  nodes: Array<[string, StoredFlowNode | null]>; // null = 존재하지 않았음(=삭제로 복원)
  edges: Array<[string, StoredFlowEdge | null]>;
}
interface HistoryEntry {
  before: HistorySlice;
  after: HistorySlice;
}

function diffToEntry(
  baseN: StoredNodeMap,
  baseE: StoredEdgeMap,
  curN: StoredNodeMap,
  curE: StoredEdgeMap,
): HistoryEntry | null {
  const nBefore: HistorySlice["nodes"] = [];
  const nAfter: HistorySlice["nodes"] = [];
  const nIds = new Set([...baseN.keys(), ...curN.keys()]);
  for (const id of nIds) {
    const b = baseN.get(id) ?? null;
    const c = curN.get(id) ?? null;
    if (JSON.stringify(b) !== JSON.stringify(c)) {
      nBefore.push([id, b]);
      nAfter.push([id, c]);
    }
  }
  const eBefore: HistorySlice["edges"] = [];
  const eAfter: HistorySlice["edges"] = [];
  const eIds = new Set([...baseE.keys(), ...curE.keys()]);
  for (const id of eIds) {
    const b = baseE.get(id) ?? null;
    const c = curE.get(id) ?? null;
    if (JSON.stringify(b) !== JSON.stringify(c)) {
      eBefore.push([id, b]);
      eAfter.push([id, c]);
    }
  }
  if (nBefore.length === 0 && eBefore.length === 0) return null;
  return {
    before: { nodes: nBefore, edges: eBefore },
    after: { nodes: nAfter, edges: eAfter },
  };
}

function useFlowHistory(params: {
  nodes: Node[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  enabled: boolean;
  resetKey: string;
  remoteDirtyRef: React.MutableRefObject<boolean>;
}) {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    enabled,
    resetKey,
    remoteDirtyRef,
  } = params;
  const baseNRef = useRef<StoredNodeMap>(new Map());
  const baseERef = useRef<StoredEdgeMap>(new Map());
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // 노트/모드 전환 시 baseline 재설정 + 스택 비우기
  //   편집 진입 시점엔 이미 노드가 로드돼 있으므로 baseline 이 곧 현재 상태.
  //   (원격/드래프트 반영분은 remoteDirtyRef 로 별도 흡수)
  useEffect(() => {
    baseNRef.current = new Map(nodes.map((n) => [n.id, rfNodeToStored(n)]));
    baseERef.current = new Map(edges.map((e) => [e.id, rfEdgeToStored(e)]));
    pastRef.current = [];
    futureRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // 변경 정착 감지(디바운스) → 커밋 경계에서 한 스텝으로 기록
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      // 드래그/리사이즈 진행 중이면 다음 변경에서 다시 평가
      if (nodes.some((n) => n.dragging)) return;
      const curN: StoredNodeMap = new Map(
        nodes.map((n) => [n.id, rfNodeToStored(n)]),
      );
      const curE: StoredEdgeMap = new Map(
        edges.map((e) => [e.id, rfEdgeToStored(e)]),
      );
      // 원격/드래프트 반영분은 baseline 으로 흡수(내 히스토리에 안 쌓음)
      if (remoteDirtyRef.current) {
        baseNRef.current = curN;
        baseERef.current = curE;
        remoteDirtyRef.current = false;
        return;
      }
      const entry = diffToEntry(baseNRef.current, baseERef.current, curN, curE);
      if (!entry) return;
      pastRef.current.push(entry);
      if (pastRef.current.length > 100) pastRef.current.shift();
      futureRef.current = [];
      baseNRef.current = curN;
      baseERef.current = curE;
      setCanUndo(true);
      setCanRedo(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [nodes, edges, enabled, remoteDirtyRef]);

  const applySlice = useCallback(
    (slice: HistorySlice) => {
      if (slice.nodes.length) {
        setNodes((live) => {
          const m = new Map(live.map((n) => [n.id, n]));
          for (const [id, stored] of slice.nodes) {
            if (stored === null) m.delete(id);
            else m.set(id, storedToRFNode(stored));
          }
          return Array.from(m.values());
        });
      }
      if (slice.edges.length) {
        setEdges((live) => {
          const m = new Map(live.map((e) => [e.id, e]));
          for (const [id, stored] of slice.edges) {
            if (stored === null) m.delete(id);
            else m.set(id, storedToRFEdge(stored));
          }
          return Array.from(m.values());
        });
      }
      // baseline 을 적용 결과로 선반영 → 정착 이펙트가 중복 스텝을 만들지 않음
      for (const [id, stored] of slice.nodes) {
        if (stored === null) baseNRef.current.delete(id);
        else baseNRef.current.set(id, stored);
      }
      for (const [id, stored] of slice.edges) {
        if (stored === null) baseERef.current.delete(id);
        else baseERef.current.set(id, stored);
      }
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(() => {
    const entry = pastRef.current.pop();
    if (!entry) return;
    applySlice(entry.before);
    futureRef.current.push(entry);
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
  }, [applySlice]);

  const redo = useCallback(() => {
    const entry = futureRef.current.pop();
    if (!entry) return;
    applySlice(entry.after);
    pastRef.current.push(entry);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
  }, [applySlice]);

  return { undo, redo, canUndo, canRedo };
}

// ────────────────────────────────────────────────────────────
// 내부 캔버스
// ────────────────────────────────────────────────────────────
function FlowCanvas({
  boardId,
  orgId,
  personal,
  note,
  tags,
  canEdit,
  onSave,
  onTagsChange,
  onNoteUpdate,
  collaboration,
  currentUserName,
  currentUserColor,
}: FlowEditorProps) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { screenToFlowPosition } = useReactFlow();

  const [title, setTitle] = useState(note.title);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"hand" | "pointer">(
    "hand",
  );
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);
  // 여러 이미지 입력 시 "묶기 vs 개별" 선택 대기 상태
  const [pendingGroup, setPendingGroup] = useState<{
    images: File[];
    videos: File[];
    pos: { x: number; y: number };
  } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingMediaRef = useRef<"image" | "video" | null>(null);

  // Yjs 라이브 협업 refs (Excalidraw 노트의 옵저버 패턴 이식)
  const yNodesRef = useRef<Y.Map<unknown> | null>(null);
  const yEdgesRef = useRef<Y.Map<unknown> | null>(null);
  const isRemoteUpdateRef = useRef(false);
  const isLocalUpdateRef = useRef(false);
  // 원격/드래프트 반영분은 히스토리에 쌓지 않도록 표시
  const remoteDirtyRef = useRef(false);
  const modeRef = useRef<"view" | "edit">(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // 되돌리기/다시 실행 (per-user, 편집 모드에서만)
  const { undo, redo, canUndo, canRedo } = useFlowHistory({
    nodes,
    edges,
    setNodes,
    setEdges,
    enabled: canEdit && mode === "edit",
    resetKey: `${note.id}:${mode}`,
    remoteDirtyRef,
  });

  // 편집/읽기 모드에 맞춰 collab readOnly + awareness 동기화
  useEffect(() => {
    if (!collaboration) return;
    collaboration.provider.setReadOnly(mode === "view");
    collaboration.provider.awareness.setLocalStateField("mode", mode);
  }, [mode, collaboration]);

  const editorPeers = collaboration
    ? collaboration.connectedUsers.filter((u) => u.mode === "edit")
    : [];

  // note.id 변경 시 초기화 + 스냅샷 로드
  useEffect(() => {
    setTitle(note.title);
    setMode("view");
    const { nodes: n, edges: e } = deserialize(note.content);
    setNodes(n);
    setEdges(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // view 모드에서 스냅샷(note.content)이 갱신되면 반영
  useEffect(() => {
    if (mode !== "view") return;
    const { nodes: n, edges: e } = deserialize(note.content);
    setNodes(n);
    setEdges(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.content, mode]);

  // 다른 편집자가 스냅샷을 발행하면 view 클라이언트는 재조회 (Excalidraw와 동일)
  useEffect(() => {
    if (!collaboration) return;
    return collaboration.provider.onSnapshotUpdated(async () => {
      if (modeRef.current !== "view") return;
      try {
        const { noteService, orgNoteService, myNoteService } =
          await import("../../utils/services");
        const updated = personal
          ? await myNoteService.getDetail("me", note.id)
          : boardId
          ? await noteService.getDetail(boardId, note.id)
          : orgId
            ? await orgNoteService.getDetail(orgId, note.id)
            : null;
        if (!updated) return;
        onNoteUpdate?.(updated);
        setTitle(updated.title);
        const { nodes: n, edges: e } = deserialize(updated.content);
        setNodes(n);
        setEdges(e);
      } catch (err) {
        console.error("Flow snapshot refetch failed:", err);
      }
    });
  }, [
    collaboration,
    note.id,
    boardId,
    orgId,
    onNoteUpdate,
    setNodes,
    setEdges,
  ]);

  // Yjs 옵저버: 원격 변경 → 캔버스 재구성 (편집 모드에서만)
  useEffect(() => {
    if (!collaboration) {
      yNodesRef.current = null;
      yEdgesRef.current = null;
      return;
    }
    const yNodes = collaboration.doc.getMap<unknown>("flow-nodes");
    const yEdges = collaboration.doc.getMap<unknown>("flow-edges");
    yNodesRef.current = yNodes;
    yEdgesRef.current = yEdges;

    const applyRemote = () => {
      if (isLocalUpdateRef.current) return;
      if (modeRef.current !== "edit") return;
      isRemoteUpdateRef.current = true;
      remoteDirtyRef.current = true;
      const { nodes: n, edges: e } = fromYMaps(yNodes, yEdges);
      setNodes(n);
      setEdges(e);
      requestAnimationFrame(() => {
        isRemoteUpdateRef.current = false;
      });
    };

    yNodes.observe(applyRemote);
    yEdges.observe(applyRemote);
    // 편집 모드로 이미 들어온 상태에서 재구독되면 즉시 반영
    if (modeRef.current === "edit" && (yNodes.size > 0 || yEdges.size > 0)) {
      applyRemote();
    }
    return () => {
      yNodes.unobserve(applyRemote);
      yEdges.unobserve(applyRemote);
    };
  }, [collaboration, note.id, setNodes, setEdges]);

  // 편집 진입 시 서버에 남은 미발행 드래프트(Yjs)가 있으면 로드
  useEffect(() => {
    if (mode !== "edit") return;
    const yNodes = yNodesRef.current;
    const yEdges = yEdgesRef.current;
    if (!yNodes || !yEdges) return;
    if (yNodes.size === 0 && yEdges.size === 0) return; // 드래프트 없음 → 스냅샷 유지
    isRemoteUpdateRef.current = true;
    remoteDirtyRef.current = true;
    const { nodes: n, edges: e } = fromYMaps(yNodes, yEdges);
    setNodes(n);
    setEdges(e);
    requestAnimationFrame(() => {
      isRemoteUpdateRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 로컬 변경 → Yjs 반영 (편집 모드). JSON diff로 불필요한 write/echo 방지.
  useEffect(() => {
    if (!collaboration) return;
    if (mode !== "edit") return;
    if (isRemoteUpdateRef.current) return;
    const yNodes = yNodesRef.current;
    const yEdges = yEdgesRef.current;
    if (!yNodes || !yEdges) return;
    isLocalUpdateRef.current = true;
    collaboration.doc.transact(() => {
      const nodeIds = new Set<string>();
      for (const n of nodes) {
        const s = rfNodeToStored(n);
        nodeIds.add(s.id);
        const existing = yNodes.get(s.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(s))
          yNodes.set(s.id, s);
      }
      const nodeDel: string[] = [];
      yNodes.forEach((_v, k) => {
        if (!nodeIds.has(k)) nodeDel.push(k);
      });
      nodeDel.forEach((k) => yNodes.delete(k));

      const edgeIds = new Set<string>();
      for (const e of edges) {
        const s = rfEdgeToStored(e);
        edgeIds.add(s.id);
        const existing = yEdges.get(s.id);
        if (!existing || JSON.stringify(existing) !== JSON.stringify(s))
          yEdges.set(s.id, s);
      }
      const edgeDel: string[] = [];
      yEdges.forEach((_v, k) => {
        if (!edgeIds.has(k)) edgeDel.push(k);
      });
      edgeDel.forEach((k) => yEdges.delete(k));
    });
    isLocalUpdateRef.current = false;
  }, [nodes, edges, mode, collaboration]);

  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [setNodes],
  );

  const recolorNode = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const cur = (n.data as { color?: string }).color || NODE_COLORS[0];
          const next =
            NODE_COLORS[(NODE_COLORS.indexOf(cur) + 1) % NODE_COLORS.length];
          return { ...n, data: { ...n.data, color: next } };
        }),
      );
    },
    [setNodes],
  );

  const cycleShape = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const cur = ((n.data as { shape?: ShapeKind }).shape ||
            "rectangle") as ShapeKind;
          const next =
            SHAPE_CYCLE[(SHAPE_CYCLE.indexOf(cur) + 1) % SHAPE_CYCLE.length];
          return { ...n, data: { ...n.data, shape: next } };
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

  // ── 컨텍스트 메뉴: 상태 · 클립보드 · 액션 ────────────────────
  const nodesRef = useRef<Node[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  const clipboardRef = useRef<StoredFlowNode[] | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    nodeId: string | null;
  } | null>(null);
  const [commentTargetId, setCommentTargetId] = useState<string | null>(null);
  const clearCommentTarget = useCallback(() => setCommentTargetId(null), []);

  // 잠금 토글 — data.locked(렌더용) + draggable(동작용) 동시 갱신
  const toggleLock = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const next = !(n.data as { locked?: boolean }).locked;
          return {
            ...n,
            draggable: next ? false : undefined,
            data: { ...n.data, locked: next },
          };
        }),
      );
    },
    [setNodes],
  );

  const bringToFront = useCallback(
    (id: string) => {
      setNodes((nds) => {
        let max = 0;
        nds.forEach((n) => {
          const z = (n.data as { z?: number }).z;
          if (typeof z === "number" && z > max) max = z;
        });
        const next = max + 1;
        return nds.map((n) =>
          n.id === id
            ? { ...n, zIndex: next, data: { ...n.data, z: next } }
            : n,
        );
      });
    },
    [setNodes],
  );

  const sendToBack = useCallback(
    (id: string) => {
      setNodes((nds) => {
        let min = 0;
        nds.forEach((n) => {
          const z = (n.data as { z?: number }).z;
          if (typeof z === "number" && z < min) min = z;
        });
        const next = min - 1;
        return nds.map((n) =>
          n.id === id
            ? { ...n, zIndex: next, data: { ...n.data, z: next } }
            : n,
        );
      });
    },
    [setNodes],
  );

  const copyNodes = useCallback((ids: string[]) => {
    const set = new Set(ids);
    const picked = nodesRef.current.filter((n) => set.has(n.id));
    if (picked.length) clipboardRef.current = picked.map(rfNodeToStored);
  }, []);

  const pasteNodes = useCallback(
    (pos?: { x: number; y: number }) => {
      const clip = clipboardRef.current;
      if (!clip || clip.length === 0) return;
      const originX = Math.min(...clip.map((c) => c.x));
      const originY = Math.min(...clip.map((c) => c.y));
      const target = pos ?? { x: originX + 24, y: originY + 24 };
      let maxZ = 0;
      nodesRef.current.forEach((n) => {
        const z = (n.data as { z?: number }).z;
        if (typeof z === "number" && z > maxZ) maxZ = z;
      });
      const created = clip.map((c, i) =>
        storedToRFNode({
          ...c,
          id: crypto.randomUUID(),
          x: Math.round(target.x + (c.x - originX)),
          y: Math.round(target.y + (c.y - originY)),
          z: maxZ + 1 + i,
        }),
      );
      created.forEach((n) => (n.selected = true));
      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...created,
      ]);
    },
    [setNodes],
  );

  // "코멘트 달기" → 코멘트 필드 초기화 후 해당 노드 에디터 오픈
  const requestComment = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id && (n.data as { comment?: string }).comment === undefined
            ? { ...n, data: { ...n.data, comment: "" } }
            : n,
        ),
      );
      setCommentTargetId(id);
    },
    [setNodes],
  );

  // 메뉴 열기 (노드 우클릭 → 해당 노드 선택 / 빈 캔버스 우클릭 → 붙여넣기)
  const handleNodeContextMenu = useCallback(
    (e: ReactMouseEvent, node: Node) => {
      e.preventDefault();
      setNodes((nds) =>
        nds.map((n) =>
          n.selected === (n.id === node.id)
            ? n
            : { ...n, selected: n.id === node.id },
        ),
      );
      setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
    },
    [setNodes],
  );
  const handlePaneContextMenu = useCallback(
    (e: ReactMouseEvent | MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, nodeId: null });
    },
    [],
  );

  // 메뉴 닫기 — Esc / 스크롤
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // 단축키 — ⌘C 복사 / ⌘V 붙여넣기 / ⌘⇧L 잠금 / ⌘] 앞으로 / ⌘[ 뒤로
  useEffect(() => {
    if (!(canEdit && mode === "edit")) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const selected = () => nodesRef.current.filter((n) => n.selected);
      const key = e.key.toLowerCase();
      if (key === "z") {
        // ⌘Z 되돌리기 / ⌘⇧Z 다시 실행
        if (e.shiftKey) redo();
        else undo();
        e.preventDefault();
      } else if (key === "y") {
        // ⌘Y(Ctrl+Y) 다시 실행
        redo();
        e.preventDefault();
      } else if (key === "c") {
        const sel = selected();
        if (sel.length) {
          clipboardRef.current = sel.map(rfNodeToStored);
          e.preventDefault();
        }
      } else if (key === "v") {
        if (clipboardRef.current?.length) {
          pasteNodes();
          e.preventDefault();
        }
      } else if (e.shiftKey && key === "l") {
        const sel = selected();
        sel.forEach((n) => toggleLock(n.id));
        if (sel.length) e.preventDefault();
      } else if (e.key === "]") {
        const sel = selected();
        sel.forEach((n) => bringToFront(n.id));
        if (sel.length) e.preventDefault();
      } else if (e.key === "[") {
        const sel = selected();
        sel.forEach((n) => sendToBack(n.id));
        if (sel.length) e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    canEdit,
    mode,
    pasteNodes,
    toggleLock,
    bringToFront,
    sendToBack,
    undo,
    redo,
  ]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!canEdit) return;
      setEdges((eds) => addEdge({ ...conn, id: crypto.randomUUID() }, eds));
    },
    [canEdit, setEdges],
  );

  // 뷰포트 중앙 좌표
  const centerPos = useCallback(
    () =>
      screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
    [screenToFlowPosition],
  );

  // 지정 좌표에 노드 생성
  const addNodeAt = useCallback(
    (
      type: FlowNodeKind,
      data: Record<string, unknown>,
      pos: { x: number; y: number },
      size?: { width: number; height: number },
    ) => {
      setNodes((nds) => [
        ...nds,
        {
          id: crypto.randomUUID(),
          type,
          position: pos,
          ...(size ? { width: size.width, height: size.height } : {}),
          data,
        },
      ]);
    },
    [setNodes],
  );

  const addNode = useCallback(
    (
      type: FlowNodeKind,
      data: Record<string, unknown>,
      size?: {
        width: number;
        height: number;
      },
    ) => {
      addNodeAt(type, data, centerPos(), size);
    },
    [centerPos, addNodeAt],
  );

  const addText = useCallback(
    () =>
      addNode(
        "text",
        { title: "", body: "", color: "#6366F1" },
        { width: 200, height: 90 },
      ),
    [addNode],
  );
  const addSticky = useCallback(
    () =>
      addNode(
        "sticky",
        { body: t("flow.newMemo", "메모"), color: "#f59e0b" },
        { width: 150, height: 64 },
      ),
    [addNode, t],
  );
  const addShape = useCallback(
    () =>
      addNode(
        "shape",
        { shape: "rectangle", label: "", color: "#6366F1" },
        { width: 140, height: 90 },
      ),
    [addNode],
  );

  // 이미지/영상 업로드 → URL → 노드 생성
  const triggerMedia = useCallback((kind: "image" | "video") => {
    pendingMediaRef.current = kind;
    if (fileInputRef.current) {
      fileInputRef.current.accept = kind === "image" ? "image/*" : "video/*";
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  // 파일 하나를 업로드 → 타입 판별 → 지정 좌표에 image/video 노드 생성
  // (팔레트 버튼·붙여넣기·드롭이 공유)
  const uploadAndAddMedia = useCallback(
    async (file: File, pos: { x: number; y: number }) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) return; // 지원 타입만
      try {
        // 업로드 전 원본 크기 측정 (실패 시 fallback 크기)
        const natural = isImage
          ? await getImageSize(file)
          : await getVideoSize(file);
        const scope = personal
          ? ({ personal: true } as const)
          : boardId
          ? { boardId }
          : { organizationId: orgId! };
        const { url } = await fileAPI.uploadNote(file, scope);
        if (isImage) {
          addNodeAt(
            "image",
            { url, caption: file.name },
            pos,
            fitMediaSize(natural, { width: 240, height: 180 }),
          );
        } else {
          addNodeAt(
            "video",
            { url, caption: file.name },
            pos,
            fitMediaSize(natural, { width: 280, height: 180 }),
          );
        }
      } catch (err) {
        console.error("Flow media upload failed:", err);
        toast.error(
          t(
            "flow.mediaUploadFailed",
            "미디어 업로드에 실패했습니다. 파일 크기나 형식을 확인해주세요.",
          ),
        );
      }
    },
    [addNodeAt, boardId, orgId, t],
  );

  // 여러 이미지를 정렬해 하나의 스프라이트(애니메이션) 노드로 생성
  const uploadAndAddSprite = useCallback(
    async (images: File[], pos: { x: number; y: number }) => {
      const imgs = images.filter((f) => f.type.startsWith("image/"));
      if (imgs.length === 0) return;
      // 프레임 순서 보장 — 파일명 자연 정렬 (idle0, idle1, idle10 …)
      const ordered = [...imgs].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
      try {
        const natural = await getImageSize(ordered[0]);
        const scope = personal
          ? ({ personal: true } as const)
          : boardId
          ? { boardId }
          : { organizationId: orgId! };
        const uploaded = await Promise.all(
          ordered.map((f) => fileAPI.uploadNote(f, scope)),
        );
        const frames = uploaded.map((u) => u.url).filter(Boolean);
        if (frames.length === 0) return;
        addNodeAt(
          "sprite",
          { frames, caption: ordered[0].name.replace(/\.[^.]+$/, ""), fps: 8 },
          pos,
          fitMediaSize(natural, { width: 240, height: 180 }),
        );
      } catch (err) {
        console.error("Flow sprite upload failed:", err);
        toast.error(
          t(
            "flow.mediaUploadFailed",
            "미디어 업로드에 실패했습니다. 파일 크기나 형식을 확인해주세요.",
          ),
        );
      }
    },
    [addNodeAt, boardId, orgId, t],
  );

  // 파일들을 각각 개별 노드로 배치 (살짝 어긋난 위치)
  const addMediaBatch = useCallback(
    async (files: File[], base: { x: number; y: number }) => {
      for (let i = 0; i < files.length; i++) {
        await uploadAndAddMedia(files[i], {
          x: base.x + i * 24,
          y: base.y + i * 24,
        });
      }
    },
    [uploadAndAddMedia],
  );

  // "묶기 vs 개별" 모달 결정 처리
  const resolveGroup = useCallback(
    async (asSprite: boolean) => {
      const g = pendingGroup;
      setPendingGroup(null);
      if (!g) return;
      if (asSprite) {
        await uploadAndAddSprite(g.images, g.pos);
        // 영상은 애니메이션에 묶이지 않으므로 개별 배치
        if (g.videos.length > 0)
          await addMediaBatch(g.videos, { x: g.pos.x + 40, y: g.pos.y + 40 });
      } else {
        await addMediaBatch([...g.images, ...g.videos], g.pos);
      }
    },
    [pendingGroup, uploadAndAddSprite, addMediaBatch],
  );

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      pendingMediaRef.current = null;
      if (files.length === 0) return;
      const base = centerPos();
      const images = files.filter((f) => f.type.startsWith("image/"));
      const videos = files.filter((f) => f.type.startsWith("video/"));
      // 이미지 2장 이상이면 묶기 여부를 먼저 묻는다
      if (images.length >= 2) {
        setPendingGroup({ images, videos, pos: base });
        return;
      }
      await addMediaBatch(files, base);
    },
    [addMediaBatch, centerPos],
  );

  // ── 파일 드래그 드롭 ────────────────────────────────────────
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!(canEdit && mode === "edit")) return;
      if (!Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [canEdit, mode],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!(canEdit && mode === "edit")) return;
      if (!Array.from(e.dataTransfer.types).includes("Files")) return;
      dragDepthRef.current += 1;
      setIsDraggingFile(true);
    },
    [canEdit, mode],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
      if (!(canEdit && mode === "edit")) return;
      const files = Array.from(e.dataTransfer.files || []).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
      );
      if (files.length === 0) return;
      e.preventDefault();
      // 놓은 지점을 캔버스 좌표로 변환
      const base = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const images = files.filter((f) => f.type.startsWith("image/"));
      const videos = files.filter((f) => f.type.startsWith("video/"));
      // 이미지 2장 이상이면 묶기 여부를 먼저 묻는다
      if (images.length >= 2) {
        setPendingGroup({ images, videos, pos: base });
        return;
      }
      await addMediaBatch(files, base);
    },
    [canEdit, mode, screenToFlowPosition, addMediaBatch],
  );

  // ── 클립보드 붙여넣기 (이미지) ──────────────────────────────
  useEffect(() => {
    if (!(canEdit && mode === "edit")) return;
    const onPaste = async (e: ClipboardEvent) => {
      // 텍스트 입력 편집 중이면 기본 붙여넣기에 양보
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const images: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length === 0) return;
      e.preventDefault();
      const base = centerPos();
      for (let i = 0; i < images.length; i++) {
        await uploadAndAddMedia(images[i], {
          x: base.x + i * 24,
          y: base.y + i * 24,
        });
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [canEdit, mode, centerPos, uploadAndAddMedia]);

  // 저장 (스냅샷 발행 + 버전 생성)
  const handleSave = useCallback(async () => {
    if (!canEdit || mode !== "edit") return;
    setSaving(true);
    try {
      const content = JSON.stringify(serialize(nodes, edges));
      await onSave(
        note.id,
        {
          title: title !== note.title ? title : undefined,
          content,
          tagIds: note.tags.map((tg) => tg.id),
        },
        true,
      );
      if (collaboration) collaboration.provider.sendFullState();
      setMode("view");
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    mode,
    nodes,
    edges,
    onSave,
    note.id,
    note.title,
    note.tags,
    title,
    collaboration,
  ]);

  const handleEnterEdit = useCallback(() => {
    if (!canEdit) return;
    setMode("edit");
  }, [canEdit]);

  const handleExitEdit = useCallback(() => {
    // 미발행 드래프트(Yjs)를 서버에 보존 — 다음 편집자가 이어서 편집
    if (collaboration) collaboration.provider.sendFullState();
    // 화면은 발행 스냅샷으로 되돌림 (view 모드 표시용)
    const { nodes: n, edges: e } = deserialize(note.content);
    setNodes(n);
    setEdges(e);
    setTitle(note.title);
    setMode("view");
  }, [collaboration, note.content, note.title, setNodes, setEdges]);

  // 단축키: H=손, V=선택, Cmd/Ctrl+S=저장
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      if (!canEdit || mode !== "edit") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.code === "KeyH") setInteractionMode("hand");
      else if (e.code === "KeyV") setInteractionMode("pointer");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canEdit, mode, handleSave]);

  const ctxValue = useMemo<FlowCtx>(
    () => ({
      canEdit: canEdit && mode === "edit",
      updateNodeData,
      recolorNode,
      cycleShape,
      deleteNode,
      commentTargetId,
      clearCommentTarget,
    }),
    [
      canEdit,
      mode,
      updateNodeData,
      recolorNode,
      cycleShape,
      deleteNode,
      commentTargetId,
      clearCommentTarget,
    ],
  );

  const editable = canEdit && mode === "edit";

  return (
    <FlowContext.Provider value={ctxValue}>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-foreground/[0.08] bg-bridge-obsidian flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <input
              value={title}
              onChange={(e) => {
                if (mode === "edit") setTitle(e.target.value);
              }}
              className="bg-transparent text-sm font-bold text-foreground focus:outline-none placeholder-slate-500 min-w-0 flex-1"
              placeholder={t("notes.titlePlaceholder", "제목을 입력하세요")}
              readOnly={mode !== "edit" || !canEdit}
            />
            {note.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {note.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    <TagIcon size={7} />
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
            <span className="text-xs text-slate-500 flex items-center gap-1 whitespace-nowrap flex-shrink-0 hidden sm:flex">
              <Clock size={9} />
              {formatDateTime(note.updated_at)}
            </span>
            {mode === "view" && editorPeers.length > 0 && (
              <span className="text-xs flex items-center gap-1 text-emerald-500 flex-shrink-0">
                <Users size={9} />
                {t("notes.editorsCount", {
                  count: editorPeers.length,
                  defaultValue: "{{count}}명 편집 중",
                })}
              </span>
            )}
            {mode === "view" && editorPeers.length === 0 && (
              <span className="text-xs flex items-center gap-1 text-slate-500 flex-shrink-0 hidden sm:flex">
                <Eye size={9} />
                {t("notes.viewMode", "읽기 모드")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {collaboration && mode === "edit" && (
              <CollabPresence
                status={collaboration.status}
                connectedUsers={editorPeers}
                currentUserName={currentUserName}
                currentUserColor={currentUserColor}
              />
            )}
            <NoteShareButton
              boardId={boardId}
              orgId={orgId}
              personal={personal}
              note={note}
              canEdit={canEdit}
              onNoteUpdate={onNoteUpdate}
            />
            {mode === "edit" && (
              <NoteTagManager
                boardId={boardId}
                orgId={orgId}
                personal={personal}
                noteId={note.id}
                noteTags={note.tags}
                allTags={tags}
                canEdit={canEdit}
                onSave={(tagIds) => onSave(note.id, { tagIds })}
                onTagsChange={onTagsChange}
              />
            )}
            {canEdit && mode === "edit" && (
              <NoteVersionHistory
                boardId={boardId}
                orgId={orgId}
                personal={personal}
                noteId={note.id}
                noteType={note.type}
                currentTitle={note.title}
                currentContent={note.content}
                versionCount={note.version_count}
                canEdit={canEdit}
                getLiveSnapshot={() => ({
                  title,
                  content: JSON.stringify(serialize(nodes, edges)),
                })}
                onRestore={async () => {
                  let updated;
                  if (personal) {
                    const { myNoteService } =
                      await import("../../utils/services");
                    updated = await myNoteService.getDetail("me", note.id);
                  } else if (boardId) {
                    const { noteService } =
                      await import("../../utils/services");
                    updated = await noteService.getDetail(boardId, note.id);
                  } else if (orgId) {
                    const { orgNoteService } =
                      await import("../../utils/services");
                    updated = await orgNoteService.getDetail(orgId, note.id);
                  }
                  if (!updated) return;
                  setTitle(updated.title);
                  onNoteUpdate?.(updated);
                  const { nodes: n, edges: e } = deserialize(updated.content);
                  setNodes(n);
                  setEdges(e);
                }}
              />
            )}
            {currentUser && (
              <button
                onClick={() => setShowComments(!showComments)}
                aria-label={t("notes.comments", "댓글")}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  showComments
                    ? "text-bridge-accent bg-bridge-accent/10"
                    : "text-slate-500 hover:text-foreground hover:bg-foreground/5"
                }`}
                title={t("notes.comments", "댓글")}
              >
                <MessageSquare size={14} />
              </button>
            )}
            {canEdit && mode === "view" && (
              <button
                onClick={handleEnterEdit}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20"
              >
                <Pencil size={12} />
                <span className="hidden sm:inline">
                  {t("notes.editButton", "편집")}
                </span>
              </button>
            )}
            {canEdit && mode === "edit" && (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-bridge-accent text-white hover:bg-bridge-accent/90 shadow-lg shadow-bridge-accent/20 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Save size={12} />
                  )}
                  <span className="hidden lg:inline">
                    {t("notes.saveSnapshot", "저장")}
                  </span>
                </button>
                <button
                  onClick={handleExitEdit}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10"
                >
                  <DoorOpen size={12} />
                  <span className="hidden lg:inline">
                    {t("notes.exitEdit", "편집 종료")}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div
          className={`flex-1 relative ${
            interactionMode === "pointer" ? "fl-pointer" : ""
          }`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* 파일 드롭 오버레이 */}
          {editable && isDraggingFile && (
            <div className="absolute inset-3 z-40 pointer-events-none rounded-2xl border-2 border-dashed border-bridge-accent/70 bg-bridge-accent/10 backdrop-blur-[1px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-bridge-accent">
                <ImageIcon className="w-8 h-8" />
                <span className="text-sm font-bold">
                  {t("flow.dropHere", "여기에 이미지·영상을 놓으세요")}
                </span>
              </div>
            </div>
          )}
          {/* 팔레트 툴바 (편집 모드) */}
          {editable && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-bridge-obsidian/85 backdrop-blur-md border border-foreground/[0.08] rounded-2xl px-2 py-1.5 shadow-2xl">
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-foreground/5 border border-foreground/10">
                <button
                  type="button"
                  onClick={() => setInteractionMode("hand")}
                  aria-label={t("flow.handTool", "손 도구") + " (H)"}
                  title={t("flow.handTool", "손 도구") + " (H)"}
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
                  aria-label={t("flow.pointerTool", "선택 도구") + " (V)"}
                  title={t("flow.pointerTool", "선택 도구") + " (V)"}
                  className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                    interactionMode === "pointer"
                      ? "bg-bridge-accent text-white"
                      : "text-slate-400 hover:text-foreground hover:bg-foreground/10"
                  }`}
                >
                  <MousePointer2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="w-px h-5 bg-foreground/10" />
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  aria-label={t("flow.undo", "되돌리기") + " (⌘Z)"}
                  title={t("flow.undo", "되돌리기") + " (⌘Z)"}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-foreground hover:bg-foreground/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  aria-label={t("flow.redo", "다시 실행") + " (⌘⇧Z)"}
                  title={t("flow.redo", "다시 실행") + " (⌘⇧Z)"}
                  className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-foreground hover:bg-foreground/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="w-px h-5 bg-foreground/10" />
              <PaletteBtn
                onClick={addText}
                icon={<Type className="w-3.5 h-3.5" />}
                label={t("flow.addText", "텍스트")}
              />
              <PaletteBtn
                onClick={addSticky}
                icon={<StickyNote className="w-3.5 h-3.5" />}
                label={t("flow.addSticky", "스티키")}
              />
              <PaletteBtn
                onClick={addShape}
                icon={<Square className="w-3.5 h-3.5" />}
                label={t("flow.addShape", "도형")}
              />
              <PaletteBtn
                onClick={() => triggerMedia("image")}
                icon={<ImageIcon className="w-3.5 h-3.5" />}
                label={t("flow.addImage", "이미지")}
              />
              <PaletteBtn
                onClick={() => triggerMedia("video")}
                icon={<VideoIcon className="w-3.5 h-3.5" />}
                label={t("flow.addVideo", "영상")}
              />
            </div>
          )}

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center text-slate-500">
                <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <div className="text-sm">
                  {editable
                    ? t(
                        "flow.empty",
                        "상단 팔레트에서 노드를 추가해 시작하세요",
                      )
                    : t("flow.emptyReadOnly", "아직 플로우가 비어 있습니다")}
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
            onNodeContextMenu={editable ? handleNodeContextMenu : undefined}
            onPaneContextMenu={editable ? handlePaneContextMenu : undefined}
            nodeTypes={nodeTypes}
            colorMode="dark"
            fitView
            minZoom={0.1}
            maxZoom={8}
            nodesDraggable={editable}
            nodesConnectable={editable}
            elementsSelectable={editable}
            panOnDrag={interactionMode === "hand" ? true : [1, 2]}
            selectionOnDrag={editable && interactionMode === "pointer"}
            selectionMode={SelectionMode.Partial}
            deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
            defaultEdgeOptions={{
              markerEnd: { type: "arrowclosed" as any, color: "#6366F1" },
              style: { stroke: "#6366F1", strokeWidth: 2 },
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
                (n.data as { color?: string }).color ||
                (n.type === "video" ? "#f472b6" : "#6366F1")
              }
              maskColor="rgba(13,17,26,0.6)"
            />
          </ReactFlow>
        </div>

        {/* Comments */}
        {currentUser && showComments && (
          <div className="border-t border-foreground/[0.08] bg-bridge-obsidian flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/[0.08]">
              <span className="text-xs font-bold text-foreground">
                {t("notes.comments", "댓글")}
              </span>
              <IconButton
                onClick={() => setShowComments(false)}
                aria-label="댓글 닫기"
              >
                <ChevronDown />
              </IconButton>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              <NoteBottomComments
                boardId={boardId}
                orgId={orgId}
                personal={personal}
                noteId={note.id}
                currentUserId={currentUser.id}
                canEdit={canEdit}
              />
            </div>
          </div>
        )}
      </div>

      {/* 미디어 업로드용 숨김 input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* 여러 이미지: 묶기(애니메이션) vs 개별 선택 모달 */}
      {pendingGroup && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setPendingGroup(null)}
        >
          <div
            className="w-full max-w-md bg-bridge-obsidian rounded-2xl border border-foreground/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
            <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
              <div className="text-sm font-bold text-foreground">
                {t("flow.groupImagesTitle", "이미지 추가 방식")}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {t("flow.groupImagesDesc", {
                  defaultValue: "{{count}}장의 이미지를 어떻게 넣을까요?",
                  count: pendingGroup.images.length,
                })}
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => resolveGroup(true)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] hover:border-bridge-secondary/60 hover:bg-bridge-secondary/10 transition-colors"
              >
                <Film className="w-7 h-7 text-bridge-secondary" />
                <span className="text-xs font-bold text-foreground">
                  {t("flow.groupAsAnimation", "묶어서 (애니메이션)")}
                </span>
                <span className="text-[11px] text-slate-500 text-center leading-snug">
                  {t("flow.groupAsAnimationHint", "GIF처럼 한 노드에서 재생")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => resolveGroup(false)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-foreground/10 bg-foreground/[0.03] hover:border-bridge-accent/60 hover:bg-bridge-accent/10 transition-colors"
              >
                <ImageIcon className="w-7 h-7 text-bridge-accent" />
                <span className="text-xs font-bold text-foreground">
                  {t("flow.addSeparately", "개별로 추가")}
                </span>
                <span className="text-[11px] text-slate-500 text-center leading-snug">
                  {t("flow.addSeparatelyHint", "각각 별도 노드로")}
                </span>
              </button>
            </div>
            <div className="flex items-center justify-end px-5 py-3 border-t border-foreground/[0.08]">
              <button
                type="button"
                onClick={() => setPendingGroup(null)}
                className="text-xs text-slate-400 hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
              >
                {t("common.cancel", "취소")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컨텍스트 메뉴 */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-[199]"
            onMouseDown={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="fixed z-[200] min-w-[212px] p-1.5 rounded-xl border border-foreground/[0.14] bg-bridge-obsidian/95 backdrop-blur shadow-2xl shadow-black/60"
            style={{
              left: Math.min(menu.x, window.innerWidth - 232),
              top: Math.min(menu.y, window.innerHeight - 340),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(() => {
              const hasClip = !!clipboardRef.current?.length;
              const flowPos = screenToFlowPosition({ x: menu.x, y: menu.y });
              if (!menu.nodeId) {
                return (
                  <MenuItem
                    icon={ClipboardPaste}
                    label={t("flow.menu.pasteHere", "여기에 붙여넣기")}
                    kbd="⌘V"
                    disabled={!hasClip}
                    onClick={() => {
                      pasteNodes(flowPos);
                      setMenu(null);
                    }}
                  />
                );
              }
              const id = menu.nodeId;
              const node = nodes.find((n) => n.id === id);
              const locked = !!(node?.data as { locked?: boolean })?.locked;
              return (
                <>
                  <MenuItem
                    icon={locked ? Unlock : Lock}
                    label={
                      locked
                        ? t("flow.menu.unlock", "잠금 해제")
                        : t("flow.menu.lock", "잠금")
                    }
                    kbd="⌘⇧L"
                    onClick={() => {
                      toggleLock(id);
                      setMenu(null);
                    }}
                  />
                  <div className="h-px bg-foreground/[0.08] mx-1 my-1" />
                  <MenuItem
                    icon={BringToFront}
                    label={t("flow.menu.front", "앞으로 가져오기")}
                    kbd="⌘]"
                    disabled={locked}
                    onClick={() => {
                      bringToFront(id);
                      setMenu(null);
                    }}
                  />
                  <MenuItem
                    icon={SendToBack}
                    label={t("flow.menu.back", "뒤로 보내기")}
                    kbd="⌘["
                    disabled={locked}
                    onClick={() => {
                      sendToBack(id);
                      setMenu(null);
                    }}
                  />
                  <div className="h-px bg-foreground/[0.08] mx-1 my-1" />
                  <MenuItem
                    icon={Copy}
                    label={t("flow.menu.copy", "복사")}
                    kbd="⌘C"
                    onClick={() => {
                      copyNodes([id]);
                      setMenu(null);
                    }}
                  />
                  <MenuItem
                    icon={ClipboardPaste}
                    label={t("flow.menu.paste", "붙여넣기")}
                    kbd="⌘V"
                    disabled={!hasClip}
                    onClick={() => {
                      pasteNodes();
                      setMenu(null);
                    }}
                  />
                  <MenuItem
                    icon={MessageCircle}
                    label={t("flow.menu.comment", "코멘트 달기")}
                    onClick={() => {
                      requestComment(id);
                      setMenu(null);
                    }}
                  />
                  <div className="h-px bg-foreground/[0.08] mx-1 my-1" />
                  <MenuItem
                    icon={Trash2}
                    label={t("flow.menu.delete", "삭제")}
                    kbd="⌫"
                    danger
                    disabled={locked}
                    onClick={() => {
                      deleteNode(id);
                      setMenu(null);
                    }}
                  />
                </>
              );
            })()}
          </div>
        </>
      )}

      <style>{`
        .react-flow__handle.fl-handle{
          width:9px;height:9px;background:#6366F1;border:2px solid #151B28;opacity:0;transition:opacity .15s;
        }
        .react-flow .react-flow__node:hover .fl-handle{opacity:1}
        .fl-pointer .react-flow__pane{cursor:crosshair}
        .react-flow__edge:hover .react-flow__edge-path{
          stroke:rgba(99,102,241,0.85)!important;cursor:pointer;
        }
        .react-flow__edge.selected .react-flow__edge-path{
          stroke:#2DD4BF!important;stroke-width:3!important;
          filter:drop-shadow(0 0 5px rgba(45,212,191,0.75));
        }
      `}</style>
    </FlowContext.Provider>
  );
}

function PaletteBtn({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg text-slate-300 hover:text-foreground hover:bg-foreground/10 transition-colors"
      title={label}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

export default function FlowEditor(props: FlowEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}

// ────────────────────────────────────────────────────────────
// 읽기 전용 뷰 (공유 페이지 등) — note.content 스냅샷을 그대로 렌더
// ────────────────────────────────────────────────────────────
function FlowReadOnlyCanvas({
  content,
  isDark = true,
}: {
  content: string | null;
  isDark?: boolean;
}) {
  const { nodes, edges } = useMemo(() => deserialize(content), [content]);
  const ctx = useMemo<FlowCtx>(
    () => ({
      canEdit: false,
      updateNodeData: () => {},
      recolorNode: () => {},
      cycleShape: () => {},
      deleteNode: () => {},
      commentTargetId: null,
      clearCommentTarget: () => {},
    }),
    [],
  );
  return (
    <FlowContext.Provider value={ctx}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={isDark ? "dark" : "light"}
        fitView
        minZoom={0.1}
        maxZoom={8}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          markerEnd: { type: "arrowclosed" as any, color: "#6366F1" },
          style: { stroke: "#6366F1", strokeWidth: 2 },
        }}
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
            (n.data as { color?: string }).color ||
            (n.type === "video" ? "#f472b6" : "#6366F1")
          }
          maskColor="rgba(13,17,26,0.6)"
        />
      </ReactFlow>
    </FlowContext.Provider>
  );
}

export function FlowReadOnly({
  content,
  isDark = true,
}: {
  content: string | null;
  isDark?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <FlowReadOnlyCanvas content={content} isDark={isDark} />
    </ReactFlowProvider>
  );
}
