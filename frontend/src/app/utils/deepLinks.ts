import { isNative } from './platform';

/**
 * 앱 링크 → 화면 경로.
 *  - https://…/path?x → /path?x
 *  - bridgespots://app/path?x (위젯) → /path?x — 사용자 지정 스킴은 첫 칸이 호스트로 읽히므로 app 호스트를 뺀다
 *  - bridgespots://path?x → /path?x
 */
export function deepLinkPath(raw: string): string | null {
  const m = raw.match(/^bridgespots:\/\/(.*)$/i);
  if (m) {
    const rest = m[1].replace(/^app(?=\/|\?|$)/, '').replace(/^\/+/, '');
    return '/' + rest;
  }
  try {
    const url = new URL(raw);
    return url.pathname + url.search || null;
  } catch {
    return null;
  }
}

/** 위젯의 「이어 읽기」 — 성경 읽기 화면이 열 장을 미리 적어 둔다 (wch=b:c) */
async function primeReader(path: string) {
  const q = path.split('?')[1];
  const ch = q ? new URLSearchParams(q).get('wch') : null;
  const [b, c] = (ch || '').split(':').map(Number);
  if (!Number.isInteger(b) || !Number.isInteger(c)) return;
  const { openInReader } = await import('../components/personal/sermon/bibleHighlights');
  openInReader(b, c, 1);
}

export function initDeepLinks(navigate: (path: string) => void): void {
  if (!isNative()) return;

  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', (event) => {
      const path = deepLinkPath(event.url);
      if (!path) return;
      void primeReader(path).finally(() => navigate(path));
    });

    // Handle app state changes (background -> foreground)
    App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        console.log('[DeepLink] App became active');
      }
    });
  });
}
