package com.kanban.domain.personal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface PersonalEventRepository extends JpaRepository<PersonalEvent, String> {

    @Query("SELECT e FROM PersonalEvent e WHERE e.user.id = :userId AND e.eventDate = :date ORDER BY e.startTime ASC NULLS LAST, e.createdAt ASC")
    List<PersonalEvent> findByUserIdAndDate(@Param("userId") String userId, @Param("date") LocalDate date);

    @Query("SELECT e FROM PersonalEvent e WHERE e.user.id = :userId AND e.eventDate BETWEEN :startDate AND :endDate ORDER BY e.eventDate ASC, e.startTime ASC NULLS LAST")
    List<PersonalEvent> findByUserIdAndDateRange(@Param("userId") String userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    void deleteByUserId(String userId);
}
