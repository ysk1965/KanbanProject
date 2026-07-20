package com.kanban.domain.integration.jira;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JiraIntegrationConfigRepository extends JpaRepository<JiraIntegrationConfig, String> {

    Optional<JiraIntegrationConfig> findByBoardId(String boardId);

    @Query("SELECT c FROM JiraIntegrationConfig c WHERE c.board.id = :boardId AND c.active = true")
    Optional<JiraIntegrationConfig> findActiveByBoardId(@Param("boardId") String boardId);

    boolean existsByBoardId(String boardId);

    /** 완료 역동기화 스케줄러용 — write-back 활성 config 목록. */
    @Query("SELECT c FROM JiraIntegrationConfig c WHERE c.active = true AND c.writeBackEnabled = true")
    List<JiraIntegrationConfig> findAllActiveWithWriteBack();

    /**
     * pull 폴링 스케줄러용 — status 변화를 pull할 수 있는 활성 config 목록.
     * MANUAL: blockStatusMapJson 매핑이 설정된 보드.
     * MIRROR: 미러 컬럼(mirrorColumnsJson)이 설정된 보드 — 웹훅 미설정 시 백업 폴링 대상.
     */
    @Query("""
        SELECT c FROM JiraIntegrationConfig c
        WHERE c.active = true
          AND (c.blockStatusMapJson IS NOT NULL
               OR (c.syncMode = com.kanban.domain.integration.jira.JiraSyncMode.MIRROR
                   AND c.mirrorColumnsJson IS NOT NULL))
        """)
    List<JiraIntegrationConfig> findAllActivePollable();

    @Modifying
    @Query("DELETE FROM JiraIntegrationConfig c WHERE c.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
