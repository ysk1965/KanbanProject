package com.kanban.domain.ranking;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;

/** 주간 리그 마감 결과 (사용자 × 주 한 줄) */
@Entity
@Table(
        name = "league_results",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_lr_week_user",
                        columnNames = {"week", "user_id"}),
        indexes = @Index(name = "idx_lr_user_week", columnList = "user_id, week"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class LeagueResult {

    public static final String UP = "up";
    public static final String STAY = "stay";
    public static final String DOWN = "down";

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "week", nullable = false)
    private LocalDate week;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "tier", nullable = false)
    private int tier;

    @Column(name = "cohort", nullable = false)
    private int cohort;

    @Column(name = "final_rank", nullable = false)
    private int finalRank;

    @Column(name = "talents", nullable = false)
    private int talents;

    @Column(name = "tier_from", nullable = false)
    private int tierFrom;

    @Column(name = "tier_to", nullable = false)
    private int tierTo;

    @Column(name = "moved", nullable = false, length = 4)
    private String moved;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
