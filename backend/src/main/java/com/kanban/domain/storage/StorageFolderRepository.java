package com.kanban.domain.storage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StorageFolderRepository extends JpaRepository<StorageFolder, String> {

    // ===== owner 스코프 (쿼리 레벨 격리) =====

    @Query("SELECT f FROM StorageFolder f WHERE f.id = :id AND f.owner.id = :userId")
    Optional<StorageFolder> findByIdAndOwnerUserId(@Param("id") String id, @Param("userId") String userId);

    @Query("SELECT f FROM StorageFolder f WHERE f.owner.id = :userId AND f.isDeleted = false ORDER BY f.position ASC")
    List<StorageFolder> findAllByOwnerUserIdNotDeleted(@Param("userId") String userId);

    @Query("SELECT f FROM StorageFolder f WHERE f.owner.id = :userId AND f.parent IS NULL AND f.isDeleted = false ORDER BY f.position ASC")
    List<StorageFolder> findRootsByOwnerUserId(@Param("userId") String userId);

    @Query("SELECT f FROM StorageFolder f WHERE f.parent.id = :parentId AND f.isDeleted = false ORDER BY f.position ASC")
    List<StorageFolder> findChildrenByParentId(@Param("parentId") String parentId);

    @Query("SELECT f FROM StorageFolder f WHERE f.parent.id = :parentId ORDER BY f.position ASC")
    List<StorageFolder> findAllChildrenIncludingDeleted(@Param("parentId") String parentId);

    @Query("SELECT COALESCE(MAX(f.position) + 1, 0) FROM StorageFolder f WHERE f.owner.id = :userId AND f.parent IS NULL")
    int findNextRootPositionByOwnerUserId(@Param("userId") String userId);

    @Query("SELECT COALESCE(MAX(f.position) + 1, 0) FROM StorageFolder f WHERE f.parent.id = :parentId")
    int findNextChildPosition(@Param("parentId") String parentId);

    // ===== Trash =====

    @Query("SELECT f FROM StorageFolder f WHERE f.owner.id = :userId AND f.isDeleted = true ORDER BY f.deletedAt DESC")
    List<StorageFolder> findTrashByOwnerUserId(@Param("userId") String userId);

    // ===== Public share =====

    Optional<StorageFolder> findByShareCodeAndIsSharedTrue(String shareCode);
}
