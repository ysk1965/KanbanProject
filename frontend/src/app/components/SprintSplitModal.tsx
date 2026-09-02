import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus, Split } from "lucide-react";
import { MotionModal } from "./ui/MotionModal";
import {
  addDays,
  formatMD,
  formatMDW,
  inclusiveDays,
  isMonday,
  parseDay,
  toDayString,
} from "../utils/sprintDates";

/** 스프린트 하나가 가질 수 있는 최소 일수. 이보다 짧으면 담을 시간이 없다. */
const MIN_DAYS = 3;
const MAX_COUNT = 6;

export type TaskDistribution = "keep" | "unassign" | "by_date";

interface SprintSplitModalProps {
  open: boolean;
  onClose: () => void;
  /** 마일스톤 기간(yyyy-MM-dd) — 분할의 전체 범위 */
  milestoneStart: string | null;
  milestoneEnd: string | null;
  /** 현재 분할 개수. 2 이상이면 이미 나뉜 상태라 배분 기본값이 "유지"가 된다. */
  currentCount: number;
  submitting?: boolean;
  onSubmit: (payload: {
    count: number;
    boundaries: string[];
    task_distribution: TaskDistribution;
  }) => void;
}

/** n개로 균등 분할했을 때의 경계(일 오프셋) 배열 — 길이 n-1 */
function equalBounds(totalDays: number, n: number): number[] {
  const bounds: number[] = [];
  for (let i = 1; i < n; i++) bounds.push(Math.round((totalDays * i) / n));
  return bounds;
}

/**
 * 스프린트 나누기 모달 — 개수를 정하면 기간이 균등 분배되고, 세그먼트 사이 핸들을
 * 끌어 경계 날짜를 하루 단위로 조정한다. 경계는 "S{n+1}이 시작하는 날"이며,
 * 화면에서는 마일스톤 시작일로부터의 일 오프셋으로 다룬다(문자열 날짜 연산을 피하려고).
 */
export function SprintSplitModal({
  open,
  onClose,
  milestoneStart,
  milestoneEnd,
  currentCount,
  submitting = false,
  onSubmit,
}: SprintSplitModalProps) {
  const start = useMemo(() => parseDay(milestoneStart), [milestoneStart]);
  const end = useMemo(() => parseDay(milestoneEnd), [milestoneEnd]);
  const totalDays = useMemo(() => inclusiveDays(start, end), [start, end]);
  // 최소 일수를 지키며 만들 수 있는 최대 개수 — 짧은 마일스톤은 6개로 못 쪼갠다.
  const maxCount = Math.max(1, Math.min(MAX_COUNT, Math.floor(totalDays / MIN_DAYS)));

  const [count, setCount] = useState(1);
  const [bounds, setBounds] = useState<number[]>([]);
  const [distribution, setDistribution] = useState<TaskDistribution>("unassign");
  const sliderRef = useRef<HTMLDivElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // 열릴 때마다 현재 분할 상태에서 시작한다 — 열자마자 사용자의 기존 설정이 지워지면 안 된다.
  useEffect(() => {
    if (!open) return;
    const initial = Math.min(Math.max(1, currentCount), maxCount);
    setCount(initial);
    setBounds(equalBounds(totalDays, initial));
    setDistribution(currentCount > 1 ? "keep" : "unassign");
  }, [open, currentCount, maxCount, totalDays]);

  const applyCount = (n: number) => {
    const next = Math.min(Math.max(1, n), maxCount);
    setCount(next);
    setBounds(equalBounds(totalDays, next));
  };

  /** 경계 이동 — 좌우 이웃과 최소 일수를 지키도록 잘라낸다 */
  const moveBound = useCallback(
    (idx: number, day: number) => {
      setBounds((prev) => {
        const lo = (idx === 0 ? 0 : prev[idx - 1]) + MIN_DAYS;
        const hi =
          (idx === prev.length - 1 ? totalDays : prev[idx + 1]) - MIN_DAYS;
        const clamped = Math.max(lo, Math.min(hi, day));
        if (clamped === prev[idx]) return prev;
        const next = prev.slice();
        next[idx] = clamped;
        return next;
      });
    },
    [totalDays],
  );

  const onHandlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    if (!sliderRef.current) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setDraggingIdx(idx);
    const startX = e.clientX;
    const startBound = bounds[idx];
    const pxPerDay = sliderRef.current.getBoundingClientRect().width / totalDays;
    const onMove = (ev: PointerEvent) => {
      moveBound(idx, startBound + Math.round((ev.clientX - startX) / pxPerDay));
    };
    const onUp = () => {
      setDraggingIdx(null);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  // 세그먼트별 범위(일 오프셋) — bounds에서 파생
  const segments = useMemo(() => {
    const result: { startDay: number; endDay: number; days: number }[] = [];
    for (let i = 0; i <= bounds.length; i++) {
      const s = i === 0 ? 0 : bounds[i - 1];
      const e = i === bounds.length ? totalDays : bounds[i];
      result.push({ startDay: s, endDay: e, days: e - s });
    }
    return result;
  }, [bounds, totalDays]);

  // 눈금(월요일) — 주 단위 리듬이 실제 계획 기준이라 월요일만 세운다
  const mondays = useMemo(() => {
    if (!start) return [];
    const days: number[] = [];
    for (let d = 1; d < totalDays; d++) {
      if (isMonday(addDays(start, d))) days.push(d);
    }
    return days;
  }, [start, totalDays]);

  const canSplit = !!start && !!end && totalDays >= MIN_DAYS;

  const submit = () => {
    if (!start || submitting) return;
    onSubmit({
      count,
      // 서버가 받는 boundaries = 스프린트 2..N의 시작일
      boundaries: bounds.map((b) => toDayString(addDays(start, b))),
      task_distribution: distribution,
    });
  };

  return (
    <MotionModal
      open={open}
      onClose={onClose}
      accentColor
      aria-labelledby="sprint-split-title"
      className="w-full sm:max-w-2xl"
    >
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
        <span className="w-8 h-8 rounded-lg bg-bridge-accent/15 text-bridge-accent grid place-items-center shrink-0">
          <Split className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h4
            id="sprint-split-title"
            className="text-sm font-bold text-foreground"
          >
            스프린트 나누기
          </h4>
          <p className="text-xs text-slate-500 truncate">
            {start && end
              ? `${formatMD(start)} – ${formatMD(end)} · ${totalDays}일을 몇 개로 나눌지 정합니다`
              : "마일스톤 기간이 없어 나눌 수 없습니다"}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-4 flex flex-col gap-5">
        {!canSplit ? (
          <p className="text-sm text-slate-400 leading-relaxed">
            마일스톤에 시작일과 종료일을 먼저 지정해 주세요. 스프린트는 그
            기간을 나눈 버킷이라 기간이 없으면 만들 수 없습니다.
          </p>
        ) : (
          <>
            {/* 개수 스테퍼 */}
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                스프린트 개수
              </div>
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => applyCount(count - 1)}
                  disabled={count <= 1}
                  aria-label="개수 줄이기"
                  className="w-9 h-9 grid place-items-center rounded-xl border border-foreground/10 bg-foreground/[0.05] text-foreground hover:bg-foreground/10 disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-bold tabular-nums text-foreground min-w-[2ch] text-center">
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => applyCount(count + 1)}
                  disabled={count >= maxCount}
                  aria-label="개수 늘리기"
                  className="w-9 h-9 grid place-items-center rounded-xl border border-foreground/10 bg-foreground/[0.05] text-foreground hover:bg-foreground/10 disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500">
                  1 ~ {maxCount}개 · 1개 = 나누지 않음 (스프린트당 최소{" "}
                  {MIN_DAYS}일)
                </span>
              </div>
            </div>

            {/* 기간 조정 슬라이더 */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  기간 조정
                </span>
                <span className="text-xs text-slate-500">
                  경계를 드래그하거나 ←/→ 로 하루씩 · 아래 눈금은 월요일
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setBounds(equalBounds(totalDays, count))}
                  className="text-xs font-bold text-slate-400 hover:text-foreground rounded-md px-1 focus:outline-none focus:ring-2 focus:ring-bridge-accent/50 transition-colors"
                >
                  균등으로 초기화
                </button>
              </div>

              <div
                ref={sliderRef}
                className="relative flex items-stretch select-none touch-none"
              >
                {/* 월요일 줄무늬 — 경계를 주 시작에 맞추고 싶을 때의 눈 안내선 */}
                {mondays.map((d) => (
                  <span
                    key={d}
                    aria-hidden
                    className="absolute top-1 bottom-1 z-[1] border-l border-dashed border-foreground/15 pointer-events-none"
                    style={{ left: `${(d / totalDays) * 100}%` }}
                  />
                ))}
                {segments.map((seg, i) => (
                  <div key={`seg-${i}`} className="contents">
                    <div
                      style={{ flexGrow: seg.days, flexBasis: 0 }}
                      className="min-w-0 overflow-hidden mx-0.5 rounded-xl border border-bridge-accent/30 bg-bridge-accent/15 px-1.5 py-2.5 flex flex-col items-center justify-center gap-0.5 text-center"
                    >
                      <span className="text-xs font-bold text-foreground">
                        S{i + 1}
                      </span>
                      <span className="text-xs text-foreground tabular-nums whitespace-nowrap truncate max-w-full">
                        {start && formatMDW(addDays(start, seg.startDay))} –{" "}
                        {start && formatMDW(addDays(start, seg.endDay - 1))}
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums">
                        {seg.days}일
                      </span>
                    </div>
                    {i < segments.length - 1 && (
                      <button
                        type="button"
                        role="slider"
                        aria-label={`스프린트 ${i + 2} 시작일 조정`}
                        aria-valuemin={MIN_DAYS}
                        aria-valuemax={totalDays - MIN_DAYS}
                        aria-valuenow={bounds[i]}
                        aria-valuetext={
                          start
                            ? `S${i + 2} 시작 ${formatMDW(addDays(start, bounds[i]))}`
                            : undefined
                        }
                        onPointerDown={onHandlePointerDown(i)}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            moveBound(i, bounds[i] - 1);
                          } else if (e.key === "ArrowRight") {
                            e.preventDefault();
                            moveBound(i, bounds[i] + 1);
                          }
                        }}
                        className="group relative z-[2] w-5 -mx-2.5 shrink-0 grid place-items-center cursor-ew-resize bg-transparent border-none p-0 focus:outline-none"
                      >
                        <span
                          className={`w-[5px] h-9 rounded-[3px] border border-bridge-obsidian transition-colors ${
                            draggingIdx === i
                              ? "bg-bridge-accent shadow-[0_0_10px_rgba(99,102,241,0.6)]"
                              : "bg-slate-500 group-hover:bg-bridge-accent group-focus-visible:bg-bridge-accent group-focus-visible:shadow-[0_0_0_3px_rgba(99,102,241,0.35)]"
                          }`}
                        />
                        {start && (
                          <span
                            className={`absolute bottom-[calc(100%+7px)] left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-md bg-bridge-dark border border-foreground/15 text-xs font-bold text-foreground tabular-nums whitespace-nowrap pointer-events-none z-[5] ${
                              draggingIdx === i
                                ? "block"
                                : "hidden group-hover:block group-focus-visible:block"
                            }`}
                          >
                            ~{formatMDW(addDays(start, bounds[i] - 1))} | S
                            {i + 2} 시작 {formatMDW(addDays(start, bounds[i]))}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* 월요일 자 — 시작·끝은 요일까지 굵게 */}
              <div className="relative h-6 mx-0.5 mt-2">
                {start && (
                  <span className="absolute top-0 text-xs font-bold text-slate-400 tabular-nums whitespace-nowrap">
                    {formatMDW(start)}
                  </span>
                )}
                {start &&
                  mondays
                    .filter((d) => d < totalDays - MIN_DAYS && d > MIN_DAYS)
                    .map((d) => (
                      <span
                        key={`tick-${d}`}
                        className="absolute top-0 -translate-x-1/2 text-xs text-slate-600 tabular-nums whitespace-nowrap"
                        style={{ left: `${(d / totalDays) * 100}%` }}
                      >
                        {formatMD(addDays(start, d))}
                      </span>
                    ))}
                {end && (
                  <span className="absolute top-0 right-0 text-xs font-bold text-slate-400 tabular-nums whitespace-nowrap">
                    {formatMDW(end)}
                  </span>
                )}
              </div>
            </div>

            {/* 담긴 태스크 배분 */}
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                담긴 태스크 배분
              </div>
              <div className="flex flex-col gap-2">
                {(
                  [
                    {
                      key: "unassign",
                      label: "모두 미배정으로 두기",
                      hint: "업무 리스트에서 직접 담습니다",
                    },
                    {
                      key: "by_date",
                      label: "기간순 자동 배분",
                      hint: "태스크 시작일이 속한 스프린트로 자동 배치",
                    },
                    {
                      key: "keep",
                      label: "기존 배정 유지",
                      hint: "지금 담긴 스프린트를 그대로 둡니다",
                    },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-start gap-2.5 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="sprint-split-distribution"
                      checked={distribution === opt.key}
                      onChange={() => setDistribution(opt.key)}
                      className="mt-1 accent-bridge-accent focus:outline-none focus:ring-2 focus:ring-bridge-accent/50"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-foreground">
                        {opt.label}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {opt.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
        <span className="text-xs text-slate-600">Esc 닫기</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSplit || submitting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-bridge-accent hover:bg-bridge-accent/90 disabled:opacity-40 transition-colors"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {count === 1 ? "하나로 합치기" : `${count}개로 나누기`}
          </button>
        </div>
      </div>
    </MotionModal>
  );
}
