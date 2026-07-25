package com.kanban.domain.integration.confluence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ConfluenceTreeSnapshotRepository extends JpaRepository<ConfluenceTreeSnapshot, String> {

    Optional<ConfluenceTreeSnapshot> findByBoardIdAndSpaceKeyAndParentPageId(
            String boardId, String spaceKey, String parentPageId);
}
