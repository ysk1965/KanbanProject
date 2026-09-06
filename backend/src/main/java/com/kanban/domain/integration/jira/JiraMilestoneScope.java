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

    /** 이 마일스톤이 비출 이슈를 좁히는 JQL (연결된 프로젝트 안에서). */
    @Column(name = "jql", nullable = false, length = 1000)
    private String jql;

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

    public void markClaimed() {
        this.lastClaimedAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
