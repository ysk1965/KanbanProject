import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

/**
 * 마이 스페이스 「설교 노트」 탭.
 * 기획서: 설교 노트 앱 기획서 (Oct 22, 2026). 편집기·성경 해석기는 탭을 열 때만 내려받는다.
 */
const SermonTab = lazyWithRetry(() => import('./sermon/SermonTab'), 'SermonTab');

export function PersonalSermon() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center" role="status" aria-label="로딩 중">
          <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
        </div>
      }
    >
      <SermonTab />
    </Suspense>
  );
}
