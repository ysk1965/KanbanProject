package com.kanban.domain.schedule;

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

    @Query("SELECT sb FROM ScheduleBlock sb WHERE sb.board.id = :boardId AND sb.scheduledDate = :date ORDER BY sb.assignee.id, sb.startTime")
    List<ScheduleBlock> findAllByBoardIdAndDate(@Param("boardId") String boardId, @Param("date") LocalDate date);

    void deleteByChecklistItemId(String checklistItemId);

    @Query("SELECT sb FROM ScheduleBlock sb " +
           "LEFT JOIN FETCH sb.checklistItem ci " +
           "LEFT JOIN FETCH ci.task t " +
           "LEFT JOIN FETCH t.feature " +
           "LEFT JOIN FETCH sb.meeting " +
           "JOIN FETCH sb.assignee " +
           "WHERE sb.board.id = :boardId AND sb.scheduledDate BETWEEN :startDate AND :endDate " +
           "ORDER BY sb.scheduledDate, sb.startTime")
    List<ScheduleBlock> findByBoardIdAndScheduledDateBetween(
            @Param("boardId") String boardId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    // ==================== Management Statistics Queries ====================

    /**
     * 보드의 모든 ScheduleBlock 조회 (ChecklistItem 연결된 것만)
     */
    @Query("SELECT sb FROM ScheduleBlock sb " +
           "WHERE sb.board.id = :boardId " +
           "AND sb.checklistItem IS NOT NULL " +
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

    @Modifying
    @Query("DELETE FROM ScheduleBlock sb WHERE sb.checklistItem.id IN " +
           "(SELECT ci.id FROM ChecklistItem ci WHERE ci.task.id = :taskId)")
    void deleteByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("UPDATE ScheduleBlock sb SET sb.checklistItem = null WHERE sb.checklistItem.id IN " +
           "(SELECT ci.id FROM ChecklistItem ci WHERE ci.task.id = :taskId)")
    void unlinkByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("UPDATE ScheduleBlock sb SET sb.checklistItem = null WHERE sb.checklistItem.id = :checklistItemId")
    void unlinkByChecklistItemId(@Param("checklistItemId") String checklistItemId);

    @Modifying
    @Query("DELETE FROM ScheduleBlock sb WHERE sb.checklistItem.id IN " +
           "(SELECT ci.id FROM ChecklistItem ci WHERE ci.task.feature.id = :featureId)")
    void deleteByFeatureId(@Param("featureId") String featureId);

    @Modifying
    @Query("DELETE FROM ScheduleBlock sb WHERE sb.assignee.id = :userId")
    void deleteByAssigneeId(@Param("userId") String userId);
}
