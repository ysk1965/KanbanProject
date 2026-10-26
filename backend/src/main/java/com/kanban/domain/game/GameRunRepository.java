package com.kanban.domain.game;

import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GameRunRepository extends JpaRepository<GameRun, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM GameRun r WHERE r.id = :id")
    Optional<GameRun> findForUpdate(@Param("id") String id);

    /** 유효한 판의 최고점(rain) — from 이 null 이면 전체 */
    @Query("SELECT MAX(r.score) FROM GameRun r WHERE r.userId = :userId AND r.game = :game AND r.valid = true "
            + "AND r.createdAt >= :from")
    Integer maxScoreSince(
            @Param("userId") String userId, @Param("game") String game, @Param("from") LocalDateTime from);

    /** 유효한 판의 최단 시간(books, 단계별) */
    @Query("SELECT MIN(r.score) FROM GameRun r WHERE r.userId = :userId AND r.game = :game AND r.stage = :stage "
            + "AND r.valid = true AND r.createdAt >= :from")
    Integer minScoreSince(
            @Param("userId") String userId,
            @Param("game") String game,
            @Param("stage") String stage,
            @Param("from") LocalDateTime from);
}
