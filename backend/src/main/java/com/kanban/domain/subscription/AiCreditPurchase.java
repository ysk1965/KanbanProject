package com.kanban.domain.subscription;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "ai_credit_purchases")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AiCreditPurchase {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "board_id", nullable = false, length = 36)
    private String boardId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "credit_amount", nullable = false)
    private Integer creditAmount;

    @Column(name = "unit_price", nullable = false)
    @Builder.Default
    private Integer unitPrice = 1000;

    @Column(name = "total_amount", nullable = false)
    private Integer totalAmount;

    @Column(name = "payment_key", length = 200)
    private String paymentKey;

    @Column(name = "order_id", length = 200)
    private String orderId;

    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "COMPLETED";

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }
}
