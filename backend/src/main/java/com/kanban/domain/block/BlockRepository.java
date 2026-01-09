package com.kanban.domain.block;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BlockRepository extends JpaRepository<Block, String> {

    List<Block> findByBoardIdOrderByPositionAsc(String boardId);

    @Query("SELECT b FROM Block b WHERE b.board.id = :boardId AND b.fixedType = :fixedType")
    Optional<Block> findByBoardIdAndFixedType(@Param("boardId") String boardId, @Param("fixedType") FixedBlockType fixedType);

    @Query("SELECT MAX(b.position) FROM Block b WHERE b.board.id = :boardId")
    Integer findMaxPositionByBoardId(@Param("boardId") String boardId);

    @Query("SELECT b FROM Block b WHERE b.board.id = :boardId AND b.type = 'CUSTOM' ORDER BY b.position ASC")
    List<Block> findCustomBlocksByBoardId(@Param("boardId") String boardId);

    int countByBoardId(String boardId);
}
