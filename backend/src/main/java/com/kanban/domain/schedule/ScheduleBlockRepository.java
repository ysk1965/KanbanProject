package com.kanban.domain.schedule;

import com.kanban.domain.checklist.ChecklistItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface ScheduleBlockRepository extends JpaRepository<ScheduleBlock, String> {

    @Query("SELECT sb FROM ScheduleBlock sb " +
           "LEFT JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH sb.meeting " +
           "JOIN FETCH sb.assignee " +
           "JOIN FETCH sb.board " +
           "WHERE sb.board.id = :boardId AND sb.scheduledDate = :scheduledDate AND sb.assignee.id IN :assigneeIds " +
           "ORDER BY sb.startTime ASC")
    List<ScheduleBlock> findByBoardIdAndScheduledDateAndAssigneeIdInOrderByStartTimeAsc(
            @Param("boardId") String boardId, @Param("scheduledDate") LocalDate scheduledDate, @Param("assigneeIds") List<String> assigneeIds);

    List<ScheduleBlock> findByBoardIdAndScheduledDateAndAssigneeIdOrderByStartTimeAsc(
            String boardId, LocalDate scheduledDate, String assigneeId);

    @Query("SELECT sb FROM ScheduleBlock sb " +
           "LEFT JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH sb.meeting " +
           "JOIN FETCH sb.assignee " +
           "WHERE sb.checklistItem.id = :checklistItemId")
    List<ScheduleBlock> findByChecklistItemId(@Param("checklistItemId") String checklistItemId);

    @Query("SELECT sb FROM ScheduleBlock sb " +
           "LEFT JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH sb.meeting " +
           "JOIN FETCH sb.assignee " +
           "WHERE sb.checklistItem.id IN :checklistItemIds " +
           "ORDER BY sb.checklistItem.id, sb.startTime")
    List<ScheduleBlock> findByChecklistItemIdIn(@Param("checklistItemIds") List<String> checklistItemIds);

    @Query("SELECT sb FROM ScheduleBlock sb WHERE sb.board.id = :boardId AND sb.scheduledDate = :date ORDER BY sb.assignee.id, sb.startTime")
    List<ScheduleBlock> findAllByBoardIdAndDate(@Param("boardId") String boardId, @Param("date") LocalDate date);

    void deleteByChecklistItemId(String checklistItemId);

    @Query("SELECT sb FROM ScheduleBlock sb " +
           "LEFT JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH sb.meeting " +
           "JOIN FETCH sb.assignee " +
           "JOIN FETCH sb.board " +
           "WHERE sb.board.id = :boardId AND sb.scheduledDate BETWEEN :startDate AND :endDate " +
           "ORDER BY sb.scheduledDate, sb.startTime")
    List<ScheduleBlock> findByBoardIdAndScheduledDateBetween(
            @Param("boardId") String boardId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    // ==================== Management Statistics Queries ====================

    /**
     * 보드의 모든 ScheduleBlock 조회 (ChecklistItem 연결된 것만).
     * JOIN FETCH 로 ChecklistItem 을 즉시 로딩한다 — 소프트삭제된(@SQLRestriction deleted_at IS NULL)
     * 또는 사라진 ChecklistItem 을 참조하는 블록(휴지통 태스크의 유령 링크)은 조인 단계에서 제외되어,
     * 이후 LAZY 프록시 초기화 시 EntityNotFoundException 이 나는 것을 원천 차단한다.
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "WHERE sb.board.id = :boardId " +
           "ORDER BY sb.scheduledDate")
    List<ScheduleBlock> findAllWithChecklistByBoardId(@Param("boardId") String boardId);

    /**
     * 특정 Task의 ChecklistItem에 연결된 모든 ScheduleBlock 조회
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "WHERE sb.checklistItem.task.id = :taskId " +
           "ORDER BY sb.scheduledDate")
    List<ScheduleBlock> findByTaskId(@Param("taskId") String taskId);

    /**
     * 특정 Feature의 Task들에 연결된 모든 ScheduleBlock 조회
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "WHERE sb.checklistItem.task.feature.id = :featureId " +
           "ORDER BY sb.scheduledDate")
    List<ScheduleBlock> findByFeatureId(@Param("featureId") String featureId);

    /**
     * 특정 사용자가 수행한 모든 ScheduleBlock 조회 (보드 내)
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "WHERE sb.board.id = :boardId " +
           "AND sb.assignee.id = :userId " +
           "AND sb.checklistItem IS NOT NULL " +
           "ORDER BY sb.scheduledDate")
    List<ScheduleBlock> findByBoardIdAndAssigneeId(
            @Param("boardId") String boardId,
            @Param("userId") String userId);

    /**
     * 특정 기간 내 완료된 ScheduleBlock 조회 (보드 내)
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "WHERE sb.board.id = :boardId " +
           "AND sb.checklistItem IS NOT NULL " +
           "AND sb.scheduledDate BETWEEN :startDate AND :endDate " +
           "ORDER BY sb.scheduledDate")
    List<ScheduleBlock> findCompletedBlocksBetween(
            @Param("boardId") String boardId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Modifying
    @Query("UPDATE ScheduleBlock sb SET sb.meeting = null WHERE sb.meeting.id = :meetingId")
    void unlinkByMeetingId(@Param("meetingId") String meetingId);

    @Modifying
    @Query("UPDATE ScheduleBlock sb SET sb.meeting = null WHERE sb.meeting.id IN :meetingIds")
    void unlinkByMeetingIds(@Param("meetingIds") List<String> meetingIds);

    // Meeting 관련 쿼리
    @Query("SELECT COUNT(DISTINCT sb.assignee.id) FROM ScheduleBlock sb WHERE sb.meeting.id = :meetingId")
    int countDistinctAssigneeByMeetingId(@Param("meetingId") String meetingId);

    @Query("SELECT DISTINCT sb.assignee FROM ScheduleBlock sb WHERE sb.meeting.id = :meetingId ORDER BY sb.assignee.name")
    List<com.kanban.domain.user.User> findDistinctAssigneesByMeetingId(@Param("meetingId") String meetingId);

    /**
     * 스케줄 블록이 있는 체크리스트의 Task ID 목록 (중복 제거)
     */
    @Query("SELECT DISTINCT sb.checklistItem.task.id FROM ScheduleBlock sb " +
           "WHERE sb.board.id = :boardId " +
           "AND sb.checklistItem IS NOT NULL")
    List<String> findScheduledTaskIdsByBoardId(@Param("boardId") String boardId);

    long countByBoardId(String boardId);

    @Modifying
    @Query("DELETE FROM ScheduleBlock sb WHERE sb.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    // native: JPQL 서브쿼리는 ChecklistItem/Task의 @SQLRestriction 때문에
    // soft-deleted 항목을 건너뛰어 하드 삭제 시 FK 위반이 났다 (아래 3개 동일)
    @Modifying
    @Query(value = "DELETE FROM schedule_blocks WHERE checklist_item_id IN " +
           "(SELECT id FROM checklist_items WHERE task_id = :taskId)", nativeQuery = true)
    void deleteByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query(value = "UPDATE schedule_blocks SET checklist_item_id = NULL WHERE checklist_item_id IN " +
           "(SELECT id FROM checklist_items WHERE task_id = :taskId)", nativeQuery = true)
    void unlinkByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("UPDATE ScheduleBlock sb SET sb.checklistItem = null WHERE sb.checklistItem.id = :checklistItemId")
    void unlinkByChecklistItemId(@Param("checklistItemId") String checklistItemId);

    /**
     * 체크리스트 병합: 소스 항목들에 연결된 타임블록을 대표 항목으로 재지정한다.
     */
    @Modifying
    @Query("UPDATE ScheduleBlock sb SET sb.checklistItem = :target WHERE sb.checklistItem.id IN :sourceItemIds")
    int relinkChecklistItemBlocks(@Param("target") ChecklistItem target, @Param("sourceItemIds") List<String> sourceItemIds);

    @Modifying
    @Query(value = "DELETE FROM schedule_blocks WHERE checklist_item_id IN " +
           "(SELECT ci.id FROM checklist_items ci JOIN tasks t ON t.id = ci.task_id " +
           "WHERE t.feature_id = :featureId)", nativeQuery = true)
    void deleteByFeatureId(@Param("featureId") String featureId);

    @Modifying
    @Query("DELETE FROM ScheduleBlock sb WHERE sb.assignee.id = :userId")
    void deleteByAssigneeId(@Param("userId") String userId);

    // ==================== Cross-Domain Integration Queries ====================

    /**
     * 특정 유저의 다중 보드 스케줄 블록을 날짜 범위로 조회
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "LEFT JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH sb.meeting " +
           "JOIN FETCH sb.assignee " +
           "WHERE sb.assignee.id = :assigneeId AND sb.board.id IN :boardIds " +
           "AND sb.scheduledDate BETWEEN :startDate AND :endDate " +
           "ORDER BY sb.scheduledDate, sb.startTime")
    List<ScheduleBlock> findByAssigneeIdAndBoardIdInAndScheduledDateBetween(
            @Param("assigneeId") String assigneeId,
            @Param("boardIds") List<String> boardIds,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    // ==================== Cross-Board Organization Schedule Queries ====================

    /**
     * 다중 보드 + 다중 유저 + 단일 날짜 스케줄 블록 조회 (JOIN FETCH sb.board 포함)
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "LEFT JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH sb.meeting " +
           "JOIN FETCH sb.assignee " +
           "JOIN FETCH sb.board " +
           "WHERE sb.board.id IN :boardIds AND sb.scheduledDate = :scheduledDate " +
           "AND sb.assignee.id IN :assigneeIds " +
           "ORDER BY sb.startTime ASC")
    List<ScheduleBlock> findByBoardIdInAndScheduledDateAndAssigneeIdIn(
            @Param("boardIds") List<String> boardIds,
            @Param("scheduledDate") LocalDate scheduledDate,
            @Param("assigneeIds") List<String> assigneeIds);

    /**
     * 다중 보드 + 다중 유저 + 날짜 범위 스케줄 블록 조회 (주간 뷰용, JOIN FETCH sb.board 포함)
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "LEFT JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH sb.meeting " +
           "JOIN FETCH sb.assignee " +
           "JOIN FETCH sb.board " +
           "WHERE sb.board.id IN :boardIds AND sb.scheduledDate BETWEEN :startDate AND :endDate " +
           "AND sb.assignee.id IN :assigneeIds " +
           "ORDER BY sb.scheduledDate, sb.startTime ASC")
    List<ScheduleBlock> findByBoardIdInAndScheduledDateBetweenAndAssigneeIdIn(
            @Param("boardIds") List<String> boardIds,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("assigneeIds") List<String> assigneeIds);

    // ==================== Organization Insights Queries ====================

    /**
     * 조직 내 보드들의 기간별 총 소요 시간(분) 합산
     */
    @Query("SELECT COALESCE(SUM(HOUR(sb.endTime) * 60 + MINUTE(sb.endTime) - HOUR(sb.startTime) * 60 - MINUTE(sb.startTime)), 0) " +
           "FROM ScheduleBlock sb WHERE sb.board.id IN :boardIds AND sb.scheduledDate BETWEEN :startDate AND :endDate")
    long sumMinutesByBoardIdsAndDateRange(@Param("boardIds") List<String> boardIds,
                                          @Param("startDate") LocalDate startDate,
                                          @Param("endDate") LocalDate endDate);

    /**
     * 사용자 및 보드별 소요 시간(분) 그룹 집계
     */
    @Query("SELECT sb.assignee.id, sb.board.id, " +
           "COALESCE(SUM(HOUR(sb.endTime) * 60 + MINUTE(sb.endTime) - HOUR(sb.startTime) * 60 - MINUTE(sb.startTime)), 0) " +
           "FROM ScheduleBlock sb WHERE sb.board.id IN :boardIds AND sb.scheduledDate BETWEEN :startDate AND :endDate " +
           "GROUP BY sb.assignee.id, sb.board.id")
    List<Object[]> sumMinutesGroupByUserAndBoard(@Param("boardIds") List<String> boardIds,
                                                  @Param("startDate") LocalDate startDate,
                                                  @Param("endDate") LocalDate endDate);

    /**
     * 보드 및 날짜별 소요 시간(분) 그룹 집계 (서비스 레이어에서 주별 집계 처리)
     */
    @Query("SELECT sb.board.id, sb.scheduledDate, " +
           "COALESCE(SUM(HOUR(sb.endTime) * 60 + MINUTE(sb.endTime) - HOUR(sb.startTime) * 60 - MINUTE(sb.startTime)), 0) " +
           "FROM ScheduleBlock sb WHERE sb.board.id IN :boardIds AND sb.scheduledDate BETWEEN :startDate AND :endDate " +
           "GROUP BY sb.board.id, sb.scheduledDate " +
           "ORDER BY sb.scheduledDate")
    List<Object[]> sumMinutesGroupByBoardAndDate(@Param("boardIds") List<String> boardIds,
                                                  @Param("startDate") LocalDate startDate,
                                                  @Param("endDate") LocalDate endDate);

    /**
     * 보드별 총 소요 시간(분) 그룹 집계 (조직 보드 카드용)
     */
    @Query("SELECT sb.board.id, " +
           "COALESCE(SUM(HOUR(sb.endTime) * 60 + MINUTE(sb.endTime) - HOUR(sb.startTime) * 60 - MINUTE(sb.startTime)), 0) " +
           "FROM ScheduleBlock sb WHERE sb.board.id IN :boardIds " +
           "GROUP BY sb.board.id")
    List<Object[]> sumMinutesGroupByBoard(@Param("boardIds") List<String> boardIds);

    /**
     * 특정 사용자의 날짜별 소요 시간(분) 그룹 집계 (서비스 레이어에서 주별 집계 처리)
     */
    @Query("SELECT sb.assignee.id, sb.scheduledDate, " +
           "COALESCE(SUM(HOUR(sb.endTime) * 60 + MINUTE(sb.endTime) - HOUR(sb.startTime) * 60 - MINUTE(sb.startTime)), 0) " +
           "FROM ScheduleBlock sb WHERE sb.board.id IN :boardIds AND sb.assignee.id = :userId " +
           "AND sb.scheduledDate BETWEEN :startDate AND :endDate " +
           "GROUP BY sb.assignee.id, sb.scheduledDate " +
           "ORDER BY sb.scheduledDate")
    List<Object[]> sumMinutesGroupByUserAndDate(@Param("boardIds") List<String> boardIds,
                                                 @Param("userId") String userId,
                                                 @Param("startDate") LocalDate startDate,
                                                 @Param("endDate") LocalDate endDate);
}
