import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { lazyWithRetry } from '../utils/lazyWithRetry';

/**
 * /sermonnote — 설교 노트 독립 화면.
 * 로그인 없이 열리고(기기 저장), 상단 띠의 로그인으로 기존 계정에 들어오면 그 사용자의 노트로 동기화된다.
 * 서버 가드(App.tsx OFFLINE_CAPABLE_PATHS)가 이 경로는 오프라인이어도 덮지 않는다.
 */
const SermonTab = lazyWithRetry(
  () => import('../components/personal/sermon/SermonTab'),
  'SermonTab',
);

export default function SermonNotePage() {
  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-bridge-dark">
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
        <SermonTab standalone />
      </Suspense>
    </div>
  );
}
