package com.kanban.domain.dailychecklist;

/**
 * 데일리 체크리스트 행의 성격.
 *
 * <p>"오늘의 체크리스트"는 더 이상 이 테이블이 소유하는 목록이 아니라,
 * {@code checklist_items.start_date ~ due_date} 로부터 파생되는 뷰다.
 * 이 테이블은 그 파생 결과에 대한 <b>예외 지정</b>만 저장한다.</p>
 *
 * <pre>
 * 오늘의 체크리스트(나, D) = { 기간이 D를 포함하는 내 항목 } + { D에 PIN 한 항목 } - { D에서 EXCLUDE 한 항목 }
 * </pre>
 */
public enum DailyChecklistKind {

    /** 기간이 해당 날짜를 덮지 않지만 그 날 하기로 당겨온 항목 (마이그레이션 이전 행은 모두 PIN) */
    PIN,

    /** 기간이 해당 날짜를 덮지만 그 날은 하지 않기로 한 항목 */
    EXCLUDE
}
