package com.kanban.domain.photo;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PhotoShareLinkRepository extends JpaRepository<PhotoShareLink, String> {

    Optional<PhotoShareLink> findByTokenAndRevokedAtIsNull(String token);

    @Query("""
            SELECT psl FROM PhotoShareLink psl
            JOIN FETCH psl.organization
            LEFT JOIN FETCH psl.tab
            JOIN FETCH psl.createdBy
            WHERE psl.organization.id = :orgId
              AND psl.revokedAt IS NULL
            ORDER BY psl.createdAt DESC
            """)
    List<PhotoShareLink> findActiveByOrganizationId(@Param("orgId") String orgId);

    @Query("""
            SELECT psl FROM PhotoShareLink psl
            JOIN FETCH psl.organization
            LEFT JOIN FETCH psl.tab
            JOIN FETCH psl.createdBy
            WHERE psl.organization.id = :orgId
              AND psl.tab.id = :tabId
              AND psl.revokedAt IS NULL
            ORDER BY psl.createdAt DESC
            """)
    List<PhotoShareLink> findActiveByOrganizationIdAndTabId(
            @Param("orgId") String orgId,
            @Param("tabId") String tabId);

    @Query("""
            SELECT psl FROM PhotoShareLink psl
            JOIN FETCH psl.organization
            LEFT JOIN FETCH psl.tab
            JOIN FETCH psl.createdBy
            WHERE psl.organization.id = :orgId
              AND psl.tab IS NULL
              AND psl.revokedAt IS NULL
            ORDER BY psl.createdAt DESC
            """)
    List<PhotoShareLink> findActiveGalleryLinksByOrganizationId(@Param("orgId") String orgId);

    boolean existsByTabIdAndLinkTypeAndRevokedAtIsNull(String tabId, PhotoShareLink.LinkType linkType);
}
