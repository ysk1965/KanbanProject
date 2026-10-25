/**
 * 카드 DOM → PNG. modern-screenshot 은 브라우저가 그린 DOM 을 SVG foreignObject 로 옮겨 찍어서
 * 웹폰트(쓴 글자만)·color-mix·cqw 를 화면과 같게 담는다. 카드는 360px 로 그려 3배(1080px)로 찍는다.
 */
import { embeddedFontCss } from './fonts';

export const CARD_RENDER_WIDTH = 360;
const SCALE = 3;

export async function cardToBlob(el: HTMLElement): Promise<Blob> {
  if (document.fonts?.ready) {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  }
  const [{ domToBlob }, cssText] = await Promise.all([
    import('modern-screenshot'),
    embeddedFontCss(el),
  ]);
  const blob = await domToBlob(el, {
    scale: SCALE,
    type: 'image/png',
    backgroundColor: null,
    ...(cssText ? { font: { cssText } } : {}),
  });
  if (!blob) throw new Error('card image failed');
  return blob;
}

export function cardFileName(title: string): string {
  const base = (title || '설교 카드').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
  return `${base}.png`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

/** OS 공유 시트로 이미지(+링크 글)를 보낸다. 파일 공유를 못 하면 unsupported */
export async function shareImage(
  blob: Blob,
  name: string,
  text: string,
  url: string,
): Promise<ShareOutcome> {
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const data: ShareData = { files: [file], text: `${text}\n${url}` };
  if (!nav.share || !nav.canShare?.(data)) return 'unsupported';
  try {
    await nav.share(data);
    return 'shared';
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
