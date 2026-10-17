package com.kanban.domain.sprint;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SprintRepository extends JpaRepository<Sprint, String> {

    List<Sprint> findByMilestoneIdOrderBySequenceNoAsc(String milestoneId);

    /**
     * 보드의 전체 스프린트 — 리포트 진행 집계용. milestone→board 경로로 조회, 최신 시퀀스 우선.
     * 마일스톤이 여럿이면 sequenceNo가 겹치므로(모두 "Sprint 1") 생성일·id로 순서를 고정한다.
     */
    @Query("SELECT s FROM Sprint s WHERE s.milestone.board.id = :boardId " +
           "ORDER BY s.sequenceNo DESC, s.createdAt DESC, s.id")
    List<Sprint> findByBoardId(@Param("boardId") String boardId);

    @Query("SELECT COALESCE(MAX(s.sequenceNo), 0) FROM Sprint s WHERE s.milestone.id = :milestoneId")
    int findMaxSequenceNo(@Param("milestoneId") String milestoneId);

    @Modifying
    @Query("DELETE FROM Sprint s WHERE s.milestone.id = :milestoneId")
    void deleteByMilestoneId(@Param("milestoneId") String milestoneId);
}
