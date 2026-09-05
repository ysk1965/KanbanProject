package com.kanban.domain.imagevote;

import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.note.Note;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
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

    @Column(name = "token", nullable = false, length = 36, unique = true)
    private String token;

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
    }

    public boolean isClosed() {
        return this.closedAt != null;
    }
}
