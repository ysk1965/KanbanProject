package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import com.kanban.domain.milestone.Milestone;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 마일스톤별 JIRA 스코프 — "이 마일스톤의 JIRA 뷰가 무엇을 비추는가"를 JQL로 좁힌다.
 *
 * <p>연결(자격증명·사이트·웹훅)은 {@link JiraIntegrationConfig}(보드 1개)에 그대로 두고,
 * 조회 범위만 마일스톤 단위로 내린 2계층 구조다. 스코프가 없는 마일스톤은 지금까지처럼
 * 보드 전체를 본다 — 이 테이블이 비어 있으면 기존 동작과 100% 같다(하위 호환).
 *
 * <p>이슈의 소속은 {@code jira_issue_links.scope_id}가 담는다. 동기화 때마다 스코프 JQL로
 * 이슈 키를 조회해 소속을 갱신(claim)하며, 두 스코프의 JQL이 겹치면 먼저 가져간 쪽이 유지된다.
 *
 * <p>JiraIntegrationConfig 규약을 따른다: BaseTimeEntity 미사용, 타임스탬프 수동(UTC),
 * Lombok 4종, 세터 없이 도메인 메서드로만 변경.
 */
@Entity
@Table(name = "jira_milestone_scopes", indexes = {
    @Index(name = "idx_jira_scope_board", columnList = "board_id"),
    @Index(name = "uq_jira_scope_milestone", columnList = "milestone_id", unique = true)
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraMilestoneScope {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id", nullable = false, unique = true)
    private Milestone milestone;

    /**
     * 이 마일스톤이 비출 이슈를 좁히는 JQL. null이면 {@code project = projectKey} 전체.
     * (P1에선 필수였으나 P2에서 프로젝트 스코프가 생기며 선택이 됐다)
     */
    @Column(name = "jql", length = 1000)
    private String jql;

    /**
     * 이 스코프가 비출 JIRA 프로젝트 키. null = 보드 연결의 기본 프로젝트(JQL만 좁히는 스코프).
     * non-null이면 스코프 전용 미러 컬럼·import 경로를 탄다 — 보드와 다른 프로젝트를 통째로 붙이는 경우.
     */
    @Column(name = "project_key", length = 50)
    private String projectKey;

    /** 스코프 전용 미러 대상 JIRA Agile 보드 id. null이면 자동 선택(첫 kanban 보드). */
    @Column(name = "agile_board_id", length = 30)
    private String agileBoardId;

    /**
     * 스코프 전용 미러 컬럼 정의(JSON) — {@link JiraIntegrationConfig#getMirrorColumnsJson()}과 같은 형태.
     * projectKey가 있는 스코프만 갖는다. 여기 담긴 block_id들이 "이 스코프 소유 블록"의 원장이다 —
     * 보드 미러 재셋업이 이 블록들을 지우지 않는 근거.
     */
    @Column(name = "mirror_columns_json", columnDefinition = "TEXT")
    private String mirrorColumnsJson;

    /**
     * 완료 역동기화 대상 상태 id — 이 스코프 소속 이슈에 우선 적용. null이면 보드 기본
     * ({@link JiraIntegrationConfig#getWriteBackTargetStatusId()})으로 폴백.
     * 프로젝트가 다르면 상태 id 체계도 달라 보드 기본을 그대로 쓸 수 없어서 존재한다.
     */
    @Column(name = "write_back_target_status_id", length = 30)
    private String writeBackTargetStatusId;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private Boolean active = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /** 마지막 claim(소속 갱신) 시각 — 화면이 "언제 기준의 스코프인지" 말할 수 있게. */
    @Column(name = "last_claimed_at")
    private LocalDateTime lastClaimedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.createdAt == null) this.createdAt = now;
        if (this.updatedAt == null) this.updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    // ── 도메인 메서드 ──────────────────────────────

    public void updateJql(String jql) {
        this.jql = jql;
        this.active = true;
    }

    /** 스코프 대상 갱신 — 프로젝트가 바뀌면 기존 미러 컬럼은 호출 측이 재셋업한다. */
    public void updateTarget(String jql, String projectKey, String agileBoardId, String writeBackTargetStatusId) {
        this.jql = (jql == null || jql.isBlank()) ? null : jql.trim();
        this.projectKey = (projectKey == null || projectKey.isBlank()) ? null : projectKey.trim();
        this.agileBoardId = (agileBoardId == null || agileBoardId.isBlank()) ? null : agileBoardId.trim();
        this.writeBackTargetStatusId =
            (writeBackTargetStatusId == null || writeBackTargetStatusId.isBlank()) ? null : writeBackTargetStatusId;
        this.active = true;
    }

    public void updateMirrorColumns(String mirrorColumnsJson) {
        this.mirrorColumnsJson = mirrorColumnsJson;
    }

    /** 이 스코프가 보드와 다른 프로젝트를 통째로 비추는가(전용 미러·전용 import 경로). */
    public boolean hasOwnProject() {
        return this.projectKey != null && !this.projectKey.isBlank();
    }

    public void markClaimed() {
        this.lastClaimedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
