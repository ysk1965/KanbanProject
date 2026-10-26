import { useSermonGroups } from '../group/GroupContext';
import { ANONYMOUS_USER } from '../sermonStore';

/* 챌린지 화면들이 같이 쓰는 작은 도우미 */

/** 1,240 */
export function num(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('ko-KR');
}

/** 설교 노트 화면에서 지금 사용자 id (모임 컨텍스트가 내려 준다, 없으면 로그인 전) */
export function useChallengeUserId(): string {
  return useSermonGroups()?.userId || ANONYMOUS_USER;
}

/** 이번 주(월요일 시작) 첫날 0시 — 로컬 시각 (서버가 없을 때 화면 추정용) */
export function localWeekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** 오늘이 한국 시간 월요일인지 (주간 결과 띠는 월요일에만) */
export function isKstMonday(now = Date.now()): boolean {
  return new Date(now + 9 * 3600_000).getUTCDay() === 1;
}

/** 마감까지 남은 시간 → '3일 남음' / '5시간 남음' */
export function leftLabel(endsAt: string | null | undefined): string {
  if (!endsAt) return '일요일 22시 마감';
  const ms = Date.parse(endsAt) - Date.now();
  if (!Number.isFinite(ms)) return '일요일 22시 마감';
  if (ms <= 0) return '마감됨';
  const h = Math.floor(ms / 3600_000);
  if (h >= 24) return `${Math.floor(h / 24)}일 남음 · 일요일 22시 마감`;
  return h >= 1 ? `${h}시간 남음` : `${Math.max(1, Math.round(ms / 60_000))}분 남음`;
}

/** 닉네임 형식 (서버 CH001 과 같은 규칙 — 앞뒤 공백 제거 뒤 2~12자 한글·영문·숫자·공백·_) */
export function validNickname(s: string): boolean {
  return /^[\p{Script=Hangul}A-Za-z0-9 _]{2,12}$/u.test(s.trim());
}

/** 랭킹에 보일 이름 — 「새벽별#0312」 */
export function rankName(nickname?: string | null, tag?: string | null): string {
  if (!nickname) return '';
  return tag ? `${nickname}#${tag}` : nickname;
}
