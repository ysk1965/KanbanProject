package com.kanban.domain.personal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface PersonalEventRepository extends JpaRepository<PersonalEvent, String> {

    @Query("SELECT e FROM PersonalEvent e WHERE e.user.id = :userId AND e.eventDate = :date ORDER BY e.startTime ASC NULLS LAST, e.createdAt ASC")
    List<PersonalEvent> findByUserIdAndDate(@Param("userId") String userId, @Param("date") LocalDate date);

    @Query("SELECT e FROM PersonalEvent e WHERE e.user.id = :userId AND e.eventDate BETWEEN :startDate AND :endDate ORDER BY e.eventDate ASC, e.startTime ASC NULLS LAST")
    List<PersonalEvent> findByUserIdAndDateRange(@Param("userId") String userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT e FROM PersonalEvent e WHERE e.user.id = :userId AND e.eventDate = :date AND e.eventType = :eventType ORDER BY e.startTime ASC NULLS LAST, e.createdAt ASC")
    List<PersonalEvent> findByUserIdAndDateAndEventType(@Param("userId") String userId, @Param("date") LocalDate date, @Param("eventType") String eventType);

    @Query("SELECT e FROM PersonalEvent e WHERE e.user.id = :userId AND e.eventDate BETWEEN :startDate AND :endDate AND e.eventType = :eventType ORDER BY e.eventDate ASC, e.startTime ASC NULLS LAST")
    List<PersonalEvent> findByUserIdAndDateRangeAndEventType(@Param("userId") String userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate, @Param("eventType") String eventType);

    List<PersonalEvent> findByRecurrenceGroupIdOrderByEventDateAsc(String recurrenceGroupId);

    @Query("SELECT e FROM PersonalEvent e WHERE e.recurrenceGroupId = :groupId AND e.eventDate >= :fromDate ORDER BY e.eventDate ASC")
    List<PersonalEvent> findByRecurrenceGroupIdFromDate(@Param("groupId") String groupId, @Param("fromDate") LocalDate fromDate);

    @Modifying
    @Query("DELETE FROM PersonalEvent e WHERE e.recurrenceGroupId = :groupId AND e.eventDate >= :fromDate")
    void deleteByRecurrenceGroupIdFromDate(@Param("groupId") String groupId, @Param("fromDate") LocalDate fromDate);

    void deleteByUserId(String userId);

    // Admin용 메서드
    long countByUserId(String userId);
}
