package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgAttendanceRecord;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface OrgAttendanceRecordRepository extends JpaRepository<OrgAttendanceRecord, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM OrgAttendanceRecord r WHERE r.organization.id = :orgId " +
           "AND r.member.id = :memberId AND r.recordDate = :date AND r.deletedAt IS NULL")
    Optional<OrgAttendanceRecord> findByMemberAndDateForUpdate(@Param("orgId") String orgId,
                                                                @Param("memberId") String memberId,
                                                                @Param("date") LocalDate date);

    @Query("SELECT r FROM OrgAttendanceRecord r WHERE r.organization.id = :orgId " +
           "AND r.member.id = :memberId AND r.recordDate = :date AND r.deletedAt IS NULL")
    Optional<OrgAttendanceRecord> findByMemberAndDate(@Param("orgId") String orgId,
                                                       @Param("memberId") String memberId,
                                                       @Param("date") LocalDate date);

    @Query("SELECT r FROM OrgAttendanceRecord r " +
           "JOIN FETCH r.member m JOIN FETCH m.user " +
           "WHERE r.organization.id = :orgId AND r.member.id = :memberId " +
           "AND r.recordDate BETWEEN :startDate AND :endDate AND r.deletedAt IS NULL " +
           "ORDER BY r.recordDate DESC")
    List<OrgAttendanceRecord> findByMemberAndDateRange(@Param("orgId") String orgId,
                                                        @Param("memberId") String memberId,
                                                        @Param("startDate") LocalDate startDate,
                                                        @Param("endDate") LocalDate endDate);

    @Query("SELECT r FROM OrgAttendanceRecord r " +
           "JOIN FETCH r.member m JOIN FETCH m.user LEFT JOIN FETCH m.department " +
           "WHERE r.organization.id = :orgId " +
           "AND r.recordDate BETWEEN :startDate AND :endDate AND r.deletedAt IS NULL " +
           "ORDER BY m.user.name ASC, r.recordDate DESC")
    List<OrgAttendanceRecord> findByOrgAndDateRange(@Param("orgId") String orgId,
                                                     @Param("startDate") LocalDate startDate,
                                                     @Param("endDate") LocalDate endDate);

    @Query("SELECT r FROM OrgAttendanceRecord r " +
           "JOIN FETCH r.member m JOIN FETCH m.user " +
           "WHERE r.organization.id = :orgId AND r.recordDate = :date AND r.deletedAt IS NULL")
    List<OrgAttendanceRecord> findByOrgAndDate(@Param("orgId") String orgId, @Param("date") LocalDate date);

    @Query("SELECT r FROM OrgAttendanceRecord r WHERE r.organization.id = :orgId " +
           "AND r.recordDate = :date AND r.clockIn IS NOT NULL AND r.clockOut IS NULL AND r.deletedAt IS NULL")
    List<OrgAttendanceRecord> findUnclocked(@Param("orgId") String orgId, @Param("date") LocalDate date);

    @Query("SELECT r FROM OrgAttendanceRecord r " +
           "JOIN FETCH r.member m " +
           "WHERE r.clockIn IS NOT NULL AND r.clockOut IS NULL AND r.deletedAt IS NULL " +
           "AND r.organization.id IN :orgIds AND r.recordDate = :date")
    List<OrgAttendanceRecord> findUnclockedByOrgsAndDate(@Param("orgIds") List<String> orgIds,
                                                          @Param("date") LocalDate date);

    @Modifying
    @Query("DELETE FROM OrgAttendanceRecord r WHERE r.member.id = :memberId")
    void deleteByMemberId(@Param("memberId") String memberId);
}
