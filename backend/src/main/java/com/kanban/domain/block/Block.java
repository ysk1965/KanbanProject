package com.kanban.domain.block;

import com.kanban.domain.board.Board;
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

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
    }

    public void updateInfo(String name, String color) {
        if (this.type == BlockType.CUSTOM) {
            if (name != null) {
                this.name = name;
            }
            if (color != null) {
                this.color = color;
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
}
