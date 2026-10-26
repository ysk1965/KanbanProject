package com.kanban.domain.sermongroup;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import lombok.*;

/** 같이 써요 — 같은 모임·같은 주·같은 상대에게 한 번. */
@Entity
@Table(
        name = "sermon_pokes",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_sp_group_from_to_week",
                        columnNames = {"group_id", "from_user", "to_user", "week_start"}),
        indexes = @Index(name = "idx_sp_group_to_week", columnList = "group_id, to_user, week_start"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonPoke {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "group_id", nullable = false, length = 36)
    private String groupId;

    @Column(name = "from_user", nullable = false, length = 36)
    private String fromUser;

    @Column(name = "to_user", nullable = false, length = 36)
    private String toUser;

    @Column(name = "week_start", nullable = false)
    private LocalDate weekStart;

    @Column(name = "session_id", length = 36)
    private String sessionId;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "seen_at")
    private LocalDateTime seenAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public void markSeen() {
        if (this.seenAt == null) {
            this.seenAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }
}
