package com.kanban.domain.minikanban.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class MiniKanbanResponse {
    private List<JsonNode> nodes;
    /** 접힌 블록 hub id 목록 */
    private List<String> collapsedBlocks;
}
