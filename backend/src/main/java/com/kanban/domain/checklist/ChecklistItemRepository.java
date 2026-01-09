package com.kanban.domain.checklist;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChecklistItemRepository extends JpaRepository<ChecklistItem, String> {

    List<ChecklistItem> findByTaskIdOrderByPositionAsc(String taskId);

    @Query("SELECT MAX(c.position) FROM ChecklistItem c WHERE c.task.id = :taskId")
    Integer findMaxPositionByTaskId(@Param("taskId") String taskId);

    int countByTaskId(String taskId);

    int countByTaskIdAndIsCompletedTrue(String taskId);

    void deleteByTaskId(String taskId);
}
