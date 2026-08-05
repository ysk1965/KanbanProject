package com.kanban.domain.integration.jira;

/** 트리아지 실행 상태. 화면은 RUNNING 동안만 폴링한다. */
public enum AutofixTriageRunStatus {
    RUNNING,
    SUCCEEDED,
    /**
     * 실행 자체가 엎어진 경우. 배치 몇 개만 실패한 것은 여기 해당하지 않는다 —
     * 그건 {@code failedBatches}로 세고 상태는 SUCCEEDED다(부분 결과라도 남는다).
     */
    FAILED
}
