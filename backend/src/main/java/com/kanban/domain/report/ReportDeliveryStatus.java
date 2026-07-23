package com.kanban.domain.report;

public enum ReportDeliveryStatus {
    /** 생성·발송 모두 성공 */
    SUCCESS,
    /** 일부 소스 수집에 실패했지만 나머지로 발송은 마침 */
    PARTIAL,
    /** 발송하지 못함 */
    FAILED,
    /** 수집된 활동이 없어 발송을 생략 */
    SKIPPED
}
