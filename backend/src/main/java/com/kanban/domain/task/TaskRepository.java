package com.kanban.domain.task;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TaskRepository extends JpaRepository<Task, String> {

    List<Task> findByBoardIdOrderByPositionAsc(String boardId);

    List<Task> findByFeatureIdOrderByPositionAsc(String featureId);

    List<Task> findByBlockIdOrderByPositionAsc(String blockId);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId AND t.assignee.id = :assigneeId ORDER BY t.position ASC")
    List<Task> findByBoardIdAndAssigneeId(@Param("boardId") String boardId, @Param("assigneeId") String assigneeId);

    @Query("SELECT t FROM Task t WHERE t.board.id = :boardId AND t.isCompleted = :isCompleted ORDER BY t.position ASC")
    List<Task> findByBoardIdAndIsCompleted(@Param("boardId") String boardId, @Param("isCompleted") Boolean isCompleted);

    @Query("SELECT MAX(t.position) FROM Task t WHERE t.block.id = :blockId")
    Integer findMaxPositionByBlockId(@Param("blockId") String blockId);

    int countByFeatureId(String featureId);

    int countByFeatureIdAndIsCompletedTrue(String featureId);

    int countByBoardId(String boardId);
}
