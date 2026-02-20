package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface NoteVersionRepository extends JpaRepository<NoteVersion, String> {

    List<NoteVersion> findAllByNoteIdOrderByVersionNumberDesc(String noteId);

    Optional<NoteVersion> findByIdAndNoteId(String id, String noteId);

    @Query("SELECT COALESCE(MAX(v.versionNumber), 0) FROM NoteVersion v WHERE v.note.id = :noteId")
    int findMaxVersionNumber(@Param("noteId") String noteId);

    void deleteAllByNoteId(String noteId);

    @Modifying
    @Query("DELETE FROM NoteVersion nv WHERE nv.note.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
