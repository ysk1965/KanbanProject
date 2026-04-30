package com.kanban.domain.jobrole.repository;

import com.kanban.domain.jobrole.entity.JobRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JobRoleRepository extends JpaRepository<JobRole, String> {

    @Query("SELECT j FROM JobRole j WHERE j.board.id = :boardId " +
           "ORDER BY COALESCE(j.displayOrder, 999999) ASC, j.createdAt ASC")
    List<JobRole> findAllByBoardIdOrdered(@Param("boardId") String boardId);

    boolean existsByBoardIdAndName(String boardId, String name);

    Optional<JobRole> findByIdAndBoardId(String id, String boardId);

    @Query("SELECT bm.jobRole.id, COUNT(bm) FROM BoardMember bm " +
           "WHERE bm.board.id = :boardId AND bm.jobRole IS NOT NULL " +
           "GROUP BY bm.jobRole.id")
    List<Object[]> countMembersByJobRole(@Param("boardId") String boardId);
}
