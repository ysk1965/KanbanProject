package com.kanban.domain.comment;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import com.kanban.domain.task.Task;
import com.kanban.domain.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "comments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Comment extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", nullable = false)
    private Task task;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    private User author;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    /** 멘션된 사용자 ID를 쉼표로 저장 (예: "userId1,userId2") */
    @Column(name = "mentions", columnDefinition = "TEXT")
    private String mentions;

    @OneToMany(mappedBy = "comment", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<CommentAttachment> attachments = new ArrayList<>();

    @OneToMany(mappedBy = "comment", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<CommentReaction> reactions = new ArrayList<>();

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateContent(String content, String mentions) {
        this.content = content;
        this.mentions = mentions;
    }

    public boolean isAuthor(String userId) {
        return this.author.getId().equals(userId);
    }
}
