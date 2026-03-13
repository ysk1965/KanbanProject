package com.kanban.domain.activity;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, String> {

    Page<ActivityLog> findByBoardIdOrderByCreatedAtDesc(String boardId, Pageable pageable);

    @Query("SELECT a FROM ActivityLog a WHERE a.board.id = :boardId AND a.createdAt < :cursor ORDER BY a.createdAt DESC")
    List<ActivityLog> findByBoardIdWithCursor(@Param("boardId") String boardId, @Param("cursor") LocalDateTime cursor, Pageable pageable);

    @Query("SELECT a FROM ActivityLog a WHERE a.board.id = :boardId AND a.targetType = :targetType AND a.targetId = :targetId ORDER BY a.createdAt DESC")
    List<ActivityLog> findByTarget(@Param("boardId") String boardId, @Param("targetType") TargetType targetType, @Param("targetId") String targetId);

    @Modifying
    @Query("DELETE FROM ActivityLog a WHERE a.createdAt < :cutoff")
    int deleteByCreatedAtBefore(@Param("cutoff") LocalDateTime cutoff);

    @Modifying
    @Query("DELETE FROM ActivityLog a WHERE a.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM ActivityLog a WHERE a.user.id = :userId")
    void deleteByUserId(@Param("userId") String userId);

    // ==================== Churn Analysis Queries ====================

    // 주간 활동량 트렌드 (PostgreSQL 전용)
    @Query(value = "SELECT CAST(DATE_TRUNC('week', created_at) AS DATE) as week, " +
            "COUNT(*) as total_actions, COUNT(DISTINCT user_id) as active_users " +
            "FROM activity_log WHERE created_at >= :startDate " +
            "GROUP BY DATE_TRUNC('week', created_at) ORDER BY week",
            nativeQuery = true)
    List<Object[]> getWeeklyActivityTrend(@Param("startDate") LocalDateTime startDate);

    // 액션별 사용 통계
    @Query(value = "SELECT action, COUNT(*) as cnt, COUNT(DISTINCT user_id) as unique_users " +
            "FROM activity_log WHERE created_at >= :startDate " +
            "GROUP BY action ORDER BY cnt DESC",
            nativeQuery = true)
    List<Object[]> getFeatureUsageStats(@Param("startDate") LocalDateTime startDate);

    // 특정 보드들의 액션 분포 (Trial 이탈 분석용)
    @Query("SELECT a.action, COUNT(DISTINCT a.board.id) FROM ActivityLog a " +
           "WHERE a.board.id IN :boardIds GROUP BY a.action ORDER BY COUNT(DISTINCT a.board.id) DESC")
    List<Object[]> countActionsByBoards(@Param("boardIds") List<String> boardIds);

    // 유저별 마지막 액션 조회 (배치)
    @Query("SELECT a FROM ActivityLog a WHERE a.user.id IN :userIds AND a.createdAt = " +
           "(SELECT MAX(a2.createdAt) FROM ActivityLog a2 WHERE a2.user.id = a.user.id)")
    List<ActivityLog> findLastActionByUserIds(@Param("userIds") List<String> userIds);

    // ==================== Organization Insights Queries ====================

    /**
     * 특정 사용자의 조직 내 보드들에서 기간별 활동 수 조회
     */
    @Query("SELECT COUNT(a) FROM ActivityLog a WHERE a.user.id = :userId AND a.board.id IN :boardIds " +
           "AND a.createdAt BETWEEN :startDateTime AND :endDateTime")
    long countByUserAndBoardIdsAndDateRange(@Param("userId") String userId,
                                            @Param("boardIds") List<String> boardIds,
                                            @Param("startDateTime") LocalDateTime startDateTime,
                                            @Param("endDateTime") LocalDateTime endDateTime);

    /**
     * 기간 내 조직 보드들의 활성 사용자 수 (중복 제거)
     */
    @Query("SELECT COUNT(DISTINCT a.user.id) FROM ActivityLog a WHERE a.board.id IN :boardIds " +
           "AND a.createdAt BETWEEN :startDateTime AND :endDateTime")
    long countDistinctUsersByBoardIdsAndDateRange(@Param("boardIds") List<String> boardIds,
                                                  @Param("startDateTime") LocalDateTime startDateTime,
                                                  @Param("endDateTime") LocalDateTime endDateTime);

    /**
     * 기간 내 활동이 있는 조직 보드 수 (중복 제거)
     */
    @Query("SELECT COUNT(DISTINCT a.board.id) FROM ActivityLog a WHERE a.board.id IN :boardIds " +
           "AND a.createdAt BETWEEN :startDateTime AND :endDateTime")
    long countDistinctBoardsByBoardIdsAndDateRange(@Param("boardIds") List<String> boardIds,
                                                   @Param("startDateTime") LocalDateTime startDateTime,
                                                   @Param("endDateTime") LocalDateTime endDateTime);
}
