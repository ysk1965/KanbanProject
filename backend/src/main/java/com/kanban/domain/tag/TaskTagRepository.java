package com.kanban.domain.tag;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TaskTagRepository extends JpaRepository<TaskTag, String> {

    List<TaskTag> findByTaskId(String taskId);

    @Query("SELECT tt.tag FROM TaskTag tt WHERE tt.task.id = :taskId")
    List<Tag> findTagsByTaskId(@Param("taskId") String taskId);

    boolean existsByTaskIdAndTagId(String taskId, String tagId);

    @Modifying
    void deleteByTaskIdAndTagId(String taskId, String tagId);

    @Modifying
    void deleteByTaskId(String taskId);

    @Modifying
    void deleteByTagId(String tagId);

    List<TaskTag> findByTaskIdIn(List<String> taskIds);
}
