package com.kanban.domain.monitoring.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "ai_usage_logs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AiUsageLog {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "board_id", length = 36)
    private String boardId;

    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "feature_type", nullable = false, length = 40)
    private String featureType;

    @Column(name = "provider", nullable = false, length = 20)
    private String provider;

    @Column(name = "model", nullable = false, length = 50)
    private String model;

    @Column(name = "input_tokens", nullable = false)
    @Builder.Default
    private Integer inputTokens = 0;

    @Column(name = "output_tokens", nullable = false)
    @Builder.Default
    private Integer outputTokens = 0;

    @Column(name = "estimated_cost_usd")
    @Builder.Default
    private Double estimatedCostUsd = 0.0;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "credit_source", length = 20)
    private String creditSource;  // "MONTHLY", "PURCHASED", "MIXED"

    @Column(name = "credits_used")
    @Builder.Default
    private Integer creditsUsed = 1;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    // Per 1M tokens pricing: [inputPrice, outputPrice]
    // 주의: 미등록 모델은 아래 calculateCost에서 gpt-4o-mini 단가로 폴백한다.
    // 새 모델을 쓰기 시작하면 반드시 여기에 추가할 것 — 안 그러면 비용이 크게 축소 기록된다
    // (예: claude-opus-4-8은 입력 단가가 gpt-4o-mini의 33배다).
    private static final java.util.Map<String, double[]> MODEL_PRICING = java.util.Map.of(
            "gpt-4o-mini", new double[]{0.15, 0.60},
            "gpt-4o", new double[]{2.50, 10.00},
            "claude-haiku-4-5-20251001", new double[]{1.00, 5.00},
            "claude-sonnet-4-5-20250929", new double[]{3.00, 15.00},
            "claude-opus-4-8", new double[]{5.00, 25.00},
            "claude-haiku-4-5", new double[]{1.00, 5.00}
    );

    public static double calculateCost(String model, int inputTokens, int outputTokens) {
        double[] prices = MODEL_PRICING.getOrDefault(model, new double[]{0.15, 0.60});
        return (inputTokens * prices[0] + outputTokens * prices[1]) / 1_000_000.0;
    }
}
