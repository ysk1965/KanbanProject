package com.kanban.domain.personal;

/**
 * 백로그 항목이 무엇으로 승격됐는지.
 *
 * <p>셋 다 같은 규칙이다 — 승격되면 항목은 백로그에서 빠지고, 실체는 각자의 자리
 * (타임블록 · 칸반 태스크 · 체크리스트 항목)에만 남는다. 이 값은 "무엇이 됐나"를
 * 되짚기 위한 기록이며, 목록에 다시 나타나는 근거가 아니다.
 */
public enum PersonalTaskPromotionType {
    /** 오늘의 타임블록에 개인 블록(CUSTOM)으로 배치 */
    TIMEBLOCK,
    /** 칸반 태스크로 생성 */
    TASK,
    /** 기존 태스크의 체크리스트 항목으로 이동 */
    CHECKLIST_ITEM
}
