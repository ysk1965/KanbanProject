package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface NoteLikeRepository extends JpaRepository<NoteLike, String> {

    Optional<NoteLike> findByNoteIdAndUserId(String noteId, String userId);

    boolean existsByNoteIdAndUserId(String noteId, String userId);

    @Query("SELECT COUNT(nl) FROM NoteLike nl WHERE nl.note.id = :noteId")
    int countByNoteId(String noteId);

    @Modifying
    @Query("DELETE FROM NoteLike nl WHERE nl.note.id = :noteId AND nl.user.id = :userId")
    void deleteByNoteIdAndUserId(String noteId, String userId);

    @Modifying
    @Query("DELETE FROM NoteLike nl WHERE nl.note.id = :noteId")
    void deleteByNoteId(String noteId);

    @Modifying
    @Query("DELETE FROM NoteLike nl WHERE nl.note.id IN (SELECT n.id FROM Note n WHERE n.board.id = :boardId)")
    void deleteByBoardId(String boardId);

    @Modifying
    @Query("DELETE FROM NoteLike nl WHERE nl.note.id IN (SELECT n.id FROM Note n WHERE n.organization.id = :organizationId)")
    void deleteByOrganizationId(String organizationId);
}
