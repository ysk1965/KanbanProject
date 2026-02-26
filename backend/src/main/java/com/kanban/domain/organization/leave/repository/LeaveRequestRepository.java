package com.kanban.domain.organization.leave.repository;

import com.kanban.domain.organization.leave.LeaveRequest;
import com.kanban.domain.organization.leave.LeaveStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface LeaveRequestRepository extends JpaRepository<LeaveRequest, String> {

    @Query("SELECT lr FROM LeaveRequest lr WHERE lr.id = :id AND lr.organization.id = :orgId")
    Optional<LeaveRequest> findByIdAndOrganizationId(@Param("id") String id, @Param("orgId") String orgId);

    @Query("SELECT lr FROM LeaveRequest lr " +
           "JOIN FETCH lr.requester req " +
           "JOIN FETCH req.user " +
           "LEFT JOIN FETCH req.department " +
           "JOIN FETCH lr.policy " +
           "WHERE lr.organization.id = :orgId " +
           "AND (:status IS NULL OR lr.status = :status) " +
           "AND (:requesterId IS NULL OR lr.requester.id = :requesterId) " +
           "AND (:startDate IS NULL OR lr.endDate >= :startDate) " +
           "AND (:endDate IS NULL OR lr.startDate <= :endDate) " +
           "ORDER BY lr.createdAt DESC")
    Page<LeaveRequest> findByOrgIdWithFilters(
            @Param("orgId") String orgId,
            @Param("status") LeaveStatus status,
            @Param("requesterId") String requesterId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            Pageable pageable);

    @Query("SELECT lr FROM LeaveRequest lr WHERE lr.requester.id = :requesterId " +
           "AND lr.status IN :statuses " +
           "AND lr.startDate <= :endDate AND lr.endDate >= :startDate")
    List<LeaveRequest> findOverlapping(
            @Param("requesterId") String requesterId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("statuses") List<LeaveStatus> statuses);

    @Query("SELECT lr FROM LeaveRequest lr " +
           "JOIN FETCH lr.requester req " +
           "JOIN FETCH req.user " +
           "LEFT JOIN FETCH req.department " +
           "JOIN FETCH lr.policy " +
           "WHERE lr.requester.id = :requesterId AND lr.status = :status")
    List<LeaveRequest> findByRequesterIdAndStatus(
            @Param("requesterId") String requesterId,
            @Param("status") LeaveStatus status);

    @Query("SELECT lr FROM LeaveRequest lr " +
           "JOIN FETCH lr.requester req " +
           "JOIN FETCH req.user " +
           "LEFT JOIN FETCH req.department " +
           "JOIN FETCH lr.policy " +
           "WHERE lr.policy.id = :policyId AND lr.status = :status")
    List<LeaveRequest> findByPolicyIdAndStatus(
            @Param("policyId") String policyId,
            @Param("status") LeaveStatus status);

    @Query("SELECT lr FROM LeaveRequest lr " +
           "JOIN FETCH lr.requester req " +
           "JOIN FETCH req.user " +
           "LEFT JOIN FETCH req.department " +
           "JOIN FETCH lr.policy " +
           "WHERE lr.organization.id = :orgId " +
           "AND lr.status = 'APPROVED' " +
           "AND lr.startDate <= :date AND lr.endDate >= :date")
    List<LeaveRequest> findApprovedOnDate(
            @Param("orgId") String orgId,
            @Param("date") LocalDate date);

    @Query("SELECT COUNT(lr) FROM LeaveRequest lr WHERE lr.organization.id = :orgId " +
           "AND lr.status = 'APPROVED' " +
           "AND lr.startDate <= :date AND lr.endDate >= :date")
    int countApprovedOnDate(@Param("orgId") String orgId, @Param("date") LocalDate date);
}
