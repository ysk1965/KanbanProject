package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgAttendancePolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgAttendancePolicyRepository extends JpaRepository<OrgAttendancePolicy, String> {

    Optional<OrgAttendancePolicy> findByOrganizationId(String organizationId);

    @Query("SELECT p FROM OrgAttendancePolicy p WHERE p.autoClockOut = true")
    List<OrgAttendancePolicy> findAutoClockOutEnabled();
}
