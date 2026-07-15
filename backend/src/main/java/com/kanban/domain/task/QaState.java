package com.kanban.domain.task;

/**
 * JIRA에서 pull된 QA 진행 상태 (읽기전용). 개발이 소유하지 않는 상태를 카드에 뱃지로 표시한다.
 *
 * <p>null = QA 흐름 밖(개발 소유). REVIEW/VERIFIED = pull 블록에 반영, REJECTED = 작업 중 복귀 + 사유.
 * {@code JiraImportService}/{@code JiraSyncScheduler}의 pull 경로에서만 세팅된다.
 */
public enum QaState {
    REVIEW,     // JIRA 검토중 — QA가 확인 중
    VERIFIED,   // JIRA 완료 — QA 검증 통과
    REJECTED    // JIRA 반려 — 작업 중으로 복귀
}
