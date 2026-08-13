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

    /** 사람이 읽는 키로 태스크 조회 (링크 해석용, 활성 태스크만 — @SQLRestriction) */
    Optional<Task> findByTaskKey(String taskKey);

    /** 백필용: 생성 순서대로 태스크 조회 (오래된 것이 1번) */
    List<Task> findByBoardIdOrderByCreatedAtAsc(String boardId);

    List<Task> findByFeatureIdOrderByPositionAsc(String featureId);

    List<Task> findByBlockIdOrderByPositionAsc(String blockId);

    // ==================== Fetch Join Queries (N+1 방지) ====================

    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "JOIN FETCH t.block " +
           "JOIN FETCH t.board " +
           "LEFT JOIN FETCH t.createdBy " +
           "LEFT JOIN FETCH t.milestone " +
           "WHERE t.board.id = :boardId ORDER BY t.position ASC")
    List<Task> findByBoardIdWithFetch(@Param("boardId") String boardId);

    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "JOIN FETCH t.block " +
           "JOIN FETCH t.board " +
           "LEFT JOIN FETCH t.createdBy " +
           "LEFT JOIN FETCH t.milestone " +
           "WHERE t.block.id = :blockId ORDER BY t.position ASC")
    List<Task> findByBlockIdWithFetch(@Param("blockId") String blockId);

    /** JIRA 뷰(보드 스코프) — 여러 Task를 block/feature와 함께 조회(N+1 방지). */
    @Query("SELECT t FROM Task t " +
           "LEFT JOIN FETCH t.block " +
           "LEFT JOIN FETCH t.feature " +
           "WHERE t.id IN :ids")
    List<Task> findByIdInWithBlockAndFeature(@Param("ids") List<String> ids);

    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "JOIN FETCH t.block " +
           "JOIN FETCH t.board " +
           "LEFT JOIN FETCH t.createdBy " +
           "LEFT JOIN FETCH t.milestone " +
           "WHERE t.feature.id = :featureId ORDER BY t.position ASC")
    List<Task> findByFeatureIdWithFetch(@Param("featureId") String featureId);

    // ==================== Sprint Queries (멤버십은 태스크 단위) ====================

    /** 스프린트에 담긴 태스크 (프레임 컬럼용) — feature/sprintColumn fetch */
    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "LEFT JOIN FETCH t.block " +
           "LEFT JOIN FETCH t.sprintColumn sc " +
           "WHERE t.sprint.id = :sprintId " +
           "ORDER BY sc.position, t.featurePosition, t.position")
    List<Task> findBySprintId(@Param("sprintId") String sprintId);

    /**
     * 마일스톤 백로그 + 지난 스프린트 완료분.
     *  · sprint IS NULL       = 아직 어떤 스프린트에도 안 담긴 태스크(담기 후보)
     *  · sprint = ARCHIVED    = 마감된 스프린트에서 끝나 동결된 태스크(읽기 전용 이력)
     * 미완인 채 스프린트가 끝난 태스크는 종료 시 자동 이월되므로 ARCHIVED 소속 = 완료분이다.
     * 활성 스프린트 보드(컬럼·게이지)는 findBySprintId가 따로 맡는다 — 여기 포함되지 않는다.
     */
    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "LEFT JOIN FETCH t.block " +
           "LEFT JOIN FETCH t.sprint s " +
           "WHERE t.milestone.id = :milestoneId " +
           "AND (t.sprint IS NULL OR s.status = com.kanban.domain.sprint.SprintStatus.ARCHIVED) " +
           "ORDER BY t.featurePosition, t.position")
    List<Task> findSprintBacklogByMilestoneId(@Param("milestoneId") String milestoneId);

    /** 마일스톤 관리 콘솔 / 좌측 트리: 마일스톤 내 전체 태스크 (스프린트 담김 무관) */
    @Query("SELECT t FROM Task t " +
           "JOIN FETCH t.feature " +
           "LEFT JOIN FETCH t.block " +
           "LEFT JOIN FETCH t.sprintColumn " +
           "WHERE t.milestone.id = :milestoneId " +
           "ORDER BY t.featurePosition, t.position")
    List<Task> findAllByMilestoneIdWithSprint(@Param("milestoneId") String milestoneId);

    /** 스코프 게이지 분모: 스프린트에 담긴 전체 태스크 수 */
    @Query("SELECT COUNT(t) FROM Task t WHERE t.sprint.id = :sprintId")
    int countBySprintId(@Param("sprintId") String sprintId);

    /** 스코프 게이지 분자: 스프린트 내 특정 컬럼 종류(END=Done)의 태스크 수 */
    @Query("SELECT COUNT(t) FROM Task t WHERE t.sprint.id = :sprintId AND t.sprintColumn.kind = :kind")
    int countBySprintIdAndColumnKind(@Param("sprintId") String sprintId,
                                     @Param("kind") com.kanban.domain.sprint.SprintColumnKind kind);

    /**
     * 스프린트 종료 이월 대상: 아직 END(Done) 컬럼에 도달하지 않은 태스크.
     * 컬럼이 비어 있는(유실된) 태스크도 이월 대상이므로 LEFT JOIN으로 명시한다 —
     * t.sprintColumn.kind 형태로 쓰면 암묵 INNER JOIN이 되어 컬럼 없는 태스크가 통째로 빠진다.
     */
    @Query("SELECT t FROM Task t LEFT JOIN t.sprintColumn sc " +
           "WHERE t.sprint.id = :sprintId AND (sc IS NULL OR sc.kind <> :endKind)")
    List<Task> findNotDoneBySprintId(@Param("sprintId") String sprintId,
                                     @Param("endKind") com.kanban.domain.sprint.SprintColumnKind endKind);

    /** 스프린트 모드 off 병합용: 마일스톤 내 담긴 태스크 전체 */
    @Query("SELECT t FROM Task t WHERE t.sprint.milestone.id = :milestoneId AND t.sprint IS NOT NULL")
    List<Task> findInSprintByMilestoneId(@Param("milestoneId") String milestoneId);

    /**
     * 레벨 1 자동 담기용: 마일스톤에 속하면서 아직 어느 스프린트에도 안 담긴 태스크.
     * 레벨 1에는 "담기"라는 개념이 없어 백로그가 화면에 없으므로, 여기 남은 태스크는
     * 사용자 눈에 보이지 않게 된다 — 그래서 보드를 열 때 활성 스프린트로 끌어올린다.
     */
    @Query("SELECT t FROM Task t WHERE t.milestone.id = :milestoneId AND t.sprint IS NULL")
    List<Task> findBacklogByMilestoneId(@Param("milestoneId") String milestoneId);

    /** 특정 컬럼에 담긴 태스크 (컬럼 삭제 시 재배치용) */
    @Query("SELECT t FROM Task t WHERE t.sprintColumn.id = :columnId")
    List<Task> findBySprintColumnId(@Param("columnId") String columnId);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId AND t.isCompleted = :isCompleted ORDER BY t.position ASC")
    List<Task> findByBoardIdAndIsCompleted(@Param("boardId") String boardId, @Param("isCompleted") Boolean isCompleted);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId AND t.dueDate = :date AND t.isCompleted = false ORDER BY t.position ASC")
    List<Task> findByBoardIdAndDueDateAndNotCompleted(@Param("boardId") String boardId, @Param("date") LocalDate date);

    @Query("SELECT MAX(t.position) FROM Task t WHERE t.block.id = :blockId")
    Integer findMaxPositionByBlockId(@Param("blockId") String blockId);

    @Query("SELECT MAX(t.featurePosition) FROM Task t WHERE t.feature.id = :featureId")
    Integer findMaxFeaturePositionByFeatureId(@Param("featureId") String featureId);

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
     * 보드의 (마일스톤, 피처)별 태스크 수 집계 — 마일스톤 진행률 + 마일스톤-스코프 피처 카운트용.
     * 반환: [milestoneId, featureId, totalCount(Long), completedCount(Long)]
     */
    @Query("SELECT t.milestone.id, t.feature.id, COUNT(t), " +
           "SUM(CASE WHEN t.isCompleted = true THEN 1L ELSE 0L END) " +
           "FROM Task t WHERE t.board.id = :boardId AND t.milestone.id IS NOT NULL " +
           "GROUP BY t.milestone.id, t.feature.id")
    List<Object[]> countByMilestoneAndFeature(@Param("boardId") String boardId);

    /** 마일스톤 삭제 시 해당 마일스톤 태스크의 배정 해제 */
    @Modifying
    @Query("UPDATE Task t SET t.milestone = null WHERE t.milestone.id = :milestoneId")
    int clearMilestoneByMilestoneId(@Param("milestoneId") String milestoneId);

    /** 피처-마일스톤 링크 제거 시 재배정용 — 특정 피처의 특정 마일스톤 태스크 조회 */
    List<Task> findByFeatureIdAndMilestoneId(String featureId, String milestoneId);

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
