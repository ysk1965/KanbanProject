package com.kanban.domain.subscription;

public enum PaymentStatus {
    PENDING,    // 결제 대기
    PAID,       // 결제 완료
    FAILED,     // 결제 실패
    REFUNDED    // 환불됨
}
