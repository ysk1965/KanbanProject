package com.kanban.domain.meeting;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface MeetingRepository extends JpaRepository<Meeting, String> {

    List<Meeting> findByBoardIdAndMeetingDateOrderByStartTimeAsc(String boardId, LocalDate meetingDate);

    List<Meeting> findByBoardIdAndMeetingDateBetweenOrderByMeetingDateAscStartTimeAsc(
            String boardId, LocalDate startDate, LocalDate endDate);

    @Modifying
    @Query("DELETE FROM Meeting m WHERE m.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    List<Meeting> findByRecurrenceGroupIdOrderByMeetingDateAsc(String recurrenceGroupId);

    @Query("SELECT m FROM Meeting m WHERE m.recurrenceGroupId = :groupId AND m.meetingDate >= :fromDate ORDER BY m.meetingDate ASC")
    List<Meeting> findByRecurrenceGroupIdFromDate(@Param("groupId") String groupId, @Param("fromDate") LocalDate fromDate);

    @Modifying
    @Query("DELETE FROM Meeting m WHERE m.recurrenceGroupId = :groupId AND m.meetingDate >= :fromDate")
    void deleteByRecurrenceGroupIdFromDate(@Param("groupId") String groupId, @Param("fromDate") LocalDate fromDate);

    @Query("SELECT m FROM Meeting m WHERE m.board.id = :boardId AND m.meetingDate = :date AND m.startTime IS NOT NULL ORDER BY m.startTime ASC")
    List<Meeting> findByBoardIdAndMeetingDateWithTime(@Param("boardId") String boardId, @Param("date") LocalDate date);
}
