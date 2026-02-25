package com.kanban.domain.leave.repository;

import com.kanban.domain.leave.LeavePolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface LeavePolicyRepository extends JpaRepository<LeavePolicy, String> {

    @Query("SELECT lp FROM LeavePolicy lp WHERE lp.organization.id = :orgId ORDER BY lp.displayOrder ASC")
    List<LeavePolicy> findByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT lp FROM LeavePolicy lp WHERE lp.organization.id = :orgId AND lp.isActive = true ORDER BY lp.displayOrder ASC")
    List<LeavePolicy> findActiveByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT lp FROM LeavePolicy lp WHERE lp.id = :id AND lp.organization.id = :orgId")
    Optional<LeavePolicy> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);
}
