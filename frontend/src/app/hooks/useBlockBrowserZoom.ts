import { useEffect } from "react";

/**
 * 이미지 뷰어(라이트박스 등)가 열려 있는 동안 브라우저 자체 줌을 막는다.
 *
 * - 맥 트랙패드 핀치 = `ctrlKey`가 켜진 `wheel` 이벤트 → Chrome 이 비주얼 뷰포트 줌을 수행
 * - React 의 `onWheel` 은 passive 로 등록되어 `preventDefault()` 가 무시되므로
 *   반드시 네이티브 non-passive 리스너로 막아야 한다.
 * - Safari 는 `gesturestart/gesturechange` 로 별도 처리
 *
 * 일반 스크롤(ctrl 없는 wheel)은 막지 않으므로 모달 내부 스크롤에 영향이 없다.
 */
export function useBlockBrowserZoom(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault();

    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("gesturestart", onGesture);
    document.addEventListener("gesturechange", onGesture);
    return () => {
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
    };
  }, [enabled]);
}

/** wheel 이벤트를 줌 배율 변화량으로 변환 (핀치는 연속, 마우스 휠은 단계식) */
export function wheelToZoomFactor(
  e: WheelEvent,
  step: number,
): (z: number) => number {
  if (e.ctrlKey || e.metaKey) {
    // 트랙패드 핀치: deltaY 가 작고 연속적 → 비례 스케일
    const factor = Math.exp(-e.deltaY * 0.01);
    return (z) => z * factor;
  }
  return (z) => z + (e.deltaY > 0 ? -step : step);
}
