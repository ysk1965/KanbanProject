import type { TimetableCellColor } from '../types';

/**
 * 시간표 셀 색 이름 → 실제 값.
 * DB에는 색 이름만 저장하고, 매체(편집 화면 / 종이)·테마별 매핑은 여기서만 관리한다.
 * 기획서: docs/Design/myspace-features-timetable.html 05절 「색 이름 → 실제 값」
 */
export type TimetableNamedColor = Exclude<TimetableCellColor, ''>;

export const TIMETABLE_COLOR_ORDER: TimetableNamedColor[] = [
  'red',
  'orange',
  'purple',
  'yellow',
  'green',
  'blue',
];

/** 편집 화면 · 다크 테마 (bridge-dark #191f2d 위에서 밝게) */
export const TIMETABLE_EDITOR_COLORS_DARK: Record<TimetableNamedColor, string> = {
  red: '#ff4d5e',
  orange: '#ff9a3c',
  purple: '#d68cff',
  yellow: '#ffd23f',
  green: '#4ee08a',
  blue: '#5aa8ff',
};

/** 편집 화면 · 라이트 테마 (크림 배경 #fffcf8 위에서 읽히도록 조금 진하게) */
export const TIMETABLE_EDITOR_COLORS_LIGHT: Record<TimetableNamedColor, string> = {
  red: '#d92637',
  orange: '#d9700f',
  purple: '#9d2fc9',
  yellow: '#b58900',
  green: '#178a4a',
  blue: '#2465d8',
};

/** 종이(PDF) — 흰 바탕용 진한 색 */
export const TIMETABLE_PAPER_COLORS: Record<TimetableNamedColor, string> = {
  red: '#E60012',
  orange: '#F0801A',
  purple: '#C026D3',
  yellow: '#EAB308',
  green: '#16A34A',
  blue: '#2563EB',
};

/** 색 칩 aria-label (i18n 키 없이도 읽히도록 한국어 기본값) */
export const TIMETABLE_COLOR_LABELS: Record<TimetableNamedColor, string> = {
  red: '빨강',
  orange: '주황',
  purple: '보라',
  yellow: '노랑',
  green: '초록',
  blue: '파랑',
};

export function isTimetableColor(v: unknown): v is TimetableNamedColor {
  return typeof v === 'string' && (TIMETABLE_COLOR_ORDER as string[]).includes(v);
}
