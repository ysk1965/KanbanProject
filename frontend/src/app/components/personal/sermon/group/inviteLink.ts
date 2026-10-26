import { toast } from 'sonner';
import type { SermonGroup } from './groupApi';

/** 모임 초대 링크 주소와 공유 (카톡 등 OS 공유 → 안 되면 복사) */
export function inviteUrl(code: string): string {
  return `${window.location.origin}/g/${code}`;
}

export async function shareInvite(g: SermonGroup) {
  if (!g.invite_code) return;
  const url = inviteUrl(g.invite_code);
  const text = `${g.name} — 이번 주부터 설교 노트 같이 써요`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: g.name, text, url });
      return;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('초대 링크를 복사했어요');
  } catch {
    toast(url);
  }
}
