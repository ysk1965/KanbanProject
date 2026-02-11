package com.kanban.domain.comment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface CommentReactionRepository extends JpaRepository<CommentReaction, String> {

    Optional<CommentReaction> findByCommentIdAndUserIdAndEmoji(
            @Param("commentId") String commentId,
            @Param("userId") String userId,
            @Param("emoji") String emoji);

    @Modifying
    @Query("DELETE FROM CommentReaction r WHERE r.comment.id = :commentId")
    void deleteByCommentId(@Param("commentId") String commentId);

    @Modifying
    @Query("DELETE FROM CommentReaction r WHERE r.user.id = :userId")
    void deleteByUserId(@Param("userId") String userId);

    @Modifying
    @Query("DELETE FROM CommentReaction r WHERE r.emoji = :emoji")
    void deleteByEmoji(@Param("emoji") String emoji);
}
