package com.kanban.domain.note;

import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "note_versions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class NoteVersion {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "note_id", nullable = false)
    private Note note;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    @Column(name = "version_number", nullable = false)
    private Integer versionNumber;

    /** 버전 메모 (사용자 입력 또는 복원 시 자동 생성). DB 컬럼명은 note_versions.note. */
    @Column(name = "note", length = 500)
    private String memo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

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

    public static final int MEMO_MAX_LEN = 500;

    public static NoteVersion createFrom(Note note, User user, int versionNumber) {
        return createFrom(note, user, versionNumber, null);
    }

    public static NoteVersion createFrom(Note note, User user, int versionNumber, String memo) {
        return create(note, note.getTitle(), note.getContent(), user, versionNumber, memo);
    }

    public static NoteVersion create(Note note, String title, String content, User user, int versionNumber) {
        return create(note, title, content, user, versionNumber, null);
    }

    public static NoteVersion create(Note note, String title, String content, User user, int versionNumber, String memo) {
        return NoteVersion.builder()
                .note(note)
                .title(title)
                .content(content)
                .versionNumber(versionNumber)
                .createdBy(user)
                .memo(normalizeMemo(memo))
                .build();
    }

    /** null/공백이면 메모를 지운다. 500자 초과분은 잘라낸다. */
    public void updateMemo(String memo) {
        this.memo = normalizeMemo(memo);
    }

    public static String normalizeMemo(String memo) {
        if (memo == null) return null;
        String trimmed = memo.trim();
        if (trimmed.isEmpty()) return null;
        return trimmed.length() > MEMO_MAX_LEN ? trimmed.substring(0, MEMO_MAX_LEN) : trimmed;
    }
}
