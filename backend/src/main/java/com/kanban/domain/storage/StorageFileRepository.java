package com.kanban.domain.storage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 스코프 제네릭 쿼리. type ∈ {OWNER, BOARD, ORG}, sid = 해당 스코프 id.
 */
public interface StorageFileRepository extends JpaRepository<StorageFile, String> {

    String SCOPE_MATCH =
            "((:type = 'OWNER' AND f.owner.id = :sid) " +
            "OR (:type = 'BOARD' AND f.boardId = :sid) " +
            "OR (:type = 'ORG' AND f.organizationId = :sid))";

    @Query("SELECT f FROM StorageFile f WHERE f.id = :id AND " + SCOPE_MATCH)
    Optional<StorageFile> findByIdAndScope(@Param("id") String id,
                                           @Param("type") String type, @Param("sid") String sid);

    @Query("SELECT f FROM StorageFile f WHERE f.folder IS NULL AND f.isDeleted = false AND " + SCOPE_MATCH + " ORDER BY f.createdAt DESC")
    List<StorageFile> findRootFilesByScope(@Param("type") String type, @Param("sid") String sid);

    @Query("SELECT f FROM StorageFile f WHERE f.folder.id = :folderId AND f.isDeleted = false AND " + SCOPE_MATCH + " ORDER BY f.createdAt DESC")
    List<StorageFile> findByScopeAndFolderId(@Param("type") String type, @Param("sid") String sid,
                                             @Param("folderId") String folderId);

    @Query("SELECT f FROM StorageFile f WHERE f.folder.id = :folderId AND f.isDeleted = false")
    List<StorageFile> findActiveByFolderId(@Param("folderId") String folderId);

    @Query("SELECT f FROM StorageFile f WHERE f.folder.id = :folderId")
    List<StorageFile> findAllByFolderIdIncludingDeleted(@Param("folderId") String folderId);

    @Query("SELECT COALESCE(SUM(f.fileSize), 0) FROM StorageFile f WHERE f.isDeleted = false AND " + SCOPE_MATCH)
    long sumFileSizeByScope(@Param("type") String type, @Param("sid") String sid);

    @Query("SELECT f.contentType, COUNT(f), COALESCE(SUM(f.fileSize), 0) FROM StorageFile f " +
            "WHERE f.isDeleted = false AND " + SCOPE_MATCH + " GROUP BY f.contentType")
    List<Object[]> aggregateByContentTypeByScope(@Param("type") String type, @Param("sid") String sid);

    @Query("SELECT f FROM StorageFile f WHERE f.isDeleted = true AND " + SCOPE_MATCH + " ORDER BY f.deletedAt DESC")
    List<StorageFile> findTrashByScope(@Param("type") String type, @Param("sid") String sid);

    Optional<StorageFile> findByShareCodeAndIsSharedTrue(String shareCode);

    /**
     * 보드 스코프에서 같은 S3 키를 가진 파일(삭제된 것 포함). 보고서 자동 수집 파일의 멱등 등록에 쓴다 —
     * 같은 (board, s3Key)가 이미 있으면 재생성하지 않는다(사용자가 지운 파일 부활 방지 포함).
     */
    Optional<StorageFile> findByBoardIdAndS3Key(String boardId, String s3Key);
}
