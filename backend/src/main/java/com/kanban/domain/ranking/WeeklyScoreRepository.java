package com.kanban.domain.ranking;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WeeklyScoreRepository extends JpaRepository<WeeklyScore, String> {

    Optional<WeeklyScore> findByWeekAndUserId(LocalDate week, String userId);

    List<WeeklyScore> findByWeekAndUserIdIn(LocalDate week, Collection<String> userIds);

    @Query("SELECT s FROM WeeklyScore s WHERE s.week = :week AND s.talents > 0 "
            + "ORDER BY s.talents DESC, s.updatedAt ASC")
    List<WeeklyScore> topTalents(@Param("week") LocalDate week, Pageable pageable);

    @Query("SELECT s FROM WeeklyScore s WHERE s.week = :week AND s.rainBest IS NOT NULL "
            + "ORDER BY s.rainBest DESC, s.updatedAt ASC")
    List<WeeklyScore> topRain(@Param("week") LocalDate week, Pageable pageable);

    @Query("SELECT s FROM WeeklyScore s WHERE s.week = :week AND s.booksBestMs IS NOT NULL "
            + "ORDER BY s.booksBestMs ASC, s.updatedAt ASC")
    List<WeeklyScore> topBooks(@Param("week") LocalDate week, Pageable pageable);

    @Query("SELECT COUNT(s) FROM WeeklyScore s WHERE s.week = :week AND s.talents > :value")
    long countTalentsAbove(@Param("week") LocalDate week, @Param("value") int value);

    @Query("SELECT COUNT(s) FROM WeeklyScore s WHERE s.week = :week AND s.rainBest > :value")
    long countRainAbove(@Param("week") LocalDate week, @Param("value") int value);

    @Query("SELECT COUNT(s) FROM WeeklyScore s WHERE s.week = :week AND s.booksBestMs < :value")
    long countBooksBelow(@Param("week") LocalDate week, @Param("value") int value);

    @Query("SELECT MIN(s.talents) FROM WeeklyScore s WHERE s.week = :week AND s.talents > :value")
    Integer minTalentsAbove(@Param("week") LocalDate week, @Param("value") int value);

    @Query("SELECT MIN(s.rainBest) FROM WeeklyScore s WHERE s.week = :week AND s.rainBest > :value")
    Integer minRainAbove(@Param("week") LocalDate week, @Param("value") int value);

    @Query("SELECT MAX(s.booksBestMs) FROM WeeklyScore s WHERE s.week = :week AND s.booksBestMs < :value")
    Integer maxBooksBelow(@Param("week") LocalDate week, @Param("value") int value);
}
