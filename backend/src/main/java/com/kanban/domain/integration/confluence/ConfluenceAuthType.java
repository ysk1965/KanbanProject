package com.kanban.domain.integration.confluence;

/**
 * Confluence Cloud 전용. Server/DC(PAT Bearer + REST v1)는 범위 밖이다.
 */
public enum ConfluenceAuthType {
    /** Atlassian OAuth 2.0 3LO — 기본 경로 */
    OAUTH_3LO,
    /** 이메일 + API 토큰 Basic 인증 — OAuth 앱 동의가 막힌 경우의 폴백 */
    API_TOKEN
}
