package com.kanban.domain.calendar;

/**
 * 워크로드 특별 일정 타입.
 * <ul>
 *     <li>TEAM     — 팀 공통 프로젝트 이벤트 (빌드/릴리스/데드라인/기타). 멤버 무관.</li>
 *     <li>MEMBER   — 개인 부재 (휴가/출장/병가/재택). member 필수.</li>
 *     <li>CALENDAR — 날짜 성격 재정의 (휴무일/근무일). 보드 전체 컬럼 셰이딩.</li>
 * </ul>
 */
public enum CalendarEventType {
    // 팀 공통 이벤트
    BUILD,
    RELEASE,
    DEADLINE,
    EVENT,
    // 개인 부재
    VACATION,
    TRIP,
    SICK,
    REMOTE,
    // 달력 예외
    HOLIDAY,
    WORKDAY;

    public enum Category {
        TEAM, MEMBER, CALENDAR
    }

    public Category category() {
        return switch (this) {
            case BUILD, RELEASE, DEADLINE, EVENT -> Category.TEAM;
            case VACATION, TRIP, SICK, REMOTE -> Category.MEMBER;
            case HOLIDAY, WORKDAY -> Category.CALENDAR;
        };
    }

    /** 개인 부재 타입은 대상 멤버가 반드시 필요하다. */
    public boolean requiresMember() {
        return category() == Category.MEMBER;
    }
}
