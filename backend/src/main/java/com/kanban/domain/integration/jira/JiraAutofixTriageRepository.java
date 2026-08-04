package com.kanban.domain.integration.jira;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface JiraAutofixTriageRepository extends JpaRepository<JiraAutofixTriage, String> {

    @Query("SELECT t FROM JiraAutofixTriage t WHERE t.board.id = :boardId")
    List<JiraAutofixTriage> findByBoardId(@Param("boardId") String boardId);

    /** 판정별 조회 — 큐 투입 후보 뽑기. confidence 내림차순이 곧 큐 우선순위다. */
    @Query("SELECT t FROM JiraAutofixTriage t WHERE t.board.id = :boardId AND t.verdict = :verdict "
        + "ORDER BY t.confidence DESC")
    List<JiraAutofixTriage> findByBoardIdAndVerdict(@Param("boardId") String boardId,
                                                    @Param("verdict") AutofixVerdict verdict);

    @Query("SELECT t FROM JiraAutofixTriage t WHERE t.board.id = :boardId AND t.jiraIssueKey = :key")
    java.util.Optional<JiraAutofixTriage> findByBoardIdAndJiraIssueKey(@Param("boardId") String boardId,
                                                                      @Param("key") String key);

    /** 판정 × 유형 집계 — [verdict, category, count]. 건수부터 세는 게 Step 1의 목적. */
    @Query("SELECT t.verdict, t.category, COUNT(t) FROM JiraAutofixTriage t "
        + "WHERE t.board.id = :boardId GROUP BY t.verdict, t.category")
    List<Object[]> countByVerdictAndCategory(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM JiraAutofixTriage t WHERE t.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
