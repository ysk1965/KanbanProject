package com.kanban.domain.integration.jira;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface JiraAutofixJobRepository extends JpaRepository<JiraAutofixJob, String> {

    @Query("SELECT j FROM JiraAutofixJob j WHERE j.board.id = :boardId ORDER BY j.queuedAt DESC")
    List<JiraAutofixJob> findByBoardId(@Param("boardId") String boardId, Pageable pageable);

    @Query("SELECT j FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.status = :status "
        + "ORDER BY j.confidence DESC, j.queuedAt ASC")
    List<JiraAutofixJob> findByBoardIdAndStatus(@Param("boardId") String boardId,
                                                @Param("status") AutofixJobStatus status,
                                                Pageable pageable);

    /** 러너가 물고 있는 작업 수. 0이 아니면 다음 건을 보내지 않는다(직렬 보장). */
    @Query("SELECT COUNT(j) FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.status = 'DISPATCHED'")
    long countInFlight(@Param("boardId") String boardId);

    /**
     * 이미 이 이슈로 작업을 만든 적이 있는지 — "이슈당 1회" 가드레일.
     * 취소된 건은 재시도 여지를 남긴다.
     */
    @Query("SELECT COUNT(j) > 0 FROM JiraAutofixJob j WHERE j.board.id = :boardId "
        + "AND j.jiraIssueKey = :key AND j.status <> 'CANCELLED'")
    boolean existsActiveForIssue(@Param("boardId") String boardId, @Param("key") String key);

    @Query("SELECT COUNT(j) FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.status = 'QUEUED'")
    long countQueued(@Param("boardId") String boardId);

    /** 일일 상한 판정 — 실제로 러너를 부른 건수만 센다(큐에 담긴 것은 비용이 아니다). */
    @Query("SELECT COUNT(j) FROM JiraAutofixJob j WHERE j.board.id = :boardId "
        + "AND j.dispatchedAt IS NOT NULL AND j.dispatchedAt >= :since")
    long countDispatchedSince(@Param("boardId") String boardId, @Param("since") LocalDateTime since);

    /** 콜백이 오지 않은 채 방치된 작업 — 큐를 막고 있으므로 회수해야 한다. */
    @Query("SELECT j FROM JiraAutofixJob j WHERE j.status = 'DISPATCHED' AND j.dispatchedAt < :deadline")
    List<JiraAutofixJob> findStaleDispatched(@Param("deadline") LocalDateTime deadline);

    /**
     * 콜백 매칭 폴백 — job id 없이 이슈키만으로 회신하는 수동 실행 경로가 있다.
     *
     * <p>{@code TIMED_OUT}까지 받는 이유: 러너가 회신에 실패하면 스풀에 쌓아 두었다가 나중에
     * 다시 보내는데, 그 사이 서버가 먼저 회수했을 수 있다. 그 늦은 회신이야말로 잘못된
     * {@code TIMED_OUT}을 바로잡을 유일한 정보다.
     *
     * <p>이슈당 활성 작업은 하나뿐이므로({@code existsActiveForIssue} 가드) 두 건이 걸릴 일은
     * 없지만, 순서를 못 박아 두면 나중에 가드가 느슨해져도 최신 건이 잡힌다.
     */
    @Query("SELECT j FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.jiraIssueKey = :key "
        + "AND j.status IN ('DISPATCHED', 'TIMED_OUT') ORDER BY j.dispatchedAt DESC")
    List<JiraAutofixJob> findCallbackTargetsByIssueKey(@Param("boardId") String boardId,
                                                       @Param("key") String key);

    @Modifying
    @Query("DELETE FROM JiraAutofixJob j WHERE j.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
