package com.kanban.domain.note;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "note_comments", indexes = {
    @Index(name = "idx_note_comment_note_id", columnList = "note_id"),
    @Index(name = "idx_note_comment_board_id", columnList = "board_id"),
    @Index(name = "idx_note_comment_parent_id", columnList = "parent_id"),
    @Index(name = "idx_note_comment_block_id", columnList = "note_id, block_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class NoteComment {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "note_id", nullable = false)
    private Note note;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "block_id", length = 100)
    private String blockId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private NoteComment parent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    private User author;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "mentions", columnDefinition = "TEXT")
    private String mentions;

    @Column(name = "is_resolved", nullable = false)
    @Builder.Default
    private Boolean isResolved = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by")
    private User resolvedBy;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        if (this.updatedAt == null) {
            this.updatedAt = now;
        }
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void updateContent(String content, String mentions) {
        this.content = content;
        this.mentions = mentions;
    }

    public void toggleResolved(User user) {
        if (this.isResolved) {
            this.isResolved = false;
            this.resolvedBy = null;
            this.resolvedAt = null;
        } else {
            this.isResolved = true;
            this.resolvedBy = user;
            this.resolvedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public boolean isAuthor(String userId) {
        return this.author != null && this.author.getId().equals(userId);
    }

    public boolean isRootComment() {
        return this.parent == null;
    }
}
