package com.kanban.domain.milestone;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MilestoneAllocationRepository extends JpaRepository<MilestoneAllocation, String> {

    @Modifying
    @Query("DELETE FROM MilestoneAllocation ma WHERE ma.milestone.id IN (SELECT m.id FROM Milestone m WHERE m.board.id = :boardId)")
    void deleteAllByBoardId(@Param("boardId") String boardId);

    List<MilestoneAllocation> findByMilestoneId(String milestoneId);

    Optional<MilestoneAllocation> findByMilestoneIdAndMemberId(String milestoneId, String memberId);

    void deleteByMilestoneIdAndMemberId(String milestoneId, String memberId);

    @Query("SELECT ma FROM MilestoneAllocation ma " +
           "JOIN FETCH ma.member " +
           "WHERE ma.milestone.id = :milestoneId")
    List<MilestoneAllocation> findByMilestoneIdWithMember(@Param("milestoneId") String milestoneId);

    boolean existsByMilestoneIdAndMemberId(String milestoneId, String memberId);

    @Modifying
    @Query("DELETE FROM MilestoneAllocation ma WHERE ma.milestone.id = :milestoneId")
    void deleteByMilestoneId(@Param("milestoneId") String milestoneId);

    @Modifying
    @Query("DELETE FROM MilestoneAllocation ma WHERE ma.member.id = :userId")
    void deleteByMemberId(@Param("userId") String userId);
}
