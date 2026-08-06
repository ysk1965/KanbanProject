import { useCallback, useRef } from "react";
import { usePersistentSplit } from "./usePersistentSplit";
import { WORKLOAD_CARD_HEIGHT } from "./dashboardUtils";

/**
 * 대시보드의 두 배분 — 좌우(타임블록 │ 워크로드)와 상하(간트 │ 큐).
 *
 * 둘 다 지금까지 코드 상수였고, 둘 다 "그날 무엇이 급한가"에 따라 답이 달라지는 값이다.
 * 손잡이 두 개로 사용자에게 넘기고 브라우저에 남긴다. 저장 키는 보드·계정과 무관하다 —
 * 보드를 옮길 때마다 다시 맞추게 하는 건 취향이 아니라 노동이기 때문이다.
 */

/** 손잡이 두께 — 원래 두 칸 사이 gap-3(12px)을 그대로 이어받는다 */
export const SPLIT_HANDLE_SIZE = 12;

/* ── 상하: 간트 │ 큐 ───────────────────────────────── */

/**
 * 간트 카드 하한 — 헤더 45 + 타임라인 헤더 48 + 마일스톤 밴드 48 + 이벤트 밴드 48 +
 * 담당자 한 레인 47. 이보다 줄이면 바가 한 줄도 안 보여 카드가 의미를 잃는다.
 */
export const MIN_WORKLOAD_HEIGHT = 236;

/** 큐 하한 — 탭 줄 37 + 세 행 + 백로그 독. 목록이 0행이 되는 배분은 막는다 */
export const MIN_QUEUE_HEIGHT = 176;

/** 간트 높이를 잡는다 — 큐는 남는 만큼 가져간다 */
export function useWorkloadSplit() {
  return usePersistentSplit({
    storageKey: "bridge:dashboard:workloadHeight:v1",
    axis: "y",
    defaultSize: WORKLOAD_CARD_HEIGHT,
    minSize: MIN_WORKLOAD_HEIGHT,
    minOtherSize: MIN_QUEUE_HEIGHT,
    handleSize: SPLIT_HANDLE_SIZE,
  });
}

/* ── 좌우: 타임블록 │ 워크로드 ─────────────────────── */

/** 왼쪽 열 기본 폭 — 타임블록 카드가 제목·태스크명 두 줄을 자르지 않고 담는 최소치 */
export const DEFAULT_TIMEBLOCK_WIDTH = 380;

/** 왼쪽 하한 — 시간 축 80 + 블록 제목 한 줄. 더 줄이면 블록이 시각 표시로만 남는다 */
export const MIN_TIMEBLOCK_WIDTH = 260;

/** 오른쪽 하한 — 간트가 한 주(7칸)를 최소 줌으로 그리고 레일 행이 접히지 않는 폭 */
export const MIN_WORKLOAD_COLUMN_WIDTH = 520;

/** 그리드 열 폭이 담기는 CSS 변수 — 드래그 중에는 이 값만 갈아 끼운다 */
export const TIMEBLOCK_WIDTH_VAR = "--dash-timeblock-w";

/**
 * 왼쪽(타임블록) 열 폭을 잡는다 — 오른쪽은 남는 만큼이다.
 *
 * 폭은 그리드 템플릿에 적혀 있어 열 자신이 아니라 부모가 들고 있다.
 * 그래서 드래그 중에는 부모의 CSS 변수를 갈아 끼운다(리렌더 없이 즉시 반영된다).
 * xl 미만에서는 두 열이 한 줄로 접히므로 손잡이는 숨기고 이 값은 쓰이지 않는다.
 */
export function useTimeblockColumnSplit() {
  const gridRef = useRef<HTMLDivElement | null>(null);

  const applyDragSize = useCallback((px: number) => {
    gridRef.current?.style.setProperty(TIMEBLOCK_WIDTH_VAR, `${px}px`);
  }, []);

  // 컨테이너 = 그리드 자신이다 (열 폭을 재는 기준이자 변수를 들고 있는 노드)
  return usePersistentSplit({
    storageKey: "bridge:dashboard:timeblockWidth:v1",
    axis: "x",
    defaultSize: DEFAULT_TIMEBLOCK_WIDTH,
    minSize: MIN_TIMEBLOCK_WIDTH,
    minOtherSize: MIN_WORKLOAD_COLUMN_WIDTH,
    handleSize: SPLIT_HANDLE_SIZE,
    applyDragSize,
    containerRef: gridRef,
  });
}
