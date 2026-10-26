package com.kanban.domain.sermongroup;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 모임 멤버. role 은 leader / co_leader / member, status 는 pending / active (JSON 값 그대로 저장). */
@Entity
@Table(
        name = "sermon_group_members",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_sgm_group_user",
                        columnNames = {"group_id", "user_id"}),
        indexes = @Index(name = "idx_sgm_user", columnList = "user_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonGroupMember {

    public static final String ROLE_LEADER = "leader";
    public static final String ROLE_CO_LEADER = "co_leader";
    public static final String ROLE_MEMBER = "member";
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_ACTIVE = "active";

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "group_id", nullable = false, length = 36)
    private String groupId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "role", nullable = false, length = 20)
    private String role;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "display_name", nullable = false, length = 20)
    private String displayName;

    /** 내가 안 드리는 예배 id 목록 */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "muted_service_ids", nullable = false)
    @Builder.Default
    private List<String> mutedServiceIds = new ArrayList<>();

    @Column(name = "joined_at", nullable = false)
    private LocalDateTime joinedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.joinedAt == null) {
            this.joinedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public boolean isActive() {
        return STATUS_ACTIVE.equals(status);
    }

    public boolean isLeader() {
        return ROLE_LEADER.equals(role);
    }

    /** 리더 또는 함께 리더 */
    public boolean isManager() {
        return ROLE_LEADER.equals(role) || ROLE_CO_LEADER.equals(role);
    }

    public void approve() {
        this.status = STATUS_ACTIVE;
        this.joinedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void changeRole(String role) {
        this.role = role;
    }

    public void updateDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public void updateMutedServiceIds(List<String> mutedServiceIds) {
        this.mutedServiceIds = mutedServiceIds;
    }
}
