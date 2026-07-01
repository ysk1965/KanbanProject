package com.kanban.domain.mindmap.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.util.List;

@Getter
@Builder
@AllArgsConstructor
public class MindMapResponse {
    private List<JsonNode> nodes;
    private List<JsonNode> edges;
    /** 펼쳐진 Feature id 목록 */
    private List<String> expandedFeatures;
}
