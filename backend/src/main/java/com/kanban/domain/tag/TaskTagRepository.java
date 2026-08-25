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

    // native: JPQL 서브쿼리는 Task의 @SQLRestriction 때문에 soft-deleted 태스크의
    // 태그를 못 지워 하드 삭제 시 FK 위반이 났다
    @Modifying
    @Query(value = "DELETE FROM task_tags WHERE task_id IN " +
           "(SELECT id FROM tasks WHERE feature_id = :featureId)", nativeQuery = true)
    void deleteByFeatureId(@Param("featureId") String featureId);
}
