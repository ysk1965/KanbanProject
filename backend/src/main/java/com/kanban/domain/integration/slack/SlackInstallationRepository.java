package com.kanban.domain.integration.slack;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SlackInstallationRepository extends JpaRepository<SlackInstallation, String> {

    @Query("SELECT si FROM SlackInstallation si WHERE si.board.id = :boardId AND si.active = true")
    Optional<SlackInstallation> findActiveByBoardId(@Param("boardId") String boardId);

    @Query("SELECT si FROM SlackInstallation si WHERE si.organization.id = :orgId AND si.active = true")
    Optional<SlackInstallation> findActiveByOrganizationId(@Param("orgId") String orgId);

    @Query("SELECT si FROM SlackInstallation si WHERE si.slackTeamId = :teamId AND si.board.id = :boardId AND si.active = true")
    Optional<SlackInstallation> findActiveByTeamIdAndBoardId(@Param("teamId") String teamId, @Param("boardId") String boardId);

    @Query("SELECT si FROM SlackInstallation si WHERE si.slackTeamId = :teamId AND si.organization.id = :orgId AND si.active = true")
    Optional<SlackInstallation> findActiveByTeamIdAndOrgId(@Param("teamId") String teamId, @Param("orgId") String orgId);

    @Query("SELECT si FROM SlackInstallation si WHERE si.slackTeamId = :teamId AND si.active = true")
    List<SlackInstallation> findActiveByTeamId(@Param("teamId") String teamId);

    // active 여부와 무관하게 조회 — 재설치 시 기존 행을 제자리 갱신하기 위함
    // (uk_slack_install_team_board / _team_org 유니크 제약상 (team, entity)당 행은 최대 1개)
    @Query("SELECT si FROM SlackInstallation si WHERE si.slackTeamId = :teamId AND si.board.id = :boardId")
    Optional<SlackInstallation> findBySlackTeamIdAndBoardId(@Param("teamId") String teamId, @Param("boardId") String boardId);

    @Query("SELECT si FROM SlackInstallation si WHERE si.slackTeamId = :teamId AND si.organization.id = :orgId")
    Optional<SlackInstallation> findBySlackTeamIdAndOrgId(@Param("teamId") String teamId, @Param("orgId") String orgId);

    void deleteByBoardId(String boardId);
}
