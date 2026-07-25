package com.kanban.domain.integration.confluence;

import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * 부모 트리(PARENT_TREE_CHANGELOG) 한 곳의 <b>직전 수집 시점 페이지 집합</b>.
 *
 * <p>삭제는 CQL 검색으로 알 수 없다 — 검색은 지금 존재하는 페이지만 돌려주기 때문이다.
 * 그래서 매 수집마다 트리의 (id·title) 목록을 여기 저장해 두고, 다음 수집에서
 * 사라진 id를 삭제로 판정한다. title도 함께 담는 건, 지워진 문서는 더 못 읽으므로
 * 보고서에 이름을 남기려면 마지막으로 본 제목이 필요하기 때문이다.
 */
@Entity
@Table(
    name = "confluence_tree_snapshots",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_confluence_tree_snapshot",
        columnNames = {"board_id", "space_key", "parent_page_id"}),
    indexes = @Index(name = "idx_confluence_tree_snapshot_board", columnList = "board_id")
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ConfluenceTreeSnapshot extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @Column(name = "board_id", nullable = false, length = 36)
    private String boardId;

    @Column(name = "space_key", nullable = false, length = 100)
    private String spaceKey;

    @Column(name = "parent_page_id", nullable = false, length = 60)
    private String parentPageId;

    /** [{"id":"...","title":"..."}] JSON. 직렬화는 서비스가 맡는다. */
    @Column(name = "entries", columnDefinition = "TEXT")
    private String entries;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    @Builder
    public ConfluenceTreeSnapshot(String boardId, String spaceKey, String parentPageId, String entries) {
        this.boardId = boardId;
        this.spaceKey = spaceKey;
        this.parentPageId = parentPageId;
        this.entries = entries;
    }

    public void updateEntries(String entries) {
        this.entries = entries;
    }
}
