export type AssigneeColorName = 'indigo' | 'purple' | 'teal' | 'rose' | 'amber' | 'emerald';

export const ASSIGNEE_COLOR_NAMES: AssigneeColorName[] = [
  'indigo', 'purple', 'teal', 'rose', 'amber', 'emerald',
];

const COLOR_MAP: Record<AssigneeColorName, {
  hex: string;
  bg: string;
  bgLight: string;
  text: string;
}> = {
  indigo:  { hex: '#6366F1', bg: 'bg-indigo-500',  bgLight: 'bg-indigo-500/20',  text: 'text-indigo-300' },
  purple:  { hex: '#8B5CF6', bg: 'bg-purple-500',  bgLight: 'bg-purple-500/20',  text: 'text-purple-300' },
  teal:    { hex: '#14B8A6', bg: 'bg-teal-500',    bgLight: 'bg-teal-500/20',    text: 'text-teal-300' },
  rose:    { hex: '#F43F5E', bg: 'bg-rose-500',    bgLight: 'bg-rose-500/20',    text: 'text-rose-300' },
  amber:   { hex: '#F59E0B', bg: 'bg-amber-500',   bgLight: 'bg-amber-500/20',   text: 'text-amber-300' },
  emerald: { hex: '#10B981', bg: 'bg-emerald-500', bgLight: 'bg-emerald-500/20', text: 'text-emerald-300' },
};

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function resolveColorName(
  name: string,
  customColor?: AssigneeColorName | string | null,
): AssigneeColorName {
  if (customColor && customColor in COLOR_MAP) {
    return customColor as AssigneeColorName;
  }
  return ASSIGNEE_COLOR_NAMES[hashName(name) % ASSIGNEE_COLOR_NAMES.length];
}

/**
 * customColor가 '#'로 시작하면 커스텀 hex로 취급
 */
function isCustomHex(color?: string | null): color is string {
  return !!color && color.startsWith('#');
}

export function getAssigneeHex(name: string, customColor?: string | null): string {
  if (isCustomHex(customColor)) return customColor;
  return COLOR_MAP[resolveColorName(name, customColor)].hex;
}

export function getAssigneeClasses(name: string, customColor?: string | null) {
  if (isCustomHex(customColor)) {
    return {
      hex: customColor,
      bg: '',           // inline style 필요
      bgLight: '',
      text: '',
    };
  }
  return COLOR_MAP[resolveColorName(name, customColor)];
}

/**
 * 이름에서 2글자 이니셜을 생성
 * - 한글: 뒤 2글자 (유상건 → 상건)
 * - 영문: 앞 2글자 대문자 (alex → AL)
 * - 1글자: 그대로 반환
 */
export function getInitials(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed.toUpperCase();

  const isKorean = /[가-힣]/.test(trimmed);
  if (isKorean) {
    return trimmed.slice(-2);
  }
  return trimmed.slice(0, 2).toUpperCase();
}
