import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { isWeb } from '../utils/platform';

export function PWAUpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration && isWeb()) {
        // 매 1시간마다 업데이트 체크 (웹에서만)
        setInterval(() => registration.update(), 60 * 60 * 1000);
      }
    },
  });

  // 네이티브 앱에서는 PWA 업데이트 프롬프트 불필요
  if (!needRefresh || !isWeb()) return null;

  return (
    <div className="fixed toast-bottom-safe right-6 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-bridge-obsidian border border-foreground/10 rounded-2xl p-4 shadow-2xl max-w-sm">
        <p className="text-foreground text-sm font-medium mb-3">
          {t('pwa.updateAvailable', '새 버전이 있습니다. 업데이트하시겠습니까?')}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setNeedRefresh(false)}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-foreground hover:bg-foreground/5 rounded-lg transition-colors"
          >
            {t('pwa.later', '나중에')}
          </button>
          <button
            onClick={() => updateServiceWorker(true)}
            className="px-3 py-1.5 text-sm bg-bridge-accent text-white rounded-lg hover:bg-bridge-accent/90 transition-colors"
          >
            {t('pwa.update', '업데이트')}
          </button>
        </div>
      </div>
    </div>
  );
}
