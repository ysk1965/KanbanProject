package com.kanban.domain.dailychecklist;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DailyChecklistRepository extends JpaRepository<DailyChecklist, String> {

    /**
     * 특정 보드의 특정 날짜 예외 지정(PIN + EXCLUDE) 전체 조회.
     * 파생 목록과 병합하기 위한 원본 데이터이므로 kind로 거르지 않는다.
     *
     * @see com.kanban.domain.dailychecklist.service.DailyChecklistResolver
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH t.block " +
           "LEFT JOIN FETCH t.milestone " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.board.id = :boardId AND dc.assignedDate = :assignedDate " +
           "ORDER BY dc.position ASC")
    List<DailyChecklist> findOverridesByBoardIdAndAssignedDate(
            @Param("boardId") String boardId,
            @Param("assignedDate") LocalDate assignedDate);

    /**
     * 특정 보드/체크리스트/날짜의 예외 행 조회 (PIN ↔ EXCLUDE 전환용).
     * 유니크 제약 (board_id, checklist_item_id, assigned_date) 덕분에 최대 1건이다.
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.board.id = :boardId AND dc.checklistItem.id = :checklistItemId AND dc.assignedDate = :assignedDate")
    Optional<DailyChecklist> findOverride(
            @Param("boardId") String boardId,
            @Param("checklistItemId") String checklistItemId,
            @Param("assignedDate") LocalDate assignedDate);

    /**
     * 특정 보드의 특정 날짜 데일리 체크리스트 조회 (position 순, PIN만)
     * ChecklistItem을 JOIN FETCH하여 최신 완료 상태를 가져옴
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.board.id = :boardId AND dc.assignedDate = :assignedDate " +
           "AND dc.kind = com.kanban.domain.dailychecklist.DailyChecklistKind.PIN " +
           "ORDER BY dc.position ASC")
    List<DailyChecklist> findByBoardIdAndAssignedDateOrderByPositionAsc(
            @Param("boardId") String boardId,
            @Param("assignedDate") LocalDate assignedDate);

    /**
     * 특정 보드의 특정 날짜, 특정 담당자의 데일리 체크리스트 조회 (position 순, PIN만)
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.board.id = :boardId AND dc.assignedDate = :assignedDate AND dc.assignee.id = :assigneeId " +
           "AND dc.kind = com.kanban.domain.dailychecklist.DailyChecklistKind.PIN " +
           "ORDER BY dc.position ASC")
    List<DailyChecklist> findByBoardIdAndAssignedDateAndAssigneeIdOrderByPositionAsc(
            @Param("boardId") String boardId,
            @Param("assignedDate") LocalDate assignedDate,
            @Param("assigneeId") String assigneeId);

    /**
     * 특정 보드의 특정 날짜, 특정 담당자의 데일리 체크리스트 조회 (task/feature 포함, PIN만)
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.board.id = :boardId AND dc.assignedDate = :assignedDate AND dc.assignee.id = :assigneeId " +
           "AND dc.kind = com.kanban.domain.dailychecklist.DailyChecklistKind.PIN " +
           "ORDER BY dc.position ASC")
    List<DailyChecklist> findByBoardIdAndAssignedDateAndAssigneeIdWithDetailsOrderByPositionAsc(
            @Param("boardId") String boardId,
            @Param("assignedDate") LocalDate assignedDate,
            @Param("assigneeId") String assigneeId);

    /**
     * 특정 보드, 날짜, 담당자의 최대 position 값 조회
     */
    @Query("SELECT MAX(dc.position) FROM DailyChecklist dc WHERE dc.board.id = :boardId AND dc.assignedDate = :assignedDate AND dc.assignee.id = :assigneeId " +
           "AND dc.kind = com.kanban.domain.dailychecklist.DailyChecklistKind.PIN")
    Integer findMaxPositionByBoardIdAndAssignedDateAndAssigneeId(
            @Param("boardId") String boardId,
            @Param("assignedDate") LocalDate assignedDate,
            @Param("assigneeId") String assigneeId);

    /**
     * 특정 보드의 날짜 범위, 특정 담당자의 데일리 체크리스트 조회 (task/feature 포함)
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.board.id = :boardId " +
           "AND dc.assignedDate BETWEEN :startDate AND :endDate " +
           "AND dc.assignee.id = :assigneeId " +
           "AND dc.kind = com.kanban.domain.dailychecklist.DailyChecklistKind.PIN " +
           "ORDER BY dc.assignedDate ASC, dc.position ASC")
    List<DailyChecklist> findByBoardIdAndAssignedDateBetweenAndAssigneeId(
            @Param("boardId") String boardId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("assigneeId") String assigneeId);

    /**
     * 중복 체크: 같은 보드, 같은 체크리스트, 같은 날짜에 이미 존재하는지 확인
     */
    boolean existsByBoardIdAndChecklistItemIdAndAssignedDate(
            String boardId, String checklistItemId, LocalDate assignedDate);

    /**
     * 특정 체크리스트 아이템에 연결된 모든 데일리 체크리스트 조회
     * (원본 체크리스트 삭제 시 연결 해제용)
     */
    List<DailyChecklist> findByChecklistItemId(String checklistItemId);

    /**
     * 특정 체크리스트 아이템에 연결된 데일리 체크리스트 연결 해제
     */
    @Modifying
    @Query("UPDATE DailyChecklist dc SET dc.checklistItem = null WHERE dc.checklistItem.id = :checklistItemId")
    void unlinkByChecklistItemId(@Param("checklistItemId") String checklistItemId);

    @Modifying
    @Query("DELETE FROM DailyChecklist dc WHERE dc.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM DailyChecklist dc WHERE dc.checklistItem.id IN " +
           "(SELECT ci.id FROM ChecklistItem ci WHERE ci.task.id = :taskId)")
    void deleteByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("DELETE FROM DailyChecklist dc WHERE dc.checklistItem.id IN " +
           "(SELECT ci.id FROM ChecklistItem ci WHERE ci.task.feature.id = :featureId)")
    void deleteByFeatureId(@Param("featureId") String featureId);

    @Modifying
    @Query("DELETE FROM DailyChecklist dc WHERE dc.assignee.id = :userId")
    void deleteByAssigneeId(@Param("userId") String userId);

    // ==================== Cross-Domain Integration Queries ====================

    /**
     * 특정 유저의 다중 보드 일일 체크리스트 조회 (날짜 지정)
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.assignee.id = :assigneeId AND dc.board.id IN :boardIds AND dc.assignedDate = :date " +
           "AND dc.kind = com.kanban.domain.dailychecklist.DailyChecklistKind.PIN " +
           "ORDER BY dc.board.id, dc.position ASC")
    List<DailyChecklist> findByAssigneeIdAndBoardIdInAndAssignedDate(
            @Param("assigneeId") String assigneeId,
            @Param("boardIds") List<String> boardIds,
            @Param("date") LocalDate date);
}
