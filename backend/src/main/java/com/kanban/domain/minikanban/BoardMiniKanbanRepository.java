package com.kanban.domain.minikanban;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BoardMiniKanbanRepository extends JpaRepository<BoardMiniKanban, String> {

    Optional<BoardMiniKanban> findByBoardId(String boardId);
}
