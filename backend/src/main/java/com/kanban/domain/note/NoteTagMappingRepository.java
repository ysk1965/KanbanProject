package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NoteTagMappingRepository extends JpaRepository<NoteTagMapping, NoteTagMapping.NoteTagMappingId> {

    @Query("SELECT m FROM NoteTagMapping m JOIN FETCH m.tag WHERE m.note.id = :noteId")
    List<NoteTagMapping> findAllByNoteIdWithTag(@Param("noteId") String noteId);

    @Query("SELECT m FROM NoteTagMapping m JOIN FETCH m.tag WHERE m.note.id IN :noteIds")
    List<NoteTagMapping> findAllByNoteIdsWithTag(@Param("noteIds") List<String> noteIds);

    void deleteAllByNoteId(String noteId);

    @Query("DELETE FROM NoteTagMapping m WHERE m.note.id = :noteId AND m.tag.id = :tagId")
    void deleteByNoteIdAndTagId(@Param("noteId") String noteId, @Param("tagId") String tagId);

    boolean existsByNoteIdAndTagId(String noteId, String tagId);

    @Modifying
    @Query("DELETE FROM NoteTagMapping m WHERE m.note.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
