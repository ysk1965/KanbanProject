package com.kanban.domain.feature;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FeatureRepository extends JpaRepository<Feature, String> {

    List<Feature> findByBoardIdOrderByPositionAsc(String boardId);

    @Query("SELECT f FROM Feature f WHERE f.board.id = :boardId AND f.assignee.id = :assigneeId ORDER BY f.position ASC")
    List<Feature> findByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    @Query("SELECT f FROM Feature f WHERE f.board.id = :boardId AND f.status = :status ORDER BY f.position ASC")
    List<Feature> findByBoardIdAndStatus(@Param("boardId") String boardId, @Param("status") FeatureStatus status);

    @Query("SELECT MAX(f.position) FROM Feature f WHERE f.board.id = :boardId")
    Integer findMaxPositionByBoardId(@Param("boardId") String boardId);

    int countByBoardId(String boardId);
}
