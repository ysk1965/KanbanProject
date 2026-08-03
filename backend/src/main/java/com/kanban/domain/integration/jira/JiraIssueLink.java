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

    /** 직전 pull 시점의 JIRA status id — 반려("검토중→개발블록") 전환 감지용(Phase 4 옵션 B). */
    @Column(name = "last_jira_status_id", length = 30)
    private String lastJiraStatusId;

    @Column(name = "last_imported_at", nullable = false)
    private LocalDateTime lastImportedAt;

    /** 완료 역동기화 완료 시각 — non-null 이면 이미 JIRA로 넘긴 것(멱등). */
    @Column(name = "write_back_done_at")
    private LocalDateTime writeBackDoneAt;

    /**
     * JIRA 원본 이슈가 삭제된 시각(soft-unlink). non-null이면 연동이 끊긴 상태로,
     * pull/push/write-back 대상에서 제외되고 카드에 "JIRA 삭제됨" 뱃지가 붙는다.
     * 행을 지우지 않는 이유: 이슈키를 남겨 어떤 이슈였는지 보여주고, 폴링이 매번
     * 같은 키를 신규로 재생성하는 것을 막기 위함.
     */
    @Column(name = "jira_deleted_at")
    private LocalDateTime jiraDeletedAt;

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

    /** 직전 JIRA status 기록(반려 전환 감지용). pull 반영 후 호출. */
    public void markJiraStatus(String statusId) {
        this.lastJiraStatusId = statusId;
    }

    /** JIRA 원본이 삭제됨 — 연동 해제 표시(멱등). */
    public void markJiraDeleted() {
        if (this.jiraDeletedAt == null) {
            this.jiraDeletedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    /** 같은 키의 이슈가 JIRA에 다시 나타남(복구/재생성) — 삭제 표시 해제. */
    public void clearJiraDeleted() {
        this.jiraDeletedAt = null;
    }

    public boolean isJiraDeleted() {
        return this.jiraDeletedAt != null;
    }

    /** JIRA가 BRIDGE 원장보다 최신인지 — 증분 갱신 판정. */
    public boolean isStaleAgainst(LocalDateTime incomingJiraUpdatedAt) {
        if (incomingJiraUpdatedAt == null) return false;
        if (this.jiraUpdatedAt == null) return true;
        return incomingJiraUpdatedAt.isAfter(this.jiraUpdatedAt);
    }
}
