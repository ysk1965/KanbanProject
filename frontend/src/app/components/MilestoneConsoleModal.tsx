import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X,
  Search,
  Loader2,
  RefreshCw,
  Clock,
  UserX,
  CheckSquare,
  Square,
  Check,
  ChevronDown,
} from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import type { SprintItemCard } from "../types";
import { sprintAPI, memberAPI } from "../utils/api";
import { checklistService } from "../utils/services";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { getDDay } from "../utils/dateUtils";

interface ConsoleMember {
  id: string;
  name: string;
  profileImage: string | null;
  color: string | null;
}

/**
 * 마일스톤 관리 콘솔
 * - 상단 필터(검색·지연·미배정·담당자) + 피쳐 칩(다중 선택)
 * - 하단은 선택한 피쳐들의 Task = 칸반 컬럼, 컬럼 안 체크리스트 = 카드
 * - 카드를 다른 Task 컬럼으로 드래그하면 소속 Task(및 피쳐)가 이동한다.
 * 데이터는 마일스톤 전체(스프린트 담김 여부 무관)를 GET /console 로 로드한다.
 */

interface MilestoneConsoleModalProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  milestoneId: string;
  milestoneTitle?: string;
  canEdit: boolean;
  onOpenChecklistItem?: (taskId: string, checklistItemId?: string) => void;
}

interface ConsoleTask {
  taskId: string;
  taskTitle: string;
  items: SprintItemCard[];
}
interface ConsoleFeature {
  featureId: string;
  featureTitle: string;
  featureColor: string | null;
  tasks: ConsoleTask[];
  total: number;
  done: number;
}

const NO_FEATURE = "__no_feature__";
const FALLBACK_PALETTE = [
  "#6366F1",
  "#2DD4BF",
  "#8b5cf6",
  "#f59e0b",
  "#f43f5e",
  "#10b981",
  "#0ea5e9",
  "#ec4899",
];

function assigneeName(it: SprintItemCard): string | null {
  return (
    it.assignee?.name ??
    it.contractor?.manager_name ??
    it.contractor?.name ??
    null
  );
}

export function MilestoneConsoleModal({
  open,
  onClose,
  boardId,
  milestoneId,
  milestoneTitle,
  canEdit,
  onOpenChecklistItem,
}: MilestoneConsoleModalProps) {
  const [items, setItems] = useState<SprintItemCard[]>([]);
  const [members, setMembers] = useState<ConsoleMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // 필터
  const [q, setQ] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [memberFilter, setMemberFilter] = useState<string | null>(null);
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);
  const memberMenuRef = useRef<HTMLDivElement | null>(null);
  // 완료 여부: all(전체) / done(완료만) / todo(미완료만)
  const [completionFilter, setCompletionFilter] = useState<
    "all" | "done" | "todo"
  >("all");
  const [completionMenuOpen, setCompletionMenuOpen] = useState(false);
  const completionMenuRef = useRef<HTMLDivElement | null>(null);

  // DnD
  const dragRef = useRef<{ id: string; taskId: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverTask, setDragOverTask] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const load = useCallback(async () => {
    if (!milestoneId) return;
    setLoading(true);
    try {
      const data = await sprintAPI.getMilestoneConsole(boardId, milestoneId);
      setItems(data ?? []);
    } catch {
      showToast("콘솔 데이터를 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }, [boardId, milestoneId, showToast]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await memberAPI.getMembers(boardId);
      setMembers(
        (res?.members ?? []).map((m) => ({
          id: m.user.id,
          name: m.user.name,
          profileImage: m.user.profile_image,
          color: m.assignee_color ?? null,
        })),
      );
    } catch {
      /* 멤버 목록 실패 시 담당자 편집만 비활성 — 콘솔 자체는 동작 */
    }
  }, [boardId]);

  useEffect(() => {
    if (open) {
      setInitialized(false);
      load();
      if (members.length === 0) loadMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load, loadMembers]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Feature ▸ Task ▸ 체크리스트 트리 (생성 순서 유지)
  const features = useMemo<ConsoleFeature[]>(() => {
    const map = new Map<string, ConsoleFeature>();
    const order: string[] = [];
    for (const it of items) {
      const fid = it.feature_id ?? NO_FEATURE;
      let feat = map.get(fid);
      if (!feat) {
        feat = {
          featureId: fid,
          featureTitle: it.feature_title ?? "기타",
          featureColor: it.feature_color,
          tasks: [],
          total: 0,
          done: 0,
        };
        map.set(fid, feat);
        order.push(fid);
      }
      const tid = it.task_id ?? "__no_task__";
      let task = feat.tasks.find((t) => t.taskId === tid);
      if (!task) {
        task = { taskId: tid, taskTitle: it.task_title ?? "기타", items: [] };
        feat.tasks.push(task);
      }
      task.items.push(it);
      feat.total += 1;
      if (it.completed) feat.done += 1;
    }
    return order.map((fid) => map.get(fid)!);
  }, [items]);

  const featureColor = useCallback(
    (feat: ConsoleFeature): string => {
      if (feat.featureColor && feat.featureColor.startsWith("#"))
        return feat.featureColor;
      const idx = features.findIndex((f) => f.featureId === feat.featureId);
      return FALLBACK_PALETTE[Math.max(0, idx) % FALLBACK_PALETTE.length];
    },
    [features],
  );

  // 최초 로드 시 전체 피쳐 선택
  useEffect(() => {
    if (open && !initialized && features.length > 0) {
      setSelected(new Set(features.map((f) => f.featureId)));
      setInitialized(true);
    }
  }, [open, initialized, features]);

  // 담당자 필터 후보 (등장하는 담당자만)
  const memberOptions = useMemo<string[]>(() => {
    const s = new Set<string>();
    for (const it of items) {
      const n = assigneeName(it);
      if (n) s.add(n);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ko"));
  }, [items]);

  // 담당자 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!memberMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!memberMenuRef.current?.contains(e.target as Node)) {
        setMemberMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [memberMenuOpen]);

  // 완료 여부 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!completionMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!completionMenuRef.current?.contains(e.target as Node)) {
        setCompletionMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [completionMenuOpen]);

  const match = useCallback(
    (it: SprintItemCard): boolean => {
      if (overdueOnly) {
        const d = it.due_date && !it.completed ? getDDay(it.due_date) : null;
        if (!d || d.urgency !== "overdue") return false;
      }
      if (unassignedOnly && (it.assignee || it.contractor)) return false;
      if (completionFilter === "done" && !it.completed) return false;
      if (completionFilter === "todo" && it.completed) return false;
      if (memberFilter && assigneeName(it) !== memberFilter) return false;
      if (q.trim()) {
        const hay = `${it.title} ${it.task_title ?? ""}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    },
    [overdueOnly, unassignedOnly, completionFilter, memberFilter, q],
  );

  const selectedFeatures = useMemo(
    () => features.filter((f) => selected.has(f.featureId)),
    [features, selected],
  );
  const multi = selectedFeatures.length > 1;

  // 표시 카운트
  const { shown, total } = useMemo(() => {
    let s = 0,
      t = 0;
    for (const f of selectedFeatures)
      for (const task of f.tasks) {
        t += task.items.length;
        s += task.items.filter(match).length;
      }
    return { shown: s, total: t };
  }, [selectedFeatures, match]);

  const toggleFeature = (fid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else next.add(fid);
      return next;
    });
  };
  const selectAll = () =>
    setSelected(new Set(features.map((f) => f.featureId)));
  const clearAll = () => setSelected(new Set());

  // ── DnD: 카드를 다른 Task 컬럼으로 이동 ──
  const handleDrop = async (
    target: ConsoleTask,
    targetFeat: ConsoleFeature,
  ) => {
    const ref = dragRef.current;
    setDragOverTask(null);
    setDraggingId(null);
    dragRef.current = null;
    if (!ref || ref.taskId === target.taskId) return;

    const moved = items.find((i) => i.id === ref.id);
    if (!moved) return;

    // 낙관적 업데이트 — 소속 Task/피쳐 갱신
    const prevItems = items;
    setItems((prev) =>
      prev.map((i) =>
        i.id === ref.id
          ? {
              ...i,
              task_id: target.taskId,
              task_title: target.taskTitle,
              feature_id:
                targetFeat.featureId === NO_FEATURE
                  ? null
                  : targetFeat.featureId,
              feature_title: targetFeat.featureTitle,
              feature_color: targetFeat.featureColor,
            }
          : i,
      ),
    );

    try {
      await sprintAPI.moveChecklistTask(
        boardId,
        ref.taskId,
        ref.id,
        target.taskId,
      );
      showToast(`"${moved.title}"  ·  ${target.taskTitle} 로 이동`);
    } catch {
      setItems(prevItems); // 롤백
      showToast("이동에 실패했습니다");
    }
  };

  // ── 인라인 편집 (완료 토글 / 담당자 / 마감) — 낙관적 업데이트 + 실패 롤백 ──
  const patchLocal = (id: string, patch: Partial<SprintItemCard>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const toggleComplete = async (it: SprintItemCard) => {
    if (!canEdit || !it.task_id) return;
    const prev = items;
    patchLocal(it.id, { completed: !it.completed });
    try {
      await checklistService.toggleItem(boardId, it.task_id, it.id);
    } catch {
      setItems(prev);
      showToast("완료 상태 변경에 실패했습니다");
    }
  };

  const changeAssignee = async (it: SprintItemCard, memberId: string) => {
    if (!canEdit || !it.task_id) return;
    const m = members.find((x) => x.id === memberId) ?? null;
    if ((it.assignee?.id ?? "") === (m?.id ?? "")) return;
    const prev = items;
    patchLocal(it.id, {
      assignee: m
        ? { id: m.id, name: m.name, profile_image: m.profileImage }
        : null,
      contractor: null,
    });
    try {
      await checklistService.updateItem(boardId, it.task_id, it.id, {
        assignee_id: m ? m.id : null,
      });
      showToast(m ? `담당자 → ${m.name}` : "담당자 해제");
    } catch {
      setItems(prev);
      showToast("담당자 변경에 실패했습니다");
    }
  };

  const changeDue = async (it: SprintItemCard, due: string) => {
    if (!canEdit || !it.task_id) return;
    const value = due || null;
    if ((it.due_date ?? "") === (value ?? "")) return;
    const prev = items;
    patchLocal(it.id, { due_date: value });
    try {
      await checklistService.updateItem(boardId, it.task_id, it.id, {
        due_date: value,
      });
    } catch {
      setItems(prev);
      showToast("마감일 변경에 실패했습니다");
    }
  };

  const statusOf = (it: SprintItemCard): { label: string; cls: string } => {
    if (it.completed)
      return {
        label: "완료",
        cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      };
    if (!it.assignee && it.contractor)
      return {
        label: "외주",
        cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      };
    if (it.sprint_column_id)
      return {
        label: "진행",
        cls: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
      };
    return {
      label: "예정",
      cls: "bg-foreground/[0.06] text-slate-500 border border-foreground/10",
    };
  };

  if (!open) return null;

  const filterBtn = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
      active
        ? "bg-bridge-accent/15 text-bridge-accent border-bridge-accent/30"
        : "bg-foreground/[0.03] text-slate-400 border-foreground/10 hover:border-foreground/20"
    }`;

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label="마일스톤 관리 콘솔"
      className="sm:max-w-[1440px] w-full p-0 overflow-hidden h-[92dvh] max-h-[92dvh] flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08] shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm md:text-base font-bold text-foreground truncate tracking-tight">
            {milestoneTitle ? (
              <>
                <span className="text-bridge-accent">{milestoneTitle}</span>{" "}
                관리 콘솔
              </>
            ) : (
              "마일스톤 관리 콘솔"
            )}
          </h2>
          <p className="text-xs text-slate-500">
            피쳐 {features.length} · 태스크{" "}
            {features.reduce((s, f) => s + f.tasks.length, 0)} · 항목{" "}
            {items.length}
          </p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={load}
          title="새로고침"
          aria-label="새로고침"
          className="shrink-0 inline-grid place-items-center w-8 h-8 rounded-lg border border-foreground/10 bg-foreground/[0.03] text-slate-400 hover:text-foreground hover:border-foreground/20 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 text-slate-400 hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-foreground/[0.08] flex-wrap shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[160px] max-w-[280px] bg-foreground/[0.03] border border-foreground/10 rounded-lg px-2.5">
          <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="체크리스트 검색…"
            aria-label="체크리스트 검색"
            className="w-full bg-transparent py-1.5 text-xs text-foreground placeholder-slate-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          className={filterBtn(overdueOnly)}
          aria-pressed={overdueOnly}
        >
          <Clock className="w-3 h-3" /> 지연만
        </button>
        <button
          type="button"
          onClick={() => setUnassignedOnly((v) => !v)}
          className={filterBtn(unassignedOnly)}
          aria-pressed={unassignedOnly}
        >
          <UserX className="w-3 h-3" /> 미배정
        </button>
        <div className="relative shrink-0" ref={completionMenuRef}>
          <button
            type="button"
            onClick={() => setCompletionMenuOpen((v) => !v)}
            className={filterBtn(completionFilter !== "all")}
            aria-haspopup="listbox"
            aria-expanded={completionMenuOpen}
          >
            {completionFilter === "done" ? (
              <>
                <CheckSquare className="w-3 h-3" /> 완료만
              </>
            ) : completionFilter === "todo" ? (
              <>
                <Square className="w-3 h-3" /> 미완료만
              </>
            ) : (
              <>
                <CheckSquare className="w-3 h-3" /> 완료: 전체
              </>
            )}
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>
          {completionMenuOpen && (
            <div
              role="listbox"
              className="absolute left-0 top-full mt-1 z-20 min-w-[150px] rounded-xl border border-foreground/10 bg-bridge-obsidian shadow-2xl py-1"
            >
              {(
                [
                  { key: "all", label: "완료: 전체", Icon: CheckSquare },
                  { key: "done", label: "완료만", Icon: CheckSquare },
                  { key: "todo", label: "미완료만", Icon: Square },
                ] as const
              ).map(({ key, label, Icon }) => {
                const active = completionFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setCompletionFilter(key);
                      setCompletionMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-slate-300 hover:bg-foreground/5 transition-colors"
                  >
                    <span className="w-4 h-4 shrink-0">
                      {active && (
                        <Check className="w-3.5 h-3.5 text-bridge-accent" />
                      )}
                    </span>
                    <Icon className="w-3 h-3 shrink-0 opacity-70" />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="relative shrink-0" ref={memberMenuRef}>
          <button
            type="button"
            onClick={() => setMemberMenuOpen((v) => !v)}
            className={filterBtn(!!memberFilter)}
            aria-haspopup="listbox"
            aria-expanded={memberMenuOpen}
          >
            {memberFilter ? (
              <>
                <span
                  className="inline-grid place-items-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
                  style={{ background: getAssigneeHex(memberFilter) }}
                >
                  {getInitials(memberFilter)}
                </span>
                {memberFilter}
              </>
            ) : (
              "담당자: 전체"
            )}
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>
          {memberMenuOpen && (
            <div
              role="listbox"
              className="absolute left-0 top-full mt-1 z-20 min-w-[180px] max-h-[280px] overflow-y-auto custom-scrollbar rounded-xl border border-foreground/10 bg-bridge-obsidian shadow-2xl py-1"
            >
              <button
                type="button"
                role="option"
                aria-selected={!memberFilter}
                onClick={() => {
                  setMemberFilter(null);
                  setMemberMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-slate-300 hover:bg-foreground/5 transition-colors"
              >
                <span className="w-4 h-4 shrink-0">
                  {!memberFilter && (
                    <Check className="w-3.5 h-3.5 text-bridge-accent" />
                  )}
                </span>
                담당자: 전체
              </button>
              {memberOptions.length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-slate-500">
                  담당자 없음
                </div>
              ) : (
                memberOptions.map((name) => {
                  const active = memberFilter === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setMemberFilter(name);
                        setMemberMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-slate-300 hover:bg-foreground/5 transition-colors"
                    >
                      <span className="w-4 h-4 shrink-0">
                        {active && (
                          <Check className="w-3.5 h-3.5 text-bridge-accent" />
                        )}
                      </span>
                      <span
                        className="inline-grid place-items-center w-4 h-4 rounded-full text-[9px] font-bold text-white shrink-0"
                        style={{ background: getAssigneeHex(name) }}
                      >
                        {getInitials(name)}
                      </span>
                      <span className="truncate">{name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
        <span className="ml-auto text-xs text-slate-500 tabular-nums">
          {total > 0 ? `표시 ${shown} / ${total}` : ""}
        </span>
      </div>

      {/* Feature chips */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-foreground/[0.08] overflow-x-auto shrink-0 custom-scrollbar">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">
          피쳐
        </span>
        <div className="flex items-center gap-1.5 shrink-0 pr-1.5 mr-0.5 border-r border-foreground/10">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs font-medium px-2 py-1 rounded-lg border border-foreground/10 text-slate-400 hover:text-bridge-accent hover:border-bridge-accent/40 transition-colors"
          >
            모두
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium px-2 py-1 rounded-lg border border-foreground/10 text-slate-400 hover:text-bridge-accent hover:border-bridge-accent/40 transition-colors"
          >
            해제
          </button>
        </div>
        {features.map((f) => {
          const on = selected.has(f.featureId);
          const color = featureColor(f);
          return (
            <button
              key={f.featureId}
              type="button"
              onClick={() => toggleFeature(f.featureId)}
              className={`shrink-0 inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-full text-[13px] border transition-colors ${
                on
                  ? "text-white border-transparent font-bold"
                  : "bg-foreground/[0.03] text-slate-400 border-foreground/10 hover:border-foreground/25 font-medium"
              }`}
              style={on ? { background: color } : undefined}
              aria-pressed={on}
            >
              {on ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" style={{ color }} />
              )}
              {f.featureTitle}
              <span className="font-mono text-xs tabular-nums opacity-80">
                {f.done}/{f.total}
              </span>
            </button>
          );
        })}
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden bg-foreground/[0.02] p-4">
        {loading && items.length === 0 ? (
          <div className="h-full grid place-items-center">
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        ) : selectedFeatures.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-slate-500">
            위에서 피쳐 칩을 하나 이상 선택하세요
          </div>
        ) : (
          <div className="flex gap-3 items-stretch h-full">
            {selectedFeatures
              .flatMap((f) => f.tasks.map((task) => ({ f, task })))
              .map((col) => ({ ...col, vis: col.task.items.filter(match) }))
              // 필터에 맞는 항목이 없는 컬럼은 뒤로 (안정 정렬로 원래 순서 유지)
              .sort(
                (a, b) =>
                  (a.vis.length === 0 ? 1 : 0) - (b.vis.length === 0 ? 1 : 0),
              )
              .map(({ f, task, vis }) => {
                const color = featureColor(f);
                const done = task.items.filter((i) => i.completed).length;
                const pct = task.items.length
                  ? Math.round((done / task.items.length) * 100)
                  : 0;
                const isOver = dragOverTask === task.taskId;
                return (
                  <div
                    key={`${f.featureId}:${task.taskId}`}
                    onDragOver={(e) => {
                      if (!draggingId) return;
                      e.preventDefault();
                      if (dragOverTask !== task.taskId)
                        setDragOverTask(task.taskId);
                    }}
                    onDragLeave={(e) => {
                      if (
                        !e.currentTarget.contains(e.relatedTarget as Node) &&
                        dragOverTask === task.taskId
                      )
                        setDragOverTask(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (canEdit) handleDrop(task, f);
                      else {
                        setDragOverTask(null);
                        setDraggingId(null);
                        dragRef.current = null;
                      }
                    }}
                    className={`w-72 shrink-0 bg-bridge-obsidian rounded-xl border flex flex-col min-h-0 transition-colors ${
                      isOver
                        ? "border-bridge-accent ring-2 ring-bridge-accent/40"
                        : "border-foreground/[0.08]"
                    }`}
                    style={{ borderTopColor: color, borderTopWidth: 3 }}
                  >
                    <div className="px-4 py-3 border-b border-foreground/[0.06] shrink-0">
                      {multi && (
                        <div
                          className="flex items-center gap-1.5 text-[11px] font-bold mb-1.5"
                          style={{ color }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: color }}
                          />
                          {f.featureTitle}
                        </div>
                      )}
                      <div className="text-[15px] font-bold text-foreground leading-snug tracking-tight">
                        {task.taskTitle}
                      </div>
                      <div className="flex items-center gap-2 mt-2.5 text-xs text-slate-400 font-mono tabular-nums">
                        <span className="flex-1 h-[7px] rounded-full bg-foreground/10 overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-gradient-to-r from-bridge-accent to-bridge-secondary"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        {done}/{task.items.length} · {pct}%
                      </div>
                    </div>
                    <div className="p-2 flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                      {vis.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-3 border border-dashed border-foreground/10 rounded-lg">
                          {task.items.length
                            ? "필터에 맞는 항목 없음"
                            : "항목 없음"}
                        </div>
                      ) : (
                        vis.map((it) => {
                          const who = assigneeName(it);
                          const isContractor = !it.assignee && !!it.contractor;
                          const dday =
                            it.due_date && !it.completed
                              ? getDDay(it.due_date)
                              : null;
                          const ddayCls =
                            dday?.urgency === "overdue"
                              ? "bg-rose-500/15 text-rose-500"
                              : dday?.urgency === "today" ||
                                  dday?.urgency === "soon"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "text-slate-400";
                          const st = statusOf(it);
                          const stopDrag = (e: {
                            stopPropagation: () => void;
                          }) => e.stopPropagation();
                          const ddayLabel = dday
                            ? dday.urgency === "overdue"
                              ? `${dday.text} 지연`
                              : dday.urgency === "today" ||
                                  dday.urgency === "soon"
                                ? `${dday.text} 임박`
                                : dday.text
                            : it.due_date
                              ? "마감"
                              : canEdit
                                ? "＋마감"
                                : "";
                          return (
                            <div
                              key={it.id}
                              draggable={canEdit}
                              onDragStart={() => {
                                dragRef.current = {
                                  id: it.id,
                                  taskId: task.taskId,
                                };
                                setDraggingId(it.id);
                              }}
                              onDragEnd={() => {
                                setDraggingId(null);
                                setDragOverTask(null);
                                dragRef.current = null;
                              }}
                              onClick={() =>
                                it.task_id &&
                                onOpenChecklistItem?.(it.task_id, it.id)
                              }
                              className={`bg-bridge-dark rounded-lg border border-foreground/[0.08] p-3.5 hover:border-foreground/[0.14] transition-all ${
                                canEdit
                                  ? "cursor-grab active:cursor-grabbing"
                                  : "cursor-pointer"
                              } ${draggingId === it.id ? "opacity-40" : ""}`}
                            >
                              <div className="flex items-start gap-2.5 mb-2.5">
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  draggable={false}
                                  onMouseDown={stopDrag}
                                  onClick={(e) => {
                                    stopDrag(e);
                                    toggleComplete(it);
                                  }}
                                  aria-label={
                                    it.completed ? "완료 해제" : "완료로 표시"
                                  }
                                  className={`mt-0.5 shrink-0 w-5 h-5 rounded-full grid place-items-center border transition-colors ${
                                    it.completed
                                      ? "bg-emerald-500 border-emerald-500 text-white"
                                      : "border-foreground/25 text-transparent hover:border-emerald-500"
                                  } ${canEdit ? "cursor-pointer" : ""}`}
                                >
                                  <Check className="w-3 h-3" strokeWidth={3} />
                                </button>
                                <div
                                  className={`text-[14px] font-medium leading-snug line-clamp-2 ${
                                    it.completed
                                      ? "line-through text-slate-400"
                                      : "text-foreground"
                                  }`}
                                >
                                  {it.title}
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className="relative inline-flex items-center gap-2 min-w-0"
                                  draggable={false}
                                  onMouseDown={stopDrag}
                                >
                                  <span
                                    className="inline-grid place-items-center w-6 h-6 rounded-lg text-[11px] font-bold text-white shrink-0"
                                    style={{
                                      background: isContractor
                                        ? "#f59e0b"
                                        : who
                                          ? getAssigneeHex(who)
                                          : "#94a3b8",
                                    }}
                                  >
                                    {who ? getInitials(who) : "·"}
                                  </span>
                                  <span className="text-[13px] text-slate-400 truncate">
                                    {who ?? "미배정"}
                                  </span>
                                  {canEdit && members.length > 0 && (
                                    <select
                                      value={it.assignee?.id ?? ""}
                                      onClick={stopDrag}
                                      onChange={(e) =>
                                        changeAssignee(it, e.target.value)
                                      }
                                      aria-label="담당자 변경"
                                      className="absolute inset-0 w-full opacity-0 cursor-pointer"
                                    >
                                      <option value="">미배정</option>
                                      {members.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {m.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </span>
                                <span className="flex items-center gap-1.5 shrink-0">
                                  {ddayLabel && (
                                    <span
                                      className="relative"
                                      draggable={false}
                                      onMouseDown={stopDrag}
                                    >
                                      <span
                                        className={`inline-block tabular-nums text-xs font-bold px-2 py-0.5 rounded-md ${
                                          dday ? ddayCls : "text-slate-400"
                                        }`}
                                      >
                                        {ddayLabel}
                                      </span>
                                      {canEdit && (
                                        <input
                                          type="date"
                                          value={it.due_date ?? ""}
                                          onClick={stopDrag}
                                          onChange={(e) =>
                                            changeDue(it, e.target.value)
                                          }
                                          aria-label="마감일 변경"
                                          className="absolute inset-0 w-full opacity-0 cursor-pointer"
                                        />
                                      )}
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.cls}`}
                                  >
                                    {st.label}
                                  </span>
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-foreground/[0.08] shrink-0">
        <span className="text-xs text-slate-500">
          {canEdit
            ? "카드를 다른 태스크로 끌어 이동 · 클릭하면 상세 열기"
            : "읽기 전용 · 카드를 클릭하면 상세 열기"}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
        >
          닫기
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute left-1/2 bottom-4 -translate-x-1/2 z-10 bg-foreground text-bridge-dark text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl pointer-events-none max-w-[90%] text-center">
          {toast}
        </div>
      )}
    </MotionModal>
  );
}

export default MilestoneConsoleModal;
