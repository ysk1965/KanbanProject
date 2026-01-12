package com.kanban.domain.checklist;

import com.kanban.domain.schedule.ScheduleBlock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChecklistItemRepository extends JpaRepository<ChecklistItem, String> {

    List<ChecklistItem> findByTaskIdOrderByPositionAsc(String taskId);

    @Query("SELECT MAX(c.position) FROM ChecklistItem c WHERE c.task.id = :taskId")
    Integer findMaxPositionByTaskId(@Param("taskId") String taskId);

    int countByTaskId(String taskId);

    int countByTaskIdAndIsCompletedTrue(String taskId);

    void deleteByTaskId(String taskId);

    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId ORDER BY c.task.id, c.position")
    List<ChecklistItem> findByBoardId(@Param("boardId") String boardId);

    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.assignee.id = :assigneeId ORDER BY c.task.id, c.position")
    List<ChecklistItem> findByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.id NOT IN " +
           "(SELECT sb.checklistItem.id FROM ScheduleBlock sb WHERE sb.checklistItem IS NOT NULL) " +
           "ORDER BY c.task.id, c.position")
    List<ChecklistItem> findUnscheduledByBoardId(@Param("boardId") String boardId);

    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.assignee.id = :assigneeId AND c.id NOT IN " +
           "(SELECT sb.checklistItem.id FROM ScheduleBlock sb WHERE sb.checklistItem IS NOT NULL) " +
           "ORDER BY c.task.id, c.position")
    List<ChecklistItem> findUnscheduledByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);
}
