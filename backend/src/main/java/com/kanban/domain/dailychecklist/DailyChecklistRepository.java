package com.kanban.domain.dailychecklist;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface DailyChecklistRepository extends JpaRepository<DailyChecklist, String> {

    /**
     * 특정 보드의 특정 날짜 데일리 체크리스트 조회 (position 순)
     * ChecklistItem을 JOIN FETCH하여 최신 완료 상태를 가져옴
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.board.id = :boardId AND dc.assignedDate = :assignedDate " +
           "ORDER BY dc.position ASC")
    List<DailyChecklist> findByBoardIdAndAssignedDateOrderByPositionAsc(
            @Param("boardId") String boardId,
            @Param("assignedDate") LocalDate assignedDate);

    /**
     * 특정 보드의 특정 날짜, 특정 담당자의 데일리 체크리스트 조회 (position 순)
     */
    @Query("SELECT dc FROM DailyChecklist dc " +
           "LEFT JOIN FETCH dc.checklistItem ci " +
           "JOIN FETCH dc.assignee " +
           "WHERE dc.board.id = :boardId AND dc.assignedDate = :assignedDate AND dc.assignee.id = :assigneeId " +
           "ORDER BY dc.position ASC")
    List<DailyChecklist> findByBoardIdAndAssignedDateAndAssigneeIdOrderByPositionAsc(
            @Param("boardId") String boardId,
            @Param("assignedDate") LocalDate assignedDate,
            @Param("assigneeId") String assigneeId);

    /**
     * 특정 보드, 날짜, 담당자의 최대 position 값 조회
     */
    @Query("SELECT MAX(dc.position) FROM DailyChecklist dc WHERE dc.board.id = :boardId AND dc.assignedDate = :assignedDate AND dc.assignee.id = :assigneeId")
    Integer findMaxPositionByBoardIdAndAssignedDateAndAssigneeId(
            @Param("boardId") String boardId,
            @Param("assignedDate") LocalDate assignedDate,
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
}
