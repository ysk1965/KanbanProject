package com.kanban.domain.personal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PersonalHabitLogRepository extends JpaRepository<PersonalHabitLog, String> {

    Optional<PersonalHabitLog> findByHabitIdAndLogDate(String habitId, LocalDate logDate);

    @Query("SELECT l FROM PersonalHabitLog l WHERE l.habit.id = :habitId AND l.logDate >= :startDate AND l.logDate <= :endDate ORDER BY l.logDate")
    List<PersonalHabitLog> findByHabitIdAndDateRange(@Param("habitId") String habitId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT l FROM PersonalHabitLog l WHERE l.habit.id IN :habitIds AND l.logDate = :date")
    List<PersonalHabitLog> findByHabitIdsAndDate(@Param("habitIds") List<String> habitIds, @Param("date") LocalDate date);

    @Query("SELECT l FROM PersonalHabitLog l WHERE l.habit.id IN :habitIds AND l.logDate >= :startDate AND l.logDate <= :endDate ORDER BY l.logDate")
    List<PersonalHabitLog> findByHabitIdsAndDateRange(@Param("habitIds") List<String> habitIds, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT COUNT(l) FROM PersonalHabitLog l WHERE l.habit.user.id = :userId AND l.logDate = :date AND l.isCompleted = true")
    long countCompletedByUserIdAndDate(@Param("userId") String userId, @Param("date") LocalDate date);
}
