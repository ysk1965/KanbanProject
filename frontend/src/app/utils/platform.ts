import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';
export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android';
export const isWeb = (): boolean => Capacitor.getPlatform() === 'web';

export type InAppBrowserKind =
  | 'kakaotalk'
  | 'line'
  | 'naver'
  | 'instagram'
  | 'facebook'
  | 'band'
  | 'daum'
  | 'webview';

/**
 * Detect the in-app browser of a messenger/SNS app.
 * These WebViews silently ignore file downloads, so downloads must happen in Safari/Chrome.
 * (NAVER Whale is a standalone browser — not treated as in-app.)
 */
export const getInAppBrowser = (): InAppBrowserKind | null => {
  if (isNative()) return null;
  const ua = navigator.userAgent || '';
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk';
  if (/\bLine\//i.test(ua)) return 'line';
  if (/NAVER\(inapp/i.test(ua)) return 'naver';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/BAND\//.test(ua)) return 'band';
  if (/DaumApps/i.test(ua)) return 'daum';
  // Generic Android WebView marker
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return 'webview';
  return null;
};

/** Detect in-app browsers (KakaoTalk, Facebook, Instagram, LINE, NAVER, etc.) */
export const isInAppBrowser = (): boolean => getInAppBrowser() !== null;

/** Whether `openInExternalBrowser` can hand off automatically (otherwise show manual steps). */
export const canOpenExternally = (kind: InAppBrowserKind): boolean =>
  kind === 'kakaotalk' || kind === 'line' || /Android/i.test(navigator.userAgent || '');

/**
 * Re-open `url` in the system browser from an in-app browser.
 * Returns false when there is no programmatic way (e.g. Instagram on iOS).
 */
export const openInExternalBrowser = (
  kind: InAppBrowserKind,
  url: string = window.location.href,
): boolean => {
  if (!canOpenExternally(kind)) return false;

  if (kind === 'kakaotalk') {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return true;
  }

  const target = new URL(url);
  if (kind === 'line') {
    target.searchParams.set('openExternalBrowser', '1');
    window.location.href = target.toString();
    return true;
  }

  // Android: hand off to Chrome via intent scheme
  window.location.href =
    `intent://${target.host}${target.pathname}${target.search}` +
    `#Intent;scheme=${target.protocol.replace(':', '')};package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`;
  return true;
};

export const isKakaoTalk = (): boolean => {
  return /KAKAOTALK/i.test(navigator.userAgent || '');
};

/** Detect mobile web browser (not native app, not desktop) */
export const isMobileWeb = (): boolean => {
  if (isNative()) return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
};

/** iPhone/iPad mobile web (incl. iPadOS, which reports a Mac UA) — not the native app */
export const isIOSWeb = (): boolean => {
  if (isNative()) return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
};

/** Detect Chrome on iOS (uses WKWebView — <a download> not supported) */
export const isChromeiOS = (): boolean => {
  const ua = navigator.userAgent || '';
  return /CriOS/i.test(ua);
};

/** Detect any mobile Chrome (iOS CriOS + Android Chrome) */
export const isChromeMobile = (): boolean => {
  const ua = navigator.userAgent || '';
  if (isNative()) return false;
  // iOS Chrome
  if (/CriOS/i.test(ua)) return true;
  // Android Chrome (exclude in-app browsers)
  if (/Android/i.test(ua) && /Chrome/i.test(ua) && !/KAKAOTALK|FBAN|FBAV|Instagram|Line\/|NAVER|Whale/i.test(ua)) return true;
  return false;
};
