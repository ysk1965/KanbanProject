import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { lazyWithRetry } from '../utils/lazyWithRetry';

/**
 * /sermonnote/c?… — 공유받은 설교 카드. 로그인 없이 열리고 서버를 부르지 않는다
 * (App.tsx OFFLINE_CAPABLE_PATHS 가 /sermonnote/ 하위를 함께 덮는다).
 */
const CardPage = lazyWithRetry(
  () => import('../components/personal/sermon/share/CardPage'),
  'SermonCardPage',
);

export default function SermonCardPage() {
  return (
    <div className="h-dvh flex flex-col overflow-auto bg-bridge-dark">
      <Suspense
        fallback={
          <div
            className="flex-1 flex items-center justify-center"
            role="status"
            aria-label="로딩 중"
          >
            <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
          </div>
        }
      >
        <CardPage />
      </Suspense>
    </div>
  );
}
