package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgActivity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface OrgActivityRepository extends JpaRepository<OrgActivity, String> {

    @Query("SELECT a FROM OrgActivity a WHERE a.organization.id = :orgId " +
            "ORDER BY a.createdAt DESC")
    List<OrgActivity> findByOrgId(@Param("orgId") String orgId, Pageable pageable);

    @Query("SELECT a FROM OrgActivity a WHERE a.organization.id = :orgId " +
            "AND a.createdAt < :cursor " +
            "ORDER BY a.createdAt DESC")
    List<OrgActivity> findByOrgIdWithCursor(@Param("orgId") String orgId,
                                             @Param("cursor") LocalDateTime cursor,
                                             Pageable pageable);
}
