package com.kanban.domain.sermongroup;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.util.Map;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 공개 사본 — 노트 원본(personal_feature_docs)에서 모임에 보여 줄 조각만 복사해 둔 것.
 *
 * <p>private=true 면 「기록은 했지만 내용 비공개」라 fields 를 저장하지 않는다(null).
 */
@Entity
@Table(
        name = "sermon_note_shares",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uq_sns_session_user",
                        columnNames = {"session_id", "user_id"}),
        indexes = @Index(name = "idx_sns_group_user", columnList = "group_id, user_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SermonNoteShare extends BaseTimeEntity {

    public static final String HEARD_LIVE = "live";

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "session_id", nullable = false, length = 36)
    private String sessionId;

    @Column(name = "group_id", nullable = false, length = 36)
    private String groupId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    /** 클라이언트 노트 id (참고용) */
    @Column(name = "note_id", length = 64)
    private String noteId;

    @Column(name = "my_title", length = 200)
    private String myTitle;

    /** live / video / other */
    @Column(name = "heard", nullable = false, length = 10)
    private String heard;

    @Column(name = "part", length = 10)
    private String part;

    @Column(name = "private", nullable = false)
    private boolean isPrivate;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "fields")
    private Map<String, Object> fields;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void update(
            String noteId, String myTitle, String heard, String part, boolean isPrivate, Map<String, Object> fields) {
        this.noteId = noteId;
        this.myTitle = myTitle;
        this.heard = heard;
        this.part = part;
        this.isPrivate = isPrivate;
        this.fields = fields;
    }
}
