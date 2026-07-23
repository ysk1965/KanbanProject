package com.kanban.domain.storage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 스코프 제네릭 쿼리. type ∈ {OWNER, BOARD, ORG}, sid = 해당 스코프 id.
 * OWNER 는 owner.id, BOARD 는 boardId, ORG 는 organizationId 로 격리.
 */
public interface StorageFolderRepository extends JpaRepository<StorageFolder, String> {

    String SCOPE_MATCH =
            "((:type = 'OWNER' AND f.owner.id = :sid) " +
            "OR (:type = 'BOARD' AND f.boardId = :sid) " +
            "OR (:type = 'ORG' AND f.organizationId = :sid))";

    @Query("SELECT f FROM StorageFolder f WHERE f.id = :id AND " + SCOPE_MATCH)
    Optional<StorageFolder> findByIdAndScope(@Param("id") String id,
                                             @Param("type") String type, @Param("sid") String sid);

    @Query("SELECT f FROM StorageFolder f WHERE f.isDeleted = false AND " + SCOPE_MATCH + " ORDER BY f.position ASC")
    List<StorageFolder> findAllByScopeNotDeleted(@Param("type") String type, @Param("sid") String sid);

    @Query("SELECT f FROM StorageFolder f WHERE f.parent IS NULL AND f.isDeleted = false AND " + SCOPE_MATCH + " ORDER BY f.position ASC")
    List<StorageFolder> findRootsByScope(@Param("type") String type, @Param("sid") String sid);

    @Query("SELECT COALESCE(MAX(f.position) + 1, 0) FROM StorageFolder f WHERE f.parent IS NULL AND " + SCOPE_MATCH)
    int findNextRootPositionByScope(@Param("type") String type, @Param("sid") String sid);

    @Query("SELECT f FROM StorageFolder f WHERE f.parent.id = :parentId AND f.isDeleted = false ORDER BY f.position ASC")
    List<StorageFolder> findChildrenByParentId(@Param("parentId") String parentId);

    @Query("SELECT f FROM StorageFolder f WHERE f.parent.id = :parentId ORDER BY f.position ASC")
    List<StorageFolder> findAllChildrenIncludingDeleted(@Param("parentId") String parentId);

    @Query("SELECT COALESCE(MAX(f.position) + 1, 0) FROM StorageFolder f WHERE f.parent.id = :parentId")
    int findNextChildPosition(@Param("parentId") String parentId);

    @Query("SELECT f FROM StorageFolder f WHERE f.isDeleted = true AND " + SCOPE_MATCH + " ORDER BY f.deletedAt DESC")
    List<StorageFolder> findTrashByScope(@Param("type") String type, @Param("sid") String sid);

    Optional<StorageFolder> findByShareCodeAndIsSharedTrue(String shareCode);
}
