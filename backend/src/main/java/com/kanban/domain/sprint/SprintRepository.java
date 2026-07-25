package com.kanban.domain.sprint;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SprintRepository extends JpaRepository<Sprint, String> {

    List<Sprint> findByMilestoneIdOrderBySequenceNoAsc(String milestoneId);

    /** 마일스톤의 현재 활성 스프린트(최대 1개) */
    Optional<Sprint> findFirstByMilestoneIdAndStatusOrderBySequenceNoDesc(String milestoneId, SprintStatus status);

    /** 보드의 특정 상태 스프린트 — 리포트 진행 집계용. milestone→board 경로로 조회, 최신 시퀀스 우선. */
    @Query("SELECT s FROM Sprint s WHERE s.milestone.board.id = :boardId AND s.status = :status ORDER BY s.sequenceNo DESC")
    List<Sprint> findByBoardIdAndStatus(@Param("boardId") String boardId, @Param("status") SprintStatus status);

    /** 마일스톤의 최신(최대 sequence) 스프린트 */
    Optional<Sprint> findFirstByMilestoneIdOrderBySequenceNoDesc(String milestoneId);

    @Query("SELECT COALESCE(MAX(s.sequenceNo), 0) FROM Sprint s WHERE s.milestone.id = :milestoneId")
    int findMaxSequenceNo(@Param("milestoneId") String milestoneId);

    @Modifying
    @Query("DELETE FROM Sprint s WHERE s.milestone.id = :milestoneId")
    void deleteByMilestoneId(@Param("milestoneId") String milestoneId);
}
