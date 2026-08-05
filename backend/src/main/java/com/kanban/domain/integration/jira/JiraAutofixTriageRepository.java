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

    /**
     * 유형 × 실제 결과 집계 — [category, jobStatus, count].
     *
     * <p>판정이 맞았는지는 판정 자체로는 알 수 없고 그 뒤에 벌어진 일로만 알 수 있다. 이슈키로
     * 작업과 이어 붙여, 어떤 유형이 실제로 PR까지 갔고 어떤 유형이 헛돌았는지를 센다.
     *
     * <p>종료된 작업만 센다 — 아직 도는 건은 결과가 아니다.
     *
     * <p>작업 쪽 식별자는 {@code jobKey}다 — 큐가 JIRA 전용이 아니게 되면서 이름이 바뀌었다.
     * {@code jobKind = JIRA}로 좁히는 이유: 사람이 맡긴 작업은 트리아지 판정을 거치지 않으므로
     * 이 집계의 분모에 들어가면 안 된다. 키 접두사가 달라 실제로 이어 붙지는 않지만,
     * 조건으로 못 박아 두지 않으면 나중에 키 규칙이 바뀔 때 조용히 섞인다.
     */
    @Query("SELECT t.category, j.status, COUNT(j) FROM JiraAutofixTriage t, JiraAutofixJob j "
        + "WHERE t.board.id = :boardId AND j.board.id = :boardId "
        + "AND t.jiraIssueKey = j.jobKey "
        + "AND j.jobKind = com.kanban.domain.integration.jira.AutofixJobKind.JIRA "
        + "AND j.status IN ('SUCCEEDED', 'NO_CHANGE', 'FAILED') "
        + "GROUP BY t.category, j.status")
    List<Object[]> countOutcomesByCategory(@Param("boardId") String boardId);

    @Modifying
    @Query("DELETE FROM JiraAutofixTriage t WHERE t.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
