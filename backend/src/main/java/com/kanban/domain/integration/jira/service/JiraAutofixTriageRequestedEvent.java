package com.kanban.domain.integration.jira.service;

import java.util.List;

/**
 * 트리아지 실행 요청. 실행을 요청 스레드에서 떼어내기 위한 신호다.
 *
 * <p>서비스가 자기 자신의 {@code @Async} 메서드를 부를 수는 없고(프록시를 거치지 않는다),
 * 별도 빈으로 빼면 서비스 ↔ 러너가 서로를 주입하는 순환이 된다. 이벤트는 그 둘 다 피한다.
 *
 * @param runId     진행률을 적을 {@code jira_autofix_triage_runs} 행
 * @param issueKeys 좁혀 돌릴 이슈키. 비면 보드 전체
 */
public record JiraAutofixTriageRequestedEvent(
        String runId,
        String boardId,
        String userId,
        boolean force,
        List<String> issueKeys
) { }
