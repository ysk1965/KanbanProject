package com.kanban.domain.block;

import com.kanban.domain.board.Board;
import com.kanban.domain.milestone.Milestone;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "blocks")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Block {

    @Id
    @Column(name = "id", length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "board_id", nullable = false)
    private Board board;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private BlockType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "fixed_type", length = 20)
    private FixedBlockType fixedType;

    @Column(name = "color", length = 20)
    private String color;

    @Column(name = "position", nullable = false)
    private Integer position;

    @Column(name = "show_progress_bar", nullable = false)
    @Builder.Default
    private Boolean showProgressBar = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "milestone_id")
    private Milestone milestone;

    // JIRA 미러 컬럼 표시용 — 이 블록이 특정 JIRA 상태를 미러링하면 그 상태 id.
    // null이면 일반 블록. non-null이면 JIRA 뷰 전용(메인 보드에서 숨김) + 사용자 편집 잠금.
    @Column(name = "jira_status_id", length = 64)
    private String jiraStatusId;

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateInfo(String name, String color, Boolean showProgressBar) {
        if (this.type == BlockType.CUSTOM) {
            if (name != null) {
                this.name = name;
            }
            if (color != null) {
                this.color = color;
            }
            if (showProgressBar != null) {
                this.showProgressBar = showProgressBar;
            }
        }
    }

    public void updatePosition(Integer position) {
        this.position = position;
    }

    public boolean isFixed() {
        return this.type == BlockType.FIXED;
    }

    public boolean isCustom() {
        return this.type == BlockType.CUSTOM;
    }

    public boolean isFeatureBlock() {
        return this.fixedType == FixedBlockType.FEATURE;
    }

    public boolean isTaskBlock() {
        return this.fixedType == FixedBlockType.TASK;
    }

    public boolean isDoneBlock() {
        return this.fixedType == FixedBlockType.DONE;
    }

    public boolean isJiraMirror() {
        return this.jiraStatusId != null;
    }

    public void linkJiraStatus(String jiraStatusId) {
        this.jiraStatusId = jiraStatusId;
    }

    public void unlinkJiraStatus() {
        this.jiraStatusId = null;
    }

    public static Block createFixedBlock(Board board, FixedBlockType fixedType, int position) {
        String name = switch (fixedType) {
            case FEATURE -> "Feature";
            case TASK -> "Task";
            case DONE -> "Done";
        };

        return Block.builder()
                .board(board)
                .name(name)
                .type(BlockType.FIXED)
                .fixedType(fixedType)
                .position(position)
                .build();
    }

    public static Block createCustomBlock(Board board, String name, String color, int position) {
        return Block.builder()
                .board(board)
                .name(name)
                .type(BlockType.CUSTOM)
                .color(color)
                .position(position)
                .build();
    }

    public static Block createJiraMirrorBlock(Board board, String name, String color, int position, String jiraStatusId) {
        return Block.builder()
                .board(board)
                .name(name)
                .type(BlockType.CUSTOM)
                .color(color)
                .position(position)
                .jiraStatusId(jiraStatusId)
                .build();
    }

    public static Block createMilestoneBlock(Board board, Milestone milestone, String name, String color, int position) {
        return Block.builder()
                .board(board)
                .milestone(milestone)
                .name(name)
                .type(BlockType.CUSTOM)
                .color(color)
                .position(position)
                .build();
    }

    public boolean isMilestoneSpecific() {
        return this.milestone != null;
    }

    public boolean isBoardLevel() {
        return this.milestone == null;
    }
}
