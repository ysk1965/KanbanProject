package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrganizationJobGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgJobGroupRepository extends JpaRepository<OrganizationJobGroup, String> {

    @Query("SELECT jg FROM OrganizationJobGroup jg WHERE jg.organization.id = :orgId ORDER BY jg.displayOrder ASC, jg.name ASC")
    List<OrganizationJobGroup> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT jg FROM OrganizationJobGroup jg WHERE jg.id = :id AND jg.organization.id = :orgId")
    Optional<OrganizationJobGroup> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);

    @Query("SELECT CASE WHEN COUNT(jg) > 0 THEN true ELSE false END FROM OrganizationJobGroup jg " +
           "WHERE jg.organization.id = :orgId AND jg.name = :name")
    boolean existsByOrganizationIdAndName(@Param("orgId") String orgId, @Param("name") String name);
}
