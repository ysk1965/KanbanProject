package com.kanban.domain.leave.repository;

import com.kanban.domain.leave.LeaveBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface LeaveBalanceRepository extends JpaRepository<LeaveBalance, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT lb FROM LeaveBalance lb WHERE lb.member.id = :memberId AND lb.policy.id = :policyId AND lb.year = :year")
    Optional<LeaveBalance> findByMemberIdAndPolicyIdAndYearForUpdate(
            @Param("memberId") String memberId,
            @Param("policyId") String policyId,
            @Param("year") int year);

    @Query("SELECT lb FROM LeaveBalance lb WHERE lb.member.id = :memberId AND lb.policy.id = :policyId AND lb.year = :year")
    Optional<LeaveBalance> findByMemberIdAndPolicyIdAndYear(
            @Param("memberId") String memberId,
            @Param("policyId") String policyId,
            @Param("year") int year);

    @Query("SELECT lb FROM LeaveBalance lb JOIN FETCH lb.policy WHERE lb.member.id = :memberId AND lb.year = :year")
    List<LeaveBalance> findByMemberIdAndYear(
            @Param("memberId") String memberId,
            @Param("year") int year);

    @Query("SELECT lb FROM LeaveBalance lb JOIN FETCH lb.policy WHERE lb.organization.id = :orgId AND lb.member.id = :memberId AND lb.year = :year")
    List<LeaveBalance> findByOrgIdAndMemberIdAndYear(
            @Param("orgId") String orgId,
            @Param("memberId") String memberId,
            @Param("year") int year);

    @Query("SELECT CASE WHEN COUNT(lb) > 0 THEN true ELSE false END FROM LeaveBalance lb " +
           "WHERE lb.member.id = :memberId AND lb.policy.id = :policyId AND lb.year = :year")
    boolean existsByMemberIdAndPolicyIdAndYear(
            @Param("memberId") String memberId,
            @Param("policyId") String policyId,
            @Param("year") int year);
}
