import { format, formatDistance, parseISO, type Locale } from 'date-fns';
import { ko } from 'date-fns/locale/ko';
import { enUS } from 'date-fns/locale/en-US';
import { ja } from 'date-fns/locale/ja';
import { zhCN } from 'date-fns/locale/zh-CN';

// 지원 로케일
const locales: Record<string, Locale> = {
  'ko-KR': ko,
  'en-US': enUS,
  'ja-JP': ja,
  'zh-CN': zhCN,
};

// 브라우저 로케일 감지 (기본값)
export function getDefaultLocale(): string {
  const browserLang = navigator.language;
  if (browserLang.startsWith('ko')) return 'ko-KR';
  if (browserLang.startsWith('ja')) return 'ja-JP';
  if (browserLang.startsWith('zh')) return 'zh-CN';
  return 'en-US';
}

// 현재 로케일 (나중에 Context로 관리 가능)
let currentLocale = getDefaultLocale();

export function setLocale(locale: string) {
  currentLocale = locale;
}

export function getLocale(): string {
  return currentLocale;
}

function getDateFnsLocale(): Locale {
  return locales[currentLocale] || enUS;
}

// UTC ISO 문자열 → 로컬 Date 객체
export function parseUTCDate(isoString: string | null | undefined): Date | null {
  if (!isoString) return null;
  // 'Z' suffix가 없으면 추가 (UTC로 해석)
  const normalized = isoString.endsWith('Z') ? isoString : isoString + 'Z';
  return parseISO(normalized);
}

// 날짜 포맷 (로컬 타임존으로 표시)
export function formatDate(date: Date | string | null | undefined, formatStr: string = 'PPP'): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? parseUTCDate(date) : date;
  if (!d) return '-';
  return format(d, formatStr, { locale: getDateFnsLocale() });
}

// 날짜+시간 포맷
export function formatDateTime(date: Date | string | null | undefined): string {
  return formatDate(date, 'PPP p');
}

// 짧은 날짜 포맷 (2024-01-15)
export function formatDateShort(date: Date | string | null | undefined): string {
  return formatDate(date, 'yyyy-MM-dd');
}

// 짧은 날짜+시간 (2024-01-15 14:30)
export function formatDateTimeShort(date: Date | string | null | undefined): string {
  return formatDate(date, 'yyyy-MM-dd HH:mm');
}

// 상대 시간 (3일 전, 방금 전)
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? parseUTCDate(date) : date;
  if (!d) return '-';
  return formatDistance(d, new Date(), { addSuffix: true, locale: getDateFnsLocale() });
}

// datetime-local input용 (로컬 시간 문자열)
export function toDateTimeLocalValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? parseUTCDate(date) : date;
  if (!d) return '';
  // 로컬 시간으로 변환 후 datetime-local 형식으로
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// datetime-local input → UTC ISO 문자열 (서버 전송용)
export function fromDateTimeLocalValue(localDateTimeStr: string): string | null {
  if (!localDateTimeStr) return null;
  // 로컬 시간을 Date로 파싱 후 UTC ISO로 변환
  const localDate = new Date(localDateTimeStr);
  return localDate.toISOString();
}

// date input용 (YYYY-MM-DD)
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? parseUTCDate(date) : date;
  if (!d) return '';
  return formatDateShort(d);
}

// 오늘 날짜 (로컬 기준)
export function getTodayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// 현재 시간 UTC ISO
export function nowUTC(): string {
  return new Date().toISOString();
}
