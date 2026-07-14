package com.kanban.domain.integration.jira;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JiraUserMappingRepository extends JpaRepository<JiraUserMapping, String> {

    @Query("SELECT m FROM JiraUserMapping m WHERE m.board.id = :boardId AND m.jiraAccountId = :accountId")
    Optional<JiraUserMapping> findByBoardIdAndJiraAccountId(@Param("boardId") String boardId, @Param("accountId") String accountId);

    @Query("SELECT m FROM JiraUserMapping m WHERE m.board.id = :boardId")
    List<JiraUserMapping> findByBoardId(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM JiraUserMapping m WHERE m.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
