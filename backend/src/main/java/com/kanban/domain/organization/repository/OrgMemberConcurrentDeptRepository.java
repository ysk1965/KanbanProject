package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrganizationMemberConcurrentDept;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface OrgMemberConcurrentDeptRepository extends JpaRepository<OrganizationMemberConcurrentDept, String> {

    @Query("SELECT cd FROM OrganizationMemberConcurrentDept cd " +
           "LEFT JOIN FETCH cd.department " +
           "LEFT JOIN FETCH cd.position " +
           "WHERE cd.member.id = :memberId " +
           "ORDER BY cd.displayOrder ASC")
    List<OrganizationMemberConcurrentDept> findByMemberId(@Param("memberId") String memberId);

    @Query("SELECT CASE WHEN COUNT(cd) > 0 THEN true ELSE false END FROM OrganizationMemberConcurrentDept cd " +
           "WHERE cd.member.id = :memberId AND cd.department.id = :departmentId")
    boolean existsByMemberIdAndDepartmentId(@Param("memberId") String memberId, @Param("departmentId") String departmentId);

    @Modifying
    @Query("DELETE FROM OrganizationMemberConcurrentDept cd WHERE cd.member.id = :memberId")
    void deleteByMemberId(@Param("memberId") String memberId);

    @Modifying
    @Query("DELETE FROM OrganizationMemberConcurrentDept cd WHERE cd.department.id = :departmentId")
    void deleteByDepartmentId(@Param("departmentId") String departmentId);

    @Modifying
    @Query("UPDATE OrganizationMemberConcurrentDept cd SET cd.position = NULL WHERE cd.position.id = :positionId")
    void clearPositionReference(@Param("positionId") String positionId);
}
