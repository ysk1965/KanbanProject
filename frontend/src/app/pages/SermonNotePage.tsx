import { Suspense, useEffect } from 'react';
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
  // 홈 화면 설치가 「설교 노트」 앱이 되도록, 이 화면에 있는 동안 매니페스트·아이콘·제목을 바꿔 단다
  useEffect(() => {
    const prevTitle = document.title;
    document.title = '설교 노트';
    const head = document.head;
    const swaps: Array<{ el: HTMLElement; attr: string; prev: string | null; created: boolean }> =
      [];
    const swap = (selector: string, create: () => HTMLElement, attr: string, value: string) => {
      let el = head.querySelector<HTMLElement>(selector);
      const created = !el;
      if (!el) {
        el = create();
        head.appendChild(el);
      }
      swaps.push({ el, attr, prev: el.getAttribute(attr), created });
      el.setAttribute(attr, value);
    };
    const link = (rel: string) => () => {
      const l = document.createElement('link');
      l.rel = rel;
      return l;
    };
    const meta = (name: string) => () => {
      const m = document.createElement('meta');
      m.name = name;
      return m;
    };
    swap('link[rel="manifest"]', link('manifest'), 'href', '/manifest-sermonnote.webmanifest');
    swap(
      'link[rel="apple-touch-icon"]',
      link('apple-touch-icon'),
      'href',
      '/apple-touch-icon-sermonnote.png',
    );
    swap(
      'meta[name="apple-mobile-web-app-title"]',
      meta('apple-mobile-web-app-title'),
      'content',
      '설교 노트',
    );
    swap(
      'meta[name="apple-mobile-web-app-capable"]',
      meta('apple-mobile-web-app-capable'),
      'content',
      'yes',
    );
    swap('meta[name="theme-color"]', meta('theme-color'), 'content', '#1a181c');
    return () => {
      document.title = prevTitle;
      swaps.forEach(({ el, attr, prev, created }) => {
        if (created) el.remove();
        else if (prev === null) el.removeAttribute(attr);
        else el.setAttribute(attr, prev);
      });
    };
  }, []);
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
