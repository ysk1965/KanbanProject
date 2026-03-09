package com.kanban.domain.photo;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface OrgPhotoRepository extends JpaRepository<OrgPhoto, String> {

    @Query("SELECT p FROM OrgPhoto p WHERE p.tab.id = :tabId " +
            "ORDER BY p.createdAt DESC, p.id DESC")
    List<OrgPhoto> findByTabIdOrderByCreatedAtDesc(@Param("tabId") String tabId,
                                                    Pageable pageable);

    @Query("SELECT p FROM OrgPhoto p WHERE p.tab.id = :tabId " +
            "AND p.createdAt < :cursor " +
            "ORDER BY p.createdAt DESC, p.id DESC")
    List<OrgPhoto> findByTabIdAndCreatedAtBefore(@Param("tabId") String tabId,
                                                  @Param("cursor") LocalDateTime cursor,
                                                  Pageable pageable);

    @Query("SELECT p FROM OrgPhoto p WHERE p.organization.id = :orgId " +
            "ORDER BY p.createdAt DESC, p.id DESC")
    List<OrgPhoto> findByOrgIdOrderByCreatedAtDesc(@Param("orgId") String orgId,
                                                    Pageable pageable);

    @Query("SELECT p FROM OrgPhoto p WHERE p.organization.id = :orgId " +
            "AND p.createdAt < :cursor " +
            "ORDER BY p.createdAt DESC, p.id DESC")
    List<OrgPhoto> findByOrgIdAndCreatedAtBefore(@Param("orgId") String orgId,
                                                  @Param("cursor") LocalDateTime cursor,
                                                  Pageable pageable);

    long countByTabId(String tabId);

    long countByOrganizationId(String orgId);

    @Modifying
    @Query("DELETE FROM OrgPhoto p WHERE p.tab.id = :tabId")
    void deleteByTabId(@Param("tabId") String tabId);

    List<OrgPhoto> findByTabId(String tabId);
}
