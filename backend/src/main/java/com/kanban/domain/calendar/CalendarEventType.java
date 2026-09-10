package com.kanban.domain.calendar;

/**
 * 워크로드 특별 일정 타입.
 * <ul>
 *     <li>TEAM     — 팀 공통 프로젝트 이벤트 (빌드/릴리스/데드라인/기타). 멤버 무관.</li>
 *     <li>MEMBER   — 개인 일정. 부재(휴가/출장/병가/재택)와 그 거울상인 휴일근무. member 필수.</li>
 *     <li>CALENDAR — 날짜 성격 재정의 (휴무일/근무일). 보드 전체 컬럼 셰이딩.</li>
 * </ul>
 */
public enum CalendarEventType {
    // 팀 공통 이벤트
    BUILD,
    RELEASE,
    DEADLINE,
    EVENT,
    // 개인 부재 — 사유 분류 없이 단일 타입(내용 텍스트로 표현).
    // VACATION/TRIP/SICK/REMOTE는 하위호환용으로 남겨둠(신규 UI는 ABSENCE만 생성)
    ABSENCE,
    VACATION,
    TRIP,
    SICK,
    REMOTE,
    // 개인 휴일근무 — 부재의 거울상. 주말/휴무일에 "이 멤버만" 근무함을 표시하며,
    // 그 멤버 행의 해당 날짜 주말/휴무일 빗금을 해제한다(보드 전체 WORKDAY와 달리 개인 단위).
    HOLIDAY_WORK,
    // 달력 예외
    HOLIDAY,
    WORKDAY;

    public enum Category {
        TEAM, MEMBER, CALENDAR
    }

    public Category category() {
        return switch (this) {
            case BUILD, RELEASE, DEADLINE, EVENT -> Category.TEAM;
            case ABSENCE, VACATION, TRIP, SICK, REMOTE, HOLIDAY_WORK -> Category.MEMBER;
            case HOLIDAY, WORKDAY -> Category.CALENDAR;
        };
    }

    /** 개인 일정(부재/휴일근무) 타입은 대상 멤버가 반드시 필요하다. */
    public boolean requiresMember() {
        return category() == Category.MEMBER;
    }

    /** 개인 휴일근무 — 비근무일에 "있음"을 뜻한다. */
    public boolean isHolidayWork() {
        return this == HOLIDAY_WORK;
    }

    /** 개인 부재 계열(ABSENCE + 레거시) — 근무일에 "없음"을 뜻한다. */
    public boolean isAbsence() {
        return category() == Category.MEMBER && this != HOLIDAY_WORK;
    }
}
