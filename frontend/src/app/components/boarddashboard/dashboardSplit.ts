import { useCallback, useRef } from "react";
import { usePersistentSplit } from "./usePersistentSplit";
import { WORKLOAD_CARD_HEIGHT } from "./dashboardUtils";

/**
 * 대시보드의 세 배분 — 좌우(타임블록 │ 오른쪽 열)와 상하 둘(워크로드 │ 배치 대기 │ 백로그).
 *
 * 셋 다 지금까지 코드 상수였고, 셋 다 "그날 무엇이 급한가"에 따라 답이 달라지는 값이다.
 * 손잡이로 사용자에게 넘기고 브라우저에 남긴다. 저장 키는 보드·계정과 무관하다 —
 * 보드를 옮길 때마다 다시 맞추게 하는 건 취향이 아니라 노동이기 때문이다.
 *
 * 오른쪽 열은 카드 셋이 쌓인 스택이다. 가운데(배치 대기)가 "남는 만큼"을 가져가고,
 * 위(워크로드)와 아래(백로그)가 각자 크기를 갖는다. 그래서 아래 손잡이는 뒤 칸을
 * 잡는다(anchor: "end") — 끌어올리면 백로그가 커지고 배치 대기가 줄어든다.
 */

/** 손잡이 두께 — 원래 두 칸 사이 gap-3(12px)을 그대로 이어받는다 */
export const SPLIT_HANDLE_SIZE = 12;

/* ── 상하 ①: 워크로드 │ 큐 스택 ─────────────────────── */

/**
 * 간트 카드 하한 — 헤더 40 + 타임라인 헤더 48 + 마일스톤 밴드 48 + 이벤트 밴드 48 +
 * 담당자 한 레인 47. 이보다 줄이면 바가 한 줄도 안 보여 카드가 의미를 잃는다.
 */
export const MIN_WORKLOAD_HEIGHT = 236;

/** 배치 대기 하한 — 헤더 40 + 행 셋 + 힌트 줄. 목록이 0행이 되는 배분은 막는다 */
export const MIN_PLACEMENT_HEIGHT = 140;

/**
 * 백로그 하한 — 머리 40 + 트랙 여백 22 + 카드 한 장 73(제목 두 줄 기준) + 여유.
 * 카드가 잘리면 트랙이 세로로도 넘쳐 스크롤바가 두 방향으로 생긴다.
 */
export const MIN_BACKLOG_HEIGHT = 142;

/** 백로그 기본 높이 — 한 줄. 늘리면 카드가 세로로 접혀 한 화면에 더 들어온다 */
export const DEFAULT_BACKLOG_HEIGHT = MIN_BACKLOG_HEIGHT;

/** 접힌 백로그가 남기는 높이 = 머리 한 줄 (PanelShell의 h-10) */
export const BACKLOG_COLLAPSED_HEIGHT = 40;

/** 큐 스택 하한 — 배치 대기 + 손잡이 + 백로그. 백로그가 없으면 배치 대기 하한만이다 */
export const MIN_QUEUE_HEIGHT =
  MIN_PLACEMENT_HEIGHT + SPLIT_HANDLE_SIZE + MIN_BACKLOG_HEIGHT;

/**
 * 워크로드 카드 높이를 잡는다 — 큐 스택은 남는 만큼 가져간다.
 *
 * @param minQueueHeight 큐 스택이 요구하는 최소 높이. 백로그가 없는 화면
 *   (남의 대시보드)에서는 배치 대기 몫만 남으므로 부르는 쪽이 낮춰 넘긴다.
 */
export function useWorkloadSplit(minQueueHeight: number = MIN_QUEUE_HEIGHT) {
  return usePersistentSplit({
    storageKey: "bridge:dashboard:workloadHeight:v1",
    axis: "y",
    defaultSize: WORKLOAD_CARD_HEIGHT,
    minSize: MIN_WORKLOAD_HEIGHT,
    minOtherSize: minQueueHeight,
    handleSize: SPLIT_HANDLE_SIZE,
  });
}

/* ── 상하 ②: 배치 대기 │ 백로그 ─────────────────────── */

/** 백로그 높이가 담기는 CSS 변수 — 드래그 중에는 이 값만 갈아 끼운다 */
export const BACKLOG_HEIGHT_VAR = "--dash-backlog-h";

/**
 * 백로그 카드 높이를 잡는다 — 배치 대기는 남는 만큼이다.
 *
 * 크기를 재는 기준은 큐 스택(= 워크로드를 뺀 나머지)이다. 위 손잡이가 움직이면
 * 이 컨테이너의 높이가 따라 변하고 ResizeObserver가 상한을 다시 계산하므로,
 * 두 손잡이가 서로의 값을 참조하지 않아도 배분이 어긋나지 않는다.
 */
export function useBacklogSplit() {
  const queueRef = useRef<HTMLDivElement | null>(null);

  const applyDragSize = useCallback((px: number) => {
    queueRef.current?.style.setProperty(BACKLOG_HEIGHT_VAR, `${px}px`);
  }, []);

  return usePersistentSplit({
    storageKey: "bridge:dashboard:backlogHeight:v1",
    axis: "y",
    anchor: "end",
    defaultSize: DEFAULT_BACKLOG_HEIGHT,
    minSize: MIN_BACKLOG_HEIGHT,
    minOtherSize: MIN_PLACEMENT_HEIGHT,
    handleSize: SPLIT_HANDLE_SIZE,
    applyDragSize,
    containerRef: queueRef,
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
