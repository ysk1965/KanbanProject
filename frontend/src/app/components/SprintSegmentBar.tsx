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
  /** 스프린트 id → END에 닿지 못한 태스크 수. 지난 세그먼트의 미완료 도트 근거. */
  unfinishedBySprint: Record<string, number>;
  onSelect: (sprintId: string) => void;
}

/**
 * 원라인 세그먼트 스프린트 바 — 마일스톤 라벨과 기간 비례 미니 세그먼트 트랙을 한 줄에 담는다.
 * 상세 수치·액션은 이 컴포넌트 바깥(같은 행의 우측)이 맡고, 여기는 "지금 어디쯤"의 공간감만 책임진다.
 *  · 지남(PAST)은 에메랄드로 가라앉고, 진행중(CURRENT)만 액센트로 빛나며, 예정(FUTURE)은 윤곽만 남는다.
 *  · 세그먼트 클릭 = 보드 스코프 전환. 상세(기간·진척 전체)는 세그먼트 tooltip으로 내려간다.
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

  const single = sprints.length === 1;

  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      {/* 마일스톤 라벨 — 기간·전체 진척은 tooltip과 넓은 화면의 보조 텍스트로 */}
      <span
        className="flex items-center gap-1.5 shrink-0 min-w-0"
        title={
          span.start && span.end
            ? `${milestoneTitle} · ${formatMD(span.start)}–${formatMD(span.end)} · ${span.days}일 · 전체 ${totals.pct}% (${totals.done}/${totals.total})`
            : milestoneTitle
        }
      >
        <Flag className="w-3.5 h-3.5 text-bridge-accent shrink-0" />
        <span className="text-xs font-bold tracking-tight text-foreground truncate max-w-[18ch]">
          {milestoneTitle}
        </span>
        <span className="hidden xl:inline text-xs text-slate-500 tabular-nums whitespace-nowrap">
          전체 {totals.pct}%
        </span>
      </span>

      {/* 미니 트랙 — 세그먼트 폭은 기간 비례(flex-grow), 오늘은 세로 점선 틱 */}
      <div className="relative flex-1 min-w-[160px]">
        {todayPct !== null && (
          <div
            className="absolute -top-1 -bottom-1 z-[3] border-l-2 border-dashed border-bridge-secondary pointer-events-none"
            style={{ left: `${todayPct}%` }}
            title="오늘"
            aria-hidden
          />
        )}
        <div className="flex items-stretch gap-1">
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
            const shortName = single ? s.name : `S${s.sequence_no}`;
            const tip = [
              s.name,
              stateLabel,
              start && end ? `${formatMD(start)}–${formatMD(end)}` : null,
              `${pct}% (${s.done}/${s.total})`,
              s.state === "PAST" && unfinished > 0
                ? `미완료 ${unfinished}개`
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                aria-pressed={selected}
                aria-label={tip}
                title={tip}
                style={{ flexGrow: days, flexBasis: 0 }}
                className={`relative h-8 min-w-0 overflow-hidden rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 ${
                  selected
                    ? "border-bridge-accent shadow-[0_0_0_1px_var(--bridge-accent),0_0_16px_rgba(99,102,241,0.18)]"
                    : "border-foreground/[0.08] hover:border-foreground/[0.16]"
                } ${
                  s.state === "CURRENT"
                    ? "bg-bridge-accent/[0.06]"
                    : s.state === "PAST"
                      ? "bg-emerald-500/[0.05]"
                      : "bg-foreground/[0.02]"
                }`}
              >
                {/* 진척 채움 — 세그먼트 배경 자체가 게이지다 */}
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
                <span className="relative z-[1] flex items-center gap-1.5 px-2 min-w-0 whitespace-nowrap">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      s.state === "CURRENT"
                        ? "bg-bridge-accent shadow-[0_0_6px_var(--bridge-accent)]"
                        : s.state === "PAST"
                          ? "bg-emerald-500"
                          : "bg-slate-600"
                    }`}
                  />
                  <span className="text-xs font-bold text-foreground truncate">
                    {shortName}
                  </span>
                  <span
                    className={`text-xs font-medium tabular-nums truncate ${
                      s.state === "FUTURE" ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    {pct}%
                  </span>
                  {/* 지난 버킷의 미완료 신호 — 칩 대신 도트로 압축, 상세는 tooltip */}
                  {s.state === "PAST" && unfinished > 0 && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                      aria-hidden
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
