package com.kanban.domain.imagevote;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/** 투표 후보 이미지 (플로우 보드의 image 노드 스냅샷). */
@Entity
@Table(name = "image_vote_candidates",
        indexes = {
                @Index(name = "idx_ivc_vote", columnList = "vote_id")
        })
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ImageVoteCandidate {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "vote_id", nullable = false)
    private ImageVote vote;

    /** 원본 플로우 노드 id (참조용) */
    @Column(name = "node_id", length = 64)
    private String nodeId;

    @Column(name = "image_url", nullable = false, columnDefinition = "TEXT")
    private String imageUrl;

    @Column(name = "label", length = 200)
    private String label;

    @Column(name = "position", nullable = false)
    @Builder.Default
    private Integer position = 0;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }
}
