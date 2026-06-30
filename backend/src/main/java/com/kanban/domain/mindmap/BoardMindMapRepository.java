package com.kanban.domain.mindmap;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BoardMindMapRepository extends JpaRepository<BoardMindMap, String> {

    Optional<BoardMindMap> findByBoardId(String boardId);
}
