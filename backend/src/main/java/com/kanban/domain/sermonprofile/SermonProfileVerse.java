package com.kanban.domain.sermonprofile;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import lombok.*;

/** 대표 말씀 연대기 — 대표 말씀을 바꿔도 지난 말씀은 지우지 않고 기간을 닫아 둔다. to_at = null 이 지금 말씀. */
@Entity
@Table(name = "sermon_profile_verses", indexes = @Index(name = "idx_spv_user_from", columnList = "user_id, from_at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonProfileVerse {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "verse_ref", nullable = false, length = 24)
    private String verseRef;

    @Column(name = "from_at", nullable = false)
    private LocalDateTime fromAt;

    @Column(name = "to_at")
    private LocalDateTime toAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) this.id = UUID.randomUUID().toString();
        if (this.fromAt == null) this.fromAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void close(LocalDateTime at) {
        if (this.toAt == null) this.toAt = at;
    }
}
