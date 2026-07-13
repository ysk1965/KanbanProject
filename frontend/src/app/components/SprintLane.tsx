import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2,
  ArrowRight,
  Check,
  CornerUpLeft,
  ChevronDown,
  ChevronRight,
  Search,
  Plus,
} from "lucide-react";
import { sprintAPI } from "../utils/api";
import { formatDate, getTodayDateString } from "../utils/dateUtils";
import type { SprintBoard, SprintItemCard, SprintStage } from "../types";

interface SprintLaneProps {
  boardId: string;
  milestones: { id: string; title: string }[];
  /** 칸반 마일스톤 탭에서 선택된 값 ("all" | "none" | milestoneId) */
  selectedMilestoneId: string;
  canEdit: boolean;
  isAdminOrOwner: boolean;
}

const STAGE_LABEL: Record<SprintStage, string> = {
  SPRINT: "Sprint",
  REVIEW: "In Review",
  DONE: "Done",
};

const STAGE_DOT: Record<SprintStage, string> = {
  SPRINT: "#6366F1",
  REVIEW: "#d97706",
  DONE: "#10b981",
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

// 마감일 → 오늘 기준 D-day 칩
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

/**
 * 칸반 보드 상단에 상주하는 스프린트 레인.
 * 마일스톤 탭에서 고른 마일스톤(또는 자체 드롭다운)의 활성 스프린트를
 * 게이지 + Sprint/In Review/Done 컬럼으로 칸반 위에서 직접 운영한다.
 * 담기 단위는 체크리스트 항목(SprintFrame과 동일 데이터·API 재사용).
 */
export function SprintLane({
  boardId,
  milestones,
  selectedMilestoneId,
  canEdit,
  isAdminOrOwner,
}: SprintLaneProps) {
  // 칸반에서 특정 마일스톤을 고르면 따라가고, "전체"면 첫 마일스톤을 기본값으로.
  const resolvedSelected =
    selectedMilestoneId &&
    selectedMilestoneId !== "all" &&
    selectedMilestoneId !== "none"
      ? selectedMilestoneId
      : null;

  const [milestoneId, setMilestoneId] = useState<string>(
    resolvedSelected ?? milestones[0]?.id ?? "",
  );
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`sprintLane:collapsed:${boardId}`) === "1";
    } catch {
      return false;
    }
  });
  const [board, setBoard] = useState<SprintBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<SprintStage | null>(null);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [backlogQuery, setBacklogQuery] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  // 칸반 마일스톤 선택이 특정 값으로 바뀌면 레인도 동기화
  useEffect(() => {
    if (resolvedSelected && resolvedSelected !== milestoneId) {
      setMilestoneId(resolvedSelected);
    }
  }, [resolvedSelected]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!collapsed) void load();
  }, [load, collapsed]);

  const persistCollapsed = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(`sprintLane:collapsed:${boardId}`, next ? "1" : "0");
    } catch {
      /* noop */
    }
  };

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

  const canClose =
    !!board?.active_sprint &&
    board.gauge.total > 0 &&
    board.gauge.percentage === 100;

  // 재활성화 상태 = 활성 스프린트보다 시퀀스가 큰 스프린트가 보관 중
  const isReactivated =
    !!board?.active_sprint &&
    board.sprints.some(
      (s) => s.sequence_no > (board.active_sprint?.sequence_no ?? 0),
    );

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
  const backlogByFeature = useMemo(
    () => groupByFeature(filteredBacklog),
    [filteredBacklog],
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
        className={`group rounded-lg border border-foreground/[0.08] bg-bridge-obsidian p-2 shadow-sm transition-colors ${
          canEdit ? "cursor-grab active:cursor-grabbing" : ""
        } ${dragId === item.id ? "opacity-40" : ""}`}
      >
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
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
        <div className="mt-1 text-[12.5px] font-medium text-foreground leading-snug">
          {item.title}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
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

  const renderColumn = (stage: SprintStage, items: SprintItemCard[]) => (
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
      className={`flex flex-col rounded-xl border bg-foreground/[0.02] transition-colors ${
        dragOverStage === stage
          ? "border-bridge-accent bg-bridge-accent/10"
          : "border-foreground/[0.08]"
      }`}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: STAGE_DOT[stage] }}
        />
        <span className="text-xs font-bold text-foreground">
          {STAGE_LABEL[stage]}
        </span>
        <span className="ml-auto text-[11px] font-bold text-slate-400 tabular-nums bg-foreground/[0.06] px-2 rounded-full">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-2 pb-2.5 max-h-[300px] overflow-y-auto custom-scrollbar">
        {items.length === 0 ? (
          <div className="text-[11.5px] text-slate-500 text-center py-5 border border-dashed border-foreground/10 rounded-lg m-1">
            {stage === "SPRINT" ? "백로그에서 담기" : "비어 있음"}
          </div>
        ) : (
          items.map(renderCard)
        )}
      </div>
    </div>
  );

  // ---------- guards ----------
  if (milestones.length === 0) return null;

  const activeMilestone = milestones.find((m) => m.id === milestoneId);

  return (
    <div className="shrink-0 border-b border-foreground/[0.08] bg-bridge-obsidian/40">
      {/* 헤더 바 (항상 표시) */}
      <div className="flex items-center gap-2 px-3 md:px-6 py-2 flex-wrap">
        <button
          onClick={() => persistCollapsed(!collapsed)}
          className="flex items-center gap-1.5 text-xs font-bold text-foreground hover:text-bridge-accent transition-colors"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "스프린트 레인 펼치기" : "스프린트 레인 접기"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          스프린트
        </button>

        {/* 마일스톤 선택 — 칸반 탭에서 특정 마일스톤을 고른 상태면 숨김
            (탭이 '전체'일 때만 fallback 셀렉터 노출) */}
        {!resolvedSelected && (
          <select
            value={milestoneId}
            onChange={(e) => setMilestoneId(e.target.value)}
            className="bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5 py-1 text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-bridge-accent/50 max-w-[180px]"
            title="스프린트를 볼 마일스톤"
          >
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        )}

        {board?.sprint_enabled && board.active_sprint && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent whitespace-nowrap">
            {board.active_sprint.name} · 진행 중
          </span>
        )}

        {/* 우측: 게이지 미니(접힘 시에만) + busy — 펼치면 아래 밴드가 대신 표시 */}
        <div className="ml-auto flex items-center gap-2.5">
          {busy && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-bridge-accent" />
          )}
          {collapsed && board?.sprint_enabled && board.gauge.total > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-bridge-secondary tabular-nums">
                {board.gauge.percentage}%
              </span>
              <span className="hidden sm:block w-24 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all duration-500"
                  style={{ width: `${board.gauge.percentage}%` }}
                />
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {board.gauge.done}/{board.gauge.total}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 본문 (펼침 시) */}
      {!collapsed && (
        <div className="px-3 md:px-6 pb-3">
          {error && (
            <div className="mb-2 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {loading && !board ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
            </div>
          ) : !board?.sprint_enabled ? (
            // 스프린트 비활성 상태
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 py-5 text-center">
              <div>
                <p className="text-[13px] font-bold text-foreground">
                  {activeMilestone?.title ?? "이 마일스톤"}은 스프린트로 나뉘어
                  있지 않습니다
                </p>
                <p className="text-xs text-slate-500 mt-0.5 max-w-md">
                  Sprint · In Review · Done을 하나로 묶어, 완료할수록 채워지는
                  스코프 게이지로 칸반 위에서 바로 관리합니다.
                </p>
              </div>
              {isAdminOrOwner ? (
                <button
                  onClick={() => setMode(true)}
                  disabled={busy}
                  className="shrink-0 px-4 py-2 bg-bridge-accent text-white rounded-xl text-xs font-bold hover:bg-bridge-accent/90 transition-all disabled:opacity-40"
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
            <>
              {/* 스코프 게이지 밴드 (풀폭 대형) */}
              <div className="mb-2.5 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3.5">
                <div className="flex items-baseline gap-3 mb-2.5">
                  <span className="text-[42px] leading-none font-bold text-bridge-secondary tabular-nums tracking-tight">
                    {board.gauge.percentage}%
                  </span>
                  <span className="text-[13px] text-slate-400 tabular-nums">
                    {board.gauge.done} / {board.gauge.total} 항목
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-bridge-secondary">
                    <Check className="w-3.5 h-3.5" /> 스코프 게이지
                  </span>
                </div>
                <div className="h-3.5 rounded-lg bg-foreground/10 overflow-hidden">
                  <div
                    className="h-full rounded-lg bg-gradient-to-r from-bridge-accent to-bridge-secondary transition-all duration-500"
                    style={{
                      width: `${board.gauge.percentage}%`,
                      boxShadow: "0 0 18px rgba(45,212,191,0.35)",
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[9.5px] text-slate-500 tabular-nums">
                  <span>0</span>
                  <span>25</span>
                  <span>50</span>
                  <span>75</span>
                  <span>100%</span>
                </div>
              </div>

              {/* 컨트롤 행: 타임라인 칩 + 담기/라이프사이클 */}
              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                {board.sprints.map((s) => {
                  const isActive = board.active_sprint?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        if (
                          !isActive &&
                          isAdminOrOwner &&
                          window.confirm(
                            `'${s.name}'을(를) 재활성화해 다시 수정할까요? 현재 활성 스프린트는 임시 보관됩니다.`,
                          )
                        )
                          reactivate(s.id);
                      }}
                      title={
                        isActive
                          ? "현재 활성 스프린트"
                          : isAdminOrOwner
                            ? "클릭해서 재활성화"
                            : `완료율 ${s.progress_percentage}%`
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
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

                <div className="ml-auto flex items-center gap-2">
                  {canEdit && (
                    <button
                      onClick={() => setBacklogOpen((v) => !v)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        backlogOpen
                          ? "border-bridge-accent bg-bridge-accent/15 text-bridge-accent"
                          : "border-foreground/10 text-slate-400 hover:text-foreground hover:bg-foreground/5"
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      백로그에서 담기
                      <span className="tabular-nums opacity-70">
                        {takeableCount}
                      </span>
                    </button>
                  )}
                  {isAdminOrOwner && board.active_sprint && (
                    <>
                      {isReactivated && (
                        <button
                          onClick={() =>
                            board.active_sprint &&
                            cancelReactivation(board.active_sprint.id)
                          }
                          disabled={busy}
                          title="원래 동결 기록으로 되돌리기"
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-amber-500 text-amber-500 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
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
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isReactivated ? "재동결" : "스프린트 종료"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* 백로그 담기 패널 (토글) */}
              {backlogOpen && canEdit && (
                <div className="mb-2.5 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-foreground/[0.08]">
                    <span className="text-[13px] font-bold text-foreground">
                      Task · 공통 백로그
                    </span>
                    <span className="text-[11px] text-slate-500">
                      피처 › 태스크 › 항목
                    </span>
                    <div className="ml-auto flex items-center gap-2 bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5 py-1 min-w-[160px]">
                      <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <input
                        value={backlogQuery}
                        onChange={(e) => setBacklogQuery(e.target.value)}
                        placeholder="항목·태스크 검색"
                        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-foreground placeholder-slate-500"
                      />
                    </div>
                  </div>
                  <div className="p-2 flex flex-col gap-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                    {backlogByFeature.length === 0 ? (
                      <div className="text-xs text-slate-500 text-center py-6">
                        {q
                          ? "검색 결과가 없습니다."
                          : "담을 수 있는 항목이 없습니다."}
                      </div>
                    ) : (
                      backlogByFeature.map((grp) => (
                        <div
                          key={grp.featureId}
                          className="rounded-lg border border-foreground/[0.08] bg-bridge-obsidian/40 overflow-hidden"
                        >
                          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-foreground/[0.06]">
                            <span
                              className="w-2 h-2 rounded-sm shrink-0"
                              style={{ background: grp.color ?? "#6366F1" }}
                            />
                            <span className="text-[12.5px] font-bold text-foreground truncate">
                              {grp.featureTitle}
                            </span>
                          </div>
                          <ul className="p-1 flex flex-col gap-0.5">
                            {grp.items.map((it) => {
                              const dm = it.due_date
                                ? dueChip(it.due_date)
                                : null;
                              return (
                                <li
                                  key={it.id}
                                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-foreground/5"
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
                                      className={`block text-[12.5px] truncate ${
                                        it.completed
                                          ? "text-slate-400 line-through"
                                          : "text-foreground"
                                      }`}
                                    >
                                      {it.title}
                                    </span>
                                    {it.task_title && (
                                      <span className="block text-[10px] text-slate-500 truncate">
                                        {it.task_title}
                                      </span>
                                    )}
                                  </span>
                                  {dm && (
                                    <span
                                      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap tabular-nums ${DUE_CLASS[dm.cls]}`}
                                    >
                                      {dm.txt}
                                    </span>
                                  )}
                                  {it.completed ? (
                                    <span className="shrink-0 text-[10px] font-bold text-emerald-500 bg-emerald-500/15 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                      ✓ 완료
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => take(it.id)}
                                      disabled={busy}
                                      className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-lg border border-bridge-accent bg-bridge-accent/15 text-bridge-accent hover:bg-bridge-accent hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap inline-flex items-center gap-1"
                                    >
                                      담기 <ArrowRight className="w-3 h-3" />
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 3컬럼 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {renderColumn("SPRINT", board.columns.sprint)}
                {renderColumn("REVIEW", board.columns.review)}
                {renderColumn("DONE", board.columns.done)}
              </div>
            </>
          )}
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
          >
            <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />
            <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
              <h3 className="text-sm font-bold text-foreground">
                {isReactivated ? "다시 동결할까요?" : "스프린트를 종료할까요?"}
              </h3>
            </div>
            <div className="px-5 py-4 text-[13px] text-slate-400 leading-relaxed">
              <b className="text-foreground">{board.active_sprint.name}</b>의
              완료율 {board.gauge.percentage}%가 동결됩니다.
              {isReactivated
                ? " 재동결 후 최신 스프린트로 돌아갑니다."
                : " 종료 후 다음 스프린트가 이어서 열립니다."}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-foreground/[0.08]">
              <button
                onClick={() => setConfirmClose(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (board.active_sprint) closeSprint(board.active_sprint.id);
                  setConfirmClose(false);
                }}
                disabled={busy}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-all disabled:opacity-40"
              >
                {isReactivated ? "재동결" : "종료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SprintLane;
