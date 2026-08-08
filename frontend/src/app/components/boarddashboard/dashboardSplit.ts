import { useCallback, useRef } from "react";
import { usePersistentSplit } from "./usePersistentSplit";
import { WORKLOAD_CARD_HEIGHT } from "./dashboardUtils";

/**
 * 대시보드의 세 배분 — 좌우 둘(타임블록 │ 큐 열 │ 백로그)과 상하 하나(워크로드 │ 배치 대기).
 *
 * 셋 다 지금까지 코드 상수였고, 셋 다 "그날 무엇이 급한가"에 따라 답이 달라지는 값이다.
 * 손잡이로 사용자에게 넘기고 브라우저에 남긴다. 저장 키는 보드·계정과 무관하다 —
 * 보드를 옮길 때마다 다시 맞추게 하는 건 취향이 아니라 노동이기 때문이다.
 *
 * 백로그는 세로로 쌓인 카드가 아니라 오른쪽 끝 열이다. 세 카드가 세로를 다투던 동안에는
 * 간트 행이 늘어난 날 배치 대기가 0행으로 눌려 사라졌다 — 백로그를 옆으로 빼면
 * 세로를 다투는 건 워크로드와 배치 대기 둘뿐이고, 그 경계는 손잡이 하나로 정리된다.
 */

/** 손잡이 두께 — 원래 두 칸 사이 gap-3(12px)을 그대로 이어받는다 */
export const SPLIT_HANDLE_SIZE = 12;

/* ── 상하: 워크로드 │ 배치 대기 ─────────────────────── */

/**
 * 간트 카드 하한 — 헤더 40 + 타임라인 헤더 48 + 마일스톤 밴드 48 + 이벤트 밴드 48 +
 * 담당자 한 레인 47. 이보다 줄이면 바가 한 줄도 안 보여 카드가 의미를 잃는다.
 */
export const MIN_WORKLOAD_HEIGHT = 236;

/** 배치 대기 하한 — 헤더 40 + 행 셋 + 힌트 줄. 목록이 0행이 되는 배분은 막는다 */
export const MIN_PLACEMENT_HEIGHT = 140;

/**
 * 워크로드 카드 높이를 잡는다 — 배치 대기는 남는 만큼 가져간다.
 *
 * 이 높이는 카드에 실제로 적혀야 한다(paneRef). 안 적으면 간트가 내용 높이로 부풀어
 * 배치 대기가 0으로 눌리는데, 그게 정확히 "워크로드가 길어진 날 배치 대기가 안 보인다"의
 * 원인이었다. 하한(minOtherSize)은 그 눌림을 막는 마지막 방어선이다.
 */
export function useWorkloadSplit() {
  return usePersistentSplit({
    storageKey: "bridge:dashboard:workloadHeight:v1",
    axis: "y",
    defaultSize: WORKLOAD_CARD_HEIGHT,
    minSize: MIN_WORKLOAD_HEIGHT,
    minOtherSize: MIN_PLACEMENT_HEIGHT,
    handleSize: SPLIT_HANDLE_SIZE,
  });
}

/* ── 좌우 ②: 큐 열 │ 백로그 열 ─────────────────────── */

/** 백로그 열 하한 — 카드 208 + 좌우 여백 28. 더 줄이면 카드가 잘린다 */
export const MIN_BACKLOG_WIDTH = 236;

/** 백로그 열 기본 폭 — 카드 한 장이 여유롭게 서고 머리 제목이 안 잘리는 폭 */
export const DEFAULT_BACKLOG_WIDTH = 268;

/** 접힌 백로그 열이 남기는 폭 — 세로로 세운 제목 한 줄 */
export const BACKLOG_COLLAPSED_WIDTH = 40;

/** 큐 열 하한 — 간트가 한 주(7칸)를 최소 줌으로 그리고 레일 행이 접히지 않는 폭 */
export const MIN_QUEUE_COLUMN_WIDTH = 520;

/** 백로그 열 폭이 담기는 CSS 변수 — 드래그 중에는 이 값만 갈아 끼운다 */
export const BACKLOG_WIDTH_VAR = "--dash-backlog-w";

/**
 * 백로그 열 폭을 잡는다 — 큐 열은 남는 만큼이다.
 *
 * 손잡이가 뒤 칸(백로그)을 잡으므로 방향이 뒤집힌다(anchor: "end") —
 * 왼쪽으로 끌면 백로그가 넓어지고 큐 열이 줄어든다.
 *
 * 크기를 재는 기준은 "타임블록을 뺀 나머지"다. 왼쪽 손잡이가 움직이면 이 컨테이너의
 * 폭이 따라 변하고 ResizeObserver가 상한을 다시 계산하므로, 두 손잡이가 서로의 값을
 * 참조하지 않아도 배분이 어긋나지 않는다.
 */
export function useBacklogColumnSplit() {
  const rightRef = useRef<HTMLDivElement | null>(null);

  const applyDragSize = useCallback((px: number) => {
    rightRef.current?.style.setProperty(BACKLOG_WIDTH_VAR, `${px}px`);
  }, []);

  return usePersistentSplit({
    storageKey: "bridge:dashboard:backlogWidth:v1",
    axis: "x",
    anchor: "end",
    defaultSize: DEFAULT_BACKLOG_WIDTH,
    minSize: MIN_BACKLOG_WIDTH,
    minOtherSize: MIN_QUEUE_COLUMN_WIDTH,
    handleSize: SPLIT_HANDLE_SIZE,
    applyDragSize,
    containerRef: rightRef,
  });
}

/* ── 좌우 ①: 타임블록 │ 나머지 ─────────────────────── */

/** 왼쪽 열 기본 폭 — 타임블록 카드가 제목·태스크명 두 줄을 자르지 않고 담는 최소치 */
export const DEFAULT_TIMEBLOCK_WIDTH = 380;

/** 왼쪽 하한 — 시간 축 80 + 블록 제목 한 줄. 더 줄이면 블록이 시각 표시로만 남는다 */
export const MIN_TIMEBLOCK_WIDTH = 260;

/** 오른쪽 하한 — 큐 열 + 손잡이 + 백로그 열이 각자 하한을 지킬 수 있는 폭 */
export const MIN_RIGHT_COLUMNS_WIDTH =
  MIN_QUEUE_COLUMN_WIDTH + SPLIT_HANDLE_SIZE + MIN_BACKLOG_WIDTH;

/** 그리드 열 폭이 담기는 CSS 변수 — 드래그 중에는 이 값만 갈아 끼운다 */
export const TIMEBLOCK_WIDTH_VAR = "--dash-timeblock-w";

/**
 * 왼쪽(타임블록) 열 폭을 잡는다 — 오른쪽은 남는 만큼이다.
 *
 * 폭은 그리드 템플릿에 적혀 있어 열 자신이 아니라 부모가 들고 있다.
 * 그래서 드래그 중에는 부모의 CSS 변수를 갈아 끼운다(리렌더 없이 즉시 반영된다).
 * xl 미만에서는 열들이 한 줄로 접히므로 손잡이는 숨기고 이 값은 쓰이지 않는다.
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
    minOtherSize: MIN_RIGHT_COLUMNS_WIDTH,
    handleSize: SPLIT_HANDLE_SIZE,
    applyDragSize,
    containerRef: gridRef,
  });
}
