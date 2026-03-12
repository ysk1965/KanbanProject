package com.kanban.domain.note;

import com.kanban.domain.board.Board;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "notes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Note {

    private static final int MAX_DEPTH = 4;

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Note parent;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private NoteType type;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", columnDefinition = "TEXT")
    private String content;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @Column(name = "depth", nullable = false)
    @Builder.Default
    private Integer depth = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by", nullable = false)
    private User updatedBy;

    @Column(name = "ai_suggestions", columnDefinition = "TEXT")
    private String aiSuggestions;

    @Column(name = "ai_content_snapshot", columnDefinition = "TEXT")
    private String aiContentSnapshot;

    @Column(name = "share_token", length = 36, unique = true)
    private String shareToken;

    @Column(name = "is_shared", nullable = false)
    @Builder.Default
    private Boolean isShared = false;

    @Column(name = "is_deleted", nullable = false)
    @Builder.Default
    private Boolean isDeleted = false;

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

    public void updateTitle(String title) {
        if (title != null) {
            this.title = title;
        }
    }

    public void updateContent(String content, User updatedBy) {
        this.content = content;
        this.updatedBy = updatedBy;
    }

    public void moveTo(Note newParent, int newPosition) {
        this.parent = newParent;
        this.position = newPosition;
        this.depth = newParent != null ? newParent.getDepth() + 1 : 0;
    }

    public void updatePosition(int position) {
        this.position = position;
    }

    public void softDelete() {
        this.isDeleted = true;
    }

    public String enableShare() {
        this.isShared = true;
        if (this.shareToken == null) {
            this.shareToken = UUID.randomUUID().toString();
        }
        return this.shareToken;
    }

    public void disableShare() {
        this.isShared = false;
        this.shareToken = null;
    }

    public void updateAiSuggestions(String aiSuggestions) {
        this.aiSuggestions = aiSuggestions;
    }

    public void updateAiContentSnapshot(String snapshot) {
        this.aiContentSnapshot = snapshot;
    }

    public boolean isFolder() {
        return this.type == NoteType.FOLDER;
    }

    public boolean isDocument() {
        return this.type == NoteType.DOCUMENT;
    }

    public boolean isBoard() {
        return this.type == NoteType.BOARD;
    }

    public boolean canHaveChildren() {
        return this.depth < MAX_DEPTH;
    }

    public static int getMaxDepth() {
        return MAX_DEPTH;
    }
}
