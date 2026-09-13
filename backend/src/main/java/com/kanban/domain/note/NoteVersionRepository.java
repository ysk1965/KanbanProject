package com.kanban.domain.note;

import org.springframework.data.domain.Pageable;
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

    /**
     * 노트에 버전을 남긴 사용자 id 를 최근 작성 순으로 반환한다 (content 미로딩).
     * 각 row = [userId(String), latestCreatedAt(LocalDateTime)].
     */
    @Query("SELECT v.createdBy.id, MAX(v.createdAt) FROM NoteVersion v " +
           "WHERE v.note.id = :noteId GROUP BY v.createdBy.id ORDER BY MAX(v.createdAt) DESC")
    List<Object[]> findDistinctAuthorIdsByNoteIdOrderByLatest(@Param("noteId") String noteId, Pageable pageable);

    @Modifying
    @Query("DELETE FROM NoteVersion nv WHERE nv.note.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
