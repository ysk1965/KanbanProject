package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 자동수정 트리아지 판정 원장 — JIRA 이슈 1건당 1행.
 *
 * <p>(board_id, jira_issue_key) UNIQUE로 중복 판정을 막고, {@code jiraUpdatedAt}으로
 * "이슈 본문이 바뀌었으니 재판정이 필요한지"를 가린다. 이슈가 그대로면 재실행해도
 * AI를 다시 호출하지 않는다 — 100여 건을 매번 다시 부르면 비용만 나간다.
 */
@Entity
@Table(name = "jira_autofix_triages", indexes = {
    @Index(name = "idx_jira_triage_board", columnList = "board_id"),
    @Index(name = "idx_jira_triage_verdict", columnList = "board_id, verdict"),
    @Index(name = "uq_jira_triage_board_key", columnList = "board_id, jira_issue_key", unique = true)
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraAutofixTriage {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "jira_issue_key", nullable = false, length = 50)
    private String jiraIssueKey;

    /** 판정 대상이 된 BRIDGE Task id. 이슈 본문을 어디서 읽었는지 추적용. */
    @Column(name = "task_id", length = 36)
    private String taskId;

    @Enumerated(EnumType.STRING)
    @Column(name = "verdict", nullable = false, length = 20)
    private AutofixVerdict verdict;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", nullable = false, length = 30)
    private AutofixCategory category;

    /** 0.0~1.0. 큐 투입 임계값 판단에 쓴다. */
    @Column(name = "confidence", nullable = false)
    private Double confidence;

    /** 자동 검증 수단 한 줄 — "EditMode 유닛 테스트 신규 작성" 같은. */
    @Column(name = "verification", length = 500)
    private String verification;

    /** 판정 근거 한 줄. */
    @Column(name = "reason", length = 1000)
    private String reason;

    /**
     * 판정 당시 JIRA fields.updated 값. {@link JiraIssueLink#getJiraUpdatedAt()}와 다르면
     * 이슈가 수정된 것이므로 재판정 대상이 된다.
     */
    @Column(name = "jira_updated_at")
    private LocalDateTime jiraUpdatedAt;

    /** 판정에 쓴 모델. 모델을 바꿨을 때 결과를 비교하려면 남겨야 한다. */
    @Column(name = "model", length = 60)
    private String model;

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

    /** 재판정 결과 반영. */
    public void applyVerdict(AutofixVerdict verdict, AutofixCategory category, Double confidence,
                             String verification, String reason,
                             LocalDateTime jiraUpdatedAt, String model, String taskId) {
        this.verdict = verdict;
        this.category = category;
        this.confidence = confidence;
        this.verification = verification;
        this.reason = reason;
        this.jiraUpdatedAt = jiraUpdatedAt;
        this.model = model;
        this.taskId = taskId;
    }

    /**
     * 판정 이후 이슈가 수정됐는지 — 재판정 필요 판정.
     * 둘 중 하나라도 null이면 비교가 불가능하므로 재판정 대상으로 본다.
     */
    public boolean isStaleAgainst(LocalDateTime incomingJiraUpdatedAt) {
        if (this.jiraUpdatedAt == null || incomingJiraUpdatedAt == null) return true;
        return !this.jiraUpdatedAt.equals(incomingJiraUpdatedAt);
    }
}
