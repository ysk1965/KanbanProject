package com.kanban.domain.checklist;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ChecklistItemRepository extends JpaRepository<ChecklistItem, String> {

    @Modifying
    @Query("DELETE FROM ChecklistItem ci WHERE ci.task.id IN (SELECT t.id FROM Task t WHERE t.board.id = :boardId)")
    void deleteAllByBoardId(@Param("boardId") String boardId);

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

    // ==================== Management Statistics Queries ====================

    /**
     * 막힌 체크리스트 조회: N일 이상 미완료 상태인 체크리스트
     * createdAt이 thresholdDate 이전이고 미완료인 ChecklistItem
     */
    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId " +
           "AND c.isCompleted = false " +
           "AND c.createdAt < :thresholdDate " +
           "ORDER BY c.createdAt ASC")
    List<ChecklistItem> findStuckChecklists(@Param("boardId") String boardId,
                                             @Param("thresholdDate") LocalDateTime thresholdDate);

    /**
     * 특정 담당자의 막힌 체크리스트 조회
     */
    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId " +
           "AND c.assignee.id = :assigneeId " +
           "AND c.isCompleted = false " +
           "AND c.createdAt < :thresholdDate " +
           "ORDER BY c.createdAt ASC")
    List<ChecklistItem> findStuckChecklistsByAssignee(@Param("boardId") String boardId,
                                                       @Param("assigneeId") String assigneeId,
                                                       @Param("thresholdDate") LocalDateTime thresholdDate);

    /**
     * 특정 Task의 체크리스트 완료 현황
     */
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.id = :taskId AND c.isCompleted = true")
    int countCompletedByTaskId(@Param("taskId") String taskId);

    /**
     * 특정 담당자의 보드 내 전체 체크리스트 수
     */
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.assignee.id = :assigneeId")
    int countByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    /**
     * 특정 담당자의 보드 내 완료 체크리스트 수
     */
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.assignee.id = :assigneeId AND c.isCompleted = true")
    int countCompletedByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    /**
     * 보드 내 전체 체크리스트 수
     */
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.board.id = :boardId")
    long countByTaskBoardId(@Param("boardId") String boardId);

    /**
     * 여러 Task의 체크리스트 일괄 조회 (N+1 방지)
     */
    @Query("SELECT c FROM ChecklistItem c " +
           "JOIN FETCH c.task t " +
           "LEFT JOIN FETCH c.assignee " +
           "WHERE t.id IN :taskIds " +
           "ORDER BY t.id, c.position")
    List<ChecklistItem> findByTaskIdIn(@Param("taskIds") List<String> taskIds);
}
