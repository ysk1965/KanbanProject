package com.kanban.domain.schedule;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ScheduleBlockRepository extends JpaRepository<ScheduleBlock, String> {

    List<ScheduleBlock> findByBoardIdAndScheduledDateAndAssigneeIdInOrderByStartTimeAsc(
            String boardId, LocalDate scheduledDate, List<String> assigneeIds);

    List<ScheduleBlock> findByBoardIdAndScheduledDateAndAssigneeIdOrderByStartTimeAsc(
            String boardId, LocalDate scheduledDate, String assigneeId);

    List<ScheduleBlock> findByChecklistItemId(String checklistItemId);

    @Query("SELECT sb FROM ScheduleBlock sb WHERE sb.board.id = :boardId AND sb.scheduledDate = :date ORDER BY sb.assignee.id, sb.startTime")
    List<ScheduleBlock> findAllByBoardIdAndDate(@Param("boardId") String boardId, @Param("date") LocalDate date);

    void deleteByChecklistItemId(String checklistItemId);
}
