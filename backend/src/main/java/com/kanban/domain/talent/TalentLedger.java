package com.kanban.domain.talent;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;

/**
 * 달란트 원장 한 줄. 지우거나 고치지 않는다(append-only).
 *
 * <p>같은 근거(award_key)는 seq 0, 1, 2… 로 적립(+)과 상쇄(−)를 번갈아 쌓는다. 키의 합이 0 보다 크면 "살아 있는" 적립이다.
 * (user_id, award_key, award_seq) 유니크가 동시 요청의 중복 적립을 막는다.
 *
 * <p>created_at 은 {@link ChallengeClock} 으로 직접 채운다(감사 리스너를 쓰지 않음 — 하루·달 경계 계산에 쓰인다).
 */
@Entity
@Table(
        name = "talent_ledger",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_tl_user_key_seq",
                        columnNames = {"user_id", "award_key", "award_seq"}),
        indexes = {
            @Index(name = "idx_tl_user_created", columnList = "user_id, created_at"),
            @Index(name = "idx_tl_user_source", columnList = "user_id, source_id"),
            @Index(name = "idx_tl_user_week_reason", columnList = "user_id, week, reason")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class TalentLedger {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "amount", nullable = false)
    private int amount;

    @Column(name = "reason", nullable = false, length = 20)
    private String reason;

    @Column(name = "award_key", nullable = false, length = 120)
    private String awardKey;

    @Column(name = "award_seq", nullable = false)
    private int awardSeq;

    @Column(name = "source_id", length = 64)
    private String sourceId;

    @Column(name = "label", length = 200)
    private String label;

    /** 이 행이 셈해지는 주(월요일). 상쇄 행은 원래 적립의 주를 그대로 쓴다. */
    @Column(name = "week", nullable = false)
    private LocalDate week;

    @Column(name = "counts_for_rank", nullable = false)
    private boolean countsForRank;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
