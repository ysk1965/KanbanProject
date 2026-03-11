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

  return null;
}
