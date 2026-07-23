package com.kanban.domain.integration.github;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GithubInstallationRepository extends JpaRepository<GithubInstallation, String> {

    Optional<GithubInstallation> findByBoardIdAndActiveTrue(String boardId);

    Optional<GithubInstallation> findByOrganizationIdAndActiveTrue(String organizationId);

    Optional<GithubInstallation> findByInstallationIdAndBoardId(String installationId, String boardId);

    Optional<GithubInstallation> findByInstallationIdAndOrganizationId(String installationId,
                                                                      String organizationId);

    List<GithubInstallation> findByOrganizationId(String organizationId);
}
