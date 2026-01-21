package com.kanban.domain.milestone;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MilestoneRepository extends JpaRepository<Milestone, String> {

    List<Milestone> findByBoardIdOrderByStartDateAsc(String boardId);

    int countByBoardId(String boardId);

    @Query("SELECT DISTINCT m FROM Milestone m " +
           "LEFT JOIN FETCH m.board " +
           "LEFT JOIN FETCH m.createdBy " +
           "WHERE m.board.id = :boardId " +
           "ORDER BY m.startDate ASC")
    List<Milestone> findByBoardIdWithDetailsOrderByStartDateAsc(@Param("boardId") String boardId);

    @Query("SELECT m FROM Milestone m " +
           "LEFT JOIN FETCH m.board " +
           "LEFT JOIN FETCH m.createdBy " +
           "WHERE m.id = :milestoneId")
    Optional<Milestone> findByIdWithDetails(@Param("milestoneId") String milestoneId);
}
