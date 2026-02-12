package com.kanban.domain.subscription;

public enum SubscriptionStatus {
    TRIAL,      // 체험 기간 (7일)
    ACTIVE,     // 활성 구독
    PAST_DUE,   // 결제 실패
    SUSPENDED,  // 정지 (읽기 전용)
    CANCELED    // 취소됨
}
