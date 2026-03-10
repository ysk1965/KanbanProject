package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.AnniversaryType;
import com.kanban.domain.organization.OrgCelebrationMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public interface OrgCelebrationMessageRepository extends JpaRepository<OrgCelebrationMessage, String> {

    // Cursor pagination for messages
    @Query("SELECT m FROM OrgCelebrationMessage m WHERE m.targetMember.id = :memberId " +
           "AND m.anniversaryType = :type AND m.anniversaryDate = :date " +
           "ORDER BY m.createdAt DESC")
    List<OrgCelebrationMessage> findMessages(@Param("memberId") String memberId,
                                              @Param("type") AnniversaryType type,
                                              @Param("date") LocalDate date,
                                              Pageable pageable);

    @Query("SELECT m FROM OrgCelebrationMessage m WHERE m.targetMember.id = :memberId " +
           "AND m.anniversaryType = :type AND m.anniversaryDate = :date " +
           "AND m.createdAt < :cursor ORDER BY m.createdAt DESC")
    List<OrgCelebrationMessage> findMessagesWithCursor(@Param("memberId") String memberId,
                                                       @Param("type") AnniversaryType type,
                                                       @Param("date") LocalDate date,
                                                       @Param("cursor") LocalDateTime cursor,
                                                       Pageable pageable);

    // Check duplicate: same target + author + type + date
    boolean existsByTargetMemberIdAndAuthorIdAndAnniversaryTypeAndAnniversaryDate(
            String targetMemberId, String authorId, AnniversaryType type, LocalDate date);

    // Count messages for a specific celebration
    long countByTargetMemberIdAndAnniversaryTypeAndAnniversaryDate(
            String targetMemberId, AnniversaryType type, LocalDate date);

    // Find by org and date range (for upcoming widget)
    @Query("SELECT m FROM OrgCelebrationMessage m WHERE m.organization.id = :orgId " +
           "AND m.anniversaryDate BETWEEN :startDate AND :endDate")
    List<OrgCelebrationMessage> findByOrgAndDateRange(@Param("orgId") String orgId,
                                                       @Param("startDate") LocalDate startDate,
                                                       @Param("endDate") LocalDate endDate);

    @Modifying
    @Query("DELETE FROM OrgCelebrationMessage m WHERE m.targetMember.id = :memberId")
    void deleteByTargetMemberId(@Param("memberId") String memberId);
}
