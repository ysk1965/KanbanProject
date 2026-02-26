import { lazy, ComponentType, createElement } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * 배포 후 청크 해시 변경으로 dynamic import가 실패할 때
 * SW 캐시를 클리어하고 페이지를 새로고침하여 최신 청크를 로드하는 래퍼.
 *
 * - 1차 실패: 캐시 클리어 + SW 업데이트 + 리로드 (로딩 화면 표시)
 * - 2차 실패: "업데이트 적용 중" 화면 표시 후 강제 리로드
 *
 * sessionStorage로 무한 새로고침 루프를 방지한다.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  chunkName?: string,
) {
  return lazy(() =>
    factory().catch(async (error: Error) => {
      const key = `chunk_reload_${chunkName ?? 'default'}`;
      const alreadyReloaded = sessionStorage.getItem(key);

      if (!alreadyReloaded) {
        sessionStorage.setItem(key, '1');

        // SW가 구버전 HTML을 캐싱하고 있을 수 있으므로 캐시 클리어
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }

        // SW 업데이트 트리거
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update();
            // waiting 상태의 새 SW가 있으면 즉시 활성화
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        }

        window.location.reload();
        // reload 후 이 promise는 resolve되지 않으므로 빈 pending 반환
        return new Promise<{ default: T }>(() => {});
      }

      // 2차 실패: 깨진 UI 대신 업데이트 화면 표시 후 강제 리로드
      sessionStorage.removeItem(key);

      const UpdateFallback = () =>
        createElement('div', {
          className: 'flex flex-col items-center justify-center h-screen bg-bridge-dark gap-4',
        },
          createElement(Loader2, { className: 'w-8 h-8 text-bridge-accent animate-spin' }),
          createElement('p', { className: 'text-sm text-slate-400' }, '업데이트 적용 중...'),
        );

      // 3초 후 강제 리로드 (캐시 무시)
      setTimeout(() => {
        window.location.href = window.location.pathname + '?_t=' + Date.now();
      }, 2000);

      return { default: UpdateFallback as unknown as T };
    }),
  );
}
