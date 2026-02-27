package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrganizationTitle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgTitleRepository extends JpaRepository<OrganizationTitle, String> {

    @Query("SELECT t FROM OrganizationTitle t WHERE t.organization.id = :orgId ORDER BY t.displayOrder ASC, t.name ASC")
    List<OrganizationTitle> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT t FROM OrganizationTitle t WHERE t.id = :id AND t.organization.id = :orgId")
    Optional<OrganizationTitle> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);

    @Query("SELECT CASE WHEN COUNT(t) > 0 THEN true ELSE false END FROM OrganizationTitle t " +
           "WHERE t.organization.id = :orgId AND t.name = :name")
    boolean existsByOrganizationIdAndName(@Param("orgId") String orgId, @Param("name") String name);
}
