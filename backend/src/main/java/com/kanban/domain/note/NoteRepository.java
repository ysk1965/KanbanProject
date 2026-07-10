package com.kanban.domain.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
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

    /** 공개 공유 링크 조회 — 신규 short code 또는 레거시 UUID share_token 어느 쪽이든 매칭. */
    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE (n.shareCode = :token OR n.shareToken = :token) AND n.isShared = true AND n.isDeleted = false")
    Optional<Note> findBySharePublicToken(@Param("token") String token);

    @Modifying
    @Query("DELETE FROM Note n WHERE n.board.id = :boardId")
    void deleteAllByBoardId(@Param("boardId") String boardId);

    @Query("SELECT n FROM Note n LEFT JOIN FETCH n.createdBy LEFT JOIN FETCH n.updatedBy WHERE n.board.id IN :boardIds AND n.isDeleted = false ORDER BY n.board.id ASC, n.position ASC")
    List<Note> findAllByBoardIdInNotDeleted(@Param("boardIds") List<String> boardIds);

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

    // ===== Trash (휴지통) =====

    @Query("SELECT n FROM Note n " +
           "LEFT JOIN FETCH n.createdBy " +
           "LEFT JOIN FETCH n.updatedBy " +
           "LEFT JOIN FETCH n.deletedBy " +
           "LEFT JOIN FETCH n.parent p " +
           "WHERE n.board.id = :boardId AND n.isDeleted = true " +
           "ORDER BY n.deletedAt DESC")
    List<Note> findTrashByBoardId(@Param("boardId") String boardId);

    @Query("SELECT n FROM Note n " +
           "LEFT JOIN FETCH n.createdBy " +
           "LEFT JOIN FETCH n.updatedBy " +
           "LEFT JOIN FETCH n.deletedBy " +
           "LEFT JOIN FETCH n.parent p " +
           "WHERE n.organization.id = :orgId AND n.isDeleted = true " +
           "ORDER BY n.deletedAt DESC")
    List<Note> findTrashByOrganizationId(@Param("orgId") String orgId);

    /** 자식까지 포함하는 휴지통 노트 (영구 삭제 cascade용). isDeleted 무시. */
    @Query("SELECT n FROM Note n WHERE n.parent.id = :parentId")
    List<Note> findAllChildrenIncludingDeleted(@Param("parentId") String parentId);

    /** 30일 경과 영구 삭제 대상. */
    @Query("SELECT n FROM Note n WHERE n.isDeleted = true AND n.deletedAt < :cutoff")
    List<Note> findExpiredTrash(@Param("cutoff") LocalDateTime cutoff);

    /** 보드 휴지통 노트 수. */
    @Query("SELECT COUNT(n) FROM Note n WHERE n.board.id = :boardId AND n.isDeleted = true")
    long countTrashByBoardId(@Param("boardId") String boardId);

    /** 조직 휴지통 노트 수. */
    @Query("SELECT COUNT(n) FROM Note n WHERE n.organization.id = :orgId AND n.isDeleted = true")
    long countTrashByOrganizationId(@Param("orgId") String orgId);

    /** 보드 휴지통 전체 비우기 (자식 노트 cascade 처리는 서비스 레이어에서). */
    @Query("SELECT n FROM Note n WHERE n.board.id = :boardId AND n.isDeleted = true")
    List<Note> findAllTrashByBoardId(@Param("boardId") String boardId);

    @Query("SELECT n FROM Note n WHERE n.organization.id = :orgId AND n.isDeleted = true")
    List<Note> findAllTrashByOrganizationId(@Param("orgId") String orgId);
}
