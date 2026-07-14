package com.kanban.domain.integration.jira;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * JIRA 사용자(accountId) ↔ BRIDGE 멤버 매핑.
 *
 * 담당자 매칭 사다리에서 한 번 이어지면 여기에 저장되어,
 * 이후 가져오기부터는 이 accountId로 즉시 해결된다.
 * bridgeUser 가 null 이면 "미배정으로 확정"을 의미.
 */
@Entity
@Table(name = "jira_user_mappings", indexes = {
    @Index(name = "idx_jira_user_map_board", columnList = "board_id"),
    @Index(name = "uq_jira_user_map_board_account", columnList = "board_id, jira_account_id", unique = true)
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class JiraUserMapping {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "jira_account_id", nullable = false, length = 128)
    private String jiraAccountId;

    @Column(name = "jira_display_name", length = 200)
    private String jiraDisplayName;

    /** 매핑된 BRIDGE 멤버. null = 미배정 확정. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bridge_user_id")
    private User bridgeUser;

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

    public void updateMapping(User bridgeUser, String jiraDisplayName) {
        this.bridgeUser = bridgeUser;
        if (jiraDisplayName != null) {
            this.jiraDisplayName = jiraDisplayName;
        }
    }
}
