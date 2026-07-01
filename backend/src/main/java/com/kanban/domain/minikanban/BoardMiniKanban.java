package com.kanban.domain.minikanban;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * 보드 미니 칸반 레이아웃 — 보드당 1행. 캔버스 노드 좌표(블록/태스크)와 접힘 상태를
 * {@code data} TEXT(JSON)로 저장한다. (마인드맵 {@code board_mindmaps} 선례와 동일한 방식)
 *
 * <p>태스크/체크리스트/블록 실데이터는 저장하지 않고 렌더 시 라이브 조회한다.
 * 블록→태스크 파생 엣지·TODO/DOING/DONE 3열도 저장하지 않고 파생한다.
 */
@Entity
@Table(name = "board_minikanban", indexes = {
    @Index(name = "idx_board_minikanban_board", columnList = "board_id")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BoardMiniKanban extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "board_id", nullable = false, length = 36, unique = true)
    private String boardId;

    /** {@code { "nodes": [...], "collapsed_blocks": [...] }} JSON 문서 — 클라이언트에서 받은 그대로 저장 */
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
