package com.kanban.domain.integration.confluence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ConfluenceIntegrationConfigRepository
        extends JpaRepository<ConfluenceIntegrationConfig, String> {

    Optional<ConfluenceIntegrationConfig> findByBoardId(String boardId);

    Optional<ConfluenceIntegrationConfig> findByBoardIdAndActiveTrue(String boardId);

    Optional<ConfluenceIntegrationConfig> findByOrganizationIdAndActiveTrue(String organizationId);
}
