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
        wasKeyboardOpen = true;
        document.documentElement.setAttribute('data-keyboard-open', '');
      } else {
        // 키보드가 닫힌 직후라면 viewport 복원 강제 트리거
        if (wasKeyboardOpen) {
          wasKeyboardOpen = false;
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
            // 복원 후 CSS 변수도 전체 높이로 재설정
            const restored = vv.height;
            document.documentElement.style.setProperty('--visual-viewport-height', `${restored}px`);
            document.documentElement.style.setProperty('--vvh', `${restored * 0.01}px`);
          });
        }
        document.documentElement.removeAttribute('data-keyboard-open');
      }
    };

    // iOS PWA standalone 모드에서 키보드 닫힐 때 viewport가 밀린 채 남는 버그 대응
    // focusout 시 강제로 scroll 위치를 복원하여 하단 빈 공간 제거
    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement) &&
        !(target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      // 다른 input으로 포커스가 이동하는 경우는 무시 (키보드가 닫히지 않으므로)
      setTimeout(() => {
        const active = document.activeElement;
        const isStillEditing =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable);

        if (!isStillEditing) {
          // 키보드가 실제로 닫힌 경우 — viewport 강제 복원
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
          // 약간의 딜레이 후 CSS 변수 재계산 (OS 키보드 애니메이션 완료 대기)
          setTimeout(() => {
            update();
          }, 150);
        }
      }, 80);
    };

    // 초기 세팅
    update();

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
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
