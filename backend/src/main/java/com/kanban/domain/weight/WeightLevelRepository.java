package com.kanban.domain.weight;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface WeightLevelRepository extends JpaRepository<WeightLevel, String> {

    List<WeightLevel> findByBoardIdOrderByPositionAsc(String boardId);

    Optional<WeightLevel> findByBoardIdAndIsDefaultTrue(String boardId);

    @Query("SELECT MAX(wl.position) FROM WeightLevel wl WHERE wl.board.id = :boardId")
    Integer findMaxPositionByBoardId(@Param("boardId") String boardId);

    int countByBoardId(String boardId);

    void deleteByBoardId(String boardId);
}
