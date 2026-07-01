package com.kanban.domain.mindmap.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

public class MindMapRequest {

    /**
     * 마인드맵 저장 요청. nodes/edges 항목은 {@link JsonNode}로 받아 클라이언트가 보낸 형태
     * (feature 노드는 feature_id+좌표, memo 노드는 label/color+좌표 등)를 그대로 보존한다.
     */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Save {
        private List<JsonNode> nodes = new ArrayList<>();
        private List<JsonNode> edges = new ArrayList<>();
        /** 펼쳐진 Feature id 목록 (마인드맵에서 Task 노드를 노출 중인 Feature) */
        private List<String> expandedFeatures = new ArrayList<>();
    }
}
