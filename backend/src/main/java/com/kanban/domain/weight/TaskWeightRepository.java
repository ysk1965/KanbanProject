package com.kanban.domain.weight;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TaskWeightRepository extends JpaRepository<TaskWeight, String> {

    @Modifying
    @Query("DELETE FROM TaskWeight tw WHERE tw.task.id IN (SELECT t.id FROM Task t WHERE t.board.id = :boardId)")
    void deleteAllByBoardId(@Param("boardId") String boardId);

    Optional<TaskWeight> findByTaskId(String taskId);

    List<TaskWeight> findByWeightLevelId(String weightLevelId);

    @Query("SELECT tw FROM TaskWeight tw WHERE tw.task.board.id = :boardId")
    List<TaskWeight> findByBoardId(@Param("boardId") String boardId);

    void deleteByTaskId(String taskId);

    void deleteByWeightLevelId(String weightLevelId);

    // native: JPQL 서브쿼리는 Task의 @SQLRestriction 때문에 soft-deleted 태스크의
    // 가중치를 못 지워 하드 삭제 시 FK 위반이 났다
    @Modifying
    @Query(value = "DELETE FROM task_weights WHERE task_id IN " +
           "(SELECT id FROM tasks WHERE feature_id = :featureId)", nativeQuery = true)
    void deleteByFeatureId(@Param("featureId") String featureId);
}
