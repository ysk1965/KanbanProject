package com.kanban.domain.block.dto;

import com.kanban.domain.block.Block;
import com.kanban.domain.block.BlockType;
import com.kanban.domain.block.FixedBlockType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

public class BlockResponse {

    @Getter
    @Builder
    @AllArgsConstructor
    public static class Detail {
        private String id;
        private String name;
        private BlockType type;
        private FixedBlockType fixedType;
        private String color;
        private Integer position;

        public static Detail of(Block block) {
            return Detail.builder()
                    .id(block.getId())
                    .name(block.getName())
                    .type(block.getType())
                    .fixedType(block.getFixedType())
                    .color(block.getColor())
                    .position(block.getPosition())
                    .build();
        }
    }

    @Getter
    @Builder
    @AllArgsConstructor
    public static class ListResponse {
        private List<Detail> blocks;

        public static ListResponse of(List<Block> blocks) {
            return ListResponse.builder()
                    .blocks(blocks.stream().map(Detail::of).toList())
                    .build();
        }
    }
}
