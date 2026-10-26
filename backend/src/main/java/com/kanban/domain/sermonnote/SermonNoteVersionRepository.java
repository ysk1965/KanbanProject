package com.kanban.domain.sermonnote;

import com.kanban.domain.sermonnote.dto.SermonNoteVersionDto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SermonNoteVersionRepository extends JpaRepository<SermonNoteVersion, String> {

    /** 목록 — body 를 읽지 않는다 (한 장에 최대 256KB) */
    @Query("SELECT new com.kanban.domain.sermonnote.dto.SermonNoteVersionDto$Row("
            + "v.id, v.noteId, v.reason, v.title, v.chars, v.at) "
            + "FROM SermonNoteVersion v WHERE v.userId = :userId AND v.noteId = :noteId "
            + "ORDER BY v.at DESC, v.createdAt DESC")
    List<SermonNoteVersionDto.Row> findRows(@Param("userId") String userId, @Param("noteId") String noteId);

    @Query("SELECT v.id FROM SermonNoteVersion v WHERE v.userId = :userId AND v.noteId = :noteId "
            + "ORDER BY v.at DESC, v.createdAt DESC")
    List<String> findIdsNewestFirst(@Param("userId") String userId, @Param("noteId") String noteId);

    @Modifying
    @Query("DELETE FROM SermonNoteVersion v WHERE v.id IN :ids")
    int deleteByIds(@Param("ids") List<String> ids);

    @Modifying
    @Query("DELETE FROM SermonNoteVersion v WHERE v.userId = :userId AND v.noteId = :noteId")
    int deleteByNote(@Param("userId") String userId, @Param("noteId") String noteId);
}
