package com.kanban.domain.comment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface CommentRepository extends JpaRepository<Comment, String> {

    @Query("SELECT DISTINCT c FROM Comment c " +
           "JOIN FETCH c.author " +
           "LEFT JOIN FETCH c.attachments " +
           "WHERE c.task.id = :taskId " +
           "ORDER BY c.createdAt ASC")
    List<Comment> findByTaskIdWithAuthor(@Param("taskId") String taskId);

    int countByTaskId(String taskId);

    @Modifying
    @Query("DELETE FROM Comment c WHERE c.task.id = :taskId")
    void deleteByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("DELETE FROM Comment c WHERE c.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM Comment c WHERE c.task.feature.id = :featureId")
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
}
