package com.kanban.domain.sermongroup;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SermonNoteShareRepository extends JpaRepository<SermonNoteShare, String> {

    Optional<SermonNoteShare> findBySessionIdAndUserId(String sessionId, String userId);

    List<SermonNoteShare> findBySessionIdOrderByUpdatedAtDesc(String sessionId);

    List<SermonNoteShare> findBySessionIdIn(Collection<String> sessionIds);

    @Modifying
    @Query("DELETE FROM SermonNoteShare s WHERE s.groupId = :groupId AND s.userId = :userId")
    int deleteByGroupAndUser(@Param("groupId") String groupId, @Param("userId") String userId);

    /** 노트를 지울 때 — 그 노트로 올린 내 공개 사본 (모든 모임) */
    @Modifying
    @Query("DELETE FROM SermonNoteShare s WHERE s.userId = :userId AND s.noteId = :noteId")
    int deleteByUserAndNote(@Param("userId") String userId, @Param("noteId") String noteId);
}
