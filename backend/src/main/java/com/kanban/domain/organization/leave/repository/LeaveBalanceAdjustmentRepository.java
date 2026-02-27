package com.kanban.domain.organization.leave.repository;

import com.kanban.domain.organization.leave.LeaveBalanceAdjustment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LeaveBalanceAdjustmentRepository extends JpaRepository<LeaveBalanceAdjustment, String> {

    @Query("SELECT a FROM LeaveBalanceAdjustment a " +
           "JOIN FETCH a.member m JOIN FETCH m.user " +
           "JOIN FETCH a.policy " +
           "LEFT JOIN FETCH a.grantedBy gb LEFT JOIN FETCH gb.user " +
           "WHERE a.member.id = :memberId " +
           "ORDER BY a.createdAt DESC")
    List<LeaveBalanceAdjustment> findByMemberIdOrderByCreatedAtDesc(@Param("memberId") String memberId);

    @Query(value = "SELECT a FROM LeaveBalanceAdjustment a " +
           "JOIN FETCH a.member m JOIN FETCH m.user " +
           "JOIN FETCH a.policy " +
           "LEFT JOIN FETCH a.grantedBy gb LEFT JOIN FETCH gb.user " +
           "WHERE a.organization.id = :orgId",
           countQuery = "SELECT COUNT(a) FROM LeaveBalanceAdjustment a WHERE a.organization.id = :orgId")
    Page<LeaveBalanceAdjustment> findByOrganizationIdOrderByCreatedAtDesc(
            @Param("orgId") String orgId, Pageable pageable);

    @Query("SELECT a FROM LeaveBalanceAdjustment a " +
           "JOIN FETCH a.policy " +
           "LEFT JOIN FETCH a.grantedBy gb LEFT JOIN FETCH gb.user " +
           "WHERE a.balance.id = :balanceId " +
           "ORDER BY a.createdAt DESC")
    List<LeaveBalanceAdjustment> findByBalanceId(@Param("balanceId") String balanceId);
}
