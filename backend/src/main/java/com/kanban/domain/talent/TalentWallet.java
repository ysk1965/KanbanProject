package com.kanban.domain.talent;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 달란트 잔액 캐시(= 원장 합계). 사용자별 원장 쓰기는 이 행을 비관적 잠금으로 잡고 한다 — 상한 계산과 잔액이 어긋나지 않게.
 */
@Entity
@Table(name = "talent_wallets")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class TalentWallet extends BaseTimeEntity {

    @Id
    @Column(name = "user_id", length = 36)
    private String userId;

    @Column(name = "balance", nullable = false)
    private int balance;

    public void add(int amount) {
        this.balance += amount;
    }
}
