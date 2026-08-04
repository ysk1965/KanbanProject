package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 자동수정 작업 큐 — 이슈 1건당 1행.
 *
 * <p>디스패치 대상(저장소·워크플로·브랜치)을 큐에 담는 시점에 <b>스냅샷</b>한다. 보드의 저장소 연결이
 * 나중에 바뀌어도 이미 큐에 있는 작업이 엉뚱한 저장소로 날아가지 않게 하기 위함이다.
 */
@Entity
@Table(name = "jira_autofix_jobs", indexes = {
    @Index(name = "idx_jira_autofix_job_board", columnList = "board_id"),
    @Index(name = "idx_jira_autofix_job_status", columnList = "board_id, status"),
    @Index(name = "idx_jira_autofix_job_key", columnList = "board_id, jira_issue_key")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraAutofixJob {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "jira_issue_key", nullable = false, length = 50)
    private String jiraIssueKey;

    @Column(name = "task_id", length = 36)
    private String taskId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private AutofixJobStatus status = AutofixJobStatus.QUEUED;

    /** 트리아지 confidence 스냅샷 — 큐 우선순위. */
    @Column(name = "confidence")
    private Double confidence;

    // ── 디스패치 대상 스냅샷 ──

    @Column(name = "installation_id", length = 40)
    private String installationId;

    @Column(name = "repo_full_name", length = 200)
    private String repoFullName;

    @Column(name = "workflow_file", length = 100)
    private String workflowFile;

    @Column(name = "base_ref", length = 200)
    private String baseRef;

    // ── 결과 ──

    @Column(name = "pr_url", length = 500)
    private String prUrl;

    @Column(name = "run_url", length = 500)
    private String runUrl;

    /** 실패 사유. 러너가 보낸 값이라 신뢰하지 않고 길이를 자른다. */
    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    @Column(name = "queued_at", nullable = false)
    private LocalDateTime queuedAt;

    @Column(name = "dispatched_at")
    private LocalDateTime dispatchedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

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
        if (this.queuedAt == null) this.queuedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    // ── 도메인 메서드 ──────────────────────────────

    public void markDispatched() {
        this.status = AutofixJobStatus.DISPATCHED;
        this.dispatchedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /** 러너 콜백 반영. 이미 종료된 작업이면 무시한다(콜백 중복 수신 방지). */
    public boolean complete(AutofixJobStatus result, String prUrl, String runUrl, String failureReason) {
        if (this.status.isTerminal()) return false;
        this.status = result;
        this.prUrl = prUrl;
        this.runUrl = runUrl;
        this.failureReason = failureReason;
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    public void markTimedOut() {
        this.status = AutofixJobStatus.TIMED_OUT;
        this.failureReason = "러너 콜백이 시간 안에 오지 않았습니다";
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean cancel() {
        if (this.status != AutofixJobStatus.QUEUED) return false;   // 이미 나간 건 되돌릴 수 없다
        this.status = AutofixJobStatus.CANCELLED;
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    public void assignTarget(String installationId, String repoFullName, String workflowFile, String baseRef) {
        this.installationId = installationId;
        this.repoFullName = repoFullName;
        this.workflowFile = workflowFile;
        this.baseRef = baseRef;
    }
}
