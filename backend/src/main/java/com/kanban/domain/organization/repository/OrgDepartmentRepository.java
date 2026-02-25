package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrganizationDepartment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgDepartmentRepository extends JpaRepository<OrganizationDepartment, String> {

    @Query("SELECT d FROM OrganizationDepartment d WHERE d.organization.id = :orgId ORDER BY d.displayOrder ASC, d.name ASC")
    List<OrganizationDepartment> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT d FROM OrganizationDepartment d WHERE d.id = :id AND d.organization.id = :orgId")
    Optional<OrganizationDepartment> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);

    @Query("SELECT CASE WHEN COUNT(d) > 0 THEN true ELSE false END FROM OrganizationDepartment d " +
           "WHERE d.organization.id = :orgId AND d.name = :name")
    boolean existsByOrganizationIdAndName(@Param("orgId") String orgId, @Param("name") String name);
}
