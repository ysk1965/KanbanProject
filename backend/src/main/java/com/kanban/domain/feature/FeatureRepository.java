package com.kanban.domain.feature;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FeatureRepository extends JpaRepository<Feature, String> {

    List<Feature> findByBoardIdOrderByPositionAsc(String boardId);

    // Fetch Join으로 N+1 방지
    @Query("SELECT f FROM Feature f " +
           "JOIN FETCH f.board " +
           "LEFT JOIN FETCH f.assignee " +
           "LEFT JOIN FETCH f.createdBy " +
           "WHERE f.board.id = :boardId ORDER BY f.position ASC")
    List<Feature> findByBoardIdWithFetch(@Param("boardId") String boardId);

    @Query("SELECT f FROM Feature f WHERE f.board.id = :boardId AND f.assignee.id = :assigneeId ORDER BY f.position ASC")
    List<Feature> findByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    @Query("SELECT f FROM Feature f WHERE f.board.id = :boardId AND f.status = :status ORDER BY f.position ASC")
    List<Feature> findByBoardIdAndStatus(@Param("boardId") String boardId, @Param("status") FeatureStatus status);

    @Query("SELECT MAX(f.position) FROM Feature f WHERE f.board.id = :boardId")
    Integer findMaxPositionByBoardId(@Param("boardId") String boardId);

    int countByBoardId(String boardId);

    @Modifying
    @Query(value = "DELETE FROM features WHERE board_id = :boardId", nativeQuery = true)
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("UPDATE Feature f SET f.assignee = null WHERE f.assignee.id = :userId")
    void nullifyAssigneeByUserId(@Param("userId") String userId);

    @Modifying
    @Query("UPDATE Feature f SET f.createdBy = null WHERE f.createdBy.id = :userId")
    void nullifyCreatedByUserId(@Param("userId") String userId);

    // ==================== Soft-delete / Trash Queries (native to bypass @SQLRestriction) ====================

    @Query(value = "SELECT * FROM features WHERE board_id = :boardId AND deleted_at IS NOT NULL ORDER BY deleted_at DESC", nativeQuery = true)
    List<Feature> findDeletedByBoardId(@Param("boardId") String boardId);

    @Query(value = "SELECT * FROM features WHERE id = :id", nativeQuery = true)
    Optional<Feature> findByIdIncludingDeleted(@Param("id") String id);

    @Query(value = "SELECT * FROM features WHERE deleted_at IS NOT NULL AND deleted_at < :cutoff", nativeQuery = true)
    List<Feature> findExpiredSoftDeleted(@Param("cutoff") LocalDateTime cutoff);

    // ==================== Organization Insights Queries ====================

    /**
     * 특정 보드의 Feature 평균 진행률 조회 (totalTasks 기반)
     */
    @Query("SELECT COALESCE(AVG(CASE WHEN f.totalTasks > 0 THEN (f.completedTasks * 100.0 / f.totalTasks) ELSE 0 END), 0) " +
           "FROM Feature f WHERE f.board.id = :boardId")
    double findAvgProgressByBoardId(@Param("boardId") String boardId);

    /**
     * 여러 보드의 Feature 평균 진행률 그룹 조회 (N+1 방지)
     */
    @Query("SELECT f.board.id, COALESCE(AVG(CASE WHEN f.totalTasks > 0 THEN (f.completedTasks * 100.0 / f.totalTasks) ELSE 0 END), 0) " +
           "FROM Feature f WHERE f.board.id IN :boardIds GROUP BY f.board.id")
    List<Object[]> findAvgProgressByBoardIds(@Param("boardIds") List<String> boardIds);
}
