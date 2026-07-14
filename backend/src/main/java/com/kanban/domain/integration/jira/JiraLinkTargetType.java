package com.kanban.domain.integration.jira;

/**
 * JiraIssueLink 원장이 가리키는 BRIDGE 엔티티 종류.
 * Epic → FEATURE, 이슈 → TASK, 서브태스크 → CHECKLIST.
 */
public enum JiraLinkTargetType {
    FEATURE,
    TASK,
    CHECKLIST
}
