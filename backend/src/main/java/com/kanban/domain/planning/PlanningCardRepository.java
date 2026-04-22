package com.kanban.domain.planning;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface PlanningCardRepository extends JpaRepository<PlanningCard, String> {

    /**
     * 보드의 모든 플래닝 카드를 position 오름차순으로 조회한다.
     * 풀 카드와 셀 배치 카드 모두 포함.
     */
    List<PlanningCard> findByBoardIdOrderByPositionAsc(String boardId);

    /**
     * 특정 (담당자 × 주차) 셀의 카드를 position 오름차순으로 조회한다.
     */
    List<PlanningCard> findByBoardIdAndWeekStartDateAndAssigneeIdOrderByPositionAsc(
            String boardId, LocalDate weekStartDate, String assigneeId);

    /**
     * 보드의 모든 카드를 assignee fetch join으로 조회한다 — N+1 방지.
     * primaryMilestone, createdBy는 별도 쿼리로 lazy 로딩.
     */
    @Query("SELECT pc FROM PlanningCard pc " +
           "LEFT JOIN FETCH pc.assignee " +
           "WHERE pc.board.id = :boardId")
    List<PlanningCard> findByBoardIdWithAssignee(@Param("boardId") String boardId);

    /**
     * 특정 마일스톤에 속한 카드 목록을 조회한다.
     * MilestoneService의 update/delete 훅에서 PlanningCardRecomputeService가 사용.
     */
    List<PlanningCard> findByPrimaryMilestoneId(String milestoneId);

    /**
     * 보드의 플래닝 카드 총 개수를 반환한다.
     */
    long countByBoardId(String boardId);

    /**
     * 보드 삭제 시 사용자 참조를 null로 처리 (assignee).
     */
    @Modifying
    @Query("UPDATE PlanningCard pc SET pc.assignee = null WHERE pc.assignee.id = :userId")
    void nullifyAssigneeByUserId(@Param("userId") String userId);

    /**
     * 보드 삭제 시 사용자 참조를 null로 처리 (createdBy).
     */
    @Modifying
    @Query("UPDATE PlanningCard pc SET pc.createdBy = null WHERE pc.createdBy.id = :userId")
    void nullifyCreatedByUserId(@Param("userId") String userId);

    /**
     * 마일스톤 삭제/변경 시 primary_milestone_id를 null로 재설정.
     * DB FK ON DELETE SET NULL 과 중복이지만 명시적 재계산용.
     */
    @Modifying
    @Query("UPDATE PlanningCard pc SET pc.primaryMilestone = null WHERE pc.primaryMilestone.id = :milestoneId")
    void nullifyPrimaryMilestoneById(@Param("milestoneId") String milestoneId);
}
