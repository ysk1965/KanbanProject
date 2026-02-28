package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgOneOnOne;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgOneOnOneRepository extends JpaRepository<OrgOneOnOne, String> {

    @Query("SELECT o FROM OrgOneOnOne o " +
           "JOIN FETCH o.memberA ma JOIN FETCH ma.user " +
           "JOIN FETCH o.memberB mb JOIN FETCH mb.user " +
           "WHERE o.organization.id = :orgId AND o.deletedAt IS NULL " +
           "ORDER BY o.createdAt DESC")
    List<OrgOneOnOne> findAllByOrgId(@Param("orgId") String orgId);

    @Query("SELECT o FROM OrgOneOnOne o " +
           "JOIN FETCH o.memberA ma JOIN FETCH ma.user " +
           "JOIN FETCH o.memberB mb JOIN FETCH mb.user " +
           "WHERE o.organization.id = :orgId AND o.deletedAt IS NULL " +
           "AND (ma.id = :memberId OR mb.id = :memberId) " +
           "ORDER BY o.createdAt DESC")
    List<OrgOneOnOne> findByOrgIdAndMemberId(@Param("orgId") String orgId, @Param("memberId") String memberId);

    @Query("SELECT o FROM OrgOneOnOne o " +
           "JOIN FETCH o.organization " +
           "JOIN FETCH o.memberA ma JOIN FETCH ma.user " +
           "JOIN FETCH o.memberB mb JOIN FETCH mb.user " +
           "WHERE o.id = :id AND o.deletedAt IS NULL")
    Optional<OrgOneOnOne> findByIdWithMembers(@Param("id") String id);

    @Query("SELECT CASE WHEN COUNT(o) > 0 THEN true ELSE false END FROM OrgOneOnOne o " +
           "WHERE o.organization.id = :orgId AND o.deletedAt IS NULL " +
           "AND o.memberA.id = :memberAId AND o.memberB.id = :memberBId")
    boolean existsByMembers(@Param("orgId") String orgId,
                            @Param("memberAId") String memberAId,
                            @Param("memberBId") String memberBId);

    @Query("SELECT o FROM OrgOneOnOne o " +
           "JOIN FETCH o.memberA ma JOIN FETCH ma.user " +
           "JOIN FETCH o.memberB mb JOIN FETCH mb.user " +
           "WHERE o.organization.id = :orgId AND o.deletedAt IS NULL " +
           "AND ((ma.user.id = :userAId AND mb.user.id = :userBId) OR (ma.user.id = :userBId AND mb.user.id = :userAId))")
    Optional<OrgOneOnOne> findByOrgIdAndUserIds(@Param("orgId") String orgId,
                                                  @Param("userAId") String userAId,
                                                  @Param("userBId") String userBId);
}
