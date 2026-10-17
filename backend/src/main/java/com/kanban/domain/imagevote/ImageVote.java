package com.kanban.domain.imagevote;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.note.Note;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * 자료실 플로우 보드의 이미지들로 만드는 Top3 투표.
 * 공개 토큰 URL 로 외부 누구나 투표 가능.
 */
@Entity
@Table(name = "image_votes",
        indexes = {
                @Index(name = "idx_iv_note", columnList = "note_id")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ImageVote extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "note_id", nullable = false)
    private Note note;

    @Column(name = "board_id", length = 36, nullable = false)
    private String boardId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    /** 투표용 공개 토큰 (/vote/{token}) */
    @Column(name = "token", nullable = false, length = 36, unique = true)
    private String token;

    /** 결과 조회·종료용 관리 토큰 (/vote-results/{adminToken}) — 투표 링크와 분리 */
    @Column(name = "admin_token", nullable = false, length = 36, unique = true)
    private String adminToken;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        if (this.token == null) {
            this.token = UUID.randomUUID().toString();
        }
        if (this.adminToken == null) {
            this.adminToken = UUID.randomUUID().toString();
        }
    }

    public void close() {
        if (this.closedAt == null) {
            this.closedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public void reopen() {
        this.closedAt = null;
    }

    public boolean isClosed() {
        return this.closedAt != null;
    }
}
