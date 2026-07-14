import { useEffect } from "react";

/**
 * 전역 가로 스크롤 휠 지원 훅.
 *
 * 마우스 휠(세로 delta)만 있는 사용자도 가로 스크롤 영역(스프린트 보드,
 * 워크로드 캘린더, 마일스톤 타임라인 등)을 이동할 수 있게 한다.
 *
 * 동작 규칙 (wheel 이벤트 발생 시):
 *   1. 이미 가로 delta가 우세하면(트랙패드 2-finger 가로 제스처) → 네이티브 그대로.
 *   2. 이벤트 지점에서 가장 가까운 "가로 스크롤 가능" 조상을 탐색.
 *   3. 세로 delta가 우세할 때:
 *      - Cmd(metaKey)/Shift 를 누르고 있으면 → 무조건 가로로 변환.
 *      - 순수 가로 영역(세로 스크롤 불가)이면 → 자동으로 가로로 변환.
 *      - 세로 스크롤도 가능한 영역이면 → 수식키 없이는 건드리지 않음(네이티브 세로).
 *   4. 스크롤이 양 끝단에 닿으면 preventDefault 하지 않아 부모/페이지로 자연스럽게 넘긴다.
 *
 * 앱 루트(App)에서 1회 호출한다.
 */
export function useHorizontalWheelScroll() {
  useEffect(() => {
    const canScrollHorizontally = (el: HTMLElement): boolean => {
      if (el.scrollWidth - el.clientWidth <= 1) return false;
      const overflowX = getComputedStyle(el).overflowX;
      return overflowX === "auto" || overflowX === "scroll";
    };

    const canScrollVertically = (el: HTMLElement): boolean => {
      if (el.scrollHeight - el.clientHeight <= 1) return false;
      const overflowY = getComputedStyle(el).overflowY;
      return overflowY === "auto" || overflowY === "scroll";
    };

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      // 이미 가로 제스처면 네이티브에 맡긴다.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY === 0) return;

      const forceHorizontal = e.metaKey || e.shiftKey;

      // 가장 가까운 가로 스크롤 가능 조상 탐색.
      let el = e.target as HTMLElement | null;
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.nodeType === 1 && canScrollHorizontally(el)) {
          // 세로 스크롤도 가능한 영역은 수식키 없으면 건드리지 않음.
          if (!forceHorizontal && canScrollVertically(el)) return;

          const delta = e.deltaY;
          const atStart = el.scrollLeft <= 0;
          const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;

          // 끝단에 닿았고 그 방향으로 더 가려 하면 → 페이지로 넘긴다.
          if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

          el.scrollLeft += delta;
          e.preventDefault();
          return;
        }
        el = el.parentElement;
      }
    };

    // preventDefault 하려면 passive: false 필수.
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);
}
