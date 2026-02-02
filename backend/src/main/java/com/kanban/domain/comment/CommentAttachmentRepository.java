package com.kanban.domain.comment;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CommentAttachmentRepository extends JpaRepository<CommentAttachment, String> {

    List<CommentAttachment> findByCommentId(String commentId);

    void deleteByCommentId(String commentId);
}
