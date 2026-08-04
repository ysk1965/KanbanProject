package com.kanban.domain.personal;

/**
 * 백로그 항목이 무엇으로 승격됐는지.
 *
 * <p>TIMEBLOCK은 다른 둘과 성격이 다르다 — 시간만 잡은 것이라 항목이 백로그에 그대로 남는다.
 * TASK · CHECKLIST_ITEM은 항목이 대기 목록에서 빠지고 링크만 남는다.
 */
public enum PersonalTaskPromotionType {
    /** 오늘의 타임블록에 개인 블록(CUSTOM)으로 배치 — 항목은 백로그에 남는다 */
    TIMEBLOCK,
    /** 칸반 태스크로 생성 */
    TASK,
    /** 기존 태스크의 체크리스트 항목으로 이동 */
    CHECKLIST_ITEM
}
