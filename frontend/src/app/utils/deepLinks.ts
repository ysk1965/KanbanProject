import { Capacitor } from '@capacitor/core';
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

let launchHandled = false;

export function initDeepLinks(navigate: (path: string) => void): void {
  if (!isNative()) return;

  import('@capacitor/app').then(({ App }) => {
    const open = (url: string) => {
      const path = deepLinkPath(url);
      if (!path) return;
      void primeReader(path).finally(() => navigate(path));
    };
    App.addListener('appUrlOpen', (event) => open(event.url));
    // 안드로이드는 앱이 꺼져 있다가 링크(위젯 등)로 켜지면 appUrlOpen 이 오지 않는다 — 켠 링크를 직접 읽는다
    // (initDeepLinks 는 navigate 가 바뀔 때마다 다시 불리므로 한 번만 — 아니면 화면을 옮길 때마다 켠 링크로 되돌아간다)
    if (Capacitor.getPlatform() === 'android' && !launchHandled) {
      launchHandled = true;
      void App.getLaunchUrl().then((r) => {
        if (r?.url) open(r.url);
      });
    }

    // Handle app state changes (background -> foreground)
    App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        console.log('[DeepLink] App became active');
      }
    });
  });
}
