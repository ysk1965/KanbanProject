package com.kanban.domain.sermongroup;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import lombok.*;

/** 공개 사본의 한 조각(생각 id · "h:&lt;ref&gt;" · "note")에 남긴 반응. kind 는 amen / curious / keeping. */
@Entity
@Table(
        name = "sermon_reactions",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_sr_share_item_user_kind",
                        columnNames = {"share_id", "item_key", "user_id", "kind"}),
        indexes = @Index(name = "idx_sr_user", columnList = "user_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonReaction {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "share_id", nullable = false, length = 36)
    private String shareId;

    @Column(name = "item_key", nullable = false, length = 64)
    private String itemKey;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "kind", nullable = false, length = 20)
    private String kind;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.createdAt == null) {
            this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }
}
