package com.kanban.domain.checklist;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChecklistPresetRepository extends JpaRepository<ChecklistPreset, String> {

    /** 프리셋 + 항목 일괄 조회 (보드당 소수라 인라인 포함, N+1 방지) */
    @Query("SELECT DISTINCT p FROM ChecklistPreset p " +
           "LEFT JOIN FETCH p.items " +
           "WHERE p.board.id = :boardId " +
           "ORDER BY p.createdAt ASC")
    List<ChecklistPreset> findByBoardIdWithItems(@Param("boardId") String boardId);
}
