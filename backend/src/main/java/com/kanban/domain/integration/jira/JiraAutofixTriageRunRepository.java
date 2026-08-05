package com.kanban.domain.integration.jira;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JiraAutofixTriageRunRepository extends JpaRepository<JiraAutofixTriageRun, String> {

    @Query("SELECT r FROM JiraAutofixTriageRun r WHERE r.board.id = :boardId ORDER BY r.startedAt DESC")
    List<JiraAutofixTriageRun> findRecent(@Param("boardId") String boardId, PageRequest page);

    /** 화면이 보는 건 언제나 마지막 실행 하나다 — 끝난 것이면 그 결과가, 도는 것이면 진행률이 뜬다. */
    default Optional<JiraAutofixTriageRun> findLatest(String boardId) {
        return findRecent(boardId, PageRequest.of(0, 1)).stream().findFirst();
    }
}
