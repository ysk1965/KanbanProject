package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrganizationPosition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgPositionRepository extends JpaRepository<OrganizationPosition, String> {

    @Query("SELECT p FROM OrganizationPosition p WHERE p.organization.id = :orgId ORDER BY p.displayOrder ASC, p.name ASC")
    List<OrganizationPosition> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT p FROM OrganizationPosition p WHERE p.id = :id AND p.organization.id = :orgId")
    Optional<OrganizationPosition> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);

    @Query("SELECT CASE WHEN COUNT(p) > 0 THEN true ELSE false END FROM OrganizationPosition p " +
           "WHERE p.organization.id = :orgId AND p.name = :name")
    boolean existsByOrganizationIdAndName(@Param("orgId") String orgId, @Param("name") String name);
}
