package com.kanban.domain.task;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface TaskDependencyRepository extends JpaRepository<TaskDependency, String> {

    @Query("SELECT td FROM TaskDependency td JOIN FETCH td.predecessor JOIN FETCH td.successor WHERE td.board.id = :boardId")
    List<TaskDependency> findByBoardIdWithFetch(@Param("boardId") String boardId);

    List<TaskDependency> findByPredecessorId(String predecessorId);
    List<TaskDependency> findBySuccessorId(String successorId);

    Optional<TaskDependency> findByPredecessorIdAndSuccessorId(String predecessorId, String successorId);

    void deleteByPredecessorIdOrSuccessorId(String predecessorId, String successorId);
    void deleteByBoardId(String boardId);
}
