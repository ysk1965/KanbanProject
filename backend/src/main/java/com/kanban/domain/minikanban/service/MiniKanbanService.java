package com.kanban.domain.minikanban.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kanban.domain.board.service.BoardService;
import com.kanban.domain.minikanban.BoardMiniKanban;
import com.kanban.domain.minikanban.BoardMiniKanbanRepository;
import com.kanban.domain.minikanban.dto.MiniKanbanRequest;
import com.kanban.domain.minikanban.dto.MiniKanbanResponse;
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
public class MiniKanbanService {

    private final BoardMiniKanbanRepository miniKanbanRepository;
    private final BoardService boardService;
    private final ObjectMapper objectMapper;

    /** 미니 칸반 레이아웃 조회 (Viewer 이상). 저장된 행이 없으면 빈 문서를 반환한다. */
    public MiniKanbanResponse getMiniKanban(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);

        return miniKanbanRepository.findByBoardId(boardId)
                .map(this::toResponse)
                .orElseGet(() -> MiniKanbanResponse.builder()
                        .nodes(new ArrayList<>())
                        .collapsedBlocks(new ArrayList<>())
                        .build());
    }

    /** 미니 칸반 레이아웃 저장 (Member 이상). 보드당 1행 upsert. */
    @Transactional
    public MiniKanbanResponse saveMiniKanban(String boardId, String userId, MiniKanbanRequest.Save request) {
        boardService.checkMemberOrAbove(boardId, userId);

        String data = serialize(request);

        BoardMiniKanban miniKanban = miniKanbanRepository.findByBoardId(boardId)
                .orElseGet(() -> BoardMiniKanban.builder().boardId(boardId).build());
        miniKanban.updateData(data, userId);
        miniKanban = miniKanbanRepository.save(miniKanban);

        return toResponse(miniKanban);
    }

    private String serialize(MiniKanbanRequest.Save request) {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode nodes = root.putArray("nodes");
        ArrayNode collapsedBlocks = root.putArray("collapsed_blocks");
        if (request.getNodes() != null) request.getNodes().forEach(nodes::add);
        if (request.getCollapsedBlocks() != null) request.getCollapsedBlocks().forEach(collapsedBlocks::add);
        try {
            return objectMapper.writeValueAsString(root);
        } catch (Exception e) {
            log.warn("Failed to serialize mini kanban data for board", e);
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
    }

    private MiniKanbanResponse toResponse(BoardMiniKanban miniKanban) {
        List<JsonNode> nodes = new ArrayList<>();
        List<String> collapsedBlocks = new ArrayList<>();
        if (miniKanban.getData() != null && !miniKanban.getData().isBlank()) {
            try {
                JsonNode root = objectMapper.readTree(miniKanban.getData());
                if (root.has("nodes") && root.get("nodes").isArray()) {
                    root.get("nodes").forEach(nodes::add);
                }
                if (root.has("collapsed_blocks") && root.get("collapsed_blocks").isArray()) {
                    root.get("collapsed_blocks").forEach(n -> {
                        if (n.isTextual()) collapsedBlocks.add(n.asText());
                    });
                }
            } catch (Exception e) {
                log.warn("Failed to parse stored mini kanban data for board {}", miniKanban.getBoardId(), e);
            }
        }
        return MiniKanbanResponse.builder().nodes(nodes).collapsedBlocks(collapsedBlocks).build();
    }
}
