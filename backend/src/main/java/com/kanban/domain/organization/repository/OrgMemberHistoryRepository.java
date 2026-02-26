package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgMemberHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrgMemberHistoryRepository extends JpaRepository<OrgMemberHistory, String> {

    List<OrgMemberHistory> findByMemberIdOrderByEffectiveStartDateDesc(String memberId);

    List<OrgMemberHistory> findByMemberIdAndEffectiveEndDateIsNull(String memberId);

    Optional<OrgMemberHistory> findByIdAndOrganizationId(String id, String organizationId);
}
