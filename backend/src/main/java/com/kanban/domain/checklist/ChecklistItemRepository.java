package com.kanban.domain.checklist;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ChecklistItemRepository extends JpaRepository<ChecklistItem, String> {

    @Modifying
    @Query(value = "DELETE FROM checklist_items WHERE task_id IN (SELECT id FROM tasks WHERE board_id = :boardId)", nativeQuery = true)
    void deleteAllByBoardId(@Param("boardId") String boardId);

    // 임시(예정) 항목은 제외 — 태스크 상세 체크리스트 목록 (워크로드/캘린더 by-assignee 조회만 포함)
    @Query("SELECT c FROM ChecklistItem c WHERE c.task.id = :taskId AND c.isTentative = false ORDER BY c.position ASC")
    List<ChecklistItem> findByTaskIdOrderByPositionAsc(@Param("taskId") String taskId);

    // 다음 position 계산은 임시 항목 포함 (행 충돌 방지)
    @Query("SELECT MAX(c.position) FROM ChecklistItem c WHERE c.task.id = :taskId")
    Integer findMaxPositionByTaskId(@Param("taskId") String taskId);

    // 태스크 카운트 — 임시 항목 제외
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.id = :taskId AND c.isTentative = false")
    int countByTaskId(@Param("taskId") String taskId);

    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.id = :taskId AND c.isCompleted = true AND c.isTentative = false")
    int countByTaskIdAndIsCompletedTrue(@Param("taskId") String taskId);

    @Modifying
    @Query(value = "DELETE FROM checklist_items WHERE task_id = :taskId", nativeQuery = true)
    void deleteByTaskId(@Param("taskId") String taskId);

    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.isTentative = false ORDER BY c.task.id, c.position")
    List<ChecklistItem> findByBoardId(@Param("boardId") String boardId);

    @Query("SELECT c FROM ChecklistItem c " +
           "JOIN FETCH c.task t " +
           "LEFT JOIN FETCH c.assignee " +
           "WHERE t.board.id = :boardId AND c.isTentative = false ORDER BY t.id, c.position")
    List<ChecklistItem> findByBoardIdWithTask(@Param("boardId") String boardId);

    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.assignee.id = :assigneeId AND c.isTentative = false ORDER BY c.task.id, c.position")
    List<ChecklistItem> findByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.isTentative = false AND c.id NOT IN " +
           "(SELECT sb.checklistItem.id FROM ScheduleBlock sb WHERE sb.checklistItem IS NOT NULL) " +
           "ORDER BY c.task.id, c.position")
    List<ChecklistItem> findUnscheduledByBoardId(@Param("boardId") String boardId);

    @Query("SELECT c FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.assignee.id = :assigneeId AND c.isTentative = false AND c.id NOT IN " +
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
           "AND c.isTentative = false " +
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
           "AND c.isTentative = false " +
           "AND c.createdAt < :thresholdDate " +
           "ORDER BY c.createdAt ASC")
    List<ChecklistItem> findStuckChecklistsByAssignee(@Param("boardId") String boardId,
                                                       @Param("assigneeId") String assigneeId,
                                                       @Param("thresholdDate") LocalDateTime thresholdDate);

    /**
     * 특정 Task의 체크리스트 완료 현황
     */
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.id = :taskId AND c.isCompleted = true AND c.isTentative = false")
    int countCompletedByTaskId(@Param("taskId") String taskId);

    /**
     * 특정 담당자의 보드 내 전체 체크리스트 수
     */
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.assignee.id = :assigneeId AND c.isTentative = false")
    int countByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    /**
     * 특정 담당자의 보드 내 완료 체크리스트 수
     */
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.assignee.id = :assigneeId AND c.isCompleted = true AND c.isTentative = false")
    int countCompletedByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    /**
     * 보드 내 전체 체크리스트 수
     */
    @Query("SELECT COUNT(c) FROM ChecklistItem c WHERE c.task.board.id = :boardId AND c.isTentative = false")
    long countByTaskBoardId(@Param("boardId") String boardId);

    /**
     * 여러 Task의 체크리스트 일괄 조회 (N+1 방지) — 임시 항목 제외
     */
    @Query("SELECT c FROM ChecklistItem c " +
           "JOIN FETCH c.task t " +
           "LEFT JOIN FETCH c.assignee " +
           "WHERE t.id IN :taskIds AND c.isTentative = false " +
           "ORDER BY t.id, c.position")
    List<ChecklistItem> findByTaskIdIn(@Param("taskIds") List<String> taskIds);

    @Query("SELECT DISTINCT c.assignee.id FROM ChecklistItem c WHERE c.task.id = :taskId AND c.assignee IS NOT NULL AND c.isTentative = false")
    List<String> findDistinctAssigneeIdsByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("UPDATE ChecklistItem ci SET ci.assignee = null WHERE ci.assignee.id = :userId")
    void nullifyAssigneeByUserId(@Param("userId") String userId);

    @Modifying
    @Query(value = "DELETE FROM checklist_items WHERE task_id IN (SELECT id FROM tasks WHERE feature_id = :featureId)", nativeQuery = true)
    void deleteByFeatureId(@Param("featureId") String featureId);

    // ==================== Soft-delete / Trash Queries (native to bypass @SQLRestriction) ====================

    @Query(value = "SELECT * FROM checklist_items ci WHERE ci.task_id IN (SELECT id FROM tasks WHERE board_id = :boardId) AND ci.deleted_at IS NOT NULL ORDER BY ci.deleted_at DESC", nativeQuery = true)
    List<ChecklistItem> findDeletedByBoardId(@Param("boardId") String boardId);

    @Query(value = "SELECT * FROM checklist_items WHERE task_id = :taskId AND deleted_at = :deletedAt", nativeQuery = true)
    List<ChecklistItem> findByTaskIdAndDeletedAt(@Param("taskId") String taskId, @Param("deletedAt") LocalDateTime deletedAt);

    @Query(value = "SELECT * FROM checklist_items WHERE id = :id", nativeQuery = true)
    Optional<ChecklistItem> findByIdIncludingDeleted(@Param("id") String id);

    @Query(value = "SELECT * FROM checklist_items WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff", nativeQuery = true)
    List<ChecklistItem> findExpiredSoftDeleted(@Param("cutoff") LocalDateTime cutoff);

    /**
     * 영구삭제 스케줄러용: ci.id + 해당 task의 board_id를 한 번에 native 조회 (associations 미사용).
     * Task가 soft-deleted여도 board_id는 정상 반환 (native이라 @SQLRestriction 우회).
     */
    @Query(value = "SELECT ci.id, t.board_id FROM checklist_items ci JOIN tasks t ON ci.task_id = t.id " +
                   "WHERE ci.deleted_at IS NOT NULL AND ci.deleted_at < :cutoff", nativeQuery = true)
    List<Object[]> findExpiredSoftDeletedWithBoardId(@Param("cutoff") LocalDateTime cutoff);

    @Modifying
    @Query(value = "UPDATE checklist_items SET deleted_at = :deletedAt, deleted_by = :deletedBy WHERE task_id = :taskId AND deleted_at IS NULL", nativeQuery = true)
    int softDeleteByTaskId(@Param("taskId") String taskId,
                           @Param("deletedAt") LocalDateTime deletedAt,
                           @Param("deletedBy") String deletedBy);

    @Modifying
    @Query(value = "UPDATE checklist_items SET deleted_at = :deletedAt, deleted_by = :deletedBy WHERE task_id IN (SELECT id FROM tasks WHERE feature_id = :featureId) AND deleted_at IS NULL", nativeQuery = true)
    int softDeleteByFeatureId(@Param("featureId") String featureId,
                              @Param("deletedAt") LocalDateTime deletedAt,
                              @Param("deletedBy") String deletedBy);

    @Modifying
    @Query(value = "UPDATE checklist_items SET deleted_at = NULL, deleted_by = NULL WHERE task_id = :taskId AND deleted_at = :deletedAt", nativeQuery = true)
    int restoreByTaskIdAndDeletedAt(@Param("taskId") String taskId,
                                    @Param("deletedAt") LocalDateTime deletedAt);

    @Modifying
    @Query(value = "UPDATE checklist_items SET deleted_at = NULL, deleted_by = NULL WHERE task_id IN (SELECT id FROM tasks WHERE feature_id = :featureId) AND deleted_at = :deletedAt", nativeQuery = true)
    int restoreByFeatureIdAndDeletedAt(@Param("featureId") String featureId,
                                       @Param("deletedAt") LocalDateTime deletedAt);

    // ==================== Schedule Calendar / Resource View Queries ====================

    /**
     * 보드 내 체크리스트를 담당자별로 조회 (캘린더/리소스 뷰용)
     * - Task와 Feature를 JOIN FETCH하여 N+1 방지
     * - startDate/endDate가 null이면 전체 조회
     * - 날짜 조건: start_date 또는 due_date가 지정 범위 내에 있는 항목 포함
     *   (날짜 없는 미배정 항목은 unassigned로 별도 처리하므로 제외하지 않음)
     */
    @Query("SELECT c FROM ChecklistItem c " +
           "JOIN FETCH c.task t " +
           "JOIN FETCH t.feature f " +
           "LEFT JOIN FETCH c.assignee a " +
           "WHERE t.board.id = :boardId " +
           "AND (CAST(:startDate AS date) IS NULL OR c.dueDate >= :startDate OR c.startDate >= :startDate) " +
           "AND (CAST(:endDate AS date) IS NULL OR c.startDate <= :endDate OR c.dueDate <= :endDate) " +
           "ORDER BY a.id ASC NULLS LAST, t.id ASC, c.position ASC")
    List<ChecklistItem> findByBoardIdAndDateRange(
            @Param("boardId") String boardId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    // ==================== Organization Insights Queries ====================

    /**
     * 특정 담당자의 조직 보드들에서 기간 내 완료한 체크리스트 수
     */
    @Query("SELECT COUNT(ci) FROM ChecklistItem ci JOIN ci.task t WHERE t.board.id IN :boardIds " +
           "AND ci.assignee.id = :assigneeId AND ci.isCompleted = true AND ci.isTentative = false " +
           "AND ci.completedAt BETWEEN :startDateTime AND :endDateTime")
    long countCompletedByAssigneeAndBoardIds(@Param("assigneeId") String assigneeId,
                                              @Param("boardIds") List<String> boardIds,
                                              @Param("startDateTime") LocalDateTime startDateTime,
                                              @Param("endDateTime") LocalDateTime endDateTime);

    // ==================== Cross-Domain Integration Queries ====================

    /**
     * 특정 유저의 다중 보드에서 미완료 체크리스트 아이템 조회
     */
    @Query("SELECT ci FROM ChecklistItem ci " +
           "JOIN FETCH ci.task t " +
           "JOIN FETCH t.board " +
           "JOIN FETCH t.feature " +
           "WHERE ci.assignee.id = :assigneeId AND t.board.id IN :boardIds AND ci.isCompleted = false AND ci.isTentative = false " +
           "ORDER BY t.board.id, t.id, ci.position")
    List<ChecklistItem> findByAssigneeIdAndBoardIdInAndNotCompleted(
            @Param("assigneeId") String assigneeId,
            @Param("boardIds") List<String> boardIds);

    /**
     * 특정 유저의 다중 보드에서 특정 날짜 범위에 완료된 체크리스트 아이템 조회
     */
    @Query("SELECT ci FROM ChecklistItem ci " +
           "JOIN FETCH ci.task t " +
           "JOIN FETCH t.board " +
           "JOIN FETCH t.feature " +
           "WHERE ci.assignee.id = :assigneeId AND t.board.id IN :boardIds " +
           "AND ci.isCompleted = true AND ci.isTentative = false AND ci.completedAt BETWEEN :startDateTime AND :endDateTime " +
           "ORDER BY ci.completedAt DESC")
    List<ChecklistItem> findCompletedByAssigneeAndBoardIdsAndDateRange(
            @Param("assigneeId") String assigneeId,
            @Param("boardIds") List<String> boardIds,
            @Param("startDateTime") LocalDateTime startDateTime,
            @Param("endDateTime") LocalDateTime endDateTime);
}
