import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { sprintAPI } from "../utils/api";
import type {
  SprintBoard as SprintBoardData,
  SprintColumn,
  SprintItemCard,
} from "../types";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { formatDate } from "../utils/dateUtils";

interface SprintBoardProps {
  boardId: string;
  milestones: { id: string; title: string }[];
  canEdit: boolean;
  isAdminOrOwner: boolean;
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

export function SprintBoard({
  boardId,
  milestones,
  canEdit,
  isAdminOrOwner,
}: SprintBoardProps) {
  const [milestoneId, setMilestoneId] = useState<string>(
    milestones[0]?.id ?? "",
  );
  const [board, setBoard] = useState<SprintBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collapsedFeatures, setCollapsedFeatures] = useState<Set<string>>(
    new Set(),
  );
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editColName, setEditColName] = useState("");
  const busyRef = useRef(false);

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
      setError(
        e instanceof Error ? e.message : "스프린트를 불러오지 못했습니다",
      );
    } finally {
      setLoading(false);
    }
  }, [boardId, milestoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!milestoneId && milestones[0]?.id) setMilestoneId(milestones[0].id);
  }, [milestones, milestoneId]);

  // 뮤테이션 헬퍼 — 반환된 최신 보드로 즉시 교체
  const run = useCallback(async (fn: () => Promise<SprintBoardData>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const data = await fn();
      setBoard(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "작업에 실패했습니다");
    } finally {
      busyRef.current = false;
    }
  }, []);

  const activeSprint = board?.active_sprint ?? null;
  const columns = useMemo(
    () =>
      (board?.columns ?? []).slice().sort((a, b) => a.position - b.position),
    [board],
  );

  // 소스 트리: backlog + 모든 컬럼 아이템을 합쳐 Feature ▸ Task ▸ 체크리스트로 재구성
  const tree = useMemo<TreeFeature[]>(() => {
    if (!board) return [];
    const all: SprintItemCard[] = [
      ...board.backlog,
      ...board.columns.flatMap((c) => c.items),
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
  }, [board]);

  const toggleFeature = (fid: string) => {
    setCollapsedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
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

  const gauge = board?.gauge;
  const canClose =
    isAdminOrOwner && !!gauge && gauge.total > 0 && gauge.percentage === 100;

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

  return (
    <div className="flex flex-col h-full">
      {/* 상단 컨트롤 바 */}
      <div className="shrink-0 px-4 md:px-6 py-3 border-b border-foreground/[0.08] bg-bridge-obsidian">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 마일스톤 드롭다운 */}
          <div className="relative">
            <select
              value={milestoneId}
              onChange={(e) => setMilestoneId(e.target.value)}
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

          {/* 스프린트 타임라인 칩 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(board?.sprints ?? []).map((s) => {
              const isActive = s.status === "ACTIVE";
              const onClick =
                !isActive && isAdminOrOwner
                  ? () => {
                      if (window.confirm(`${s.name}을(를) 재활성화할까요?`))
                        void run(() =>
                          sprintAPI.reactivateSprint(boardId, s.id),
                        );
                    }
                  : undefined;
              return (
                <button
                  key={s.id}
                  onClick={onClick}
                  disabled={!onClick}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                    isActive
                      ? "bg-bridge-accent/15 text-bridge-accent"
                      : "bg-foreground/[0.05] text-slate-400 " +
                        (onClick
                          ? "hover:bg-foreground/10 cursor-pointer"
                          : "cursor-default")
                  }`}
                  title={isActive ? "진행 중" : "아카이브"}
                >
                  {s.name}
                  {isActive && (
                    <span className="ml-1.5 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-bridge-secondary animate-pulse" />
                      진행중
                    </span>
                  )}
                  {!isActive && ` ${s.progress_percentage}%`}
                </button>
              );
            })}
          </div>

          {/* 종료 버튼 */}
          {activeSprint && isAdminOrOwner && (
            <button
              onClick={closeSprint}
              disabled={!canClose}
              className={`ml-auto px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
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
              스프린트 종료
            </button>
          )}
        </div>

        {/* 스코프 게이지 */}
        {activeSprint && gauge && (
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
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </div>

      {/* 스플릿: 좌 소스 트리 / 우 스프린트 보드 */}
      <div className="flex-1 min-h-0 flex">
        {/* 좌: 소스 트리 */}
        <aside className="w-[300px] shrink-0 border-r border-foreground/[0.08] flex flex-col bg-bridge-dark">
          <div className="px-4 py-2.5 border-b border-foreground/[0.06] flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Feature ▸ Task ▸ 체크리스트
            </span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
            {tree.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-8">
                항목이 없습니다.
              </p>
            )}
            {tree.map((feat) => {
              const collapsed = collapsedFeatures.has(feat.featureId);
              return (
                <div
                  key={feat.featureId}
                  className="rounded-xl border border-foreground/[0.06] bg-bridge-obsidian overflow-hidden"
                >
                  <button
                    onClick={() => toggleFeature(feat.featureId)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-foreground/5 transition-colors"
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
                    <span className="text-xs font-bold text-foreground truncate flex-1 text-left">
                      {feat.featureTitle}
                    </span>
                    <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                      {feat.taken}/{feat.total}
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="px-2 pb-2 space-y-2">
                      {feat.tasks.map((task) => (
                        <div
                          key={task.taskId}
                          className="rounded-lg border border-foreground/[0.06] bg-bridge-dark"
                        >
                          <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-foreground/[0.05]">
                            <span className="text-[11px] font-medium text-slate-300 truncate">
                              {task.taskTitle}
                            </span>
                          </div>
                          <div className="p-1.5 space-y-1">
                            {task.items.map((it) => {
                              const taken = !!it.sprint_column_id;
                              return (
                                <div
                                  key={it.id}
                                  draggable={canEdit && !taken}
                                  onDragStart={(e) =>
                                    onDragStartItem(e, it, "backlog")
                                  }
                                  className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] border transition-colors ${
                                    taken
                                      ? "opacity-45 border-transparent bg-foreground/[0.02]"
                                      : "border-foreground/[0.06] bg-bridge-surface hover:border-bridge-border cursor-grab"
                                  }`}
                                >
                                  {!taken && (
                                    <GripVertical className="w-3 h-3 text-slate-600 shrink-0" />
                                  )}
                                  <span
                                    className={`w-3 h-3 rounded-[4px] shrink-0 border ${
                                      it.completed
                                        ? "bg-bridge-secondary border-bridge-secondary"
                                        : "border-slate-500"
                                    }`}
                                  />
                                  <span
                                    className={`flex-1 truncate text-foreground ${
                                      it.completed
                                        ? "line-through text-slate-500"
                                        : ""
                                    }`}
                                  >
                                    {it.title}
                                  </span>
                                  {taken ? (
                                    <span className="text-[9px] font-bold text-bridge-secondary bg-bridge-secondary/15 rounded px-1.5 py-0.5 shrink-0">
                                      담김
                                    </span>
                                  ) : it.assignee ? (
                                    <span
                                      className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold text-white shrink-0"
                                      style={{
                                        background: getAssigneeHex(
                                          it.assignee.name,
                                        ),
                                      }}
                                    >
                                      {getInitials(it.assignee.name)}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* 우: 동적 컬럼 보드 */}
        <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar">
          {!activeSprint ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              진행 중인 스프린트가 없습니다.
            </div>
          ) : (
            <div className="flex gap-3 p-3 md:p-4 h-full min-w-max">
              {columns.map((col) => {
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
                      {col.items.map((it) => (
                        <div
                          key={it.id}
                          draggable={canEdit}
                          onDragStart={(e) => onDragStartItem(e, it, "sprint")}
                          className="group rounded-xl border border-foreground/[0.08] bg-bridge-dark p-2.5 space-y-2 hover:border-bridge-border transition-colors cursor-grab"
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
                            {canEdit && (
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
                              it.completed
                                ? "line-through text-slate-500"
                                : "text-foreground"
                            }`}
                          >
                            {it.title}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            {it.task_title && (
                              <span className="truncate">{it.task_title}</span>
                            )}
                            <div className="ml-auto flex items-center gap-1.5 shrink-0">
                              {it.due_date && (
                                <span className="tabular-nums">
                                  {formatDate(it.due_date)}
                                </span>
                              )}
                              {it.completed ? (
                                <span className="inline-flex items-center gap-0.5 text-bridge-secondary font-bold">
                                  <Check className="w-3 h-3" /> 완료
                                </span>
                              ) : it.assignee ? (
                                <span
                                  className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold text-white"
                                  style={{
                                    background: getAssigneeHex(
                                      it.assignee.name,
                                    ),
                                  }}
                                >
                                  {getInitials(it.assignee.name)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
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
    </div>
  );
}
