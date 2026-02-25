package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgAnnouncement;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface OrgAnnouncementRepository extends JpaRepository<OrgAnnouncement, String> {

    @Query("SELECT a FROM OrgAnnouncement a WHERE a.organization.id = :orgId " +
            "ORDER BY a.isPinned DESC, a.createdAt DESC")
    List<OrgAnnouncement> findByOrgId(@Param("orgId") String orgId, Pageable pageable);

    @Query("SELECT a FROM OrgAnnouncement a WHERE a.organization.id = :orgId " +
            "AND a.createdAt < :cursor " +
            "ORDER BY a.isPinned DESC, a.createdAt DESC")
    List<OrgAnnouncement> findByOrgIdWithCursor(@Param("orgId") String orgId,
                                                 @Param("cursor") LocalDateTime cursor,
                                                 Pageable pageable);

    long countByOrganizationId(String organizationId);
}
