import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 두 칸으로 나뉜 영역의 배분을 사용자 손에 넘기고, 그 값을 브라우저에 남긴다.
 *
 * 대시보드의 배분이 코드 상수면 안 되는 이유는 단순하다 — 간트에 바가 한 줄뿐인 날과
 * 미배치가 스무 건 쌓인 날은 필요한 배분이 정반대고, 화면 폭도 사람마다 다르다.
 * 기본값은 그대로 두고, 손댄 사람만 그 값을 남긴다.
 *
 * 축은 둘 다 지원한다:
 *   axis "y" — 위아래로 쌓인 칸 (앞 칸의 height를 잡는다)
 *   axis "x" — 좌우로 놓인 칸 (앞 칸의 width를 잡는다)
 * 뒤 칸은 언제나 "남는 만큼"이라 따로 계산하지 않는다.
 */

export interface PersistentSplitOptions {
  /** 브라우저에 남길 키. 보드·계정과 무관한 이 브라우저의 취향이다 */
  storageKey: string;
  axis: "x" | "y";
  /** 손대지 않은 사람이 보는 값 */
  defaultSize: number;
  /** 앞 칸이 의미를 잃지 않는 최소치 */
  minSize: number;
  /** 뒤 칸이 의미를 잃지 않는 최소치 — 앞 칸의 상한을 정한다 */
  minOtherSize: number;
  /** 손잡이가 차지하는 두께 */
  handleSize: number;
  /**
   * 손잡이가 어느 칸을 잡고 있는지.
   *   "start" (기본) — 앞 칸의 크기를 잡는다. 손잡이를 끌어내리면 앞 칸이 커진다.
   *   "end"          — 뒤 칸의 크기를 잡는다. 손잡이를 끌어내리면 뒤 칸이 작아진다.
   *
   * 세 칸으로 쌓인 스택에서 가운데 칸을 "남는 만큼"으로 두려면 아래 칸은 자기 크기를
   * 갖되 손잡이가 그 위에 놓인다 — 그때 드래그 방향이 뒤집히므로 이 값이 필요하다.
   */
  anchor?: "start" | "end";
  /**
   * 드래그 중 DOM에 직접 값을 쓰는 방법. 기본은 paneRef의 width/height.
   * 그리드처럼 크기가 부모에 적혀 있으면 여기서 CSS 변수를 대신 쓴다.
   */
  applyDragSize?: (px: number) => void;
  /**
   * 크기를 잴 컨테이너를 밖에서 들고 있을 때. 안 넘기면 훅이 만들어 돌려준다.
   * (그리드처럼 컨테이너와 크기를 적는 노드가 같은 경우 하나로 합치기 위한 것)
   */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

/** 키보드 조작 단위 (Shift는 3배) */
const KEY_STEP = 16;

function readStored(storageKey: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    // 시크릿 모드 등 — 저장만 안 될 뿐 조절은 된다
    return null;
  }
}

export function usePersistentSplit({
  storageKey,
  axis,
  defaultSize,
  minSize,
  minOtherSize,
  handleSize,
  anchor = "start",
  applyDragSize,
  containerRef: externalContainerRef,
}: PersistentSplitOptions) {
  /** 두 칸을 담는 영역 — 여기 크기가 곧 나눠 가질 수 있는 전부다 */
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = externalContainerRef ?? ownContainerRef;
  /** 앞 칸 — 드래그 중에는 state 대신 이 노드의 style을 직접 쓴다 */
  const paneRef = useRef<HTMLElement | null>(null);

  const [stored, setStored] = useState<number>(
    () => readStored(storageKey) ?? defaultSize,
  );
  /** 컨테이너를 아직 못 쟀을 때는 상한을 걸지 않는다 */
  const [maxSize, setMaxSize] = useState<number>(Number.POSITIVE_INFINITY);

  // 창이 줄면 상한도 줄어든다. 저장값은 건드리지 않아서,
  // 큰 화면으로 돌아오면 원래 배분이 그대로 복원된다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const total = axis === "x" ? rect.width : rect.height;
      if (total <= 0) return;
      setMaxSize(Math.max(minSize, total - minOtherSize - handleSize));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [axis, containerRef, minSize, minOtherSize, handleSize]);

  const clamp = useCallback(
    (value: number) => Math.round(Math.min(Math.max(value, minSize), maxSize)),
    [minSize, maxSize],
  );

  /** 실제로 그리는 값 — 저장값과 다를 수 있다(작은 화면에서 눌린 경우) */
  const size = clamp(stored);

  const commit = useCallback(
    (next: number) => {
      const value = clamp(next);
      setStored(value);
      try {
        localStorage.setItem(storageKey, String(value));
      } catch {
        /* 저장 실패는 조용히 넘긴다 — 이번 세션 동안은 값이 살아 있다 */
      }
    },
    [clamp, storageKey],
  );

  const reset = useCallback(() => {
    setStored(defaultSize);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* 무시 */
    }
  }, [defaultSize, storageKey]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.focus();

      const start = axis === "x" ? e.clientX : e.clientY;
      const startSize = size;

      // 드래그 중 텍스트 선택·커서 깜빡임을 막는다 (간트·타임블록 위를 지나가므로)
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      // 뒤 칸을 잡고 있으면 손잡이가 나아가는 쪽이 곧 그 칸이 줄어드는 쪽이다
      const dir = anchor === "end" ? -1 : 1;
      const sizeAt = (ev: PointerEvent) =>
        clamp(
          startSize + dir * ((axis === "x" ? ev.clientX : ev.clientY) - start),
        );

      // 매 프레임 setState하면 간트·타임블록이 통째로 다시 그려진다.
      // 드래그 동안에는 DOM만 만지고, 손을 뗄 때 한 번 커밋한다.
      const handleMove = (ev: PointerEvent) => {
        const px = sizeAt(ev);
        if (applyDragSize) applyDragSize(px);
        else if (paneRef.current) {
          paneRef.current.style[axis === "x" ? "width" : "height"] = `${px}px`;
        }
      };
      const handleUp = (ev: PointerEvent) => {
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
        commit(sizeAt(ev));
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [anchor, applyDragSize, axis, clamp, commit, size],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? KEY_STEP * 3 : KEY_STEP;
      // 세로 축은 ↑↓, 가로 축은 ←→ (읽는 방향과 손이 맞아야 한다).
      // 뒤 칸을 잡고 있으면 손잡이가 가는 쪽과 칸이 커지는 쪽이 반대다.
      const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
      const forward = axis === "x" ? "ArrowRight" : "ArrowDown";
      const decrease = anchor === "end" ? forward : back;
      const increase = anchor === "end" ? back : forward;

      switch (e.key) {
        case decrease:
          e.preventDefault();
          commit(size - step);
          break;
        case increase:
          e.preventDefault();
          commit(size + step);
          break;
        // 양 끝 — 뒤 칸을 최대로 / 앞 칸을 최대로
        case "Home":
          e.preventDefault();
          commit(minSize);
          break;
        case "End":
          e.preventDefault();
          // 아직 컨테이너를 못 쟀으면(상한 = ∞) 무한대를 저장하지 않는다
          if (Number.isFinite(maxSize)) commit(maxSize);
          break;
        case "Backspace":
        case "Delete":
          e.preventDefault();
          reset();
          break;
        default:
      }
    },
    [anchor, axis, commit, maxSize, minSize, reset, size],
  );

  return {
    containerRef,
    paneRef,
    /** 지금 그릴 앞 칸 크기 (px) */
    size,
    /** 컨테이너가 허용하는 최대 — aria-valuemax와 End 키가 쓴다. 측정 전에는 ∞ */
    maxSize,
    onPointerDown,
    onKeyDown,
    reset,
  };
}
