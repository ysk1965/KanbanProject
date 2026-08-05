package com.kanban.domain.integration.jira;

/**
 * 자동수정 작업의 출처.
 *
 * <p>큐·러너·PR 경로는 둘이 공유하고, 갈리는 것은 넷뿐이다 — 가드레일(확신도 임계값은 JIRA만),
 * 큐 우선순위(MANUAL이 앞), 지시문의 출처(트리아지 vs 사람), 결과 통지(JIRA 댓글 vs 태스크 댓글).
 */
public enum AutofixJobKind {

    /** 트리아지가 고른 JIRA QA 이슈. */
    JIRA,

    /** 사람이 태스크나 체크리스트 항목을 직접 맡긴 작업. */
    MANUAL;

    public boolean isManual() {
        return this == MANUAL;
    }
}
