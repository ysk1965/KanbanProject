package com.kanban.domain.ranking;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;
import lombok.*;

/** 주간 랭킹 점수. talents = 그 주 counts_for_rank 원장 합, rain_best = 산성비 최고점, books_best_ms = 66권(all) 최단 시간. */
@Entity
@Table(
        name = "weekly_scores",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_ws_week_user",
                        columnNames = {"week", "user_id"}),
        indexes = {
            @Index(name = "idx_ws_week_talents", columnList = "week, talents"),
            @Index(name = "idx_ws_week_rain", columnList = "week, rain_best"),
            @Index(name = "idx_ws_week_books", columnList = "week, books_best_ms")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WeeklyScore extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "week", nullable = false)
    private LocalDate week;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "talents", nullable = false)
    private int talents;

    @Column(name = "rain_best")
    private Integer rainBest;

    @Column(name = "books_best_ms")
    private Integer booksBestMs;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void addTalents(int amount) {
        this.talents += amount;
    }

    /** 더 높으면 갱신 */
    public void offerRain(int score) {
        if (rainBest == null || score > rainBest) this.rainBest = score;
    }

    /** 더 짧으면 갱신 */
    public void offerBooks(int ms) {
        if (booksBestMs == null || ms < booksBestMs) this.booksBestMs = ms;
    }
}
