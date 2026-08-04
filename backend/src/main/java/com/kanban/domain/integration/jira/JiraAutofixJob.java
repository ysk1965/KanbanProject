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
 * <p>대상(저장소·브랜치)을 큐에 담는 시점에 <b>스냅샷</b>한다. 보드의 저장소 연결이 나중에 바뀌어도
 * 이미 큐에 있는 작업이 엉뚱한 저장소에 PR을 열지 않게 하기 위함이다.
 *
 * <p>작업은 BRIDGE가 밀어 넣지 않는다 — 맥의 러너가 {@code claim}으로 가져간다. 러너 쪽이 언제
 * 여유가 있는지는 러너만 알고, 그 정보를 서버가 추측하면 실행 중인데 또 보내는 사고가 난다.
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

    // ── 대상 스냅샷 ──

    @Column(name = "installation_id", length = 40)
    private String installationId;

    @Column(name = "repo_full_name", length = 200)
    private String repoFullName;

    @Column(name = "base_ref", length = 200)
    private String baseRef;

    /** 이 작업을 가져간 러너. 여러 대를 붙일 일은 없지만, 어느 맥이 물고 있는지는 알아야 한다. */
    @Column(name = "runner_name", length = 100)
    private String runnerName;

    // ── 결과 ──

    @Column(name = "pr_url", length = 500)
    private String prUrl;

    /** 실패 사유. 러너가 보낸 값이라 신뢰하지 않고 길이를 자른다. */
    @Column(name = "failure_reason", length = 1000)
    private String failureReason;

    /**
     * 에이전트 로그 꼬리. GitHub Actions를 걷어내면서 "실행 로그 링크"가 사라졌으므로,
     * 실패 원인을 화면에서 볼 수 있는 유일한 경로다.
     */
    @Column(name = "log_excerpt", columnDefinition = "TEXT")
    private String logExcerpt;

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

    /**
     * 러너가 이 작업을 가져갔다. 가져간 시각이 곧 시작 시각이다 — 밀어 넣는 방식과 달리
     * "보냈지만 아직 시작 안 됨" 구간이 없다.
     */
    public void markClaimed(String runnerName) {
        this.status = AutofixJobStatus.DISPATCHED;
        this.dispatchedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.runnerName = runnerName;
    }

    /** 러너 콜백 반영. 이미 종료된 작업이면 무시한다(콜백 중복 수신 방지). */
    public boolean complete(AutofixJobStatus result, String prUrl, String failureReason, String logExcerpt) {
        if (this.status.isTerminal()) return false;
        this.status = result;
        this.prUrl = prUrl;
        this.failureReason = failureReason;
        if (logExcerpt != null) this.logExcerpt = logExcerpt;
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

    /**
     * 러너가 물고 있는 작업을 강제로 놓아준다 — 직렬 보장 때문에 DISPATCHED 한 건이 그 보드의 큐
     * 전체를 막으므로, 러너 쪽이 죽어 콜백이 오지 않을 때 타임아웃 회수까지 기다릴 수단이 없으면
     * 사람이 할 수 있는 일이 없어진다.
     *
     * <p>맥에서 돌고 있는 실제 작업을 멈추지는 못한다. 늦게 도착한 콜백은 이미 종료된 작업을
     * 덮지 못해 무시되고, CANCELLED이므로 같은 이슈를 다시 담을 수 있다.
     */
    public boolean release() {
        if (this.status != AutofixJobStatus.DISPATCHED) return false;
        this.status = AutofixJobStatus.CANCELLED;
        this.failureReason = "진행 중이던 작업을 강제로 회수했습니다";
        this.completedAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    public void assignTarget(String installationId, String repoFullName, String baseRef) {
        this.installationId = installationId;
        this.repoFullName = repoFullName;
        this.baseRef = baseRef;
    }
}
