package com.kanban.domain.comment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CommentRepository extends JpaRepository<Comment, String> {

    @Query("SELECT c FROM Comment c " +
           "JOIN FETCH c.author " +
           "WHERE c.task.id = :taskId " +
           "ORDER BY c.createdAt ASC")
    List<Comment> findByTaskIdWithAuthor(@Param("taskId") String taskId);

    int countByTaskId(String taskId);

    void deleteByTaskId(String taskId);
}
