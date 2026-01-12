package com.kanban.domain.board;

/**
 * 보드 티어 enum
 * - TRIAL: 7일 무료 체험 (Premium 기능 사용 가능)
 * - STANDARD: 무료 (Task 10개 제한, 스케줄/마일스톤 접근 불가)
 * - PREMIUM: 유료 (무제한)
 */
public enum BoardTier {
    TRIAL,      // 7일 무료 체험
    STANDARD,   // 무료 기본
    PREMIUM     // 유료 구독
}
