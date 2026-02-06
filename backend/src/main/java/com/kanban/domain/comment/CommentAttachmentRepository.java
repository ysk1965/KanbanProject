package com.kanban.domain.comment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CommentAttachmentRepository extends JpaRepository<CommentAttachment, String> {

    List<CommentAttachment> findByCommentId(String commentId);

    void deleteByCommentId(String commentId);

    @Modifying
    @Query("DELETE FROM CommentAttachment ca WHERE ca.comment.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Query("SELECT ca FROM CommentAttachment ca WHERE ca.comment.task.id = :taskId")
    List<CommentAttachment> findByTaskId(@Param("taskId") String taskId);

    @Modifying
    @Query("DELETE FROM CommentAttachment ca WHERE ca.comment.task.id = :taskId")
    void deleteByTaskId(@Param("taskId") String taskId);

    @Query("SELECT ca FROM CommentAttachment ca WHERE ca.comment.board.id = :boardId")
    List<CommentAttachment> findByBoardId(@Param("boardId") String boardId);

    @Query("SELECT ca FROM CommentAttachment ca WHERE ca.comment.task.feature.id = :featureId")
    List<CommentAttachment> findByFeatureId(@Param("featureId") String featureId);

    @Modifying
    @Query("DELETE FROM CommentAttachment ca WHERE ca.comment.task.feature.id = :featureId")
    void deleteByFeatureId(@Param("featureId") String featureId);
}
