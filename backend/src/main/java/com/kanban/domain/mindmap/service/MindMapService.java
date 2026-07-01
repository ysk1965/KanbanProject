package com.kanban.domain.mindmap.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.mindmap.BoardMindMap;
import com.kanban.domain.mindmap.BoardMindMapRepository;
import com.kanban.domain.mindmap.dto.MindMapRequest;
import com.kanban.domain.mindmap.dto.MindMapResponse;
import com.kanban.global.exception.BusinessException;
import com.kanban.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MindMapService {

    private final BoardMindMapRepository mindMapRepository;
    private final BoardService boardService;
    private final ObjectMapper objectMapper;

    /** 마인드맵 조회 (Viewer 이상). 저장된 행이 없으면 빈 문서를 반환한다. */
    public MindMapResponse getMindMap(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        return mindMapRepository.findByBoardId(boardId)
                .map(this::toResponse)
                .orElseGet(() -> MindMapResponse.builder()
                        .nodes(new ArrayList<>())
                        .edges(new ArrayList<>())
                        .expandedFeatures(new ArrayList<>())
                        .build());
    }

    /** 마인드맵 저장 (Member 이상). 보드당 1행 upsert. */
    @Transactional
    public MindMapResponse saveMindMap(String boardId, String userId, MindMapRequest.Save request) {
        boardService.checkMemberOrAbove(boardId, userId);

        String data = serialize(request);

        BoardMindMap mindMap = mindMapRepository.findByBoardId(boardId)
                .orElseGet(() -> BoardMindMap.builder().boardId(boardId).build());
        mindMap.updateData(data, userId);
        mindMap = mindMapRepository.save(mindMap);

        return toResponse(mindMap);
    }

    private String serialize(MindMapRequest.Save request) {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode nodes = root.putArray("nodes");
        ArrayNode edges = root.putArray("edges");
        ArrayNode expandedFeatures = root.putArray("expanded_features");
        if (request.getNodes() != null) request.getNodes().forEach(nodes::add);
        if (request.getEdges() != null) request.getEdges().forEach(edges::add);
        if (request.getExpandedFeatures() != null) request.getExpandedFeatures().forEach(expandedFeatures::add);
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.warn("Failed to serialize mindmap data for board", e);
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
    }

    private MindMapResponse toResponse(BoardMindMap mindMap) {
        List<JsonNode> nodes = new ArrayList<>();
        List<JsonNode> edges = new ArrayList<>();
        List<String> expandedFeatures = new ArrayList<>();
        if (mindMap.getData() != null && !mindMap.getData().isBlank()) {
            try {
                JsonNode root = objectMapper.readTree(mindMap.getData());
                if (root.has("nodes") && root.get("nodes").isArray()) {
                    root.get("nodes").forEach(nodes::add);
                }
                if (root.has("edges") && root.get("edges").isArray()) {
                    root.get("edges").forEach(edges::add);
                }
                if (root.has("expanded_features") && root.get("expanded_features").isArray()) {
                    root.get("expanded_features").forEach(n -> {
                        if (n.isTextual()) expandedFeatures.add(n.asText());
                    });
                }
            } catch (Exception e) {
                log.warn("Failed to parse stored mindmap data for board {}", mindMap.getBoardId(), e);
            }
        }
        return MindMapResponse.builder().nodes(nodes).edges(edges).expandedFeatures(expandedFeatures).build();
    }
}
