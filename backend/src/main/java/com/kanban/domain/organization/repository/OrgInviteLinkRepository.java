package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrganizationInviteLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgInviteLinkRepository extends JpaRepository<OrganizationInviteLink, String> {

    Optional<OrganizationInviteLink> findByCode(String code);

    @Query("SELECT il FROM OrganizationInviteLink il WHERE il.organization.id = :orgId ORDER BY il.createdAt DESC")
    List<OrganizationInviteLink> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT il FROM OrganizationInviteLink il WHERE il.id = :id AND il.organization.id = :orgId")
    Optional<OrganizationInviteLink> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);

    @Modifying
    @Query("UPDATE OrganizationInviteLink il SET il.isActive = false WHERE il.organization.id = :orgId")
    void deactivateAllByOrganizationId(@Param("orgId") String orgId);
}
