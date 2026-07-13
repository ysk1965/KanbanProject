package com.kanban.domain.sprint;

/**
 * 스프린트 프레임 내 카드(체크리스트 항목)의 위치.
 * SPRINT → REVIEW → DONE. DONE 도달 시 부모 체크리스트 항목이 완료(is_completed)로 동기화된다.
 */
public enum SprintStage {
    SPRINT,
    REVIEW,
    DONE
}
