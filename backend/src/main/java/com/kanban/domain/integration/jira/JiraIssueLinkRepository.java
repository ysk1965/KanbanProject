package com.kanban.domain.integration.jira;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JiraIssueLinkRepository extends JpaRepository<JiraIssueLink, String> {

    @Query("SELECT l FROM JiraIssueLink l WHERE l.board.id = :boardId AND l.jiraIssueKey = :key")
    Optional<JiraIssueLink> findByBoardIdAndJiraIssueKey(@Param("boardId") String boardId, @Param("key") String key);

    @Query("SELECT l FROM JiraIssueLink l WHERE l.board.id = :boardId")
    List<JiraIssueLink> findByBoardId(@Param("boardId") String boardId);

    @Query("SELECT l FROM JiraIssueLink l WHERE l.board.id = :boardId AND l.jiraIssueKey IN :keys")
    List<JiraIssueLink> findByBoardIdAndJiraIssueKeyIn(@Param("boardId") String boardId, @Param("keys") List<String> keys);

    /** 완료 역동기화 역참조 — 완료된 BRIDGE Task id로 원본 이슈 링크 조회. */
    Optional<JiraIssueLink> findByTargetTypeAndTargetId(JiraLinkTargetType targetType, String targetId);

    /** 완료 역동기화 후보 — 아직 JIRA로 넘기지 않은 Task 링크. */
    @Query("SELECT l FROM JiraIssueLink l WHERE l.board.id = :boardId AND l.targetType = :type AND l.writeBackDoneAt IS NULL")
    List<JiraIssueLink> findWriteBackCandidates(@Param("boardId") String boardId, @Param("type") JiraLinkTargetType type);

    @Modifying
    @Query("DELETE FROM JiraIssueLink l WHERE l.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
