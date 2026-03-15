package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, String> {

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.board.id = :boardId AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findAllByBoardIdNotDeleted(@Param("boardId") String boardId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.board.id = :boardId AND n.parent IS NULL AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findRootsByBoardId(@Param("boardId") String boardId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.parent.id = :parentId AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findChildrenByParentId(@Param("parentId") String parentId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.id = :id AND n.board.id = :boardId")
    Optional<Note> findByIdAndBoardId(@Param("id") String id, @Param("boardId") String boardId);

    @Query("SELECT COALESCE(MAX(n.position), -1) + 1 FROM Note n WHERE n.board.id = :boardId AND n.parent IS NULL AND n.isDeleted = false")
    int findNextRootPosition(@Param("boardId") String boardId);

    @Query("SELECT COALESCE(MAX(n.position), -1) + 1 FROM Note n WHERE n.parent.id = :parentId AND n.isDeleted = false")
    int findNextChildPosition(@Param("parentId") String parentId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.board.id = :boardId AND n.type IN ('DOCUMENT', 'BOARD') AND n.isDeleted = false ORDER BY n.updatedAt DESC")
    List<Note> findAllDocumentsAndBoardsByBoardId(@Param("boardId") String boardId);

    @Query("SELECT COUNT(n) FROM Note n WHERE n.parent.id = :parentId AND n.isDeleted = false")
    int countChildrenByParentId(@Param("parentId") String parentId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.parent.id IN :parentIds AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findChildrenByParentIds(@Param("parentIds") List<String> parentIds);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.shareToken = :shareToken AND n.isShared = true AND n.isDeleted = false")
    Optional<Note> findByShareTokenAndIsSharedTrueAndIsDeletedFalse(@Param("shareToken") String shareToken);

    @Modifying
    @Query("DELETE FROM Note n WHERE n.board.id = :boardId")
    void deleteAllByBoardId(@Param("boardId") String boardId);

    // ===== Organization-scoped queries =====

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.organization.id = :orgId AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findAllByOrganizationIdNotDeleted(@Param("orgId") String orgId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.organization.id = :orgId AND n.parent IS NULL AND n.isDeleted = false ORDER BY n.position ASC")
    List<Note> findRootsByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.id = :id AND n.organization.id = :orgId")
    Optional<Note> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);

    @Query("SELECT COALESCE(MAX(n.position), -1) + 1 FROM Note n WHERE n.organization.id = :orgId AND n.parent IS NULL AND n.isDeleted = false")
    int findNextRootPositionByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.organization.id = :orgId AND n.type IN ('DOCUMENT', 'BOARD') AND n.isDeleted = false ORDER BY n.updatedAt DESC")
    List<Note> findAllDocumentsAndBoardsByOrganizationId(@Param("orgId") String orgId);

    @Modifying
    @Query("DELETE FROM Note n WHERE n.organization.id = :orgId")
    void deleteAllByOrganizationId(@Param("orgId") String orgId);
}
