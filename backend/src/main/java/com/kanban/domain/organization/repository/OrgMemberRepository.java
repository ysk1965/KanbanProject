package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.ContractType;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.WorkStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgMemberRepository extends JpaRepository<OrganizationMember, String> {

    @Query("SELECT om FROM OrganizationMember om WHERE om.organization.id = :orgId AND om.user.id = :userId")
    Optional<OrganizationMember> findByOrganizationIdAndUserId(
            @Param("orgId") String orgId, @Param("userId") String userId);

    @Query("SELECT CASE WHEN COUNT(om) > 0 THEN true ELSE false END FROM OrganizationMember om " +
           "WHERE om.organization.id = :orgId AND om.user.id = :userId")
    boolean existsByOrganizationIdAndUserId(
            @Param("orgId") String orgId, @Param("userId") String userId);

    @Query("SELECT om FROM OrganizationMember om " +
           "JOIN FETCH om.user " +
           "LEFT JOIN FETCH om.department " +
           "LEFT JOIN FETCH om.jobGroup " +
           "WHERE om.organization.id = :orgId " +
           "AND (:departmentId IS NULL OR om.department.id = :departmentId) " +
           "AND (:jobGroupId IS NULL OR om.jobGroup.id = :jobGroupId) " +
           "AND (:contractType IS NULL OR om.contractType = :contractType) " +
           "AND (:workStatus IS NULL OR om.workStatus = :workStatus) " +
           "AND (:search IS NULL OR :search = '' OR om.user.name LIKE %:search% OR om.user.email LIKE %:search%)")
    Page<OrganizationMember> findByOrgIdWithFilters(
            @Param("orgId") String orgId,
            @Param("departmentId") String departmentId,
            @Param("jobGroupId") String jobGroupId,
            @Param("contractType") ContractType contractType,
            @Param("workStatus") WorkStatus workStatus,
            @Param("search") String search,
            Pageable pageable);

    @Query("SELECT om FROM OrganizationMember om WHERE om.organization.id = :orgId " +
           "AND om.workStatus IN :statuses")
    List<OrganizationMember> findActiveMembers(
            @Param("orgId") String orgId,
            @Param("statuses") List<WorkStatus> statuses);

    @Query("SELECT om FROM OrganizationMember om WHERE om.organization.id = :orgId")
    List<OrganizationMember> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT COUNT(om) FROM OrganizationMember om WHERE om.organization.id = :orgId")
    int countByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT COUNT(om) FROM OrganizationMember om WHERE om.organization.id = :orgId " +
           "AND om.workStatus IN ('ACTIVE', 'ON_LEAVE')")
    int countActiveMembersByOrgId(@Param("orgId") String orgId);

    void deleteByOrganizationId(String orgId);
}
