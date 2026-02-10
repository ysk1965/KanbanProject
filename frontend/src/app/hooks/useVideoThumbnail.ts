import { useState, useEffect } from 'react';

/**
 * Canvas API로 영상 첫 프레임을 추출하여 data URL로 반환.
 * CORS 실패 또는 로딩 실패 시 null 반환.
 */
export function useVideoThumbnail(
  videoUrl: string | null | undefined,
  enabled: boolean = true
): string | null {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
    if (!videoUrl || !enabled) {
      setThumbnail(null);
      return;
    }

    let cancelled = false;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.src = '';
      video.load();
    };

    const onSeeked = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          setThumbnail(canvas.toDataURL('image/jpeg', 0.7));
        }
      } catch {
        // CORS or canvas tainted
      }
      cleanup();
    };

    const onError = () => {
      if (!cancelled) setThumbnail(null);
      cleanup();
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });

    video.src = videoUrl;
    video.currentTime = 0.5;

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [videoUrl, enabled]);

  return thumbnail;
}
