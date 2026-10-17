package com.kanban.domain.comment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface CommentRepository extends JpaRepository<Comment, String> {

    @Query("SELECT DISTINCT c FROM Comment c " +
           "LEFT JOIN FETCH c.author " +
           "LEFT JOIN FETCH c.attachments " +
           "LEFT JOIN FETCH c.parent p " +
           "LEFT JOIN FETCH p.author " +
           "WHERE c.task.id = :taskId " +
           "ORDER BY c.createdAt ASC")
    List<Comment> findByTaskIdWithAuthor(@Param("taskId") String taskId);

    @Query("SELECT DISTINCT c FROM Comment c " +
           "LEFT JOIN FETCH c.author " +
           "LEFT JOIN FETCH c.attachments " +
           "LEFT JOIN FETCH c.reactions r " +
           "LEFT JOIN FETCH r.user " +
           "LEFT JOIN FETCH c.parent p " +
           "LEFT JOIN FETCH p.author " +
           "WHERE c.task.id = :taskId " +
           "ORDER BY c.createdAt ASC")
    List<Comment> findByTaskIdWithAuthorAndReactions(@Param("taskId") String taskId);

    int countByTaskId(String taskId);

    // ==================== 체크리스트 항목 댓글 ====================
    //
    // 아래 벌크 UPDATE들은 clearAutomatically를 쓰지 않는다. 영속성 컨텍스트를 비우면
    // 호출한 서비스가 들고 있던 ChecklistItem이 detach되어, 그 뒤에 응답을 만들 때
    // LAZY 담당자/외주에서 터진다. comments만 건드리므로 컨텍스트가 낡을 일도 없다.

    /**
     * 태스크 안에서 체크리스트 항목별 댓글 수. 행마다 세면 N+1이 되므로 한 번의 group by로 가져온다.
     * 반환: {@code [checklistItemId, count]}
     */
    @Query("SELECT c.checklistItemId, COUNT(c) FROM Comment c " +
           "WHERE c.task.id = :taskId AND c.checklistItemId IS NOT NULL " +
           "GROUP BY c.checklistItemId")
    List<Object[]> countByChecklistItemForTask(@Param("taskId") String taskId);

    /**
     * 항목이 다른 태스크로 옮겨갈 때 그 항목의 댓글도 함께 옮긴다.
     * 안 하면 댓글이 원래 태스크에 고아로 남는다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = "UPDATE comments SET task_id = :targetTaskId WHERE checklist_item_id = :itemId", nativeQuery = true)
    int moveCommentsToTask(@Param("itemId") String itemId, @Param("targetTaskId") String targetTaskId);

    /** 항목 병합: 소스 항목들의 댓글을 대표 항목으로 넘긴다. */
    @Modifying(flushAutomatically = true)
    @Query(value = "UPDATE comments SET checklist_item_id = :targetItemId WHERE checklist_item_id IN (:sourceItemIds)", nativeQuery = true)
    int reassignCommentsToItem(@Param("sourceItemIds") List<String> sourceItemIds,
                               @Param("targetItemId") String targetItemId);

    /**
     * 항목 영구삭제: 소속만 끊고 댓글은 태스크 댓글로 남긴다. 대화 기록을 지우지 않는다.
     */
    @Modifying(flushAutomatically = true)
    @Query(value = "UPDATE comments SET checklist_item_id = NULL WHERE checklist_item_id = :itemId", nativeQuery = true)
    int detachCommentsFromItem(@Param("itemId") String itemId);

    @Modifying
    @Query("DELETE FROM Comment c WHERE c.task.id = :taskId")
    void deleteByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("DELETE FROM Comment c WHERE c.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    // native: task 경유 JPQL은 Task의 @SQLRestriction 때문에 soft-deleted 태스크의
    // 댓글을 못 지워 하드 삭제 시 FK 위반이 났다
    @Modifying
    @Query(value = "DELETE FROM comments WHERE task_id IN " +
           "(SELECT id FROM tasks WHERE feature_id = :featureId)", nativeQuery = true)
    void deleteByFeatureId(@Param("featureId") String featureId);

    @Modifying
    @Query("UPDATE Comment c SET c.author = null WHERE c.author.id = :userId")
    void nullifyAuthorByUserId(@Param("userId") String userId);

    @Query("SELECT c FROM Comment c " +
           "JOIN FETCH c.author " +
           "JOIN FETCH c.task " +
           "WHERE c.board.id = :boardId " +
           "AND c.author.id = :authorId " +
           "AND c.createdAt >= :startDate " +
           "AND c.createdAt < :endDate " +
           "ORDER BY c.createdAt ASC")
    List<Comment> findByBoardAndAuthorAndDateRange(
            @Param("boardId") String boardId,
            @Param("authorId") String authorId,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate);

    @Query("SELECT c FROM Comment c " +
           "JOIN FETCH c.author " +
           "JOIN FETCH c.task " +
           "WHERE c.board.id = :boardId " +
           "AND c.createdAt >= :startDate " +
           "AND c.createdAt < :endDate " +
           "ORDER BY c.createdAt ASC")
    List<Comment> findByBoardAndDateRange(
            @Param("boardId") String boardId,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate);

    @Query("SELECT c FROM Comment c " +
           "JOIN FETCH c.author " +
           "JOIN FETCH c.task " +
           "WHERE c.board.id = :boardId " +
           "AND c.mentions LIKE CONCAT('%', :userId, '%') " +
           "AND c.createdAt >= :startDate " +
           "AND c.createdAt < :endDate " +
           "ORDER BY c.createdAt ASC")
    List<Comment> findByBoardAndMentionedUserAndDateRange(
            @Param("boardId") String boardId,
            @Param("userId") String userId,
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate);
}
