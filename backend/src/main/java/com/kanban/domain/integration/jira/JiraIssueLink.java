package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * "이미 가져온 이슈" 원장 — JIRA 이슈키 ↔ BRIDGE 엔티티 1:1 매핑.
 *
 * (board_id, jira_issue_key) UNIQUE 로 재가져오기 중복 방지,
 * jiraUpdatedAt 으로 증분 갱신 판정, writeBackDoneAt 으로 완료 역동기화 멱등.
 */
@Entity
@Table(name = "jira_issue_links", indexes = {
    @Index(name = "idx_jira_link_board", columnList = "board_id"),
    @Index(name = "idx_jira_link_target", columnList = "target_type, target_id"),
    @Index(name = "uq_jira_link_board_key", columnList = "board_id, jira_issue_key", unique = true)
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraIssueLink {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "jira_issue_key", nullable = false, length = 50)
    private String jiraIssueKey;

    @Column(name = "jira_issue_id", length = 30)
    private String jiraIssueId;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 20)
    private JiraLinkTargetType targetType;

    /** 생성된 BRIDGE 엔티티 id (Feature/Task/ChecklistItem). */
    @Column(name = "target_id", nullable = false, length = 36)
    private String targetId;

    /** JIRA fields.updated 값 — 증분 판정 기준. */
    @Column(name = "jira_updated_at")
    private LocalDateTime jiraUpdatedAt;

    @Column(name = "last_imported_at", nullable = false)
    private LocalDateTime lastImportedAt;

    /** 완료 역동기화 완료 시각 — non-null 이면 이미 JIRA로 넘긴 것(멱등). */
    @Column(name = "write_back_done_at")
    private LocalDateTime writeBackDoneAt;

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
        if (this.lastImportedAt == null) this.lastImportedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    // ── 도메인 메서드 ──────────────────────────────

    /** 재가져오기 시 대상/타임스탬프 갱신. */
    public void touchImport(JiraLinkTargetType targetType, String targetId, LocalDateTime jiraUpdatedAt) {
        this.targetType = targetType;
        this.targetId = targetId;
        this.jiraUpdatedAt = jiraUpdatedAt;
        this.lastImportedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void markWriteBackDone() {
        this.writeBackDoneAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /** JIRA가 BRIDGE 원장보다 최신인지 — 증분 갱신 판정. */
    public boolean isStaleAgainst(LocalDateTime incomingJiraUpdatedAt) {
        if (incomingJiraUpdatedAt == null) return false;
        if (this.jiraUpdatedAt == null) return true;
        return incomingJiraUpdatedAt.isAfter(this.jiraUpdatedAt);
    }
}
