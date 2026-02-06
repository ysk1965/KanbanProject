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
}
