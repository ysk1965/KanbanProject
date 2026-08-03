package com.kanban.domain.integration.jira;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JiraCommentLinkRepository extends JpaRepository<JiraCommentLink, String> {

    /** 아웃바운드 — BRIDGE 댓글이 이미 JIRA로 나갔는지(=에코인지) 판정. */
    Optional<JiraCommentLink> findByCommentId(String commentId);

    /** 인바운드 — JIRA 코멘트가 이미 BRIDGE에 들어왔는지(=에코인지) 판정. */
    @Query("SELECT l FROM JiraCommentLink l WHERE l.board.id = :boardId AND l.jiraCommentId = :jiraCommentId")
    Optional<JiraCommentLink> findByBoardIdAndJiraCommentId(@Param("boardId") String boardId,
                                                            @Param("jiraCommentId") String jiraCommentId);

    /** 재조정(폴링 백업) — 한 카드의 모든 매핑. */
    @Query("SELECT l FROM JiraCommentLink l WHERE l.board.id = :boardId AND l.taskId = :taskId")
    List<JiraCommentLink> findByBoardIdAndTaskId(@Param("boardId") String boardId, @Param("taskId") String taskId);

    @Modifying
    @Query("DELETE FROM JiraCommentLink l WHERE l.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
