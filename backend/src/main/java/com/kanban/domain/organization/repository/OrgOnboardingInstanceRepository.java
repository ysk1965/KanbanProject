package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgOnboardingInstance;
import com.kanban.domain.organization.OnboardingStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface OrgOnboardingInstanceRepository extends JpaRepository<OrgOnboardingInstance, String> {

    @Query("SELECT i FROM OrgOnboardingInstance i " +
           "JOIN FETCH i.member m " +
           "JOIN FETCH m.user " +
           "WHERE i.organization.id = :orgId AND i.deletedAt IS NULL " +
           "AND (:status IS NULL OR i.status = :status) " +
           "AND (:memberId IS NULL OR i.member.id = :memberId) " +
           "ORDER BY i.createdAt DESC")
    List<OrgOnboardingInstance> findByOrgIdWithFilters(
            @Param("orgId") String orgId,
            @Param("status") OnboardingStatus status,
            @Param("memberId") String memberId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM OrgOnboardingInstance i WHERE i.id = :id AND i.deletedAt IS NULL")
    Optional<OrgOnboardingInstance> findByIdForUpdate(@Param("id") String id);

    @Query("SELECT CASE WHEN COUNT(i) > 0 THEN true ELSE false END FROM OrgOnboardingInstance i " +
           "WHERE i.member.id = :memberId AND i.sourceTemplate.id = :templateId " +
           "AND i.status = 'IN_PROGRESS' AND i.deletedAt IS NULL")
    boolean existsActiveByMemberAndTemplate(
            @Param("memberId") String memberId,
            @Param("templateId") String templateId);

    @Query("SELECT i FROM OrgOnboardingInstance i " +
           "JOIN FETCH i.member m " +
           "JOIN FETCH m.user " +
           "WHERE i.organization.id = :orgId AND i.deletedAt IS NULL " +
           "AND i.status = 'IN_PROGRESS' " +
           "ORDER BY i.createdAt DESC")
    List<OrgOnboardingInstance> findInProgressByOrgId(@Param("orgId") String orgId);

    @Modifying
    @Query("DELETE FROM OrgOnboardingInstance i WHERE i.member.id = :memberId")
    void deleteByMemberId(@Param("memberId") String memberId);
}
