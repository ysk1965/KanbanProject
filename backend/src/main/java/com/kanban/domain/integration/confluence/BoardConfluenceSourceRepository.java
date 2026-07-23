package com.kanban.domain.integration.confluence;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BoardConfluenceSourceRepository extends JpaRepository<BoardConfluenceSource, String> {

    List<BoardConfluenceSource> findByBoardIdAndActiveTrue(String boardId);

    List<BoardConfluenceSource> findByBoardId(String boardId);

    Optional<BoardConfluenceSource> findByBoardIdAndSpaceKey(String boardId, String spaceKey);
}
