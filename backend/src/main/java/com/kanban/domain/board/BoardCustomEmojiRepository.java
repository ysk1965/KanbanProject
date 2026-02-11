package com.kanban.domain.board;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BoardCustomEmojiRepository extends JpaRepository<BoardCustomEmoji, String> {

    List<BoardCustomEmoji> findByBoardIdOrderByCreatedAtAsc(String boardId);

    @Modifying
    @Query("DELETE FROM BoardCustomEmoji e WHERE e.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
