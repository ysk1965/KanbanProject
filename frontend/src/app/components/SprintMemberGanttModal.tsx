import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, LayoutGrid, Rows3, CornerUpLeft, X } from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import { checklistAPI } from "../utils/api";
import type { SprintItemCard } from "../types";
import { getAssigneeHex, getInitials } from "../utils/assigneeColor";
import { getTodayDateString } from "../utils/dateUtils";

/**
 * 스프린트 구성원 개인 간트 · 업무 배치 모달
 *
 * 스프린트 카드 = 체크리스트 항목이고, 항목은 이미 start_date/due_date를 갖는다.
 * 이 모달은 새 데이터 모델 없이 그 두 날짜를 간트 바로 시각화하고, 드래그로
 * 조정한 뒤 기존 PATCH(/checklist/{itemId})로 즉시 저장한다.
 *
 * - 배치됨(바) = start_date && due_date 둘 다 존재. 하나라도 null이면 미배치(백로그).
 * - 저장은 놓는 즉시(낙관적) + 실패 시 롤백. 별도 저장 버튼 없음.
 * - 타임라인 범위는 스프린트 start~end로 고정, 모든 배치는 이 범위로 클램프된다.
 * - 두 레이아웃: 플렉서블(Feature 스윔레인 + 레인 패킹) / 업무별(1항목 1행).
 */

const DAY_W = 44; // 하루 컬럼 폭(px)
const LABEL_W = 180; // 좌측 라벨 컬럼 폭(px)
const MS = 86400000;
const GANTT_MODE_KEY = "bridge:sprint-gantt-mode";
const DEFAULT_FEATURE_COLOR = "#6366F1";

/** 'YYYY-MM-DD' → epoch day 번호(UTC, 시분 없음) */
const toNum = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS);
};
/** epoch day 번호 → 'YYYY-MM-DD' */
const fromNum = (n: number): string => {
  const dt = new Date(n * MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const mdLabel = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
};

type GanttMode = "flex" | "task";

interface Props {
  open: boolean;
  onClose: () => void;
  boardId: string;
  canEdit: boolean;
  member: { id: string; name: string } | null;
  /** 이 구성원에게 배정된 스프린트 항목 전체(모든 컬럼) */
  items: SprintItemCard[];
  sprintName?: string | null;
  /** 스프린트 시작/종료일(타임라인 범위 · 클램프 경계). 없으면 오늘 기준 4주 폴백 */
  sprintStart: string | null;
  sprintEnd: string | null;
  /** 바/백로그 카드 클릭 → 태스크 모달 열기 */
  onOpenChecklistItem?: (taskId: string, itemId?: string) => void;
  /** 저장 성공 후 보드 무음 재조회 트리거 */
  onSaved?: () => void;
}

interface Overlay {
  start: string | null;
  due: string | null;
}

export function SprintMemberGanttModal({
  open,
  onClose,
  boardId,
  canEdit,
  member,
  items,
  sprintName,
  sprintStart,
  sprintEnd,
  onOpenChecklistItem,
  onSaved,
}: Props) {
  const [mode, setMode] = useState<GanttMode>(() => {
    if (typeof window === "undefined") return "flex";
    return (localStorage.getItem(GANTT_MODE_KEY) as GanttMode) || "flex";
  });
  // 항목별 날짜 오버레이(낙관적). member 전환/오픈 시 props에서 시드.
  const [overlay, setOverlay] = useState<Record<string, Overlay>>({});
  const [error, setError] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const dragItemRef = useRef<string | null>(null);
  const seededKey = useRef<string>("");
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 타임라인 범위(스프린트 기간, 폴백=오늘+27일) ──
  const range = useMemo(() => {
    let startNum: number;
    let endNum: number;
    if (sprintStart && sprintEnd) {
      startNum = toNum(sprintStart);
      endNum = toNum(sprintEnd);
    } else {
      startNum = toNum(getTodayDateString());
      endNum = startNum + 27;
    }
    if (endNum < startNum) endNum = startNum;
    const total = Math.max(1, endNum - startNum + 1);
    return { startNum, total };
  }, [sprintStart, sprintEnd]);

  const clampIdx = useCallback(
    (i: number) => Math.max(0, Math.min(range.total - 1, i)),
    [range.total],
  );
  const idxToDate = useCallback(
    (i: number) => fromNum(range.startNum + clampIdx(i)),
    [range.startNum, clampIdx],
  );
  const dateToIdx = useCallback(
    (iso: string) => toNum(iso) - range.startNum,
    [range.startNum],
  );

  // member 전환/오픈 시 오버레이 시드(1회). 이후 편집 중엔 재시드하지 않음.
  useEffect(() => {
    if (!open || !member) {
      seededKey.current = "";
      return;
    }
    if (seededKey.current === member.id) return;
    seededKey.current = member.id;
    const seed: Record<string, Overlay> = {};
    for (const it of items)
      seed[it.id] = { start: it.start_date, due: it.due_date };
    setOverlay(seed);
    setError(null);
  }, [open, member, items]);

  useEffect(() => {
    return () => {
      if (errTimer.current) clearTimeout(errTimer.current);
    };
  }, []);

  const flashError = useCallback((msg: string) => {
    setError(msg);
    if (errTimer.current) clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setError(null), 3200);
  }, []);

  // 오버레이 적용 헬퍼(현재 날짜 → 카드로 반영)
  const cards = useMemo(
    () =>
      items.map((it) => {
        const o = overlay[it.id];
        return o ? { ...it, start_date: o.start, due_date: o.due } : it;
      }),
    [items, overlay],
  );

  const placed = useMemo(
    () => cards.filter((c) => c.start_date && c.due_date),
    [cards],
  );
  const backlog = useMemo(
    () => cards.filter((c) => !(c.start_date && c.due_date)),
    [cards],
  );

  const startIdxOf = useCallback(
    (c: SprintItemCard) =>
      c.start_date ? clampIdx(dateToIdx(c.start_date)) : 0,
    [clampIdx, dateToIdx],
  );
  const durOf = useCallback(
    (c: SprintItemCard) => {
      if (c.start_date && c.due_date) {
        // 스프린트 범위 밖의 기존 날짜도 그리드 안으로 클램프해 바가 넘치지 않게 한다.
        const s = clampIdx(dateToIdx(c.start_date));
        const e = clampIdx(dateToIdx(c.due_date));
        return Math.max(1, e - s + 1);
      }
      return 1;
    },
    [clampIdx, dateToIdx],
  );

  // ── 저장(낙관적 + 롤백) ──
  const commit = useCallback(
    async (
      card: SprintItemCard,
      startDate: string | null,
      dueDate: string | null,
      baseline: Overlay,
    ) => {
      if (!card.task_id) return;
      if (baseline.start === startDate && baseline.due === dueDate) return;
      setOverlay((o) => ({
        ...o,
        [card.id]: { start: startDate, due: dueDate },
      }));
      try {
        await checklistAPI.patchItem(boardId, card.task_id, card.id, {
          start_date: startDate,
          due_date: dueDate,
        });
        onSaved?.();
      } catch {
        setOverlay((o) => ({ ...o, [card.id]: baseline }));
        flashError("저장에 실패했습니다. 다시 시도해주세요.");
      }
    },
    [boardId, onSaved, flashError],
  );

  // 라이브 프리뷰(로컬만, patch 없음) — 드래그 중 인덱스 갱신
  const setLive = useCallback(
    (id: string, startIdx: number, dur: number) => {
      const s = idxToDate(startIdx);
      const e = idxToDate(startIdx + dur - 1);
      setOverlay((o) => ({ ...o, [id]: { start: s, due: e } }));
    },
    [idxToDate],
  );

  // ── 바 이동/리사이즈 (pointer) ──
  const onBarPointerDown = useCallback(
    (e: React.PointerEvent, card: SprintItemCard, kind: "move" | "l" | "r") => {
      if (!canEdit || !card.task_id) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const s0 = startIdxOf(card);
      const d0 = durOf(card);
      const baseline: Overlay = { start: card.start_date, due: card.due_date };
      let final = { s: s0, dur: d0 };

      const move = (ev: PointerEvent) => {
        const delta = Math.round((ev.clientX - startX) / DAY_W);
        let s = s0;
        let dur = d0;
        if (kind === "move") {
          s = Math.max(0, Math.min(range.total - d0, s0 + delta));
        } else if (kind === "r") {
          dur = Math.max(1, Math.min(range.total - s0, d0 + delta));
        } else {
          const ns = Math.max(0, Math.min(s0 + d0 - 1, s0 + delta));
          dur = d0 + (s0 - ns);
          s = ns;
        }
        final = { s, dur };
        setLive(card.id, s, dur);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        void commit(
          card,
          idxToDate(final.s),
          idxToDate(final.s + final.dur - 1),
          baseline,
        );
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [canEdit, startIdxOf, durOf, range.total, setLive, commit, idxToDate],
  );

  // 배치 해제 → 백로그로
  const unplace = useCallback(
    (card: SprintItemCard) => {
      if (!canEdit) return;
      void commit(card, null, null, {
        start: card.start_date,
        due: card.due_date,
      });
    },
    [canEdit, commit],
  );

  // ── 백로그 → 타임라인 드롭 ──
  const laneXToDay = useCallback(
    (clientX: number) => {
      const r = rowsRef.current?.getBoundingClientRect();
      if (!r) return 0;
      return clampIdx(Math.floor((clientX - r.left - LABEL_W) / DAY_W));
    },
    [clampIdx],
  );
  const onRowsDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!canEdit || !dragItemRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropDay(laneXToDay(e.clientX));
    },
    [canEdit, laneXToDay],
  );
  const onRowsDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const id = dragItemRef.current || e.dataTransfer.getData("text/plain");
      dragItemRef.current = null;
      setDropDay(null);
      if (!canEdit || !id) return;
      const card = items.find((it) => it.id === id);
      if (!card) return;
      const day = laneXToDay(e.clientX); // 기본 기간 1일
      void commit(card, idxToDate(day), idxToDate(day), {
        start: card.start_date,
        due: card.due_date,
      });
    },
    [canEdit, items, laneXToDay, commit, idxToDate],
  );

  const switchMode = (m: GanttMode) => {
    setMode(m);
    try {
      localStorage.setItem(GANTT_MODE_KEY, m);
    } catch {
      /* localStorage 접근 불가 시 무시 */
    }
  };

  const todayIso = getTodayDateString();
  const todayIdx = dateToIdx(todayIso);
  const showToday = todayIdx >= 0 && todayIdx < range.total;

  const accent = member ? getAssigneeHex(member.name) : DEFAULT_FEATURE_COLOR;

  // 범례용 Feature 목록(배치된 카드 기준)
  const legendFeatures = useMemo(() => {
    const seen = new Map<string, { title: string; color: string }>();
    for (const c of placed) {
      const key = c.feature_id ?? "__none__";
      if (!seen.has(key)) {
        seen.set(key, {
          title: c.feature_title ?? "미분류",
          color: c.feature_color ?? DEFAULT_FEATURE_COLOR,
        });
      }
    }
    return Array.from(seen.values()).slice(0, 5);
  }, [placed]);

  // ── 렌더 헬퍼 ──
  const dateCells = useMemo(() => {
    const cells: React.ReactNode[] = [];
    for (let d = 0; d < range.total; d++) {
      const iso = fromNum(range.startNum + d);
      const dow = new Date(toNum(iso) * MS).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      const isToday = d === todayIdx;
      cells.push(
        <div
          key={d}
          className={`shrink-0 text-center py-1.5 border-r border-foreground/[0.06] ${
            weekend ? "bg-foreground/[0.02]" : ""
          }`}
          style={{ width: DAY_W }}
        >
          <div
            className={`text-[9px] ${isToday ? "text-bridge-secondary" : "text-slate-500"}`}
          >
            {DOW[dow]}
          </div>
          <div
            className={`text-[11px] font-medium tabular-nums ${isToday ? "text-bridge-secondary" : "text-foreground"}`}
          >
            {iso.split("-")[2].replace(/^0/, "")}
          </div>
        </div>,
      );
    }
    return cells;
  }, [range.startNum, range.total, todayIdx]);

  const renderBar = (card: SprintItemCard, withTitle: boolean) => {
    const s = startIdxOf(card);
    const dur = durOf(card);
    const color = card.feature_color ?? DEFAULT_FEATURE_COLOR;
    return (
      <div
        key={card.id}
        role="button"
        tabIndex={0}
        title={`${card.title}\n${mdLabel(idxToDate(s))} – ${mdLabel(idxToDate(s + dur - 1))} · ${dur}일`}
        onPointerDown={(e) => onBarPointerDown(e, card, "move")}
        onDoubleClick={() =>
          card.task_id && onOpenChecklistItem?.(card.task_id, card.id)
        }
        className={`group absolute top-1.5 h-7 rounded-lg flex items-center gap-1.5 px-2 border border-white/15 shadow-lg ${
          canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        }`}
        style={{
          left: s * DAY_W,
          width: dur * DAY_W - 4,
          background: `linear-gradient(135deg, ${color}, ${color}b0)`,
        }}
      >
        {canEdit && (
          <span
            onPointerDown={(e) => onBarPointerDown(e, card, "l")}
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
          />
        )}
        <span className="flex-1 truncate text-[11px] font-medium text-white drop-shadow-sm">
          {withTitle
            ? card.title
            : `${mdLabel(idxToDate(s))}–${mdLabel(idxToDate(s + dur - 1))}`}
        </span>
        {canEdit && (
          <button
            type="button"
            aria-label="배치 해제"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              unplace(card);
            }}
            className="hidden group-hover:grid place-items-center w-4 h-4 rounded bg-black/30 text-white shrink-0"
          >
            <CornerUpLeft className="w-3 h-3" />
          </button>
        )}
        {canEdit && (
          <span
            onPointerDown={(e) => onBarPointerDown(e, card, "r")}
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
          />
        )}
      </div>
    );
  };

  // 레인 패킹: 겹치지 않는 카드는 한 레인 공유
  const packLanes = (list: SprintItemCard[]): SprintItemCard[][] => {
    const sorted = [...list].sort((a, b) => {
      const sa = startIdxOf(a);
      const sb = startIdxOf(b);
      if (sa !== sb) return sa - sb;
      return durOf(b) - durOf(a);
    });
    const lanes: SprintItemCard[][] = [];
    for (const c of sorted) {
      const s = startIdxOf(c);
      let placedInLane = false;
      for (const lane of lanes) {
        const last = lane[lane.length - 1];
        if (s >= startIdxOf(last) + durOf(last)) {
          lane.push(c);
          placedInLane = true;
          break;
        }
      }
      if (!placedInLane) lanes.push([c]);
    }
    return lanes;
  };

  const renderTaskRows = () =>
    placed
      .slice()
      .sort((a, b) => startIdxOf(a) - startIdxOf(b))
      .map((card) => {
        const color = card.feature_color ?? DEFAULT_FEATURE_COLOR;
        return (
          <div
            key={card.id}
            className="flex items-center border-b border-foreground/[0.06] h-11 relative z-[1] hover:bg-foreground/[0.015]"
          >
            <div
              className="sticky left-0 z-[3] h-full flex items-center gap-2 px-3 bg-bridge-obsidian border-r border-foreground/[0.08]"
              style={{ width: LABEL_W, flex: `0 0 ${LABEL_W}px` }}
            >
              <span
                className="w-[3px] h-6 rounded-full shrink-0"
                style={{ background: color }}
              />
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-foreground truncate">
                  {card.title}
                </div>
                <div className="text-[9.5px] text-slate-500 truncate">
                  {card.feature_title ?? "미분류"} · {durOf(card)}일
                </div>
              </div>
            </div>
            <div className="relative flex-1 h-full">
              {renderBar(card, false)}
            </div>
          </div>
        );
      });

  const renderSwimlanes = () => {
    // Feature별 그룹(생성순 → 미분류 맨 뒤)
    const groups = new Map<
      string,
      { title: string; color: string; created: string; list: SprintItemCard[] }
    >();
    for (const c of placed) {
      const key = c.feature_id ?? "__none__";
      let g = groups.get(key);
      if (!g) {
        g = {
          title: c.feature_title ?? "미분류",
          color: c.feature_color ?? DEFAULT_FEATURE_COLOR,
          created: c.feature_created_at ?? "",
          list: [],
        };
        groups.set(key, g);
      }
      g.list.push(c);
    }
    const ordered = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "__none__") return 1;
      if (b[0] === "__none__") return -1;
      return a[1].created.localeCompare(b[1].created);
    });
    return ordered.map(([key, g]) => {
      const lanes = packLanes(g.list);
      return (
        <div
          key={key}
          className="flex border-b border-foreground/[0.06] relative z-[1] hover:bg-foreground/[0.012]"
        >
          <div
            className="sticky left-0 z-[3] flex items-center gap-2 px-3 bg-bridge-obsidian border-r border-foreground/[0.08]"
            style={{ width: LABEL_W, flex: `0 0 ${LABEL_W}px` }}
          >
            <span
              className="w-[3px] self-stretch my-2 rounded-full shrink-0"
              style={{ background: g.color }}
            />
            <div className="min-w-0">
              <div
                className="text-[12px] font-bold truncate"
                style={{ color: g.color }}
              >
                {g.title}
              </div>
              <div className="text-[10px] text-slate-500">
                {g.list.length}건 · {lanes.length}행
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col">
            {lanes.map((lane, i) => (
              <div
                key={i}
                className={`relative h-10 ${i > 0 ? "border-t border-dashed border-foreground/[0.06]" : ""}`}
              >
                {lane.map((card) => renderBar(card, true))}
              </div>
            ))}
          </div>
        </div>
      );
    });
  };

  const placedCount = placed.length;
  const totalCount = items.length;
  const leftCount = totalCount - placedCount;

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-label={member ? `${member.name} 간트` : "구성원 간트"}
      className="sm:max-w-[1160px] w-full h-[90dvh] sm:h-[780px] flex flex-col overflow-hidden p-0"
    >
      <div className="flex flex-col h-full min-h-0">
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
          <span
            className="w-10 h-10 rounded-xl grid place-items-center text-sm font-bold text-white shrink-0"
            style={{ background: accent }}
          >
            {member ? getInitials(member.name) : "·"}
          </span>
          <div className="min-w-0">
            <div className="text-base font-bold text-foreground truncate">
              {member?.name ?? ""}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {sprintName ? `${sprintName} · ` : ""}
              {sprintStart && sprintEnd
                ? `${mdLabel(sprintStart)} – ${mdLabel(sprintEnd)}`
                : "기간 미설정"}{" "}
              · 담당 업무 배치
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-center px-3 py-1.5 rounded-xl bg-bridge-dark border border-foreground/[0.08]">
              <div className="text-base font-bold text-foreground tabular-nums leading-none">
                {totalCount}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">담당</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-xl bg-bridge-dark border border-foreground/[0.08]">
              <div className="text-base font-bold text-bridge-secondary tabular-nums leading-none">
                {placedCount}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">배치됨</div>
            </div>
            <div className="text-center px-3 py-1.5 rounded-xl bg-bridge-dark border border-foreground/[0.08]">
              <div className="text-base font-bold text-amber-500 tabular-nums leading-none">
                {leftCount}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">미배치</div>
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="w-9 h-9 grid place-items-center rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 바디 */}
        <div className="flex-1 flex min-h-0">
          {/* 백로그 */}
          <aside className="w-64 shrink-0 border-r border-foreground/[0.08] flex flex-col min-h-0 bg-bridge-dark/40">
            <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                나에게 부여된 일
              </span>
              <span className="text-[11px] font-bold text-bridge-accent bg-bridge-accent/15 rounded-full px-2">
                {leftCount}
              </span>
            </div>
            <div className="px-4 pb-2 text-[11px] text-slate-500">
              {canEdit
                ? "카드를 오른쪽 타임라인으로 끌어 배치하세요."
                : "읽기 전용입니다."}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4 space-y-2">
              {backlog.length === 0 ? (
                <div className="text-center text-[11.5px] text-slate-600 py-10 leading-relaxed">
                  모든 업무가 배치되었습니다. 🎉
                  <br />
                  바를 끌어 일정을 조정하세요.
                </div>
              ) : (
                backlog.map((card) => {
                  const color = card.feature_color ?? DEFAULT_FEATURE_COLOR;
                  return (
                    <div
                      key={card.id}
                      draggable={canEdit}
                      onDragStart={(e) => {
                        dragItemRef.current = card.id;
                        e.dataTransfer.setData("text/plain", card.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        dragItemRef.current = null;
                        setDropDay(null);
                      }}
                      onClick={() =>
                        card.task_id &&
                        onOpenChecklistItem?.(card.task_id, card.id)
                      }
                      className={`rounded-xl border border-foreground/[0.08] bg-bridge-obsidian p-2.5 transition-colors hover:border-foreground/[0.14] ${
                        canEdit
                          ? "cursor-grab active:cursor-grabbing"
                          : "cursor-pointer"
                      }`}
                      style={{ borderLeft: `3px solid ${color}` }}
                    >
                      <div
                        className="text-[10px] font-bold mb-1 flex items-center gap-1.5"
                        style={{ color }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-sm"
                          style={{ background: color }}
                        />
                        {card.feature_title ?? "미분류"}
                      </div>
                      <div className="text-[12.5px] font-medium text-foreground leading-snug">
                        {card.title}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* 간트 */}
          <section className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-foreground/[0.08]">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                개인 간트
              </span>
              <div className="flex gap-2.5 items-center flex-wrap text-[10.5px] text-slate-500">
                {legendFeatures.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <i
                      className="w-2.5 h-2.5 rounded-sm inline-block"
                      style={{ background: f.color }}
                    />
                    {f.title}
                  </span>
                ))}
              </div>
              <div className="ml-auto flex bg-bridge-dark border border-foreground/[0.08] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => switchMode("flex")}
                  className={`flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                    mode === "flex"
                      ? "bg-bridge-accent text-white"
                      : "text-slate-400 hover:text-foreground"
                  }`}
                >
                  <LayoutGrid className="w-3 h-3" /> 플렉서블
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("task")}
                  className={`flex items-center gap-1 text-[11.5px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                    mode === "task"
                      ? "bg-bridge-accent text-white"
                      : "text-slate-400 hover:text-foreground"
                  }`}
                >
                  <Rows3 className="w-3 h-3" /> 업무별
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-auto custom-scrollbar relative"
            >
              <div
                className="relative"
                style={{ minWidth: LABEL_W + range.total * DAY_W }}
              >
                {/* 날짜 헤더 */}
                <div className="sticky top-0 z-20 flex bg-bridge-obsidian border-b border-foreground/[0.08]">
                  <div
                    className="sticky left-0 z-[21] flex items-center px-3.5 text-[11px] text-slate-500 bg-bridge-obsidian border-r border-foreground/[0.08]"
                    style={{ width: LABEL_W, flex: `0 0 ${LABEL_W}px` }}
                  >
                    업무
                  </div>
                  <div className="flex">{dateCells}</div>
                </div>

                {/* 행 영역 */}
                <div
                  ref={rowsRef}
                  className="relative"
                  onDragOver={onRowsDragOver}
                  onDragLeave={(e) => {
                    if (!rowsRef.current?.contains(e.relatedTarget as Node))
                      setDropDay(null);
                  }}
                  onDrop={onRowsDrop}
                >
                  {/* 배경 그리드 */}
                  <div
                    className="absolute inset-0 z-0 flex pointer-events-none"
                    style={{ left: LABEL_W }}
                  >
                    {Array.from({ length: range.total }).map((_, d) => {
                      const dow = new Date(
                        (range.startNum + d) * MS,
                      ).getUTCDay();
                      const weekend = dow === 0 || dow === 6;
                      return (
                        <div
                          key={d}
                          className={`shrink-0 border-r border-foreground/[0.05] ${weekend ? "bg-foreground/[0.02]" : ""}`}
                          style={{ width: DAY_W }}
                        />
                      );
                    })}
                  </div>
                  {/* 오늘선 */}
                  {showToday && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-bridge-secondary z-[5] pointer-events-none shadow-[0_0_10px_var(--tw-shadow-color)] shadow-bridge-secondary"
                      style={{ left: LABEL_W + todayIdx * DAY_W + DAY_W / 2 }}
                    >
                      <span className="absolute top-0.5 left-1 text-[9px] font-bold text-bridge-secondary whitespace-nowrap">
                        오늘
                      </span>
                    </div>
                  )}
                  {/* 드롭 프리뷰 */}
                  {dropDay !== null && (
                    <div
                      className="absolute top-0 bottom-0 rounded-lg border-[1.5px] border-dashed border-bridge-accent bg-bridge-accent/10 z-[4] pointer-events-none"
                      style={{ left: LABEL_W + dropDay * DAY_W, width: DAY_W }}
                    >
                      <span className="absolute top-1 left-1.5 text-[10px] font-bold text-bridge-accent bg-bridge-obsidian px-1.5 rounded whitespace-nowrap">
                        {mdLabel(idxToDate(dropDay))}
                      </span>
                    </div>
                  )}

                  {placed.length === 0 ? (
                    <div
                      className="py-12 text-[12px] text-slate-500 leading-relaxed relative z-[1]"
                      style={{ paddingLeft: LABEL_W + 20 }}
                    >
                      아직 배치된 업무가 없습니다.
                      <br />
                      왼쪽 카드를 타임라인으로 끌어오세요.
                    </div>
                  ) : mode === "task" ? (
                    renderTaskRows()
                  ) : (
                    renderSwimlanes()
                  )}

                  {/* 드롭 힌트 행 */}
                  {canEdit && placed.length > 0 && (
                    <div
                      className="flex items-center gap-2 h-11 text-[11.5px] text-slate-500 relative z-[1]"
                      style={{ paddingLeft: LABEL_W + 12 }}
                    >
                      <span className="w-5 h-5 rounded-md border border-dashed border-foreground/20 grid place-items-center text-[13px]">
                        +
                      </span>
                      왼쪽 업무를 이 곳으로 끌어와 배치
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-[11px] text-slate-500 flex items-center gap-2">
            {error ? (
              <span className="text-rose-400 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> {error}
              </span>
            ) : !canEdit ? (
              "읽기 전용 · 편집 권한이 없습니다"
            ) : mode === "flex" ? (
              "플렉서블: 겹치지 않는 업무는 한 레인에 묶입니다 · 바를 끌어 이동/기간 조절"
            ) : (
              "Esc 닫기 · 바를 끌어 이동 · 양끝을 끌어 기간 조절"
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
