import { useCallback, useMemo, useState } from 'react';
import { getInAppBrowser, openInExternalBrowser } from '../utils/platform';
import type { InAppBrowserKind } from '../utils/platform';

export interface InAppBrowserGate {
  kind: InAppBrowserKind | null;
  /**
   * Call before a download/select action.
   * Returns true when blocked (in-app browser): opens the guide and, where
   * supported, hands the page off to the system browser.
   */
  block: () => boolean;
  guideOpen: boolean;
  openGuide: () => void;
  closeGuide: () => void;
}

/** In-app browsers (KakaoTalk, Instagram…) silently ignore downloads — route users to Safari/Chrome. */
export function useInAppBrowserGate(): InAppBrowserGate {
  const [kind] = useState<InAppBrowserKind | null>(() => getInAppBrowser());
  const [guideOpen, setGuideOpen] = useState(false);

  const openGuide = useCallback(() => setGuideOpen(true), []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);

  const block = useCallback((): boolean => {
    if (!kind) return false;
    // Guide stays open as a fallback in case the hand-off silently fails
    setGuideOpen(true);
    openInExternalBrowser(kind);
    return true;
  }, [kind]);

  return useMemo(
    () => ({ kind, block, guideOpen, openGuide, closeGuide }),
    [kind, block, guideOpen, openGuide, closeGuide],
  );
}
