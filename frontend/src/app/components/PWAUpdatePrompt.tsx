import { useEffect, useRef, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { isWeb } from '../utils/platform';
import { RefreshCw } from 'lucide-react';

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration && isWeb()) {
        // 5분마다 업데이트 체크 (웹에서만)
        setInterval(() => registration.update(), 5 * 60 * 1000);
      }
    },
  });

  const pendingUpdate = useRef(false);
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);

  // 업데이트 적용
  const applyUpdate = useCallback(() => {
    pendingUpdate.current = false;
    updateServiceWorker(true);
  }, [updateServiceWorker]);

  // 새 버전 감지 → 토스트 알림
  useEffect(() => {
    if (!needRefresh || !isWeb()) return;

    pendingUpdate.current = true;

    toast('새 버전이 준비되었습니다', {
      description: '페이지 이동 시 자동으로 적용됩니다.',
      duration: 10000,
      icon: <RefreshCw className="w-4 h-4 text-bridge-accent" />,
      action: {
        label: '지금 업데이트',
        onClick: applyUpdate,
      },
    });
  }, [needRefresh, applyUpdate]);

  // 라우트 변경 감지 → 대기 중인 업데이트 자동 적용
  useEffect(() => {
    if (prevPathRef.current !== location.pathname && pendingUpdate.current) {
      applyUpdate();
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, applyUpdate]);

  return null;
}
