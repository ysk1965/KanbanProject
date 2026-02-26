package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrganizationGrade;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgGradeRepository extends JpaRepository<OrganizationGrade, String> {

    @Query("SELECT g FROM OrganizationGrade g WHERE g.organization.id = :orgId ORDER BY g.displayOrder ASC, g.name ASC")
    List<OrganizationGrade> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT g FROM OrganizationGrade g WHERE g.id = :id AND g.organization.id = :orgId")
    Optional<OrganizationGrade> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);

    @Query("SELECT CASE WHEN COUNT(g) > 0 THEN true ELSE false END FROM OrganizationGrade g " +
           "WHERE g.organization.id = :orgId AND g.name = :name")
    boolean existsByOrganizationIdAndName(@Param("orgId") String orgId, @Param("name") String name);
}
