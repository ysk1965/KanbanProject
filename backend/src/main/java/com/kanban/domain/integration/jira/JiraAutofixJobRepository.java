package com.kanban.domain.integration.jira;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

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

    /** 콜백 매칭 — 러너는 이슈키만 알고 job id는 모른다. */
    @Query("SELECT j FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.jiraIssueKey = :key "
        + "AND j.status = 'DISPATCHED'")
    Optional<JiraAutofixJob> findDispatchedByIssueKey(@Param("boardId") String boardId,
                                                      @Param("key") String key);

    /** 큐가 남아 있는 보드 — 스케줄러가 매번 전 보드를 훑지 않도록. */
    @Query("SELECT DISTINCT j.board.id FROM JiraAutofixJob j WHERE j.status = 'QUEUED'")
    List<String> findBoardIdsWithQueuedJobs();

    @Modifying
    @Query("DELETE FROM JiraAutofixJob j WHERE j.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
