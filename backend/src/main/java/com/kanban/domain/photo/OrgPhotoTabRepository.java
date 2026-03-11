package com.kanban.domain.photo;

import org.springframework.data.jpa.repository.JpaRepository;
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
}
