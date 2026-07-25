package com.kanban.domain.integration.confluence;

import com.kanban.domain.board.Board;
import com.kanban.domain.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * 보드가 주간보고를 찾아올 스페이스와 식별 규칙. 인증(연결)과 분리된 "대상" 쪽.
 */
@Entity
@Table(
    name = "board_confluence_sources",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_board_confluence_space", columnNames = {"board_id", "space_key"}),
    indexes = @Index(name = "idx_board_confluence_board", columnList = "board_id")
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BoardConfluenceSource extends BaseTimeEntity {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "config_id", nullable = false)
    private ConfluenceIntegrationConfig config;

    @Column(name = "space_key", nullable = false, length = 100)
    private String spaceKey;

    @Column(name = "space_name", length = 200)
    private String spaceName;

    @Enumerated(EnumType.STRING)
    @Column(name = "match_rule", nullable = false, length = 40)
    private ConfluenceMatchRule matchRule = ConfluenceMatchRule.LABEL;

    /** LABEL 규칙일 때의 라벨명 (예: weekly-report) */
    @Column(name = "label", length = 200)
    private String label;

    /** PARENT_PAGE 규칙일 때의 부모 페이지 ID */
    @Column(name = "parent_page_id", length = 60)
    private String parentPageId;

    /** TITLE_PATTERN 규칙일 때의 제목 패턴 (예: 주간보고) */
    @Column(name = "title_pattern", length = 200)
    private String titlePattern;

    @Column(name = "active", nullable = false)
    private Boolean active = true;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    @Builder
    public BoardConfluenceSource(Board board, ConfluenceIntegrationConfig config,
                                 String spaceKey, String spaceName,
                                 ConfluenceMatchRule matchRule, String label,
                                 String parentPageId, String titlePattern) {
        this.board = board;
        this.config = config;
        this.spaceKey = spaceKey;
        this.spaceName = spaceName;
        this.matchRule = matchRule != null ? matchRule : ConfluenceMatchRule.LABEL;
        this.label = label;
        this.parentPageId = parentPageId;
        this.titlePattern = titlePattern;
        this.active = true;
    }

    public void update(ConfluenceMatchRule matchRule, String label, String parentPageId,
                       String titlePattern, Boolean active) {
        if (matchRule != null) this.matchRule = matchRule;
        this.label = label;
        this.parentPageId = parentPageId;
        this.titlePattern = titlePattern;
        if (active != null) this.active = active;
    }
}
