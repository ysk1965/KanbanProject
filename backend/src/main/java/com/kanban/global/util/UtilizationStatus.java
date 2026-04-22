package com.kanban.global.util;

public enum UtilizationStatus {
    OVER, NORMAL, UNDER, UNKNOWN;

    /**
     * 사용률 기반 상태 결정. MilestoneResponse.AllocationDto.determineStatus() 규칙과 동일한
     * 10% 임계값을 사용하되, capacity null → UNKNOWN 처리 추가.
     *
     * <ul>
     *   <li>capacity null → UNKNOWN</li>
     *   <li>capacity &le; 0 &amp;&amp; actual &gt; 0 → OVER</li>
     *   <li>capacity &le; 0 &amp;&amp; actual &le; 0 → UNKNOWN</li>
     *   <li>actual - capacity &gt; capacity × 0.1 → OVER</li>
     *   <li>actual - capacity &lt; -(capacity × 0.1) → UNDER</li>
     *   <li>else → NORMAL</li>
     * </ul>
     *
     * @param actual   실제 투입 시간 (null 이면 0으로 처리)
     * @param capacity 계획 용량 시간 (null 이면 UNKNOWN 반환)
     */
    public static UtilizationStatus determine(Double actual, Double capacity) {
        if (capacity == null) {
            return UNKNOWN;
        }
        double actualValue = actual != null ? actual : 0.0;
        if (capacity <= 0) {
            return actualValue > 0 ? OVER : UNKNOWN;
        }
        double diff = actualValue - capacity;
        if (diff > capacity * 0.1) {
            return OVER;
        }
        if (diff < -(capacity * 0.1)) {
            return UNDER;
        }
        return NORMAL;
    }
}
