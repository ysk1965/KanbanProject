package com.kanban.domain.board;

import com.kanban.domain.jobrole.entity.JobRole;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "board_members", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"board_id", "user_id"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BoardMember {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private BoardRole role;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invited_by")
    private User invitedBy;

    @Column(name = "assignee_color", length = 20)
    private String assigneeColor;

    @Column(name = "display_order")
    private Integer displayOrder;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_role_id")
    private JobRole jobRole;

    /** 이 멤버의 GitHub 로그인(계정 아이디). 리포트에서 commit.authorLogin 매칭에 사용. nullable. */
    @Column(name = "github_login", length = 100)
    private String githubLogin;

    /**
     * 스프린트 JIRA 뷰에서 이슈 목록을 마지막으로 확인한 시각(UTC).
     * 이 값보다 나중에 링크된 JIRA 이슈가 "신규"로 집계된다.
     * null = 아직 미확인 → 최초 조회 시 now로 초기화한다(전체가 신규로 잡히는 것 방지).
     */
    @Column(name = "jira_last_seen_at")
    private LocalDateTime jiraLastSeenAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.joinedAt == null) {
            this.joinedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public void updateRole(BoardRole role) {
        this.role = role;
    }

    public void updateAssigneeColor(String assigneeColor) {
        this.assigneeColor = assigneeColor;
    }

    public void updateDisplayOrder(Integer displayOrder) {
        this.displayOrder = displayOrder;
    }

    public void updateJobRole(JobRole jobRole) {
        this.jobRole = jobRole;
    }

    public void updateGithubLogin(String githubLogin) {
        this.githubLogin = githubLogin;
    }

    /** JIRA 뷰 확인 시각을 현재로 갱신 — 이후 링크된 이슈만 신규로 잡힌다. */
    public void markJiraSeen() {
        this.jiraLastSeenAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /** 최초 진입(null) 시 기준선을 now로 세운다. 이미 값이 있으면 건드리지 않는다. */
    public boolean initJiraSeenIfAbsent() {
        if (this.jiraLastSeenAt != null) {
            return false;
        }
        this.jiraLastSeenAt = LocalDateTime.now(ZoneOffset.UTC);
        return true;
    }

    public boolean isOwner() {
        return this.role == BoardRole.OWNER;
    }

    public boolean isAdmin() {
        return this.role == BoardRole.ADMIN;
    }

    public boolean isAdminOrAbove() {
        return this.role == BoardRole.OWNER || this.role == BoardRole.ADMIN;
    }

    public boolean isMemberOrAbove() {
        return this.role != BoardRole.VIEWER;
    }

    public boolean isBillable() {
        return this.role != BoardRole.VIEWER;
    }
}
