import type { KeyboardEvent, PointerEvent } from "react";
import { useTranslation } from "react-i18next";

interface SplitHandleProps {
  /**
   * horizontal = 위아래로 쌓인 칸 사이 (좌우로 길게 눕는다)
   * vertical   = 좌우로 놓인 칸 사이 (위아래로 길게 선다)
   * WAI-ARIA separator의 aria-orientation과 같은 뜻이다 — 손잡이가 아니라 "경계"의 방향.
   */
  orientation: "horizontal" | "vertical";
  /** 현재 앞 칸 크기 (px) */
  value: number;
  min: number;
  /** 측정 전에는 ∞라 aria에 싣지 않는다 */
  max: number;
  label: string;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** 더블클릭 — 기본 배분으로 되돌린다 */
  onReset: () => void;
  /** display를 포함해서 넘긴다 — 예: "flex" 또는 "hidden xl:flex" */
  className: string;
}

/**
 * 두 칸 사이의 경계를 손잡이로 만든다.
 *
 * 평소에는 거의 보이지 않는 선이다가 hover·focus에서 액센트로 굵어진다 —
 * 대시보드는 늘 보는 화면이라 손잡이가 항상 눈에 띄면 그게 소음이 된다.
 * 드래그(포인터)·방향키(키보드)·더블클릭(초기화) 셋 다 같은 자리에서 받는다.
 */
export function SplitHandle({
  orientation,
  value,
  min,
  max,
  label,
  onPointerDown,
  onKeyDown,
  onReset,
  className,
}: SplitHandleProps) {
  const { t } = useTranslation();
  const isRow = orientation === "horizontal";

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      tabIndex={0}
      title={t(
        "boardDashboard.splitHandleHint",
        "끌어서 조절 · 더블클릭 초기화",
      )}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      /* display는 부르는 쪽이 정한다 — 여기서 flex를 박으면 "좁은 화면에선 숨김"과 충돌한다 */
      className={`group flex-none items-center justify-center rounded-lg touch-none
        focus:outline-none focus-visible:ring-2 focus-visible:ring-bridge-accent/50 ${
          isRow
            ? "h-3 w-full cursor-row-resize"
            : "w-3 h-full cursor-col-resize"
        } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`rounded-full bg-foreground/10 transition-colors
          group-hover:bg-bridge-accent/60 group-focus-visible:bg-bridge-accent/60 ${
            isRow ? "h-[3px] w-10" : "w-[3px] h-10"
          }`}
      />
    </div>
  );
}
