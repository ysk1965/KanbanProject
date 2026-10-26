package com.kanban.domain.sermonnote;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import lombok.*;

/**
 * 설교 노트 버전 한 장 — 노트(personal_feature_docs, feature_key='sermon')의 그때 본문.
 *
 * <p>id 는 기기에서 만든다(오프라인에서 먼저 찍고 나중에 올린다). 노트마다 최근 30장만 남긴다.
 * note_id 는 서버 문서 id 지만 FK 는 없다 — 노트를 지울 때 {@code SermonNoteDocHook} 이 함께 지운다.
 */
@Entity
@Table(
        name = "sermon_note_versions",
        indexes = @Index(name = "idx_sermon_note_versions_note", columnList = "user_id, note_id, at"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonNoteVersion {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "note_id", nullable = false, length = 36)
    private String noteId;

    /** open / auto / close / restore */
    @Column(name = "reason", nullable = false, length = 10)
    private String reason;

    @Column(name = "title", length = 200)
    private String title;

    @Column(name = "body", nullable = false, columnDefinition = "TEXT")
    private String body;

    @Column(name = "chars", nullable = false)
    private int chars;

    /** 기기에서 찍은 시각 (UTC) */
    @Column(name = "at", nullable = false)
    private LocalDateTime at;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (this.createdAt == null) this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }
}
