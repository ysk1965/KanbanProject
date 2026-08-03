package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * BRIDGE 댓글 ↔ JIRA 코멘트 1:1 원장 — 양방향 댓글 동기화의 에코 차단 장치.
 *
 * <p>블록 이동 push는 "push 상태는 pull이 무시"하는 소유권 분리로 루프를 막지만(
 * {@code JiraWriteBackService}), 댓글은 같은 트릭이 통하지 않아 명시적 매핑이 필요하다.
 * 규칙은 단순하다 — <b>이미 링크가 있는 댓글/코멘트는 반대편으로 다시 보내지 않는다.</b>
 *
 * <p>{@code commentId}에 FK를 걸지 않는 이유: BRIDGE 댓글이 삭제된 <b>뒤</b>(AFTER_COMMIT)에
 * 리스너가 이 행을 읽어 JIRA 쪽 삭제를 수행해야 하기 때문. 삭제 전파를 마친 뒤 직접 지운다.
 */
@Entity
@Table(name = "jira_comment_links", indexes = {
    @Index(name = "idx_jira_comment_link_comment", columnList = "comment_id"),
    @Index(name = "idx_jira_comment_link_task", columnList = "board_id, task_id"),
    @Index(name = "uq_jira_comment_link_board_jira", columnList = "board_id, jira_comment_id", unique = true)
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraCommentLink {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    /** BRIDGE 댓글 id. FK 없음(위 클래스 주석 참고) — 댓글 삭제 후에도 남아 전파에 쓰인다. */
    @Column(name = "comment_id", nullable = false, length = 36)
    private String commentId;

    /** 소속 Task id — 인바운드 반영 시 대상 카드를 찾는 데 사용. */
    @Column(name = "task_id", nullable = false, length = 36)
    private String taskId;

    @Column(name = "jira_issue_key", nullable = false, length = 50)
    private String jiraIssueKey;

    @Column(name = "jira_comment_id", nullable = false, length = 30)
    private String jiraCommentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "origin", nullable = false, length = 10)
    private JiraCommentOrigin origin;

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

    public boolean isFromBridge() {
        return this.origin == JiraCommentOrigin.BRIDGE;
    }
}
