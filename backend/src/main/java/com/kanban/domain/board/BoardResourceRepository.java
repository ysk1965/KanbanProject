package com.kanban.domain.board;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BoardResourceRepository extends JpaRepository<BoardResource, String> {

    List<BoardResource> findByBoardIdOrderByDisplayOrderAsc(String boardId);

    long countByBoardId(String boardId);

    @Modifying
    @Query("DELETE FROM BoardResource r WHERE r.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
