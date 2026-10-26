import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { lazyWithRetry } from '../utils/lazyWithRetry';

/** /g/:code — 설교 노트 모임 초대 링크 (로그인 없이 미리보기) */
const GroupJoinPage = lazyWithRetry(
  () => import('../components/personal/sermon/group/GroupJoinPage'),
  'SermonGroupJoinPage',
);

export default function SermonGroupJoinPage() {
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
        <GroupJoinPage />
      </Suspense>
    </div>
  );
}
