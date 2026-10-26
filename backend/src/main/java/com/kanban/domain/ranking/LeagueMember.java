package com.kanban.domain.ranking;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;

/** 그 주 리그 반 배정. 같은 (week, tier) 안에서 cohort 1, 2, … 를 30명씩 채운다. */
@Entity
@Table(
        name = "league_members",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_lm_week_user",
                        columnNames = {"week", "user_id"}),
        indexes = @Index(name = "idx_lm_week_tier_cohort", columnList = "week, tier, cohort"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class LeagueMember {

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

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
