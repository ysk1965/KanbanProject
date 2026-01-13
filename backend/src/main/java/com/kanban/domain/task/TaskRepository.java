package com.kanban.domain.task;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, String> {

    List<Task> findByBoardIdOrderByPositionAsc(String boardId);

    List<Task> findByFeatureIdOrderByPositionAsc(String featureId);

    List<Task> findByBlockIdOrderByPositionAsc(String blockId);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId AND t.isCompleted = :isCompleted ORDER BY t.position ASC")
    List<Task> findByBoardIdAndIsCompleted(@Param("boardId") String boardId, @Param("isCompleted") Boolean isCompleted);

    @Query("SELECT MAX(t.position) FROM Task t WHERE t.block.id = :blockId")
    Integer findMaxPositionByBlockId(@Param("blockId") String blockId);

    int countByFeatureId(String featureId);

    int countByFeatureIdAndIsCompletedTrue(String featureId);

    int countByBoardId(String boardId);

    int countByBoardIdAndIsCompletedTrue(String boardId);

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
}
