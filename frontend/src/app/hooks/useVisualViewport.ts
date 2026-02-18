import { useEffect } from 'react';

/**
 * 모바일 키보드가 올라왔을 때 visual viewport 변화를 감지하여
 * CSS 변수와 data 속성을 설정하는 훅.
 *
 * CSS 변수:
 *   --visual-viewport-height: 실제 보이는 뷰포트 높이 (px)
 *   --vvh: 1vvh 단위 (visual viewport height의 1%)
 *
 * data 속성:
 *   [data-keyboard-open] on <html> — 키보드가 올라온 상태
 *
 * 사용 예:
 *   height: calc(var(--vvh, 1vh) * 85)   // 85vh → keyboard-aware
 *   [data-keyboard-open] .my-modal { ... } // 키보드 열림 시 스타일
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) {
      // visualViewport API 미지원 브라우저 — fallback
      const fallback = () => {
        const h = window.innerHeight;
        document.documentElement.style.setProperty('--visual-viewport-height', `${h}px`);
        document.documentElement.style.setProperty('--vvh', `${h * 0.01}px`);
      };
      fallback();
      window.addEventListener('resize', fallback);
      return () => window.removeEventListener('resize', fallback);
    }

    // 키보드 판별 임계값: 전체 높이의 25% 이상 줄어들면 키보드로 간주
    const KEYBOARD_THRESHOLD = 0.75;

    const update = () => {
      const viewportHeight = vv.height;
      const fullHeight = window.innerHeight;

      document.documentElement.style.setProperty(
        '--visual-viewport-height',
        `${viewportHeight}px`,
      );
      document.documentElement.style.setProperty(
        '--vvh',
        `${viewportHeight * 0.01}px`,
      );

      const isKeyboardOpen = viewportHeight < fullHeight * KEYBOARD_THRESHOLD;

      if (isKeyboardOpen) {
        document.documentElement.setAttribute('data-keyboard-open', '');
      } else {
        document.documentElement.removeAttribute('data-keyboard-open');
      }
    };

    // 초기 세팅
    update();

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.removeAttribute('data-keyboard-open');
      document.documentElement.style.removeProperty('--visual-viewport-height');
      document.documentElement.style.removeProperty('--vvh');
    };
  }, []);
}

/**
 * 모바일에서 포커스된 input/textarea가 키보드에 가려지지 않도록
 * 자동 스크롤하는 훅.
 */
export function useKeyboardAutoScroll() {
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) {
        return;
      }

      // 약간의 딜레이를 줘서 키보드 애니메이션이 끝난 후 스크롤
      setTimeout(() => {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 300);
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);
}
