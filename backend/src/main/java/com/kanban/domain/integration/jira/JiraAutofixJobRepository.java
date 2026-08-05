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

    /**
     * 태스크 상세가 자기 항목들의 상태만 가져가는 경로. 전체 큐를 받아 화면에서 거르면
     * 카드 하나 열 때마다 큐 전체가 넘어온다.
     */
    @Query("SELECT j FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.taskId = :taskId "
        + "ORDER BY j.queuedAt DESC")
    List<JiraAutofixJob> findByBoardIdAndTaskId(@Param("boardId") String boardId,
                                                @Param("taskId") String taskId);

    /**
     * 러너에게 내줄 다음 한 건.
     *
     * <p>정렬을 명시적으로 못 박는다. {@code confidence DESC}만 두면 confidence가 없는 수동 작업의
     * 위치가 DB에 따라 갈린다 — Postgres는 DESC에서 NULL을 앞에, H2는 뒤에 놓기 때문에 dev와 local의
     * 큐 순서가 정반대가 된다. 수동이 앞이어야 하는 이유는 사람이 지금 그 결과를 기다리고 있어서다.
     */
    @Query("SELECT j FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.status = :status "
        + "ORDER BY CASE WHEN j.jobKind = com.kanban.domain.integration.jira.AutofixJobKind.MANUAL "
        + "THEN 0 ELSE 1 END ASC, "
        + "CASE WHEN j.confidence IS NULL THEN 1 ELSE 0 END ASC, j.confidence DESC, j.queuedAt ASC")
    List<JiraAutofixJob> findByBoardIdAndStatus(@Param("boardId") String boardId,
                                                @Param("status") AutofixJobStatus status,
                                                Pageable pageable);

    /** 러너가 물고 있는 작업 수. 0이 아니면 다음 건을 보내지 않는다(직렬 보장). */
    @Query("SELECT COUNT(j) FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.status = 'DISPATCHED'")
    long countInFlight(@Param("boardId") String boardId);

    /**
     * 이미 이 이슈로 작업을 만든 적이 있는지 — JIRA의 "이슈당 1회" 가드레일.
     * 취소된 건은 재시도 여지를 남긴다.
     */
    @Query("SELECT COUNT(j) > 0 FROM JiraAutofixJob j WHERE j.board.id = :boardId "
        + "AND j.jobKey = :key AND j.status <> 'CANCELLED'")
    boolean existsActiveForIssue(@Param("boardId") String boardId, @Param("key") String key);

    /**
     * 이 태스크가 지금 큐에 있거나 러너가 물고 있는지 — 수동 위임의 중복 차단.
     *
     * <p>JIRA와 달리 "1회"가 아니라 "동시에 하나"다. 실패한 작업의 지시문을 고쳐 다시 맡기는 것이
     * 수동 위임의 정상 흐름이라, 끝난 건까지 막으면 재시도 경로가 사라진다.
     */
    @Query("SELECT COUNT(j) > 0 FROM JiraAutofixJob j WHERE j.board.id = :boardId "
        + "AND j.taskId = :taskId AND j.checklistItemId IS NULL "
        + "AND j.status IN ('QUEUED', 'DISPATCHED')")
    boolean existsPendingForTask(@Param("boardId") String boardId, @Param("taskId") String taskId);

    /** 이 체크리스트 항목이 지금 큐에 있거나 러너가 물고 있는지. */
    @Query("SELECT COUNT(j) > 0 FROM JiraAutofixJob j WHERE j.board.id = :boardId "
        + "AND j.checklistItemId = :itemId AND j.status IN ('QUEUED', 'DISPATCHED')")
    boolean existsPendingForChecklistItem(@Param("boardId") String boardId,
                                          @Param("itemId") String itemId);

    @Query("SELECT COUNT(j) FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.status = 'QUEUED'")
    long countQueued(@Param("boardId") String boardId);

    /** 대기 중인 수동 작업 수 — 화면이 "대기 N건 (수동 M)"을 말할 수 있게. */
    @Query("SELECT COUNT(j) FROM JiraAutofixJob j WHERE j.board.id = :boardId "
        + "AND j.status = 'QUEUED' AND j.jobKind = com.kanban.domain.integration.jira.AutofixJobKind.MANUAL")
    long countQueuedManual(@Param("boardId") String boardId);

    /** 일일 상한 판정 — 실제로 러너를 부른 건수만 센다(큐에 담긴 것은 비용이 아니다). */
    @Query("SELECT COUNT(j) FROM JiraAutofixJob j WHERE j.board.id = :boardId "
        + "AND j.dispatchedAt IS NOT NULL AND j.dispatchedAt >= :since")
    long countDispatchedSince(@Param("boardId") String boardId, @Param("since") LocalDateTime since);

    /** 콜백이 오지 않은 채 방치된 작업 — 큐를 막고 있으므로 회수해야 한다. */
    @Query("SELECT j FROM JiraAutofixJob j WHERE j.status = 'DISPATCHED' AND j.dispatchedAt < :deadline")
    List<JiraAutofixJob> findStaleDispatched(@Param("deadline") LocalDateTime deadline);

    /** 콜백 매칭 폴백 — job id 없이 작업 키만으로 회신하는 수동 실행 경로가 있다. */
    @Query("SELECT j FROM JiraAutofixJob j WHERE j.board.id = :boardId AND j.jobKey = :key "
        + "AND j.status = 'DISPATCHED'")
    Optional<JiraAutofixJob> findDispatchedByJobKey(@Param("boardId") String boardId,
                                                    @Param("key") String key);

    @Modifying
    @Query("DELETE FROM JiraAutofixJob j WHERE j.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
