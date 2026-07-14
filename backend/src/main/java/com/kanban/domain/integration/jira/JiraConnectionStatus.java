package com.kanban.domain.integration.jira;

/**
 * JIRA 연결 상태.
 * - CONNECTED: 연결 검증 성공.
 * - ERROR: 최근 호출 실패 (토큰 만료/권한 등). lastError 참고.
 * - DISCONNECTED: 연결 해제됨.
 */
public enum JiraConnectionStatus {
    CONNECTED,
    ERROR,
    DISCONNECTED
}
