package com.kanban.domain.block.dto;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockType;
import com.kanban.domain.block.FixedBlockType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

public class BlockResponse {

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Detail implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;
        private String id;
        private String name;
        private BlockType type;
        private FixedBlockType fixedType;
        private String color;
        private Integer position;
        private Boolean showProgressBar;
        private String milestoneId;
        private String milestoneTitle;

        public static Detail of(Block block) {
            return Detail.builder()
                    .id(block.getId())
                    .name(block.getName())
                    .type(block.getType())
                    .fixedType(block.getFixedType())
                    .color(block.getColor())
                    .position(block.getPosition())
                    .showProgressBar(block.getShowProgressBar())
                    .milestoneId(block.getMilestone() != null ? block.getMilestone().getId() : null)
                    .milestoneTitle(block.getMilestone() != null ? block.getMilestone().getTitle() : null)
                    .build();
        }
    }

    @Getter
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ListResponse implements Serializable {
        @Serial
        private static final long serialVersionUID = 1L;

        private List<Detail> blocks;
        private List<Detail> hiddenBlocks;

        public static ListResponse of(List<Block> blocks) {
            return ListResponse.builder()
                    .blocks(blocks.stream().map(Detail::of).toList())
                    .build();
        }

        public static ListResponse of(List<Block> blocks, List<Block> hiddenBlocks) {
            return ListResponse.builder()
                    .blocks(blocks.stream().map(Detail::of).toList())
                    .hiddenBlocks(hiddenBlocks.stream().map(Detail::of).toList())
                    .build();
        }
    }
}
