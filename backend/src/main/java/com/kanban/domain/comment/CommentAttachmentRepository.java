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

    // native: task 경유 JPQL은 Task의 @SQLRestriction 때문에 soft-deleted 태스크의
    // 첨부를 놓쳐 하드 삭제 시 S3 고아 파일 + FK 위반이 났다
    @Query(value = "SELECT ca.* FROM comment_attachments ca " +
           "JOIN comments c ON c.id = ca.comment_id " +
           "JOIN tasks t ON t.id = c.task_id " +
           "WHERE t.feature_id = :featureId", nativeQuery = true)
    List<CommentAttachment> findByFeatureId(@Param("featureId") String featureId);

    @Modifying
    @Query(value = "DELETE FROM comment_attachments WHERE comment_id IN " +
           "(SELECT c.id FROM comments c JOIN tasks t ON t.id = c.task_id " +
           "WHERE t.feature_id = :featureId)", nativeQuery = true)
    void deleteByFeatureId(@Param("featureId") String featureId);
}
