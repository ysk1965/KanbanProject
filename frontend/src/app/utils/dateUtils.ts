import { format, formatDistance, parseISO, differenceInCalendarDays, startOfDay, endOfWeek, startOfWeek, addDays, type Locale } from 'date-fns';
import { ko } from 'date-fns/locale/ko';
import { enUS } from 'date-fns/locale/en-US';
import { ja } from 'date-fns/locale/ja';
import { zhCN } from 'date-fns/locale/zh-CN';
import { zhTW } from 'date-fns/locale/zh-TW';
import { hi } from 'date-fns/locale/hi';
import { vi } from 'date-fns/locale/vi';
import { es } from 'date-fns/locale/es';
import { ptBR } from 'date-fns/locale/pt-BR';
import { th } from 'date-fns/locale/th';

const LANGUAGE_KEY = 'bridge_language';

// 지원 로케일 (full code)
const locales: Record<string, Locale> = {
  'ko-KR': ko,
  'en-US': enUS,
  'ja-JP': ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'hi': hi,
  'vi': vi,
  'es': es,
  'pt-BR': ptBR,
  'th': th,
};

// i18n 언어 코드 → date-fns locale (short code)
const i18nLocales: Record<string, Locale> = {
  'ko': ko,
  'en': enUS,
  'ja': ja,
  'zh': zhCN,
  'zh-TW': zhTW,
  'hi': hi,
  'vi': vi,
  'es': es,
  'pt-BR': ptBR,
  'th': th,
};

// 브라우저 로케일 감지 (기본값)
export function getDefaultLocale(): string {
  const browserLang = navigator.language;
  if (browserLang.startsWith('ko')) return 'ko-KR';
  if (browserLang.startsWith('ja')) return 'ja-JP';
  if (browserLang === 'zh-TW' || browserLang === 'zh-Hant') return 'zh-TW';
  if (browserLang.startsWith('zh')) return 'zh-CN';
  if (browserLang.startsWith('hi')) return 'hi';
  if (browserLang.startsWith('vi')) return 'vi';
  if (browserLang.startsWith('es')) return 'es';
  if (browserLang.startsWith('pt')) return 'pt-BR';
  if (browserLang.startsWith('th')) return 'th';
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
  // localStorage에서 사용자 설정 언어를 직접 확인 (i18n syncDateLocale 호출 전에도 정확한 로케일 제공)
  try {
    const savedLang = localStorage.getItem(LANGUAGE_KEY);
    if (savedLang && i18nLocales[savedLang]) {
      return i18nLocales[savedLang];
    }
  } catch { /* SSR or localStorage 미지원 환경 */ }
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

// ── D-day & Deadline Group ──────────────────────────────────

export type DeadlineGroup = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'later' | 'noDate';
export type DdayUrgency = 'overdue' | 'today' | 'soon' | 'normal' | 'none';

export interface DdayInfo {
  text: string;
  diff: number;
  urgency: DdayUrgency;
}

/** D-day 계산 (due_date: "yyyy-MM-dd" 형식의 날짜 문자열) */
export function getDDay(dueDate: string | null | undefined): DdayInfo {
  if (!dueDate) return { text: '', diff: 0, urgency: 'none' };
  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(dueDate));
  const diff = differenceInCalendarDays(due, today);

  if (diff < 0) return { text: `D+${Math.abs(diff)}`, diff, urgency: 'overdue' };
  if (diff === 0) return { text: 'D-Day', diff: 0, urgency: 'today' };
  if (diff <= 3) return { text: `D-${diff}`, diff, urgency: 'soon' };
  return { text: `D-${diff}`, diff, urgency: 'normal' };
}

/** 마감일 기준 그룹 분류 */
export function getDeadlineGroup(dueDate: string | null | undefined): DeadlineGroup {
  if (!dueDate) return 'noDate';
  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(dueDate));
  const diff = differenceInCalendarDays(due, today);

  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';

  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const nextWeekEnd = addDays(weekEnd, 7);

  if (due <= weekEnd) return 'thisWeek';
  if (due <= nextWeekEnd) return 'nextWeek';
  return 'later';
}

/** 그룹 라벨에 사용할 주간 날짜 범위 문자열 */
export function getWeekRangeLabel(group: 'thisWeek' | 'nextWeek'): string {
  const today = startOfDay(new Date());
  const weekStart = group === 'thisWeek'
    ? addDays(today, 1) // 내일부터 (오늘·내일은 별도 그룹)
    : addDays(endOfWeek(today, { weekStartsOn: 1 }), 1);
  const weekEnd = group === 'thisWeek'
    ? endOfWeek(today, { weekStartsOn: 1 })
    : addDays(endOfWeek(today, { weekStartsOn: 1 }), 7);

  return `${format(weekStart, 'M/d')}~${format(weekEnd, 'M/d')}`;
}
