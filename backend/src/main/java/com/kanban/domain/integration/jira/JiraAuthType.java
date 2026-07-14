package com.kanban.domain.integration.jira;

/**
 * JIRA 연동 인증 방식.
 * - API_TOKEN: Atlassian API 토큰 + 계정 이메일 (Basic 인증). 현재 기본.
 * - OAUTH_3LO: OAuth 2.0 3LO (추후 지원 예정).
 */
public enum JiraAuthType {
    API_TOKEN,
    OAUTH_3LO
}
