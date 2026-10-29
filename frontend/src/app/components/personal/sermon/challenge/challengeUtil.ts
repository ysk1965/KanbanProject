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

/** 한국 시간 일요일 22시 마감까지 → 「D-4 · 일 22시」 / 「오늘 22시까지」 */
export function dueLabel(now = Date.now()): string {
  const k = new Date(now + 9 * 3600_000);
  const day = k.getUTCDay();
  let left = (7 - day) % 7;
  if (left === 0 && k.getUTCHours() >= 22) left = 7;
  return left === 0 ? '오늘 22시까지' : `D-${left} · 일 22시`;
}

/** 체크할 수 있게 되는 시각 → 「오늘 오후 9시」 / 「내일 오전 9시」 / 「목 오전 9시」 */
export function unlockLabel(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const day0 = new Date(now);
  day0.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - day0.getTime()) / 86_400_000);
  const h = d.getHours();
  const time = `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${d.getMinutes() ? ` ${d.getMinutes()}분` : ''}`;
  const when = diff <= 0 ? '오늘' : diff === 1 ? '내일' : '일월화수목금토'[d.getDay()];
  return `${when} ${time}`;
}
