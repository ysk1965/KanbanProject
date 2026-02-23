import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { isWeb } from '../utils/platform';

export function PWAUpdatePrompt() {
  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration && isWeb()) {
        // 5분마다 업데이트 체크 (웹에서만)
        setInterval(() => registration.update(), 5 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (!isWeb() || !('serviceWorker' in navigator)) return;

    // 기존 SW가 제어 중이었는지 기록 (첫 설치 시 불필요한 리로드 방지)
    const wasControlled = !!navigator.serviceWorker.controller;
    let refreshing = false;

    const onControllerChange = () => {
      if (!wasControlled || refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
