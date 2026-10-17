package com.kanban.domain.subscription;

/** {@link PolarWebhookDelivery} 의 처리 상태 */
public enum PolarWebhookDeliveryStatus {
    /** 선점했고 처리 중 — 같은 id 의 동시 재전송은 건너뛴다 */
    PROCESSING,
    /** 처리 완료 — 재전송은 무시한다 */
    PROCESSED,
    /** 처리 중 예외 — 재전송이 오면 다시 처리한다 */
    FAILED
}
