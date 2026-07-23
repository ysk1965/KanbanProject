package com.kanban.domain.storage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface StorageFileRepository extends JpaRepository<StorageFile, String> {

    // ===== owner 스코프 (쿼리 레벨 격리) =====

    @Query("SELECT f FROM StorageFile f WHERE f.id = :id AND f.owner.id = :userId")
    Optional<StorageFile> findByIdAndOwnerUserId(@Param("id") String id, @Param("userId") String userId);

    @Query("SELECT f FROM StorageFile f WHERE f.owner.id = :userId AND f.folder IS NULL AND f.isDeleted = false ORDER BY f.createdAt DESC")
    List<StorageFile> findRootFilesByOwnerUserId(@Param("userId") String userId);

    @Query("SELECT f FROM StorageFile f WHERE f.owner.id = :userId AND f.folder.id = :folderId AND f.isDeleted = false ORDER BY f.createdAt DESC")
    List<StorageFile> findByOwnerUserIdAndFolderId(@Param("userId") String userId, @Param("folderId") String folderId);

    @Query("SELECT f FROM StorageFile f WHERE f.folder.id = :folderId AND f.isDeleted = false")
    List<StorageFile> findActiveByFolderId(@Param("folderId") String folderId);

    @Query("SELECT f FROM StorageFile f WHERE f.folder.id = :folderId")
    List<StorageFile> findAllByFolderIdIncludingDeleted(@Param("folderId") String folderId);

    // ===== 용량 집계 =====

    @Query("SELECT COALESCE(SUM(f.fileSize), 0) FROM StorageFile f WHERE f.owner.id = :userId AND f.isDeleted = false")
    long sumFileSizeByOwnerUserId(@Param("userId") String userId);

    /** content_type 별 집계 (개수·용량). 카테고리 분류는 서비스에서 수행. → [contentType, count, sumSize] */
    @Query("SELECT f.contentType, COUNT(f), COALESCE(SUM(f.fileSize), 0) " +
            "FROM StorageFile f WHERE f.owner.id = :userId AND f.isDeleted = false " +
            "GROUP BY f.contentType")
    List<Object[]> aggregateByContentType(@Param("userId") String userId);

    // ===== Trash =====

    @Query("SELECT f FROM StorageFile f WHERE f.owner.id = :userId AND f.isDeleted = true ORDER BY f.deletedAt DESC")
    List<StorageFile> findTrashByOwnerUserId(@Param("userId") String userId);

    // ===== Public share =====

    Optional<StorageFile> findByShareCodeAndIsSharedTrue(String shareCode);
}
