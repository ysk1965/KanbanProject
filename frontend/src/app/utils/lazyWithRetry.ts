import { lazy, ComponentType } from 'react';

/**
 * 배포 후 청크 해시 변경으로 dynamic import가 실패할 때
 * 자동으로 페이지를 새로고침하여 최신 청크를 로드하는 래퍼.
 *
 * sessionStorage로 무한 새로고침 루프를 방지한다.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  chunkName?: string,
) {
  return lazy(() =>
    factory().catch((error: Error) => {
      const key = `chunk_reload_${chunkName ?? 'default'}`;
      const alreadyReloaded = sessionStorage.getItem(key);

      if (!alreadyReloaded) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // reload 후 이 promise는 resolve되지 않으므로 빈 pending 반환
        return new Promise<{ default: T }>(() => {});
      }

      // 이미 새로고침했는데도 실패하면 에러를 그대로 throw
      sessionStorage.removeItem(key);
      throw error;
    }),
  );
}
