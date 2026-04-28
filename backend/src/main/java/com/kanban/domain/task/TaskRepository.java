package com.kanban.domain.task;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface TaskRepository extends JpaRepository<Task, String> {

    List<Task> findByBoardIdOrderByPositionAsc(String boardId);

    List<Task> findByFeatureIdOrderByPositionAsc(String featureId);

    List<Task> findByBlockIdOrderByPositionAsc(String blockId);

    // ==================== Fetch Join Queries (N+1 방지) ====================

    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "JOIN FETCH t.block " +
           "JOIN FETCH t.board " +
           "LEFT JOIN FETCH t.createdBy " +
           "WHERE t.board.id = :boardId ORDER BY t.position ASC")
    List<Task> findByBoardIdWithFetch(@Param("boardId") String boardId);

    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "JOIN FETCH t.block " +
           "JOIN FETCH t.board " +
           "LEFT JOIN FETCH t.createdBy " +
           "WHERE t.block.id = :blockId ORDER BY t.position ASC")
    List<Task> findByBlockIdWithFetch(@Param("blockId") String blockId);

    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "JOIN FETCH t.block " +
           "JOIN FETCH t.board " +
           "LEFT JOIN FETCH t.createdBy " +
           "WHERE t.feature.id = :featureId ORDER BY t.position ASC")
    List<Task> findByFeatureIdWithFetch(@Param("featureId") String featureId);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId AND t.isCompleted = :isCompleted ORDER BY t.position ASC")
    List<Task> findByBoardIdAndIsCompleted(@Param("boardId") String boardId, @Param("isCompleted") Boolean isCompleted);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId AND t.dueDate = :date AND t.isCompleted = false ORDER BY t.position ASC")
    List<Task> findByBoardIdAndDueDateAndNotCompleted(@Param("boardId") String boardId, @Param("date") LocalDate date);

    @Query("SELECT MAX(t.position) FROM Task t WHERE t.block.id = :blockId")
    Integer findMaxPositionByBlockId(@Param("blockId") String blockId);

    int countByFeatureId(String featureId);

    int countByFeatureIdAndIsCompletedTrue(String featureId);

    int countByBoardId(String boardId);

    int countByBoardIdAndIsCompletedTrue(String boardId);

    /**
     * 여러 보드의 Task 수 일괄 조회 (N+1 방지)
     */
    @Query("SELECT t.board.id, COUNT(t) FROM Task t WHERE t.board.id IN :boardIds GROUP BY t.board.id")
    List<Object[]> countGroupedByBoardId(@Param("boardIds") List<String> boardIds);

    // ==================== Management Statistics Queries ====================

    /**
     * 정체 Task 조회: N일 이상 같은 블록에 있는 미완료 Task
     * updatedAt이 thresholdDate 이전이고 미완료인 Task
     */
    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId " +
           "AND t.isCompleted = false " +
           "AND t.updatedAt < :thresholdDate " +
           "ORDER BY t.updatedAt ASC")
    List<Task> findStagnantTasks(@Param("boardId") String boardId,
                                  @Param("thresholdDate") LocalDateTime thresholdDate);

    /**
     * 특정 기간 내 완료된 Task 조회 (속도 계산용)
     */
    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId " +
           "AND t.isCompleted = true " +
           "AND t.completedAt >= :startDate " +
           "AND t.completedAt <= :endDate " +
           "ORDER BY t.completedAt DESC")
    List<Task> findCompletedTasksBetween(@Param("boardId") String boardId,
                                          @Param("startDate") LocalDateTime startDate,
                                          @Param("endDate") LocalDateTime endDate);

    /**
     * 특정 Feature들에 속한 Task 조회 (마일스톤 필터링용)
     */
    @Query("SELECT t FROM Task t WHERE t.feature.id IN :featureIds ORDER BY t.position ASC")
    List<Task> findByFeatureIds(@Param("featureIds") List<String> featureIds);

    /**
     * 특정 Feature들에 속한 미완료 Task 수 조회
     */
    @Query("SELECT COUNT(t) FROM Task t WHERE t.feature.id IN :featureIds AND t.isCompleted = false")
    int countIncompleteByFeatureIds(@Param("featureIds") List<String> featureIds);

    /**
     * 특정 Feature들에 속한 완료 Task 수 조회
     */
    @Query("SELECT COUNT(t) FROM Task t WHERE t.feature.id IN :featureIds AND t.isCompleted = true")
    int countCompletedByFeatureIds(@Param("featureIds") List<String> featureIds);

    /**
     * 마감 초과된 미완료 Task 조회
     */
    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId " +
           "AND t.isCompleted = false " +
           "AND t.dueDate IS NOT NULL " +
           "AND t.dueDate < CURRENT_DATE " +
           "ORDER BY t.dueDate ASC")
    List<Task> findOverdueTasks(@Param("boardId") String boardId);

    /**
     * 여러 보드의 오늘 마감 미완료 Task 조회
     */
    @Query("SELECT t FROM Task t JOIN FETCH t.feature JOIN FETCH t.block JOIN FETCH t.board " +
           "WHERE t.board.id IN :boardIds AND t.dueDate = CURRENT_DATE AND t.isCompleted = false " +
           "ORDER BY t.board.id, t.position ASC")
    List<Task> findTodayTasksByBoardIds(@Param("boardIds") List<String> boardIds);

    /**
     * 여러 보드의 이번 주 마감 미완료 Task 조회
     */
    @Query("SELECT t FROM Task t JOIN FETCH t.feature JOIN FETCH t.block JOIN FETCH t.board " +
           "WHERE t.board.id IN :boardIds AND t.dueDate BETWEEN :start AND :end AND t.isCompleted = false " +
           "ORDER BY t.dueDate ASC, t.board.id, t.position ASC")
    List<Task> findWeekTasksByBoardIds(@Param("boardIds") List<String> boardIds,
                                       @Param("start") LocalDate start, @Param("end") LocalDate end);

    /**
     * 여러 보드의 마감 초과 미완료 Task 조회
     */
    @Query("SELECT t FROM Task t JOIN FETCH t.feature JOIN FETCH t.block JOIN FETCH t.board " +
           "WHERE t.board.id IN :boardIds AND t.dueDate < CURRENT_DATE AND t.isCompleted = false " +
           "ORDER BY t.dueDate ASC, t.board.id, t.position ASC")
    List<Task> findOverdueTasksByBoardIds(@Param("boardIds") List<String> boardIds);

    @Modifying
    @Query(value = "DELETE FROM tasks WHERE board_id = :boardId", nativeQuery = true)
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query(value = "DELETE FROM tasks WHERE feature_id = :featureId", nativeQuery = true)
    void deleteByFeatureId(@Param("featureId") String featureId);

    // ==================== Soft-delete / Trash Queries (native to bypass @SQLRestriction) ====================

    @Query(value = "SELECT * FROM tasks WHERE board_id = :boardId AND deleted_at IS NOT NULL ORDER BY deleted_at DESC", nativeQuery = true)
    List<Task> findDeletedByBoardId(@Param("boardId") String boardId);

    @Query(value = "SELECT * FROM tasks WHERE feature_id = :featureId AND deleted_at = :deletedAt", nativeQuery = true)
    List<Task> findByFeatureIdAndDeletedAt(@Param("featureId") String featureId, @Param("deletedAt") LocalDateTime deletedAt);

    @Query(value = "SELECT * FROM tasks WHERE id = :id", nativeQuery = true)
    Optional<Task> findByIdIncludingDeleted(@Param("id") String id);

    @Query(value = "SELECT * FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff", nativeQuery = true)
    List<Task> findExpiredSoftDeleted(@Param("cutoff") LocalDateTime cutoff);

    @Query(value = "SELECT id FROM tasks WHERE feature_id = :featureId AND deleted_at IS NULL", nativeQuery = true)
    List<String> findActiveIdsByFeatureId(@Param("featureId") String featureId);

    @Query(value = "SELECT id FROM tasks WHERE feature_id = :featureId", nativeQuery = true)
    List<String> findAllIdsByFeatureIdIncludingDeleted(@Param("featureId") String featureId);

    @Modifying
    @Query(value = "UPDATE tasks SET deleted_at = :deletedAt, deleted_by = :deletedBy WHERE feature_id = :featureId AND deleted_at IS NULL", nativeQuery = true)
    int softDeleteByFeatureId(@Param("featureId") String featureId,
                              @Param("deletedAt") LocalDateTime deletedAt,
                              @Param("deletedBy") String deletedBy);

    @Modifying
    @Query(value = "UPDATE tasks SET deleted_at = NULL, deleted_by = NULL WHERE feature_id = :featureId AND deleted_at = :deletedAt", nativeQuery = true)
    int restoreByFeatureIdAndDeletedAt(@Param("featureId") String featureId,
                                       @Param("deletedAt") LocalDateTime deletedAt);

    @Modifying
    @Query("UPDATE Task t SET t.createdBy = null WHERE t.createdBy.id = :userId")
    void nullifyCreatedByUserId(@Param("userId") String userId);

    @Modifying
    @Query("UPDATE Task t SET t.block = :targetBlock WHERE t.block.id = :sourceBlockId")
    int moveTasksToBlock(@Param("sourceBlockId") String sourceBlockId, @Param("targetBlock") com.kanban.domain.block.Block targetBlock);

    // ==================== Slack Integration Queries ====================

    List<Task> findTop10ByBoardIdOrderByUpdatedAtDesc(String boardId);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId AND LOWER(t.title) LIKE LOWER(CONCAT('%', :title, '%'))")
    List<Task> findByBoardIdAndTitleContainingIgnoreCase(@Param("boardId") String boardId, @Param("title") String title);

    // ==================== Organization Insights Queries ====================

    /**
     * 기간 내 조직 보드들에서 완료된 Task 수 조회
     */
    @Query("SELECT COUNT(t) FROM Task t WHERE t.board.id IN :boardIds " +
           "AND t.isCompleted = true AND t.completedAt BETWEEN :startDateTime AND :endDateTime")
    long countCompletedByBoardIdsAndDateRange(@Param("boardIds") List<String> boardIds,
                                              @Param("startDateTime") LocalDateTime startDateTime,
                                              @Param("endDateTime") LocalDateTime endDateTime);

    /**
     * 보드별 기간 내 완료된 Task 수 그룹 조회 (N+1 방지)
     */
    @Query("SELECT t.board.id, COUNT(t) FROM Task t WHERE t.board.id IN :boardIds " +
           "AND t.isCompleted = true AND t.completedAt BETWEEN :startDateTime AND :endDateTime " +
           "GROUP BY t.board.id")
    List<Object[]> countCompletedGroupByBoardAndDateRange(@Param("boardIds") List<String> boardIds,
                                                          @Param("startDateTime") LocalDateTime startDateTime,
                                                          @Param("endDateTime") LocalDateTime endDateTime);
}
