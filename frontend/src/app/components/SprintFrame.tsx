import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  ArrowRight,
  Check,
  CornerUpLeft,
  GripVertical,
  ChevronRight,
  Search,
} from "lucide-react";
import { sprintAPI } from "../utils/api";
import { formatDate, getTodayDateString } from "../utils/dateUtils";
import type {
  SprintBoard,
  SprintInfo,
  SprintItemCard,
  SprintStage,
} from "../types";

interface SprintFrameProps {
  boardId: string;
  milestones: { id: string; title: string }[];
  canEdit: boolean;
  isAdminOrOwner: boolean;
}

const STAGE_LABEL: Record<Exclude<SprintStage, "DONE"> | "DONE", string> = {
  SPRINT: "Sprint",
  REVIEW: "In Review",
  DONE: "Done",
};

const AVATAR_COLORS = [
  "#6366F1",
  "#2DD4BF",
  "#f43f5e",
  "#d97706",
  "#8b5cf6",
  "#10b981",
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// 마감일 → 오늘 기준 D-day 칩 (색상 구분)
function dueChip(due: string): { cls: string; txt: string } {
  const iso = due.slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return { cls: "far", txt: formatDate(due) };
  const target = new Date(y, m - 1, d);
  const today = new Date(getTodayDateString() + "T00:00:00");
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  const label = `${m}/${d}`;
  if (days < 0) return { cls: "over", txt: `${label} · D+${-days}` };
  if (days === 0) return { cls: "soon", txt: `${label} · D-day` };
  if (days <= 3) return { cls: "soon", txt: `${label} · D-${days}` };
  return { cls: "far", txt: `${label} · D-${days}` };
}

const DUE_CLASS: Record<string, string> = {
  far: "text-slate-400 bg-foreground/[0.06]",
  soon: "text-amber-500 bg-amber-500/15",
  over: "text-rose-500 bg-rose-500/15",
};

export function SprintFrame({
  boardId,
  milestones,
  canEdit,
  isAdminOrOwner,
}: SprintFrameProps) {
  const [milestoneId, setMilestoneId] = useState<string>(
    milestones[0]?.id ?? "",
  );
  const [board, setBoard] = useState<SprintBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<SprintStage | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [archiveView, setArchiveView] = useState<SprintInfo | null>(null);
  const [archiveItems, setArchiveItems] = useState<SprintItemCard[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [backlogQuery, setBacklogQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const toggleGroup = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const load = useCallback(async () => {
    if (!milestoneId) return;
    setLoading(true);
    setError(null);
    try {
      setBoard(await sprintAPI.getSprintBoard(boardId, milestoneId));
    } catch (e) {
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

  // 아카이브 열람 모달: 담겼던 항목 로드
  useEffect(() => {
    if (!archiveView) {
      setArchiveItems([]);
      return;
    }
    let cancelled = false;
    setArchiveLoading(true);
    sprintAPI
      .getSprintItems(boardId, archiveView.id)
      .then((items) => {
        if (!cancelled) setArchiveItems(items);
      })
      .catch(() => {
        if (!cancelled) setArchiveItems([]);
      })
      .finally(() => {
        if (!cancelled) setArchiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [archiveView, boardId]);

  const run = useCallback(
    async (fn: () => Promise<SprintBoard>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        setBoard(await fn());
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "처리 중 오류가 발생했습니다",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const activeSprintId = board?.active_sprint?.id ?? null;

  const take = (itemId: string) =>
    activeSprintId &&
    run(() => sprintAPI.addItem(boardId, activeSprintId, itemId));
  const remove = (itemId: string) =>
    activeSprintId &&
    run(() => sprintAPI.removeItem(boardId, activeSprintId, itemId));
  const move = (itemId: string, stage: SprintStage) =>
    run(() => sprintAPI.moveStage(boardId, itemId, stage));
  const setMode = (enabled: boolean) =>
    run(() => sprintAPI.toggleSprintMode(boardId, milestoneId, enabled));
  const closeSprint = (sprintId: string) =>
    run(() => sprintAPI.closeSprint(boardId, sprintId));
  const reactivate = (sprintId: string) =>
    run(() => sprintAPI.reactivateSprint(boardId, sprintId));
  const cancelReactivation = (sprintId: string) =>
    run(() => sprintAPI.cancelReactivation(boardId, sprintId));
  const resume = (itemId: string) =>
    run(() => sprintAPI.resumeItem(boardId, itemId));

  const canClose =
    !!board?.active_sprint &&
    board.gauge.total > 0 &&
    board.gauge.percentage === 100;

  // 재활성화 상태 = 활성 스프린트보다 시퀀스가 큰(더 최신) 스프린트가 보관 중
  const isReactivated =
    !!board?.active_sprint &&
    board.sprints.some(
      (s) => s.sequence_no > (board.active_sprint?.sequence_no ?? 0),
    );

  // ---------- render helpers ----------
  const renderCard = (item: SprintItemCard) => {
    const isDone = item.sprint_stage === "DONE";
    return (
      <div
        key={item.id}
        draggable={canEdit && !busy}
        onDragStart={() => setDragId(item.id)}
        onDragEnd={() => {
          setDragId(null);
          setDragOverStage(null);
        }}
        className={`group rounded-xl border border-foreground/[0.08] bg-bridge-obsidian p-2.5 shadow-sm transition-colors ${
          canEdit ? "cursor-grab active:cursor-grabbing" : ""
        } ${dragId === item.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          {canEdit && (
            <GripVertical className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <span
            className="w-1.5 h-1.5 rounded-sm shrink-0"
            style={{ background: item.feature_color ?? "#6366F1" }}
          />
          <span className="truncate">
            {item.feature_title ?? "—"}
            {item.task_title ? (
              <>
                {" "}
                <span className="opacity-50">›</span> {item.task_title}
              </>
            ) : null}
          </span>
        </div>
        <div className="mt-1 text-[13px] font-medium text-foreground">
          {item.title}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {item.assignee ? (
            <span
              className="w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold text-white"
              style={{ background: avatarColor(item.assignee.name) }}
              title={item.assignee.name}
            >
              {item.assignee.name.slice(0, 1)}
            </span>
          ) : (
            <span className="w-5 h-5 rounded-full border border-dashed border-foreground/20" />
          )}
          {item.due_date && (
            <span className="text-[10.5px] font-medium text-slate-500 tabular-nums">
              {formatDate(item.due_date)}
            </span>
          )}
          {canEdit && (
            <span className="ml-auto flex items-center gap-1">
              {isDone ? (
                <span
                  className="w-6 h-6 rounded-lg grid place-items-center bg-emerald-500 text-white"
                  title="완료됨 · 되돌리려면 Review로 드래그"
                >
                  <Check className="w-3.5 h-3.5" />
                </span>
              ) : (
                <button
                  onClick={() => move(item.id, "DONE")}
                  disabled={busy}
                  className="w-6 h-6 rounded-lg grid place-items-center border border-foreground/10 text-slate-400 hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
                  title="완료 체크 → Done"
                  aria-label="완료 체크"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => remove(item.id)}
                disabled={busy}
                className="w-6 h-6 rounded-lg grid place-items-center border border-foreground/10 text-slate-400 hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
                title="백로그로 빼기"
                aria-label="백로그로 빼기"
              >
                <CornerUpLeft className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderColumn = (stage: SprintStage, items: SprintItemCard[]) => {
    const dotColor =
      stage === "SPRINT"
        ? "#6366F1"
        : stage === "REVIEW"
          ? "#d97706"
          : "#10b981";
    return (
      <div
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          setDragOverStage(stage);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setDragOverStage(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId) move(dragId, stage);
          setDragId(null);
          setDragOverStage(null);
        }}
        className={`flex flex-col min-h-[200px] rounded-xl border bg-foreground/[0.02] transition-colors ${
          dragOverStage === stage
            ? "border-bridge-accent bg-bridge-accent/10"
            : "border-foreground/[0.08]"
        }`}
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: dotColor }}
          />
          <span className="text-xs font-bold text-foreground">
            {STAGE_LABEL[stage]}
          </span>
          <span className="ml-auto text-[11px] font-bold text-slate-400 tabular-nums bg-foreground/[0.06] px-2 rounded-full">
            {items.length}
          </span>
        </div>
        <div className="flex flex-col gap-2 px-2 pb-2.5">
          {items.length === 0 ? (
            <div className="text-[11.5px] text-slate-500 text-center py-5 border border-dashed border-foreground/10 rounded-lg m-1">
              {stage === "SPRINT" ? "← 백로그에서 담기" : "비어 있음"}
            </div>
          ) : (
            items.map(renderCard)
          )}
        </div>
      </div>
    );
  };

  // ---------- states ----------
  if (milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
        <p className="text-sm">먼저 마일스톤을 만들어 주세요.</p>
      </div>
    );
  }

  const allBacklog = board?.backlog ?? [];
  const takeableCount = allBacklog.filter((i) => !i.completed).length;
  const q = backlogQuery.trim().toLowerCase();
  const filteredBacklog = q
    ? allBacklog.filter((i) =>
        `${i.title} ${i.task_title ?? ""} ${i.feature_title ?? ""}`
          .toLowerCase()
          .includes(q),
      )
    : allBacklog;
  const backlogByFeature = groupByFeature(filteredBacklog);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-4 md:px-6 py-4">
      {/* 헤더: 마일스톤 선택 + 스프린트 토글 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className="bg-foreground/[0.03] border border-foreground/10 rounded-lg px-3 py-1.5 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        {board?.sprint_enabled && board.active_sprint && (
          <span className="text-xs font-bold px-2 py-1 rounded-full bg-bridge-accent/15 text-bridge-accent">
            {board.active_sprint.name} · 진행 중
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {busy && (
            <Loader2 className="w-4 h-4 animate-spin text-bridge-accent" />
          )}
          {board?.sprint_enabled && isAdminOrOwner && (
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "스프린트 모드를 끄면 담긴 카드가 백로그로 병합되고 스프린트 기록이 사라집니다. 계속할까요?",
                  )
                )
                  setMode(false);
              }}
              disabled={busy}
              className="text-xs text-slate-400 hover:text-foreground hover:bg-foreground/5 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              스프린트 끄기
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading && !board ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
        </div>
      ) : !board?.sprint_enabled ? (
        // 스프린트 비활성 상태
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
          <div>
            <p className="text-sm font-bold text-foreground">
              이 마일스톤은 스프린트로 나뉘어 있지 않습니다
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              스프린트를 켜면 Sprint · In Review · Done을 하나의 프레임으로 묶어
              완료할수록 채워지는 스코프 게이지로 관리합니다.
            </p>
          </div>
          {isAdminOrOwner ? (
            <button
              onClick={() => setMode(true)}
              disabled={busy}
              className="px-5 py-2.5 bg-bridge-accent text-white rounded-xl font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-40"
            >
              스프린트로 나누기
            </button>
          ) : (
            <p className="text-xs text-slate-500">
              관리자가 스프린트를 활성화할 수 있습니다.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
          {/* Task 백로그 */}
          <div
            onDragOver={(e) => {
              if (dragId) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) remove(dragId);
              setDragId(null);
              setDragOverStage(null);
            }}
            className="rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-foreground/[0.08]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  Task · 공통 백로그
                </span>
                <span className="ml-auto text-[11px] font-bold text-slate-400 bg-foreground/[0.06] px-2 py-0.5 rounded-full tabular-nums">
                  담기 가능 {takeableCount}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                피처 › 태스크 › 항목 · 담기로 스프린트에
              </div>
              <div className="mt-2.5 flex items-center gap-2 bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5 py-1.5">
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  value={backlogQuery}
                  onChange={(e) => setBacklogQuery(e.target.value)}
                  placeholder="항목·태스크 검색"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-foreground placeholder-slate-500"
                />
              </div>
            </div>
            <div className="p-2.5 flex flex-col gap-2 max-h-[560px] overflow-y-auto custom-scrollbar">
              {backlogByFeature.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-8">
                  {q ? "검색 결과가 없습니다." : "담을 수 있는 항목이 없습니다."}
                </div>
              ) : (
                backlogByFeature.map((grp) => {
                  const isOpen = q ? true : !collapsedGroups.has(grp.featureId);
                  const doneN = grp.items.filter((i) => i.completed).length;
                  const totalN = grp.items.length;
                  const pct = totalN
                    ? Math.round((doneN / totalN) * 100)
                    : 0;
                  return (
                    <div
                      key={grp.featureId}
                      className="shrink-0 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden"
                    >
                      <button
                        onClick={() => toggleGroup(grp.featureId)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-foreground/[0.03] transition-colors"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: grp.color ?? "#6366F1" }}
                        />
                        <span className="text-[13px] font-bold text-foreground truncate min-w-0">
                          {grp.featureTitle}
                        </span>
                        <span className="ml-auto flex items-center gap-2 shrink-0">
                          <span className="w-10 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                            <span
                              className="block h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="text-[11px] font-bold text-slate-400 tabular-nums">
                            {doneN}/{totalN}
                          </span>
                          <ChevronRight
                            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                        </span>
                      </button>
                      {isOpen && (
                        <ul className="p-1.5 flex flex-col gap-0.5 border-t border-foreground/[0.08]">
                          {grp.items.map((it) => {
                            const dm = it.due_date
                              ? dueChip(it.due_date)
                              : null;
                            return (
                              <li
                                key={it.id}
                                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-foreground/5"
                              >
                                <span
                                  className={`w-4 h-4 rounded grid place-items-center shrink-0 ${
                                    it.completed
                                      ? "bg-emerald-500 text-white"
                                      : "border border-foreground/20"
                                  }`}
                                >
                                  {it.completed && (
                                    <Check className="w-3 h-3" />
                                  )}
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span
                                    className={`block text-[13px] truncate ${
                                      it.completed
                                        ? "text-slate-400 line-through"
                                        : "text-foreground"
                                    }`}
                                  >
                                    {it.title}
                                  </span>
                                  {it.task_title && (
                                    <span className="block text-[10.5px] text-slate-500 truncate">
                                      {it.task_title}
                                    </span>
                                  )}
                                </span>
                                {dm && (
                                  <span
                                    className={`shrink-0 text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums ${DUE_CLASS[dm.cls]}`}
                                  >
                                    {dm.txt}
                                  </span>
                                )}
                                {it.completed ? (
                                  <span className="shrink-0 text-[10.5px] font-bold text-emerald-500 bg-emerald-500/15 px-2 py-0.5 rounded-full whitespace-nowrap">
                                    ✓ 완료
                                  </span>
                                ) : (
                                  canEdit && (
                                    <button
                                      onClick={() => take(it.id)}
                                      disabled={busy}
                                      className="shrink-0 text-[11.5px] font-bold px-2 py-1 rounded-lg border border-bridge-accent bg-bridge-accent/15 text-bridge-accent hover:bg-bridge-accent hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap inline-flex items-center gap-1"
                                    >
                                      담기 <ArrowRight className="w-3 h-3" />
                                    </button>
                                  )
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 스프린트 프레임 */}
          <div className="rounded-2xl border border-foreground/[0.08] bg-bridge-obsidian overflow-hidden">
            {/* 타임라인 + 종료 */}
            <div className="flex items-center gap-2 px-4 pt-3 flex-wrap">
              {board.sprints.map((s) => {
                const isActive = board.active_sprint?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (!isActive) setArchiveView(s);
                    }}
                    title={
                      isActive
                        ? "현재 활성 스프린트"
                        : "클릭해서 열람 / 재활성화"
                    }
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                      isActive
                        ? "border-bridge-accent bg-bridge-accent/15 text-bridge-accent"
                        : "border-foreground/10 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive ? "bg-bridge-accent" : "bg-emerald-500"
                      }`}
                    />
                    {s.name} ·{" "}
                    {isActive ? "진행 중" : `${s.progress_percentage}%`}
                  </button>
                );
              })}
              {isAdminOrOwner && board.active_sprint && (
                <div className="ml-auto flex items-center gap-2">
                  {isReactivated && (
                    <button
                      onClick={() =>
                        board.active_sprint &&
                        cancelReactivation(board.active_sprint.id)
                      }
                      disabled={busy}
                      title="원래 동결 기록으로 되돌리기"
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-500 text-amber-500 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
                    >
                      재활성화 취소
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmClose(true)}
                    disabled={!canClose || busy}
                    title={
                      canClose
                        ? "완료율 동결 후 종료"
                        : "모든 카드가 Done이어야 종료할 수 있습니다"
                    }
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isReactivated ? "재동결" : "스프린트 종료"}
                  </button>
                </div>
              )}
            </div>
            {/* 스코프 게이지 */}
            <div className="p-4 border-b border-foreground/[0.08]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-bridge-secondary">
                  <Check className="w-3.5 h-3.5" /> 스코프 게이지
                </div>
                <span className="text-xs text-slate-500">
                  담긴 항목 중 Done 비율 (Done 포함)
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-bold text-bridge-secondary tabular-nums">
                  {board.gauge.percentage}%
                </span>
                <span className="text-xs text-slate-400 tabular-nums">
                  {board.gauge.done} / {board.gauge.total}
                </span>
              </div>
              <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all duration-500"
                  style={{ width: `${board.gauge.percentage}%` }}
                />
              </div>
            </div>

            {/* 3컬럼 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3">
              {renderColumn("SPRINT", board.columns.sprint)}
              {renderColumn("REVIEW", board.columns.review)}
              {renderColumn("DONE", board.columns.done)}
            </div>
          </div>
        </div>
      )}

      {/* 종료 확인 모달 */}
      {confirmClose && board?.active_sprint && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setConfirmClose(false)}
        >
          <div
            className="w-full max-w-md bg-bridge-obsidian border border-foreground/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
            <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
              <h3 className="text-base font-bold text-foreground">
                {board.active_sprint.name} 종료
              </h3>
            </div>
            <div className="px-5 pb-5 pt-4">
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-500 tabular-nums">
                    {board.gauge.total}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">완료</div>
                </div>
                <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3 text-center">
                  <div className="text-2xl font-bold text-slate-400 tabular-nums">
                    0
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">미완료</div>
                </div>
                <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3 text-center">
                  <div className="text-2xl font-bold text-bridge-accent tabular-nums">
                    100%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    동결 완료율
                  </div>
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                모든 항목이 완료되었습니다. 완료율 100%를 동결하고 종료합니다.
                다음 스프린트로 롤오버되며 Task 백로그는 유지됩니다.
              </p>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
              <span className="text-xs text-slate-600">종료 후 되돌리려면 재활성화</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClose(false)}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:bg-foreground/5"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    const id = board.active_sprint?.id;
                    setConfirmClose(false);
                    if (id) void closeSprint(id);
                  }}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90"
                >
                  종료하고 롤오버
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 아카이브 스냅샷 열람 + 재활성화 */}
      {archiveView && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setArchiveView(null)}
        >
          <div
            className="w-full max-w-md bg-bridge-obsidian border border-foreground/10 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
            <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
              <h3 className="text-base font-bold text-foreground">
                {archiveView.name} · 동결 스냅샷
              </h3>
            </div>
            <div className="px-5 pb-5 pt-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-500 tabular-nums">
                    {archiveView.completed_count}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">완료</div>
                </div>
                <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3 text-center">
                  <div className="text-2xl font-bold text-amber-500 tabular-nums">
                    {archiveView.total_count - archiveView.completed_count}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">미완료</div>
                </div>
                <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] p-3 text-center">
                  <div className="text-2xl font-bold text-bridge-accent tabular-nums">
                    {archiveView.progress_percentage}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    동결 완료율
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                재활성화하면 이 스프린트가 현재 프레임으로 돌아옵니다. 수정 후 다시
                종료(재동결)하면 완료율이 갱신됩니다. 진행 중이던 최신 스프린트는
                잠시 보관됩니다.
              </p>

              {/* 담겼던 항목 목록 + 개별 재개 */}
              <div className="mt-4">
                <div className="text-xs font-bold text-slate-400 mb-2">
                  담겼던 항목 ({archiveItems.length})
                </div>
                {archiveLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
                  </div>
                ) : archiveItems.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-4">
                    항목 없음
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto custom-scrollbar">
                    {archiveItems.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] text-[12.5px]"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-sm shrink-0"
                          style={{ background: it.feature_color ?? "#6366F1" }}
                        />
                        <span className="flex-1 truncate text-foreground/80">
                          {it.title}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            it.sprint_stage === "DONE"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-foreground/[0.08] text-slate-400"
                          }`}
                        >
                          {it.sprint_stage === "DONE"
                            ? "Done"
                            : STAGE_LABEL[it.sprint_stage ?? "SPRINT"]}
                        </span>
                        {canEdit && (
                          <button
                            onClick={() => {
                              setArchiveView(null);
                              void resume(it.id);
                            }}
                            disabled={busy}
                            title="현재 스프린트로 재개"
                            className="text-[11px] font-bold px-2 py-0.5 rounded-md border border-bridge-accent/60 text-bridge-accent hover:bg-bridge-accent hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap"
                          >
                            → 현재로
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
              <button
                onClick={() => setArchiveView(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:bg-foreground/5"
              >
                닫기
              </button>
              {isAdminOrOwner && (
                <button
                  onClick={() => {
                    const id = archiveView.id;
                    setArchiveView(null);
                    void reactivate(id);
                  }}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90"
                >
                  재활성화
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BacklogGroup {
  featureId: string;
  featureTitle: string;
  color: string | null;
  items: SprintItemCard[];
}
function groupByFeature(items: SprintItemCard[]): BacklogGroup[] {
  const map = new Map<string, BacklogGroup>();
  for (const it of items) {
    const key = it.feature_id ?? "__none__";
    if (!map.has(key)) {
      map.set(key, {
        featureId: key,
        featureTitle: it.feature_title ?? "기타",
        color: it.feature_color,
        items: [],
      });
    }
    map.get(key)!.items.push(it);
  }
  return Array.from(map.values());
}

export default SprintFrame;
