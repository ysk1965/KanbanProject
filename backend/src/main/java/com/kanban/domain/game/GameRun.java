package com.kanban.domain.game;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 게임 한 판. 시작 때 서버가 판(단어 순서 / 카드 순서)을 정해 payload 에 두고, 끝낼 때 이벤트로 점수를 다시 계산한다.
 *
 * <p>payload 컬럼 타입은 방언에 맡긴다(PostgreSQL jsonb, H2 json).
 */
@Entity
@Table(
        name = "game_runs",
        indexes = @Index(name = "idx_gr_user_game_stage", columnList = "user_id, game, stage, created_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class GameRun {

    public static final String GAME_RAIN = "rain";
    public static final String GAME_BOOKS = "books";
    public static final String STATUS_OPEN = "open";
    public static final String STATUS_FINISHED = "finished";

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "game", nullable = false, length = 10)
    private String game;

    /** rain: 단어 묶음(set), books: pentateuch / ot / nt / all */
    @Column(name = "stage", nullable = false, length = 20)
    private String stage;

    @Column(name = "label", length = 200)
    private String label;

    @Column(name = "seed", nullable = false)
    private long seed;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false)
    private Map<String, Object> payload;

    @Column(name = "status", nullable = false, length = 10)
    private String status;

    /** rain: 점수, books: duration_ms */
    @Column(name = "score")
    private Integer score;

    @Column(name = "duration_ms")
    private Integer durationMs;

    @Column(name = "valid")
    private Boolean valid;

    @Column(name = "talents")
    private Integer talents;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public boolean isOpen() {
        return STATUS_OPEN.equals(status);
    }

    public void finish(int score, int durationMs, boolean valid, int talents, LocalDateTime finishedAt) {
        this.status = STATUS_FINISHED;
        this.score = score;
        this.durationMs = durationMs;
        this.valid = valid;
        this.talents = talents;
        this.finishedAt = finishedAt;
    }
}
