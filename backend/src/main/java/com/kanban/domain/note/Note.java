package com.kanban.domain.note;

import com.kanban.domain.board.Board;
import com.kanban.domain.organization.Organization;
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
    @JoinColumn(name = "board_id")
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    /** 개인(마이 스페이스) 노트 소유자. board/organization 과 상호배타적. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_user_id")
    private User owner;

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

    /** 공개 공유 링크 단축용 짧은 코드(base62). shareToken(UUID)과 병행 — 신규 링크는 이 코드를 쓴다. */
    @Column(name = "share_code", length = 16, unique = true)
    private String shareCode;

    @Column(name = "is_shared", nullable = false)
    @Builder.Default
    private Boolean isShared = false;

    @Column(name = "is_deleted", nullable = false)
    @Builder.Default
    private Boolean isDeleted = false;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "deleted_by_id")
    private User deletedBy;

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

    public void softDelete(User actor) {
        this.isDeleted = true;
        this.deletedAt = LocalDateTime.now(ZoneOffset.UTC);
        this.deletedBy = actor;
    }

    public void restore() {
        this.isDeleted = false;
        this.deletedAt = null;
        this.deletedBy = null;
    }

    // 짧은 코드용 base62 알파벳 (하이픈 없음 → 슬러그와 분리가 명확하고 URL-safe)
    private static final String SHARE_CODE_ALPHABET =
            "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final java.security.SecureRandom SHARE_CODE_RNG = new java.security.SecureRandom();

    /** 10자 base62(62^10 ≈ 8.4e17) — 충돌 확률은 무시 가능, unique 제약으로 최종 보장. */
    private static String generateShareCode() {
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) {
            sb.append(SHARE_CODE_ALPHABET.charAt(SHARE_CODE_RNG.nextInt(SHARE_CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    public String enableShare() {
        this.isShared = true;
        if (this.shareToken == null) {
            this.shareToken = UUID.randomUUID().toString();
        }
        if (this.shareCode == null) {
            this.shareCode = generateShareCode();
        }
        return this.shareToken;
    }

    public void disableShare() {
        this.isShared = false;
        this.shareToken = null;
        this.shareCode = null;
    }

    /** 공유를 끄지 않고 토큰/코드를 교체. 기존 링크(UUID·코드 모두)를 가진 사용자는 즉시 차단된다. */
    public String rotateShareToken() {
        this.isShared = true;
        this.shareToken = UUID.randomUUID().toString();
        this.shareCode = generateShareCode();
        return this.shareToken;
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

    public boolean isOrgNote() {
        return this.organization != null;
    }

    public boolean isPersonalNote() {
        return this.owner != null;
    }
}
