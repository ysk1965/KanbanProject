package com.kanban.domain.mindmap;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * 보드 마인드맵 — 보드당 1행. 노드/엣지 전체를 {@code data} TEXT(JSON)로 저장한다.
 * (노트의 Excalidraw BOARD 타입이 scene 전체를 content TEXT에 저장하는 선례와 동일한 방식)
 */
@Entity
@Table(name = "board_mindmaps", indexes = {
    @Index(name = "idx_board_mindmap_board", columnList = "board_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BoardMindMap extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "board_id", nullable = false, length = 36, unique = true)
    private String boardId;

    /** {@code { "nodes": [...], "edges": [...] }} JSON 문서 — 클라이언트에서 받은 그대로 저장 */
    @Column(name = "data", columnDefinition = "TEXT")
    private String data;

    @Column(name = "updated_by", length = 36)
    private String updatedBy;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateData(String data, String userId) {
        this.data = data;
        this.updatedBy = userId;
    }
}
