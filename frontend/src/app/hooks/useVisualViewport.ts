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
    let wasKeyboardOpen = false;

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
        wasKeyboardOpen = true;
      } else {
        document.documentElement.removeAttribute('data-keyboard-open');
        // iOS 키보드 닫힘 후 dvh가 복원되지 않는 문제 대응
        if (wasKeyboardOpen) {
          wasKeyboardOpen = false;
          forceViewportRestore();
        }
      }
    };

    // 초기 세팅
    update();

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    // iOS: focusout 시 키보드 닫힘 → 뷰포트 강제 복원
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const handleFocusOut = (e: FocusEvent) => {
      if (!isIOSDevice) return;
      const target = e.target as HTMLElement;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement) &&
        !target.isContentEditable
      ) return;

      // focusout 후 다른 input으로 이동하는 경우 무시
      setTimeout(() => {
        const active = document.activeElement;
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active as HTMLElement)?.isContentEditable
        ) return;
        forceViewportRestore();
      }, 100);
    };

    document.addEventListener('focusout', handleFocusOut);

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.removeEventListener('focusout', handleFocusOut);
      document.documentElement.removeAttribute('data-keyboard-open');
      document.documentElement.style.removeProperty('--visual-viewport-height');
      document.documentElement.style.removeProperty('--vvh');
    };
  }, []);
}

/**
 * iOS에서 키보드 닫힘 후 dvh/viewport가 제대로 복원되지 않는 문제를 해결.
 * scrollTo(0,0)으로 브라우저의 뷰포트 재계산을 강제 트리거.
 */
function forceViewportRestore() {
  // 약간의 딜레이 후 scroll 트리거로 뷰포트 재계산 유도
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    // 한 번 더 트리거 (키보드 애니메이션 완료 대기)
    setTimeout(() => {
      window.scrollTo(0, 0);
      // dvh 재계산 강제: body에 1px 변화 후 복원
      const html = document.documentElement;
      html.style.setProperty('height', '100%');
      requestAnimationFrame(() => {
        html.style.removeProperty('height');
      });
    }, 150);
  });
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
        // Find the closest scrollable container (modal, overlay, etc.)
        const scrollParent = findScrollParent(target);
        if (scrollParent && scrollParent !== document.documentElement && scrollParent !== document.body) {
          // Inside a scrollable container (e.g. modal) — scroll within it
          const parentRect = scrollParent.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const offset = targetRect.top - parentRect.top - parentRect.height / 3;
          scrollParent.scrollBy({ top: offset, behavior: 'smooth' });
        } else {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);
}

/** Walk up the DOM to find the nearest scrollable ancestor. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
