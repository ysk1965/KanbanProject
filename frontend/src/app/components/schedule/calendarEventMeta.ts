/**
 * 워크로드 특별 일정 타입 메타데이터 — 모달/렌더링에서 공용.
 * event_type ↔ 라벨/아이콘/색/카테고리 매핑의 단일 소스.
 */

export type CalendarCategory = "TEAM" | "MEMBER" | "CALENDAR";

export interface CalendarTypeMeta {
  key: string; // event_type
  label: string;
  icon: string; // 이모지
  color: string; // 기본 색 (hex)
  category: CalendarCategory;
}

/** 팀 공통 프로젝트 이벤트 */
export const TEAM_TYPES: CalendarTypeMeta[] = [
  {
    key: "BUILD",
    label: "빌드",
    icon: "⚒️",
    color: "#f59e0b",
    category: "TEAM",
  },
  {
    key: "RELEASE",
    label: "릴리스",
    icon: "🚀",
    color: "#34d399",
    category: "TEAM",
  },
  {
    key: "DEADLINE",
    label: "데드라인",
    icon: "⚑",
    color: "#ef4444",
    category: "TEAM",
  },
  {
    key: "EVENT",
    label: "기타",
    icon: "◈",
    color: "#8b5cf6",
    category: "TEAM",
  },
];

/** 개인 부재 — 사유 분류 없이 단일 타입(내용 텍스트로 표현). 중립색. */
export const MEMBER_TYPES: CalendarTypeMeta[] = [
  {
    key: "ABSENCE",
    label: "부재",
    icon: "🚶",
    color: "#94a3b8",
    category: "MEMBER",
  },
];

/** 레거시 부재 타입(하위호환 렌더용) — 신규 UI는 생성하지 않음 */
export const LEGACY_MEMBER_TYPES: CalendarTypeMeta[] = [
  {
    key: "VACATION",
    label: "휴가",
    icon: "🌴",
    color: "#94a3b8",
    category: "MEMBER",
  },
  {
    key: "TRIP",
    label: "출장",
    icon: "✈️",
    color: "#38bdf8",
    category: "MEMBER",
  },
  {
    key: "SICK",
    label: "병가",
    icon: "🤒",
    color: "#fb7185",
    category: "MEMBER",
  },
  {
    key: "REMOTE",
    label: "재택",
    icon: "🏠",
    color: "#34d399",
    category: "MEMBER",
  },
];

/** 달력 예외 (날짜 성격 재정의) */
export const CALENDAR_TYPES: CalendarTypeMeta[] = [
  {
    key: "HOLIDAY",
    label: "휴무일",
    icon: "🏖️",
    color: "#f87171",
    category: "CALENDAR",
  },
  {
    key: "WORKDAY",
    label: "근무일",
    icon: "💼",
    color: "#34d399",
    category: "CALENDAR",
  },
];

export const ALL_CALENDAR_TYPES: CalendarTypeMeta[] = [
  ...TEAM_TYPES,
  ...MEMBER_TYPES,
  ...LEGACY_MEMBER_TYPES,
  ...CALENDAR_TYPES,
];

const META_BY_KEY: Record<string, CalendarTypeMeta> = ALL_CALENDAR_TYPES.reduce(
  (acc, t) => {
    acc[t.key] = t;
    return acc;
  },
  {} as Record<string, CalendarTypeMeta>,
);

export function calendarTypeMeta(eventType: string): CalendarTypeMeta {
  return (
    META_BY_KEY[eventType] || {
      key: eventType,
      label: eventType,
      icon: "◈",
      color: "#6366f1",
      category: "TEAM",
    }
  );
}

export function categoryOf(eventType: string): CalendarCategory {
  return calendarTypeMeta(eventType).category;
}
