package com.kanban.domain.minikanban.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

public class MiniKanbanRequest {

    /**
     * 미니 칸반 레이아웃 저장 요청. nodes 항목은 {@link JsonNode}로 받아 클라이언트가 보낸 형태
     * (block 노드는 block_id+좌표, task 노드는 task_id+좌표)를 그대로 보존한다.
     */
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Save {
        private List<JsonNode> nodes = new ArrayList<>();
        /** 접힌(파생 태스크 노드를 숨긴) 블록 hub id 목록 */
        private List<String> collapsedBlocks = new ArrayList<>();
    }
}
