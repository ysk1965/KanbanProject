import { useMemo } from "react";
import { Flag } from "lucide-react";
import type { SprintInfo } from "../types";
import {
  diffDays,
  formatMD,
  inclusiveDays,
  parseDay,
  todayLocal,
} from "../utils/sprintDates";

interface SprintSegmentBarProps {
  milestoneTitle: string;
  /** 마일스톤 기간(yyyy-MM-dd). 없으면 스프린트 경계에서 역산한다. */
  milestoneStart: string | null;
  milestoneEnd: string | null;
  sprints: SprintInfo[];
  selectedSprintId: string | null;
  /** 스프린트 id → END에 닿지 못한 태스크 수. 지난 세그먼트의 "미완료 N" 칩 근거. */
  unfinishedBySprint: Record<string, number>;
  onSelect: (sprintId: string) => void;
}

/**
 * 세그먼트 스프린트 바 — 마일스톤 기간 하나가 트랙이고, 분할된 버킷이 기간 비례 폭의
 * 세그먼트로 나뉜다. 종료 버튼이 사라진 자리를 대신하는 이 화면의 시간 축이다.
 *  · 지남(PAST)은 에메랄드로 가라앉고, 진행중(CURRENT)만 액센트로 빛나며, 예정(FUTURE)은 윤곽만 남는다.
 *  · 세그먼트 클릭 = 보드 스코프 전환(선택). 선택은 상태와 별개로 액센트 링으로 표시한다.
 */
export function SprintSegmentBar({
  milestoneTitle,
  milestoneStart,
  milestoneEnd,
  sprints,
  selectedSprintId,
  unfinishedBySprint,
  onSelect,
}: SprintSegmentBarProps) {
  const span = useMemo(() => {
    // 마일스톤 기간이 비어 있는 보드도 있어(레거시) 스프린트 경계로 폴백한다.
    const starts = sprints
      .map((s) => parseDay(s.start_date))
      .filter((d): d is Date => !!d);
    const ends = sprints
      .map((s) => parseDay(s.end_date))
      .filter((d): d is Date => !!d);
    const start =
      parseDay(milestoneStart) ??
      (starts.length ? new Date(Math.min(...starts.map((d) => +d))) : null);
    const end =
      parseDay(milestoneEnd) ??
      (ends.length ? new Date(Math.max(...ends.map((d) => +d))) : null);
    const days = inclusiveDays(start, end);
    return { start, end, days };
  }, [milestoneStart, milestoneEnd, sprints]);

  // 마일스톤 전체 진척 — 모든 버킷의 라이브 체크리스트 합. 세그먼트 %와 같은 잣대다.
  const totals = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const s of sprints) {
      done += s.done ?? 0;
      total += s.total ?? 0;
    }
    return {
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [sprints]);

  // 오늘 위치(%) — 기간 밖이면 마커를 세우지 않는다.
  const todayPct = useMemo(() => {
    if (!span.start || span.days <= 0) return null;
    const offset = diffDays(span.start, todayLocal());
    if (offset < 0 || offset >= span.days) return null;
    return ((offset + 0.5) / span.days) * 100;
  }, [span]);

  return (
    <div className="flex flex-col gap-2">
      {/* 마일스톤 행 — 이름·기간·전체 진척. 세그먼트는 이 기간을 나눈 것이다. */}
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <Flag className="w-3.5 h-3.5 text-bridge-accent shrink-0 self-center" />
        <span className="text-sm font-bold tracking-tight text-foreground truncate max-w-[40ch]">
          {milestoneTitle}
        </span>
        {span.start && span.end && (
          <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
            {formatMD(span.start)} – {formatMD(span.end)} · {span.days}일
          </span>
        )}
        <span className="flex-1" />
        <span className="text-xs text-slate-500 whitespace-nowrap">
          마일스톤 전체{" "}
          <span className="text-sm font-bold text-foreground tabular-nums">
            {totals.pct}%
          </span>{" "}
          <span className="tabular-nums">
            · 체크리스트 {totals.done} / {totals.total}
          </span>
        </span>
      </div>

      {/* 트랙 — 세그먼트 폭은 기간 비례(flex-grow), 오늘은 세로 점선으로 가로지른다 */}
      <div className="relative pt-4">
        {todayPct !== null && (
          <div
            className="absolute top-0 bottom-0 z-[3] border-l-2 border-dashed border-bridge-secondary pointer-events-none"
            style={{ left: `${todayPct}%` }}
            aria-hidden
          >
            <span className="absolute -top-0.5 -left-4 px-1.5 rounded-md bg-bridge-secondary text-bridge-dark text-xs font-bold whitespace-nowrap">
              오늘
            </span>
          </div>
        )}
        <div className="flex items-stretch gap-1.5">
          {sprints.map((s) => {
            const start = parseDay(s.start_date);
            const end = parseDay(s.end_date);
            const days = inclusiveDays(start, end) || 1;
            const pct = s.progress_percentage ?? 0;
            const selected = s.id === selectedSprintId;
            const unfinished = unfinishedBySprint[s.id] ?? 0;
            const stateLabel =
              s.state === "CURRENT"
                ? "진행중"
                : s.state === "PAST"
                  ? "지남"
                  : "예정";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                aria-pressed={selected}
                aria-label={`${s.name} · ${stateLabel} · ${
                  start && end ? `${formatMD(start)}부터 ${formatMD(end)}까지` : ""
                } ${pct}%`}
                style={{ flexGrow: days, flexBasis: 0 }}
                className={`group relative min-w-0 overflow-hidden rounded-xl border p-2.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                  selected
                    ? "border-bridge-accent shadow-[0_0_0_1px_var(--bridge-accent),0_0_24px_rgba(99,102,241,0.18)]"
                    : "border-foreground/[0.08] hover:border-foreground/[0.16]"
                } ${
                  s.state === "CURRENT"
                    ? "bg-bridge-accent/[0.06]"
                    : s.state === "PAST"
                      ? "bg-emerald-500/[0.05]"
                      : "bg-foreground/[0.02]"
                }`}
                title={`${s.name} · ${stateLabel}`}
              >
                {/* 진척 채움 — 세그먼트 배경 자체가 게이지다(막대를 따로 두면 줄이 두 겹이 된다) */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 transition-[width] duration-500 motion-reduce:transition-none ${
                    s.state === "PAST"
                      ? "bg-gradient-to-r from-emerald-500/25 to-emerald-500/[0.07]"
                      : s.state === "CURRENT"
                        ? "bg-gradient-to-r from-bridge-accent/30 to-bridge-accent/10"
                        : "bg-foreground/[0.05]"
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <span className="relative z-[1] flex flex-col gap-0.5 min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-foreground whitespace-nowrap">
                    <span
                      className={`w-[7px] h-[7px] rounded-full shrink-0 ${
                        s.state === "CURRENT"
                          ? "bg-bridge-accent shadow-[0_0_8px_var(--bridge-accent)]"
                          : s.state === "PAST"
                            ? "bg-emerald-500"
                            : "bg-slate-600"
                      }`}
                    />
                    <span className="truncate">{s.name}</span>
                    {s.state === "CURRENT" && (
                      <span className="text-bridge-secondary shrink-0">
                        · 진행중
                      </span>
                    )}
                  </span>
                  {start && end && (
                    <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap truncate">
                      {formatMD(start)} – {formatMD(end)}
                    </span>
                  )}
                  <span
                    className={`text-sm font-bold tabular-nums whitespace-nowrap ${
                      s.state === "FUTURE" ? "text-slate-500" : "text-foreground"
                    }`}
                  >
                    {pct}
                    <span className="text-xs text-slate-400">%</span>{" "}
                    <span className="text-xs font-medium text-slate-400">
                      {s.done} / {s.total}
                    </span>
                  </span>
                  {s.state === "PAST" &&
                    (unfinished > 0 ? (
                      <span className="self-start text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 tabular-nums whitespace-nowrap">
                        미완료 {unfinished}
                      </span>
                    ) : (
                      <span className="self-start text-xs font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        완료
                      </span>
                    ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
