package com.kanban.domain.feature;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

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
    @Query("DELETE FROM Feature f WHERE f.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("UPDATE Feature f SET f.assignee = null WHERE f.assignee.id = :userId")
    void nullifyAssigneeByUserId(@Param("userId") String userId);

    @Modifying
    @Query("UPDATE Feature f SET f.createdBy = null WHERE f.createdBy.id = :userId")
    void nullifyCreatedByUserId(@Param("userId") String userId);
}
