package com.kanban.domain.sermongroup;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 설교 노트 「모임」. 예배표(services)를 정해 두면 그 예배 시간에 쓴 노트가 모임의 설교 자리(session)에 붙는다.
 *
 * <p>services 는 JSON 한 덩어리 — 컬럼 타입은 방언에 맡긴다(PostgreSQL jsonb, H2 json).
 */
@Entity
@Table(name = "sermon_groups")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonGroup extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "name", nullable = false, length = 60)
    private String name;

    @Column(name = "kind", nullable = false, length = 20)
    private String kind;

    /** 모이는 요일 0=일 … 6=토 */
    @Column(name = "meet_dow")
    private Integer meetDow;

    @Column(name = "meet_time", length = 5)
    private String meetTime;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "services", nullable = false)
    @Builder.Default
    private List<Map<String, Object>> services = new ArrayList<>();

    /** null = 초대 링크 꺼짐 */
    @Column(name = "invite_code", length = 12, unique = true)
    private String inviteCode;

    /** null = 무기한 */
    @Column(name = "invite_expires_at")
    private LocalDateTime inviteExpiresAt;

    @Column(name = "join_approval", nullable = false)
    private boolean joinApproval;

    @Column(name = "created_by", length = 36)
    private String createdBy;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateName(String name) {
        this.name = name;
    }

    public void updateKind(String kind) {
        this.kind = kind;
    }

    public void updateMeetDow(Integer meetDow) {
        this.meetDow = meetDow;
    }

    public void updateMeetTime(String meetTime) {
        this.meetTime = meetTime;
    }

    public void updateServices(List<Map<String, Object>> services) {
        this.services = services;
    }

    public void updateJoinApproval(boolean joinApproval) {
        this.joinApproval = joinApproval;
    }

    public void updateInvite(String inviteCode, LocalDateTime inviteExpiresAt) {
        this.inviteCode = inviteCode;
        this.inviteExpiresAt = inviteExpiresAt;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.inviteCode = null;
    }

    public boolean isDeleted() {
        return this.deletedAt != null;
    }

    /** 초대 코드가 지금 쓸 수 있는지 */
    public boolean isInviteUsable() {
        return inviteCode != null
                && (inviteExpiresAt == null || inviteExpiresAt.isAfter(LocalDateTime.now(ZoneOffset.UTC)));
    }
}
