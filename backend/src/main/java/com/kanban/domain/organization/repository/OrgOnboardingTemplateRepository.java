package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgOnboardingTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface OrgOnboardingTemplateRepository extends JpaRepository<OrgOnboardingTemplate, String> {

    @Query("SELECT t FROM OrgOnboardingTemplate t " +
           "LEFT JOIN FETCH t.targetDepartment " +
           "LEFT JOIN FETCH t.targetJobGroup " +
           "WHERE t.organization.id = :orgId " +
           "ORDER BY t.displayOrder ASC")
    List<OrgOnboardingTemplate> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT t FROM OrgOnboardingTemplate t " +
           "LEFT JOIN FETCH t.items " +
           "LEFT JOIN FETCH t.targetDepartment " +
           "LEFT JOIN FETCH t.targetJobGroup " +
           "WHERE t.organization.id = :orgId AND t.active = true AND t.autoAssign = true")
    List<OrgOnboardingTemplate> findAutoAssignTemplates(@Param("orgId") String orgId);
}
