package com.kanban.domain.photo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgPhotoTabRepository extends JpaRepository<OrgPhotoTab, String> {

    List<OrgPhotoTab> findByOrganizationIdOrderBySortOrder(String orgId);

    long countByOrganizationId(String orgId);

    Optional<OrgPhotoTab> findByIdAndOrganizationId(String id, String orgId);

    @Query("SELECT t FROM OrgPhotoTab t " +
           "JOIN FETCH t.organization " +
           "WHERE t.shareToken = :shareToken AND t.isShared = true")
    Optional<OrgPhotoTab> findByShareTokenAndIsSharedTrue(@Param("shareToken") String shareToken);

    List<OrgPhotoTab> findByOrganizationIdAndIsSharedTrueOrderBySortOrderAsc(String orgId);

    @Query("SELECT t FROM OrgPhotoTab t " +
           "JOIN FETCH t.organization " +
           "WHERE t.uploadToken = :uploadToken AND t.isUploadEnabled = true")
    Optional<OrgPhotoTab> findByUploadTokenAndIsUploadEnabledTrue(@Param("uploadToken") String uploadToken);

    @Query("SELECT COALESCE(SUM(t.photoCount), 0) FROM OrgPhotoTab t WHERE t.organization.id = :orgId")
    long sumPhotoCountByOrganizationId(@Param("orgId") String orgId);

    /**
     * 사진 수 원자적 증가. 같은 앨범에 업로드 요청이 동시에 들어와도 카운트가 유실되지 않는다.
     * (엔티티 필드 ++ 는 마지막 커밋이 덮어써서 병렬 업로드 시 누락됨)
     */
    @Modifying
    @Query("UPDATE OrgPhotoTab t SET t.photoCount = t.photoCount + :delta WHERE t.id = :tabId")
    int incrementPhotoCount(@Param("tabId") String tabId, @Param("delta") int delta);
}
