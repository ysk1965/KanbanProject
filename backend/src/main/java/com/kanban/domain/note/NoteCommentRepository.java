package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NoteCommentRepository extends JpaRepository<NoteComment, String> {

    @Query("SELECT DISTINCT c FROM NoteComment c " +
           "LEFT JOIN FETCH c.author " +
           "LEFT JOIN FETCH c.resolvedBy " +
           "LEFT JOIN FETCH c.reactions r " +
           "LEFT JOIN FETCH r.user " +
           "WHERE c.note.id = :noteId " +
           "ORDER BY c.createdAt ASC")
    List<NoteComment> findByNoteIdWithDetails(@Param("noteId") String noteId);

    @Query("SELECT COUNT(c) FROM NoteComment c WHERE c.note.id = :noteId AND c.parent IS NULL")
    int countThreadsByNoteId(@Param("noteId") String noteId);

    @Modifying
    @Query("DELETE FROM NoteComment c WHERE c.note.id = :noteId")
    void deleteByNoteId(@Param("noteId") String noteId);

    @Modifying
    @Query("DELETE FROM NoteComment c WHERE c.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("UPDATE NoteComment c SET c.author = null WHERE c.author.id = :userId")
    void nullifyAuthorByUserId(@Param("userId") String userId);
}
