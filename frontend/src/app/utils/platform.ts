import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';
export const isAndroid = (): boolean => Capacitor.getPlatform() === 'android';
export const isWeb = (): boolean => Capacitor.getPlatform() === 'web';

/** Detect in-app browsers (KakaoTalk, Facebook, Instagram, LINE, NAVER, etc.) */
export const isInAppBrowser = (): boolean => {
  const ua = navigator.userAgent || '';
  return /KAKAOTALK|FBAN|FBAV|Instagram|Line\/|NAVER|Whale/i.test(ua);
};

export const isKakaoTalk = (): boolean => {
  return /KAKAOTALK/i.test(navigator.userAgent || '');
};

/** Detect mobile web browser (not native app, not desktop) */
export const isMobileWeb = (): boolean => {
  if (isNative()) return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
};
