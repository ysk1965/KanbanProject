package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.ContractType;
import com.kanban.domain.organization.OrganizationMember;
import com.kanban.domain.organization.WorkStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.jpa.repository.Modifying;

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
           "LEFT JOIN FETCH om.position " +
           "LEFT JOIN FETCH om.title " +
           "LEFT JOIN FETCH om.grade " +
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

    @Query("SELECT om FROM OrganizationMember om " +
           "JOIN FETCH om.user " +
           "LEFT JOIN FETCH om.department " +
           "LEFT JOIN FETCH om.jobGroup " +
           "LEFT JOIN FETCH om.position " +
           "LEFT JOIN FETCH om.title " +
           "LEFT JOIN FETCH om.grade " +
           "WHERE om.organization.id = :orgId " +
           "AND om.workStatus IN :statuses")
    List<OrganizationMember> findActiveMembers(
            @Param("orgId") String orgId,
            @Param("statuses") List<WorkStatus> statuses);

    @Query("SELECT om FROM OrganizationMember om " +
           "JOIN FETCH om.user " +
           "LEFT JOIN FETCH om.department " +
           "LEFT JOIN FETCH om.jobGroup " +
           "LEFT JOIN FETCH om.position " +
           "LEFT JOIN FETCH om.title " +
           "LEFT JOIN FETCH om.grade " +
           "WHERE om.organization.id = :orgId")
    List<OrganizationMember> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT COUNT(om) FROM OrganizationMember om WHERE om.organization.id = :orgId")
    int countByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT COUNT(om) FROM OrganizationMember om WHERE om.organization.id = :orgId " +
           "AND om.workStatus IN ('ACTIVE', 'ON_LEAVE')")
    int countActiveMembersByOrgId(@Param("orgId") String orgId);

    void deleteByOrganizationId(String orgId);

    @Query("SELECT om FROM OrganizationMember om " +
           "JOIN FETCH om.user " +
           "LEFT JOIN FETCH om.department " +
           "LEFT JOIN FETCH om.jobGroup " +
           "LEFT JOIN FETCH om.position " +
           "LEFT JOIN FETCH om.title " +
           "LEFT JOIN FETCH om.grade " +
           "WHERE om.id = :memberId")
    Optional<OrganizationMember> findByIdWithDetails(@Param("memberId") String memberId);

    @Query("SELECT om FROM OrganizationMember om " +
           "JOIN FETCH om.organization o " +
           "WHERE om.user.id = :userId AND o.deletedAt IS NULL")
    List<OrganizationMember> findByUserIdWithOrganization(@Param("userId") String userId);

    @Query("SELECT om.organization.id, COUNT(om) FROM OrganizationMember om " +
           "WHERE om.organization.id IN :orgIds GROUP BY om.organization.id")
    List<Object[]> countGroupedByOrgIds(@Param("orgIds") List<String> orgIds);

    @Query("SELECT om FROM OrganizationMember om " +
           "JOIN FETCH om.user " +
           "LEFT JOIN FETCH om.department " +
           "LEFT JOIN FETCH om.jobGroup " +
           "LEFT JOIN FETCH om.position " +
           "LEFT JOIN FETCH om.title " +
           "LEFT JOIN FETCH om.grade " +
           "WHERE om.manager.id = :managerId " +
           "AND om.workStatus IN ('ACTIVE', 'ON_LEAVE')")
    List<OrganizationMember> findByManagerId(@Param("managerId") String managerId);

    @Modifying
    @Query("UPDATE OrganizationMember om SET om.department = NULL WHERE om.department.id = :departmentId")
    void clearDepartmentReference(@Param("departmentId") String departmentId);

    @Modifying
    @Query("UPDATE OrganizationMember om SET om.jobGroup = NULL WHERE om.jobGroup.id = :jobGroupId")
    void clearJobGroupReference(@Param("jobGroupId") String jobGroupId);

    @Modifying
    @Query("UPDATE OrganizationMember om SET om.position = NULL WHERE om.position.id = :positionId")
    void clearPositionReference(@Param("positionId") String positionId);

    @Modifying
    @Query("UPDATE OrganizationMember om SET om.title = NULL WHERE om.title.id = :titleId")
    void clearTitleReference(@Param("titleId") String titleId);

    @Modifying
    @Query("UPDATE OrganizationMember om SET om.grade = NULL WHERE om.grade.id = :gradeId")
    void clearGradeReference(@Param("gradeId") String gradeId);

    @Query("SELECT om FROM OrganizationMember om " +
           "JOIN FETCH om.user " +
           "LEFT JOIN FETCH om.department " +
           "LEFT JOIN FETCH om.manager " +
           "LEFT JOIN FETCH om.position " +
           "LEFT JOIN FETCH om.title " +
           "LEFT JOIN FETCH om.grade " +
           "WHERE om.organization.id = :orgId " +
           "AND om.workStatus IN :statuses")
    List<OrganizationMember> findActiveMembersWithDetails(
            @Param("orgId") String orgId,
            @Param("statuses") List<WorkStatus> statuses);
}
