package com.kanban.domain.readingplan;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;
import lombok.*;

/**
 * 함께 읽는 길. 주인은 group_id(모임 길) 또는 owner_user_id(나의 길) 중 하나 — DB CHECK ck_rp_one_owner.
 *
 * <p>status 는 active / done(끝난 날이 지나 자동 전환) / ended(직접 끝냄).
 */
@Entity
@Table(
        name = "reading_plans",
        indexes = {
            @Index(name = "idx_rp_group_status", columnList = "group_id, status"),
            @Index(name = "idx_rp_owner_status", columnList = "owner_user_id, status")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ReadingPlan extends BaseTimeEntity {

    public static final String STATUS_ACTIVE = "active";
    public static final String STATUS_DONE = "done";
    public static final String STATUS_ENDED = "ended";

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "group_id", length = 36)
    private String groupId;

    @Column(name = "owner_user_id", length = 36)
    private String ownerUserId;

    @Column(name = "title", nullable = false, length = 40)
    private String title;

    @Column(name = "template", nullable = false, length = 20)
    private String template;

    @Column(name = "status", nullable = false, length = 10)
    private String status;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "created_by", nullable = false, length = 36)
    private String createdBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public boolean isActive() {
        return STATUS_ACTIVE.equals(status);
    }

    public boolean isGroupPlan() {
        return groupId != null;
    }

    /** 끝난 날 다음날까지 지나면 done (클라이언트 날짜 ±1일 여유) */
    public boolean expireIfOver(LocalDate today) {
        if (isActive() && endDate.isBefore(today.minusDays(1))) {
            this.status = STATUS_DONE;
            return true;
        }
        return false;
    }

    public void end() {
        this.status = STATUS_ENDED;
    }
}
