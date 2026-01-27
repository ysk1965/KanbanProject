package com.kanban.domain.user;

/**
 * 시스템 레벨 역할
 * - USER: 일반 사용자
 * - ADMIN: 시스템 관리자 (전체 데이터 접근 가능)
 */
public enum SystemRole {
    USER,    // 일반 사용자
    TESTER,  // 테스터 (과금 UI 숨김)
    ADMIN    // 시스템 관리자
}
