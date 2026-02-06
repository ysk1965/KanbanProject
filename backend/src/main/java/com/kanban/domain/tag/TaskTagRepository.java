package com.kanban.domain.tag;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TaskTagRepository extends JpaRepository<TaskTag, String> {

    @Modifying
    @Query("DELETE FROM TaskTag tt WHERE tt.task.id IN (SELECT t.id FROM Task t WHERE t.board.id = :boardId)")
    void deleteAllByBoardId(@Param("boardId") String boardId);

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

    // Fetch Join으로 N+1 방지
    @Query("SELECT tt FROM TaskTag tt " +
           "JOIN FETCH tt.task " +
           "JOIN FETCH tt.tag " +
           "WHERE tt.task.id IN :taskIds")
    List<TaskTag> findByTaskIdInWithFetch(@Param("taskIds") List<String> taskIds);

    @Query("SELECT tt FROM TaskTag tt " +
           "JOIN FETCH tt.tag " +
           "WHERE tt.task.id = :taskId")
    List<TaskTag> findByTaskIdWithFetch(@Param("taskId") String taskId);

    @Modifying
    @Query("DELETE FROM TaskTag tt WHERE tt.task.id IN " +
           "(SELECT t.id FROM Task t WHERE t.feature.id = :featureId)")
    void deleteByFeatureId(@Param("featureId") String featureId);
}
