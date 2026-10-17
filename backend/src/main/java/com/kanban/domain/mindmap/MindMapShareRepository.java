package com.kanban.domain.mindmap;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MindMapShareRepository extends JpaRepository<MindMapShare, String> {

    Optional<MindMapShare> findByBoardId(String boardId);

    Optional<MindMapShare> findByShareCode(String shareCode);
}
