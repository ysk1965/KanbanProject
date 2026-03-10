package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgMemberHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrgMemberHistoryRepository extends JpaRepository<OrgMemberHistory, String> {

    List<OrgMemberHistory> findByMemberIdOrderByEffectiveStartDateDesc(String memberId);

    List<OrgMemberHistory> findByMemberIdAndEffectiveEndDateIsNull(String memberId);

    Optional<OrgMemberHistory> findByIdAndOrganizationId(String id, String organizationId);

    @Modifying
    @Query("DELETE FROM OrgMemberHistory h WHERE h.member.id = :memberId")
    void deleteByMemberId(@Param("memberId") String memberId);
}
