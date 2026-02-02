package com.kanban.domain.tag;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TagRepository extends JpaRepository<Tag, String> {

    List<Tag> findByBoardId(String boardId);

    Optional<Tag> findByBoardIdAndName(String boardId, String name);

    boolean existsByBoardIdAndName(String boardId, String name);

    @Modifying
    @Query("DELETE FROM Tag t WHERE t.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
