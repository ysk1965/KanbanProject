package com.kanban.domain.calendar;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CalendarEventRepository extends JpaRepository<CalendarEvent, String> {

    /**
     * 보드의 모든 특별 일정 (member/createdBy fetch join).
     * 특별 일정은 태스크와 달리 소량이라 전체 조회 후 프론트에서 표시 창(window) + 반복 확장을 처리한다.
     */
    @Query("SELECT e FROM CalendarEvent e " +
           "LEFT JOIN FETCH e.member " +
           "LEFT JOIN FETCH e.createdBy " +
           "WHERE e.board.id = :boardId " +
           "ORDER BY e.startDate ASC")
    List<CalendarEvent> findByBoardIdWithDetails(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM CalendarEvent e WHERE e.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("UPDATE CalendarEvent e SET e.member = null WHERE e.member.id = :userId")
    void nullifyMemberByUserId(@Param("userId") String userId);

    @Modifying
    @Query("UPDATE CalendarEvent e SET e.createdBy = null WHERE e.createdBy.id = :userId")
    void nullifyCreatedByUserId(@Param("userId") String userId);
}
