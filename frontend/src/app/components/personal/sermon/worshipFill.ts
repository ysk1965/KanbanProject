import { toast } from 'sonner';
import { loadGalpiPrefs } from './galpiPrefs';
import type { SermonNote } from './sermonTypes';
import { fillWorship } from './worship';

const TOLD_KEY = 'sn-worship-told';
const TELL_TIMES = 3;

function hhmm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 새 노트에 내 예배표로 예배 칸 채우기 (기획 ⑤). 예배 시간대가 아니면 그대로 돌려준다.
 * 처음 세 번은 왜 채워졌는지 알려 준다.
 */
export function withWorship(note: SermonNote, at: Date = new Date()): SermonNote {
  const filled = fillWorship(note, loadGalpiPrefs().worship, at, { force: true });
  if (!filled) return note;
  try {
    const told = Number(localStorage.getItem(TOLD_KEY) || '0');
    if (told < TELL_TIMES) {
      localStorage.setItem(TOLD_KEY, String(told + 1));
      toast(`${hhmm(at)}에 열어서 「${filled.service}」로 적었어요`, {
        description: '예배 칸에서 바로 고칠 수 있어요',
      });
    }
  } catch {
    /* 저장소 없음 — 알림 없이 */
  }
  return filled;
}
