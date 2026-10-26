package com.kanban.domain.readingplan;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import lombok.*;

/** 장 도장 — 한 사람이 길의 한 날에 한 장을 한 번. via 는 scroll(장 끝 「다 읽었어요」) / manual(「따로 읽었어요」). */
@Entity
@Table(
        name = "reading_checks",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_rc_plan_day_user_chapter",
                        columnNames = {"plan_id", "day_no", "user_id", "chapter"}),
        indexes = @Index(name = "idx_rc_plan_user", columnList = "plan_id, user_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ReadingCheck {

    public static final String VIA_SCROLL = "scroll";
    public static final String VIA_MANUAL = "manual";

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "plan_id", nullable = false, length = 36)
    private String planId;

    @Column(name = "day_no", nullable = false)
    private int dayNo;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "chapter", nullable = false, length = 8)
    private String chapter;

    @Column(name = "via", nullable = false, length = 10)
    private String via;

    @Column(name = "read_at", nullable = false)
    private LocalDateTime readAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.readAt == null) {
            this.readAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }
}
