package com.kanban.domain.sermongroup;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 설교 자리 — 모임 × 예배 × 날짜 한 칸. 예배표 밖 자리는 service_id 가 null 이고 name 을 쓴다.
 *
 * <p>UNIQUE(group_id, service_id, date) 는 service_id 가 null 인 행끼리는 충돌하지 않는다(PG·H2 공통 NULL 의미).
 */
@Entity
@Table(
        name = "sermon_sessions",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_ss_group_service_date",
                        columnNames = {"group_id", "service_id", "date"}),
        indexes = @Index(name = "idx_ss_group_date", columnList = "group_id, date"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonSession extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "group_id", nullable = false, length = 36)
    private String groupId;

    @Column(name = "service_id", length = 20)
    private String serviceId;

    /** 교회 현지 날짜 (클라이언트가 보냄) */
    @Column(name = "date", nullable = false)
    private LocalDate date;

    @Column(name = "name", length = 60)
    private String name;

    @Column(name = "title", length = 200)
    private String title;

    @Column(name = "preacher", length = 60)
    private String preacher;

    /** encRef 형식 "44:5:12-14" 목록 */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "refs", nullable = false)
    @Builder.Default
    private List<String> refs = new ArrayList<>();

    @Column(name = "locked", nullable = false)
    private boolean locked;

    @Column(name = "updated_by", length = 36)
    private String updatedBy;

    @Column(name = "opened_by", length = 36)
    private String openedBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateTitle(String title) {
        this.title = title;
    }

    public void updatePreacher(String preacher) {
        this.preacher = preacher;
    }

    public void updateRefs(List<String> refs) {
        this.refs = refs;
    }

    public void markUpdatedBy(String userId) {
        this.updatedBy = userId;
    }

    public void updateLocked(boolean locked) {
        this.locked = locked;
    }
}
