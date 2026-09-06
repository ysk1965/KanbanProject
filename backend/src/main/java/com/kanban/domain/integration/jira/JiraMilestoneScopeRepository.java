package com.kanban.domain.integration.jira;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JiraMilestoneScopeRepository extends JpaRepository<JiraMilestoneScope, String> {

    @Query("SELECT s FROM JiraMilestoneScope s WHERE s.milestone.id = :milestoneId")
    Optional<JiraMilestoneScope> findByMilestoneId(@Param("milestoneId") String milestoneId);

    @Query("SELECT s FROM JiraMilestoneScope s WHERE s.milestone.id = :milestoneId AND s.active = true")
    Optional<JiraMilestoneScope> findActiveByMilestoneId(@Param("milestoneId") String milestoneId);

    @Query("SELECT s FROM JiraMilestoneScope s WHERE s.board.id = :boardId ORDER BY s.createdAt")
    List<JiraMilestoneScope> findByBoardId(@Param("boardId") String boardId);

    @Query("SELECT s FROM JiraMilestoneScope s WHERE s.board.id = :boardId AND s.active = true ORDER BY s.createdAt")
    List<JiraMilestoneScope> findActiveByBoardId(@Param("boardId") String boardId);
}
