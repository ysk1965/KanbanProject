import { useMemo, useState } from 'react';
import type { SermonNote } from './sermonTypes';
import { useGalpiPrefs } from './galpiPrefs';
import { tidyList, type TidyList } from './noteTidy';

const DISMISS_KEY = 'sn-tidy-dismissed';

function loadDismissed(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** 사이드바 표와 화면이 같은 목록을 쓴다 */
export function useTidy(notes: SermonNote[]): {
  tidy: TidyList;
  dismiss: (name: string) => void;
} {
  const worship = useGalpiPrefs().worship;
  const [dismissed, setDismissed] = useState(loadDismissed);
  const tidy = useMemo(() => tidyList(notes, worship, dismissed), [notes, worship, dismissed]);
  const dismiss = (name: string) =>
    setDismissed((d) => {
      const n = new Set(d).add(name);
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify([...n]));
      } catch {
        /* ignore */
      }
      return n;
    });
  return { tidy, dismiss };
}
