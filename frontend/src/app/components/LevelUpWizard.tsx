import { useEffect, useMemo, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { MotionModal } from "./ui/MotionModal";
import { sprintAPI, milestoneAPI } from "../utils/api";
import type { SprintBoard as SprintBoardData, SprintItemCard } from "../types";

/**
 * 승급 마법사 — 레벨을 올리는 건 스위치가 아니라 **정리 작업**이다.
 *
 * 설계: `docs/Design/level-model.html` (승급의 순간)
 *
 * 레벨 전환 자체는 이미 끝난 뒤에 뜬다. 막고 서지 않는 이유:
 * 레벨은 표시 게이트라 되돌리는 데 비용이 없고, 정리는 미뤄도 화면이 깨지지 않는다.
 * 그래서 이 마법사는 **건너뛸 수 있다**.
 *
 * - **1 → 2**  레벨 1은 백로그를 자동으로 흡수한다(`adoptBacklogForLevelOne`).
 *   주기가 생기는 순간 "전부 이번 주기"가 되어 버리므로, 여기서 골라 되돌린다.
 * - **2 → 3**  주기를 담는 상자에 이름과 기간을 붙인다.
 *   주기를 여러 단계로 쪼개는 건 `Sprint.milestone` 이동 API가 없어 아직 못 한다(후속).
 */

interface LevelUpWizardProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  milestoneId: string | null;
  /** 방금 올라간 레벨. 2면 첫 주기 정리, 3이면 단계 이름 붙이기. */
  level: 2 | 3;
  /** 정리를 마쳤을 때 — 부모가 보드 데이터를 다시 읽는다. */
  onDone: () => void;
}

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  // 로컬 기준 yyyy-MM-dd — 기간은 사람이 보는 날짜라 UTC로 밀면 하루가 어긋난다.
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function LevelUpWizard({
  open,
  onClose,
  boardId,
  milestoneId,
  level,
  onDone,
}: LevelUpWizardProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<SprintBoardData | null>(null);

  // 1→2 상태
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO(13));

  // 2→3 상태
  const [msTitle, setMsTitle] = useState("");

  useEffect(() => {
    if (!open || !milestoneId) return;
    let alive = true;
    setLoading(true);
    sprintAPI
      .getSprintBoard(boardId, milestoneId)
      .then((data) => {
        if (!alive) return;
        setBoard(data);
        // 기본값은 "전부 담긴 채로" — 아무것도 안 고르고 넘겨도 지금과 같은 상태가 된다.
        const current = data.current_sprint;
        const ids = new Set<string>();
        (data.columns ?? []).forEach((c) =>
          c.items.forEach((it) => {
            if (it.sprint_id === current?.id) ids.add(it.task_id ?? it.id);
          }),
        );
        setPicked(ids);
        if (current?.start_date)
          setStartDate(current.start_date.substring(0, 10));
        if (current?.end_date) setEndDate(current.end_date.substring(0, 10));
      })
      .catch(() => {
        if (alive) toast.error("보드 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, boardId, milestoneId]);

  const currentSprintId = board?.current_sprint?.id ?? null;

  // 컬럼에는 모든 주기의 카드가 섞여 내려온다 — 정리 대상은 이번 주기 상자뿐이다.
  const allCards = useMemo<SprintItemCard[]>(() => {
    if (!board || !currentSprintId) return [];
    return (board.columns ?? [])
      .flatMap((c) => c.items)
      .filter((it) => it.sprint_id === currentSprintId);
  }, [board, currentSprintId]);

  const runLevelTwo = async () => {
    if (!currentSprintId) {
      onDone();
      onClose();
      return;
    }
    setSaving(true);
    try {
      // 안 고른 것만 백로그로 되돌린다. 고른 것은 이미 담겨 있어 건드릴 필요가 없다.
      const drop = allCards.filter((it) => !picked.has(it.task_id ?? it.id));
      for (const it of drop) {
        await sprintAPI.removeTask(
          boardId,
          currentSprintId,
          it.task_id ?? it.id,
        );
      }
      await sprintAPI.updateSprint(boardId, currentSprintId, {
        start_date: startDate,
        end_date: endDate,
      });
      toast.success(
        `첫 주기를 시작했습니다 · ${picked.size}장 담김 · ${drop.length}장은 레일에서 대기`,
      );
      onDone();
      onClose();
    } catch {
      toast.error("주기를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const runLevelThree = async () => {
    if (!milestoneId) {
      onDone();
      onClose();
      return;
    }
    setSaving(true);
    try {
      await milestoneAPI.updateMilestone(boardId, milestoneId, {
        title: msTitle.trim() || "1단계",
        start_date: startDate,
        end_date: endDate,
      });
      toast.success("단계를 만들었습니다 · 지금까지의 주기가 여기 묶였습니다");
      onDone();
      onClose();
    } catch {
      toast.error("단계를 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <MotionModal open={open} onClose={onClose} aria-labelledby="levelup-title">
      <div className="w-full sm:max-w-lg bg-bridge-obsidian rounded-t-2xl sm:rounded-2xl border border-foreground/10 shadow-2xl overflow-hidden">
        <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

        <div className="px-5 pt-4 pb-3 border-b border-foreground/[0.08] grid gap-1">
          <span className="text-xs font-bold uppercase tracking-widest text-bridge-accent">
            {level === 2 ? "1단계 → 2단계" : "2단계 → 3단계"}
          </span>
          <h2
            id="levelup-title"
            className="text-sm md:text-lg font-bold text-foreground tracking-tight"
          >
            {level === 2
              ? "첫 주기를 시작합니다"
              : "지금까지 돌린 주기를 단계로 묶습니다"}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {level === 2
              ? "이번 주기에 할 것만 남겨주세요. 고르지 않은 건 사라지지 않고 왼쪽 레일에서 기다립니다."
              : "주기는 그대로 굴러갑니다. 그 위에 \"이 단계에서 어디까지\"만 얹힙니다."}
          </p>
        </div>

        <div className="px-5 pb-5 pt-4 max-h-[62vh] overflow-y-auto custom-scrollbar space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
            </div>
          ) : level === 2 ? (
            <>
              <div className="grid gap-2">
                {allCards.length === 0 && (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    아직 작업이 없습니다. 기간만 정하고 시작하세요.
                  </p>
                )}
                {allCards.map((it) => {
                  const id = it.task_id ?? it.id;
                  const on = picked.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(id)}
                      className={`w-full flex items-center gap-3 text-left rounded-xl border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                        on
                          ? "border-bridge-secondary bg-bridge-secondary/10"
                          : "border-foreground/10 hover:bg-foreground/5"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-4 h-4 rounded grid place-items-center border ${
                          on
                            ? "bg-bridge-secondary border-bridge-secondary"
                            : "border-foreground/20"
                        }`}
                      >
                        {on && <Check className="w-3 h-3 text-teal-950" />}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                        {it.title}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                        {it.feature_title ?? "기타"} · 할 일{" "}
                        {it.checklist_done}/{it.checklist_total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="ms-title"
                className="text-xs font-bold uppercase tracking-widest text-slate-400"
              >
                이 단계의 이름
              </label>
              <input
                id="ms-title"
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder="예: 테스트런칭"
                className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl py-3 px-4 text-foreground placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-all"
              />
              <p className="text-xs text-slate-600 leading-relaxed">
                지금까지의 주기가 전부 이 단계에 들어갑니다. 주기를 여러 단계로 나누는 건
                다음 단계를 만들 때부터 가능합니다.
              </p>
            </div>
          )}

          {/* 기간 — 두 흐름 모두 필요하다. 레벨 2는 주기, 레벨 3은 단계의 기간. */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {level === 2 ? "주기 기간" : "단계 기간"}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="시작일"
                className="bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              />
              <span className="text-slate-500">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="종료일"
                className="bg-foreground/[0.03] border border-foreground/10 rounded-xl py-2 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
              />
              {level === 2 && (
                <span className="text-xs text-slate-600">기본 2주</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t border-foreground/[0.08]">
          <span className="text-xs text-slate-500 flex-1 min-w-0">
            {level === 2
              ? `담김 ${picked.size}장 · 레일 ${Math.max(0, allCards.length - picked.size)}장`
              : "주기와 카드는 하나도 안 움직입니다"}
          </span>
          {/* 정리는 미뤄도 화면이 깨지지 않는다 — 그래서 건너뛸 수 있어야 한다. */}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-foreground hover:bg-foreground/5 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
          >
            나중에
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={level === 2 ? runLevelTwo : runLevelThree}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {level === 2 ? "주기 시작" : "단계 만들기"}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
