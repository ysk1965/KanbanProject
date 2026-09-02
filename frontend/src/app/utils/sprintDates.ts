/**
 * 스프린트 버킷 경계 계산용 날짜 유틸.
 *
 * 스프린트/마일스톤의 start_date·end_date는 시각이 없는 "달력 날짜"(yyyy-MM-dd)다.
 * `new Date("2026-09-02")`는 UTC 자정으로 파싱되어 UTC-9 이후 지역에서 하루가 밀리므로,
 * 여기서는 문자열을 쪼개 로컬 자정 Date로 만든다. 반대로 문자열로 되돌릴 때도
 * toISOString()이 아니라 로컬 필드를 그대로 조립한다 — 같은 이유다.
 */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** yyyy-MM-dd 또는 ISO 문자열의 앞 10자리 → 로컬 자정 Date. 파싱 불가면 null. */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 로컬 Date → yyyy-MM-dd (서버로 보내는 달력 날짜 표현) */
export function toDayString(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** 달력일 차이 (to - from). 같은 날이면 0. */
export function diffDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

/** 시작·끝을 포함한 기간 일수. 잘못된 순서면 0. */
export function inclusiveDays(
  start: Date | null,
  end: Date | null,
): number {
  if (!start || !end) return 0;
  const n = diffDays(start, end) + 1;
  return n > 0 ? n : 0;
}

/** "9/2" — 세그먼트·눈금의 기본 날짜 표기 */
export function formatMD(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** "9/2(화)" — 경계를 고를 때는 요일이 실제 판단 근거라 함께 보여준다 */
export function formatMDW(date: Date): string {
  return `${formatMD(date)}(${WEEKDAYS[date.getDay()]})`;
}

export function isMonday(date: Date): boolean {
  return date.getDay() === 1;
}

/** 오늘(로컬 자정) */
export function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
