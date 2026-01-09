package com.kanban.domain.board;

import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
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
    private Role role;

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invited_by")
    private User invitedBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.joinedAt == null) {
            this.joinedAt = LocalDateTime.now();
        }
    }

    public void updateRole(Role role) {
        this.role = role;
    }

    public boolean isOwner() {
        return this.role == Role.OWNER;
    }

    public boolean isAdmin() {
        return this.role == Role.ADMIN;
    }

    public boolean isAdminOrAbove() {
        return this.role == Role.OWNER || this.role == Role.ADMIN;
    }

    public boolean isMemberOrAbove() {
        return this.role != Role.VIEWER;
    }

    public boolean isBillable() {
        return this.role != Role.VIEWER;
    }
}
