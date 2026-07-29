package com.kanban.domain.dailychecklist;

/**
 * 오늘의 체크리스트에 그 항목이 왜 들어와 있는지를 나타낸다.
 * 프론트에서 뱃지/그룹핑 근거로 사용한다.
 */
public enum DailySource {

    /** 항목의 기간(start_date~due_date)이 해당 날짜를 덮어서 자동으로 들어옴 */
    DERIVED,

    /** 마감이 지났는데 아직 미완료 — "지연" 그룹 */
    OVERDUE,

    /** 기간이 해당 날짜를 덮지 않지만 사용자가 그 날로 당겨옴 */
    PINNED,

    /** 원본 체크리스트 없이 그 날만 존재하는 임시 항목 */
    ADHOC
}
