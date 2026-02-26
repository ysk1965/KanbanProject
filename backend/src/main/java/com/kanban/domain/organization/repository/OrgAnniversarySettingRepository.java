package com.kanban.domain.organization.repository;

import com.kanban.domain.organization.OrgAnniversarySetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OrgAnniversarySettingRepository extends JpaRepository<OrgAnniversarySetting, String> {
    Optional<OrgAnniversarySetting> findByOrganizationId(String organizationId);
}
