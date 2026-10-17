package com.kanban.domain.sprint;

/**
 * 오늘 날짜에서 파생되는 스프린트 상태. DB에 저장하지 않는다 —
 * 기간(start/end)과 오늘의 비교 결과일 뿐이다({@link Sprint#stateOn}).
 */
public enum SprintState {
    PAST,     // 기간이 지난 스프린트 (회고용, 미완료 정리 대상)
    CURRENT,  // 오늘이 기간 안에 있는 스프린트
    FUTURE    // 아직 시작 전인 스프린트
}
