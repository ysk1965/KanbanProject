package com.kanban.domain.note;

import com.kanban.domain.user.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface NoteCommentReactionRepository extends JpaRepository<NoteCommentReaction, String> {

    Optional<NoteCommentReaction> findByNoteCommentAndUserAndEmoji(
            NoteComment noteComment, User user, String emoji);

    List<NoteCommentReaction> findByNoteCommentIn(List<NoteComment> noteComments);

    @Modifying
    @Query("DELETE FROM NoteCommentReaction r WHERE r.noteComment.id = :commentId")
    void deleteByNoteCommentId(@Param("commentId") String commentId);

    @Modifying
    @Query("DELETE FROM NoteCommentReaction r WHERE r.user.id = :userId")
    void deleteByUserId(@Param("userId") String userId);

    @Modifying
    @Query("DELETE FROM NoteCommentReaction r WHERE r.noteComment.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
