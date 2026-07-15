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

    /** pull 폴링 스케줄러용 — 블록↔status 매핑이 설정된 활성 config 목록. */
    @Query("SELECT c FROM JiraIntegrationConfig c WHERE c.active = true AND c.blockStatusMapJson IS NOT NULL")
    List<JiraIntegrationConfig> findAllActiveWithBlockStatusMap();

    @Modifying
    @Query("DELETE FROM JiraIntegrationConfig c WHERE c.board.id = :boardId")
    void deleteByBoardId(@Param("boardId") String boardId);
}
