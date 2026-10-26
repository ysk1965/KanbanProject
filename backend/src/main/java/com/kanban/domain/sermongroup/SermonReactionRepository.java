package com.kanban.domain.sermongroup;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SermonReactionRepository extends JpaRepository<SermonReaction, String> {

    List<SermonReaction> findByShareIdIn(Collection<String> shareIds);

    Optional<SermonReaction> findByShareIdAndItemKeyAndUserIdAndKind(
            String shareId, String itemKey, String userId, String kind);

    long countByShareIdAndItemKeyAndKind(String shareId, String itemKey, String kind);

    /** 토글 끄기 — 이미 지워졌으면 0 (겹친 요청에서 예외 없이 끝난다) */
    @Modifying
    @Query("DELETE FROM SermonReaction r WHERE r.shareId = :shareId AND r.itemKey = :itemKey "
            + "AND r.userId = :userId AND r.kind = :kind")
    int deleteMine(
            @Param("shareId") String shareId,
            @Param("itemKey") String itemKey,
            @Param("userId") String userId,
            @Param("kind") String kind);

    @Modifying
    @Query("DELETE FROM SermonReaction r WHERE r.shareId = :shareId")
    int deleteByShare(@Param("shareId") String shareId);

    /** 이 모임에서 그 사람의 공개 사본에 달린 반응 */
    @Modifying
    @Query("DELETE FROM SermonReaction r WHERE r.shareId IN "
            + "(SELECT s.id FROM SermonNoteShare s WHERE s.groupId = :groupId AND s.userId = :userId)")
    int deleteOnSharesOf(@Param("groupId") String groupId, @Param("userId") String userId);

    /** 노트를 지울 때 — 그 노트로 올린 내 공개 사본에 달린 반응 */
    @Modifying
    @Query("DELETE FROM SermonReaction r WHERE r.shareId IN "
            + "(SELECT s.id FROM SermonNoteShare s WHERE s.userId = :userId AND s.noteId = :noteId)")
    int deleteOnSharesOfNote(@Param("userId") String userId, @Param("noteId") String noteId);

    /** 이 모임에서 그 사람이 남긴 반응 */
    @Modifying
    @Query("DELETE FROM SermonReaction r WHERE r.userId = :userId AND r.shareId IN "
            + "(SELECT s.id FROM SermonNoteShare s WHERE s.groupId = :groupId)")
    int deleteByUserInGroup(@Param("groupId") String groupId, @Param("userId") String userId);
}
