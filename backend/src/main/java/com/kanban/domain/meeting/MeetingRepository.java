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
}
