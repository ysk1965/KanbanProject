package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.Organization;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrganizationRepository extends JpaRepository<Organization, String> {

    @Query("SELECT o FROM Organization o LEFT JOIN FETCH o.subscription WHERE o.id = :id AND o.deletedAt IS NULL")
    Optional<Organization> findActiveById(@Param("id") String id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Organization o WHERE o.id = :id AND o.deletedAt IS NULL")
    Optional<Organization> findActiveByIdWithLock(@Param("id") String id);

    @Query("SELECT o FROM Organization o WHERE o.owner.id = :ownerId AND o.deletedAt IS NULL")
    List<Organization> findByOwnerId(@Param("ownerId") String ownerId);

    @Query("SELECT CASE WHEN COUNT(o) > 0 THEN true ELSE false END FROM Organization o WHERE o.owner.id = :ownerId AND o.deletedAt IS NULL")
    boolean existsByOwnerIdAndDeletedAtIsNull(@Param("ownerId") String ownerId);

    @Query("SELECT DISTINCT o FROM Organization o " +
           "JOIN OrganizationMember om ON om.organization.id = o.id " +
           "WHERE om.user.id = :userId AND o.deletedAt IS NULL")
    List<Organization> findByUserId(@Param("userId") String userId);

    @Query("SELECT COUNT(om) FROM OrganizationMember om WHERE om.organization.id = :orgId")
    int countMembersByOrgId(@Param("orgId") String orgId);

    @Query("SELECT o FROM Organization o WHERE o.name = :name AND o.deletedAt IS NULL")
    Optional<Organization> findActiveByName(@Param("name") String name);

    @Query("SELECT " +
           "(SELECT COUNT(om) FROM OrganizationMember om WHERE om.organization.id = :orgId), " +
           "(SELECT COUNT(b) FROM Board b WHERE b.organization.id = :orgId AND b.deletedAt IS NULL) " +
           "FROM Organization o WHERE o.id = :orgId AND o.deletedAt IS NULL")
    List<Object[]> countMemberAndBoardByOrgId(@Param("orgId") String orgId);

    // ==================== Admin ====================

    @Query(value = "SELECT o FROM Organization o " +
           "LEFT JOIN FETCH o.owner " +
           "LEFT JOIN FETCH o.subscription " +
           "WHERE (CAST(:search AS string) IS NULL OR LOWER(o.name) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) " +
           "OR LOWER(o.owner.email) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%'))) " +
           "AND o.deletedAt IS NULL",
           countQuery = "SELECT COUNT(o) FROM Organization o LEFT JOIN o.owner " +
           "WHERE (CAST(:search AS string) IS NULL OR LOWER(o.name) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) " +
           "OR LOWER(o.owner.email) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%'))) " +
           "AND o.deletedAt IS NULL")
    Page<Organization> findAllForAdmin(@Param("search") String search, Pageable pageable);

    @Query(value = "SELECT o FROM Organization o " +
           "LEFT JOIN FETCH o.owner " +
           "LEFT JOIN FETCH o.subscription " +
           "WHERE (CAST(:search AS string) IS NULL OR LOWER(o.name) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) " +
           "OR LOWER(o.owner.email) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%'))) " +
           "AND o.deletedAt IS NOT NULL",
           countQuery = "SELECT COUNT(o) FROM Organization o LEFT JOIN o.owner " +
           "WHERE (CAST(:search AS string) IS NULL OR LOWER(o.name) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')) " +
           "OR LOWER(o.owner.email) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%'))) " +
           "AND o.deletedAt IS NOT NULL")
    Page<Organization> findDeletedForAdmin(@Param("search") String search, Pageable pageable);

    @Query("SELECT o FROM Organization o " +
           "LEFT JOIN FETCH o.owner " +
           "LEFT JOIN FETCH o.subscription " +
           "WHERE o.id = :id")
    Optional<Organization> findByIdForAdmin(@Param("id") String id);

    @Query("SELECT COUNT(o) FROM Organization o WHERE o.deletedAt IS NULL")
    long countActive();

    @Query("SELECT COUNT(o) FROM Organization o " +
           "LEFT JOIN o.subscription s " +
           "WHERE o.deletedAt IS NULL AND s.plan = com.kanban.domain.subscription.OrgPlan.FREE")
    long countFreeOrgs();

    @Query("SELECT COUNT(o) FROM Organization o " +
           "LEFT JOIN o.subscription s " +
           "WHERE o.deletedAt IS NULL AND s.plan = com.kanban.domain.subscription.OrgPlan.TEAM")
    long countTeamOrgs();

    @Query("SELECT COUNT(o) FROM Organization o " +
           "LEFT JOIN o.subscription s " +
           "WHERE o.deletedAt IS NULL AND s.status = com.kanban.domain.subscription.SubscriptionStatus.TRIAL")
    long countTrialOrgs();

    @Query("SELECT COUNT(o) FROM Organization o " +
           "LEFT JOIN o.subscription s " +
           "WHERE o.deletedAt IS NULL AND s.status = com.kanban.domain.subscription.SubscriptionStatus.ACTIVE")
    long countActiveSubscriptions();

    @Query("SELECT o FROM Organization o WHERE o.photoShareToken = :token AND o.deletedAt IS NULL")
    Optional<Organization> findByPhotoShareToken(@Param("token") String token);
}
