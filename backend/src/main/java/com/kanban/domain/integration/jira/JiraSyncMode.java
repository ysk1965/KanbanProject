package com.kanban.domain.integration.jira;

/**
 * JIRA 동기화 방식.
 * - MANUAL: 블록별 PUSH/PULL 수동 매핑 (레거시, 기존 파일럿 보드 호환용). UI 신규 노출 X.
 * - MIRROR: JIRA 상태를 BRIDGE 블록에 1:1 미러링. 컬럼 자동 생성, 양방향 동기화. 신규 기본.
 */
public enum JiraSyncMode {
    MANUAL,
    MIRROR
}
